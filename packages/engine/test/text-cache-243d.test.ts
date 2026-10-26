import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readUtf8Cached } from "../src/text-cache.ts";
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
