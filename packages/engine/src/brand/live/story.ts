/**
 * Live brand story at 25, 100, and 300 words.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 07, used with credit. D-005.
 * Length is the tighter of ±10% and the 046 expandOnly cap.
 * A missing origin asks two questions before the draft.
 */

import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { questionCount } from "../../guide/validators.ts";
import { countWords, expandOnly } from "../story.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { recordDraftItems } from "./approve.ts";
import {
  BRAND_STORY_ORIGIN_TASK,
  BRAND_STORY_TASK,
  LiveClaimError,
  LiveShapeError,
  STORY_ORIGIN_SCHEMA,
  STORY_SCHEMA,
  answerLines,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  isRecord,
  latestValue,
  readString,
  wordCount,
  type BrandFacts,
} from "./schemas.ts";

export class StoryLengthError extends Error {
  readonly target: number;
  readonly count: number;

  constructor(target: number, count: number) {
    super(`Story at ${target} words is ${count} words, outside the allowed window.`);
    this.name = "StoryLengthError";
    this.target = target;
    this.count = count;
  }
}

export interface StoryDraft {
  s25: string;
  s100: string;
  s300: string;
}

const TARGETS = [25, 100, 300] as const;
const capMemo = new Map<number, number>();

export function storyLimits(target: number): { min: number; max: number } {
  const tenMax = Math.floor(target * 1.1 + 1e-9);
  const tenMin = Math.ceil(target * 0.9 - 1e-9);
  return { min: tenMin, max: Math.min(tenMax, shaperWordCap(target)) };
}

export async function draftStory(
  brand: BrandFacts,
  deps: { think: typeof think; ask?: (q: string) => Promise<string> },
): Promise<StoryDraft> {
  assertBrandContrast(brand);
  const origin = await originNotes(brand, deps);
  const first = parseStory((await deps.think(storyRequest(brand, origin))).value);
  const problem = first === null ? "The JSON did not match the schema." : lengthProblem(first);
  const draft = problem === null ? first : await repairStory(brand, deps, origin, problem);
  if (draft === null) throw new LiveShapeError("Story did not match the schema.");
  const fitted = fit(draft);
  assertStory(fitted, brand);
  if (brand.projectDir !== undefined && brand.projectDir.trim() !== "") {
    await recordDraftItems(brand.projectDir, [
      { itemId: "story:25", kind: "story", text: fitted.s25 },
      { itemId: "story:100", kind: "story", text: fitted.s100 },
      { itemId: "story:300", kind: "story", text: fitted.s300 },
    ]);
  }
  return fitted;
}

async function originNotes(
  brand: BrandFacts,
  deps: { think: typeof think; ask?: (q: string) => Promise<string> },
): Promise<string[]> {
  if (!needsOrigin(brand)) return [];
  if (deps.ask === undefined) {
    throw new LiveShapeError("The story needs two origin answers before it can be written.");
  }
  const questions = await twoQuestions(deps.think, brand);
  const notes: string[] = [];
  for (const question of questions) {
    notes.push(`${question} ${await deps.ask(question)}`);
  }
  return notes;
}

function needsOrigin(brand: BrandFacts): boolean {
  if (brand.hasStory === true) return false;
  if (brand.hasStory === false) return true;
  return wordCount(latestValue(brand.answers, "DP-1.7")) < 8;
}

async function twoQuestions(thinkFn: typeof think, brand: BrandFacts): Promise<[string, string]> {
  const first = parseOrigin((await thinkFn(originRequest(brand))).value);
  if (first !== null) return first;
  return [
    "What specific moment made you start, and who was there?",
    "What was the turning point, in one concrete day?",
  ];
}

async function repairStory(
  brand: BrandFacts,
  deps: { think: typeof think },
  origin: readonly string[],
  problem: string,
): Promise<StoryDraft | null> {
  return parseStory((await deps.think(storyRequest(brand, origin, problem))).value);
}

function fit(draft: StoryDraft): StoryDraft {
  return {
    s25: fitOne(draft.s25, 25),
    s100: fitOne(draft.s100, 100),
    s300: fitOne(draft.s300, 300),
  };
}

