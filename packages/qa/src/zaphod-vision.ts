/**
 * Zaphod vision review (prompt 126).
 *
 * think() receives the shot paths, the diff, and the truths parsed from
 * the prompt body. The result is checked with 109 checkTruths, 110
 * summarizePillars, and 113 decideReview. Jury scores are the 127 input.
 * Slop is linted on the model copy, not on the diff.
 *
 * SitePrompt is not re-exported from the engine package root, so this file
 * keeps the structural fields the review reads. Truths live in body.
 */

import {
  think,
  validateJson,
  type JsonSchema,
  type ThinkRequest,
} from "@hitchhiker/engine";
import { lintSlop } from "./antislop.ts";
import { checkTruths, type TruthCheck } from "./goal-backward.ts";
import { summarizePillars, type PillarName, type PillarStatus } from "./pillars.ts";
import type { QualityGates, ReviewProject } from "./review-runners.ts";
import { decideReview } from "./verdict.ts";

export interface SitePrompt {
  id: string;
  kind: string;
  body: string;
  tier?: string;
  effort?: string;
  title?: string;
}

export interface JuryInput {
  brand: number;
  craft: number;
  clarity: number;
  performance: number;
  blocked: boolean;
}

export interface VisualSectionScore {
  page: string;
  section: string;
  score: number;
  reason: string;
  textOnly: boolean;
  todoImage: boolean;
  placeholderImage: boolean;
  slop: string;
}

export interface ReviewVerdict {
  verdict: "PASS" | "PASS_WITH_KNOWN_ISSUES" | "FIX" | "ESCALATE";
  reasons: string[];
  truths: TruthCheck[];
  pillars: { worst: PillarStatus; missing: PillarName[] };
  jury: JuryInput;
  slopHits: number;
  fixRound: 0 | 1 | 2;
  boots: boolean;
  fixes: string[];
  /** Empty unless this review asked for per-section visual richness. */
  sections: VisualSectionScore[];
}

const PILLAR_NAMES = [
  "copy",
  "visuals",
  "color",
  "type",
  "spacing",
  "experience",
  "motion",
  "brand",
] as const;

const ZAPHOD_SCHEMA: JsonSchema = {
  type: "object",
  required: ["truths", "pillars", "jury", "boots", "copy"],
  properties: {
    truths: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["truth", "note"],
        properties: {
          truth: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    pillars: {
      type: "array",
      minItems: 8,
      maxItems: 8,
      items: {
        type: "object",
        required: ["name", "status", "note"],
        properties: {
          name: { type: "string", enum: PILLAR_NAMES },
          status: { type: "string", enum: ["PASS", "FIX", "BLOCKER"] },
          note: { type: "string" },
        },
      },
    },
    jury: {
      type: "object",
      required: ["brand", "craft", "clarity", "performance"],
      properties: {
        brand: { type: "number" },
        craft: { type: "number" },
        clarity: { type: "number" },
        performance: { type: "number" },
      },
    },
    boots: { type: "boolean" },
    copy: { type: "string" },
    fixes: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
    },
  },
};

const SECTION_SCHEMA: JsonSchema = {
  type: "object",
  required: ["page", "section", "score", "reason", "textOnly", "todoImage", "placeholderImage", "slop"],
  properties: {
    page: { type: "string", maxLength: 80 },
    section: { type: "string", maxLength: 80 },
    score: { type: "number" },
    reason: { type: "string", maxLength: 240 },
    textOnly: { type: "boolean" },
    todoImage: { type: "boolean" },
    placeholderImage: { type: "boolean" },
    slop: { type: "string", maxLength: 200 },
  },
};

