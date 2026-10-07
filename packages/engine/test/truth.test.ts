import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildStory } from "../src/brand/story.ts";
import { evidenceFromAnswers, lintClaims } from "../src/brand/truth.ts";
import { renderVoice } from "../src/brand/voice.ts";
import type { Evidence } from "../src/brand/truth.ts";
import type { WhyDraft } from "../src/brand/why.ts";
import type { AnswerRecord } from "../src/required.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "truth.ts");

const SITE = "The stall exists so regulars can find the tea.";
const VISITOR = "a night regular";
const OFFER = "a tin of tea";
const BRAND = "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.";
const NAME = "Night Stall";

function answer(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function why(): WhyDraft {
  return {
    siteWhy: SITE,
    brandWhy: BRAND,
    status: "ASSUMED",
    warnings: [],
    siteTruncated: false,
  };
}

function empty(): Evidence {
  return { quotes: [], awards: [], numbers: [] };
}

function teaAnswers(): AnswerRecord[] {
  return [
    answer("DP-2.1", "ANSWERED", SITE),
    answer("DP-2.6", "ANSWERED", VISITOR),
    answer("DP-2.7", "ANSWERED", OFFER),
  ];
}

test("a fake star rating is a blocker", () => {
  assert.deepEqual(lintClaims("Loved by 5 stars", empty()), {
    ok: false,
    hits: [{ line: 1, pattern: "stars" }],
  });
  assert.deepEqual(lintClaims("Rated 4.5 stars", empty()).hits, [{ line: 1, pattern: "stars" }]);
  assert.deepEqual(lintClaims("A 5 star stall", empty()).hits, [{ line: 1, pattern: "stars" }]);
});

test("line numbers are 1-based", () => {
  const markdown = "The stall is open.\nLoved by 5 stars\nUp 40%";
  assert.deepEqual(lintClaims(markdown, empty()).hits, [
    { line: 2, pattern: "stars" },
    { line: 3, pattern: "percent" },
  ]);
  const crlf = "The stall is open.\r\nLoved by 5 stars";
  assert.deepEqual(lintClaims(crlf, empty()).hits, [{ line: 2, pattern: "stars" }]);
});

test("an empty markdown passes", () => {
  assert.deepEqual(lintClaims("", empty()), { ok: true, hits: [] });
  assert.deepEqual(lintClaims("\n\n", empty()), { ok: true, hits: [] });
});

test("a soft answer does not count as evidence", () => {
  const soft = evidenceFromAnswers([
    answer("DP-8.2", "SOFT", "5 stars"),
    answer("DP-8.2", "SOFT", "grew 40%"),
    answer("DP-8.2", "SOFT", "We are award-winning"),
    answer("DP-8.2", "SUGGESTED", "\"A real quote.\""),
  ]);
  assert.deepEqual(soft, empty());
  assert.equal(lintClaims("Loved by 5 stars", soft).ok, false);
  assert.equal(lintClaims("Up 40%", soft).ok, false);
  assert.equal(lintClaims("An award-winning stall", soft).ok, false);
  assert.equal(lintClaims("## Testimonials", soft).ok, false);
});

test("a skipped star phrase does not license the line", () => {
  const skipped = evidenceFromAnswers([answer("DP-8.2", "SKIPPED", "5 stars")]);
  assert.deepEqual(skipped.quotes, []);
  assert.equal(lintClaims("Loved by 5 stars", skipped).ok, false);
});

test("answered and imported text can support a number", () => {
  const answered = evidenceFromAnswers([
    answer("DP-8.2", "ANSWERED", "Regulars left us 5 stars on the door."),
  ]);
  assert.deepEqual(lintClaims("Loved by 5 stars", answered), { ok: true, hits: [] });
  assert.equal(lintClaims("Loved by 4.5 stars", answered).ok, false);
  assert.equal(lintClaims("Loved by 5 star", answered).ok, false);

  const fifteen = evidenceFromAnswers([answer("DP-8.2", "ANSWERED", "15 stars")]);
  assert.equal(lintClaims("Loved by 5 stars", fifteen).ok, false);

  const imported = evidenceFromAnswers([answer("DP-8.2", "IMPORTED", "Revenue grew 40% last spring.")]);
  assert.deepEqual(imported.numbers, ["40"]);
  assert.equal(lintClaims("Up 40%", imported).ok, true);
  assert.equal(lintClaims("Up 4%", imported).ok, false);
  assert.equal(lintClaims("Up 400%", imported).ok, false);
  assert.equal(lintClaims("/* width: 40% */", imported).ok, true);

  const named = evidenceFromAnswers([answer("DP-8.2", "ANSWERED", "\"Ada at the mill liked the tin.\"")]);
  assert.equal(named.quotes.length, 1);
  assert.equal(lintClaims("## Testimonials", named).ok, true);
  assert.equal(lintClaims("Loved by 5 stars", named).ok, false);
});

test("award-winning is case insensitive and needs award evidence", () => {
  assert.deepEqual(lintClaims("AWARD-WINNING tea", empty()).hits, [
    { line: 1, pattern: "award-winning" },
  ]);
  assert.deepEqual(lintClaims("Award-Winning tea", empty()).hits, [
    { line: 1, pattern: "award-winning" },
  ]);
  const stated = evidenceFromAnswers([answer("DP-8.2", "ANSWERED", "We won a provincial award.")]);
  assert.equal(stated.awards.length, 1);
  assert.equal(lintClaims("An award-winning stall", stated).ok, true);
  const bare = evidenceFromAnswers([answer("DP-8.2", "ANSWERED", "SOTD")]);
  assert.deepEqual(bare.awards, []);
  assert.equal(lintClaims("An award-winning stall", bare).ok, false);
  assert.equal(lintClaims("An award-winning stall", { quotes: [], awards: ["SOTD"], numbers: [] }).ok, true);
});

test("a percent in a css note is still a hit", () => {
  assert.deepEqual(lintClaims("/* width: 40%; */", empty()), {
    ok: false,
    hits: [{ line: 1, pattern: "percent" }],
  });
});

test("a testimonials heading needs quote evidence", () => {
  assert.deepEqual(lintClaims("## Testimonials", empty()), {
    ok: false,
    hits: [{ line: 1, pattern: "testimonials" }],
  });
  assert.deepEqual(lintClaims("##  testimonials", empty()).hits, [
    { line: 1, pattern: "testimonials" },
  ]);
  const allowed = lintClaims("## Testimonials", {
    quotes: ["The tin lasted the winter."],
    awards: [],
    numbers: [],
  });
  assert.deepEqual(allowed, { ok: true, hits: [] });
  const mixed = lintClaims("## Testimonials\nLoved by 5 stars", {
    quotes: ["The tin lasted the winter."],
    awards: [],
    numbers: [],
  });
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.hits, [{ line: 2, pattern: "stars" }]);
});