function fitOne(text: string, target: number): string {
  const limits = storyLimits(target);
  const count = countWords(text);
  if (count > limits.max) return text.trim().split(/\s+/).slice(0, limits.max).join(" ");
  if (count < limits.min) throw new StoryLengthError(target, count);
  return text.trim();
}

function lengthProblem(draft: StoryDraft): string | null {
  const parts: string[] = [];
  for (const target of TARGETS) {
    const text = target === 25 ? draft.s25 : target === 100 ? draft.s100 : draft.s300;
    const limits = storyLimits(target);
    const count = countWords(text);
    if (count < limits.min || count > limits.max) {
      parts.push(`${target} words is ${count}, need ${limits.min} to ${limits.max}.`);
    }
    try {
      assertCleanProse(`story ${target}`, text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Story text is not clean.";
      parts.push(message);
    }
  }
  try {
    assertClaims([draft.s25, draft.s100, draft.s300].join("\n"), { quotes: [], awards: [], numbers: [] });
  } catch (error) {
    if (error instanceof LiveClaimError) parts.push(error.message);
    else throw error;
  }
  return parts.length === 0 ? null : parts.join(" ");
}

function assertStory(draft: StoryDraft, brand: BrandFacts): void {
  for (const target of TARGETS) {
    const text = target === 25 ? draft.s25 : target === 100 ? draft.s100 : draft.s300;
    const limits = storyLimits(target);
    const count = countWords(text);
    if (count < limits.min || count > limits.max) throw new StoryLengthError(target, count);
    assertCleanProse(`story ${target}`, text);
  }
  assertClaims([draft.s25, draft.s100, draft.s300].join("\n"), evidenceFromAnswers([...brand.answers]));
}

function shaperWordCap(target: number): number {
  const cached = capMemo.get(target);
  if (cached !== undefined) return cached;
  const filler = Array.from({ length: target + 80 }, () => "tea").join(" ");
  const cap = countWords(expandOnly([filler], target));
  capMemo.set(target, cap);
  return cap;
}

function originRequest(brand: BrandFacts): ThinkRequest<{ questions: string[] }> {
  return {
    task: BRAND_STORY_ORIGIN_TASK,
    schema: STORY_ORIGIN_SCHEMA,
    input: [
      "The user has no story yet.",
      "Ask exactly two origin questions, one at a time in the array.",
      "Each question has one question mark.",
      "Dig for the frustration and the turning point. Do not write the story yet.",
      `Brand: ${brand.name}`,
      answerLines(brand.answers),
    ].join("\n"),
  };
}

function storyRequest(brand: BrandFacts, origin: readonly string[], repair?: string): ThinkRequest<StoryDraft> {
  const limits = TARGETS.map((target) => {
    const window = storyLimits(target);
    return `${target}: ${window.min} to ${window.max} words`;
  });
  const lines = [
    "Write the brand story. The customer is the hero. The brand is the guide.",
    "Plain words. Real details from the answers. One specific moment beats ten adjectives.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes. No banned hype words.",
    `Lengths: ${limits.join("; ")}.`,
    `Brand: ${brand.name}`,
    "Answers:",
    answerLines(brand.answers),
    origin.length > 0 ? `Origin replies:\n${origin.join("\n")}` : "Origin is already in the answers.",
  ];
  if (repair !== undefined) lines.push(`Repair: ${repair}`);
  return { task: BRAND_STORY_TASK, schema: STORY_SCHEMA, input: lines.join("\n") };
}

function parseOrigin(value: unknown): [string, string] | null {
  if (!isRecord(value) || !Array.isArray(value.questions) || value.questions.length !== 2) return null;
  try {
    const first = readString(value.questions[0], "questions.0");
    const second = readString(value.questions[1], "questions.1");
    if (questionCount(first) !== 1 || questionCount(second) !== 1) return null;
    return [first, second];
  } catch {
    return null;
  }
}

function parseStory(value: unknown): StoryDraft | null {
  if (!isRecord(value)) return null;
  try {
    const s25 = readString(value.s25, "s25");
    const s100 = readString(value.s100, "s100");
    const s300 = readString(value.s300, "s300");
    if (s25 === "" || s100 === "" || s300 === "") return null;
    return { s25, s100, s300 };
  } catch {
    return null;
  }
}
