import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { defaultConfig } from "@hitchhiker/engine";
import { evaluateCommand } from "../src/policy.ts";
import { WorktreeError, resolveWorkdir } from "../src/worktrees.ts";

test("defaultConfig worktrees is false and resolveWorkdir returns the project dir", () => {
  const config = defaultConfig();
  assert.equal(config.worktrees, false);
  const projectDir = path.join(os.tmpdir(), "sites", "towel");
  const result = resolveWorkdir({
    projectDir,
    worktrees: config.worktrees,
    promptId: "012",
  });
  assert.equal(result.dir, projectDir);
  assert.equal(result.command, null);
});

test("worktrees true returns a git worktree add command and does not run it", () => {
  const stamp = randomUUID();
  const promptId = "101";
  const projectDir = path.join(os.tmpdir(), `hh-wt-parent-${stamp}`, "site");
  const result = resolveWorkdir({
    projectDir,
    worktrees: true,
    promptId,
  });
  const dir = path.join(path.dirname(projectDir), `.hh-wt-${promptId}`);
  const branch = `hh/wt-${promptId}`;
  assert.equal(result.dir, dir);
  assert.deepEqual(result.command, ["git", "worktree", "add", dir, "-b", branch]);
  assert.equal(path.relative(projectDir, result.dir).startsWith(".."), true);
  assert.equal(existsSync(projectDir), false);
  assert.equal(existsSync(result.dir), false);

  const command = result.command;
  assert.ok(command !== null);
  const decision = evaluateCommand({ argv: command, projectRoot: projectDir });
  assert.equal(decision.decision, "allow");
  assert.equal(command.includes("push"), false);
});

test("empty promptId throws", () => {
  const projectDir = path.join(os.tmpdir(), "sites", "towel");
  assert.throws(
    () => resolveWorkdir({ projectDir, worktrees: false, promptId: "" }),
    WorktreeError,
  );
  assert.throws(
    () => resolveWorkdir({ projectDir, worktrees: true, promptId: "   " }),
    WorktreeError,
  );
  assert.throws(
    () =>
      resolveWorkdir({
        projectDir,
        worktrees: false,
        promptId: null as unknown as string,
      }),
    WorktreeError,
  );
});

test("promptId with a slash throws", () => {
  const projectDir = path.join(os.tmpdir(), "sites", "towel");
  assert.throws(
    () => resolveWorkdir({ projectDir, worktrees: true, promptId: "101/extra" }),
    WorktreeError,
  );
  assert.throws(
    () => resolveWorkdir({ projectDir, worktrees: true, promptId: "101\\extra" }),
    WorktreeError,
  );
});

test("empty projectDir throws and a missing project dir is not created", () => {
  const projectDir = path.join(os.tmpdir(), `hh-wt-missing-${randomUUID()}`, "site");
  assert.equal(existsSync(projectDir), false);
  assert.throws(
    () => resolveWorkdir({ projectDir: "  ", worktrees: false, promptId: "101" }),
    WorktreeError,
  );
  const result = resolveWorkdir({ projectDir, worktrees: false, promptId: "101" });
  assert.equal(result.dir, projectDir);
  assert.equal(existsSync(projectDir), false);
  assert.equal(existsSync(path.dirname(projectDir)), false);
});
