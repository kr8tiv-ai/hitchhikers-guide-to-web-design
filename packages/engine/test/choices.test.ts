import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateJson } from "../src/ai/schema-validate.ts";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { followUpChoices, judgePushback } from "../src/guide/pushback-judge.ts";
import { CHOICES_SCHEMA, type Facts } from "../src/guide/schemas.ts";
import { choiceSetFrom } from "../src/guide/suggest.ts";
import type { Question } from "../src/tree.ts";

const facts: Facts = {
  answers: [{ id: "DP-2.1", value: "The neighbor orders tea." }],
  uploads: ["tins.jpg"],
  crawlNotes: ["menu"],
  industry: "tea",
};

const fallback = { label: "Yourself, or one named client." };

function row(id: string, label: string, source: string): { id: string; label: string; why: string; source: string } {
  return { id, label, why: "The shop can use this.", source };
}

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("two, three, and four ordered choices pass the schema and stay a model set", () => {
  const two = [row("A", "A quiet page for the shop.", "industry:tea"), row("B", "Show the tin on the page.", "upload:tins.jpg")];
  const three = [...two, row("C", "Keep the menu from the crawl.", "crawl:menu")];
  const four = [...three, row("D", "Use the tea for the page.", "answer:DP-2.1")];
  for (const choices of [two, three, four]) {
    assert.deepEqual(validateJson({ choices }, CHOICES_SCHEMA), []);
    const set = choiceSetFrom({ choices }, facts, "en", fallback);
    assert.equal(set.origin, "model");
    assert.equal(set.choices.length, choices.length);
    assert.deepEqual(
      set.choices.map((item) => item.id),
      choices.map((item) => item.id),
    );
  }
});

test("one choice, five choices, bad ids, missing fields, and non-JSON fall back to one", () => {
  const one = { choices: [row("A", "Show the tin on the page.", "upload:tins.jpg")] };
  assert.ok(validateJson(one, CHOICES_SCHEMA).length > 0);
  assert.equal(choiceSetFrom(one, facts, "en", fallback).choices.length, 1);
  assert.equal(choiceSetFrom(one, facts, "en", fallback).origin, "fallback");
  assert.equal(choiceSetFrom(one, facts, "en", fallback).choices[0]?.label, fallback.label);

  const five = {
    choices: [
      row("A", "A quiet page for the shop.", "industry:tea"),
      row("B", "Show the tin on the page.", "upload:tins.jpg"),
      row("C", "Keep the menu from the crawl.", "crawl:menu"),
      row("D", "Use the tea for the page.", "answer:DP-2.1"),
      row("D", "Keep the menu from the crawl.", "crawl:menu"),
    ],
  };
  assert.ok(validateJson(five, CHOICES_SCHEMA).length > 0);
  assert.equal(choiceSetFrom(five, facts, "en", fallback).choices.length, 1);
  assert.notEqual(choiceSetFrom(five, facts, "en", fallback).choices.length, 4);

  const duplicate = {
    choices: [row("A", "A quiet page for the shop.", "industry:tea"), row("A", "Show the tin on the page.", "upload:tins.jpg")],
  };
  assert.equal(choiceSetFrom(duplicate, facts, "en", fallback).origin, "fallback");
  assert.equal(choiceSetFrom(duplicate, facts, "en", fallback).choices.length, 1);

  const swapped = {
    choices: [row("B", "Show the tin on the page.", "upload:tins.jpg"), row("A", "A quiet page for the shop.", "industry:tea")],
  };
  assert.equal(choiceSetFrom(swapped, facts, "en", fallback).origin, "fallback");

  const missing = {
    choices: [
      { id: "A", why: "The shop can use this.", source: "industry:tea" },
      row("B", "Show the tin on the page.", "upload:tins.jpg"),
    ],
  };
  assert.ok(validateJson(missing, CHOICES_SCHEMA).length > 0);
  assert.equal(choiceSetFrom(missing, facts, "en", fallback).choices[0]?.label, fallback.label);

  assert.equal(choiceSetFrom("not json", facts, "en", fallback).choices.length, 1);
  assert.equal(choiceSetFrom("not json", facts, "en", fallback).origin, "fallback");
  assert.equal(choiceSetFrom("not json", facts, "en", fallback).choices[0]?.source, "question:suggest");
});

test("an ungrounded source is dropped, and one survivor is the fallback", () => {
  const set = choiceSetFrom(
    {
      choices: [
        row("A", "Show the tin on the page.", "upload:tins.jpg"),
        row("B", "Show the missing tray on the page.", "upload:tray.jpg"),
        row("C", "Keep the menu from the crawl.", "crawl:menu"),
      ],
    },
    facts,
    "en",
    fallback,
  );
  assert.equal(set.origin, "model");
  assert.equal(set.choices.length, 2);
  assert.equal(set.choices[0]?.id, "A");
  assert.equal(set.choices[1]?.id, "B");
  assert.equal(set.choices[0]?.source, "upload:tins.jpg");

  const only = choiceSetFrom(
    {
      choices: [
        row("A", "Show the tin on the page.", "upload:tins.jpg"),
        row("B", "Show the missing tray on the page.", "upload:tray.jpg"),
      ],
    },
    facts,
    "en",
    fallback,
  );
  assert.equal(only.origin, "fallback");
  assert.equal(only.choices.length, 1);
  assert.equal(only.choices[0]?.label, "Show the tin on the page.");
  assert.equal(only.choices[0]?.source, "upload:tins.jpg");
});

