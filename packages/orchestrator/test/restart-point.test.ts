import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadProjectFile, nextPromptId, saveProjectFile, saveState, type GuideState } from "@hitchhiker/engine";
import { advance } from "../src/progress.ts";
import { restartPointFromProjectFile } from "../src/restart.ts";
import { saveQueue, type QueueFile } from "../src/queue-file.ts";

function state(): GuideState {
  return {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId: "001",
    lastGoodCommit: "abc1234",
    blockers: [],
    nextAction: "001",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("nextPromptId is last_done plus one, and an empty value starts at 1", () => {
  assert.equal(nextPromptId(""), 1);
  assert.equal(nextPromptId("0"), 1);
  assert.equal(nextPromptId("001"), 2);
  assert.equal(nextPromptId("7"), 8);
  assert.equal(nextPromptId("182"), 183);
  assert.equal(nextPromptId("007"), 8);
  assert.equal(nextPromptId("not-a-number"), 1);
  assert.equal(nextPromptId("  12  "), 13);
});

test("restartPointFromProjectFile is last_done plus one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hh-restart-"));
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const queue: QueueFile = {
      items: [
        { id: "001", kind: "build", status: "passed" },
        { id: "002", kind: "build", status: "queued" },
      ],
    };
    await saveQueue(project, queue);
    await saveState(project, state());
    const saved = await saveProjectFile(project, {
      homeDir: home,
      to: path.join(home, "Towel.hhproject"),
      projectName: "Towel",
    });
    const loaded = await loadProjectFile(saved.filePath);
    assert.ok(loaded.file);
    assert.equal(loaded.file.queue.lastDone, "001");
    const point = await restartPointFromProjectFile(saved.filePath);
    assert.equal(point, nextPromptId(loaded.file.queue.lastDone));
    assert.equal(point, 2);

    const idle = path.join(root, "idle");
    await saveQueue(idle, { items: [{ id: "004", kind: "build", status: "queued" }] });
    await saveState(idle, state());
    const idleSaved = await saveProjectFile(idle, {
      homeDir: home,
      to: path.join(home, "Idle.hhproject"),
      projectName: "Idle",
    });
    const idlePoint = await restartPointFromProjectFile(idleSaved.filePath);
    assert.equal(idlePoint, 1);
    assert.equal(idlePoint, nextPromptId(""));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a completed build prompt autosaves last_done", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "hh-advance-save-"));
  const prior = process.env.HH_PROJECT_HOME;
  process.env.HH_PROJECT_HOME = path.join(project, ".hh-save-home");
  try {
    await saveQueue(project, {
      items: [
        { id: "001", kind: "build", status: "running" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await saveState(project, state());
    const result = await advance({
      projectDir: project,
      finishedId: "001",
      outcome: "passed",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: "002" });
    const home = path.join(project, ".hh-save-home");
    const names = readdirSync(home).filter((name) => name.endsWith(".hhproject") && !name.endsWith(".bak"));
    assert.equal(names.length, 1);
    const fileName = names[0];
    assert.ok(fileName !== undefined);
    const filePath = path.join(home, fileName);
    const loaded = await loadProjectFile(filePath);
    assert.equal(loaded.file?.queue.lastDone, "001");
    assert.equal(await restartPointFromProjectFile(filePath), nextPromptId("001"));
    const hitch = readdirSync(path.join(project, ".hitchhiker")).sort();
    assert.deepEqual(hitch, ["STATE.md", "queue.json"]);
  } finally {
    if (prior === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = prior;
    await rm(project, { recursive: true, force: true });
  }
});
