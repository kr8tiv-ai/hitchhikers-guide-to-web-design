import assert from "node:assert/strict";
import { mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { primeUtf8Cache, readUtf8Cached } from "../src/text-cache.ts";
import { removeTempDir } from "./remove-temp.ts";

test("a same-size rewrite is visible on the next cached read", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-text-cache-"));
  const file = path.join(dir, "note.txt");
  try {
    writeFileSync(file, "alpha-one");
    assert.equal(readUtf8Cached(file), "alpha-one");
    assert.equal(readUtf8Cached(file), "alpha-one");
    writeFileSync(file, "bravo-two");
    assert.equal(readUtf8Cached(file), "bravo-two");
    removeTempDir(file);
    assert.equal(readUtf8Cached(file), null);
  } finally {
    removeTempDir(dir);
  }
});

test("a same-size rewrite is visible when utimes restores the mtime", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-text-cache-racy-"));
  const file = path.join(dir, "note.txt");
  try {
    writeFileSync(file, "alpha-one");
    // A whole second is exact for utimes, and it is still inside the 2 s window.
    const stamp = new Date(Math.floor(Date.now() / 1000) * 1000);
    utimesSync(file, stamp, stamp);
    const original = statSync(file, { bigint: true });
    assert.equal(readUtf8Cached(file), "alpha-one");
    writeFileSync(file, "bravo-two");
    utimesSync(file, stamp, stamp);
    const restored = statSync(file, { bigint: true });
    assert.equal(restored.mtimeNs, original.mtimeNs);
    assert.equal(restored.size, original.size);
    assert.equal(readUtf8Cached(file), "bravo-two");
  } finally {
    removeTempDir(dir);
  }
});

test("a file older than the racy window stays cached when size and mtime match", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-text-cache-settled-"));
  const file = path.join(dir, "note.txt");
  try {
    writeFileSync(file, "alpha-one");
    const stamp = new Date(Date.now() - 5_000);
    utimesSync(file, stamp, stamp);
    const original = statSync(file, { bigint: true });
    assert.ok(BigInt(Date.now()) * 1_000_000n - original.mtimeNs > 2_000_000_000n);
    assert.equal(readUtf8Cached(file), "alpha-one");
    writeFileSync(file, "bravo-two");
    utimesSync(file, stamp, stamp);
    const restored = statSync(file, { bigint: true });
    assert.equal(restored.mtimeNs, original.mtimeNs);
    assert.equal(restored.size, original.size);
    assert.equal(readUtf8Cached(file), "alpha-one");
  } finally {
    removeTempDir(dir);
  }
});

test("an atomically primed file inside the racy window stays cached when size and mtime match", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-text-cache-primed-"));
  const file = path.join(dir, "note.txt");
  try {
    writeFileSync(file, "alpha-one");
    primeUtf8Cache(file, "alpha-one");
    assert.equal(readUtf8Cached(file), "alpha-one");
    writeFileSync(file, "bravo-two");
    primeUtf8Cache(file, "bravo-two");
    assert.equal(readUtf8Cached(file), "bravo-two");
  } finally {
    removeTempDir(dir);
  }
});
