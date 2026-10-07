/**
 * Live Why Finder.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 01, used with credit. D-005.
 * The model asks. compileWhy (045) shapes the why. lintClaims (058) checks it.
 */

import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { questionCount } from "../../guide/validators.ts";
import type { GuideSession } from "../../guide/live-turn.ts";
import type { AnswerRecord } from "../../required.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { compileWhy } from "../why.ts";
import {
  BRAND_WHY_COMPILE_TASK,
  BRAND_WHY_QUESTION_TASK,
  WHY_COMPILE_SCHEMA,
  WHY_QUESTION_SCHEMA,
  answerLines,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  isRecord,
  latestValue,
  loadAnswers,
  readString,
  type BrandFacts,
} from "./schemas.ts";
import { LiveShapeError } from "./schemas.ts";
import { recordDraftItems } from "./approve.ts";

const MIN_QUESTIONS = 12;
const MAX_QUESTIONS = 18;

type Circle = "why" | "how" | "what";

interface WhyQuestion {
  question: string;
  circle: Circle;
}

interface WhyCompile {
  why: string;
  how: string;
  what: string;
}

export async function runWhyFinder(
  s: GuideSession,
  deps: { think: typeof think; ask: (q: string) => Promise<string> },
): Promise<{ why: string; how: string; what: string; transcript: string[] }> {
  const answers = loadAnswers(s.projectDir);
  const transcript: string[] = [];
  const circles = new Set<Circle>();
  let turns = 0;
  while (transcript.length / 2 < MIN_QUESTIONS || circles.size < 3) {
    if (turns >= MAX_QUESTIONS) break;
    turns += 1;
    const asked = await oneQuestion(deps.think, answers, transcript);
    const reply = await deps.ask(asked.question);
    transcript.push(`Q: ${asked.question}`, `A: ${reply}`);
    circles.add(asked.circle);
  }
  const askedCount = transcript.length / 2;
  if (askedCount < MIN_QUESTIONS) {
    throw new LiveShapeError(`Why Finder asked ${askedCount} questions. At least 12 are required.`);
  }

  const compiled = await compileCircle(deps.think, answers, transcript);
  const shaped = shapeWhy(answers, compiled);
  assertCleanProse("how", shaped.how);
  assertCleanProse("what", shaped.what);
  assertCleanProse("why", shaped.why);
  if (!/^to\b.+\bso that\b/i.test(shaped.why)) {
    throw new LiveShapeError('Why must use the form "To [contribution] so that [impact]".');
  }
  if (principleCount(shaped.how) < 3) {
    throw new LiveShapeError("How needs 3 to 5 principles.");
  }
  const evidence = evidenceFromAnswers(answers);
  assertClaims([shaped.why, shaped.how, shaped.what].join("\n"), evidence);
  assertBrandContrast(factsFrom(s, answers));
  if (s.projectDir.trim() !== "") {
    await recordDraftItems(s.projectDir, [
      { itemId: "why", kind: "why", text: shaped.why },
      { itemId: "how", kind: "how", text: shaped.how },
      { itemId: "what", kind: "what", text: shaped.what },
    ]);
  }
  return { ...shaped, transcript };
}

function factsFrom(s: GuideSession, answers: AnswerRecord[]): BrandFacts {
  return { name: "", answers, projectDir: s.projectDir };
}

async function oneQuestion(
  thinkFn: typeof think,
  answers: readonly AnswerRecord[],
  transcript: readonly string[],
): Promise<WhyQuestion> {
  const first = parseQuestion((await thinkFn(questionRequest(answers, transcript))).value);
  if (first !== null) return first;
  const second = parseQuestion(
    (await thinkFn(questionRequest(answers, transcript, "Return one question only, with one question mark."))).value,
  );
  if (second === null) throw new LiveShapeError("Why Finder question was not a single question.");
  return second;
}

