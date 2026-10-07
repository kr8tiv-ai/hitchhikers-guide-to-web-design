import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildStory, positioningLine } from "../src/brand/story.ts";
import {
  BANNED_PHRASES,
  BANNED_WORDS,
  TAGLINE_WORD_CAP,
  VOICE_HEADINGS,
  buildTaglines,
  renderVoice,
  selectTaglines,
  wordCount,
} from "../src/brand/voice.ts";
import type { AnswerRecord } from "../src/required.ts";
import type { WhyDraft } from "../src/brand/why.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "voice.ts");
const source = readFileSync(sourcePath, "utf8");

const V2_WORDS = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "game-changer",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "cutting-edge",
  "journey",
  "tapestry",
  "landscape",
  "innovative",
] as const;

const BANNED_PROBE = /\b(?:elevate|seamless|innovative|cutting-edge|passionate|unlock)\b/i;

function answer(id: string, value: string): AnswerRecord {
  return { id, status: "ANSWERED", value };
}

function why(): WhyDraft {
  return {
    siteWhy: "the pot is ready",
    brandWhy: "Regulars come for loose tea because the pot is ready",
    status: "ASSUMED",
    warnings: [],
    siteTruncated: false,
  };
}

function kettleStory() {
  return buildStory({
    answers: [answer("DP-2.6", "regulars"), answer("DP-2.7", "loose tea")],
    why: why(),
    name: "Kettle",
  });
}

function section(markdown: string, title: string): string {
  const marker = `## ${title}\n`;
  const start = markdown.indexOf(marker);
  assert.ok(start >= 0, title);
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.trim();
}

function afterLines(markdown: string): string[] {
  return [...section(markdown, "Five rewrites").matchAll(/After: (.+)/g)].map((match) => match[1] ?? "");
}

function assertShortClean(lines: readonly string[]): void {
  const seen = new Set<string>();
  for (const line of lines) {
    assert.ok(wordCount(line) < TAGLINE_WORD_CAP, line);
    assert.equal(line.includes("!"), false, line);
    assert.equal(line.includes("\u2014"), false, line);
    assert.equal(BANNED_PROBE.test(line), false, line);
    assert.equal(/\boops\b/i.test(line), false, line);
    const key = line.toLowerCase();
    assert.equal(seen.has(key), false, line);
    seen.add(key);
  }
}

