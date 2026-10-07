/**
 * Headless runner for one site prompt.
 *
 * Flags follow context/sources/xai/cli_headless-scripting.md and the v2
 * drive loop, with two limits from this prompt: always-approve is omitted,
 * and sandbox flags are omitted. Alias mode does not pass --session-id.
 * v2 §11.1 shows that flag on every run, and allows always-approve only
 * inside a sandbox profile. Those arrive in later prompts. The caller
 * supplies a new uuid per run. This module does not mint one and does not
 * resume a session.
 *
 * promptText is already assembled (RULES, then the prompt, then @file
 * references). This module does not read the Guide repo. readImpl, when
 * the caller passes one, only says whether promptPath exists.
 *
 * buildArgv returns the flags after the program. runPrompt hands spawnImpl
 * [bin, ...flags]. A bin path with spaces stays one array element because
 * nothing joins a shell string.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_MODEL = "grok-4.7";

/** Site prompts cap turns here. think() uses a different ceiling. */
export const MAX_TURNS = 80;

/** Captured stderr on a failed run, after trim. */
export const STDERR_LIMIT = 2_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RunConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunConfigError";
  }
}

export class RunFailed extends Error {
  readonly code: number;
  readonly promptPath: string;
  readonly stderr: string;

  constructor(code: number, promptPath: string, stderr: string) {
    const detail = stderr === "" ? "" : ` ${stderr}`;
    super(`Prompt run failed with exit ${code} for ${promptPath}.${detail}`);
    this.name = "RunFailed";
    this.code = code;
    this.promptPath = promptPath;
    this.stderr = stderr;
  }
}

export interface RunRequest {
  model: string;
  cwd: string;
  promptText: string;
  bin: string;
  promptPath: string;
  effort: "medium" | "high" | "xhigh";
  maxTurns: number;
  sessionMode: "unknown" | "uuid" | "alias";
  sessionId?: string;
  /**
   * The boolean assertDriveAllowed established.
   * Only `true` is a yes. A missing file never becomes true.
   */
  approved: boolean;
}

export type SpawnImpl = (argv: string[]) => Promise<{ code: number; stderr: string }>;

/** Returns whether promptPath exists. It does not receive file contents. */
export type ReadImpl = (promptPath: string) => boolean | Promise<boolean>;

/**
 * Whole command-line budget.
 * Windows CreateProcess allows 32767 characters.
 * Linux MAX_ARG_STRLEN is 131072 bytes for one argument. macOS ARG_MAX is larger.
 * The smaller portable ceiling keeps a single -p value legal.
 */
export function osArgvLimit(): number {
  if (process.platform === "win32") return 32_767;
  return 131_072;
}

/**
 * Path used when the assembled prompt does not fit on the command line.
 * The same request always resolves to the same path. runPrompt writes the
 * text there before spawn, and buildArgv records the path after --prompt-file.
 */
export function assembledPromptPath(req: Pick<RunRequest, "cwd" | "promptPath" | "sessionId">): string {
  const hash = createHash("sha256");
  hash.update(req.cwd, "utf8");
  hash.update("\0", "utf8");
  hash.update(req.promptPath, "utf8");
  hash.update("\0", "utf8");
  hash.update(req.sessionId ?? "", "utf8");
  const stamp = hash.digest("hex").slice(0, 16);
  const raw = path.basename(req.promptPath).replace(/[^A-Za-z0-9._-]+/g, "_");
  const base = raw === "" || raw === "." || raw === ".." ? "prompt" : raw;
  return path.join(os.tmpdir(), "hitchhiker-orchestrator", `${stamp}-${base}.txt`);
}

function assertEffort(effort: string): void {
  if (effort !== "medium" && effort !== "high" && effort !== "xhigh") {
    throw new RunConfigError("Effort must be medium, high, or xhigh.");
  }
}

function assertMaxTurns(maxTurns: number): void {
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_TURNS) {
    throw new RunConfigError(`maxTurns must be an integer from 1 to ${MAX_TURNS}.`);
  }
}

