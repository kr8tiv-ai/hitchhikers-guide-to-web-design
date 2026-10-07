/**
 * Live taglines.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 15, used with credit. D-005.
 * Thirty lines, five in each of six styles, then a top 5 with a reason each.
 * selectTaglines (051) is the word cap. A competitor slogan is rejected.
 */

import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { selectTaglines } from "../voice.ts";
import { recordDraftItems, type ApprovalItem } from "./approve.ts";
import {
  BRAND_TAGLINE_RANK_TASK,
  BRAND_TAGLINES_TASK,
  CompetitorSloganError,
  LiveClaimError,
  LiveShapeError,
  TAGLINE_RANK_SCHEMA,
  TAGLINE_STYLES,
  TAGLINES_SCHEMA,
  answerLines,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  canonicalStyle,
  competitorPhrases,
  isRecord,
  readString,
  sloganMatch,
  taglineItemId,
  type BrandFacts,
  type TaglineStyle,
} from "./schemas.ts";

export class TaglineCountError extends Error {
  readonly received: number;

  constructor(received: number) {
    super(`Expected 30 taglines across 6 styles, received ${received}.`);
    this.name = "TaglineCountError";
    this.received = received;
  }
}

export interface TaglineLine {
  style: TaglineStyle;
  text: string;
}

export interface TaglineCut {
  all: TaglineLine[];
  top5: Array<{ text: string; reason: string }>;
}

interface Ranked {
  text: string;
  reason: string;
}

export async function draftTaglines(brand: BrandFacts, deps: { think: typeof think }): Promise<TaglineCut> {
  assertBrandContrast(brand);
  const all = await loadThirty(brand, deps);
  const top5 = await loadTop(brand, deps, all);
  const joined = [...all.map((line) => line.text), ...top5.map((line) => `${line.text} ${line.reason}`)].join("\n");
  assertClaims(joined, evidenceFromAnswers([...brand.answers]));
  if (brand.projectDir !== undefined && brand.projectDir.trim() !== "") {
    await recordDraftItems(brand.projectDir, itemsFrom(all, top5));
  }
  return { all, top5 };
}

async function loadThirty(brand: BrandFacts, deps: { think: typeof think }): Promise<TaglineLine[]> {
  const firstValue = (await deps.think(taglineRequest(brand))).value;
  const first = parseLines(firstValue);
  const firstProblem = problemFor(first, brand);
  if (firstProblem === null) return first;
  const secondValue = (await deps.think(taglineRequest(brand, firstProblem, firstValue))).value;
  const second = parseLines(secondValue);
  const secondProblem = problemFor(second, brand);
  if (secondProblem === null) return second;
  if (second.length !== 30) throw new TaglineCountError(second.length);
  const slogan = sloganProblem(second, brand);
  if (slogan !== null) throw new CompetitorSloganError(slogan);
  throw new LiveShapeError(secondProblem);
}

async function loadTop(
  brand: BrandFacts,
  deps: { think: typeof think },
  all: readonly TaglineLine[],
): Promise<Ranked[]> {
  const first = parseRank((await deps.think(rankRequest(brand, all))).value);
  const firstProblem = rankProblem(first, all, brand);
  if (first !== null && firstProblem === null) return first;
  const second = parseRank(
    (await deps.think(rankRequest(brand, all, firstProblem ?? "Pick exactly 5 lines from the 30."))).value,
  );
  const secondProblem = rankProblem(second, all, brand);
  if (second === null || secondProblem !== null) {
    throw new LiveShapeError(secondProblem ?? "Top 5 did not match the schema.");
  }
  return second;
}

function problemFor(lines: readonly TaglineLine[], brand: BrandFacts): string | null {
  if (lines.length !== 30) return `Expected 30 taglines across 6 styles, received ${lines.length}.`;
  for (const style of TAGLINE_STYLES) {
    const count = lines.filter((line) => line.style === style).length;
    if (count !== 5) return `Expected 5 taglines in each of 6 styles. ${style} has ${count}.`;
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.text.toLowerCase();
    if (seen.has(key)) return `Repeated tagline: ${line.text}.`;
    seen.add(key);
    const shaped = selectTaglines([line.text]);
    if (shaped.taglines.length !== 1) {
      return `Tagline failed the voice rules: ${line.text}.`;
    }
    const slogan = sloganMatch(line.text, competitorPhrases(brand));
    if (slogan !== null) return `Tagline repeats a competitor slogan: ${slogan}.`;
  }
  try {
    assertClaims(lines.map((line) => line.text).join("\n"), evidenceFromAnswers([...brand.answers]));
  } catch (error) {
    if (error instanceof LiveClaimError) return error.message;
    throw error;
  }
  return null;
}

function sloganProblem(lines: readonly TaglineLine[], brand: BrandFacts): string | null {
  for (const line of lines) {
    const slogan = sloganMatch(line.text, competitorPhrases(brand));
    if (slogan !== null) return slogan;
  }
  return null;
}