test("legacy options without ids become model choices, and five options do not slice", () => {
  const legacy = choiceSetFrom(
    {
      options: [
        { label: "A quiet order page", why: "The neighbor needs a way to order.", source: "answer:DP-2.1" },
        { label: "Show the tin photo large", why: "The photo of the tins is already in the uploads.", source: "upload:tins.jpg" },
        { label: "Keep the menu page type", why: "The crawl notes a simple menu page.", source: "crawl:menu" },
        { label: "A warm paper ground", why: "The industry often keeps the page close to paper.", source: "industry:tea" },
      ],
    },
    facts,
    "en",
    fallback,
  );
  assert.equal(legacy.origin, "model");
  assert.deepEqual(
    legacy.choices.map((item) => item.id),
    ["A", "B", "C", "D"],
  );

  const five = choiceSetFrom(
    {
      options: [
        { label: "A quiet page for the shop.", why: "The shop can use this.", source: "industry:tea" },
        { label: "Show the tin on the page.", why: "The shop can use this.", source: "upload:tins.jpg" },
        { label: "Keep the menu from the crawl.", why: "The shop can use this.", source: "crawl:menu" },
        { label: "Use the tea for the page.", why: "The shop can use this.", source: "answer:DP-2.1" },
        { label: "Keep the menu from the crawl.", why: "The shop can use this.", source: "crawl:menu" },
      ],
    },
    facts,
    "en",
    fallback,
  );
  assert.equal(five.origin, "fallback");
  assert.equal(five.choices.length, 1);
  assert.equal(five.choices[0]?.label, fallback.label);
});

test("a bad choices key does not fall through to valid options", () => {
  const set = choiceSetFrom(
    {
      choices: [row("Z", "Nope", "upload:tins.jpg")],
      options: [
        { label: "Show the tin on the page.", why: "The shop can use this.", source: "upload:tins.jpg" },
        { label: "Keep the menu from the crawl.", why: "The shop can use this.", source: "crawl:menu" },
      ],
    },
    facts,
    "en",
    fallback,
  );
  assert.equal(set.origin, "fallback");
  assert.equal(set.choices.length, 1);
  assert.equal(set.choices[0]?.label, fallback.label);
});

test("a weak answer keeps the sharper line first and a bad list falls back to one", async () => {
  const question: Question = {
    id: "DP-0.2",
    module: "towel-check",
    depth: ["deep"],
    ask: "What came before this shop site?",
    why: "A prior page tells us what to keep.",
    input: ["text"],
    skipDefault: "No prior site.",
    writes: ["PROJECT.md#history"],
    pushbackIf: ["it's fine"],
  };
  const sharper = "What is the one page this shop site should publish first?";
  const model = asThink(async () =>
    hit({
      vague: true,
      quote: "it's fine",
      sharperChoice: sharper,
      choices: [
        row("A", "Show the tin on the page.", "upload:tins.jpg"),
        row("B", "Keep the menu from the crawl.", "crawl:menu"),
      ],
    }),
  );
  const judgement = await judgePushback(question, "it's fine", 0, { think: model, facts, language: "en" });
  assert.equal(judgement.action, "push");
  assert.equal(judgement.choicesOrigin, "model");
  assert.equal(judgement.choices?.[0]?.label, sharper);
  assert.equal(judgement.choices?.length, 3);

  const bad = followUpChoices(
    { choices: [{ id: "Z", label: "Nope", why: "Nope", source: "upload:missing.jpg" }] },
    sharper,
    facts,
    "en",
  );
  assert.equal(bad.origin, "fallback");
  assert.equal(bad.choices.length, 1);
  assert.equal(bad.choices[0]?.label, sharper);
});

test("an assumed pick is stored as SUGGESTED and the next card is asked", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-assumed-"));
  try {
    const dir = path.join(projectDir, "interview");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "tree.yaml"),
      `questions:
  - id: DP-0.1
    module: towel-check
    depth: [express, standard, deep]
    ask: "Is this shop yours?"
    why: "The desk needs the name on the door."
    input: [text]
    skip_default: "The shop is theirs."
    suggest: "A standing line for the shop."
    writes:
      - "PROJECT.md#owner"
  - id: DP-0.2
    module: towel-check
    depth: [express, standard, deep]
    ask: "What came before this shop site?"
    why: "A prior page tells us what to keep."
    input: [text]
    skip_default: "No prior site."
    writes:
      - "PROJECT.md#history"
`,
      "utf8",
    );
    const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
    const model = asThink(async (req) => {
      if (req.task !== "guide-message") throw new Error(`unexpected ${req.task}`);
      return hit({
        message: "What came before this shop site?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const picked = "Show the tin on the page.";
    const turn = await runTurn(session, { kind: "answer", text: picked, assumed: true }, { think: model });
    assert.equal(turn.questionId, "DP-0.2");
    assert.equal(turn.status, "asked");
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    assert.equal(saved.answers.length, 1);
    assert.equal(saved.answers[0]?.status, "SUGGESTED");
    assert.equal(saved.answers[0]?.value, picked);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
