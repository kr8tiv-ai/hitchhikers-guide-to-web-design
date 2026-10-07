/**
 * Directory a prompt should run in.
 *
 * `worktrees` is the boolean on GuideConfig. defaultConfig() leaves it false,
 * so the prompt stays in the project directory until config opts in.
 * When it is true, this returns a sibling path and the argv
 * `git worktree add <dir> -b <branch>`. It does not spawn git and does not
 * create the directory. The branch name follows the hh/backup-* pattern:
 * `hh/wt-<promptId>`.
 */

import path from "node:path";

export class WorktreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeError";
  }
}

export function resolveWorkdir(input: {
  projectDir: string;
  worktrees: boolean;
  promptId: string;
}): { dir: string; command: string[] | null } {
  const projectDir = readProjectDir(input.projectDir);
  const promptId = readPromptId(input.promptId);
  if (typeof input.worktrees !== "boolean") {
    throw new WorktreeError("worktrees must be a boolean.");
  }
  if (input.worktrees !== true) {
    return { dir: projectDir, command: null };
  }
  const dir = path.join(path.dirname(projectDir), `.hh-wt-${promptId}`);
  const branch = `hh/wt-${promptId}`;
  return {
    dir,
    command: ["git", "worktree", "add", dir, "-b", branch],
  };
}

function readProjectDir(projectDir: string): string {
  if (typeof projectDir !== "string" || projectDir.trim() === "") {
    throw new WorktreeError("projectDir is empty.");
  }
  return projectDir;
}

function readPromptId(promptId: string): string {
  if (typeof promptId !== "string" || promptId.trim() === "") {
    throw new WorktreeError("promptId is empty.");
  }
  if (promptId.includes("/") || promptId.includes("\\")) {
    throw new WorktreeError("promptId must not contain a slash.");
  }
  return promptId;
}
