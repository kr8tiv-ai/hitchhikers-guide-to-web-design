/**
 * BUG-003. A concrete answer is not called soft.
 * The judge still runs. A cited gap may push once. The same line is not repeated.
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
import { classifyAnswer } from "../src/guide/answer-shape.ts";
import { GUIDE_FAIL_LINE } from "../src/guide/guide-progress.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import { loadTree, type Question } from "../src/tree.ts";
import { removeTempDir } from "./remove-temp.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");
const NOTE = "accepted after one follow-up";
const CITED = "Which part is missing from that month?";

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

function vagueModel(sharper = ""): { think: typeof think; inputs: string[]; calls: () => number } {
  const inputs: string[] = [];
  let calls = 0;
  const model = asThink(async (req) => {
    calls += 1;
    inputs.push(String(req.input));
    return hit({ vague: true, quote: "answer", sharperChoice: sharper });
  });
  return { think: model, inputs, calls: () => calls };
}

test("the pre-classifier names the shape and the evidence", () => {
  const month = classifyAnswer(byId("DP-2.4"), "30 qualified inquiries a month");
  assert.equal(month.shape, "number");
  assert.equal(month.concreteLikely, true);
  assert.match(month.evidence, /number/);

  const yes = classifyAnswer(byId("DP-4.5"), "Yes.");
  assert.equal(yes.shape, "yes-no");
  assert.equal(yes.concreteLikely, true);

  const sites = classifyAnswer(
    byId("DP-4.1"),
    "Encuentra24 (encuentra24.com), LandWatch (landwatch.com), and Costa Rica real-estate listing sites.",
  );
  assert.equal(sites.shape, "names");
  assert.equal(sites.concreteLikely, true);

  const brands = classifyAnswer(
    byId("DP-1.8"),
    "Similar: Lands of America, Land.com, Encuentra24. Loved: Patagonia, Aesop, Kinfolk.",
  );
  assert.equal(brands.concreteLikely, true);

  const colours = classifyAnswer(
    byId("DP-0.4"),
    "jungle green, sunset gold, ocean blue, plus soft sand and a near-black green.",
  );
  assert.equal(colours.shape, "colour");
  assert.equal(colours.concreteLikely, true);

  const follow = classifyAnswer(byId("DP-2.2"), "Yes.", "Is that inquiry about one farm already on the page?");
  assert.equal(follow.shape, "yes-no");
  assert.equal(follow.concreteLikely, true);
});

test("repro answers are accepted and the judge still runs", async () => {
  const rows: Array<{ id: string; text: string; shape: string; followUp?: string }> = [
    { id: "DP-2.4", text: "30 qualified inquiries a month", shape: "number" },
    { id: "DP-4.5", text: "Yes.", shape: "yes-no" },
    {
      id: "DP-4.1",
      text: "Encuentra24 (encuentra24.com), LandWatch (landwatch.com), and Costa Rica real-estate listing sites.",
      shape: "names",
    },
    {
      id: "DP-1.8",
      text: "Similar: Lands of America, Land.com, Encuentra24. Loved: Patagonia, Aesop, Kinfolk.",
      shape: "names",
    },
    {
      id: "DP-0.4",
      text: "jungle green, sunset gold, ocean blue, plus soft sand and a near-black green.",
      shape: "colour",
    },
    { id: "DP-2.2", text: "Yes.", shape: "yes-no", followUp: "Is that inquiry about one farm already on the page?" },
  ];
  for (const row of rows) {
    const model = vagueModel();
    const judgement = await judgePushback(byId(row.id), row.text, 0, {
      think: model.think,
      packet: emptyContextPacket(),
      ...(row.followUp === undefined ? {} : { priorMessage: row.followUp }),
    });
    assert.equal(model.calls(), 1, row.id);
    assert.equal(judgement.action, "accept", row.id);
    assert.equal(judgement.message.includes("still soft"), false, row.id);
    const input = model.inputs[0] ?? "";
    assert.match(input, new RegExp(`Expected shape: ${row.shape}`), row.id);
    assert.match(input, /concrete-likely/, row.id);
    assert.match(input, /Pre-classifier:/, row.id);
    if (row.followUp !== undefined) assert.match(input, /Follow-up being judged:/, row.id);
  }
});

test("a cited gap on a concrete answer pushes once, then the answer is kept", async () => {
  const question = byId("DP-2.4");
  const text = "30 qualified inquiries a month";
  const firstModel = vagueModel(CITED);
  const first = await judgePushback(question, text, 0, { think: firstModel.think, packet: emptyContextPacket() });
  assert.equal(firstModel.calls(), 1);
  assert.equal(first.action, "push");
  assert.equal(first.message, CITED);

  const secondModel = vagueModel(CITED);
  const second = await judgePushback(question, text, 1, { think: secondModel.think, packet: emptyContextPacket() });
  assert.equal(secondModel.calls(), 1);
  assert.equal(second.action, "accept");
  assert.equal(second.note, NOTE);
  assert.equal(second.message.includes("still soft"), false);
  assert.notEqual(second.message, CITED);
});

test("the same follow-up text is not shown twice", async () => {
  const question = byId("DP-1.8");
  const text = "Aesop restraint, wide caps, and a quiet mark.";
  const line = "What is the one concrete detail the mark should keep?";
  const model = vagueModel(line);
  const first = await judgePushback(question, text, 0, { think: model.think, packet: emptyContextPacket() });
  assert.equal(first.action, "push");
  assert.equal(first.message, line);
  const second = await judgePushback(question, text, 1, {
    think: model.think,
    priorMessage: first.message,
    packet: emptyContextPacket(),
  });
  assert.equal(second.action, "accept");
  assert.equal(second.message, "");
});

test("a judge failure on a concrete answer is not shown as soft", async () => {
  const model = asThink(async () => {
    throw new Error("down");
  });
  const judgement = await judgePushback(byId("DP-2.4"), "30 qualified inquiries a month", 0, {
    think: model,
    packet: emptyContextPacket(),
  });
  assert.equal(judgement.action, "accept");
  assert.equal(judgement.unchecked, true);
  assert.equal(judgement.message, GUIDE_FAIL_LINE);
  assert.equal(judgement.message.includes("still soft"), false);
});

test("a follow-up cap of one is configurable for a vague answer", async () => {
  const question: Question = {
    id: "DP-0.1",
    module: "towel-check",
    depth: ["deep"],
    ask: "What should the homepage keep?",
    why: "The first screen needs one detail.",
    input: ["text"],
    skipDefault: "No homepage detail.",
    writes: ["PROJECT.md"],
  };
  const line = "What is the one page this shop site should publish first?";
  const model = vagueModel(line);
  const first = await judgePushback(question, "The pages can wait until the audience is clearer.", 0, {
    think: model.think,
    packet: emptyContextPacket(),
    followUpCap: 1,
  });
  assert.equal(first.action, "push");
  const second = await judgePushback(question, "The pages can wait until the audience is clearer.", 1, {
    think: model.think,
    packet: emptyContextPacket(),
    followUpCap: 1,
  });
  assert.equal(second.action, "accept");
  assert.equal(second.note, NOTE);
  assert.notEqual(second.message, line);
});

test("after one cited follow-up the desk keeps the answer and moves on", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-judge-003-"));
  const tree = `questions:
  - id: DP-2.4
    topic: outcomes
    module: the-question
    depth: [express, standard, deep]
    ask: "How many calls, bookings, or sales a month would make you happy?"
    why: "A number with a period is enough."
    input: [text]
    skip_default: "KPIs not set."
    writes:
      - "KPIS.md"
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`;
  try {
    mkdirSync(path.join(projectDir, "interview"), { recursive: true });
    writeFileSync(path.join(projectDir, "interview", "tree.yaml"), tree);
    const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
    const text = "30 qualified inquiries a month";
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: true, quote: "30", sharperChoice: CITED });
      if (req.task === "guide-message") {
        return hit({ message: "What should the site do for a visitor?", explanationLevel: "beginner", joke: false });
      }
      throw new Error(String(req.task));
    });
    const first = await runTurn(session, { kind: "answer", text }, { think: model });
    assert.equal(first.status, "pushed");
    assert.equal(first.questionId, "DP-2.4");
    assert.equal(first.message, CITED);
    const second = await runTurn(session, { kind: "answer", text }, { think: model });
    assert.equal(second.status, "asked");
    assert.equal(second.questionId, "DP-2.1");
    assert.equal(second.note, NOTE);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    const stored = saved.answers.filter((answer) => answer.id === "DP-2.4");
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.status, "ANSWERED");
    assert.equal(stored[0]?.value, text);
  } finally {
    removeTempDir(projectDir);
  }
});

test("named colours, yes, urls, and names override a cited soft gap", async () => {
  const rows = [
    {
      id: "DP-1.2",
      text: "jungle green, sunset gold, ocean blue, soft sand, and near-black green.",
      sharper: "Which colour is missing from that list?",
    },
    { id: "DP-4.5", text: "Yes.", sharper: "Which part is missing from that yes?" },
    {
      id: "DP-4.1",
      text: "Encuentra24 (encuentra24.com) and LandWatch (landwatch.com).",
      sharper: "Which domain is missing from that list?",
    },
    {
      id: "DP-1.8",
      text: "Similar: Lands of America, Land.com, Encuentra24. Loved: Patagonia, Aesop, Kinfolk.",
      sharper: "Which name is missing from that list?",
    },
  ];
  for (const row of rows) {
    const model = vagueModel(row.sharper);
    const judgement = await judgePushback(byId(row.id), row.text, 0, {
      think: model.think,
      packet: emptyContextPacket(),
    });
    assert.equal(model.calls(), 1, row.id);
    assert.equal(judgement.action, "accept", row.id);
    assert.equal(judgement.message.includes("still soft"), false, row.id);
  }
});

test("a colour list and Yes advance with no pushback", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-judge-003-colours-"));
  const tree = `questions:
  - id: DP-1.2
    topic: palette
    module: ford-field-notes
    depth: [express, standard, deep]
    ask: "Which colors feel like your business?"
    why: "Name the colours."
    input: [text]
    skip_default: "No palette yet."
    pushback_if:
      - "blue"
    writes:
      - "BRAND.md"
  - id: DP-4.5
    topic: answer-engines
    module: vogon-neighbors
    depth: [express, standard, deep]
    ask: "Do you want AI assistants to recommend the business?"
    why: "Yes or no is a full answer."
    input: [choice, text]
    skip_default: "No answer-engine goal."
    writes:
      - "SITE-BRIEF.md"
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`;
  const colours = "jungle green, sunset gold, ocean blue, soft sand, and near-black green.";
  try {
    mkdirSync(path.join(projectDir, "interview"), { recursive: true });
    writeFileSync(path.join(projectDir, "interview", "tree.yaml"), tree);
    const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") {
        return hit({ vague: true, quote: "answer", sharperChoice: "Which part is missing from that answer?" });
      }
      if (req.task === "guide-message") {
        return hit({ message: "What should the next page keep?", explanationLevel: "beginner", joke: false });
      }
      throw new Error(String(req.task));
    });
    const first = await runTurn(session, { kind: "answer", text: colours }, { think: model });
    assert.equal(first.status, "asked");
    assert.equal(first.questionId, "DP-4.5");
    assert.equal(first.message.includes("still soft"), false);
    const second = await runTurn(session, { kind: "answer", text: "Yes." }, { think: model });
    assert.equal(second.status, "asked");
    assert.equal(second.questionId, "DP-2.1");
    assert.equal(second.message.includes("still soft"), false);
  } finally {
    removeTempDir(projectDir);
  }
});