function assertSession(req: RunRequest): void {
  const mode: string = req.sessionMode;
  if (mode !== "uuid" && mode !== "alias") {
    throw new RunConfigError("Session id mode is unknown. Run hh doctor.");
  }
  if (mode === "alias") return;
  const id = req.sessionId ?? "";
  if (id === "") {
    throw new RunConfigError("UUID session mode requires a sessionId.");
  }
  if (!UUID_RE.test(id)) {
    throw new RunConfigError("Session id must be an 8-4-4-4-12 hex UUID.");
  }
}

function assertText(value: string, message: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new RunConfigError(message);
  }
}

/**
 * Same boolean assertDriveAllowed requires: only `true` counts.
 * Called before any spawn, including from buildArgv, so a denied drive
 * never produces a launch command.
 */
function assertRunnable(req: RunRequest): void {
  if (req.approved !== true) {
    throw new RunConfigError("Missing drive approval. A missing file is not a yes.");
  }
  assertSession(req);
  assertEffort(req.effort);
  assertMaxTurns(req.maxTurns);
  assertText(req.bin, "grok bin is missing.");
  assertText(req.cwd, "Project directory is missing.");
  assertText(req.promptPath, "Prompt path is missing.");
  assertText(req.promptText, "Prompt text is missing.");
}

function modelOf(req: RunRequest): string {
  if (typeof req.model === "string" && req.model.trim() !== "") return req.model;
  return DEFAULT_MODEL;
}

/**
 * Windows counts the quoted command line. An argument with spaces gains a
 * pair of quotes, and each quote character inside it is escaped.
 * POSIX uses the byte length. Linux rejects one argument past MAX_ARG_STRLEN.
 */
function argSize(part: string): number {
  if (process.platform !== "win32") return Buffer.byteLength(part, "utf8");
  if (!/[\t\n\v\f\r "]/u.test(part)) return part.length;
  let quotes = 0;
  for (const char of part) {
    if (char === '"') quotes += 1;
  }
  return part.length + 2 + quotes;
}

function commandSize(parts: readonly string[]): number {
  let total = 0;
  for (const part of parts) total += argSize(part) + 1;
  return total;
}

function flagArgs(req: RunRequest, delivery: "inline" | "file"): string[] {
  const promptFlag =
    delivery === "inline" ? ["-p", req.promptText] : ["--prompt-file", assembledPromptPath(req)];
  const args = [
    "--no-auto-update",
    ...promptFlag,
    "-m",
    modelOf(req),
    "--cwd",
    req.cwd,
    "--output-format",
    "streaming-json",
    "--effort",
    req.effort,
    "--max-turns",
    String(req.maxTurns),
  ];
  if (req.sessionMode === "uuid") {
    const id = req.sessionId;
    if (id === undefined || id === "") {
      throw new RunConfigError("UUID session mode requires a sessionId.");
    }
    args.push("--session-id", id);
  }
  return args;
}

export function buildArgv(req: RunRequest): string[] {
  assertRunnable(req);
  const inline = flagArgs(req, "inline");
  if (commandSize([req.bin, ...inline]) > osArgvLimit()) {
    return flagArgs(req, "file");
  }
  return inline;
}

function captureStderr(stderr: string, promptText: string): string {
  let text = stderr.trim();
  if (promptText !== "") text = text.split(promptText).join("[prompt omitted]");
  if (text.length > STDERR_LIMIT) text = text.slice(0, STDERR_LIMIT);
  return text;
}

function recordPromptFile(args: readonly string[], promptText: string): void {
  const index = args.indexOf("--prompt-file");
  if (index < 0) return;
  const file = args[index + 1];
  if (file === undefined || file === "") {
    throw new RunConfigError("Prompt file path is missing.");
  }
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, promptText, { encoding: "utf8" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "write failed";
    throw new RunConfigError(`Could not record the prompt file at ${file}. ${message}`);
  }
}

export async function runPrompt(req: RunRequest, spawnImpl: SpawnImpl, readImpl?: ReadImpl): Promise<void> {
  const args = buildArgv(req);
  if (readImpl !== undefined) {
    const exists = await readImpl(req.promptPath);
    if (exists !== true) {
      throw new RunConfigError(`Prompt file is missing: ${req.promptPath}`);
    }
  }
  recordPromptFile(args, req.promptText);
  const result = await spawnImpl([req.bin, ...args]);
  const code = result.code;
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (code !== 0) {
    throw new RunFailed(code, req.promptPath, captureStderr(stderr, req.promptText));
  }
}
