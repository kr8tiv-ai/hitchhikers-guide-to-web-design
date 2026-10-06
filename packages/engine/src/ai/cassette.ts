import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CassetteMode = "replay" | "record" | "off";

export interface CassetteRecord {
  task: string;
  model: string;
  effort: string;
  key: string;
  result: unknown;
  raw: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class CassetteMissError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`cassette miss: ${key}`);
    this.name = "CassetteMissError";
    this.key = key;
  }
}

export class CassetteModeError extends Error {
  constructor(value: string) {
    super(`HH_CASSETTE "${value}" is not replay, record, or off.`);
    this.name = "CassetteModeError";
  }
}

export class CassetteError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = "CassetteError";
    this.key = key;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** sha256 of file bytes, or of the reference string when the path is not a file. */
export function hashImage(ref: string): string {
  try {
    if (existsSync(ref) && statSync(ref).isFile()) {
      return createHash("sha256").update(readFileSync(ref)).digest("hex");
    }
  } catch {
    // Fall through and hash the reference. A missing image is still part of the key.
  }
  return createHash("sha256").update(ref).digest("hex");
}

export function cassetteKey(parts: {
  task: string;
  model: string;
  effort: string;
  schema: unknown;
  input: string;
  images?: readonly string[];
}): string {
  const imageHashes = (parts.images ?? []).map((image) => hashImage(image));
  const payload = canonical({
    task: parts.task,
    model: parts.model,
    effort: parts.effort,
    schema: parts.schema ?? null,
    input: parts.input,
    imageHashes,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function cassetteMode(env: NodeJS.ProcessEnv): CassetteMode {
  const raw = env.HH_CASSETTE;
  if (raw === undefined || raw === "" || raw === "off") return "off";
  if (raw === "replay" || raw === "record") return raw;
  throw new CassetteModeError(raw);
}

/** `packages/engine/test/cassettes` next to this source file. */
export function packageCassetteDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test/cassettes");
}

export function taskSegment(task: string): string {
  const cleaned = task.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  const sliced = cleaned.slice(0, 80);
  return sliced.length > 0 ? sliced : "task";
}

export function cassetteFile(root: string, task: string, key: string): string {
  return path.join(root, taskSegment(task), `${key}.json`);
}

function optionalTokens(key: string, value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CassetteError(key, `cassette ${key} ${field} is not a finite number.`);
  }
  return value;
}

export function readCassette(root: string, task: string, key: string): CassetteRecord {
  const file = cassetteFile(root, task, key);
  if (!existsSync(file)) throw new CassetteMissError(key);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new CassetteError(key, `cassette ${key} is not JSON: ${detail}`);
  }
  if (!isRecord(parsed)) throw new CassetteError(key, `cassette ${key} is not an object.`);
  if (parsed.key !== key) throw new CassetteError(key, `cassette ${key} does not match its file.`);
  if (typeof parsed.raw !== "string") throw new CassetteError(key, `cassette ${key} has no raw string.`);
  if (typeof parsed.durationMs !== "number" || !Number.isFinite(parsed.durationMs)) {
    throw new CassetteError(key, `cassette ${key} has no durationMs.`);
  }
  if (!Object.hasOwn(parsed, "result")) throw new CassetteError(key, `cassette ${key} has no result.`);
  const record: CassetteRecord = {
    task: typeof parsed.task === "string" ? parsed.task : task,
    model: typeof parsed.model === "string" ? parsed.model : "",
    effort: typeof parsed.effort === "string" ? parsed.effort : "",
    key,
    result: parsed.result,
    raw: parsed.raw,
    durationMs: parsed.durationMs,
  };
  const inputTokens = optionalTokens(key, parsed.inputTokens, "inputTokens");
  const outputTokens = optionalTokens(key, parsed.outputTokens, "outputTokens");
  if (inputTokens !== undefined) record.inputTokens = inputTokens;
  if (outputTokens !== undefined) record.outputTokens = outputTokens;
  return record;
}

/**
 * Writes the parsed result, token counts, and duration.
 * The record is the only payload. Environment values are not accepted.
 */
export function writeCassette(root: string, record: CassetteRecord): void {
  const file = cassetteFile(root, record.task, record.key);
  mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(file, body, "utf8");
}
