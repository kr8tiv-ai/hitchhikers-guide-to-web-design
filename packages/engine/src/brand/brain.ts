/**
 * Deterministic BRAND.md shaper.
 * Joins purpose, positioning, story, voice, tokens, imagery, and neighbors.
 * Over 1,500 words, teardown quotes go first, then the 300-word story.
 * The 25-word and 100-word stories stay. Voice bans stay.
 * lintClaims must pass or compileBrand throws. Nothing is written to disk.
 * This module does not call a model. Prompt 061 does that through the 011 adapter.
 */

import type { StoryPack } from "./story.ts";
import { lintClaims } from "./truth.ts";
import type { Evidence } from "./truth.ts";
import type { WhyDraft } from "./why.ts";

export interface BrandParts {
  why: WhyDraft;
  story: StoryPack;
  teardownMarkdown: string;
  voiceMarkdown: string;
  cssVars: string;
  imageryMarkdown: string;
  evidence: Evidence;
}

/** Whitespace split. Headings count. Empty input is zero. */
export const BRAND_WORD_CAP = 1500;

const SECRET_RULES = ["xai-", "Bearer ", "sk-"] as const;

const QUOTE_HEADINGS = new Set(["envy", "boredom"]);

export class BrandTruthError extends Error {
  readonly hits: { line: number; pattern: string }[];

  constructor(hits: { line: number; pattern: string }[]) {
    const detail = hits.map((hit) => `${hit.pattern} line ${hit.line}`).join(", ");
    super(`Brand claims failed lint: ${detail}.`);
    this.name = "BrandTruthError";
    this.hits = hits;
  }
}

export class BrandSecretError extends Error {
  readonly rule: string;

  constructor(rule: string) {
    super(`Refusing a secret-shaped token (${rule}).`);
    this.name = "BrandSecretError";
    this.rule = rule;
  }
}

export class BrandLengthError extends Error {
  readonly words: number;

  constructor(words: number) {
    super(`BRAND.md is ${words} words, over the ${BRAND_WORD_CAP} cap. Voice bans stay.`);
    this.name = "BrandLengthError";
    this.words = words;
  }
}

/**
 * Throws when the markdown contains `xai-`, `Bearer `, or `sk-`.
 * The message names the rule, not the rest of the token.
 */
export function scanSecrets(markdown: string): void {
  for (const rule of SECRET_RULES) {
    if (markdown.includes(rule)) throw new BrandSecretError(rule);
  }
}

/**
 * Assemble BRAND.md from parts that earlier compilers already shaped.
 * Returns the markdown and its word count. Does not write a file.
 */
export function compileBrand(parts: BrandParts): { markdown: string; words: number } {
  const normalized = normalizeParts(parts);
  const full = assemble(normalized, true, true);
  assertClaims(full, normalized.evidence);
  scanSecrets(full);

  let markdown = full;
  if (countWords(markdown) > BRAND_WORD_CAP) {
    markdown = assemble(normalized, false, true);
  }
  if (countWords(markdown) > BRAND_WORD_CAP) {
    markdown = assemble(normalized, false, false);
  }

  assertClaims(markdown, normalized.evidence);
  scanSecrets(markdown);
  const words = countWords(markdown);
  if (words > BRAND_WORD_CAP) throw new BrandLengthError(words);
  return { markdown, words };
}

function assertClaims(markdown: string, evidence: Evidence): void {
  const lint = lintClaims(hideFences(markdown), evidence);
  if (!lint.ok) throw new BrandTruthError(lint.hits);
}

function assemble(parts: BrandParts, quotes: boolean, longStory: boolean): string {
  const teardown = quotes ? parts.teardownMarkdown : cutTeardownQuotes(parts.teardownMarkdown);
  const sections = [
    purpose(parts.why),
    positioning(parts.story),
    story(parts.story, longStory),
    voice(parts.voiceMarkdown),
    tokens(parts.cssVars),
    imagery(parts.imageryMarkdown),
    neighbors(teardown),
  ];
  return normalize(sections.join("\n\n"));
}

