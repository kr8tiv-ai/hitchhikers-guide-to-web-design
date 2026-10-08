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

export async function zaphodReview(
  input: {
    prompt: SitePrompt;
    shots: string[];
    diff: string;
    fixRound?: 0 | 1 | 2;
    phoneBlocked?: boolean;
  },
  deps: { think: typeof think },
): Promise<ReviewVerdict> {
  const truths = truthsFromBody(input.prompt.body);
  const fixRound = input.fixRound ?? 0;
  const effort = reviewEffort(input.prompt);
  const request: ThinkRequest<unknown> = {
    task: "zaphod-vision",
    schema: ZAPHOD_SCHEMA,
    input: JSON.stringify({
      id: input.prompt.id,
      kind: input.prompt.kind,
      truths,
      diff: input.diff,
    }),
    images: input.shots,
    effort,
  };
  const result = await deps.think(request);
  const errors = validateJson(result.value, ZAPHOD_SCHEMA);
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
  if (decision.verdict === "FIX") {
    fixes = model.fixes.slice(0, 3);
    if (fixes.length === 0) {
      const reason = decision.reasons[0] ?? "Address the review findings.";
      fixes = [reason];
    }
  }
  return {
    verdict: decision.verdict,
    reasons: decision.reasons,
    truths: checks,
    pillars: rollup,
    jury: { ...model.jury, blocked: decision.verdict === "ESCALATE" },
    slopHits,
    fixRound,
    boots: model.boots,
    fixes,
  };
}
