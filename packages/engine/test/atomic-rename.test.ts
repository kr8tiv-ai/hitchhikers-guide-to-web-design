import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rename as renameFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RENAME_ATTEMPTS,
  RENAME_BACKOFF_MS,
  renameReplacing,
  withExclusiveFile,
} from "../src/atomic-rename.ts";
import { replaceViaTemp } from "../src/lock.ts";

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(`${code}: rename failed`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

test("rename backoff stays under one second", () => {
  const total = RENAME_BACKOFF_MS.reduce((sum, ms) => sum + ms, 0);
  assert.equal(RENAME_ATTEMPTS, 5);
  assert.equal(RENAME_BACKOFF_MS.length, RENAME_ATTEMPTS - 1);
  assert.ok(total < 1000);
  assert.ok(total > 0);
});

test("renameReplacing retries EPERM on the first N attempts and then replaces the file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-rename-retry-"));
  try {
    for (const failures of [1, 3, RENAME_ATTEMPTS - 1]) {
      const from = path.join(dir, `from-${failures}.txt`);
      const to = path.join(dir, `to-${failures}.txt`);
      writeFileSync(from, `body-${failures}`);
      writeFileSync(to, "old");
      let calls = 0;
      const waits: number[] = [];
      await renameReplacing(from, to, {
        async rename(source, dest) {
          calls += 1;
          if (calls <= failures) throw errno("EPERM");
          await renameFile(source, dest);
        },
        async sleep(ms) {
          waits.push(ms);
        },
      });
      assert.equal(calls, failures + 1);
      assert.deepEqual(waits, RENAME_BACKOFF_MS.slice(0, failures));
      assert.equal(readFileSync(to, "utf8"), `body-${failures}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a permanent EPERM stops at the attempt cap and ENOENT does not retry", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-rename-cap-"));
  try {
    const from = path.join(dir, "from.txt");
    const to = path.join(dir, "to.txt");
    writeFileSync(from, "kept");
    let eperm = 0;
    const waits: number[] = [];
    await assert.rejects(
      () =>
        renameReplacing(from, to, {
          rename() {
            eperm += 1;
            return Promise.reject(errno("EPERM"));
          },
          async sleep(ms) {
            waits.push(ms);
          },
        }),
      (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === "EPERM",
    );
    assert.equal(eperm, RENAME_ATTEMPTS);
    assert.deepEqual(waits, [...RENAME_BACKOFF_MS]);
    assert.equal(readFileSync(from, "utf8"), "kept");

    let enoent = 0;
    await assert.rejects(
      () =>
        renameReplacing(from, to, {
          rename() {
            enoent += 1;
            return Promise.reject(errno("ENOENT"));
          },
          sleep() {
            return Promise.reject(new Error("ENOENT must not sleep"));
          },
        }),
      (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT",
    );
    assert.equal(enoent, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("EACCES and EBUSY retry once, then the rename replaces the file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-rename-codes-"));
  try {
    for (const code of ["EACCES", "EBUSY"]) {
      const from = path.join(dir, `from-${code}.txt`);
      const to = path.join(dir, `to-${code}.txt`);
      writeFileSync(from, code);
      writeFileSync(to, "old");
      let calls = 0;
      await renameReplacing(from, to, {
        async rename(source, dest) {
          calls += 1;
          if (calls === 1) throw errno(code);
          await renameFile(source, dest);
        },
        async sleep() {
          return undefined;
        },
      });
      assert.equal(calls, 2);
      assert.equal(readFileSync(to, "utf8"), code);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replaceViaTemp queues the target, closes the handle, then retries the rename", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/lock.ts", import.meta.url)), "utf8");
  const queue = source.indexOf("withExclusiveFile(targetPath");
  const write = source.indexOf("writeClosedTemp(tempPath");
  const rename = source.indexOf("renameReplacing(tempPath, targetPath)");
  assert.ok(queue > 0);
  assert.ok(write > queue);
  assert.ok(rename > write);
});

test("two replaceViaTemp calls on one file both finish and leave a whole body", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-rename-queue-"));
  try {
    const target = path.join(dir, "DECISIONS.md");
    await Promise.all([replaceViaTemp(target, "one\n"), replaceViaTemp(target, "two\n")]);
    const text = readFileSync(target, "utf8");
    assert.ok(text === "one\n" || text === "two\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withExclusiveFile runs a later writer only after the earlier one finishes", async () => {
  const target = path.join(os.tmpdir(), `hh-exclusive-${process.pid}.txt`);
  let releaseHold: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  let phase = "idle";
  let firstDone: Promise<void> = Promise.resolve();
  try {
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    firstDone = withExclusiveFile(target, async () => {
      phase = "first";
      started();
      await hold;
      phase = "first-done";
    });
    await ready;
    let sawFirst = false;
    const second = withExclusiveFile(target, async () => {
      sawFirst = phase === "first-done";
      phase = "second";
    });
    await Promise.resolve();
    assert.equal(phase, "first");
    releaseHold();
    await firstDone;
    await second;
    assert.equal(sawFirst, true);
    assert.equal(phase, "second");
  } finally {
    releaseHold();
    await firstDone.catch(() => undefined);
  }
});
