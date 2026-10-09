import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Effort, GuideConfig } from "../config.ts";
import { loadConfig } from "../config.ts";
import {
  CassetteError,
  CassetteMissError,
  cassetteKey,
  cassetteMode,
  packageCassetteDir,
  readCassette,
  writeCassette,
  type CassetteRecord,
} from "./cassette.ts";
import {
  GrokMissingError,
  GrokUnavailableError,
  ThinkInputError,
  flagsFromHelp,
  hasPromptFlag,
  parseGrokStdout,
  planGrokCall,
  promptOffCmdLine,
  resolveEffort,
  resolveGrokCommand,
  spawnGrok,
  unavailableMessage,
  type ParsedModel,
  type SpawnLike,
  type SpawnOutput,
} from "./grok-cli.ts";
import { redact } from "./redact.ts";
import { validateJson, type JsonSchema } from "./schema-validate.ts";

export type { Effort } from "../config.ts";
export type { JsonSchema } from "./schema-validate.ts";
export { GrokMissingError, GrokUnavailableError, ThinkInputError };

export interface ThinkRequest<T> {
  task: string;
  schema?: JsonSchema;
  input: string;
  images?: readonly string[];
  model?: string;
  effort?: Effort;
  maxTurns?: number;
}

export interface ThinkResult<T> {
  value: T;
  raw: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
  cassette: "hit" | "recorded" | "live";
}

export interface ThinkDeps {
  spawnImpl?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  projectDir?: string;
  config?: GuideConfig;
  flags?: ReadonlySet<string>;
  cassetteDir?: string;
  now?: () => number;
}

export class ThinkSchemaError extends Error {
  readonly errors: readonly string[];
  readonly firstOutput: string;
  readonly secondOutput: string;

  constructor(errors: readonly string[], firstOutput: string, secondOutput: string) {
    super(`schema validation failed after one repair: ${errors.join("; ")}`);
    this.name = "ThinkSchemaError";
    this.errors = errors;
    this.firstOutput = firstOutput;
    this.secondOutput = secondOutput;
  }
}

export class ThinkTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`think timed out after ${timeoutMs} ms`);
    this.name = "ThinkTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ThinkRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThinkRunError";
  }
}

interface LogLine {
  task: string;
  model: string;
  effort: string;
  durationMs: number;
  cassette: "hit" | "miss" | "recorded" | "live";
  outcome: string;
  inputTokens?: number;
  outputTokens?: number;
  policyFlags: string[];
}

function asValue<T>(value: unknown): T {
  return value as T;
}

function withTokens<T>(
  value: T,
  raw: string,
  durationMs: number,
  cassette: ThinkResult<T>["cassette"],
  parsed: { inputTokens?: number; outputTokens?: number },
): ThinkResult<T> {
  const result: ThinkResult<T> = { value, raw, durationMs, cassette };
  if (parsed.inputTokens !== undefined) result.inputTokens = parsed.inputTokens;
  if (parsed.outputTokens !== undefined) result.outputTokens = parsed.outputTokens;
  return result;
}

function parseModelJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    // Try a fenced block, then the outermost object.
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const fenced = fence?.[1];
  if (fenced !== undefined) {
    try {
      return { ok: true, value: JSON.parse(fenced.trim()) };
    } catch {
      // Keep looking.
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

function repairInput(input: string, errors: readonly string[], previous: string): string {
  return [
    input,
    "",
    "The previous answer failed JSON schema validation.",
    "Return only one JSON value that satisfies the schema.",
    "Errors:",
    ...errors.map((error) => `- ${error}`),
    "Previous output:",
    previous,
  ].join("\n");
}

function callRequest(req: ThinkRequest<unknown>, input: string): ThinkRequest<unknown> {
  const next: ThinkRequest<unknown> = { task: req.task, input };
  if (req.schema !== undefined) next.schema = req.schema;
  if (req.images !== undefined) next.images = req.images;
  if (req.model !== undefined) next.model = req.model;
  if (req.effort !== undefined) next.effort = req.effort;
  if (req.maxTurns !== undefined) next.maxTurns = req.maxTurns;
  return next;
}

function runFailure(output: SpawnOutput, parsed: ParsedModel, timeoutMs: number): Error | undefined {
  if (output.timedOut) return new ThinkTimeoutError(timeoutMs);
  if (output.errorCode === "ENOENT" || output.errorCode === "ENOTDIR") return new GrokMissingError();
  if (output.errorCode === "OUTPUT_LIMIT") return new ThinkRunError("grok output exceeded the capture limit.");
  const blocked = unavailableMessage(output.stdout, output.stderr);
  if (output.status !== 0 && blocked !== undefined) return new GrokUnavailableError(redact(blocked));
  if (output.status !== 0) {
    const detail = (
      output.stderr.trim() ||
      parsed.errorMessage ||
      output.stdout.trim() ||
      `grok exited ${output.status ?? "null"}`
    ).slice(0, 500);
    return new ThinkRunError(redact(detail));
  }
  if (parsed.errorMessage !== undefined) return new ThinkRunError(redact(parsed.errorMessage));
  return undefined;
}

async function appendLog(projectDir: string, line: LogLine): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker", "logs");
  await mkdir(dir, { recursive: true });
  const payload: LogLine = {
    task: line.task,
    model: line.model,
    effort: line.effort,
    durationMs: line.durationMs,
    cassette: line.cassette,
    outcome: line.outcome,
    policyFlags: line.policyFlags,
  };
  if (line.inputTokens !== undefined) payload.inputTokens = line.inputTokens;
  if (line.outputTokens !== undefined) payload.outputTokens = line.outputTokens;
  await appendFile(path.join(dir, "ai.ndjson"), `${redact(JSON.stringify(payload))}\n`, "utf8");
}

/**
 * One audited Grok call. A think call is a question: the child cwd is an empty
 * scratch directory, tools are read-only, and plan mode is requested when the
 * installed CLI lists that flag. The adapter does not read credential files
 * and does not set GROK_HOME.
 */
export async function think<T>(req: ThinkRequest<T>, deps: ThinkDeps = {}): Promise<ThinkResult<T>> {
  const env = deps.env ?? process.env;
  const projectDir = deps.projectDir ?? process.cwd();
  const cfg = deps.config ?? loadConfig(projectDir);
  const now = deps.now ?? Date.now;
  const started = now();
  const model = req.model ?? cfg.ai.model;
  const effort = resolveEffort(req, cfg);
  const cassetteDir = deps.cassetteDir ?? packageCassetteDir();
  const plain: ThinkRequest<unknown> = callRequest(req, req.input);

  let outcome = "error";
  let cassette: LogLine["cassette"] = "live";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let policyFlags: string[] = [];

  const finishLog = async (): Promise<void> => {
    const durationMs = Math.max(0, now() - started);
    const line: LogLine = {
      task: req.task,
      model,
      effort,
      durationMs,
      cassette,
      outcome,
      policyFlags,
    };
    if (inputTokens !== undefined) line.inputTokens = inputTokens;
    if (outputTokens !== undefined) line.outputTokens = outputTokens;
    await appendLog(projectDir, line);
  };

  try {
    if (req.task.trim().length === 0) throw new ThinkInputError("task is empty.");
    const mode = cassetteMode(env);
    const key = cassetteKey({
      task: req.task,
      model,
      effort,
      schema: req.schema ?? null,
      input: req.input,
      ...(req.images !== undefined ? { images: req.images } : {}),
    });

    if (mode === "replay") {
      let record: CassetteRecord;
      try {
        record = readCassette(cassetteDir, req.task, key);
      } catch (error) {
        if (error instanceof CassetteMissError) {
          cassette = "miss";
          outcome = "cassette-miss";
        }
        throw error;
      }
      if (req.schema !== undefined) {
        const errors = validateJson(record.result, req.schema);
        if (errors.length > 0) {
          throw new CassetteError(key, `cassette ${key} failed schema: ${errors.join("; ")}`);
        }
      }
      cassette = "hit";
      outcome = "ok";
      inputTokens = record.inputTokens;
      outputTokens = record.outputTokens;
      return withTokens(
        asValue<T>(req.schema !== undefined ? record.result : record.raw),
        record.raw,
        record.durationMs,
        "hit",
        record,
      );
    }

    const spawnImpl = deps.spawnImpl ?? spawnGrok;
    const command = spawnImpl === spawnGrok ? resolveGrokCommand(env) : "grok";
    const flags = deps.flags ?? (await probeFlags(spawnImpl, command, env, projectDir, cfg.ai.timeoutMs));
    const scratch = path.join(projectDir, ".hitchhiker", "tmp", `think-${randomUUID()}`);
    await mkdir(scratch, { recursive: true });
    try {
      let firstRaw = "";
      let firstErrors: string[] = [];
      const attempts = req.schema === undefined ? 1 : 2;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const input = attempt === 0 ? req.input : repairInput(req.input, firstErrors, firstRaw);
        const plan = promptOffCmdLine(
          command,
          planGrokCall(callRequest(plain, input), cfg, flags, scratch),
          scratch,
          flags.has("--prompt-file"),
        );
        policyFlags = plan.argv.filter((arg) => arg.startsWith("-"));
        if (!hasPromptFlag(plan.argv)) {
          throw new ThinkInputError("grok help lists no prompt flag.");
        }
        for (const file of plan.files) {
          await writeFile(file.path, file.body, "utf8");
        }
        const output = await spawnImpl({
          command,
          args: plan.argv,
          cwd: scratch,
          env,
          timeoutMs: cfg.ai.timeoutMs,
        });
        const parsed = parseGrokStdout(output.stdout);
        const failure = runFailure(output, parsed, cfg.ai.timeoutMs);
        if (failure !== undefined) {
          if (failure instanceof ThinkTimeoutError) outcome = "timeout";
          else if (failure instanceof GrokUnavailableError) outcome = "unavailable";
          else if (failure instanceof GrokMissingError) outcome = "missing";
          throw failure;
        }
        if (parsed.inputTokens !== undefined) inputTokens = parsed.inputTokens;
        if (parsed.outputTokens !== undefined) outputTokens = parsed.outputTokens;

        if (req.schema === undefined) {
          const durationMs = Math.max(0, now() - started);
          const result = withTokens(asValue<T>(parsed.text), parsed.text, durationMs, mode === "record" ? "recorded" : "live", parsed);
          if (mode === "record") {
            writeCassette(cassetteDir, cassetteRecord(req.task, model, effort, key, result));
          }
          cassette = result.cassette;
          outcome = "ok";
          return result;
        }

        const decoded = parseModelJson(parsed.text);
        const errors = decoded.ok ? validateJson(decoded.value, req.schema) : ["$: response was not JSON"];
        if (errors.length === 0 && decoded.ok) {
          const durationMs = Math.max(0, now() - started);
          const result = withTokens(
            asValue<T>(decoded.value),
            parsed.text,
            durationMs,
            mode === "record" ? "recorded" : "live",
            parsed,
          );
          if (mode === "record") {
            writeCassette(cassetteDir, cassetteRecord(req.task, model, effort, key, result));
          }
          cassette = result.cassette;
          outcome = "ok";
          return result;
        }
        if (attempt === 0) {
          firstRaw = parsed.text;
          firstErrors = errors;
          continue;
        }
        outcome = "schema";
        throw new ThinkSchemaError(errors, redact(firstRaw), redact(parsed.text));
      }
      throw new ThinkRunError("think finished without a result.");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  } catch (error) {
    if (error instanceof ThinkInputError) outcome = "input";
    else if (error instanceof GrokMissingError) outcome = "missing";
    else if (error instanceof GrokUnavailableError) outcome = "unavailable";
    else if (error instanceof ThinkTimeoutError) outcome = "timeout";
    else if (error instanceof ThinkSchemaError) outcome = "schema";
    else if (error instanceof CassetteMissError) {
      cassette = "miss";
      outcome = "cassette-miss";
    }
    throw error;
  } finally {
    await finishLog();
  }
}

function cassetteRecord<T>(
  task: string,
  model: string,
  effort: string,
  key: string,
  result: ThinkResult<T>,
): CassetteRecord {
  const record: CassetteRecord = {
    task,
    model,
    effort,
    key,
    result: result.value,
    raw: result.raw,
    durationMs: result.durationMs,
  };
  if (result.inputTokens !== undefined) record.inputTokens = result.inputTokens;
  if (result.outputTokens !== undefined) record.outputTokens = result.outputTokens;
  return record;
}

async function probeFlags(
  spawnImpl: SpawnLike,
  command: string,
  env: NodeJS.ProcessEnv,
  projectDir: string,
  timeoutMs: number,
): Promise<Set<string>> {
  await mkdir(projectDir, { recursive: true });
  const output = await spawnImpl({
    command,
    args: ["--help"],
    cwd: projectDir,
    env,
    timeoutMs,
  });
  if (output.timedOut) throw new ThinkTimeoutError(timeoutMs);
  if (output.errorCode === "ENOENT") throw new GrokMissingError();
  return flagsFromHelp(`${output.stdout}\n${output.stderr}`);
}
