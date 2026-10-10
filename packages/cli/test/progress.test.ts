import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { parseCli, runCli } from "../src/main.ts";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-progress-"));
}

function sample(promptId = "interview:DP-4.2"): GuideState {
  return {
    phase: "Don't Panic",
    slice: "Towel Check",
    promptId,
    lastGoodCommit: "abc123",
    blockers: ["waiting on the brief"],
    nextAction: "Answer DP-4.2.",
    updatedAt: "2026-10-06T18:04:05.000Z",
  };
}

test("parseCli reads progress, pause, and resume", () => {
  const project = path.join("sites", "towel");
  assert.deepEqual(parseCli(["progress", "--project", project]), { cmd: "progress", project });
  assert.deepEqual(parseCli(["resume", "--project", project]), { cmd: "resume", project });
  assert.deepEqual(parseCli(["pause", "--message", "Pick up the palette.", "--project", project]), {
    cmd: "pause",
    project,
    message: "Pick up the palette.",
  });
});

test("a missing project throws a usage string that names --project", () => {
  for (const argv of [["progress"], ["pause", "--message", "Later."], ["resume"], ["progress", "--project"]]) {
    assert.throws(
      () => parseCli(argv),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /--project/);
        return true;
      },
    );
  }
});

test("pause rejects an empty message and a newline", () => {
  const project = path.join("sites", "towel");
  assert.throws(() => parseCli(["pause", "--project", project]), /empty/);
  assert.throws(() => parseCli(["pause", "--project", project, "--message", ""]), /empty/);
  assert.throws(() => parseCli(["pause", "--project", project, "--message", "   "]), /empty/);
  assert.throws(
    () => parseCli(["pause", "--project", project, "--message", "keep going\n## Phase"]),
    /newline/,
  );
  assert.throws(
    () => parseCli(["pause", "--project", project, "--message", "keep going\r\n## Phase"]),
    /newline/,
  );
  assert.throws(() => parseCli(["pause", "--project", project, "--message", "## Injected"]), /heading/);
});

test("an unknown command still exits 2", async () => {
  const refused = await runCli(["sessions"]);
  assert.equal(refused.exitCode, 2);
  assert.equal(refused.stdout, "");
  assert.match(refused.stderr ?? "", /^  hh progress$/m);
  assert.match(refused.stderr ?? "", /^  \/hh-dont-panic$/m);
  assert.equal((refused.stderr ?? "").includes("!"), false);
  assert.equal((refused.stderr ?? "").includes("node:"), false);
});

test("progress prints the slice and exits 1 when state is missing", async () => {
  const dir = tempDir();
  try {
    const missing = await runCli(["progress", "--project", dir]);
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.stdout, "No project state yet.\n");

    const state = sample();
    await saveState(dir, state);
    const outcome = await runCli(["progress", "--project", dir]);
    assert.equal(outcome.exitCode, 0);
    assert.equal(
      outcome.stdout,
      ["phase: Don't Panic", "slice: Towel Check", "prompt: interview:DP-4.2", "next: Answer DP-4.2.", ""].join(
        "\n",
      ),
    );
    assert.equal(/\p{Extended_Pictographic}/u.test(outcome.stdout), false);
    assert.equal(outcome.stdout.includes("!"), false);
    assert.equal(readFileSync(path.join(dir, ".hitchhiker", "STATE.md"), "utf8").includes("Towel Check"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pause stores the message and resume does not rewrite STATE.md", async () => {
  const dir = tempDir();
  try {
    const state = sample("interview:DP-4.2");
    await saveState(dir, state);
    const filePath = path.join(dir, ".hitchhiker", "STATE.md");

    const paused = await runCli(["pause", "--project", dir, "--message", "Pick up the palette."]);
    assert.equal(paused.exitCode, 0);
    const loaded = loadState(dir);
    assert.ok(loaded);
    assert.equal(loaded.nextAction, "Pick up the palette.");
    assert.equal(loaded.promptId, "interview:DP-4.2");
    assert.equal(loaded.phase, "Don't Panic");
    assert.equal(loaded.slice, "Towel Check");
    assert.deepEqual(loaded.blockers, ["waiting on the brief"]);
    assert.notEqual(loaded.promptId, "DP-0.1");
    assert.equal(existsSync(path.join(dir, ".planning")), false);
    assert.equal(existsSync(path.join(dir, "Don't Panic")), false);
    assert.equal(existsSync(path.join(dir, "Babel Fish")), false);

    const before = readFileSync(filePath, "utf8");
    const mtime = statSync(filePath).mtimeMs;
    const resumed = await runCli(["resume", "--project", dir]);
    assert.equal(resumed.exitCode, 0);
    assert.equal(resumed.stdout, "resume: interview:DP-4.2\n");
    assert.equal(readFileSync(filePath, "utf8"), before);
    assert.equal(statSync(filePath).mtimeMs, mtime);
    assert.equal(loadState(dir)?.promptId, "interview:DP-4.2");
    assert.equal(loadState(dir)?.nextAction, "Pick up the palette.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume and pause do not invent state or start a session", async () => {
  const dir = tempDir();
  const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");
  const source = readFileSync(sourcePath, "utf8");
  try {
    const resumed = await runCli(["resume", "--project", dir]);
    assert.equal(resumed.exitCode, 1);
    assert.equal(resumed.stdout, "No project state yet.\n");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "STATE.md")), false);
    assert.equal(source.includes("spawnGrok"), false);
    assert.equal(source.includes("grok -p"), false);
    assert.equal(source.includes(".planning"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
