/**
 * BUG-017. A decision point is asked at most twice: the question and one follow-up.
 * A follow-up that repeats an earlier ask, or re-asks what the answer already covers, is dropped.
 * A filled id is not asked again unless the user goes back.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { emptyContextPacket } from "../src/context/index.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import { walkFollowUps, type FollowHistory } from "../src/guide/session-state.ts";
import { loadTree } from "../src/tree.ts";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");

const FIRST =
  "Yes: the mark is the crescent, the wide caps are only the wordmark, and headings, palette, hero and a white logo version may change.";
const SECOND = "The mark, the wide caps, the tagline.";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("Run 3 DP-1.9 is asked at most twice, then the walk moves to DP-2.1", async () => {
  const questions = loadTree(treeFile);
  const seen: FollowHistory[][] = [];
  const messages = [
    "Say the one rule in a single line?",
    "Is that pair never to be split, redrawn, or set in another typeface?",
    "Say again what must never change?",
  ];
  const result = await walkFollowUps({
    questions,
    startId: "DP-1.9",
    answers: [FIRST, SECOND, SECOND],
    async judge(ctx) {
      seen.push(ctx.history);
      const message = messages[ctx.prior] ?? "Say again what must never change?";
      return { action: "push", message };
    },
  });
  assert.ok(result.asks.length <= 2, result.asks.join(" | "));
  assert.ok(result.followUps <= 1);
  assert.equal(result.nextId, "DP-2.1");
  assert.equal(result.askedId, "DP-1.9");
  assert.ok(seen.length >= 2);
  const second = seen[1] ?? [];
  assert.equal(second.some((item) => item.answer.includes("crescent")), true);
});

test("a follow-up that repeats the ask or the stored answer is not shown", async () => {
  const questions = loadTree(treeFile);
  const question = questions.find((item) => item.id === "DP-1.9");
  assert.ok(question);
  const repeated = await walkFollowUps({
    questions,
    startId: "DP-1.9",
    answers: [FIRST],
    maxFollowUps: 3,
    async judge() {
      return { action: "push", message: question.ask };
    },
  });
  assert.deepEqual(repeated.asks, [question.ask]);
  assert.equal(repeated.followUps, 0);
  assert.equal(repeated.nextId, "DP-2.1");

  const covered = await walkFollowUps({
    questions,
    startId: "DP-1.9",
    answers: ["The crescent wordmark stays with the wide caps."],
    maxFollowUps: 3,
    async judge() {
      return { action: "push", message: "Should the crescent wordmark keep the wide caps?" };
    },
  });
  assert.equal(covered.followUps, 0);
  assert.equal(covered.nextId, "DP-2.1");
});

test("a filled id stays behind unless the user goes back", async () => {
  const questions = loadTree(treeFile);
  const skipped = await walkFollowUps({
    questions,
    startId: "DP-1.9",
    answers: [FIRST],
    filled: ["DP-1.9"],
    async judge() {
      return { action: "push", message: "Say the one rule in a single line?" };
    },
  });
  assert.notEqual(skipped.askedId, "DP-1.9");
  assert.equal(skipped.asks.length, 0);

  const back = await walkFollowUps({
    questions,
    startId: "DP-1.9",
    answers: [FIRST],
    filled: ["DP-1.9"],
    revisitId: "DP-1.9",
    async judge() {
      return { action: "accept", message: "" };
    },
  });
  assert.equal(back.askedId, "DP-1.9");
});

test("every decision point stops after one follow-up when the judge always wants more", async () => {
  const questions = loadTree(treeFile);
  assert.ok(questions.length > 10);
  for (const question of questions) {
    const result = await walkFollowUps({
      questions,
      startId: question.id,
      answers: ["one", "two", "three", "four", "five"],
      async judge(ctx) {
        return { action: "push", message: `Follow ${question.id} ${ctx.prior}?` };
      },
    });
    assert.ok(result.followUps <= 1, question.id);
    assert.ok(result.asks.length <= 2, question.id);
    assert.notEqual(result.nextId, question.id, question.id);
  }
});

test("the judge sees earlier asks and rejects a repeat", async () => {
  const questions = loadTree(treeFile);
  const question = questions.find((item) => item.id === "DP-1.9");
  assert.ok(question);
  const history: FollowHistory[] = [
    { ask: question.ask, answer: FIRST },
    { ask: "Say the one rule in a single line?", answer: SECOND },
  ];
  let input = "";
  const model = asThink(async (req) => {
    input = String(req.input);
    return hit({ vague: true, quote: "tagline", sharperChoice: question.ask });
  });
  const judgement = await judgePushback(question, SECOND, 1, {
    think: model,
    packet: emptyContextPacket(),
    history,
  });
  assert.equal(judgement.action, "accept");
  assert.match(input, /Asks already shown/);
  assert.match(input, /Answers already given/);
  assert.match(input, /crescent/);
  assert.equal(input.includes(SECOND), true);
});
