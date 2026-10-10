/**
 * Git refs for the project file. No shell string. A missing git is not an error.
 */

import { spawn } from "node:child_process";
import { hiddenChildOptions } from "../hidden-child.ts";
import type { ProjectGit } from "./schema.ts";
import { scrubText } from "./scrub.ts";

function runGit(projectDir: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["-C", projectDir, ...args],
      hiddenChildOptions({ stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] }),
    );
    let out = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      out += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) resolve(null);
      else {
        const text = out.trim();
        resolve(text.length > 0 ? text : null);
      }
    });
  });
}

export async function readGitRefs(projectDir: string, lastGoodCommit: string | null): Promise<ProjectGit> {
  const branch = await runGit(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === null) {
    return {
      present: false,
      branch: null,
      head: null,
      lastGoodCommit: lastGoodCommit && lastGoodCommit.length > 0 ? lastGoodCommit : null,
      remoteUrl: null,
    };
  }
  const head = await runGit(projectDir, ["rev-parse", "HEAD"]);
  const remote = await runGit(projectDir, ["remote", "get-url", "origin"]);
  return {
    present: true,
    branch: scrubText(branch),
    head: head === null ? null : scrubText(head),
    lastGoodCommit: lastGoodCommit && lastGoodCommit.length > 0 ? scrubText(lastGoodCommit) : null,
    remoteUrl: remote === null ? null : scrubText(remote),
  };
}

export async function gitMismatch(projectDir: string, recorded: ProjectGit): Promise<string | null> {
  const current = await readGitRefs(projectDir, recorded.lastGoodCommit);
  const sameBranch = recorded.branch === current.branch;
  const sameHead = recorded.head === current.head;
  if (sameBranch && sameHead) return null;
  if (!recorded.present && !current.present) return null;
  const repo = current.present
    ? `The repo is on ${current.branch ?? "an unknown branch"} at ${current.head ?? "an unknown commit"}.`
    : "This folder is not a git checkout.";
  const noted = recorded.present
    ? `The project file recorded ${recorded.branch ?? "an unknown branch"} at ${recorded.head ?? "an unknown commit"}.`
    : "The project file recorded no git ref.";
  return `${repo} ${noted} Nothing in the git tree was changed.`;
}
