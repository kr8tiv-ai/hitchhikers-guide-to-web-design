import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  LockHeld,
  QueueFileError,
  loadQueue,
  pauseQueue,
  saveQueue,
  withStateLock,
  type QueueFile,
  type QueueStatus,
} from "@hitchhiker/engine";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-engine-queue-"));
}

function queueFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "queue.json");
}

function item(
  id: string,
  status: QueueStatus,
  kind: "build" | "review" = "build",
): QueueFile["items"][number] {
  return { id, kind, status };
}

test("save and load round-trip, and a missing file returns null", async () => {
  const dir = tempProject();
  const queue: QueueFile = {
    items: [item("001", "queued"), item("002", "passed", "review")],
  };
  try {
    assert.equal(await loadQueue(dir), null);
    assert.equal(existsSync(queueFile(dir)), false);
    await saveQueue(dir, queue);
    assert.deepEqual(await loadQueue(dir), queue);
    const onDisk = JSON.parse(readFileSync(queueFile(dir), "utf8")) as QueueFile;
    assert.deepEqual(onDisk, queue);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt JSON throws and is left in place", async () => {
  const dir = tempProject();
  const filePath = queueFile(dir);
  const raw = "{not json";
  try {
    await saveQueue(dir, { items: [] });
    writeFileSync(filePath, raw, "utf8");
    await assert.rejects(() => loadQueue(dir), QueueFileError);
    assert.equal(readFileSync(filePath, "utf8"), raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pauseQueue flips only running rows", () => {
  const queue: QueueFile = {
    items: [
      item("001", "passed"),
      item("002", "running"),
      item("003", "escalated", "review"),
      item("004", "fixing"),
      item("005", "queued"),
      item("006", "paused", "review"),
      item("007", "running"),
    ],
  };
  const before = structuredClone(queue);
  const paused = pauseQueue(queue);
  assert.deepEqual(queue, before);
  assert.deepEqual(
    paused.items.map((entry) => entry.status),
    ["passed", "paused", "escalated", "fixing", "queued", "paused", "paused"],
  );
  assert.deepEqual(
    paused.items.map((entry) => entry.id),
    queue.items.map((entry) => entry.id),
  );
});

test("a second save is refused while the state lock is held", async () => {
  const dir = tempProject();
  try {
    await withStateLock(dir, async () => {
      await assert.rejects(
        () => saveQueue(dir, { items: [] }),
        (error: unknown) => error instanceof LockHeld,
      );
    });
    assert.equal(existsSync(queueFile(dir)), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