function schemaFor(askSections: boolean): JsonSchema {
  if (!askSections) return ZAPHOD_SCHEMA;
  const required = ZAPHOD_SCHEMA.required ?? [];
  return {
    type: "object",
    required: [...required, "sections"],
    properties: {
      ...ZAPHOD_SCHEMA.properties,
      sections: { type: "array", minItems: 1, items: SECTION_SCHEMA },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function truthsFromBody(body: string): string[] {
  const open = body.indexOf("<must_haves>");
  const close = body.indexOf("</must_haves>");
  if (open < 0 || close < open) {
    throw new Error("truths is empty. A prompt without must_haves is already invalid.");
  }
  const inner = body.slice(open + "<must_haves>".length, close);
  const truths: string[] = [];
  let inTruths = false;
  for (const raw of inner.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (/^truths\s*:/.test(line)) {
      inTruths = true;
      continue;
    }
    if (inTruths && /^[A-Za-z][\w-]*\s*:/.test(line) && !line.startsWith("-")) {
      inTruths = false;
      continue;
    }
    if (inTruths && line.startsWith("- ")) {
      const truth = line.slice(2).trim();
      if (truth.length > 0) truths.push(truth);
    }
  }
  if (truths.length === 0) {
    throw new Error("truths is empty. A prompt without must_haves is already invalid.");
  }
  return truths;
}

function reviewEffort(prompt: SitePrompt): "high" | "xhigh" {
  if (prompt.kind === "once-over" || prompt.tier === "Forty-Two" || prompt.effort === "xhigh") {
    return "xhigh";
  }
  return "high";
}

function readScore(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`${name} is ${String(value)}. Expected a score from 0 to 10.`);
  }
  return value;
}

function isPillarName(value: string): value is PillarName {
  return (PILLAR_NAMES as readonly string[]).includes(value);
}

function isStatus(value: string): value is PillarStatus {
  return value === "PASS" || value === "FIX" || value === "BLOCKER";
}

function readFixes(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("fixes must be a list of strings.");
  const fixes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error("fixes must be a list of strings.");
    }
    fixes.push(item.trim());
  }
  return fixes.slice(0, 3);
}

function readModel(value: unknown): {
  evidence: Array<{ truth: string; note: string }>;
  rows: Array<{ name: PillarName; status: PillarStatus; note: string }>;
  jury: { brand: number; craft: number; clarity: number; performance: number };
  boots: boolean;
  copy: string;
  fixes: string[];
} {
  if (!isRecord(value) || !Array.isArray(value.truths) || !Array.isArray(value.pillars) || !isRecord(value.jury)) {
    throw new Error("Zaphod schema failed: the review object is incomplete.");
  }
  const evidence: Array<{ truth: string; note: string }> = [];
  for (const item of value.truths) {
    if (!isRecord(item) || typeof item.truth !== "string" || typeof item.note !== "string") {
      throw new Error("Zaphod schema failed: a truth is incomplete.");
    }
    evidence.push({ truth: item.truth, note: item.note });
  }
  const rows: Array<{ name: PillarName; status: PillarStatus; note: string }> = [];
  for (const item of value.pillars) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.status !== "string" || typeof item.note !== "string") {
      throw new Error("Zaphod schema failed: a pillar is incomplete.");
    }
    if (!isPillarName(item.name) || !isStatus(item.status)) {
      throw new Error("Zaphod schema failed: a pillar name or status is unknown.");
    }
    rows.push({ name: item.name, status: item.status, note: item.note });
  }
  if (typeof value.boots !== "boolean" || typeof value.copy !== "string") {
    throw new Error("Zaphod schema failed: boots or copy is missing.");
  }
  return {
    evidence,
    rows,
    jury: {
      brand: readScore("brand", value.jury.brand),
      craft: readScore("craft", value.jury.craft),
      clarity: readScore("clarity", value.jury.clarity),
      performance: readScore("performance", value.jury.performance),
    },
    boots: value.boots,
    copy: value.copy,
    fixes: readFixes(value.fixes),
  };
}

function readSections(value: unknown): VisualSectionScore[] {
  if (!isRecord(value) || !Array.isArray(value.sections)) {
    throw new Error("Zaphod schema failed: section scores are missing.");
  }
  const sections: VisualSectionScore[] = [];
  for (const item of value.sections) {
    if (
      !isRecord(item) ||
      typeof item.page !== "string" ||
      typeof item.section !== "string" ||
      typeof item.reason !== "string" ||
      typeof item.textOnly !== "boolean" ||
      typeof item.todoImage !== "boolean" ||
      typeof item.placeholderImage !== "boolean" ||
      typeof item.slop !== "string"
    ) {
      throw new Error("Zaphod schema failed: a section score is incomplete.");
    }
    const page = item.page.trim();
    const section = item.section.trim();
    const reason = item.reason.trim();
    if (page.length === 0 || section.length === 0 || reason.length === 0) {
      throw new Error("Zaphod schema failed: a section score is incomplete.");
    }
    sections.push({
      page,
      section,
      score: readScore("score", item.score),
      reason,
      textOnly: item.textOnly,
      todoImage: item.todoImage,
      placeholderImage: item.placeholderImage,
      slop: item.slop.trim(),
    });
  }
  if (sections.length === 0) throw new Error("Zaphod schema failed: section scores are missing.");
  return sections;
}

