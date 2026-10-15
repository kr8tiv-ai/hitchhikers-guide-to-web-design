/**
 * BUG-042: a queue-wide pause blocks advance even when no row says paused.
 * Resume clears the flag. The rows stay as they were when none were paused.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { saveState, type GuideState } from "@hitchhiker/engine";
import { advance, ProgressError } from "../src/progress.ts";
import { loadQueue, pauseQueue, resumeQueue, saveQueue, type QueueFile } from "../src/queue-file.ts";

const WHEN = "2026-10-15T12:00:00.000Z";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-pause-237-"));
}

test("a queue-wide pause survives a reload and blocks advance until resume", async () => {
  const dir = tempProject();
  const queue: QueueFile = {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "002", kind: "build", status: "queued" },
    ],
  };
  const state: GuideState = {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId: "interview:DP-4.2",
    lastGoodCommit: "abc1234",
    blockers: [],
    nextAction: "002",
    updatedAt: WHEN,
  };
  try {
    await saveQueue(dir, pauseQueue(queue, new Date(WHEN)));
    const loaded = await loadQueue(dir);
    assert.deepEqual(loaded?.pause, { at: WHEN, after: "001" });
    assert.equal(loaded?.items[1]?.status, "queued");
    await saveState(dir, state);
    await assert.rejects(
      () => advance({ projectDir: dir, finishedId: "001", outcome: "passed", commit: "abc1234" }),
      (error: unknown) => error instanceof ProgressError && /paused/.test(error.message),
    );
    const cleared = resumeQueue(loaded ?? { items: [] });
    assert.equal(cleared.pause, undefined);
    assert.equal(cleared.items[1]?.status, "queued");
    await saveQueue(dir, cleared);
    const again = await loadQueue(dir);
    assert.equal(again?.pause, undefined);
    const result = await advance({ projectDir: dir, finishedId: "001", outcome: "passed", commit: "abc1234" });
    assert.deepEqual(result, { nextId: "002" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
