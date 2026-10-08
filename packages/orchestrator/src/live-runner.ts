/**
 * Live Improbability Drive runner (prompt 126).
 *
 * Argv comes from buildArgv (096). The command is checked with
 * evaluateCommand (097) before spawn. Stdout is written as NDJSON under
 * .hitchhiker/logs/drive/ and classified with Marvin's sensors (104).
 *
 * spawnImpl is the engine SpawnLike. The fake path uses the command name
 * "grok" and does not resolve a binary. The real path is liveGrokSpawn,
 * which is spawnGrok, and that path resolves grok on PATH.
 *
 * A usage limit pauses the queue and throws. The dashboard reads status
 * "paused". Approval is the boolean in drive-approval.json. A missing file
 * is not a yes.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  GrokMissingError,
  redact,
  resolveGrokCommand,
  spawnGrok,
  type GuideConfig,
  type SpawnLike,
} from "@hitchhiker/engine";
import { evaluateCommand } from "./policy.ts";
import { loadQueue, pauseQueue, saveQueue, type QueueFile } from "./queue-file.ts";
import { buildArgv, MAX_TURNS, type RunRequest } from "./runner.ts";
import { classifyRun, type SensorEvent } from "./sensors.ts";

const LIVE_TIMEOUT_MS = 30 * 60 * 1000;
const USAGE_LIMIT = /usage limit|rate limit|too many requests|\b429\b|quota exceeded|\bquota\b/i;
const ID_PATTERN = /^[a-z0-9-]+$/;

export class LiveUsageLimitError extends Error {
  constructor() {
    super("Grok usage limit. The drive is paused.");
    this.name = "LiveUsageLimitError";
  }
}

export const liveGrokSpawn: SpawnLike = spawnGrok;

export function liveDogfoodEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.HH_LIVE === "1";
}

export function commandFor(spawnImpl: SpawnLike, env: NodeJS.ProcessEnv): string {
  if (spawnImpl === liveGrokSpawn || spawnImpl === spawnGrok) return resolveGrokCommand(env);
  return "grok";
}

interface PartialUsage {
  input?: number;
  output?: number;
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function takeUsage(value: unknown, into: PartialUsage): void {
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  const input = firstNumber(record, ["input_tokens", "inputTokens", "prompt_tokens"]);
  const output = firstNumber(record, ["output_tokens", "outputTokens", "completion_tokens"]);
  if (input !== undefined) into.input = input;
  if (output !== undefined) into.output = output;
  if ("usage" in record) takeUsage(record.usage, into);
}

function tokensFrom(stdout: string): { input: number; output: number } | undefined {
  let found: { input: number; output: number } | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    const usage: PartialUsage = {};
    takeUsage(parsed, usage);
    if (usage.input !== undefined && usage.output !== undefined) {
      found = { input: usage.input, output: usage.output };
    }
  }
  return found;
}

function readFrontMatter(text: string): { effort?: string; maxTurns?: number } {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---");
  if (end < 0) return {};
  const block = text.slice(3, end);
  let effort: string | undefined;
  let maxTurns: number | undefined;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    const split = line.indexOf(":");
    if (split < 0) continue;
    const key = line.slice(0, split).trim().toLowerCase().replaceAll("_", "");
    const value = line.slice(split + 1).trim();
    if (key === "effort" && value.length > 0) effort = value;
    if (key === "maxturns") {
      const parsed = Number(value);
      if (Number.isInteger(parsed)) maxTurns = parsed;
    }
  }
  const found: { effort?: string; maxTurns?: number } = {};
  if (effort !== undefined) found.effort = effort;
  if (maxTurns !== undefined) found.maxTurns = maxTurns;
  return found;
}

function asEffort(value: string | undefined, fallback: GuideConfig["effort"]): RunRequest["effort"] {
  if (value === undefined) return fallback;
  if (value === "medium" || value === "high" || value === "xhigh") return value;
  throw new Error("Effort must be medium, high, or xhigh.");
}

function asTurns(value: number | undefined): number {
  if (value === undefined) return MAX_TURNS;
  return value;
}

async function promptFile(file: string, projectDir: string): Promise<string> {
  if (path.isAbsolute(file)) return file;
  const direct = path.resolve(projectDir, file);
  try {
    await readFile(direct, "utf8");
    return direct;
  } catch {
    return path.join(projectDir, ".hitchhiker", "prompts", file);
  }
}

async function approved(projectDir: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(projectDir, ".hitchhiker", "drive-approval.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    return (parsed as { approved?: unknown }).approved === true;
  } catch {
    return false;
  }
}

async function pauseForLimit(projectDir: string, id: string): Promise<void> {
  const existing = await loadQueue(projectDir);
  let queue: QueueFile;
  if (existing === null) {
    if (!ID_PATTERN.test(id)) return;
    queue = { items: [{ id, kind: "build", status: "paused" }] };
  } else {
    const paused = pauseQueue(existing);
    const items = paused.items.map((item) =>
      item.id === id ? { id: item.id, kind: item.kind, status: "paused" as const } : item,
    );
    if (ID_PATTERN.test(id) && !items.some((item) => item.id === id)) {
      items.push({ id, kind: "build", status: "paused" });
    }
    queue = { items };
  }
  await saveQueue(projectDir, queue);
}

async function writeLog(
  projectDir: string,
  id: string,
  stdout: string,
  stderr: string,
  exitCode: number,
): Promise<void> {
  const events: SensorEvent[] = [];
  const lines: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length === 0) continue;
    lines.push(redact(line));
    let kind = "text";
    try {
      JSON.parse(line);
      kind = "json";
    } catch {
      kind = "text";
    }
    events.push({ t: events.length, kind, text: line });
  }
  if (stderr.trim().length > 0) {
    lines.push(redact(stderr.trim()));
    events.push({ t: events.length, kind: "text", text: stderr });
  }
  events.push({ t: events.length, kind: "exit", code: exitCode, text: stderr });
  const verdict = classifyRun(events, events.length);
  lines.push(JSON.stringify({ kind: "sensor", verdict }));
  const logPath = path.join(projectDir, ".hitchhiker", "logs", "drive", `${id}.ndjson`);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${lines.join("\n")}\n`, "utf8");
}

export async function runLivePrompt(
  file: string,
  deps: { spawnImpl: SpawnLike; projectDir: string; config: GuideConfig },
): Promise<{ exitCode: number; durationMs: number; tokens?: { input: number; output: number } }> {
  const started = Date.now();
  const resolved = await promptFile(file, deps.projectDir);
  let text: string;
  try {
    text = await readFile(resolved, "utf8");
  } catch {
    throw new Error(`Prompt file is missing: ${resolved}`);
  }
  if ((await approved(deps.projectDir)) !== true) {
    throw new Error("Missing drive approval. A missing file is not a yes.");
  }
  const matter = readFrontMatter(text);
  const command = commandFor(deps.spawnImpl, process.env);
  const args = buildArgv({
    model: deps.config.model,
    cwd: deps.projectDir,
    promptText: text,
    bin: command,
    promptPath: resolved,
    effort: asEffort(matter.effort, deps.config.effort),
    maxTurns: asTurns(matter.maxTurns),
    sessionMode: deps.config.sessionIdMode,
    approved: true,
  });
  const decision = evaluateCommand({ argv: [command, ...args], projectRoot: deps.projectDir });
  if (decision.decision === "deny") throw new Error(decision.reason);

  const output = await deps.spawnImpl({
    command,
    args,
    cwd: deps.projectDir,
    env: process.env,
    timeoutMs: LIVE_TIMEOUT_MS,
  });
  const exitCode = output.status === null ? 1 : output.status;
  const id = path.basename(resolved, path.extname(resolved)).toLowerCase();
  await writeLog(deps.projectDir, id, output.stdout, output.stderr, exitCode);
  if (output.errorCode === "ENOENT" || output.errorCode === "ENOTDIR") throw new GrokMissingError();
  if (USAGE_LIMIT.test(`${output.stdout}\n${output.stderr}`)) {
    await pauseForLimit(deps.projectDir, id);
    throw new LiveUsageLimitError();
  }
  const result: { exitCode: number; durationMs: number; tokens?: { input: number; output: number } } = {
    exitCode,
    durationMs: Date.now() - started,
  };
  const tokens = tokensFrom(output.stdout);
  if (tokens !== undefined) result.tokens = tokens;
  return result;
}
