import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyRun, type SensorEvent } from "../src/sensors.ts";

function json(t: number, text = "{}"): SensorEvent {
  return { t, kind: "json", text };
}

function log(t: number, text: string): SensorEvent {
  return { t, kind: "log", text };
}

function exit(t: number, code: number, text?: string): SensorEvent {
  if (text === undefined) return { t, kind: "exit", code };
  return { t, kind: "exit", code, text };
}

test("a json event at t=0 is ok at 119 seconds and at exactly 120 seconds", () => {
  const events = [json(0)];
  assert.equal(classifyRun(events, 0), "ok");
  assert.equal(classifyRun(events, 119_000), "ok");
  assert.equal(classifyRun(events, 120_000), "ok");
});

test("a json event at t=0 with no exit stalls once the gap is older than 120 seconds", () => {
  const events = [json(0)];
  assert.equal(classifyRun(events, 120_001), "stall");
  assert.equal(classifyRun(events, 121_000), "stall");
});

test("an empty stream is ok at the start and stalls after 120 seconds", () => {
  assert.equal(classifyRun([], 0), "ok");
  assert.equal(classifyRun([], 120_000), "ok");
  assert.equal(classifyRun([], 120_001), "stall");
});

test("the stall clock follows the last json event, so a long healthy run stays ok", () => {
  const events = [json(0, "first"), json(500_000, "latest")];
  assert.equal(classifyRun(events, 500_000 + 120_000), "ok");
  assert.equal(classifyRun(events, 500_000 + 120_001), "stall");
});

test("a log line does not refresh the json clock", () => {
  const events = [json(0), log(121_000, "still writing the hero")];
  assert.equal(classifyRun(events, 121_000), "stall");
});

test("the latest exit by time is the status of the run", () => {
  assert.equal(
    classifyRun(
      [
        { t: 40, kind: "exit", code: 0 },
        { t: 10, kind: "exit", code: 1 },
      ],
      40,
    ),
    "ok",
  );
  assert.equal(
    classifyRun(
      [
        { t: 10, kind: "exit", code: 0 },
        { t: 40, kind: "exit", code: 1, text: "error TS2322" },
      ],
      40,
    ),
    "build-failed",
  );
});

test("events out of time order are sorted and the caller array stays put", () => {
  const events = [json(200_000, "latest"), json(0, "earliest")];
  assert.equal(classifyRun(events, 200_000 + 119_000), "ok");
  assert.equal(classifyRun(events, 200_000 + 121_000), "stall");
  assert.deepEqual(
    events.map((event) => event.t),
    [200_000, 0],
  );
});

test("exit code 1 without a build pattern is a crash", () => {
  assert.equal(classifyRun([json(0), exit(10, 1)], 10), "crash");
  assert.equal(classifyRun([exit(1, 2)], 1), "crash");
  assert.equal(classifyRun([json(10), exit(5, 1)], 10), "crash");
  assert.equal(classifyRun([{ t: 1, kind: "exit" }], 1), "crash");
});

test("a TypeScript error with a non-zero exit is build-failed, which outranks a crash", () => {
  assert.equal(
    classifyRun([log(1, "src/hero.ts(3,1): error TS2322: Type 'string' is not assignable."), exit(2, 1)], 2),
    "build-failed",
  );
  assert.equal(
    classifyRun([exit(8, 1), log(2, "error TS2322")], 8),
    "build-failed",
  );
  assert.equal(
    classifyRun([json(3, "{\"output\":\"error TS2322\"}"), exit(4, 1)], 4),
    "build-failed",
  );
});

test("FAIL and AssertionError outrank a generic crash", () => {
  assert.equal(classifyRun([log(1, "FAIL test/hero.test.ts"), exit(2, 1)], 2), "build-failed");
  assert.equal(
    classifyRun([exit(2, 1, "AssertionError: expected 1 to equal 2")], 2),
    "build-failed",
  );
});

test("lowercase fail and the word failed do not count as a build failure", () => {
  assert.equal(classifyRun([log(1, "fail the vibe check"), exit(2, 1)], 2), "crash");
  assert.equal(classifyRun([log(1, "failed to parse"), exit(2, 1)], 2), "crash");
  assert.equal(classifyRun([log(1, "error ts2322"), exit(2, 1)], 2), "crash");
});

test("exit code 0 is ok even when the last json event is old", () => {
  assert.equal(classifyRun([json(0), exit(10, 0)], 999_999), "ok");
  assert.equal(classifyRun([exit(0, 0)], 120_001), "ok");
});

test("a clean exit stays ok when a build pattern is also in the stream", () => {
  assert.equal(classifyRun([log(1, "error TS2322"), exit(2, 0)], 2), "ok");
});

test("a build pattern without an exit does not finish the run", () => {
  const events = [log(0, "FAIL test/hero.test.ts")];
  assert.equal(classifyRun(events, 1_000), "ok");
  assert.equal(classifyRun(events, 120_001), "stall");
});

test("a negative now throws", () => {
  assert.throws(
    () => classifyRun([exit(0, 0)], -1),
    (error: unknown) => error instanceof RangeError && /zero or greater/.test(error.message),
  );
  assert.throws(
    () => classifyRun([], -0.001),
    (error: unknown) => error instanceof RangeError,
  );
});

test("sensors do not start a process or a timer", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/sensors.ts", import.meta.url)), "utf8");
  assert.equal(/child_process/.test(source), false);
  assert.equal(/setTimeout|setInterval/.test(source), false);
  assert.equal(/process\.kill/.test(source), false);
  const verdict = classifyRun([json(0)], 1);
  assert.equal(verdict, "ok");
});
