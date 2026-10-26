/**
 * Desk run 10. A follow-up that only restates the question or the answer is dropped.
 * DP-5.2 names sites already given. A date never gets the generic detail line.
 * A follow-up reply is stored on its own line, after "Follow-up:".
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { emptyContextPacket } from "../src/context/index.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { GUIDE_FAIL_LINE } from "../src/guide/guide-progress.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import {
  applyGalleryWalk,
  followUpRejected,
  galleryWalkAsk,
  gateQuestion,
  walkFollowUps,
  type SessionState,
} from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";
import { removeTempDir } from "./remove-temp.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");
const FALLBACK = "No favorites yet? Let's look at a few sites together. Say love, meh, or hate.";
const LOVED =
  "Tartine.com for the warm photography; Aesop.com for the calm layout and type; Patagonia.com for honest storytelling; Mailchimp.com for the friendly illustrations.";
const NAMED =
  "You named Tartine, Aesop, Patagonia and Mailchimp. Let's look at a few more sites together. Say love, meh, or hate.";

const HANDS = "(c) I don't build websites. I want the Guide to make it and I approve.";
const HANDS_SHORT = "Should the Guide build every page and show you one finished version to approve?";
const HANDS_FULL =
  "What's missing is which hands-on role is true. Marking (c) means you write the HTML, CSS, and JavaScript yourself. Your sentence says you don't build websites, the Guide makes the site, and you approve. Should the Guide build every page and show you one finished version to approve?";

const VOICE =
  "Friendly, a bit cheeky, like a neighbour who wakes up at 3 am to bake for you. If it were an animal, a golden retriever with flour on its nose.";
const VOICE_SHORT = "How would Copper Kettle write the homepage hello in that voice?";
const VOICE_FULL =
  "The 3 am neighbour and the flour-nosed golden retriever already name the character. What is missing is one line the site would actually say. How would Copper Kettle write the homepage hello, or tell someone the bread is gone, in that voice?";

const CONTACT = "Yes, a simple contact form. Messages go to hello@copperkettlebakery.example.";
const CONTACT_WRAP =
  "I still need the same fact. Do you want a contact form? Where should messages go (which email)?";

const DEADLINE = "In about 4 weeks, before the holiday season.";
const SEASON = "Before the holiday season.";
const GENERIC = "That answer is still soft. What is one concrete detail the site should use?";

const NOTES = "We close in January for two weeks. That's all.";
const NOTES_FOLLOW =
  "The January close is a real extra fact. What is missing is which two weeks, and whether the site should block pickup pre-orders and show a closure notice. Which dates in January are you closed, and should pre-orders stop then?";
const NOTES_REPLY = "January 2 through January 16. Pre-orders stop then.";
const GLUED = `${NOTES}In about 4 weeks, before the holiday season.`;

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

function desk(projectDir: string): GuideSession {
  return { projectDir, depth: "deep", language: "en", pushes: {} };
}

test("DP-5.2 lists sites named as host labels and keeps the empty walk", () => {
  assert.equal(galleryWalkAsk(LOVED, FALLBACK), NAMED);
  assert.equal(NAMED.includes("No favorites yet"), false);
  const all = loadTree(treeFile);
  const walk = byId("DP-5.2");
  const state: SessionState = { answers: [{ id: "DP-5.1", text: LOVED, assumed: false }], uploads: [], decided: [] };
  const gate = gateQuestion(walk, state, all);
  assert.equal(gate.action, "ask");
  assert.equal(gate.ask, NAMED);
  const applied = applyGalleryWalk(FALLBACK, "No favorites yet? The walk can still help.", LOVED, FALLBACK);
  assert.equal(applied.ask, NAMED);
  assert.equal(applied.lead, "");
  assert.equal(applied.locked, true);
  for (const empty of ["", "none", "None.", "skip", "skipped"]) {
    assert.equal(galleryWalkAsk(empty, FALLBACK), FALLBACK, empty);
    assert.equal(galleryWalkAsk(empty, FALLBACK).includes("love, meh, or hate"), true, empty);
  }
});

test("run 10 restatements are not asked, and a real follow-up still is", async () => {
  const questions = loadTree(treeFile);
  const cases: Array<{ id: string; answer: string; message: string; keep: boolean }> = [
    { id: "DP-0.3", answer: HANDS, message: HANDS_SHORT, keep: false },
    { id: "DP-0.3", answer: HANDS, message: HANDS_FULL, keep: false },
    { id: "DP-1.6", answer: VOICE, message: VOICE_FULL, keep: false },
    { id: "DP-3.1", answer: CONTACT, message: byId("DP-3.1").ask, keep: false },
    { id: "DP-3.1", answer: CONTACT, message: CONTACT_WRAP, keep: false },
    { id: "DP-9.1", answer: DEADLINE, message: GENERIC, keep: false },
    { id: "DP-9.5", answer: NOTES, message: NOTES_FOLLOW, keep: true },
  ];
  for (const row of cases) {
    const question = byId(row.id);
    const rejected = followUpRejected(row.message, [{ ask: question.ask, answer: row.answer }], row.answer);
    assert.equal(rejected === null, row.keep, row.id);
    const walked = await walkFollowUps({
      questions,
      startId: row.id,
      answers: [row.answer, "a second line that must not open another follow-up"],
      async judge() {
        return { action: "push", message: row.message };
      },
    });
    assert.ok(walked.asks.length <= 2, row.id);
    assert.ok(walked.followUps <= 1, row.id);
    assert.equal(walked.followUps, row.keep ? 1 : 0, row.id);
    assert.equal(walked.asks[0], question.ask, row.id);
    assert.equal(walked.asks.length, row.keep ? 2 : 1, row.id);
    if (row.keep) assert.equal(walked.asks[1], row.message, row.id);
    assert.notEqual(walked.nextId, row.id, row.id);
  }
});

test("a complete voice answer and a deadline do not take a generic or restated follow-up", async () => {
  const voice = await judgePushback(byId("DP-1.6"), VOICE, 0, {
    think: asThink(async () => hit({ vague: true, quote: "neighbour", sharperChoice: VOICE_SHORT })),
    packet: emptyContextPacket(),
    history: [{ ask: byId("DP-1.6").ask, answer: "" }],
  });
  assert.equal(voice.action, "accept");
  assert.equal(voice.message.includes("homepage hello"), false);

  const season = await judgePushback(byId("DP-9.1"), SEASON, 0, {
    think: asThink(async () => hit({ vague: true, quote: "holiday", sharperChoice: GENERIC })),
    packet: emptyContextPacket(),
  });
  assert.equal(season.action, "accept");
  assert.equal(season.message.includes("one concrete detail"), false);

  const weeks = await judgePushback(byId("DP-9.1"), DEADLINE, 0, {
    think: asThink(async () => hit({ vague: true, quote: "weeks", sharperChoice: GENERIC })),
    packet: emptyContextPacket(),
  });
  assert.equal(weeks.action, "accept");
  assert.equal(weeks.message.includes("one concrete detail"), false);

  const repeat = await judgePushback(byId("DP-9.5"), "maybe soon", 0, {
    think: asThink(async () => hit({ vague: true, quote: "maybe", sharperChoice: byId("DP-9.5").ask })),
    packet: emptyContextPacket(),
  });
  assert.equal(repeat.action, "accept");
  assert.notEqual(repeat.message, byId("DP-9.5").ask);
});

test("a failed check reports the error and does not ask the same question again", async () => {
  const judgement = await judgePushback(byId("DP-3.1"), CONTACT, 0, {
    think: asThink(async () => {
      throw new Error("down");
    }),
    packet: emptyContextPacket(),
  });
  assert.equal(judgement.action, "accept");
  assert.equal(judgement.unchecked, true);
  assert.equal(judgement.message, GUIDE_FAIL_LINE);
  assert.notEqual(judgement.message, byId("DP-3.1").ask);
});

test("a follow-up reply is stored after a Follow-up mark, including a glued reply", async () => {
  const tree = `questions:
  - id: DP-9.5
    topic: notes
    module: limits
    depth: [express, standard, deep]
    ask: "Anything else the Guide should know?"
    why: "A last open field."
    input: [text, voice]
    skip_default: "Nothing else."
    writes:
      - "SITE-BRIEF.md#notes"
  - id: DP-9.6
    topic: done
    module: limits
    depth: [express, standard, deep]
    ask: "What did the notes miss?"
    why: "Next."
    input: [text]
    skip_default: "Nothing."
    writes:
      - "SITE-BRIEF.md#done"
`;
  const follow = "Which dates in January are you closed?";
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-follow-249d-"));
  const gluedDir = mkdtempSync(path.join(tmpdir(), "hh-follow-249d-glue-"));
  try {
    for (const dir of [projectDir, gluedDir]) {
      mkdirSync(path.join(dir, "interview"), { recursive: true });
      writeFileSync(path.join(dir, "interview", "tree.yaml"), tree, "utf8");
    }
    let judges = 0;
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") {
        judges += 1;
        if (judges === 1) return hit({ vague: true, quote: "January", sharperChoice: follow });
        return hit({ vague: false, quote: "", sharperChoice: "" });
      }
      if (req.task === "guide-message") {
        return hit({ message: "What did the notes miss?", explanationLevel: "beginner", joke: false });
      }
      throw new Error(String(req.task));
    });
    const session = desk(projectDir);
    const first = await runTurn(session, { kind: "answer", text: NOTES }, { think: model });
    assert.equal(first.status, "pushed");
    assert.equal(first.questionId, "DP-9.5");
    assert.equal(first.message, follow);
    const second = await runTurn(session, { kind: "answer", text: NOTES_REPLY }, { think: model });
    assert.equal(second.status, "asked");
    assert.equal(second.questionId, "DP-9.6");
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; value: string }>;
    };
    const stored = saved.answers.filter((item) => item.id === "DP-9.5");
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.value, `${NOTES}\nFollow-up: ${NOTES_REPLY}`);

    let gluedJudges = 0;
    const gluedModel = asThink(async (req) => {
      if (req.task === "pushback-judge") {
        gluedJudges += 1;
        if (gluedJudges === 1) return hit({ vague: true, quote: "January", sharperChoice: follow });
        return hit({ vague: false, quote: "", sharperChoice: "" });
      }
      if (req.task === "guide-message") {
        return hit({ message: "What did the notes miss?", explanationLevel: "beginner", joke: false });
      }
      throw new Error(String(req.task));
    });
    const gluedSession = desk(gluedDir);
    const opened = await runTurn(gluedSession, { kind: "answer", text: NOTES }, { think: gluedModel });
    assert.equal(opened.status, "pushed");
    const closed = await runTurn(gluedSession, { kind: "answer", text: GLUED }, { think: gluedModel });
    assert.equal(closed.questionId, "DP-9.6");
    const gluedSaved = JSON.parse(readFileSync(path.join(gluedDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; value: string }>;
    };
    const gluedRow = gluedSaved.answers.filter((item) => item.id === "DP-9.5");
    assert.equal(gluedRow.length, 1);
    assert.equal(gluedRow[0]?.value, `${NOTES}\nFollow-up: In about 4 weeks, before the holiday season.`);
    assert.equal(gluedRow[0]?.value.includes("That's all.In about"), false);
  } finally {
    removeTempDir(projectDir);
    removeTempDir(gluedDir);
  }
});
