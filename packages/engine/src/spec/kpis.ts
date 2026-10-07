/**
 * DP-2.4 helper. Writes the body of KPIS.md.
 * Pure. The caller writes `.hitchhiker/KPIS.md`.
 * The primary KPI phrase comes from SITE_TYPES. Measurements come from
 * the answer text. A missing number stays missing. A percent is copied
 * only when the answer already contains that percent sign. A range of
 * those percents is marked as an assumption. No analytics call.
 */

import { SITE_TYPES, type SiteTypeHint } from "../site-types.ts";

export class KpisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KpisError";
  }
}

export const KPI_REFUSAL = "No baseline was given. Do not invent one.";

const WORD_CAP = 200;
const LIST_CAP = 24;

/** A percent, or a short range whose ends are percents. Indices are into the raw answer. */
interface PercentSpan {
  start: number;
  end: number;
  text: string;
  range: boolean;
}

interface IntHit {
  index: number;
  end: number;
  value: string;
}

const PERCENT_BODY = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const PERCENT = `${PERCENT_BODY}\\s*%`;
const RANGE_RE = new RegExp(
  `${PERCENT}\\s*(?:to|through|and|\\u2013|\\u2014|-)\\s*${PERCENT}|${PERCENT_BODY}\\s*(?:\\u2013|\\u2014|-)\\s*${PERCENT}`,
  "gi",
);
const LONE_PERCENT_RE = new RegExp(PERCENT, "gi");

function knownIds(): string {
  return SITE_TYPES.map((hint) => hint.id).join(", ");
}

function lookup(siteType: string): SiteTypeHint {
  const id = siteType.trim();
  const hint = SITE_TYPES.find((entry) => entry.id === id);
  if (hint === undefined) {
    throw new KpisError(`Unknown site type "${id}". Known ids: ${knownIds()}.`);
  }
  return hint;
}

/** Commas that only group digits: 1,200 is one integer. */
function stripDigitCommas(value: string): string {
  return value.replace(/(\d),(?=\d)/g, "$1");
}

/**
 * A minus is a negative number when it is not stuck to a word.
 * `page-2` is a page id from DP-2.4. ` -5` and `-5` are refused.
 */
function hasNegativeNumber(stripped: string): boolean {
  return /(?<![A-Za-z\d])[\u2212-](?=\d)/.test(stripped);
}

/** `page-2` and `about-us` are ids. Their digits are not measurements. */
function blankHyphenatedWords(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+/g, (token) =>
    " ".repeat(token.length),
  );
}

function collectSpans(answer: string): PercentSpan[] {
  const found: PercentSpan[] = [];
  for (const match of answer.matchAll(RANGE_RE)) {
    const text = match[0];
    const start = match.index;
    if (start === undefined) continue;
    found.push({ start, end: start + text.length, text, range: true });
  }
  for (const match of answer.matchAll(LONE_PERCENT_RE)) {
    const text = match[0];
    const start = match.index;
    if (start === undefined) continue;
    found.push({ start, end: start + text.length, text, range: false });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PercentSpan[] = [];
  for (const span of found) {
    const last = kept[kept.length - 1];
    if (last !== undefined && span.start < last.end) continue;
    kept.push(span);
  }
  return kept;
}

function blankSpans(answer: string, spans: readonly PercentSpan[]): string {
  let out = answer;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i];
    if (span === undefined) continue;
    out = `${out.slice(0, span.start)}${" ".repeat(span.end - span.start)}${out.slice(span.end)}`;
  }
  return out;
}

function findIntegers(stripped: string): IntHit[] {
  const hits: IntHit[] = [];
  for (const match of stripped.matchAll(/(?<![\d.])\d+(?![\d.])/g)) {
    const value = match[0];
    const index = match.index;
    if (index === undefined) continue;
    hits.push({ index, end: index + value.length, value });
  }
  return hits;
}

function mentionTokens(stripped: string): string[] {
  const tokens: string[] = [];
  for (const match of stripped.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)) {
    tokens.push(match[0]);
  }
  return tokens;
}

function wordAt(text: string, word: string): number | null {
  const match = new RegExp(`\\b${word}\\b`, "i").exec(text);
  if (match === null || match.index === undefined) return null;
  return match.index;
}

function distance(wordAtIndex: number, hit: IntHit): number {
  if (hit.end <= wordAtIndex) return wordAtIndex - hit.end;
  if (hit.index >= wordAtIndex) return hit.index - wordAtIndex;
  return 0;
}

/**
 * Two integers are current and goal only when both words are present and
 * one pairing is strictly nearer than the other. A tie stays unlabeled.
 */
function labelPair(text: string, hits: readonly IntHit[]): { current: string; goal: string } | null {
  if (hits.length !== 2) return null;
  const currentAt = wordAt(text, "current");
  const goalAt = wordAt(text, "goal");
  if (currentAt === null || goalAt === null) return null;
  const left = hits[0];
  const right = hits[1];
  if (left === undefined || right === undefined) return null;
  const straight = distance(currentAt, left) + distance(goalAt, right);
  const crossed = distance(currentAt, right) + distance(goalAt, left);
  if (straight === crossed) return null;
  if (straight < crossed) return { current: left.value, goal: right.value };
  return { current: right.value, goal: left.value };
}

function formatList(values: readonly string[]): string {
  const shown = values.slice(0, LIST_CAP);
  if (values.length === shown.length) return shown.join(", ");
  return `${shown.join(", ")}. Further numbers stay in the answer and are not copied here`;
}

function quote(text: string): string {
  return text.replace(/[!！]/g, "");
}

function wordCount(markdown: string): number {
  const trimmed = markdown.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function renderKpis(input: { siteType: string; answerText: string }): string {
  const hint = lookup(input.siteType);
  const answer = input.answerText;
  if (hasNegativeNumber(stripDigitCommas(answer))) {
    throw new KpisError("Negative numbers are refused.");
  }

  const spans = collectSpans(answer);
  const working = blankHyphenatedWords(stripDigitCommas(blankSpans(answer, spans)));
  const hits = findIntegers(working);
  const pair = labelPair(working, hits);
  const mentions = mentionTokens(working);

  const lines = ["# KPIS", "", `Site type: ${hint.id}`, `Primary KPI: ${hint.kpi}`, ""];

  if (pair !== null) {
    lines.push(`Current: ${pair.current}`, `Goal: ${pair.goal}`, "");
    const decimals = mentions.filter((token) => token.includes("."));
    if (decimals.length > 0) lines.push(`Numbers mentioned: ${formatList(decimals)}`, "");
  } else if (mentions.length === 0 && spans.length === 0) {
    lines.push(KPI_REFUSAL, "");
  } else if (mentions.length > 0) {
    lines.push(`Numbers mentioned: ${formatList(mentions)}`, "");
  }

  for (const span of spans) {
    const copied = quote(span.text);
    if (copied.trim() === "") continue;
    if (span.range) lines.push(`Assumption. From the user: ${copied}`);
    else lines.push(`From the user: ${copied}`);
  }

  const markdown = `${lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[!！]/g, "").trimEnd()}\n`;
  if (wordCount(markdown) >= WORD_CAP) {
    throw new KpisError("KPIS.md is over 200 words.");
  }
  return markdown;
}
