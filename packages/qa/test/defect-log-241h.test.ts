/**
 * Idea 26. Every defect has a severity and the project it was seen on.
 * A blocker cannot close without a retest after an Elevate pass.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDefect, judgeDefectLog, type DefectRecord } from "../src/defect-log.ts";
import { recordElevateDefectRetest } from "../src/elevate-loop.ts";
import { renderDefectLog } from "../src/report.ts";

const openBlocker: DefectRecord = {
  id: "d1",
  severity: "blocker",
  project: "webkit-iphone-15",
  state: "open",
  retest: null,
};

test("a closed blocker without a retest fails", () => {
  const judged = judgeDefectLog([{ ...openBlocker, state: "closed" }]);
  assert.equal(judged.ok, false);
  const note = judged.problems.join("\n");
  assert.match(note, /d1/);
  assert.match(note, /retest/);

  const refused = closeDefect(openBlocker);
  assert.equal(refused.ok, false);
  assert.equal(refused.record.state, "open");
  assert.match(refused.problems.join("\n"), /retest/);
});

test("an Elevate pass records a retest and a pass can close the blocker", () => {
  const retested = recordElevateDefectRetest([openBlocker], "elevate-2", { d1: "pass" });
  const first = retested[0];
  assert.ok(first);
  assert.equal(first.retest?.elevatePass, "elevate-2");
  assert.equal(first.retest?.result, "pass");
  assert.equal(openBlocker.retest, null);

  const closed = closeDefect(first);
  assert.equal(closed.ok, true, closed.problems.join("\n"));
  assert.equal(closed.record.state, "closed");
  const judged = judgeDefectLog([closed.record]);
  assert.equal(judged.ok, true, judged.problems.join("\n"));

  const markdown = renderDefectLog([closed.record]);
  assert.match(markdown, /blocker/);
  assert.match(markdown, /webkit-iphone-15/);
  assert.match(markdown, /elevate-2/);
  assert.match(markdown, /pass/);
});

test("a defect without a project fails", () => {
  const thin = judgeDefectLog([
    { id: "d2", severity: "major", project: " ", state: "open", retest: null },
  ]);
  assert.equal(thin.ok, false);
  assert.match(thin.problems.join("\n"), /project/);
});
