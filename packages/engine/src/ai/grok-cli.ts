import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GuideConfig } from "../config.ts";
import type { ThinkRequest } from "./think.ts";

/**
 * Read-only built-in tools. grok 1.0.46 treats an empty `--tools` value as
 * "flag omitted", so a think call passes this list instead of an empty one.
 * Plan mode is added beside it when `--permission-mode` is in the help set.
 */
export const READ_ONLY_TOOLS = "read_file,grep,list_dir";

/** Prompts over this size move from `-p` to `--prompt-file`. */
export const PROMPT_FILE_BYTES = 24 * 1024;

const IMAGE_BYTES_MAX = 20 * 1024 * 1024;
const OUTPUT_BYTES_MAX = 8_000_000;

export class GrokMissingError extends Error {
  constructor() {
    super("grok is not on PATH. Run hh doctor.");
    this.name = "GrokMissingError";
  }
}

export class GrokUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrokUnavailableError";
  }
}

export interface SpawnRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface SpawnOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode: string | null;
}

export type SpawnLike = (request: SpawnRequest) => Promise<SpawnOutput>;

export interface PlannedFile {
  path: string;
  body: string;
}

export interface GrokPlan {
  argv: string[];
  files: PlannedFile[];
}

export interface ParsedModel {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

const UNAVAILABLE =
  /usage limit|rate limit|too many requests|\b429\b|unauthorized|\b401\b|not logged in|authentication failed|auth(?:entication)? required|quota exceeded|sign in to grok|grok login/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const found = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  if (found === undefined) return undefined;
  return env[found];
}

