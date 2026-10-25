import { randomUUID } from "node:crypto";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Effort, GuideConfig } from "../config.ts";
import { loadConfig } from "../config.ts";
import { callCwd, isInterviewTask, planInterview } from "../guide/interview-call.ts";
import { guideCallTimeoutMs } from "../guide/guide-progress.ts";
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
import { GrokBillingError, classifyGrokFailure } from "./grok-failure.ts";
import { redact } from "./redact.ts";
import { validateJson, type JsonSchema } from "./schema-validate.ts";

export type { Effort } from "../config.ts";
export type { JsonSchema } from "./schema-validate.ts";
export { GrokMissingError, GrokUnavailableError, ThinkInputError };

export interface ThinkRequest<_T> {
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
  at: string;
  task: string;
  model: string;
  effort: string;
  durationMs: number;
  cassette: "hit" | "miss" | "recorded" | "live";
  outcome: string;
  inputTokens?: number;
  outputTokens?: number;
  policyFlags: string[];
  error?: string;
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
  const lengthOnly = errors.length > 0 && errors.every((error) => error.includes("over maxLength"));
  const lines = [
    input,
    "",
    "The previous answer failed JSON schema validation.",
    "Return only one JSON value that satisfies the schema.",
  ];
  if (lengthOnly) {
    lines.push(
      "Shorten only the fields named in the errors so each one fits its maxLength.",
      "Leave every other field unchanged.",
      "Break at a sentence, never mid-word.",
    );
  }
  lines.push("Errors:", ...errors.map((error) => `- ${error}`), "Previous output:", previous);
  return lines.join("\n");
}

const LENGTH_ERROR = /^\$\.(\w+): length \d+ is over maxLength (\d+)$/;

/**
 * Shorten at the last sentence end inside `max`, else the last word.
 * A single word longer than `max` is returned unchanged, never cut mid-word.
 */
export function shortenAtBoundary(text: string, max: number): string {
  const clean = text.trim();
  if (max < 1 || clean.length <= max) return clean;
  const window = clean.slice(0, max);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("; "));
  let cut = sentence >= 0 ? sentence + 1 : -1;
  if (cut <= 0) {
    const end = window.trimEnd();
    const last = end.at(-1);
    if (last === "." || last === "?" || last === ";") cut = end.length;
  }
  if (cut <= 0) cut = window.lastIndexOf(" ");
  if (cut <= 0) return clean;
  let out = clean.slice(0, cut).trim();
  if (out.length > max) {
    const space = out.lastIndexOf(" ");
    if (space <= 0) return clean;
    out = out.slice(0, space).trim();
  }
  if (out.length === 0 || out.length > max) return clean;
  return out;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** When every error is a top-level maxLength miss, shorten only those fields. */
function shortenOverLength(value: unknown, errors: readonly string[]): unknown | null {
  if (!isPlainRecord(value) || errors.length === 0) return null;
  if (!errors.every((error) => LENGTH_ERROR.test(error))) return null;
  const next: Record<string, unknown> = { ...value };
  for (const error of errors) {
    const match = LENGTH_ERROR.exec(error);
    if (match === null) return null;
    const key = match[1];
    const max = Number(match[2]);
    if (key === undefined || !Number.isInteger(max)) return null;
    const current = next[key];
    if (typeof current !== "string") return null;
    const cut = shortenAtBoundary(current, max);
    if (cut.length > max) return null;
    next[key] = cut;
  }
  return next;
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
  const heard = `${output.stderr}\n${output.stdout}\n${parsed.errorMessage ?? ""}`;
  if (classifyGrokFailure({ stderr: heard }).kind === "billing") {
    return new GrokBillingError();
  }
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

/** A guide check that refused a draft the model call itself accepted. */
export async function appendAiOutcome(
  projectDir: string,
  entry: { task: string; outcome: string; error?: string; model: string; effort: string },
): Promise<void> {
  const line: LogLine = {
    at: new Date().toISOString(),
    task: entry.task,
    model: entry.model,
    effort: entry.effort,
    durationMs: 0,
    cassette: "live",
    outcome: entry.outcome,
    policyFlags: [],
  };
  if (entry.error !== undefined && entry.error.trim() !== "") line.error = entry.error.slice(0, 500);
  await appendLog(projectDir, line);
}

async function appendLog(projectDir: string, line: LogLine): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker", "logs");
  await mkdir(dir, { recursive: true });
  const payload: LogLine = {
    at: line.at,
    task: line.task,
    model: line.model,
    effort: line.effort,
    durationMs: line.durationMs,
    cassette: line.cassette,
    outcome: line.outcome,
    policyFlags: line.policyFlags,
  };
  if (line.error !== undefined && line.error !== "") payload.error = line.error;
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
  const planned = planInterview(req, cfg);
  const model = planned.interview ? planned.model : (req.model ?? cfg.ai.model);
  const effort = planned.interview ? planned.effort : resolveEffort(req, cfg);
  const cassetteDir = deps.cassetteDir ?? packageCassetteDir();
  const plain: ThinkRequest<unknown> = callRequest(req, req.input);

  let outcome = "error";
  let cassette: LogLine["cassette"] = "live";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let policyFlags: string[] = [];
  let errorText: string | undefined;

  const finishLog = async (): Promise<void> => {
    const durationMs = Math.max(0, now() - started);
    const line: LogLine = {
      at: new Date(started).toISOString(),
      task: req.task,
      model,
      effort,
      durationMs,
      cassette,
      outcome,
      policyFlags,
    };
    if (errorText !== undefined) line.error = redact(errorText).slice(0, 500);
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
    const cwd = callCwd(req.task, projectDir, scratch);
    const timeoutMs = isInterviewTask(req.task) ? guideCallTimeoutMs(cfg.ai.timeoutMs) : cfg.ai.timeoutMs;
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
          cwd,
          env,
          timeoutMs,
        });
        const parsed = parseGrokStdout(output.stdout);
        const failure = runFailure(output, parsed, timeoutMs);
        if (failure !== undefined) {
          if (failure instanceof ThinkTimeoutError) outcome = "timeout";
          else if (failure instanceof GrokBillingError) outcome = "billing";
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
        let errors = decoded.ok ? validateJson(decoded.value, req.schema) : ["$: response was not JSON"];
        let accepted: unknown = decoded.ok ? decoded.value : undefined;
        if (errors.length > 0 && attempt === attempts - 1 && decoded.ok) {
          const shortened = shortenOverLength(decoded.value, errors);
          if (shortened !== null) {
            const again = validateJson(shortened, req.schema);
            if (again.length === 0) {
              accepted = shortened;
              errors = [];
            }
          }
        }
        if (errors.length === 0 && accepted !== undefined) {
          const durationMs = Math.max(0, now() - started);
          const result = withTokens(
            asValue<T>(accepted),
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
    errorText = error instanceof Error ? error.message : "error";
    if (error instanceof ThinkInputError) outcome = "input";
    else if (error instanceof GrokBillingError) outcome = "billing";
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