async function compileCircle(
  thinkFn: typeof think,
  answers: readonly AnswerRecord[],
  transcript: readonly string[],
): Promise<WhyCompile> {
  const first = parseCompile((await thinkFn(compileRequest(answers, transcript))).value);
  const firstShape = first === null ? null : tryShape(answers, first);
  if (firstShape !== null) return firstShape;
  const problem = first === null ? "The JSON did not match the schema." : "The why, how, or what failed the shaper.";
  const second = parseCompile((await thinkFn(compileRequest(answers, transcript, problem))).value);
  if (second === null) throw new LiveShapeError("Why compile did not match the schema.");
  const shaped = tryShape(answers, second);
  if (shaped === null) {
    throw new LiveShapeError('Why must use the form "To [contribution] so that [impact]".');
  }
  return shaped;
}

function tryShape(answers: readonly AnswerRecord[], compiled: WhyCompile): WhyCompile | null {
  try {
    const shaped = shapeWhy(answers, compiled);
    assertCleanProse("why", shaped.why);
    assertCleanProse("how", shaped.how);
    assertCleanProse("what", shaped.what);
    if (!/^to\b.+\bso that\b/i.test(shaped.why)) return null;
    if (principleCount(shaped.how) < 3) return null;
    assertClaims([shaped.why, shaped.how, shaped.what].join("\n"), evidenceFromAnswers(answers));
    return shaped;
  } catch {
    return null;
  }
}

function shapeWhy(answers: readonly AnswerRecord[], compiled: WhyCompile): WhyCompile {
  const next: AnswerRecord[] = [...answers];
  if (latestValue(next, "DP-2.1").trim() === "") {
    next.push({ id: "DP-2.1", status: "ANSWERED", value: compiled.what });
  }
  next.push({ id: "DP-1.7", status: "ANSWERED", value: compiled.why });
  const draft = compileWhy(next);
  return { why: draft.brandWhy, how: compiled.how, what: compiled.what };
}

function principleCount(value: string): number {
  return value
    .split(/[.\n;]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "").length;
}

function questionRequest(
  answers: readonly AnswerRecord[],
  transcript: readonly string[],
  repair?: string,
): ThinkRequest<WhyQuestion> {
  const lines = [
    "You are a brand strategist who has read Simon Sinek's Start With Why twice and has zero patience for corporate mush.",
    "Ask me one question at a time and wait for my answer before the next one.",
    "Ask at least 12 questions. Mix an easy origin question with an uncomfortable one.",
    "When I give a vague answer, push back and ask for a specific moment, a specific person, a specific day.",
    "Cover why, how, and what. Return JSON with question and circle.",
    "circle is why, how, or what.",
    "The question has exactly one question mark.",
    "Known answers:",
    answerLines(answers),
    "Transcript so far:",
    transcript.length > 0 ? transcript.join("\n") : "(none yet)",
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_WHY_QUESTION_TASK, schema: WHY_QUESTION_SCHEMA, input: lines.join("\n") };
}

function compileRequest(
  answers: readonly AnswerRecord[],
  transcript: readonly string[],
  repair?: string,
): ThinkRequest<WhyCompile> {
  const lines = [
    "You have enough. Use the person's own words.",
    'why is one sentence in this format: "To [contribution] so that [impact]."',
    "how is 3 to 5 principles, separated by periods.",
    "what is a plain-English description of what they sell, no jargon.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes. No banned hype words.",
    "Known answers:",
    answerLines(answers),
    "Transcript:",
    transcript.join("\n"),
  ];
  if (repair !== undefined) lines.push(`Repair: ${repair}`, "Return only the JSON object.");
  return { task: BRAND_WHY_COMPILE_TASK, schema: WHY_COMPILE_SCHEMA, input: lines.join("\n") };
}

function parseQuestion(value: unknown): WhyQuestion | null {
  if (!isRecord(value)) return null;
  let question: string;
  let circle: string;
  try {
    question = readString(value.question, "question");
    circle = readString(value.circle, "circle");
  } catch {
    return null;
  }
  if (question === "" || questionCount(question) !== 1) return null;
  if (circle !== "why" && circle !== "how" && circle !== "what") return null;
  return { question, circle };
}

function parseCompile(value: unknown): WhyCompile | null {
  if (!isRecord(value)) return null;
  try {
    const why = readString(value.why, "why");
    const how = readString(value.how, "how");
    const what = readString(value.what, "what");
    if (why === "" || how === "" || what === "") return null;
    return { why, how, what };
  } catch {
    return null;
  }
}