export async function zaphodReview(
  input: {
    prompt: SitePrompt;
    shots: string[];
    diff: string;
    fixRound?: 0 | 1 | 2;
    phoneBlocked?: boolean;
    /** When set, vision also scores each section and the call is grok-4.7-build-fast at xhigh. */
    askSections?: readonly { page: string; section: string }[];
    /** When set, the verdict runner calls the beauty, recipe, and 241 gates. */
    quality?: { project: ReviewProject; gates?: QualityGates };
  },
  deps: { think: typeof think },
): Promise<ReviewVerdict> {
  const truths = truthsFromBody(input.prompt.body);
  const fixRound = input.fixRound ?? 0;
  const ask = input.askSections !== undefined && input.askSections.length > 0;
  const effort = ask ? "xhigh" : reviewEffort(input.prompt);
  const request: ThinkRequest<unknown> = {
    task: "zaphod-vision",
    schema: schemaFor(ask),
    input: JSON.stringify({
      id: input.prompt.id,
      kind: input.prompt.kind,
      truths,
      diff: input.diff,
      ...(ask ? { sections: input.askSections } : {}),
    }),
    images: input.shots,
    effort,
    ...(ask ? { model: "grok-4.7-build-fast" } : {}),
  };
  const result = await deps.think(request);
  const errors = validateJson(result.value, schemaFor(ask));
  if (errors.length > 0) throw new Error(`Zaphod schema failed: ${errors.join("; ")}`);
  const model = readModel(result.value);
  const checks = checkTruths(truths, model.evidence);
  const rollup = summarizePillars(model.rows);
  const slopHits = lintSlop(model.copy, "site").length;
  let worst = rollup.worst;
  if (input.phoneBlocked === true) worst = "BLOCKER";
  const decision = decideReview({
    truthStatuses: checks.map((check) => check.status),
    worstPillar: worst,
    slopHits,
    fixRound,
    boots: model.boots,
  });
  let fixes: string[] = [];
  let verdict = decision.verdict;
  let reasons = decision.reasons;
  let juryBlocked = decision.verdict === "ESCALATE";
  if (decision.verdict === "FIX") {
    fixes = model.fixes.slice(0, 3);
    if (fixes.length === 0) {
      const reason = decision.reasons[0] ?? "Address the review findings.";
      fixes = [reason];
    }
  }
  if (input.quality !== undefined) {
    const { runVerdictReview } = await import("./review-runners.ts");
    const reviewed =
      input.quality.gates === undefined
        ? await runVerdictReview(input.quality.project)
        : await runVerdictReview(input.quality.project, input.quality.gates);
    if (reviewed.blocked) {
      const extra = reviewed.failures.map((failure) => failure.reason);
      reasons = [...reasons, ...extra];
      if (verdict === "PASS" || verdict === "PASS_WITH_KNOWN_ISSUES") verdict = reviewed.verdict;
      if (verdict === "FIX") {
        const lines = extra.slice(0, 3);
        if (lines.length > 0) fixes = lines;
      }
      juryBlocked = true;
    }
  }
  return {
    verdict,
    reasons,
    truths: checks,
    pillars: rollup,
    jury: { ...model.jury, blocked: juryBlocked },
    slopHits,
    fixRound,
    boots: model.boots,
    fixes,
    sections: ask ? readSections(result.value) : [],
  };
}

/** Section visual-richness scores. This is the beauty-gate call through zaphodReview. */
export async function zaphodReviewSections(
  input: { sections: readonly { page: string; section: string }[]; shots: readonly string[] },
  deps: { think: typeof think },
): Promise<VisualSectionScore[]> {
  if (input.sections.length === 0) throw new Error("Name at least one section to score.");
  const lines = input.sections.map((row) => `- ${row.page} ${row.section} is scored for visual richness.`);
  const prompt: SitePrompt = {
    id: "beauty",
    kind: "once-over",
    tier: "Forty-Two",
    effort: "xhigh",
    title: "Score each section for visual richness.",
    body: `<must_haves>\ntruths:\n${lines.join("\n")}\n</must_haves>\n`,
  };
  const verdict = await zaphodReview(
    {
      prompt,
      shots: [...input.shots],
      diff: "Beauty gate.",
      askSections: input.sections,
    },
    deps,
  );
  return verdict.sections;
}