function purpose(why: WhyDraft): string {
  return [
    "# Purpose",
    "",
    "Status: draft",
    "",
    why.siteWhy.trim(),
    "",
    why.brandWhy.trim(),
    "",
    `Why status: ${why.status}.`,
  ].join("\n");
}

function positioning(storyPack: StoryPack): string {
  return ["## Positioning", "", storyPack.positioning.trim()].join("\n");
}

function story(storyPack: StoryPack, longStory: boolean): string {
  const lines = [
    "## Story",
    "",
    `Archetype: ${storyPack.archetype} (${storyPack.archetypeStatus.toLowerCase()} until approved).`,
    "",
    "### Twenty-five",
    "",
    storyPack.words25.trim(),
    "",
    "### One hundred",
    "",
    storyPack.words100.trim(),
  ];
  if (longStory) {
    lines.push("", "### Three hundred", "", storyPack.words300.trim());
  }
  if (storyPack.holes.length > 0) {
    lines.push("", "### Holes", "", ...storyPack.holes.map((hole) => `- ${hole}`));
  }
  return lines.join("\n");
}

function voice(markdown: string): string {
  const body = markdown.trim();
  if (body === "") return "## Voice";
  return ["## Voice", "", body].join("\n");
}

function tokens(cssVars: string): string {
  return ["## Tokens", "", "```css", cssVars.trim(), "```"].join("\n");
}

function imagery(markdown: string): string {
  const body = markdown.trim();
  if (body === "") return "## Imagery";
  return ["## Imagery", "", body].join("\n");
}

function neighbors(teardown: string): string {
  const body = teardown.trim();
  if (body === "") return "## Neighbors";
  return ["## Neighbors", "", body].join("\n");
}

/**
 * Teardown quotes are double-quoted spans, blockquote lines,
 * and the Envy and Boredom bodies from buildTeardown.
 * White space and sameness stay.
 */
function cutTeardownQuotes(markdown: string): string {
  const withoutSpans = markdown
    .replace(/"[\s\S]*?"/g, " ")
    .replace(/\u201C[\s\S]*?\u201D/g, " ");
  const withoutBlockquotes = withoutSpans
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  return stripQuoteHeadings(withoutBlockquotes);
}

function stripQuoteHeadings(markdown: string): string {
  const kept: string[] = [];
  let skipping = false;
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = (heading[1] ?? "").toLowerCase();
      skipping = QUOTE_HEADINGS.has(title);
      kept.push(line);
      continue;
    }
    if (skipping) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

/** CSS percents sit in the token fence. lintClaims must not see them. */
function hideFences(markdown: string): string {
  return markdown.replace(/```[^\n]*\n[\s\S]*?\n```/g, (fence) => fence.replace(/[^\n]/g, " "));
}

function normalizeParts(parts: BrandParts): BrandParts {
  return {
    why: {
      siteWhy: normalize(parts.why.siteWhy),
      brandWhy: normalize(parts.why.brandWhy),
      status: parts.why.status,
      warnings: parts.why.warnings.map(normalize),
      siteTruncated: parts.why.siteTruncated,
    },
    story: {
      archetype: normalize(parts.story.archetype),
      archetypeStatus: parts.story.archetypeStatus,
      positioning: normalize(parts.story.positioning),
      words25: normalize(parts.story.words25),
      words100: normalize(parts.story.words100),
      words300: normalize(parts.story.words300),
      holes: parts.story.holes.map(normalize),
    },
    teardownMarkdown: normalize(parts.teardownMarkdown),
    voiceMarkdown: normalize(parts.voiceMarkdown),
    cssVars: normalize(parts.cssVars),
    imageryMarkdown: normalize(parts.imageryMarkdown),
    evidence: parts.evidence,
  };
}

function normalize(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}
