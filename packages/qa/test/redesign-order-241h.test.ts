/**
 * Idea 13. Redesign walks type, color, frame, states, then components.
 * Each step stores a before screenshot and an after screenshot.
 * Component markup before type is rejected. An overused display face
 * that the person did not name blocks the later steps.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOverusedFamily } from "@hitchhiker/engine";
import { REDESIGN_STEPS, judgeRedesignOrder, type RedesignStepShot } from "../src/elevate-loop.ts";

function walk(family: string): RedesignStepShot[] {
  const before = Buffer.from("before");
  const after = Buffer.from("after");
  return REDESIGN_STEPS.map((step) => ({ step, before, after, displayFamily: family }));
}

test("component markup before the type step is rejected", () => {
  assert.deepEqual([...REDESIGN_STEPS], ["type", "color", "frame", "states", "components"]);
  const shot = Buffer.from("png");
  const early = judgeRedesignOrder({
    namedFamilies: [],
    steps: [{ step: "components", before: shot, after: Buffer.from("png-2"), displayFamily: "Inter" }],
  });
  assert.equal(early.ok, false);
  const note = early.problems.join("\n");
  assert.match(note, /components/);
  assert.match(note, /type/);

  const skipped = judgeRedesignOrder({
    namedFamilies: [],
    steps: [
      { step: "type", before: shot, after: shot, displayFamily: "Boska" },
      { step: "components", before: shot, after: shot, displayFamily: "Boska" },
    ],
  });
  assert.equal(skipped.ok, false);
  assert.match(skipped.problems.join("\n"), /color/);
});

test("later steps fail while the display face is still an unnamed overused default", () => {
  assert.equal(isOverusedFamily("Inter"), true);
  assert.equal(isOverusedFamily("Boska"), false);

  const stuck = judgeRedesignOrder({ namedFamilies: [], steps: walk("Inter") });
  assert.equal(stuck.ok, false);
  assert.match(stuck.problems.join("\n"), /Inter/);

  const named = judgeRedesignOrder({ namedFamilies: ["Inter"], steps: walk("Inter") });
  assert.equal(named.ok, true, named.problems.join("\n"));
  assert.equal(named.stored.length, REDESIGN_STEPS.length);
  for (const row of named.stored) {
    assert.ok(row.beforeBytes > 0);
    assert.ok(row.afterBytes > 0);
  }
});

test("a full walk stores a before and an after at every step", () => {
  const report = judgeRedesignOrder({ namedFamilies: [], steps: walk("Boska") });
  assert.equal(report.ok, true, report.problems.join("\n"));
  assert.deepEqual(
    report.stored.map((row) => row.step),
    [...REDESIGN_STEPS],
  );
});

test("a step with an empty before screenshot is rejected", () => {
  const report = judgeRedesignOrder({
    namedFamilies: [],
    steps: [{ step: "type", before: Buffer.alloc(0), after: Buffer.from("after"), displayFamily: "Boska" }],
  });
  assert.equal(report.ok, false);
  assert.match(report.problems.join("\n"), /before/);
});
