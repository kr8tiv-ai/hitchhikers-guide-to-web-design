import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const qaRoot = path.resolve(here, "..");

const TEST_SCRIPT =
  "node --experimental-strip-types --test test/**/*.test.ts && node --experimental-strip-types --test --test-concurrency=1 test-serial/*.test.ts";

const MOVED = ["a dead preview fails closed", "the starter fixture clears the real phone gates"] as const;

const BANNED = [".skip(", "skip:", ".todo(", "todo:", ".only(", "only:", "process.env.CI"] as const;

test("the qa test script runs the parallel files, then the phone gate alone", () => {
  const parsed: unknown = JSON.parse(readFileSync(path.join(qaRoot, "package.json"), "utf8"));
  assert.ok(parsed !== null && typeof parsed === "object" && "scripts" in parsed);
  const scripts = parsed.scripts;
  assert.ok(scripts !== null && typeof scripts === "object" && "test" in scripts);
  const testScript = scripts.test;
  assert.equal(testScript, TEST_SCRIPT);
  const parts = TEST_SCRIPT.split("&&").map((part) => part.trim());
  assert.equal(parts.length, 2);
  assert.equal(parts[0]?.endsWith("test/**/*.test.ts"), true);
  assert.equal(parts[1]?.endsWith("--test-concurrency=1 test-serial/*.test.ts"), true);
  assert.ok(TEST_SCRIPT.indexOf("test/**/*.test.ts") < TEST_SCRIPT.indexOf("--test-concurrency=1 test-serial/*.test.ts"));
});

test("the serial phone gate keeps the starter name, the floor of 90, and no skip", () => {
  const serial = readFileSync(path.join(qaRoot, "test-serial", "real-phone-gate.test.ts"), "utf8");
  assert.match(serial, /the starter fixture clears the real phone gates/);
  assert.match(serial, />= 90/);
  for (const token of BANNED) assert.equal(serial.includes(token), false, token);
});

test("the real phone tests run once per pnpm -r test", () => {
  const live = readFileSync(path.join(here, "live-gates.test.ts"), "utf8");
  const serial = readFileSync(path.join(qaRoot, "test-serial", "real-phone-gate.test.ts"), "utf8");
  for (const name of MOVED) {
    assert.equal(live.includes(name), false, name);
    assert.equal(serial.includes(name), true, name);
  }
});

/**
 * numberOfRuns 3, formFactor mobile, throttlingMethod simulate, and the 0.9
 * performance minScore are already asserted by live-gates.test.ts
 * ("the lighthouse config keeps three mobile runs at 90"). This test only
 * checks that owner is still there.
 */
test("the lighthouse config test still keeps three mobile runs at 90", () => {
  const live = readFileSync(path.join(here, "live-gates.test.ts"), "utf8");
  const name = 'test("the lighthouse config keeps three mobile runs at 90"';
  const start = live.indexOf(name);
  assert.ok(start >= 0);
  const next = live.indexOf("\n  test(", start + name.length);
  const body = live.slice(start, next === -1 ? live.length : next);
  assert.match(body, /lhciCollectConfig\(/);
  assert.match(body, /numberOfRuns/);
  assert.match(body, /\b3\b/);
  assert.match(body, /formFactor/);
  assert.match(body, /"mobile"/);
  assert.match(body, /throttlingMethod/);
  assert.match(body, /"simulate"/);
  assert.match(body, /minScore/);
  assert.match(body, /0\.9/);
  assert.match(body, /"performance"/);
});
