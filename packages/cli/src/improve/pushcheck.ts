import { spawnSync } from "node:child_process";
import { hiddenChildOptions, NORMAL_PUSH_ARGS, assertSupervisorGit, decidePushVerify } from "@hitchhiker/engine";
import { detectHook } from "./hooks.ts";

export interface GitText {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type GitRunner = (cwd: string, args: readonly string[]) => GitText;

const HEX_COMMIT = /^[0-9a-f]{40}$/;

/** Spawn git only after the supervisor whitelist accepts the arguments. */
export function runSupervisorGit(cwd: string, args: readonly string[]): GitText {
  assertSupervisorGit(args);
  const result = spawnSync("git", [...args], hiddenChildOptions({
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  const stdout = typeof result.stdout === "string" ? result.stdout.replace(/\r\n/g, "\n") : "";
  let stderr = typeof result.stderr === "string" ? result.stderr.replace(/\r\n/g, "\n") : "";
  if (result.error !== undefined && stderr.length === 0) stderr = result.error.message;
  return { status: result.status, stdout, stderr };
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
  let ancestorExit = 1;
  let forceRefused = false;
  try {
    const push = run(cwd, [...NORMAL_PUSH_ARGS]);
    chunks.push(push.stdout, push.stderr);
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