test("one line can record every pattern", () => {
  const markdown = "Award-winning, loved by 5 stars, up 20%";
  assert.deepEqual(lintClaims(markdown, empty()).hits, [
    { line: 1, pattern: "stars" },
    { line: 1, pattern: "percent" },
    { line: 1, pattern: "award-winning" },
  ]);
});

test("a clean tea story pack passes", () => {
  const answers = teaAnswers();
  const story = buildStory({ answers, why: why(), name: NAME });
  const voice = renderVoice({
    vibe: "warm, plain, specific",
    antiVibe: "loud, slick, cold",
    positioning: story.positioning,
    offer: OFFER,
  });
  const markdown = [story.positioning, story.words25, story.words100, story.words300, voice.markdown].join("\n");
  const evidence = evidenceFromAnswers(answers);
  assert.deepEqual(evidence, empty());
  assert.deepEqual(lintClaims(markdown, evidence), { ok: true, hits: [] });
  assert.deepEqual(lintClaims(markdown, empty()), { ok: true, hits: [] });
  assert.equal(lintClaims(`${markdown}\nAn award-winning stall`, evidence).ok, false);
  assert.equal(lintClaims(`${markdown}\n## Testimonials`, evidence).ok, false);
});

test("lintClaims returns hits only and does not use the network", () => {
  const markdown = "Loved by 5 stars\n";
  const result = lintClaims(markdown, empty());
  assert.equal(markdown, "Loved by 5 stars\n");
  assert.deepEqual(Object.keys(result).sort(), ["hits", "ok"]);
  assert.equal(result.ok, false);
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(/\bany\b/.test(source), false);
  assert.equal(source.includes("writeFile"), false);
});
