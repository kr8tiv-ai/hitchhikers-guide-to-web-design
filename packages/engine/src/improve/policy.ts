/**
 * Branch and git rules the runner enforces even when grok approves everything.
 * There is no push, force-push, or deploy in the allowed set.
 */

export const DEFAULT_MAX_EXPERIMENTS = 5;
export const MAX_EXPERIMENTS_CEILING = 50;
export const MINUTE_CEILING = 180;
export const TURN_CEILING = 600;
export const DEFAULT_CONSECUTIVE_FAILURES = 3;
export const CONSECUTIVE_FAILURE_CEILING = 50;
export const DEFAULT_WALL_MINUTES = 60;
export const WALL_MINUTE_CEILING = 180;

const HEX_COMMIT = /^[0-9a-f]{40}$/;

export function resolveMaxExperiments(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_EXPERIMENTS;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_EXPERIMENTS_CEILING) {
    throw new Error(
      `--max-experiments must be an integer from 1 to ${MAX_EXPERIMENTS_CEILING}.`,
    );
  }
  return value;
}

export function resolveConsecutiveFailures(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CONSECUTIVE_FAILURES;
  if (!Number.isSafeInteger(value) || value < 1 || value > CONSECUTIVE_FAILURE_CEILING) {
    throw new Error(
      `--max-failures must be an integer from 1 to ${CONSECUTIVE_FAILURE_CEILING}.`,
    );
  }
  return value;
}

export function resolveWallMinutes(value: number | undefined): number {
  if (value === undefined) return DEFAULT_WALL_MINUTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > WALL_MINUTE_CEILING) {
    throw new Error(`--wall-minutes must be an integer from 1 to ${WALL_MINUTE_CEILING}.`);
  }
  return value;
}

/** True when the run has used its wall-clock budget. */
export function wallClockExceeded(elapsedMs: number, wallMinutes: number): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  if (!Number.isSafeInteger(wallMinutes) || wallMinutes < 1) return false;
  return elapsedMs >= wallMinutes * 60 * 1000;
}

export function resolveBudget(
  programValue: number,
  flag: number | undefined,
  ceiling: number,
  label: string,
): number {
  const value = flag ?? programValue;
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
    throw new Error(`${label} must be an integer from 1 to ${ceiling}.`);
  }
  return value;
}

export function isMainBranch(name: string): boolean {
  return name === "main" || name === "master";
}

export function isImproveBranchName(name: string): boolean {
  const match = /^improve\/([A-Za-z0-9][A-Za-z0-9._-]{0,80})$/.exec(name);
  if (match === null) return false;
  const tag = match[1] ?? "";
  return tag !== "main" && tag !== "master";
}

export function assertImproveBranch(name: string): void {
  if (!isImproveBranchName(name)) {
    throw new Error("The improve branch must start with improve/.");
  }
}

/** The supervisor stays on main, or on an improve branch when one is configured. */
export function assertSupervisorBranch(name: string): void {
  if (name === "main" || isImproveBranchName(name)) return;
  throw new Error("The supervisor branch must be main or an improve branch.");
}

/**
 * Rollback is only the commit this experiment started from, and only when
 * the human tree was clean at the start. Main is allowed when it is the
 * configured branch. This does not relax the improve-loop reset rule.
 */
export function assertSupervisorReset(input: {
  currentBranch: string;
  configuredBranch: string;
  targetCommit: string;
  experimentPrior: string;
  startedClean: boolean;
}): void {
  if (!input.startedClean) throw new Error("Refusing to reset a dirty human tree.");
  if (input.currentBranch === "HEAD") throw new Error("Refusing to reset a detached HEAD.");
  if (input.currentBranch !== input.configuredBranch || input.configuredBranch.length === 0) {
    throw new Error("Refusing to reset a branch that is not the supervisor branch.");
  }
  assertSupervisorBranch(input.configuredBranch);
  if (input.targetCommit !== input.experimentPrior) {
    throw new Error("Refusing to reset beyond the experiment rollback.");
  }
  if (!HEX_COMMIT.test(input.targetCommit)) {
    throw new Error("Refusing to reset to an unpinned commit.");
  }
}

