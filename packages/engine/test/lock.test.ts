import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  LockHeld,
  STALE_LOCK_MS,
  acquire,
  release,
  withStateLock,
} from "../src/lock.ts";
import { LockHeld as LockHeldFromIndex } from "../src/index.ts";

const DEAD_PID = 2147483646;

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-lock-"));
}

function writeLock(lockPath: string, pid: number, acquiredAt: string): void {
  writeFileSync(lockPath, `${JSON.stringify({ pid, acquiredAt })}\n`, "utf8");
}

test("a live lock blocks a second acquire", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, "state.lock");
  try {
    const held = await acquire(lockPath);
    assert.equal(held.pid, process.pid);
    assert.equal(LockHeldFromIndex, LockHeld);
    await assert.rejects(
      () => acquire(lockPath),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, process.pid);
        return true;
      },
    );
    await release(lockPath, held.pid);
    assert.equal(existsSync(lockPath), false);
    const again = await acquire(lockPath);
    assert.equal(again.pid, process.pid);
    await release(lockPath, again.pid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two acquires at once: the second sees LockHeld", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, "state.lock");
  try {
    const results = await Promise.allSettled([
      acquire(lockPath),
      acquire(lockPath),
    ]);
    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    const failure = lost[0];
    assert.ok(failure !== undefined && failure.status === "rejected");
    assert.ok(failure.reason instanceof LockHeld);
    const success = won[0];
    assert.ok(success !== undefined && success.status === "fulfilled");
    await release(lockPath, success.value.pid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a dead lock older than 30s is taken over once", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, "state.lock");
  const start = Date.parse("2026-10-06T00:00:00.000Z");
  try {
    writeLock(lockPath, DEAD_PID, new Date(start).toISOString());
    await assert.rejects(
      () => acquire(lockPath, () => start + STALE_LOCK_MS),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, DEAD_PID);
        return true;
      },
    );
    const taken = await acquire(lockPath, () => start + STALE_LOCK_MS + 1);
    assert.equal(taken.pid, process.pid);
    assert.equal(taken.acquiredAt, new Date(start + STALE_LOCK_MS + 1).toISOString());
    const stored = JSON.parse(readFileSync(lockPath, "utf8")) as {
      pid: number;
    };
    assert.equal(stored.pid, process.pid);
    await release(lockPath, taken.pid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a young dead lock is not stolen", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, "state.lock");
  const now = Date.parse("2026-10-06T00:00:00.000Z");
  try {
    writeLock(lockPath, DEAD_PID, new Date(now).toISOString());
    await assert.rejects(
      () => acquire(lockPath, () => now),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, DEAD_PID);
        return true;
      },
    );
    const stored = JSON.parse(readFileSync(lockPath, "utf8")) as {
      pid: number;
    };
    assert.equal(stored.pid, DEAD_PID);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withStateLock releases the lock when the writer throws", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, ".hitchhiker", "state.lock");
  try {
    await assert.rejects(
      () =>
        withStateLock(dir, () => {
          assert.equal(existsSync(lockPath), true);
          throw new Error("writer failed");
        }),
      /writer failed/,
    );
    assert.equal(existsSync(lockPath), false);

    await assert.rejects(
      () =>
        withStateLock(dir, async () => {
          throw new Error("async failed");
        }),
      /async failed/,
    );
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release deletes the lock only when the pid still matches", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, "state.lock");
  try {
    const held = await acquire(lockPath);
    writeLock(lockPath, DEAD_PID, held.acquiredAt);
    await release(lockPath, held.pid);
    assert.equal(existsSync(lockPath), true);
    const stored = JSON.parse(readFileSync(lockPath, "utf8")) as {
      pid: number;
    };
    assert.equal(stored.pid, DEAD_PID);
    await release(lockPath, DEAD_PID);
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
