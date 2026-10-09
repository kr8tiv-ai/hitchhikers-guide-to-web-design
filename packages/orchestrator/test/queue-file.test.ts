import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LockHeld, withStateLock } from "@hitchhiker/engine";
import { insertReviews } from "../src/schedule.ts";
import {
  QueueFileError,
  loadQueue,
  pauseQueue,
  saveQueue,
  type QueueFile,
  type QueueStatus,
} from "../src/queue-file.ts";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-queue-"));
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

const TWO: QueueFile = {
  items: [item("001", "queued"), item("002", "passed", "review")],
};

test("a two-item queue round-trips under the state lock", async () => {
  const dir = tempProject();
  try {
    assert.equal(await loadQueue(dir), null);
    assert.equal(existsSync(queueFile(dir)), false);
    await saveQueue(dir, TWO);
    const loaded = await loadQueue(dir);
    assert.deepEqual(loaded, TWO);
    const onDisk = JSON.parse(readFileSync(queueFile(dir), "utf8")) as QueueFile;
    assert.deepEqual(onDisk, TWO);
    assert.equal(readFileSync(queueFile(dir), "utf8").includes("!"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty items array round-trips and means the drive is not planned", async () => {
  const dir = tempProject();
  const empty: QueueFile = { items: [] };
  try {
    await saveQueue(dir, empty);
    assert.deepEqual(await loadQueue(dir), empty);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pause changes running to paused and leaves passed and escalated rows", () => {
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
  assert.equal(paused.items.length, queue.items.length);
  assert.deepEqual(
    paused.items.map((entry) => entry.status),
    ["passed", "paused", "escalated", "fixing", "queued", "paused", "paused"],
  );
  assert.deepEqual(
    paused.items.map((entry) => entry.id),
    queue.items.map((entry) => entry.id),
  );
  assert.equal(paused.items[0]?.status, "passed");
  assert.equal(paused.items[2]?.status, "escalated");
  assert.notEqual(paused.items[2]?.status, "queued");
});

test("pause then save keeps finished rows on disk", async () => {
  const dir = tempProject();
  const queue: QueueFile = {
    items: [
      item("001", "passed"),
      item("002", "running"),
      item("review-after-001", "escalated", "review"),
    ],
  };
  try {
    await saveQueue(dir, queue);
    await saveQueue(dir, pauseQueue(queue));
    const loaded = await loadQueue(dir);
    assert.deepEqual(loaded, {
      items: [
        item("001", "passed"),
        item("002", "paused"),
        item("review-after-001", "escalated", "review"),
      ],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt JSON throws and does not delete the file", async () => {
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

test("a queue with a bad shape throws and leaves the file", async () => {
  const dir = tempProject();
  const filePath = queueFile(dir);
  const raw = '{"items":[{"id":"001"}]}\n';
  try {
    await saveQueue(dir, { items: [] });
    writeFileSync(filePath, raw, "utf8");
    await assert.rejects(() => loadQueue(dir), /Queue item has an unknown field|Queue kind|Queue status/);
    assert.equal(readFileSync(filePath, "utf8"), raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("bad ids and secret-looking ids are rejected and not written", async () => {
  const dir = tempProject();
  const samples = ["Bad_Id", "001!", "API_KEY", "", "sk-abcdefghijklmnop", "xai-abcdefghijklmnop"];
  try {
    for (const id of samples) {
      const queue: QueueFile = { items: [item(id, "queued")] };
      await assert.rejects(() => saveQueue(dir, queue), QueueFileError);
      assert.throws(() => pauseQueue(queue), QueueFileError);
    }
    assert.equal(existsSync(queueFile(dir)), false);
    await assert.rejects(
      () => saveQueue(dir, { items: [item("sk-abcdefghijklmnop", "queued")] }),
      /secret/,
    );
    await assert.rejects(
      () => saveQueue(dir, { items: [item("Bad_Id", "queued")] }),
      /\/\^\[a-z0-9-\]\+\$\//,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("duplicate ids are rejected", async () => {
  const dir = tempProject();
  try {
    await assert.rejects(
      () =>
        saveQueue(dir, {
          items: [item("001", "queued"), item("001", "passed")],
        }),
      /Duplicate queue id/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scheduled reviews round-trip as queue rows with statuses", async () => {
  const dir = tempProject();
  const scheduled = insertReviews([
    { id: "001", phase: "dont-panic" },
    { id: "002", phase: "dont-panic" },
    { id: "003", phase: "dont-panic" },
  ]);
  const queue: QueueFile = {
    items: scheduled.map((entry, index) => ({
      id: entry.id,
      kind: entry.kind,
      status: index === 0 ? "passed" : "queued",
    })),
  };
  try {
    await saveQueue(dir, queue);
    const loaded = await loadQueue(dir);
    assert.deepEqual(loaded, queue);
    assert.equal(loaded?.items[0]?.kind, "build");
    assert.equal(loaded?.items[3]?.id, "review-after-003");
    assert.equal(loaded?.items[3]?.kind, "review");
    assert.equal(loaded?.items.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queue source uses the engine lock and does not start a runner", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "..", "..", "engine", "src", "queue-file.ts"),
    "utf8",
  );
  assert.match(source, /withStateLock/);
  assert.match(source, /replaceViaTemp/);
  assert.match(source, /Two saves serialize/);
  assert.match(source, /STATE\.md\.lock/);
  assert.match(source, /path\.join\(projectDir, "\.hitchhiker", "queue\.json"\)/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /spawn\(/);
  assert.doesNotMatch(source, /from ["'].*runner/);
  const barrel = readFileSync(
    path.join(import.meta.dirname, "..", "src", "queue-file.ts"),
    "utf8",
  );
  assert.match(barrel, /from "@hitchhiker\/engine"/);
  assert.doesNotMatch(barrel, /function saveQueue/);
  assert.doesNotMatch(barrel, /function loadQueue/);
  assert.doesNotMatch(barrel, /function pauseQueue/);
  assert.doesNotMatch(barrel, /child_process/);
  assert.doesNotMatch(barrel, /spawn\(/);
  assert.doesNotMatch(barrel, /from ["'].*runner/);
});
