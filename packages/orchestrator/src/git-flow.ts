/**
 * Backup ref and one commit per prompt.
 *
 * prepareRepo creates `hh/backup-YYYY-MM-DD` at the current HEAD and does not
 * switch to it. A later call leaves that ref where it is.
 *
 * commitPrompt runs `git add -A`, drops secret names from the index, then
 * commits what remains. When a secret path was the only change, the commit
 * is not run. The runner executes each argv and returns no output, so the
 * name-only read is a separate git call. Both paths go through
 * evaluateCommand first. This module does not update remotes and does not
 * set an identity.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { evaluateCommand } from "./policy.ts";

export class GitFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitFlowError";
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function backupBranchName(date: string): string {
  const match = DATE_RE.exec(date);
  const yearText = match?.[1];
  const monthText = match?.[2];
  const dayText = match?.[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new GitFlowError("invalid backup date");
  }
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const length = daysInMonth(year, month);
  if (length === 0 || day < 1 || day > length) {
    throw new GitFlowError("invalid backup date");
  }
  return `hh/backup-${date}`;
}

/**
 * Throws when any path is a secret name.
 * Matching uses a path segment or a suffix, never a substring, so `notenv` passes.
 */
export function assertNoSecrets(paths: string[]): void {
  const found: string[] = [];
  for (const entry of paths) {
    if (isSecretPath(entry)) found.push(entry);
  }
  if (found.length === 0) return;
  throw new GitFlowError(`secret paths cannot be committed: ${found.join(", ")}`);
}

/**
 * Creates the backup branch when it is missing.
 * Git must already have a HEAD. An invalid date throws before git runs.
 */
export async function prepareRepo(dir: string, date: string): Promise<void> {
  const name = backupBranchName(date);
  const ref = `refs/heads/${name}`;
  if (await refExists(dir, ref)) return;
  await execAllowed(["git", "-C", dir, "branch", name], dir);
}

/**
 * One prompt, one commit.
 * Message checks and evaluateCommand run before the runner.
 * assertNoSecrets runs after secret names are unstaged and before commit.
 */
export async function commitPrompt(
  dir: string,
  message: string,
  runner: (args: string[]) => Promise<void>,
): Promise<void> {
  assertMessage(message);
  const addArgv = ["git", "-C", dir, "add", "-A"];
  const commitArgv = ["git", "-C", dir, "commit", "-m", message];
  assertAllowed(addArgv, dir);
  assertAllowed(commitArgv, dir);

  await runAllowed(addArgv, dir, runner);

  const staged = await listStaged(dir);
  const secrets = staged.filter((entry) => isSecretPath(entry));
  if (secrets.length > 0) {
    await runAllowed(["git", "-C", dir, "reset", "-q", "HEAD", "--", ...secrets], dir, runner);
  }

  const remaining = await listStaged(dir);
  if (secrets.length > 0 && remaining.length === 0) {
    assertNoSecrets(secrets);
  }
  assertNoSecrets(remaining);
  await runAllowed(commitArgv, dir, runner);
}

function assertMessage(message: string): void {
  if (message.includes("\n") || message.includes("\r")) {
    throw new GitFlowError("commit message must be one line");
  }
  if (message.trim() === "") {
    throw new GitFlowError("commit message is empty");
  }
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2 && isLeap(year)) return 29;
  return MONTH_LENGTHS[month - 1] ?? 0;
}

function isLeap(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function normalize(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/\/+$/, "");
}

function isEnvFile(filePath: string): boolean {
  const normalized = normalize(filePath);
  const fileBase = path.posix.basename(normalized).toLowerCase();
  if (fileBase === ".env" || fileBase.startsWith(".env.")) return true;
  let cursor = path.posix.dirname(normalized);
  while (cursor !== "" && cursor !== "." && cursor !== "/") {
    if (path.posix.basename(cursor).toLowerCase() === ".env") return true;
    const parent = path.posix.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return false;
}

function isPem(filePath: string): boolean {
  const base = path.posix.basename(normalize(filePath)).toLowerCase();
  if (path.posix.extname(base) === ".pem") return true;
  // `path.extname(".pem")` is empty. The suffix is still `.pem`.
  return base.endsWith(".pem");
}

function isCredentials(filePath: string): boolean {
  return path.posix.basename(normalize(filePath)).toLowerCase() === "credentials.json";
}

function isGuideConfig(filePath: string): boolean {
  const normalized = normalize(filePath);
  if (path.posix.basename(normalized).toLowerCase() !== "config.json") return false;
  return path.posix.basename(path.posix.dirname(normalized)).toLowerCase() === ".hitchhiker";
}

function isSecretPath(filePath: string): boolean {
  return isEnvFile(filePath) || isPem(filePath) || isCredentials(filePath) || isGuideConfig(filePath);
}

function assertAllowed(argv: readonly string[], dir: string): void {
  const decision = evaluateCommand({ argv: [...argv], projectRoot: dir });
  if (decision.decision === "deny") {
    throw new GitFlowError(decision.reason);
  }
}

async function runAllowed(
  argv: readonly string[],
  dir: string,
  runner: (args: string[]) => Promise<void>,
): Promise<void> {
  assertAllowed(argv, dir);
  await runner([...argv]);
}

async function execAllowed(argv: readonly string[], dir: string): Promise<string> {
  assertAllowed(argv, dir);
  return execGit([...argv]);
}

function execGit(argv: readonly string[]): Promise<string> {
  const bin = argv[0];
  if (bin === undefined || bin === "") {
    return Promise.reject(new GitFlowError("empty git argv"));
  }
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      argv.slice(1),
      { windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

function exitCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("status" in error && typeof error.status === "number") return error.status;
  if ("code" in error && typeof error.code === "number") return error.code;
  return undefined;
}

async function refExists(dir: string, ref: string): Promise<boolean> {
  try {
    await execAllowed(["git", "-C", dir, "show-ref", "--verify", "--quiet", ref], dir);
    return true;
  } catch (error) {
    if (exitCode(error) === 1) return false;
    throw error;
  }
}

async function listStaged(dir: string): Promise<string[]> {
  const stdout = await execAllowed(
    ["git", "-C", dir, "-c", "core.quotepath=false", "diff", "--cached", "--name-only", "-z"],
    dir,
  );
  return stdout.split("\0").filter((name) => name !== "");
}