/** Logs the supervisor writes. They are not dirt and not a target violation. */
export function isSupervisorArtifact(file: string): boolean {
  const norm = file.replace(/\\/g, "/");
  return (
    norm === "improve/results.tsv" ||
    norm === "improve/STOP" ||
    norm === "improve/hook-log.tsv" ||
    norm === "improve/PUSH-FAILED.txt" ||
    norm === "improve/findings" ||
    norm.startsWith("improve/findings/")
  );
}

export function improveBranchName(date: string, tag: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Branch date must be YYYY-MM-DD.");
  const name = `improve/${date}-${tag}`;
  assertImproveBranch(name);
  return name;
}

export function assertResetAllowed(input: {
  currentBranch: string;
  improveBranch: string;
  targetCommit: string;
}): void {
  if (isMainBranch(input.currentBranch) || isMainBranch(input.improveBranch)) {
    throw new Error("Refusing to reset main.");
  }
  if (input.currentBranch !== input.improveBranch || !isImproveBranchName(input.improveBranch)) {
    throw new Error("Refusing to reset a branch that is not the improve branch.");
  }
  if (!HEX_COMMIT.test(input.targetCommit)) {
    throw new Error("Refusing to reset to an unpinned commit.");
  }
}

function forbidden(args: readonly string[]): boolean {
  return args.some((arg) => arg === "push" || arg === "deploy" || arg === "--force" || arg === "-f");
}

/** Whitelist of git forms the runner may spawn. Everything else throws. */
export function assertGitAllowed(args: readonly string[]): void {
  const joined = args.join(" ");
  if (forbidden(args)) throw new Error(`Git command is not allowed: ${joined}`);
  const [cmd, ...rest] = args;
  if (cmd === "status" && rest.length === 1 && rest[0] === "--porcelain") return;
  if (cmd === "rev-parse" && rest.length === 1 && rest[0] === "HEAD") return;
  if (cmd === "rev-parse" && rest.length === 2 && rest[0] === "--abbrev-ref" && rest[1] === "HEAD") {
    return;
  }
  if (cmd === "rev-parse" && rest.length === 2 && rest[0] === "--short=12" && rest[1] === "HEAD") {
    return;
  }
  if (cmd === "diff" && rest.length === 1 && rest[0] === "--name-only") return;
  if (cmd === "diff" && rest.length === 2 && rest[0] === "--name-only" && rest[1] === "--cached") return;
  if (
    cmd === "diff" &&
    rest.length === 3 &&
    rest[0] === "--name-only" &&
    rest[2] === "HEAD" &&
    HEX_COMMIT.test(rest[1] ?? "")
  ) {
    return;
  }
  if (cmd === "reset" && rest.length === 2 && rest[0] === "--hard" && HEX_COMMIT.test(rest[1] ?? "")) {
    return;
  }
  if (cmd === "ls-files" && rest.length === 2 && rest[0] === "--others" && rest[1] === "--exclude-standard") {
    return;
  }
  if (cmd === "log" && rest.length === 2 && rest[0] === "-1" && rest[1] === "--format=%s") return;
  if (cmd === "branch" && rest.length === 2 && rest[0] === "--list" && isImproveBranchName(rest[1] ?? "")) {
    return;
  }
  if (cmd === "checkout" && rest.length === 1 && isImproveBranchName(rest[0] ?? "")) return;
  if (cmd === "checkout" && rest.length === 2 && rest[0] === "-b" && isImproveBranchName(rest[1] ?? "")) {
    return;
  }
  throw new Error(`Git command is not allowed: ${joined}`);
}

/** Porcelain paths, skipping the runner's own log and stop file. */
export function dirtyPaths(porcelain: string, ignore: readonly string[]): string[] {
  const skip = new Set(ignore);
  const dirty: string[] = [];
  for (const raw of porcelain.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim().length === 0) continue;
    const found = porcelainPath(line);
    if (skip.has(found)) continue;
    dirty.push(found);
  }
  return dirty;
}

function porcelainPath(line: string): string {
  let body = line.length >= 3 ? line.slice(3).trim() : line.trim();
  if (body.startsWith("\"") && body.endsWith("\"") && body.length >= 2) body = body.slice(1, -1);
  const arrow = body.indexOf(" -> ");
  if (arrow >= 0) body = body.slice(arrow + 4).trim();
  return body.replace(/\\/g, "/");
}