function isFile(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function directoryEntries(dir: string): readonly string[] | undefined {
  try {
    return readdirSync(dir);
  } catch {
    return undefined;
  }
}

/**
 * Resolve `grok` through PATH and, on Windows, PATHEXT.
 * `.EXE` wins over `.CMD` when both exist and PATHEXT lists EXE first.
 * The returned path uses the name on disk. Windows file lookup is
 * case-insensitive, and PATHEXT is usually uppercase.
 */
export function resolveGrokCommand(env: NodeJS.ProcessEnv): string {
  const pathValue = envValue(env, "PATH") ?? "";
  const dirs = pathValue
    .split(path.delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
  const windows = process.platform === "win32";
  const exts = windows
    ? (envValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .map((ext) => ext.trim())
        .filter((ext) => ext.length > 0)
    : [""];
  for (const dir of dirs) {
    const entries = directoryEntries(dir);
    if (entries === undefined) continue;
    for (const ext of exts) {
      const suffix = ext.length === 0 || ext.startsWith(".") ? ext : `.${ext}`;
      const wanted = `grok${suffix}`;
      const needle = windows ? wanted.toLowerCase() : wanted;
      const found = entries.find((entry) => (windows ? entry.toLowerCase() : entry) === needle);
      if (found === undefined) continue;
      const candidate = path.join(dir, found);
      if (isFile(candidate)) return candidate;
    }
  }
  throw new GrokMissingError();
}

/** Flags named in `grok --help`. This is the same probe hh doctor runs. */
export function flagsFromHelp(help: string): Set<string> {
  const flags = new Set<string>();
  for (const match of help.matchAll(/(?:^|[\s[(])(-[A-Za-z])(?=,|\s|$)/g)) {
    const flag = match[1];
    if (flag !== undefined) flags.add(flag);
  }
  for (const match of help.matchAll(/--[a-z0-9][a-z0-9-]*/g)) {
    flags.add(match[0]);
  }
  return flags;
}

function imageMime(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function contentBlocks(prompt: string, images: readonly string[]): string {
  const blocks: Array<Record<string, string>> = [{ type: "text", text: prompt }];
  for (const image of images) {
    if (!isFile(image)) {
      throw new ThinkInputError(`image not found: ${image}`);
    }
    const bytes = readFileSync(image);
    if (bytes.byteLength > IMAGE_BYTES_MAX) {
      throw new ThinkInputError(`image is over 20 MB: ${image}`);
    }
    blocks.push({
      type: "image",
      mimeType: imageMime(image),
      data: bytes.toString("base64"),
    });
  }
  return JSON.stringify(blocks);
}

export class ThinkInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThinkInputError";
  }
}

function push(argv: string[], flags: ReadonlySet<string>, flag: string, ...values: string[]): boolean {
  if (!flags.has(flag)) return false;
  argv.push(flag, ...values);
  return true;
}

/**
 * Argv for one headless question. Every flag is skipped unless `flags`
 * contains it. `flags` comes from `grok --help` (the 009 doctor probe).
 * 009 stores only `effortFlag`, so the adapter parses the flag names itself.
 */
export function planGrokCall(
  req: ThinkRequest<unknown>,
  cfg: GuideConfig,
  flags: ReadonlySet<string>,
  dir: string,
): GrokPlan {
  const model = req.model ?? cfg.ai.model;
  const effort = resolveEffort(req, cfg);
  const turns = resolveTurns(req);
  const prompt = req.input;
  if (prompt.trim().length === 0) throw new ThinkInputError("prompt is empty.");

  const argv: string[] = [];
  const files: PlannedFile[] = [];

  push(argv, flags, "--permission-mode", "plan");
  push(argv, flags, "--tools", READ_ONLY_TOOLS);
  push(argv, flags, "--max-turns", String(turns));
  push(argv, flags, "--output-format", "json");
  if (req.schema !== undefined) {
    push(argv, flags, "--json-schema", JSON.stringify(req.schema));
  }
  if (!push(argv, flags, "-m", model)) push(argv, flags, "--model", model);
  if (!push(argv, flags, "--effort", effort)) push(argv, flags, "--reasoning-effort", effort);

  const images = req.images ?? [];
  if (images.length > 0 && (flags.has("--prompt-json") || flags.has("--prompt-file"))) {
    const json = contentBlocks(prompt, images);
    const heavy = Buffer.byteLength(json, "utf8") > PROMPT_FILE_BYTES;
    if ((heavy || !flags.has("--prompt-json")) && flags.has("--prompt-file")) {
      const file = path.join(dir, "prompt.json");
      files.push({ path: file, body: json });
      argv.push("--prompt-file", file);
    } else if (flags.has("--prompt-json")) {
      argv.push("--prompt-json", json);
    }
  } else if (Buffer.byteLength(prompt, "utf8") > PROMPT_FILE_BYTES && flags.has("--prompt-file")) {
    const file = path.join(dir, "prompt.txt");
    files.push({ path: file, body: prompt });
    argv.push("--prompt-file", file);
  } else if (flags.has("-p")) {
    argv.push("-p", prompt);
  } else if (flags.has("--single")) {
    argv.push("--single", prompt);
  } else if (flags.has("--prompt-file")) {
    const file = path.join(dir, "prompt.txt");
    files.push({ path: file, body: prompt });
    argv.push("--prompt-file", file);
  }

  return { argv, files };
}

export function buildGrokArgv(
  req: ThinkRequest<unknown>,
  cfg: GuideConfig,
  flags: ReadonlySet<string>,
): string[] {
  return planGrokCall(req, cfg, flags, path.join(os.tmpdir(), "hh-grok-argv")).argv;
}

export function resolveEffort(req: ThinkRequest<unknown>, cfg: GuideConfig): "medium" | "high" | "xhigh" {
  if (req.effort !== undefined) return req.effort;
  const override = cfg.ai.effort[req.task];
  if (override === "medium" || override === "high" || override === "xhigh") return override;
  return cfg.ai.effort.default;
}

function resolveTurns(req: ThinkRequest<unknown>): number {
  if (req.maxTurns === undefined) return 1;
  if (!Number.isInteger(req.maxTurns) || req.maxTurns < 1 || req.maxTurns > 100) {
    throw new ThinkInputError("maxTurns must be an integer from 1 to 100.");
  }
  return req.maxTurns;
}

export function hasPromptFlag(argv: readonly string[]): boolean {
  return argv.includes("-p") || argv.includes("--single") || argv.includes("--prompt-file") || argv.includes("--prompt-json");
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) continue;
    const found = finiteNumber(record[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function readUsage(value: unknown): { inputTokens?: number; outputTokens?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = firstNumber(value, ["input_tokens", "inputTokens", "prompt_tokens"]);
  const outputTokens = firstNumber(value, ["output_tokens", "outputTokens", "completion_tokens"]);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const usage: { inputTokens?: number; outputTokens?: number } = {};
  if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  return usage;
}

function applyUsage(target: ParsedModel, value: unknown): void {
  const usage = readUsage(value);
  if (usage === undefined) return;
  if (usage.inputTokens !== undefined) target.inputTokens = usage.inputTokens;
  if (usage.outputTokens !== undefined) target.outputTokens = usage.outputTokens;
}

function assistantText(value: unknown): string {
  if (!isRecord(value)) return "";
  const message = value.message;
  if (!isRecord(message) || !Array.isArray(message.content)) return "";
  let text = "";
  for (const block of message.content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") text += block.text;
  }
  return text;
}

function structuredText(value: unknown): string | undefined {
  if (!isRecord(value) || !Object.hasOwn(value, "structured_output")) return undefined;
  const structured = value.structured_output;
  if (typeof structured === "string") return structured;
  if (structured === undefined) return undefined;
  return JSON.stringify(structured);
}

function isEnvelope(value: Record<string, unknown>): boolean {
  if (value.type === "error" || value.type === "result") return true;
  const marked =
    "stopReason" in value ||
    "sessionId" in value ||
    "requestId" in value ||
    "usage" in value ||
    "num_turns" in value ||
    "modelUsage" in value;
  if (!marked) return false;
  return typeof value.text === "string" || typeof value.result === "string" || "structured_output" in value;
}

function fromEnvelope(value: Record<string, unknown>): ParsedModel {
  const parsed: ParsedModel = { text: "" };
  if (value.type === "error" && typeof value.message === "string") parsed.errorMessage = value.message;
  const structured = structuredText(value);
  if (structured !== undefined) parsed.text = structured;
  else if (typeof value.text === "string") parsed.text = value.text;
  else if (typeof value.result === "string") parsed.text = value.result;
  applyUsage(parsed, value.usage);
  return parsed;
}

function fromNdjson(lines: readonly string[]): ParsedModel | undefined {
  const objects: Record<string, unknown>[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) objects.push(parsed);
      else return undefined;
    } catch {
      return undefined;
    }
  }
  if (objects.length < 2) return undefined;
  const parsed: ParsedModel = { text: "" };
  let streamed = "";
  let resultText = "";
  let structured: string | undefined;
  for (const object of objects) {
    if (object.type === "text" && typeof object.data === "string") streamed += object.data;
    if (object.type === "error" && typeof object.message === "string") parsed.errorMessage = object.message;
    if (object.type === "assistant") streamed += assistantText(object);
    if (object.type === "result" && typeof object.result === "string") resultText = object.result;
    const block = structuredText(object);
    if (block !== undefined) structured = block;
    applyUsage(parsed, object.usage);
  }
  parsed.text = structured ?? (resultText.length > 0 ? resultText : streamed);
  return parsed;
}

/** Accepts a json envelope, streaming-json lines, or raw model text. */
export function parseGrokStdout(stdout: string): ParsedModel {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return { text: "" };
  const lines = trimmed.split(/\r?\n/);
  const streamed = fromNdjson(lines);
  if (streamed !== undefined) return streamed;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed) && isEnvelope(parsed)) return fromEnvelope(parsed);
  } catch {
    // The model returned prose or a JSON fragment. Keep the text.
  }
  return { text: trimmed };
}

export function unavailableMessage(stdout: string, stderr: string): string | undefined {
  const combined = `${stderr}\n${stdout}`;
  if (!UNAVAILABLE.test(combined)) return undefined;
  const line = (stderr.trim().length > 0 ? stderr : stdout).trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 0 ? line.slice(0, 500) : "grok is unavailable.";
}

function quoteCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^()%!`]/.test(arg)) return arg;
  let out = '"';
  let slashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      slashes += 1;
      continue;
    }
    if (char === '"') {
      out += `${"\\".repeat(slashes * 2)}\\"`;
      slashes = 0;
      continue;
    }
    if (slashes > 0) {
      out += "\\".repeat(slashes);
      slashes = 0;
    }
    out += char;
  }
  if (slashes > 0) out += "\\".repeat(slashes * 2);
  return `${out}"`;
}

