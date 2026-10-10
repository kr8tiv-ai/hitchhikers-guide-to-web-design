import { spawnSync } from "node:child_process";
import { assertGitAllowed } from "@hitchhiker/engine";
import { hiddenChildOptions } from "@hitchhiker/engine";

export interface GitText {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn git only after the whitelist accepts the arguments. */
export function runGit(cwd: string, args: readonly string[]): GitText {
  assertGitAllowed(args);
  const result = spawnSync("git", [...args], hiddenChildOptions({
    cwd,
    encoding: "utf8" as const,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  const stdout = typeof result.stdout === "string" ? result.stdout.replace(/\r\n/g, "\n") : "";
  let stderr = typeof result.stderr === "string" ? result.stderr.replace(/\r\n/g, "\n") : "";
  if (result.error !== undefined && stderr.length === 0) stderr = result.error.message;
  return { status: result.status, stdout, stderr };
}
