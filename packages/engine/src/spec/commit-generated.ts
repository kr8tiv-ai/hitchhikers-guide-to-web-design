/**
 * After a prompt exits clean, leftover project files are part of that prompt.
 * Ignored run state stays untracked. The follow-up commit is recorded in the build log.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { hiddenChildOptions } from "../hidden-child.ts";

export interface CommitGeneratedResult {
  committed: string[];
  message: string;
  logLine: string;
}

const IGNORE_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "out",
  ".astro",
  ".next",
  ".svelte-kit",
  ".output",
  ".vercel",
  ".cache",
  ".vite",
  ".turbo",
  ".parcel-cache",
  "coverage",
]);

export function isIgnoredGeneratedPath(relPath: string): boolean {
  const norm = relPath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  if (norm === "" || norm.startsWith("../") || norm.includes("\0")) return true;
  const parts = norm.split("/");
  if (parts.some((part) => IGNORE_SEGMENTS.has(part))) return true;
  if (norm === ".hitchhiker/tmp" || norm.startsWith(".hitchhiker/tmp/")) return true;
  if (norm === ".hitchhiker/logs" || norm.startsWith(".hitchhiker/logs/")) return true;
  if (norm.endsWith(".tsbuildinfo")) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base === ".env" || base.startsWith(".env.")) return true;
  return false;
}

/**
 * Commit untracked and modified files the prompt left behind.
 * A directory that is not its own git root is left untouched.
 */
export function commitGeneratedFiles(projectDir: string, promptId: string): CommitGeneratedResult {
  const empty: CommitGeneratedResult = { committed: [], message: "", logLine: "" };
  if (!ownRepo(projectDir)) return empty;
  const pending = parseStatus(git(projectDir, ["status", "--porcelain=v1", "-z", "-uall"])).filter(
    (file) => !isIgnoredGeneratedPath(file),
  );
  if (pending.length === 0) return empty;
  const id = /^[\w.-]+$/.test(promptId) ? promptId : "prompt";
  const message = `chore(site): commit generated files (${id})`;
  const hooks = path.join(projectDir, ".git", "hh-hooks");
  mkdirSync(hooks, { recursive: true });
  git(projectDir, ["add", "--pathspec-from-file=-", "--pathspec-file-nul"], `${pending.join("\0")}\0`, hooks);
  git(projectDir, ["commit", "-m", message], undefined, hooks);
  const logLine = `Committed generated files for ${id}: ${pending.join(", ")}. ${message}`;
  const logFile = path.join(projectDir, ".hitchhiker", "logs", `build-${id}.log`);
  mkdirSync(path.dirname(logFile), { recursive: true });
  appendFileSync(logFile, `${logLine}\n`, "utf8");
  return { committed: pending, message, logLine };
}

function ownRepo(projectDir: string): boolean {
  let top = "";
  try {
    top = git(projectDir, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return false;
  }
  if (top === "") return false;
  const left = canonical(top);
  const right = canonical(projectDir);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Resolve symlinks and Windows short names so /var and /private/var, or RUNNER~1 and runneradmin, compare equal. */
function canonical(dir: string): string {
  const resolved = path.resolve(dir);
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function parseStatus(text: string): string[] {
  const parts = text.split("\0").filter((part) => part.length > 0);
  const paths: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index] ?? "";
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    if (status === "!!") continue;
    const current = entry.slice(3).trim();
    const renamed = status[0] === "R" || status[0] === "C";
    if (renamed) {
      index += 1;
      const next = parts[index];
      if (next !== undefined && next.trim() !== "") paths.push(next.trim());
      continue;
    }
    if (current !== "") paths.push(current);
  }
  return paths;
}

function git(cwd: string, args: string[], input?: string, hooks?: string): string {
  const hookArgs = hooks === undefined ? [] : ["-c", `core.hooksPath=${hooks.split("\\").join("/")}`];
  try {
    return execFileSync(
      "git",
      [
        "-c",
        "safe.directory=*",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.fsmonitor=false",
        ...hookArgs,
        "-c",
        "user.name=Hitchhiker",
        "-c",
        "user.email=hh@localhost",
        ...args,
      ],
      hiddenChildOptions({
        cwd,
        encoding: "utf8" as const,
        input,
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
        env: gitEnv(),
        stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
      }),
    );
  } catch (error: unknown) {
    const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const message = error instanceof Error ? error.message : "git failed";
    throw new Error(stderr.trim() === "" ? message : stderr.trim());
  }
}

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  env.GIT_AUTHOR_NAME = "Hitchhiker";
  env.GIT_AUTHOR_EMAIL = "hh@localhost";
  env.GIT_COMMITTER_NAME = "Hitchhiker";
  env.GIT_COMMITTER_EMAIL = "hh@localhost";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}
