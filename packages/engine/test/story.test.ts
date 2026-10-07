import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARCHETYPES,
  StoryError,
  buildStory,
  countWords,
  expandOnly,
  pickArchetype,
  positioningLine,
} from "../src/index.ts";
import type { AnswerRecord, StoryPack, WhyDraft } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const storySource = path.resolve(here, "..", "src", "brand", "story.ts");
const barrelSource = path.resolve(here, "..", "src", "brand", "index.ts");

const SITE = "The stall exists so regulars can find the tea.";
const VISITOR = "a night regular";
const OFFER = "a tin of tea";
const BRAND = "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.";
const NAME = "Night Stall";
const YEAR = /\b(?:19|20)\d{2}\b/;

function answer(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function why(brandWhy = BRAND, siteWhy = SITE): WhyDraft {
  return {
    siteWhy,
    brandWhy,
    status: "ASSUMED",
    warnings: [],
    siteTruncated: false,
  };
}

function base(extra: AnswerRecord[] = []): AnswerRecord[] {
  return [
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", OFFER),
    ...extra,
  ];
}

function pack(extra: AnswerRecord[] = [], name = NAME, draft = why()): StoryPack {
  return buildStory({ answers: base(extra), why: draft, name });
}

function prose(story: StoryPack): string {
  return [story.positioning, story.words25, story.words100, story.words300, ...story.holes].join("\n");
}

function yearsIn(text: string): string[] {
  return [...text.matchAll(new RegExp(YEAR, "g"))].map((match) => match[0]);
}

test("countWords splits on whitespace and drops empty pieces", () => {
  assert.equal(countWords("one two  three"), 3);
  assert.equal(countWords("one\ttwo\nthree  four"), 4);
  assert.equal(countWords("   "), 0);
  assert.equal(countWords("solo"), 1);
});

test("care words map to caretaker and the status stays assumed", () => {
  const care = "care caring cares nurture protect comfort heal caring care";
  const story = pack([answer("DP-1.6", "ANSWERED", care)]);
  const picked = pickArchetype(care);
  assert.equal(story.archetype, "caretaker");
  assert.equal(story.archetypeStatus, "ASSUMED");
  assert.equal(picked.label, "caretaker");
  assert.equal(picked.status, "ASSUMED");
  assert.equal(picked.tie, false);
  assert.equal(story.holes.includes("archetype tie"), false);
  for (const label of ARCHETYPES) {
    assert.equal(prose(story).includes(label), false, label);
  }
});

test("a higher score wins outright", () => {
  const story = pack([answer("DP-1.6", "ANSWERED", "care care create")]);
  assert.equal(story.archetype, "caretaker");
  assert.equal(story.holes.includes("archetype tie"), false);
});

test("a tie picks the earlier archetype and records the hole", () => {
  const story = pack([answer("DP-1.6", "ANSWERED", "Care CREATE")]);
  const picked = pickArchetype("Care CREATE");
  assert.equal(story.archetype, "caretaker");
  assert.equal(picked.tie, true);
  assert.equal(picked.status, "ASSUMED");
  assert.ok(story.holes.includes("archetype tie"));
  assert.deepEqual(ARCHETYPES.indexOf("caretaker") < ARCHETYPES.indexOf("creator"), true);
});

test("no keyword is a tie, so the first label is assumed", () => {
  const picked = pickArchetype("");
  const story = pack();
  assert.equal(picked.label, "caretaker");
  assert.equal(picked.status, "ASSUMED");
  assert.equal(picked.tie, true);
  assert.equal(story.archetype, "caretaker");
  assert.equal(story.archetypeStatus, "ASSUMED");
  assert.ok(story.holes.includes("archetype tie"));
});

test("the latest answer for an id is the one that is scored", () => {
  const story = pack([
    answer("DP-1.6", "ANSWERED", "care care care"),
    answer("DP-1.6", "ANSWERED", "create create create"),
  ]);
  assert.equal(story.archetype, "creator");
  assert.equal(story.holes.includes("archetype tie"), false);
});

test("positioning uses the visitor, the name, the offer, and the site why", () => {
  const line = positioningLine({ visitor: VISITOR, name: NAME, offer: OFFER, siteWhy: SITE });
  assert.equal(line, `For ${VISITOR}, ${NAME} is the ${OFFER} that ${SITE}`);
  assert.equal(pack().positioning, line);
});

test("positioning throws when the visitor or the offer is empty", () => {
  const cases = [
    { visitor: "  ", offer: OFFER },
    { visitor: "!!!", offer: OFFER },
    { visitor: VISITOR, offer: "" },
    { visitor: VISITOR, offer: "   " },
  ];
  for (const item of cases) {
    assert.throws(
      () => positioningLine({ ...item, name: NAME, siteWhy: SITE }),
      (error: unknown) => {
        assert.ok(error instanceof StoryError);
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
  }
  assert.throws(
    () => buildStory({ answers: [answer("DP-2.7", "ANSWERED", OFFER)], why: why(), name: NAME }),
    (error: unknown) => error instanceof StoryError,
  );
});

test("a missing name becomes this practice", () => {
  for (const name of ["", "   ", "!!!"]) {
    const line = positioningLine({ visitor: VISITOR, name, offer: OFFER, siteWhy: SITE });
    assert.equal(line, `For ${VISITOR}, this practice is the ${OFFER} that ${SITE}`);
  }
});

test("a long name is truncated in the positioning line only", () => {
  const name = `${"North ".repeat(10)}TAIL`;
  assert.ok(name.length > 60);
  const story = pack([], name);
  const head = name.slice(0, 60).trimEnd();
  assert.ok(story.positioning.includes(head));
  assert.equal(story.positioning.includes("TAIL"), false);
  assert.equal(story.words25.includes("TAIL"), false);
  assert.ok(story.words100.includes("TAIL"));
  assert.ok(story.words300.includes(name));
});

test("exclamation marks and a banned word are stripped from the line and the long stories", () => {
  const story = buildStory({
    answers: base([
      answer("DP-2.6", "ANSWERED", "Ada!"),
      answer("DP-2.7", "ANSWERED", "an elevated elevate tin!"),
    ]),
    why: why(),
    name: "Stall!",
  });
  assert.equal(story.positioning, "For Ada, Stall is the an elevated tin that The stall exists so regulars can find the tea.");
  assert.equal(story.positioning.includes("!"), false);
  assert.equal(story.words100.includes("!"), false);
  assert.equal(story.words300.includes("!"), false);
  assert.match(story.positioning, /\belevated\b/);
  assert.match(story.words100, /\belevated\b/);
  assert.doesNotMatch(story.positioning, /\belevate\b/);
  assert.doesNotMatch(story.words100, /\belevate\b/);
  assert.doesNotMatch(story.words300, /\belevate\b/);
});

test("the 25-word field equals the brand why", () => {
  const draft = why("The night stall keeps a tin ready for the regular who asks.");
  const story = pack([], NAME, draft);
  assert.equal(story.words25, draft.brandWhy);
  assert.notEqual(countWords(story.words25), 25);
});

test("a tiny fact set still returns three story fields inside the word caps", () => {
  const story = pack();
  assert.equal(story.words25, BRAND);
  assert.notEqual(story.words100, "");
  assert.notEqual(story.words300, "");
  assert.ok(Math.abs(countWords(story.words100) - 100) <= 15, `words100 ${countWords(story.words100)}`);
  assert.ok(Math.abs(countWords(story.words300) - 300) <= 15, `words300 ${countWords(story.words300)}`);
});

test("expandOnly does not invent a year", () => {
  const facts = ["a night regular", "a tin of tea", "Edmonton"];
  for (const target of [100, 300]) {
    const story = expandOnly(facts, target);
    assert.doesNotMatch(story, YEAR);
    assert.equal(story.includes("!"), false);
  }
  const story = pack([answer("DP-4.4", "ANSWERED", "Edmonton")]);
  assert.doesNotMatch(story.positioning, YEAR);
  assert.doesNotMatch(story.words25, YEAR);
  assert.doesNotMatch(story.words100, YEAR);
  assert.doesNotMatch(story.words300, YEAR);
});

test("a year in the facts may be repeated and no other year is added", () => {
  const story = expandOnly(["opened in 1998", "a tin of tea"], 100);
  assert.match(story, /\b1998\b/);
  for (const year of yearsIn(story)) assert.equal(year, "1998");
  assert.doesNotMatch(expandOnly(["opened in 1998"], 300).replaceAll("1998", ""), YEAR);
});

test("the long story shows a founding hole instead of an anecdote", () => {
  const story = pack();
  const medium = expandOnly(["a night regular", "a tin of tea"], 100);
  const long = expandOnly(["a night regular", "a tin of tea"], 300);
  assert.equal(medium.includes("[needs a fact: founding story]"), false);
  assert.equal(long.includes("[needs a fact: founding story]"), true);
  assert.equal(long.split("[needs a fact: founding story]").length, 2);
  assert.ok(story.holes.includes("founding story"));
  assert.ok(story.words300.includes("[needs a fact: founding story]"));
  assert.equal(story.words100.includes("founding story"), false);
  assert.equal(story.words25.includes("founding story"), false);
  assert.doesNotMatch(story.words300, /\bfounded\b/i);
  assert.doesNotMatch(story.words300, /\bfounder\b/i);
  assert.doesNotMatch(story.words100, /\bEdmonton\b/);
  assert.doesNotMatch(story.words300, /\bEdmonton\b/);
});

test("a dedicated place and a place inside the open notes are kept, and a city is not invented", () => {
  const named = pack([answer("DP-4.4", "ANSWERED", "Edmonton")]);
  assert.ok(named.words100.includes("Edmonton"));
  assert.ok(named.words300.includes("Edmonton"));

  const noted = pack([answer("DP-9.5", "ANSWERED", "We are based in Red Deer. The van is old.")]);
  assert.ok(noted.words100.includes("Red Deer"));
  assert.equal(noted.words100.includes("van"), false);
  assert.equal(noted.words300.includes("van"), false);

  const skipped = pack([
    answer("DP-4.4", "SKIPPED", "Customers not placed."),
    answer("DP-1.9", "SKIPPED", "No inventory yet. Nothing marked protected."),
    answer("DP-9.5", "SKIPPED", "Nothing else."),
  ]);
  assert.equal(skipped.words100.includes("Customers not placed"), false);
  assert.equal(skipped.words100.includes("Nothing marked protected"), false);
  assert.equal(skipped.words300.includes("Nothing else"), false);
});

test("worldwide is a place the user stated", () => {
  const story = pack([answer("DP-4.4", "ANSWERED", "worldwide")]);
  assert.ok(story.words100.includes("worldwide"));
});

test("a proof sentence is dropped and the hole is recorded", () => {
  const inventory =
    "Keep the green wordmark. A customer testimonial sits in the drawer. Rated 5 stars last spring. The wordmark stays.";
  const story = pack([answer("DP-1.9", "ANSWERED", inventory)]);
  const generated = expandOnly([inventory, OFFER], 300);
  for (const text of [story.words100, story.words300, generated]) {
    assert.equal(text.toLowerCase().includes("testimonial"), false);
    assert.equal(text.toLowerCase().includes("5 stars"), false);
    assert.ok(text.includes("green wordmark"));
    assert.ok(text.includes("wordmark stays"));
  }
  assert.ok(story.holes.includes("dropped a proof sentence"));
  assert.equal(story.positioning.toLowerCase().includes("testimonial"), false);
});

test("buildStory is pure and does not call the network", () => {
  const answers = base();
  const snapshot = answers.map((item) => ({ ...item }));
  const draft = why();
  const input = { answers, why: draft, name: NAME };
  assert.deepEqual(buildStory(input), buildStory(input));
  assert.deepEqual(answers, snapshot);
  const source = readFileSync(storySource, "utf8");
  const barrel = readFileSync(barrelSource, "utf8");
  assert.match(barrel, /buildStory/);
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(/grok/i.test(source), false);
  assert.equal(/\bany\b/.test(source), false);
  for (const label of ARCHETYPES) assert.ok(source.includes(label));
});