/**
 * Spawn a resolved grok.exe or grok.cmd. Arguments stay an array.
 * A batch shim cannot be CreateProcess'd, so Windows runs it through
 * cmd.exe /d /s /c with each argument quoted. The prompt is not concatenated
 * into a shell script by the caller.
 */
function launch(file: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const shared = {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  };
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
    const commandLine = [file, ...args].map((arg) => quoteCmdArg(arg)).join(" ");
    const comspec = envValue(env, "ComSpec") ?? "cmd.exe";
    return spawn(comspec, ["/d", "/s", "/c", `"${commandLine}"`], {
      ...shared,
      shell: false,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(file, [...args], {
    ...shared,
    shell: false,
    detached: process.platform !== "win32",
  });
}

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    child.kill("SIGKILL");
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

/** Spawn with a timeout. On timeout the child process tree is killed. */
export function spawnGrok(request: SpawnRequest): Promise<SpawnOutput> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let errorCode: string | null = null;
    let settled = false;
    let force: ReturnType<typeof setTimeout> | undefined;
    const child = launch(request.command, request.args, request.cwd, request.env);

    const finish = (status: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (force !== undefined) clearTimeout(force);
      resolve({
        status,
        stdout,
        stderr,
        timedOut,
        errorCode,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      force = setTimeout(() => finish(null), 2_000);
    }, request.timeoutMs);

    const take = (into: "stdout" | "stderr", chunk: string): void => {
      if (into === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > OUTPUT_BYTES_MAX) {
        errorCode = "OUTPUT_LIMIT";
        killTree(child);
      }
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => take("stdout", chunk));
    child.stderr?.on("data", (chunk: string) => take("stderr", chunk));
    child.on("error", (error: unknown) => {
      errorCode = errorCodeOf(error);
    });
    child.on("close", (status) => finish(status));
  });
}
