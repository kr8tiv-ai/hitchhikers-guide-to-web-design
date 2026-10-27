import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hiddenChildOptions, NORMAL_PUSH_ARGS, WORKTREE_PUSH_ARGS, assertSupervisorGit, decidePushVerify } from "@hitchhiker/engine";
import { detectHook } from "./hooks.ts";

export interface GitText {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type GitRunner = (cwd: string, args: readonly string[]) => GitText;

const HEX_COMMIT = /^[0-9a-f]{40}$/;
const GIT_LOCK_ATTEMPTS = 10;
const AUTH_PUSH_REASON = "Push was refused: SSH key or credentials. Check your git login.";

const SPECIFIC_AUTH = /permission denied \(publickey\)|authentication failed|\b403\b/i;
const TRANSPORT_AUTH = /could not read from remote repository/i;
const FILE_LOCK =
  /unable to write file|unable to write new index file|unable to index file|failed to insert into database|index\.lock|resource busy|resource temporarily unavailable/i;
const DENIED = /permission denied/i;
const DENIED_CONTEXT = /(?:\bfile\b|\bobjects?\b|\bindex\b|\.git[\\/])/i;

function lockEvidence(text: string): boolean {
  if (FILE_LOCK.test(text)) return true;
  return DENIED.test(text) && DENIED_CONTEXT.test(text);
}

/**
 * SSH or HTTPS rejected the remote. A loose-object "Permission denied" is not this.
 * Git's transport trailer is auth only when the same text has no file-lock evidence,
 * so a lock plus "Could not read from remote repository." stays a lock and is retried.
 */
export function gitTextIsAuthFailure(text: string): boolean {
  if (SPECIFIC_AUTH.test(text)) return true;
  return TRANSPORT_AUTH.test(text) && !lockEvidence(text);
}

/** A Windows lock on a loose object or the index. A specific auth refusal is not this. */
export function gitTextIsFileLock(text: string): boolean {
  if (SPECIFIC_AUTH.test(text)) return false;
  return lockEvidence(text);
}

let supervisorConfig: string | null = null;

function supervisorConfigFile(): string {
  if (supervisorConfig !== null) return supervisorConfig;
  const file = path.join(os.tmpdir(), "hh-supervise-empty.gitconfig");
  if (!existsSync(file)) writeFileSync(file, "");
  supervisorConfig = file;
  return file;
}

/**
 * Git children must not inherit GIT_DIR, a credential helper, or a global
 * config. Those can print an auth trailer into an unrelated ancestor check.
 */
export function supervisorGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  const blank = supervisorConfigFile();
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CONFIG_GLOBAL = blank;
  env.GIT_CONFIG_SYSTEM = blank;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_COUNT = "1";
  env.GIT_CONFIG_KEY_0 = "safe.directory";
  env.GIT_CONFIG_VALUE_0 = "*";
  return env;
}

export function gitLockDelayMs(attempt: number): number {
  return Math.min(2_000, 250 * 2 ** attempt);
}

function waitMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Retry only a file lock. An auth refusal, a rejected push, a hook, and a bad ref return on the first result.
 */
export function retryGitText(run: () => GitText, wait: (ms: number) => void = waitMs): GitText {
  let last: GitText = { status: 1, stdout: "", stderr: "git produced no result" };
  for (let attempt = 0; attempt < GIT_LOCK_ATTEMPTS; attempt += 1) {
    last = run();
    if ((last.status ?? 1) === 0) return last;
    const text = `${last.stderr}\n${last.stdout}`;
    if (gitTextIsAuthFailure(text)) return last;
    const locked = gitTextIsFileLock(text);
    if (!locked || attempt === GIT_LOCK_ATTEMPTS - 1) return last;
    wait(gitLockDelayMs(attempt));
  }
  return last;
}

function spawnGit(cwd: string, args: readonly string[]): GitText {
  const result = spawnSync("git", [...args], hiddenChildOptions({
    cwd,
    env: supervisorGitEnv(),
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    timeout: 60_000,
    killSignal: "SIGKILL",
  }));
  const stdout = typeof result.stdout === "string" ? result.stdout.replace(/\r\n/g, "\n") : "";
  let stderr = typeof result.stderr === "string" ? result.stderr.replace(/\r\n/g, "\n") : "";
  if (result.error !== undefined && stderr.length === 0) stderr = result.error.message;
  return { status: result.status, stdout, stderr };
}

/** Spawn git only after the supervisor whitelist accepts the arguments. */
export function runSupervisorGit(cwd: string, args: readonly string[]): GitText {
  assertSupervisorGit(args);
  return retryGitText(() => spawnGit(cwd, args));
}

export interface PushCheck {
  ok: boolean;
  output: string;
  hook: string;
  exit: number;
  reason: string;
}

function clip(chunks: readonly string[]): string {
  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join("\n")
    .slice(0, 8_000);
}

/**
 * Normal push, then fetch, then an ancestor check.
 * A force flag throws inside the runner and is a failed push, not a retry.
 */
export function verifyKeptCommit(
  cwd: string,
  commit: string,
  run: GitRunner = runSupervisorGit,
  isolated = false,
): PushCheck {
  if (!HEX_COMMIT.test(commit)) {
    return {
      ok: false,
      output: "Refusing to verify an unpinned commit.",
      hook: "",
      exit: 1,
      reason: "unpinned commit",
    };
  }
  const chunks: string[] = [];
  let pushExit = 1;
  let pushText = "";
  let ancestorExit = 1;
  let forceRefused = false;
  try {
    const push = run(cwd, isolated ? [...WORKTREE_PUSH_ARGS] : [...NORMAL_PUSH_ARGS]);
    chunks.push(push.stdout, push.stderr);
    pushText = `${push.stdout}\n${push.stderr}`;
    pushExit = push.status ?? 1;
    if (pushExit === 0) {
      const fetched = run(cwd, ["fetch", "origin", "main"]);
      chunks.push(fetched.stdout, fetched.stderr);
      if ((fetched.status ?? 1) !== 0) {
        ancestorExit = fetched.status ?? 1;
      } else {
        const ancestor = run(cwd, ["merge-base", "--is-ancestor", commit, "origin/main"]);
        chunks.push(ancestor.stdout, ancestor.stderr);
        ancestorExit = ancestor.status ?? 1;
      }
    }
  } catch (error: unknown) {
    forceRefused = true;
    chunks.push(error instanceof Error ? error.message : "push refused");
  }
  const decision = decidePushVerify({ pushExit, ancestorExit, forceRefused });
  const output = clip(chunks);
  let reason = "";
  if (decision !== "pushed") {
    if (forceRefused) reason = "force push refused";
    else if (pushExit !== 0 && gitTextIsAuthFailure(pushText)) reason = AUTH_PUSH_REASON;
    else if (pushExit !== 0) reason = "push was rejected";
    else reason = "origin/main does not contain the commit";
  }
  return {
    ok: decision === "pushed",
    output,
    hook: detectHook(output),
    exit: forceRefused ? 1 : pushExit,
    reason,
  };
}