test("a tea-shop positioning line from buildStory keeps five short taglines", () => {
  const story = kettleStory();
  assert.equal(story.positioning, "For regulars, Kettle is the loose tea that the pot is ready");
  const doc = renderVoice({
    vibe: "warm, plain, specific",
    antiVibe: "loud, slick, cold",
    positioning: story.positioning,
    offer: "loose tea",
  });
  assert.deepEqual(doc.taglines, [
    "Loose tea for regulars",
    "Regulars for loose tea",
    "For regulars, loose tea",
    "Loose tea, regulars",
    "Regulars, loose tea",
  ]);
  assert.equal(doc.taglines.length, 5);
  assert.equal(doc.shortfall, false);
  assert.equal(doc.assumed, false);
  assertShortClean(doc.taglines);
  assert.deepEqual(doc.taglines, buildTaglines(story.positioning).taglines);

  for (const title of VOICE_HEADINGS) {
    assert.match(doc.markdown, new RegExp(`## ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  assert.match(section(doc.markdown, "Traits"), /Traits are this, not that/);
  assert.match(section(doc.markdown, "Traits"), /Warm, not loud/);
  assert.match(section(doc.markdown, "Traits"), /Plain, not slick/);
  assert.match(section(doc.markdown, "Traits"), /Specific, not cold/);
  assert.equal(doc.markdown.includes("ASSUMED"), false);

  assert.match(section(doc.markdown, "NN/g positions"), /Funny or serious: serious/);
  assert.match(section(doc.markdown, "NN/g positions"), /Formal or casual: casual/);
  assert.match(section(doc.markdown, "NN/g positions"), /Respectful or irreverent: respectful/);
  assert.match(section(doc.markdown, "NN/g positions"), /Enthusiastic or matter-of-fact: matter-of-fact/);

  const banned = section(doc.markdown, "Banned words");
  for (const word of V2_WORDS) assert.ok(BANNED_WORDS.includes(word), word);
  for (const word of BANNED_WORDS) assert.match(banned, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  for (const phrase of BANNED_PHRASES) assert.match(banned, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(banned, /it's not just X, it's Y/);

  const punctuation = section(doc.markdown, "Punctuation");
  assert.match(punctuation, /No exclamation marks in site copy/);
  assert.match(punctuation, /No em dashes in site copy/);

  assert.match(section(doc.markdown, "How we talk about the competitor"), /We do not name competitors in headlines\./);
  assert.match(section(doc.markdown, "How we talk about the competitor"), /We do not insult named businesses\./);

  const slogans = section(doc.markdown, "Slogans");
  for (const line of doc.taglines) assert.ok(slogans.includes(line), line);
  assert.match(slogans, /Shortfall: false/);

  const micro = section(doc.markdown, "Microcopy");
  assert.match(micro, /button: Order loose tea/);
  assert.match(micro, /error: That did not send\. Try again\./);
  assert.match(micro, /empty: Nothing is listed yet\./);
  const notFound = micro.match(/notFound: (.+)/)?.[1] ?? "";
  assert.equal(notFound, "This page is not here.");
  assert.match(notFound, /\.$/);
  assert.equal(notFound.includes("!"), false);
  assert.equal(/oops/i.test(notFound), false);
  assert.equal(/universe/i.test(notFound), false);
  assert.equal(micro.includes("!"), false);
  assert.equal(/learn more/i.test(micro), false);
  assert.equal(/get started/i.test(micro), false);

  const rewrites = section(doc.markdown, "Five rewrites");
  assert.equal(rewrites.match(/Before:/g)?.length, 5);
  assert.match(rewrites, /Before: We are passionate about innovative solutions/);
  const afters = afterLines(doc.markdown);
  assert.equal(afters.length, 5);
  for (const after of afters) {
    assert.equal(/\bpassionate\b/i.test(after), false, after);
    assert.equal(/\binnovative\b/i.test(after), false, after);
    assert.equal(after.includes("!"), false, after);
    assert.match(after, /loose tea/);
  }

  const spoken = [
    section(doc.markdown, "Slogans"),
    section(doc.markdown, "Microcopy"),
    section(doc.markdown, "Tone by situation"),
    section(doc.markdown, "How we talk about the product"),
    section(doc.markdown, "How we talk about the customer"),
    section(doc.markdown, "How we talk about price"),
    section(doc.markdown, "How we talk about ourselves"),
    ...afters,
  ].join("\n");
  assert.equal(BANNED_PROBE.test(spoken), false);
  assert.equal(doc.markdown.includes("!"), false);
  assert.equal(doc.markdown.includes("\u2014"), false);
  assert.ok(wordCount(doc.markdown) < 1200);
});

test("eight-word rearrangements are discarded and a night-stall line still yields five", () => {
  const positioning = positioningLine({
    visitor: "a night regular",
    name: "Night Stall",
    offer: "a tin of tea",
    siteWhy: "The stall exists so regulars can find the tea.",
  });
  const cut = buildTaglines(positioning);
  assert.deepEqual(cut.taglines, [
    "A tin of tea, a night regular",
    "A night regular, a tin of tea",
    "Night Stall a tin of tea",
    "A tin of tea, Night Stall",
    "Night Stall for a night regular",
  ]);
  assert.equal(cut.shortfall, false);
  assertShortClean(cut.taglines);
  assert.equal(cut.taglines.includes("A tin of tea for a night regular"), false);
  assert.equal(cut.taglines.includes("A night regular for a tin of tea"), false);
  assert.equal(cut.taglines.includes("For a night regular, a tin of tea"), false);
  assert.equal(wordCount("A tin of tea for a night regular"), 8);
});

test("a long positioning returns fewer than five and does not ship the long lines", () => {
  const positioning = positioningLine({
    visitor: "weekday morning commuter regulars",
    name: "The Early Kettle Room",
    offer: "small batch oolong leaf",
    siteWhy: "kettles stay hot",
  });
  const cut = buildTaglines(positioning);
  assert.deepEqual(cut.taglines, ["Small batch oolong leaf", "Weekday morning commuter regulars"]);
  assert.equal(cut.shortfall, true);
  assert.ok(cut.taglines.length < 5);
  assertShortClean(cut.taglines);
  assert.equal(cut.taglines.some((line) => wordCount(line) >= TAGLINE_WORD_CAP), false);
});

test("a banned offer is filtered out of the taglines", () => {
  const positioning =
    "For weekday morning commuter regulars, The Early Kettle Room is the elevate the leaf that water is hot";
  const cut = buildTaglines(positioning);
  assert.deepEqual(cut.taglines, ["Weekday morning commuter regulars"]);
  assert.equal(cut.shortfall, true);
  assert.equal(cut.taglines.some((line) => /\belevate\b/i.test(line)), false);
  assert.equal(cut.taglines.some((line) => line.includes("!")), false);
});

test("selectTaglines filters length, punctuation, banned words, and duplicates", () => {
  const eight = "one two three four five six seven eight";
  const nine = "one two three four five six seven eight nine";
  assert.equal(wordCount(eight), 8);
  assert.equal(wordCount(nine), 9);
  const cut = selectTaglines([
    nine,
    eight,
    "Elevate the cup",
    "innovative tea",
    "Tea for regulars!",
    "Tea \u2014 regulars",
    "In today's fast-paced world tea",
    "loose tea for regulars",
    "Loose tea for regulars",
    "Kettle for regulars",
    "A quiet pot",
    "Leaf in the cup",
    "Regulars and the kettle",
    "One more clean line",
  ]);
  assert.deepEqual(cut.taglines, [
    "Loose tea for regulars",
    "Kettle for regulars",
    "A quiet pot",
    "Leaf in the cup",
    "Regulars and the kettle",
  ]);
  assert.equal(cut.shortfall, false);
  assert.equal(cut.taglines.includes("One more clean line"), false);
  assertShortClean(cut.taglines);

  const kept = selectTaglines(["Elevated tea for two", "innovation for regulars"]);
  assert.deepEqual(kept.taglines, ["Elevated tea for two", "Innovation for regulars"]);
  assert.equal(kept.shortfall, true);

  const dupes = selectTaglines(["tea for regulars", "tea for regulars", "Tea for regulars"]);
  assert.deepEqual(dupes.taglines, ["Tea for regulars"]);
  assert.equal(dupes.shortfall, true);
});

test("an empty never-word list marks traits ASSUMED and uses the anti-slop not-side", () => {
  const story = kettleStory();
  for (const antiVibe of ["", "   ", ",,", "!"]) {
    const doc = renderVoice({
      vibe: "warm, plain, specific",
      antiVibe,
      positioning: story.positioning,
      offer: "loose tea",
    });
    assert.equal(doc.assumed, true, antiVibe);
    const traits = section(doc.markdown, "Traits");
    assert.match(traits, /Status: ASSUMED/);
    assert.match(traits, /Warm, not seamless/);
    assert.match(traits, /Plain, not innovative/);
    assert.match(traits, /Specific, not cutting-edge/);
    assert.equal(doc.taglines.length, 5);
    assert.equal(doc.markdown.includes("!"), false);
  }
});

test("fewer than three pairs stays ASSUMED and fills the open slot from the anti-slop list", () => {
  const doc = renderVoice({
    vibe: "warm, plain, specific",
    antiVibe: "loud, slick",
    positioning: kettleStory().positioning,
    offer: "loose tea",
  });
  assert.equal(doc.assumed, true);
  const traits = section(doc.markdown, "Traits");
  assert.match(traits, /Warm, not loud/);
  assert.match(traits, /Plain, not slick/);
  assert.match(traits, /Specific, not cutting-edge/);
});

test("a funny vibe word sets that NN/g pole and four extra words still map the first three", () => {
  const doc = renderVoice({
    vibe: "funny, plain, specific, sparkly",
    antiVibe: "loud, slick, cold, harsh",
    positioning: kettleStory().positioning,
    offer: "loose tea",
  });
  assert.equal(doc.assumed, false);
  assert.match(section(doc.markdown, "Traits"), /Funny, not loud/);
  assert.match(section(doc.markdown, "NN/g positions"), /Funny or serious: funny/);
  assert.equal(section(doc.markdown, "Traits").includes("sparkly"), false);
});

test("rewrites follow the offer argument and taglines follow the positioning line", () => {
  const story = kettleStory();
  const doc = renderVoice({
    vibe: "warm, plain, specific",
    antiVibe: "loud, slick, cold",
    positioning: story.positioning,
    offer: "biscuits!",
  });
  assert.ok(doc.taglines.every((line) => /loose tea|regulars/i.test(line)));
  assert.equal(doc.taglines.some((line) => /biscuits/i.test(line)), false);
  for (const after of afterLines(doc.markdown)) assert.match(after, /biscuits/);
  assert.match(section(doc.markdown, "Microcopy"), /button: Order biscuits/);
  assert.equal(doc.markdown.includes("!"), false);
  assert.equal(/\bpassionate\b/i.test(afterLines(doc.markdown).join(" ")), false);
});

test("empty input still ships the voice file, a plain 404, and a clean rewrite", () => {
  const doc = renderVoice({ vibe: "", antiVibe: " ", positioning: "", offer: "" });
  assert.equal(doc.assumed, true);
  assert.equal(doc.shortfall, true);
  assert.deepEqual(doc.taglines, []);
  assert.match(section(doc.markdown, "Traits"), /Direct, not seamless/);
  assert.match(section(doc.markdown, "Traits"), /Specific, not innovative/);
  assert.match(section(doc.markdown, "Traits"), /Plain, not cutting-edge/);
  assert.match(section(doc.markdown, "Slogans"), /No tagline cleared the filter/);
  assert.match(section(doc.markdown, "Slogans"), /Shortfall: true/);
  const notFound = section(doc.markdown, "Microcopy").match(/notFound: (.+)/)?.[1] ?? "";
  assert.equal(notFound, "This page is not here.");
  const passionate = afterLines(doc.markdown)[0] ?? "";
  assert.match(section(doc.markdown, "Five rewrites"), /We are passionate about innovative solutions/);
  assert.equal(/\bpassionate\b/i.test(passionate), false);
  assert.equal(/\binnovative\b/i.test(passionate), false);
  assert.match(passionate, /the work/);
  assert.equal(doc.markdown.includes("!"), false);
  assert.equal(doc.markdown.includes("\u2014"), false);
  assert.equal(/oops/i.test(doc.markdown), false);
  assert.ok(wordCount(doc.markdown) < 1200);
});

test("a huge vibe list stays under 1,200 words and a banged offer is stripped", () => {
  const vibe = Array.from({ length: 400 }, (_, index) => `word${index}`).join(", ");
  const doc = renderVoice({
    vibe: `warm!, plain, specific, ${vibe}`,
    antiVibe: "loud, slick, cold",
    positioning: "For regulars, Kettle is the loose tea! that the pot is ready",
    offer: "loose tea!",
  });
  assert.equal(doc.assumed, false);
  assert.ok(wordCount(doc.markdown) < 1200);
  assert.equal(doc.markdown.includes("!"), false);
  assertShortClean(doc.taglines);
  assert.equal(doc.taglines.some((line) => line.includes("!")), false);
});

test("the module does not call a model", () => {
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(/from\s+["'][^"']*\/ai\//.test(source), false);
  assert.equal(source.includes("api.x.ai"), false);
  assert.match(source, /061/);
  assert.equal(/don't panic/i.test(source), false);
  assert.equal(/\buniverse\b/i.test(source), false);
  assert.equal(source.includes("\u2014"), false);
});