function rankProblem(ranked: Ranked[] | null, all: readonly TaglineLine[], brand: BrandFacts): string | null {
  if (ranked === null || ranked.length !== 5) return "Top 5 needs exactly 5 lines, each with a reason.";
  const pool = new Map(all.map((line) => [line.text.toLowerCase(), line.text]));
  for (const line of ranked) {
    const kept = pool.get(line.text.toLowerCase());
    if (kept === undefined) return `Top 5 must be chosen from the 30: ${line.text}.`;
    if (line.reason.trim() === "") return "Each top tagline needs a reason.";
    try {
      assertCleanProse("reason", line.reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reason is not clean.";
      return message;
    }
    const slogan = sloganMatch(line.text, competitorPhrases(brand));
    if (slogan !== null) return `Tagline repeats a competitor slogan: ${slogan}.`;
  }
  const cut = selectTaglines(ranked.map((line) => line.text));
  if (cut.shortfall || cut.taglines.length !== 5) return "Top 5 failed the voice word cap.";
  try {
    assertClaims(ranked.map((line) => `${line.text} ${line.reason}`).join("\n"), evidenceFromAnswers([...brand.answers]));
  } catch (error) {
    if (error instanceof LiveClaimError) return error.message;
    throw error;
  }
  return null;
}

function itemsFrom(all: readonly TaglineLine[], top5: readonly Ranked[]): ApprovalItem[] {
  const lines: ApprovalItem[] = all.map((line) => ({
    itemId: taglineItemId(line.style, indexInStyle(all, line)),
    kind: "tagline",
    text: line.text,
    style: line.style,
  }));
  top5.forEach((line, index) => {
    lines.push({
      itemId: `tagline-top:${index + 1}`,
      kind: "tagline-top",
      text: line.text,
      style: line.reason,
    });
  });
  return lines;
}

function indexInStyle(all: readonly TaglineLine[], line: TaglineLine): number {
  let count = 0;
  for (const item of all) {
    if (item.style !== line.style) continue;
    if (item === line) return count;
    count += 1;
  }
  return 0;
}

function taglineRequest(brand: BrandFacts, repair?: string, previous?: unknown): ThinkRequest<unknown> {
  const lines = [
    `Write 30 taglines for ${brand.name}.`,
    "Give me 5 in each of these styles:",
    ...TAGLINE_STYLES.map((style, index) => `${index + 1}. ${style}`),
    "Six words is the guide's aim. The shaper rejects 8 or more words.",
    "Things competitors already say, so we avoid them:",
    competitorPhrases(brand).join("\n") || "(none)",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes.",
    "Answers:",
    answerLines(brand.answers),
  ];
  if (repair !== undefined) {
    lines.push(`Repair: ${repair}`);
    if (previous !== undefined) lines.push("Previous output:", JSON.stringify(previous));
  }
  return { task: BRAND_TAGLINES_TASK, schema: TAGLINES_SCHEMA, input: lines.join("\n") };
}

function rankRequest(brand: BrandFacts, all: readonly TaglineLine[], repair?: string): ThinkRequest<unknown> {
  const lines = [
    "Pick the top 5 of these 30 taglines.",
    "Test each one: is it true, could a competitor steal it, does it sound good out loud, will it last, would the customer keep it.",
    "Each pick needs a reason. Use the text unchanged.",
    "No invented proof.",
    ...all.map((line, index) => `${index + 1}. [${line.style}] ${line.text}`),
  ];
  if (repair !== undefined) lines.push(`Repair: ${repair}`);
  return { task: BRAND_TAGLINE_RANK_TASK, schema: TAGLINE_RANK_SCHEMA, input: lines.join("\n") };
}

function parseLines(value: unknown): TaglineLine[] {
  if (!isRecord(value) || !Array.isArray(value.taglines)) return [];
  const lines: TaglineLine[] = [];
  for (const item of value.taglines) {
    if (!isRecord(item)) continue;
    try {
      const style = canonicalStyle(readString(item.style, "style"));
      const raw = readString(item.text, "text");
      if (style === null || raw === "") continue;
      const shaped = selectTaglines([raw]);
      const text = shaped.taglines[0] ?? raw;
      lines.push({ style, text });
    } catch {
      // A bad row is dropped here and counted as a short list, which triggers one repair.
    }
  }
  return lines;
}

function parseRank(value: unknown): Ranked[] | null {
  if (!isRecord(value) || !Array.isArray(value.top5)) return null;
  const ranked: Ranked[] = [];
  for (const item of value.top5) {
    if (!isRecord(item)) return null;
    try {
      const text = readString(item.text, "text");
      const reason = readString(item.reason, "reason");
      if (text === "" || reason === "") return null;
      const shaped = selectTaglines([text]);
      ranked.push({ text: shaped.taglines[0] ?? text, reason });
    } catch {
      return null;
    }
  }
  return ranked;
}
