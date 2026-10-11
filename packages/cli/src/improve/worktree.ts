import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { buildPnpmInvocation } from "./pnpm-command.ts";

export interface SupervisorWorktree {
  /** Absolute path of the isolated work tree. */
  dir: string;
  /** The improve branch checked out there. */
  branch: string;
  /** The commit of the main tree it was cut from. */
  base: string;
}

function git(cwd: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], hiddenChildOptions({
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout.replace(/\r\n/g, "\n") : "",
    stderr: typeof result.stderr === "string" ? result.stderr.replace(/\r\n/g, "\n") : "",
  };
}

function must(cwd: string, args: readonly string[]): string {
  const result = git(cwd, args);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args[0] ?? ""} failed`);
  return result.stdout;
}

/** Local time as yyyymmdd-HHMMSS, safe in a branch and a folder name. */
export function worktreeStamp(now: Date): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return (
    `${String(now.getFullYear()).padStart(4, "0")}${two(now.getMonth() + 1)}${two(now.getDate())}` +
    `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  );
}

export function defaultWorktreeRoot(): string {
  return path.join(os.homedir(), "hh-improve-worktrees");
}

/**
 * Cut an isolated work tree from the main tree's HEAD, on a new improve branch.
 * The supervisor runs there, so files the human or the build driver add to the
 * main tree during a run cannot trip the protected-path check or dirty an experiment.
 * Dependencies are installed from the lockfile, without touching the main tree.
 */
export function createSupervisorWorktree(input: {
  repo: string;
  now: Date;
  root?: string;
  install?: boolean;
}): SupervisorWorktree {
  const stamp = worktreeStamp(input.now);
  const branch = `improve/supervise-${stamp}`;
  const root = input.root ?? defaultWorktreeRoot();
  mkdirSync(root, { recursive: true });
  const dir = path.join(realpathSync(root), `hh-improve-${stamp}`);
  if (existsSync(dir)) throw new Error(`Worktree folder already exists: ${dir}`);
  const base = must(input.repo, ["rev-parse", "HEAD"]).trim();
  must(input.repo, ["worktree", "add", "-b", branch, dir, base]);
  if (input.install !== false) {
    const inv = buildPnpmInvocation(["install", "--frozen-lockfile", "--prefer-offline"]);
    const done = spawnSync(inv.command, inv.args, hiddenChildOptions({
      cwd: dir,
      windowsVerbatimArguments: inv.verbatim,
      encoding: "utf8" as const,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
      timeout: 15 * 60 * 1000,
    }));
    if (done.status !== 0) {
      const tail = `${done.stderr ?? ""}${done.stdout ?? ""}`.trim().split("\n").slice(-3).join(" ");
      throw new Error(`pnpm install failed in the worktree: ${tail}`);
    }
  }
  return { dir, branch, base };
}

/** Remove an isolated work tree and its branch. Safe to call twice. */
export function removeSupervisorWorktree(repo: string, tree: SupervisorWorktree): void {
  git(repo, ["worktree", "remove", "--force", tree.dir]);
  git(repo, ["worktree", "prune"]);
  git(repo, ["branch", "-D", tree.branch]);
}

/** Folders an agent's tools drop into its cwd. They are never part of an experiment. */
export const STRAY_DIRS = [".playwright-mcp"] as const;
