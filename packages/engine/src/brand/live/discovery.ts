/**
 * Live discovery for gaps only.
 * Prompt wording from Matt Haynes, Build a Brand From Scratch With AI
 * (AntiHero guide), Prompt 02, used with credit. D-005.
 * Questions are limited to SOFT answers and values marked ASSUMED.
 * compileWhy (045) shapes the why line. buildTeardown (047) shapes neighbors.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { think } from "../../ai/think.ts";
import type { ThinkRequest } from "../../ai/think.ts";
import { questionCount } from "../../guide/validators.ts";
import type { GuideSession } from "../../guide/live-turn.ts";
import type { AnswerRecord } from "../../required.ts";
import { buildTeardown } from "../teardown.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { compileWhy } from "../why.ts";
import { recordDraftItems } from "./approve.ts";
import {
  BRAND_DISCOVERY_BRIEF_TASK,
  BRAND_DISCOVERY_QUESTION_TASK,
  DISCOVERY_BRIEF_SCHEMA,
  DISCOVERY_QUESTION_SCHEMA,
  LiveShapeError,
  answerLines,
  assertBrandContrast,
  assertClaims,
  assertCleanProse,
  isGap,
  isRecord,
  latestAnswer,
  loadAnswers,
  readString,
} from "./schemas.ts";

export interface DiscoveryBrief {
  markdown: string;
  risks: [string, string, string];
  askedIds: string[];
}

interface GapNote {
  id: string;
  answer: string;
}

interface BriefFields {
  business: string;
  why: string;
  customer: string;
  competitors: string;
  personality: string;
  visual: string;
  musts: string;
  open: string;
  risks: [string, string, string];
}

export async function runDiscovery(
  s: GuideSession,
  deps: { think: typeof think; ask: (q: string) => Promise<string> },
): Promise<DiscoveryBrief> {
  const answers = loadAnswers(s.projectDir);
  const gaps = gapList(answers);
  const notes: GapNote[] = [];
  for (const gap of gaps) {
    const question = await oneQuestion(deps.think, gap, answers);
    const reply = await deps.ask(question);
    notes.push({ id: gap.id, answer: reply });
  }
  const filled = applyNotes(answers, notes);
  const brief = await draftBrief(deps.think, filled, notes);
  const markdown = renderBrief(brief, filled, s.projectDir);
  assertClaims(markdown, evidenceFromAnswers(filled));
  assertBrandContrast({ name: "", answers: filled, projectDir: s.projectDir });
  if (s.projectDir.trim() !== "") {
    await recordDraftItems(s.projectDir, [
      { itemId: "discovery", kind: "discovery", text: markdown },
      ...brief.risks.map((risk, index) => ({
        itemId: `risk:${index + 1}`,
        kind: "risk",
        text: risk,
      })),
    ]);
  }
  return { markdown, risks: brief.risks, askedIds: gaps.map((gap) => gap.id) };
}

function gapList(answers: readonly AnswerRecord[]): AnswerRecord[] {
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) latest.set(answer.id, answer);
  const gaps = [...latest.values()].filter((answer) => isGap(answer));
  const ids = new Set(gaps.map((gap) => gap.id));
  if (!ids.has("DP-2.1") && latestValue(latest, "DP-2.1") === "") {
    gaps.push({ id: "DP-2.1", status: "SOFT", value: "" });
    ids.add("DP-2.1");
  }
  if (!ids.has("DP-1.7") && whyIsAssumed(answers)) {
    gaps.push({ id: "DP-1.7", status: "SOFT", value: latestValue(latest, "DP-1.7") });
  }
  gaps.sort((a, b) => a.id.localeCompare(b.id));
  return gaps;
}

function latestValue(latest: Map<string, AnswerRecord>, id: string): string {
  return latest.get(id)?.value ?? "";
}

function whyIsAssumed(answers: readonly AnswerRecord[]): boolean {
  try {
    return compileWhy(answers).status === "ASSUMED";
  } catch {
    return true;
  }
}

async function oneQuestion(
  thinkFn: typeof think,
  gap: AnswerRecord,
  answers: readonly AnswerRecord[],
): Promise<string> {
  const first = parseQuestion((await thinkFn(questionRequest(gap, answers))).value);
  if (first !== null) return first;
  const second = parseQuestion(
    (await thinkFn(questionRequest(gap, answers, "Ask one question about this field only."))).value,
  );
  if (second === null) throw new LiveShapeError(`Discovery question for ${gap.id} was not a single question.`);
  return second;
}

async function draftBrief(
  thinkFn: typeof think,
  answers: readonly AnswerRecord[],
  notes: readonly GapNote[],
): Promise<BriefFields> {
  const first = parseBrief((await thinkFn(briefRequest(answers, notes))).value);
  if (first !== null && briefOk(first, answers)) return first;
  const second = parseBrief(
    (await thinkFn(briefRequest(answers, notes, "Keep 3 risks. No invented proof. No banned words."))).value,
  );
  if (second === null || !briefOk(second, answers)) {
    throw new LiveShapeError("Discovery brief failed the shaper.");
  }
  return second;
}

function briefOk(brief: BriefFields, answers: readonly AnswerRecord[]): boolean {
  try {
    for (const field of [
      brief.business,
      brief.why,
      brief.customer,
      brief.competitors,
      brief.personality,
      brief.visual,
      brief.musts,
      brief.open,
      ...brief.risks,
    ]) {
      assertCleanProse("discovery", field);
    }
    assertClaims(renderBrief(brief, answers, ""), evidenceFromAnswers([...answers]));
    return true;
  } catch {
    return false;
  }
}

function renderBrief(brief: BriefFields, answers: readonly AnswerRecord[], projectDir: string): string {
  const whyLine = shapedWhy(answers, brief.why);
  const teardown = teardownBlock(answers, projectDir);
  const lines = [
    "# Brand Discovery Brief",
    "",
    "## The Business in One Paragraph",
    "",
    brief.business,
    "",
    "## The Why (draft)",
    "",
    whyLine,
    "",
    "## Ideal Customer",
    "",
    brief.customer,
    "",
    "## Competitors and the Sea of Sameness",
    "",
    brief.competitors,
    "",
    teardown,
    "",
    "## Personality",
    "",
    brief.personality,
    "",
    "## Visual Direction Notes",
    "",
    brief.visual,
    "",
    "## Must-Haves and Never-Evers",
    "",
    brief.musts,
    "",
    "## Open Questions",
    "",
    brief.open,
    "",
    "## 3 biggest risks",
    "",
    ...brief.risks.map((risk, index) => `${index + 1}. ${risk}`),
    "",
  ];
  return lines.join("\n");
}

function shapedWhy(answers: readonly AnswerRecord[], fallback: string): string {
  try {
    const withWhy: AnswerRecord[] = [...answers];
    if (latestAnswer(answers, "DP-1.7") === undefined) {
      withWhy.push({ id: "DP-1.7", status: "ANSWERED", value: fallback });
    }
    return compileWhy(withWhy).brandWhy;
  } catch {
    return fallback;
  }
}

function teardownBlock(answers: readonly AnswerRecord[], projectDir: string): string {
  const envy = latestAnswer(answers, "DP-4.2")?.value ?? "";
  let report = "";
  if (projectDir.trim() !== "") {
    const file = path.join(projectDir, "research", "COMPETITORS.md");
    if (existsSync(file)) report = readFileSync(file, "utf8");
  }
  const teardown = buildTeardown({ reportMarkdown: report, envy, boredom: "" });
  return teardown.markdown.trim();
}

function applyNotes(answers: readonly AnswerRecord[], notes: readonly GapNote[]): AnswerRecord[] {
  const next = [...answers];
  for (const note of notes) {
    if (note.answer.trim() === "") continue;
    next.push({ id: note.id, status: "ANSWERED", value: note.answer.trim() });
  }
  return next;
}

function questionRequest(gap: AnswerRecord, answers: readonly AnswerRecord[], repair?: string): ThinkRequest<{ question: string }> {
  const lines = [
    "Act as a senior brand strategist running a paid discovery session.",
    "Ask one question at a time. Wait for the answer.",
    `Ask only about ${gap.id}. The current value is marked assumed or soft.`,
    `Current value: ${gap.value === "" ? "(blank)" : gap.value}`,
    "Do not ask about any other field.",
    "One question mark.",
    "Known answers:",
    answerLines(answers),
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_DISCOVERY_QUESTION_TASK, schema: DISCOVERY_QUESTION_SCHEMA, input: lines.join("\n") };
}

function briefRequest(
  answers: readonly AnswerRecord[],
  notes: readonly GapNote[],
  repair?: string,
): ThinkRequest<BriefFields> {
  const lines = [
    "Write the Brand Discovery Brief from these answers only.",
    "Headings in your JSON: business, why, customer, competitors, personality, visual, musts, open, risks.",
    "risks has exactly 3 blunt risks.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "No exclamation marks. No em dashes. No banned hype words.",
    "Answers:",
    answerLines(answers),
    "New replies:",
    notes.length > 0 ? notes.map((note) => `${note.id}: ${note.answer}`).join("\n") : "(none)",
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_DISCOVERY_BRIEF_TASK, schema: DISCOVERY_BRIEF_SCHEMA, input: lines.join("\n") };
}

function parseQuestion(value: unknown): string | null {
  if (!isRecord(value)) return null;
  try {
    const question = readString(value.question, "question");
    if (question === "" || questionCount(question) !== 1) return null;
    return question;
  } catch {
    return null;
  }
}

function parseBrief(value: unknown): BriefFields | null {
  if (!isRecord(value)) return null;
  try {
    const risksRaw = value.risks;
    if (!Array.isArray(risksRaw) || risksRaw.length !== 3) return null;
    const risks = risksRaw.map((item, index) => readString(item, `risks.${index}`));
    if (risks.some((risk) => risk === "")) return null;
    const brief: BriefFields = {
      business: readString(value.business, "business"),
      why: readString(value.why, "why"),
      customer: readString(value.customer, "customer"),
      competitors: readString(value.competitors, "competitors"),
      personality: readString(value.personality, "personality"),
      visual: readString(value.visual, "visual"),
      musts: readString(value.musts, "musts"),
      open: readString(value.open, "open"),
      risks: [risks[0] ?? "", risks[1] ?? "", risks[2] ?? ""],
    };
    if (brief.business === "" || brief.why === "") return null;
    return brief;
  } catch {
    return null;
  }
}
