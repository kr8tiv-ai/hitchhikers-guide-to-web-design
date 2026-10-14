/**
 * BUG-003 remainder. An accepted answer on DP-0.2a advances.
 * A follow-up is asked only for a named missing part, and it names that part.
 * The generic concrete-detail line is not used after the step 704 answer.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { emptyContextPacket } from "../src/context/index.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import { loadTree, type Question } from "../src/tree.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");
const ASK = "What do you love about a site you admire, and what makes you wince?";
const STEP_704 = "Lead with honesty: big calm photos of real land, plain words, and the lawyer step shown up front.";
const GENERIC = "What is one concrete detail the site should use?";
const Wince = "What makes you wince on a site?";
const PARTIAL = "I love the calm type.";
const NEXT = "How hands-on are you with websites?";

const TREE = `questions:
  - id: DP-0.2a
    topic: prior-taste
    module: towel-check
    depth: [express, standard, deep]
    ask: "${ASK}"
    why: "Love and wince are the taste signal."
    input: [text, voice]
    skip_default: "No prior site to love or wince at."
    writes:
      - "PROJECT.md#prior-sites"
  - id: DP-0.3
    topic: skill-level
    module: towel-check
    depth: [express, standard, deep]
    ask: "${NEXT}"
    why: "This tells me how much to explain."
    input: [choice, text, voice]
    skip_default: "I'm brand new to all of this."
    writes:
      - "PROJECT.md#skill"
`;

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

function vague(sharper: string): typeof think {
  return asThink(async () => hit({ vague: true, quote: "answer", sharperChoice: sharper }));
}

function desk(projectDir: string): GuideSession {
  return { projectDir, depth: "deep", language: "en", pushes: {} };
}

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-follow-235-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), TREE, "utf8");
  return dir;
}

test("the step 704 answer advances and does not ask the generic follow-up", async () => {
  const projectDir = project();
  try {
    const tasks: string[] = [];
    const model = asThink(async (req) => {
      tasks.push(req.task);
      if (req.task === "pushback-judge") return hit({ vague: true, quote: "honesty", sharperChoice: GENERIC });
      if (req.task === "guide-message") {
        return hit({ message: NEXT, explanationLevel: "beginner", joke: false });
      }
      throw new Error(String(req.task));
    });
    const turn = await runTurn(desk(projectDir), { kind: "answer", text: STEP_704 }, { think: model });
    assert.equal(tasks.includes("pushback-judge"), true);
    assert.equal(turn.status, "asked");
    assert.equal(turn.questionId, "DP-0.3");
    assert.equal(turn.message.includes("one concrete detail the site should use"), false);
    assert.equal(turn.message.includes("still soft"), false);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    const stored = saved.answers.find((item) => item.id === "DP-0.2a");
    assert.equal(stored?.status, "ANSWERED");
    assert.equal(stored?.value, STEP_704);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a one-sided love answer gets a follow-up that names the wince", async () => {
  const projectDir = project();
  try {
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: true, quote: "calm", sharperChoice: GENERIC });
      throw new Error(String(req.task));
    });
    const turn = await runTurn(desk(projectDir), { kind: "answer", text: PARTIAL }, { think: model });
    assert.equal(turn.status, "pushed");
    assert.equal(turn.questionId, "DP-0.2a");
    assert.equal(turn.message, Wince);
    assert.equal(turn.message.includes("one concrete detail the site should use"), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("BUG-003 concrete answers stay accepted when the model offers the generic line", async () => {
  const rows = [
    { id: "DP-2.4", text: "30 qualified inquiries a month" },
    { id: "DP-4.5", text: "Yes." },
    {
      id: "DP-4.1",
      text: "Encuentra24 (encuentra24.com), LandWatch (landwatch.com), and Costa Rica real-estate listing sites.",
    },
    {
      id: "DP-0.4",
      text: "jungle green, sunset gold, ocean blue, plus soft sand and a near-black green.",
    },
  ];
  for (const row of rows) {
    const judgement = await judgePushback(byId(row.id), row.text, 0, {
      think: vague(GENERIC),
      packet: emptyContextPacket(),
    });
    assert.equal(judgement.action, "accept", row.id);
    assert.equal(judgement.message.includes("one concrete detail the site should use"), false, row.id);
    assert.equal(judgement.message.includes("still soft"), false, row.id);
  }
});
