/**
 * BUG-003. A concrete colour answer is not called soft.
 * A judge failure is not reported as a soft verdict.
 * The floor fallback does not fire twice in a row on the same question.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { GUIDE_FAIL_LINE } from "../src/guide/guide-progress.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import { loadTree, type Question } from "../src/tree.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");
const COLOURS =
  "No fonts yet. Take colors from the hero photo: jungle green, sunset gold, ocean blue, plus soft sand and a near-black green.";
const FLOOR = "That answer is still soft. What is one concrete detail the site should use?";

function byId(id: string): Question {
  const found = loadTree(treeFile).find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("five named colours are accepted and the judge still runs", async () => {
  let calls = 0;
  const model = asThink(async () => {
    calls += 1;
    return hit({ vague: true, quote: "jungle green", sharperChoice: "" });
  });
  const judgement = await judgePushback(byId("DP-0.4"), COLOURS, 0, { think: model });
  assert.equal(calls, 1);
  assert.equal(judgement.action, "accept");
  assert.equal(judgement.message, "");
  assert.equal(judgement.message.includes("still soft"), false);
});

test("a phrase-floor answer stays soft even when it also names colours", async () => {
  let calls = 0;
  const model = asThink(async () => {
    calls += 1;
    return hit({ vague: false, quote: "", sharperChoice: "" });
  });
  const judgement = await judgePushback(byId("DP-0.4"), `it's fine. ${COLOURS}`, 0, { think: model });
  assert.equal(calls, 1);
  assert.equal(judgement.action, "push");
  assert.equal(judgement.floor, true);
});

test("a judge failure is not shown as a soft answer", async () => {
  let calls = 0;
  const model = asThink(async () => {
    calls += 1;
    throw new Error("down");
  });
  const judgement = await judgePushback(byId("DP-0.4"), COLOURS, 0, { think: model });
  assert.equal(calls, 2);
  assert.equal(judgement.action, "accept");
  assert.equal(judgement.message, GUIDE_FAIL_LINE);
  assert.equal(judgement.message.includes("still soft"), false);
  await assert.rejects(() => judgePushback(byId("DP-0.4"), COLOURS, 0, { think: model, surfaceErrors: true }));
});

test("the floor fallback does not fire twice in a row on the same question", async () => {
  const model = asThink(async () => hit({ vague: true, quote: "Aesop", sharperChoice: "not a question" }));
  const question = byId("DP-1.8");
  const first = await judgePushback(question, "Aesop restraint, wide caps, and a quiet mark.", 0, { think: model });
  assert.equal(first.action, "push");
  assert.equal(first.message, FLOOR);
  const second = await judgePushback(question, "The mark, the wide caps, the tagline.", 1, {
    think: model,
    priorMessage: first.message,
  });
  assert.equal(second.action, "accept");
  assert.equal(second.message.includes("still soft"), false);
});
