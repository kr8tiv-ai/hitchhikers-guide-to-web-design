/**
 * BUG-068. The queue id check uses the same boundary as the project-file scrubber.
 * Ordinary words are not secrets. A token after a non-letter still is.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SECRET_PATTERN as enginePattern } from "@hitchhiker/engine";
import { SECRET_PATTERN } from "../src/progress.ts";

test("SECRET_PATTERN matches the project-file scrubber and ignores ordinary words", () => {
  assert.equal(SECRET_PATTERN.source, enginePattern.source);
  assert.equal(SECRET_PATTERN.flags, enginePattern.flags);
  assert.equal(SECRET_PATTERN.test("c:\\users\\lucid\\desktop\\desk-e2e-run11\\site"), false);
  assert.equal(SECRET_PATTERN.test("task-12345678"), false);
  assert.equal(SECRET_PATTERN.test("kiosk-abcdefgh"), false);
  assert.equal(SECRET_PATTERN.test("desk-e2e-run11"), false);
  assert.equal(SECRET_PATTERN.test("sk-abcdefgh12345"), true);
  assert.equal(SECRET_PATTERN.test("xai-abcdefgh1234"), true);
  assert.equal(SECRET_PATTERN.test("key=sk-abcdefgh12345"), true);
});
