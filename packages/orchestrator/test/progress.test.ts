import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LockHeld, STATE_LOCK_NAME, loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { advance, ProgressError } from "../src/progress.ts";
import { loadQueue, saveQueue, type QueueFile, type QueueStatus } from "../src/queue-file.ts";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-progress-"));
}

function queueFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "queue.json");
}

function stateFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "STATE.md");
}

function item(
  id: string,
  status: QueueStatus,
  kind: "build" | "review" = "build",
): QueueFile["items"][number] {
  return { id, kind, status };
}

function sampleState(overrides: Partial<GuideState> = {}): GuideState {
  return {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId: "interview:DP-4.2",
    lastGoodCommit: "abc1234",
    blockers: ["hold the towel"],
    nextAction: "001",
    updatedAt: "2026-10-06T18:04:05.000Z",
    ...overrides,
  };
}

async function seed(
  projectDir: string,
  queue: QueueFile,
  state: GuideState | null = sampleState(),
): Promise<void> {
  await saveQueue(projectDir, queue);
  if (state !== null) await saveState(projectDir, state);
}

const SHA40 = "0123456789abcdef0123456789abcdef01234567";

test("a pass updates the queue and STATE together", async () => {
  const dir = tempProject();
  const started = Date.now();
  const queue: QueueFile = {
    items: [item("001", "running"), item("002", "queued", "review"), item("003", "queued")],
  };
  try {
    await seed(dir, queue);
    const result = await advance({
      projectDir: dir,
      finishedId: "001",
      outcome: "passed",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: "002" });
    assert.deepEqual(await loadQueue(dir), {
      items: [item("001", "passed"), item("002", "queued", "review"), item("003", "queued")],
    });
    const state = loadState(dir);
    assert.ok(state);
    assert.equal(state.phase, "Don't Panic");
    assert.equal(state.slice, "The Guide");
    assert.equal(state.promptId, "interview:DP-4.2");
    assert.equal(state.lastGoodCommit, "abc1234");
    assert.deepEqual(state.blockers, ["hold the towel"]);
    assert.equal(state.nextAction, "002");
    assert.ok(Date.parse(state.updatedAt) >= started - 1000);
    const names = readdirSync(path.join(dir, ".hitchhiker")).sort();
    assert.deepEqual(names, ["STATE.md", "queue.json"]);
    assert.equal(existsSync(path.join(dir, ".git")), false);
    const other = tempProject();
    try {
      await saveState(other, state);
      await saveQueue(other, {
        items: [item("001", "passed"), item("002", "queued", "review"), item("003", "queued")],
      });
      assert.equal(readFileSync(stateFile(dir), "utf8"), readFileSync(stateFile(other), "utf8"));
      assert.equal(readFileSync(queueFile(dir), "utf8"), readFileSync(queueFile(other), "utf8"));
      assert.equal(readFileSync(stateFile(dir), "utf8").includes("\r"), false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("passing the last item sets the next id null and the next action to Drive idle", async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      items: [item("001", "passed"), item("002", "running"), item("003", "escalated", "review")],
    });
    const result = await advance({
      projectDir: dir,
      finishedId: "002",
      outcome: "passed",
      commit: SHA40,
    });
    assert.deepEqual(result, { nextId: null });
    assert.equal(loadState(dir)?.nextAction, "Drive idle");
    assert.equal(loadState(dir)?.lastGoodCommit, SHA40);
    assert.equal(loadState(dir)?.promptId, "interview:DP-4.2");
    const loaded = await loadQueue(dir);
    assert.equal(loaded?.items[1]?.status, "passed");
    assert.equal(loaded?.items[2]?.status, "escalated");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the next action is the next queued id, skipping a fixing row", async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      items: [item("001", "running"), item("002", "fixing"), item("003", "queued")],
    });
    const result = await advance({
      projectDir: dir,
      finishedId: "001",
      outcome: "passed",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: "003" });
    assert.equal(loadState(dir)?.nextAction, "003");
    assert.equal((await loadQueue(dir))?.items[1]?.status, "fixing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an escalation appends a blocker and keeps the old good commit", async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      items: [item("001", "passed"), item("002", "running"), item("003", "queued")],
    });
    const before = readFileSync(stateFile(dir), "utf8");
    const result = await advance({
      projectDir: dir,
      finishedId: "002",
      outcome: "escalated",
      commit: "deadbee",
    });
    assert.deepEqual(result, { nextId: "003" });
    const state = loadState(dir);
    assert.ok(state);
    assert.equal(state.lastGoodCommit, "abc1234");
    assert.deepEqual(state.blockers, ["hold the towel", "002"]);
    assert.equal(state.nextAction, "001");
    assert.equal(state.promptId, "interview:DP-4.2");
    assert.equal(state.phase, "Don't Panic");
    assert.notEqual(readFileSync(stateFile(dir), "utf8"), before);
    assert.equal((await loadQueue(dir))?.items[1]?.status, "escalated");
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a second escalation appends again and does not clear blockers", async () => {
  const dir = tempProject();
  try {
    await seed(
      dir,
      { items: [item("002", "escalated"), item("004", "queued")] },
      sampleState({ blockers: ["hold the towel", "002"] }),
    );
    await advance({
      projectDir: dir,
      finishedId: "002",
      outcome: "escalated",
      commit: null,
    });
    assert.deepEqual(loadState(dir)?.blockers, ["hold the towel", "002", "002"]);
    assert.equal(loadState(dir)?.lastGoodCommit, "abc1234");
    assert.equal(loadState(dir)?.nextAction, "001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing STATE.md becomes a minimal guide state", async () => {
  const dir = tempProject();
  try {
    await seed(dir, { items: [item("014", "running"), item("015", "queued")] }, null);
    assert.equal(loadState(dir), null);
    const result = await advance({
      projectDir: dir,
      finishedId: "014",
      outcome: "passed",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: "015" });
    const state = loadState(dir);
    assert.deepEqual(state, {
      phase: "Improbability Drive",
      slice: "Eddie",
      promptId: "014",
      lastGoodCommit: "abc1234",
      blockers: [],
      nextAction: "015",
      updatedAt: state?.updatedAt,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("escalating with no prior state records the blocker and an empty good commit", async () => {
  const dir = tempProject();
  try {
    await seed(dir, { items: [item("014", "running")] }, null);
    const result = await advance({
      projectDir: dir,
      finishedId: "014",
      outcome: "escalated",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: null });
    const state = loadState(dir);
    assert.equal(state?.lastGoodCommit, "");
    assert.deepEqual(state?.blockers, ["014"]);
    assert.equal(state?.phase, "Improbability Drive");
    assert.equal(state?.slice, "Eddie");
    assert.equal(state?.promptId, "014");
    assert.equal(state?.nextAction, "014");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a null commit on a pass does not move lastGoodCommit", async () => {
  const dir = tempProject();
  try {
    await seed(dir, { items: [item("001", "running"), item("002", "queued")] });
    const result = await advance({
      projectDir: dir,
      finishedId: "001",
      outcome: "passed",
      commit: null,
    });
    assert.deepEqual(result, { nextId: "002" });
    assert.equal(loadState(dir)?.lastGoodCommit, "abc1234");
    assert.equal(loadState(dir)?.nextAction, "002");
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bad shas are rejected and neither file changes", async () => {
  const dir = tempProject();
  const bad = ["ABC1234", "abc123", "abcdefg", `${SHA40}a`, "", "abc1234\n", "not-a-sha"];
  try {
    await seed(dir, { items: [item("001", "running"), item("002", "queued")] });
    const queueBefore = readFileSync(queueFile(dir), "utf8");
    const stateBefore = readFileSync(stateFile(dir), "utf8");
    for (const commit of bad) {
      await assert.rejects(
        () =>
          advance({
            projectDir: dir,
            finishedId: "001",
            outcome: "passed",
            commit,
          }),
        (error: unknown) => {
          assert.ok(error instanceof ProgressError);
          assert.match(error.message, /sha/);
          return true;
        },
      );
    }
    assert.equal(readFileSync(queueFile(dir), "utf8"), queueBefore);
    assert.equal(readFileSync(stateFile(dir), "utf8"), stateBefore);
    const empty = tempProject();
    try {
      await assert.rejects(
        () =>
          advance({
            projectDir: empty,
            finishedId: "001",
            outcome: "escalated",
            commit: "ABC1234",
          }),
        ProgressError,
      );
      assert.equal(existsSync(stateFile(empty)), false);
      assert.equal(existsSync(queueFile(empty)), false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unknown id throws and leaves the queue and STATE", async () => {
  const dir = tempProject();
  try {
    await seed(dir, { items: [item("001", "running")] });
    const queueBefore = readFileSync(queueFile(dir), "utf8");
    const stateBefore = readFileSync(stateFile(dir), "utf8");
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "999",
          outcome: "passed",
          commit: "abc1234",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ProgressError);
        assert.match(error.message, /Unknown queue id/);
        return true;
      },
    );
    assert.equal(readFileSync(queueFile(dir), "utf8"), queueBefore);
    assert.equal(readFileSync(stateFile(dir), "utf8"), stateBefore);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STATE_LOCK_NAME)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing queue throws and does not create STATE.md", async () => {
  const dir = tempProject();
  try {
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "001",
          outcome: "passed",
          commit: "abc1234",
        }),
      /Queue file is missing/,
    );
    assert.equal(existsSync(stateFile(dir)), false);
    assert.equal(existsSync(queueFile(dir)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a paused queue throws until the drive is resumed", async () => {
  const dir = tempProject();
  try {
    await seed(dir, {
      items: [item("001", "running"), item("002", "paused", "review"), item("003", "queued")],
    });
    const queueBefore = readFileSync(queueFile(dir), "utf8");
    const stateBefore = readFileSync(stateFile(dir), "utf8");
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "001",
          outcome: "passed",
          commit: "abc1234",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ProgressError);
        assert.match(error.message, /paused/);
        assert.match(error.message, /Resume/);
        return true;
      },
    );
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "999",
          outcome: "escalated",
          commit: null,
        }),
      /Resume/,
    );
    assert.equal(readFileSync(queueFile(dir), "utf8"), queueBefore);
    assert.equal(readFileSync(stateFile(dir), "utf8"), stateBefore);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STATE_LOCK_NAME)), false);
    await saveQueue(dir, {
      items: [item("001", "running"), item("002", "queued", "review"), item("003", "queued")],
    });
    const result = await advance({
      projectDir: dir,
      finishedId: "001",
      outcome: "passed",
      commit: "abc1234",
    });
    assert.deepEqual(result, { nextId: "002" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a held state lock rejects advance before either file changes", async () => {
  const dir = tempProject();
  try {
    await seed(dir, { items: [item("001", "running"), item("002", "queued")] });
    const queueBefore = readFileSync(queueFile(dir), "utf8");
    const stateBefore = readFileSync(stateFile(dir), "utf8");
    writeFileSync(
      path.join(dir, ".hitchhiker", STATE_LOCK_NAME),
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "001",
          outcome: "passed",
          commit: "abc1234",
        }),
      (error: unknown) => error instanceof LockHeld,
    );
    assert.equal(readFileSync(queueFile(dir), "utf8"), queueBefore);
    assert.equal(readFileSync(stateFile(dir), "utf8"), stateBefore);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt queue JSON throws and stays on disk", async () => {
  const dir = tempProject();
  const raw = "{not json";
  try {
    await seed(dir, { items: [] });
    writeFileSync(queueFile(dir), raw, "utf8");
    const stateBefore = readFileSync(stateFile(dir), "utf8");
    await assert.rejects(
      () =>
        advance({
          projectDir: dir,
          finishedId: "001",
          outcome: "passed",
          commit: "abc1234",
        }),
      ProgressError,
    );
    assert.equal(readFileSync(queueFile(dir), "utf8"), raw);
    assert.equal(readFileSync(stateFile(dir), "utf8"), stateBefore);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("advance does not import a process runner", () => {
  const source = readFileSync(new URL("../src/progress.ts", import.meta.url), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("git "), false);
  assert.equal(source.includes("PROGRESS.md"), false);
  assert.equal(source.includes("saveState"), true);
  assert.equal(source.includes("loadState"), true);
  assert.equal(source.includes("withStateLock"), true);
});
