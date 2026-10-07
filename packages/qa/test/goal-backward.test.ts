import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkTruths } from "../src/goal-backward.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const HERO = "Hero headline is visible at 375px.";
const MOTION = "Reduced motion keeps the headline still.";
const LONG_NOTE = "Seen above the fold in the 375px shot.";

test("one evidenced truth is FOUND and one without evidence is MISSING", () => {
  const rows = checkTruths(
    [HERO, MOTION],
    [{ truth: HERO, note: LONG_NOTE }],
  );
  assert.deepEqual(rows, [
    { truth: HERO, status: "FOUND" },
    { truth: MOTION, status: "MISSING" },
  ]);
});

test("a short note does not count", () => {
  const rows = checkTruths([HERO], [{ truth: HERO, note: "ok" }]);
  assert.deepEqual(rows, [{ truth: HERO, status: "MISSING" }]);
});

test("an empty note does not count", () => {
  const rows = checkTruths([HERO], [{ truth: HERO, note: "" }]);
  assert.deepEqual(rows, [{ truth: HERO, status: "MISSING" }]);
});

test("nine characters are MISSING and ten are FOUND", () => {
  const nine = checkTruths([HERO], [{ truth: HERO, note: "123456789" }]);
  const ten = checkTruths([HERO], [{ truth: HERO, note: "1234567890" }]);
  assert.equal(nine[0]?.status, "MISSING");
  assert.equal(ten[0]?.status, "FOUND");
});

test("a later real note finds a truth a short note missed", () => {
  const rows = checkTruths(
    [HERO],
    [
      { truth: HERO, note: "ok" },
      { truth: HERO, note: LONG_NOTE },
    ],
  );
  assert.equal(rows[0]?.status, "FOUND");
});

test("whitespace differences fail the match", () => {
  const rows = checkTruths(
    [HERO],
    [
      { truth: `${HERO} `, note: LONG_NOTE },
      { truth: HERO.replace("headline", "headline "), note: LONG_NOTE },
      { truth: HERO.toLowerCase(), note: LONG_NOTE },
    ],
  );
  assert.deepEqual(rows, [{ truth: HERO, status: "MISSING" }]);
});

test("evidence for an unknown truth adds no row", () => {
  const rows = checkTruths(
    [HERO, MOTION],
    [
      { truth: "Some other claim the prompt never made.", note: LONG_NOTE },
      { truth: MOTION, note: LONG_NOTE },
    ],
  );
  assert.deepEqual(rows, [
    { truth: HERO, status: "MISSING" },
    { truth: MOTION, status: "FOUND" },
  ]);
});

test("a green test name is not implied evidence", () => {
  const rows = checkTruths(
    [HERO, MOTION],
    [{ truth: "pnpm test passed", note: "The suite is green and coverage is 100 percent." }],
  );
  assert.deepEqual(rows, [
    { truth: HERO, status: "MISSING" },
    { truth: MOTION, status: "MISSING" },
  ]);
});

test("empty truths throw", () => {
  assert.throws(
    () => checkTruths([], [{ truth: HERO, note: LONG_NOTE }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /empty/);
      assert.match(err.message, /must_haves/);
      return true;
    },
  );
});

test("duplicate truths throw", () => {
  assert.throws(
    () => checkTruths([HERO, MOTION, HERO], [{ truth: HERO, note: LONG_NOTE }]),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Duplicate truth/);
      assert.match(err.message, /Hero headline is visible at 375px\./);
      return true;
    },
  );
});

test("the checker source does not launch a process or open the network", () => {
  const source = readFileSync(path.join(here, "..", "src", "goal-backward.ts"), "utf8");
  assert.equal(source.includes("checkTruths"), true);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /node:fs|node:http|node:https|node:net/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
