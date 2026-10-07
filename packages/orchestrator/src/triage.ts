/**
 * Map one sensor verdict to the next Marvin action.
 *
 * `attempt` starts at 1. This module does not run git, reset a branch, or
 * talk to a remote. The caller resets the build branch to the ref returned
 * here, then runs one fresh session at the bumped effort. The error, the
 * diff, and the prompt's must_haves travel with that session. They are not
 * fields on the action.
 *
 * A failed package install, or rule 4, escalates. The reason says not to
 * swap the package. An ok verdict stops, unless that flag is set. The flag
 * wins over a green log.
 *
 * v2 section 11.2 fixes rules 1–3 immediately. Step 5 of this prompt says
 * rule 3 stops so the spec can be edited. The step wins.
 *
 * Rule 1 crashes and build failures retry on attempts 1 and 2, with effort
 * bumped one step, and roll back on attempt 3. Attempt 4 and later escalate.
 * That is the cap of three strikes, then the caller's one post-rollback
 * session, then a human with three options. Two stalls roll back on attempt
 * 2. A later stall escalates. Rule 2 retries once, then stops, except a
 * second stall still rolls back.
 *
 * The good ref is the tag `hh-good-<promptId>` when that exact string is in
 * `tags`. Otherwise it is the backup branch. v1 names the last `hh-good-*`
 * tag. Step 4 says otherwise use the backup, so another prompt's tag is
 * left alone. main and remote names are refused. A missing tag and a missing
 * backup throw. Nothing here guesses `HEAD~20`.
 */

import type { Effort } from "@hitchhiker/engine";
import { bumpEffort } from "./effort.ts";
import type { SensorVerdict } from "./sensors.ts";

export class TriageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriageError";
  }
}

export type TriageAction =
  | { type: "retry"; effort: Effort }
  | { type: "stop"; note: string }
  | { type: "escalate"; reason: string }
  | { type: "rollback"; ref: string };

const NO_SWAP = "Do not swap the package.";

const MAIN_REFS: ReadonlySet<string> = new Set([
  "main",
  "master",
  "head",
  "refs/heads/main",
  "refs/heads/master",
]);

export function decideTriage(input: {
  verdict: SensorVerdict;
  attempt: number;
  rule: 1 | 2 | 3 | 4;
  packageFailed: boolean;
  promptId: string;
  tags: string[];
  backup: string;
  effort: Effort;
}): TriageAction {
  assertAttempt(input.attempt);
  assertRule(input.rule);
  assertVerdict(input.verdict);

  if (input.packageFailed || input.rule === 4) {
    return { type: "escalate", reason: architectureReason(input.packageFailed) };
  }

  if (input.verdict === "ok") {
    return { type: "stop", note: "already green" };
  }

  if (input.rule === 3) {
    return { type: "stop", note: "Edit the spec. A blocker is not a retry." };
  }

  if (input.verdict === "stall") {
    return decideStall(input);
  }

  if (input.rule === 2) {
    if (input.attempt === 1) return retryAt(input.effort);
    return {
      type: "stop",
      note: "The missing piece is still absent. Stop after one retry.",
    };
  }

  if (input.attempt < 3) return retryAt(input.effort);
  if (input.attempt === 3) {
    return { type: "rollback", ref: rollbackRef(input.promptId, input.tags, input.backup) };
  }
  return {
    type: "escalate",
    reason: `${NO_SWAP} Three strikes is the cap. Options: edit the spec, keep the backup branch, or stop the drive.`,
  };
}

function decideStall(input: {
  attempt: number;
  promptId: string;
  tags: string[];
  backup: string;
  effort: Effort;
}): TriageAction {
  if (input.attempt === 1) return retryAt(input.effort);
  if (input.attempt === 2) {
    return { type: "rollback", ref: rollbackRef(input.promptId, input.tags, input.backup) };
  }
  return {
    type: "escalate",
    reason: `${NO_SWAP} Two stalls in a row is the cap. Options: edit the spec, keep the backup branch, or stop the drive.`,
  };
}

function retryAt(effort: Effort): TriageAction {
  const next = bumpEffort(effort);
  return { type: "retry", effort: next.effort };
}

function architectureReason(packageFailed: boolean): string {
  if (packageFailed) return `The install failed. ${NO_SWAP}`;
  return `The change is architectural. ${NO_SWAP}`;
}

/**
 * Exact `hh-good-<promptId>` wins. The backup is the only other legal ref.
 * A dangerous name throws even when the caller passed it as `backup`.
 */
function rollbackRef(promptId: string, tags: readonly string[], backup: string): string {
  const good = goodTagFor(promptId);
  if (good !== null && tags.includes(good)) return good;
  const branch = backup.trim();
  if (branch !== "" && !isDangerousRef(branch)) return branch;
  throw new TriageError("No hh-good tag and no backup branch.");
}

function goodTagFor(promptId: string): string | null {
  if (promptId === "" || promptId.trim() !== promptId) return null;
  if (/[\\/\s~^:@]/.test(promptId) || promptId.includes("..") || promptId.includes("@{")) {
    return null;
  }
  const tag = `hh-good-${promptId}`;
  if (isDangerousRef(tag)) return null;
  return tag;
}

function isDangerousRef(ref: string): boolean {
  if (ref.trim() === "") return true;
  const lower = ref.toLowerCase();
  if (MAIN_REFS.has(lower)) return true;
  if (lower.startsWith("origin/") || lower.startsWith("refs/remotes/")) return true;
  if (lower.includes("origin/main")) return true;
  if (/[~^]/.test(ref) || ref.includes("@{") || ref.includes("..") || ref.includes("\\")) return true;
  if (/\s/.test(ref) || /\bpush\b/i.test(ref)) return true;
  const parts = lower.split("/");
  const last = parts[parts.length - 1];
  if (last === undefined || last === "main" || last === "master" || last === "head") return true;
  return false;
}

function assertAttempt(attempt: number): void {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new TriageError("attempt starts at 1.");
  }
}

function assertRule(rule: number): asserts rule is 1 | 2 | 3 | 4 {
  if (rule !== 1 && rule !== 2 && rule !== 3 && rule !== 4) {
    throw new TriageError("rule must be 1, 2, 3, or 4.");
  }
}

function assertVerdict(verdict: string): asserts verdict is SensorVerdict {
  if (verdict === "ok" || verdict === "stall" || verdict === "crash" || verdict === "build-failed") {
    return;
  }
  throw new TriageError("verdict must be ok, stall, crash, or build-failed.");
}
