/**
 * BUG-071: a follow-up that only restates the answer is stored once.
 * The brief for that value is complete sentences. A shortened field ends on punctuation.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deterministicBrief } from "../src/guide/brief-loop.ts";
import { FOLLOW_UP_MARK, joinFollowUpReply } from "../src/guide/session-state.ts";
import { loadFacts } from "../src/guide/suggest.ts";

const ACTION = "Send an inquiry about one farm they can see. The form is prefilled with that farm ID.";
const ACTION_COPY = "Send an inquiry about one farm they can see; the form is prefilled with that farm ID.";
const STORED = `${ACTION}${FOLLOW_UP_MARK}${ACTION_COPY}`;
const EXTRA = "January 2 through January 16. Pre-orders stop then.";

test("a follow-up that matches the answer is not stored twice", () => {
  assert.equal(joinFollowUpReply(ACTION, ACTION_COPY), ACTION);
  assert.equal(joinFollowUpReply(ACTION, ACTION.toUpperCase()), ACTION);
  assert.equal(joinFollowUpReply(ACTION, `  ${ACTION_COPY}  `), ACTION);
  const kept = joinFollowUpReply("We close in January for two weeks.", EXTRA);
  assert.equal(kept, `We close in January for two weeks.${FOLLOW_UP_MARK}${EXTRA}`);
});

test("the deterministic brief for a duplicated follow-up is complete sentences", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-follow-243b-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify({
      version: 1,
      answers: [{ id: "DP-2.2", status: "ANSWERED", value: STORED }],
      cursor: 1,
      pushedIds: [],
    }),
  );
  try {
    const action = deterministicBrief(loadFacts(dir), "en").action;
    assert.equal(action.includes("Follow-up"), false);
    assert.equal(action.includes(ACTION_COPY), false);
    assert.match(action, /inquiry/);
    assert.match(action, /prefilled/);
    assert.match(action, /[.?;]$/);
    assert.equal(action.endsWith("with the form"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a shortened brief field ends on a sentence", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-follow-cut-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const runOn = `${Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ")}.`;
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify({
      version: 1,
      answers: [{ id: "DP-2.2", status: "ANSWERED", value: runOn }],
      cursor: 1,
      pushedIds: [],
    }),
  );
  try {
    const action = deterministicBrief(loadFacts(dir), "en").action;
    assert.ok(action.length < runOn.length);
    assert.match(action, /[.?;]$/);
    assert.equal(/word\d+$/.test(action), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
