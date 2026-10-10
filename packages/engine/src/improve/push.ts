/**
 * Push rules for the supervisor. The improve loop's git whitelist still
 * rejects every push. This module allows one normal push and nothing else.
 */

import { assertGitAllowed } from "./policy.ts";

const HEX_COMMIT = /^[0-9a-f]{40}$/;

export const NORMAL_PUSH_ARGS = ["push", "origin", "main"] as const;

export interface PushVerifyInput {
  pushExit: number;
  ancestorExit: number;
  forceRefused: boolean;
}

/** A kept commit counts as pushed only when both checks exit 0. */
export function decidePushVerify(input: PushVerifyInput): "pushed" | "failed" {
  if (input.forceRefused) return "failed";
  if (!Number.isFinite(input.pushExit) || input.pushExit !== 0) return "failed";
  if (!Number.isFinite(input.ancestorExit) || input.ancestorExit !== 0) return "failed";
  return "pushed";
}

/** Force flags and a leading + refspec. Null when the list is a normal push. */
export function forceMarker(args: readonly string[]): string | null {
  for (const arg of args) {
    if (arg === "--force" || arg === "-f" || arg === "--force-with-lease") return arg;
    if (arg.startsWith("--force=") || arg.startsWith("--force-with-lease=")) return arg;
    if (arg.includes("+refs") || arg.startsWith("+")) return "+refs";
  }
  return null;
}

export function usesNoVerify(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--no-verify" || arg.includes("--no-verify"));
}

/** Only `git push origin main`, with no force flag and no + refspec. */
export function assertNormalPush(args: readonly string[]): void {
  const marker = forceMarker(args);
  if (marker !== null) throw new Error(`Refusing force push (${marker}).`);
  if (
    args.length !== NORMAL_PUSH_ARGS.length ||
    args.some((arg, index) => arg !== NORMAL_PUSH_ARGS[index])
  ) {
    throw new Error("Only git push origin main is allowed.");
  }
}

/**
 * Git argv the supervisor may spawn. Push is the one normal form.
 * Fetch and the ancestor check are the verification that follows it.
 * Every other form still has to pass the improve-loop whitelist.
 */
export function assertSupervisorGit(args: readonly string[]): void {
  if (usesNoVerify(args)) throw new Error("Refusing --no-verify.");
  const marker = forceMarker(args);
  if (marker !== null) throw new Error(`Refusing force push (${marker}).`);
  const [cmd, ...rest] = args;
  if (cmd === "push") {
    assertNormalPush(args);
    return;
  }
  if (cmd === "fetch" && rest.length === 2 && rest[0] === "origin" && rest[1] === "main") return;
  if (
    cmd === "merge-base" &&
    rest.length === 3 &&
    rest[0] === "--is-ancestor" &&
    HEX_COMMIT.test(rest[1] ?? "") &&
    rest[2] === "origin/main"
  ) {
    return;
  }
  assertGitAllowed(args);
}
