import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_WORD_CAP,
  BrandLengthError,
  BrandSecretError,
  BrandTruthError,
  compileBrand,
  scanSecrets,
} from "../src/brand/brain.ts";
import type { BrandParts } from "../src/brand/brain.ts";
import { buildImagery } from "../src/brand/imagery.ts";
import { buildStory } from "../src/brand/story.ts";
import { buildTeardown } from "../src/brand/teardown.ts";
import { proposePalettes, renderCssVars } from "../src/brand/tokens.ts";
import { evidenceFromAnswers } from "../src/brand/truth.ts";
import { renderVoice } from "../src/brand/voice.ts";
import { compileWhy } from "../src/brand/why.ts";
import type { AnswerRecord } from "../src/required.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "brain.ts");

const SITE = "The stall exists so regulars can find the tea.";
const VISITOR = "a night regular";
const OFFER = "a tin of tea";
const NAME = "Night Stall";
const LONG_MARK = "kettlestorylongformmarker";

const SECTION_ORDER = [
  "# Purpose",
  "## Positioning",
  "## Story",
  "## Voice",
  "## Tokens",
  "## Imagery",
  "## Neighbors",
] as const;

function answer(id: string, value: string): AnswerRecord {
  return { id, status: "ANSWERED", value };
}

function fill(word: string, count: number): string {
  return Array.from({ length: count }, () => word).join(" ");
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function between(markdown: string, start: string, end: string): string {
  const at = markdown.indexOf(start);
  assert.ok(at >= 0, start);
  const rest = markdown.slice(at + start.length);
  const stop = rest.indexOf(end);
  assert.ok(stop >= 0, end);
  return rest.slice(0, stop);
}

function skeleton(): BrandParts {
  return {
    why: {
      siteWhy: SITE,
      brandWhy: "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.",
      status: "ASSUMED",
      warnings: [],
      siteTruncated: false,
    },
    story: {
      archetype: "caretaker",
      archetypeStatus: "ASSUMED",
      positioning: "For a night regular, Night Stall is the a tin of tea that The stall exists so regulars can find the tea.",
      words25: "A night regular comes for a tin of tea because the stall exists so regulars can find the tea.",
      words100: "The answers give this: a night regular.",
      words300: `${LONG_MARK} The long stall story stays until the cap forces a cut.`,
      holes: [],
    },
    teardownMarkdown: "Sameness was not computed.",
    voiceMarkdown: "## Banned words\n\n- seamless",
    cssVars: ":root {\n  --paper: #f4f0e6;\n  --ink: #1c1915;\n  --signal: #9a3412;\n}",
    imageryMarkdown: "Photograph the work that already exists.",
    evidence: { quotes: [], awards: [], numbers: [] },
  };
}

function teaParts(): BrandParts {
  const answers = [
    answer("DP-2.1", SITE),
    answer("DP-2.6", VISITOR),
    answer("DP-2.7", OFFER),
  ];
  const why = compileWhy(answers);
  const story = buildStory({ answers, why, name: NAME });
  const voice = renderVoice({
    vibe: "warm, plain, specific",
    antiVibe: "loud, slick, cold",
    positioning: story.positioning,
    offer: OFFER,
  });
  const teardown = buildTeardown({
    reportMarkdown: [
      "# Competitors",
      "",
      "No shared title pattern in this set.",
      "",
      "## https://b.example",
      "",
      "- Title: Night stall",
      "",
    ].join("\n"),
    envy: "Their grid is quiet.",
    boredom: "Every shop looks the same.",
  });
  const palettes = proposePalettes({ seedHex: "#c4512c", vibe: "warm tea shop" });
  const palette = palettes[0];
  assert.ok(palette);
  const imagery = buildImagery({
    protectedNotes: "",
    vibe: "warm shop light",
    paletteName: palette.name,
  });
  return {
    why,
    story,
    teardownMarkdown: teardown.markdown,
    voiceMarkdown: voice.markdown,
    cssVars: renderCssVars(palette),
    imageryMarkdown: imagery.markdown,
    evidence: evidenceFromAnswers(answers),
  };
}

function assertOrder(markdown: string): void {
  let at = -1;
  for (const title of SECTION_ORDER) {
    const next = markdown.indexOf(title);
    assert.ok(next > at, title);
    at = next;
  }
}

test("the tea-shop fixture compiles under the cap", () => {
  const parts = teaParts();
  const result = compileBrand(parts);
  assert.ok(result.words <= BRAND_WORD_CAP);
  assert.equal(result.words, countWords(result.markdown));
  assert.ok(result.markdown.startsWith("# Purpose"));
  assert.equal(result.markdown.startsWith("---"), false);
  assert.match(result.markdown, /^Status: draft$/m);
  assert.match(result.markdown, /assumed until approved/);
  assert.ok(result.markdown.includes(parts.story.positioning));
  assert.ok(result.markdown.includes(parts.story.words25));
  assert.ok(result.markdown.includes(parts.story.words100));
  assert.match(between(result.markdown, "## Voice", "## Tokens"), /Banned/);
  assert.match(result.markdown, /```css[\s\S]*--paper:[\s\S]*```/);
  assert.ok(result.markdown.includes(parts.why.siteWhy));
  assert.ok(result.markdown.includes("No shared title pattern"));
  assert.equal(result.markdown.includes("\r"), false);
  assert.equal(result.markdown.includes("sk-"), false);
  assert.equal(result.markdown.includes("xai-"), false);
  assert.equal(result.markdown.includes("DP-2.1"), false);
  assert.equal(result.markdown.includes("\"status\":"), false);
  assertOrder(result.markdown);
  if (result.markdown.includes("### Three hundred")) {
    assert.ok(result.markdown.includes(parts.story.words300));
  }
});

test("an empty teardown still compiles", () => {
  const parts = teaParts();
  parts.teardownMarkdown = "";
  const result = compileBrand(parts);
  assert.match(result.markdown, /## Neighbors/);
  assert.ok(result.words <= BRAND_WORD_CAP);
  assert.match(between(result.markdown, "## Voice", "## Tokens"), /Banned/);
});

test("CRLF input is normalized", () => {
  const lf = teaParts();
  const crlf: BrandParts = {
    ...lf,
    why: {
      ...lf.why,
      siteWhy: lf.why.siteWhy.replaceAll("\n", "\r\n"),
      brandWhy: lf.why.brandWhy.replaceAll("\n", "\r\n"),
    },
    story: {
      ...lf.story,
      positioning: lf.story.positioning.replaceAll("\n", "\r\n"),
      words25: lf.story.words25.replaceAll("\n", "\r\n"),
      words100: lf.story.words100.replaceAll("\n", "\r\n"),
      words300: lf.story.words300.replaceAll("\n", "\r\n"),
    },
    teardownMarkdown: lf.teardownMarkdown.replaceAll("\n", "\r\n"),
    voiceMarkdown: lf.voiceMarkdown.replaceAll("\n", "\r\n"),
    cssVars: lf.cssVars.replaceAll("\n", "\r\n"),
    imageryMarkdown: lf.imageryMarkdown.replaceAll("\n", "\r\n"),
  };
  const left = compileBrand(lf);
  const right = compileBrand(crlf);
  assert.equal(right.markdown.includes("\r"), false);
  assert.equal(left.markdown, right.markdown);
  assert.equal(left.words, right.words);
});

test("a word count of exactly 1500 passes", () => {
  const probe = compileBrand(skeleton());
  const gap = BRAND_WORD_CAP - probe.words;
  assert.ok(gap > 0);
  const parts = skeleton();
  parts.teardownMarkdown = `${parts.teardownMarkdown}\n${fill("tin", gap)}`;
  const exact = compileBrand(parts);
  assert.equal(exact.words, BRAND_WORD_CAP);
  assert.equal(exact.words, countWords(exact.markdown));
  assert.ok(exact.markdown.includes(LONG_MARK));
  assert.match(between(exact.markdown, "## Voice", "## Tokens"), /Banned/);
});

test("1501 plain words take the cut path and keep Banned", () => {
  const probe = compileBrand(skeleton());
  const parts = skeleton();
  parts.teardownMarkdown = `${parts.teardownMarkdown}\n${fill("tin", BRAND_WORD_CAP - probe.words + 1)}`;
  const cut = compileBrand(parts);
  assert.ok(cut.words <= BRAND_WORD_CAP);
  assert.equal(cut.markdown.includes(LONG_MARK), false);
  assert.ok(cut.markdown.includes(parts.story.words25));
  assert.ok(cut.markdown.includes(parts.story.words100));
  assert.match(between(cut.markdown, "## Voice", "## Tokens"), /Banned/);
  assert.match(between(cut.markdown, "## Voice", "## Tokens"), /seamless/);
});

test("a long teardown drops quotes, then the 300-word story, and keeps Banned", () => {
  const probe = compileBrand(skeleton());
  const plainCount = BRAND_WORD_CAP - probe.words + 1;
  const parts = skeleton();
  parts.teardownMarkdown = [
    parts.teardownMarkdown,
    `"${fill("lantern", 400)}"`,
    fill("counter", plainCount),
  ].join("\n");
  const cut = compileBrand(parts);
  assert.equal(cut.markdown.includes("lantern"), false);
  assert.equal(cut.markdown.includes(LONG_MARK), false);
  assert.ok(cut.markdown.includes("counter"));
  assert.ok(cut.markdown.includes(parts.story.words25));
  assert.ok(cut.markdown.includes(parts.story.words100));
  assert.match(between(cut.markdown, "## Voice", "## Tokens"), /Banned/);
  assert.ok(cut.words <= BRAND_WORD_CAP);
});

test("envy and boredom bodies are quotes and go before the long story", () => {
  const parts = skeleton();
  parts.teardownMarkdown = [
    "## Envy",
    "",
    fill("envyword", 2000),
    "",
    "## Boredom",
    "",
    fill("boredomword", 200),
    "",
    "## White space",
    "",
    "- a quiet menu",
  ].join("\n");
  const cut = compileBrand(parts);
  assert.equal(cut.markdown.includes("envyword"), false);
  assert.equal(cut.markdown.includes("boredomword"), false);
  assert.match(cut.markdown, /a quiet menu/);
  assert.ok(cut.markdown.includes(LONG_MARK));
  assert.ok(cut.words <= BRAND_WORD_CAP);
});

test("1501 words after the allowed cuts throw instead of dropping Banned", () => {
  const parts = skeleton();
  parts.voiceMarkdown = `## Banned words\n\n- seamless\n\n${fill("tin", 1600)}`;
  parts.teardownMarkdown = `"${fill("lantern", 100)}"`;
  let thrown: unknown;
  try {
    compileBrand(parts);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof BrandLengthError);
  assert.ok(thrown.words > BRAND_WORD_CAP);
  assert.equal(thrown.message.includes("seamless"), false);
});

test("a fake testimonial in a part throws", () => {
  const parts = skeleton();
  parts.voiceMarkdown = `${parts.voiceMarkdown}\n## Testimonials\nA neighbor loved the tin.`;
  let thrown: unknown;
  try {
    compileBrand(parts);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof BrandTruthError);
  assert.ok(thrown.hits.some((hit) => hit.pattern === "testimonials"));
});

test("a star claim in the teardown throws before a file would be saved", () => {
  const parts = skeleton();
  parts.teardownMarkdown = "Loved by 5 stars";
  let thrown: unknown;
  try {
    compileBrand(parts);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof BrandTruthError);
  assert.ok(thrown.hits.some((hit) => hit.pattern === "stars"));
});

test("a percent inside the token fence is not a claim", () => {
  const parts = skeleton();
  parts.cssVars = `${parts.cssVars}\n/* width: 60%; */`;
  const result = compileBrand(parts);
  assert.match(result.markdown, /```css[\s\S]*60%[\s\S]*```/);
  assert.ok(result.words <= BRAND_WORD_CAP);
});

test("a voice line that includes xai-secret throws from the secret scan", () => {
  const parts = skeleton();
  parts.voiceMarkdown = `${parts.voiceMarkdown}\nxai-secret`;
  let thrown: unknown;
  try {
    compileBrand(parts);
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof BrandSecretError);
  assert.equal(thrown.rule, "xai-");
  assert.equal(thrown.message.includes("xai-secret"), false);
});

test("scanSecrets throws on xai-, Bearer , and sk-", () => {
  assert.throws(() => scanSecrets("prefix xai-secret suffix"), BrandSecretError);
  assert.throws(() => scanSecrets("Authorization: Bearer token"), BrandSecretError);
  assert.throws(() => scanSecrets("sk-live"), BrandSecretError);
  assert.doesNotThrow(() => scanSecrets("Bearer"));
  assert.doesNotThrow(() => scanSecrets("The kettle is on the counter."));
});

test("compileBrand calls lintClaims, shapes parts, and does not call a model or write a file", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /lintClaims\(/);
  assert.match(source, /export function compileBrand/);
  assert.match(source, /export function scanSecrets/);
  assert.equal(/from\s+["'][^"']*\/ai\//.test(source), false);
  assert.equal(source.includes("writeFile"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(/\bany\b/.test(source), false);
});
