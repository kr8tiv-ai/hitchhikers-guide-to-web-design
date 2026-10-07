/**
 * Think schemas for live Babel Fish tasks.
 * The model writes. The 045 to 051 shapers and lintClaims decide what ships.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { JsonSchema } from "../../ai/schema-validate.ts";
import type { AnswerRecord } from "../../required.ts";
import { contrastRatio, passes } from "../tokens.ts";
import { lintClaims, type Evidence } from "../truth.ts";
import { BANNED_PHRASES, BANNED_WORDS } from "../voice.ts";

export const BRAND_WHY_QUESTION_TASK = "brand-why-question";
export const BRAND_WHY_COMPILE_TASK = "brand-why-compile";
export const BRAND_DISCOVERY_QUESTION_TASK = "brand-discovery-question";
export const BRAND_DISCOVERY_BRIEF_TASK = "brand-discovery-brief";
export const BRAND_POSITIONING_TASK = "brand-positioning";
export const BRAND_STORY_ORIGIN_TASK = "brand-story-origin";
export const BRAND_STORY_TASK = "brand-story";
export const BRAND_VOICE_TASK = "brand-voice";
export const BRAND_TAGLINES_TASK = "brand-taglines";
export const BRAND_TAGLINE_RANK_TASK = "brand-tagline-rank";
export const BRAND_ITEM_REDRAFT_TASK = "brand-item-redraft";

/**
 * Six styles from the AntiHero guide, Prompt 15, used with credit. D-005.
 * Canonical spelling is what the validator counts.
 */
export const TAGLINE_STYLES = [
  "Plain and true",
  "The belief",
  "The challenge",
  "The wink",
  "The contrast",
  "The weird one",
] as const;

export type TaglineStyle = (typeof TAGLINE_STYLES)[number];

export const ARCHETYPE_ALIASES: Readonly<Record<string, string>> = {
  innocent: "innocent",
  everyman: "everyperson",
  everyperson: "everyperson",
  hero: "hero",
  outlaw: "outlaw",
  explorer: "explorer",
  creator: "creator",
  ruler: "ruler",
  magician: "magician",
  lover: "lover",
  caregiver: "caretaker",
  caretaker: "caretaker",
  jester: "jester",
  sage: "sage",
};

export class LiveShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveShapeError";
  }
}

export class LiveClaimError extends Error {
  readonly hits: { line: number; pattern: string }[];

  constructor(hits: { line: number; pattern: string }[]) {
    const detail = hits.map((hit) => `${hit.pattern} line ${hit.line}`).join(", ");
    super(`lintClaims failed: ${detail}.`);
    this.name = "LiveClaimError";
    this.hits = hits;
  }
}

export class CompetitorSloganError extends Error {
  readonly slogan: string;

  constructor(slogan: string) {
    super(`Tagline repeats a competitor slogan: ${slogan}.`);
    this.name = "CompetitorSloganError";
    this.slogan = slogan;
  }
}

export interface BrandFacts {
  name: string;
  answers: readonly AnswerRecord[];
  competitorSlogans?: readonly string[];
  competitorReport?: string;
  envy?: string;
  boredom?: string;
  /** False means the origin is missing and story.ts asks two questions first. */
  hasStory?: boolean;
  ink?: string;
  paper?: string;
  projectDir?: string;
}

export const WHY_QUESTION_SCHEMA: JsonSchema = {
  type: "object",
  required: ["question", "circle"],
  properties: {
    question: { type: "string", maxLength: 400 },
    circle: { type: "string", enum: ["why", "how", "what"] },
  },
};

export const WHY_COMPILE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["why", "how", "what"],
  properties: {
    why: { type: "string", maxLength: 500 },
    how: { type: "string", maxLength: 800 },
    what: { type: "string", maxLength: 800 },
  },
};

export const DISCOVERY_QUESTION_SCHEMA: JsonSchema = {
  type: "object",
  required: ["question"],
  properties: {
    question: { type: "string", maxLength: 400 },
  },
};

export const DISCOVERY_BRIEF_SCHEMA: JsonSchema = {
  type: "object",
  required: ["business", "why", "customer", "competitors", "personality", "visual", "musts", "open", "risks"],
  properties: {
    business: { type: "string", maxLength: 800 },
    why: { type: "string", maxLength: 500 },
    customer: { type: "string", maxLength: 800 },
    competitors: { type: "string", maxLength: 800 },
    personality: { type: "string", maxLength: 800 },
    visual: { type: "string", maxLength: 800 },
    musts: { type: "string", maxLength: 800 },
    open: { type: "string", maxLength: 800 },
    risks: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 300 },
    },
  },
};

export const POSITIONING_SCHEMA: JsonSchema = {
  type: "object",
  required: ["archetype", "positioning", "persona", "nonCustomers"],
  properties: {
    archetype: { type: "string", maxLength: 40 },
    positioning: { type: "string", maxLength: 600 },
    persona: {
      type: "object",
      required: ["name", "summary"],
      properties: {
        name: { type: "string", maxLength: 80 },
        summary: { type: "string", maxLength: 800 },
      },
    },
    nonCustomers: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 200 },
    },
  },
};

export const STORY_ORIGIN_SCHEMA: JsonSchema = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { type: "string", maxLength: 300 },
    },
  },
};

export const STORY_SCHEMA: JsonSchema = {
  type: "object",
  required: ["s25", "s100", "s300"],
  properties: {
    s25: { type: "string", maxLength: 600 },
    s100: { type: "string", maxLength: 1600 },
    s300: { type: "string", maxLength: 4000 },
  },
};

export const VOICE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["traits", "use", "never", "microcopy"],
  properties: {
    traits: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        required: ["this", "not"],
        properties: {
          this: { type: "string", maxLength: 40 },
          not: { type: "string", maxLength: 40 },
        },
      },
    },
    use: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string", maxLength: 40 },
    },
    never: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: { type: "string", maxLength: 40 },
    },
    microcopy: {
      type: "object",
      required: ["button", "error", "empty", "notFound"],
      properties: {
        button: { type: "string", maxLength: 80 },
        error: { type: "string", maxLength: 160 },
        empty: { type: "string", maxLength: 160 },
        notFound: { type: "string", maxLength: 160 },
      },
    },
  },
};

export const TAGLINES_SCHEMA: JsonSchema = {
  type: "object",
  required: ["taglines"],
  properties: {
    taglines: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        required: ["style", "text"],
        properties: {
          style: { type: "string", maxLength: 80 },
          text: { type: "string", maxLength: 160 },
        },
      },
    },
  },
};

export const TAGLINE_RANK_SCHEMA: JsonSchema = {
  type: "object",
  required: ["top5"],
  properties: {
    top5: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        required: ["text", "reason"],
        properties: {
          text: { type: "string", maxLength: 160 },
          reason: { type: "string", maxLength: 400 },
        },
      },
    },
  },
};

export const ITEM_REDRAFT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string", maxLength: 500 },
  },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new LiveShapeError(`${field} must be a string.`);
  return value.replace(/\s+/g, " ").trim();
}

export function wordCount(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function bannedHit(value: string): string | null {
  const folded = value.replace(/\u2019/g, "'").toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (folded.includes(phrase)) return phrase;
  }
  const pattern = new RegExp(`\\b(?:${BANNED_WORDS.map(escapeRegExp).join("|")})\\b`, "i");
  const match = pattern.exec(value);
  return match?.[0]?.toLowerCase() ?? null;
}

export function assertCleanProse(label: string, text: string): void {
  if (text.includes("!")) throw new LiveShapeError(`${label} contains an exclamation mark.`);
  if (text.includes("\u2014")) throw new LiveShapeError(`${label} contains an em dash.`);
  const hit = bannedHit(text);
  if (hit !== null) throw new LiveShapeError(`${label} contains a banned word: ${hit}.`);
}

export function assertClaims(markdown: string, evidence: Evidence): void {
  const lint = lintClaims(markdown, evidence);
  if (!lint.ok) throw new LiveClaimError(lint.hits);
}

/**
 * 049 contrast, when the draft names an ink and a paper.
 * Missing hexes are not invented here.
 */
export function assertBrandContrast(brand: BrandFacts): void {
  const ink = brand.ink?.trim() ?? "";
  const paper = brand.paper?.trim() ?? "";
  if (ink === "" || paper === "") return;
  let ratio: number;
  try {
    ratio = contrastRatio(ink, paper);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contrast could not be read.";
    throw new LiveShapeError(message);
  }
  if (!passes(ratio, "body")) {
    throw new LiveShapeError(`Body contrast ${ratio.toFixed(2)} is below 4.5 to 1.`);
  }
}

export function latestAnswer(answers: readonly AnswerRecord[], id: string): AnswerRecord | undefined {
  let found: AnswerRecord | undefined;
  for (const answer of answers) {
    if (answer.id === id) found = answer;
  }
  return found;
}

export function latestValue(answers: readonly AnswerRecord[], id: string): string {
  return latestAnswer(answers, id)?.value ?? "";
}

export function loadAnswers(projectDir: string): AnswerRecord[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new LiveShapeError("interview.json is not valid JSON.");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.answers)
      ? parsed.answers
      : null;
  if (list === null) throw new LiveShapeError("interview.json has no answers array.");
  return list.map((item, index) => parseAnswer(item, index));
}

function parseAnswer(value: unknown, index: number): AnswerRecord {
  if (!isRecord(value)) throw new LiveShapeError(`interview answer ${index + 1} is not an object.`);
  const id = value.id;
  const status = value.status;
  const text = value.value;
  if (typeof id !== "string" || id.trim() === "") {
    throw new LiveShapeError(`interview answer ${index + 1} is missing an id.`);
  }
  if (
    status !== "ANSWERED" &&
    status !== "SUGGESTED" &&
    status !== "SKIPPED" &&
    status !== "SOFT" &&
    status !== "IMPORTED"
  ) {
    throw new LiveShapeError(`interview answer ${index + 1} has an unknown status.`);
  }
  if (typeof text !== "string") throw new LiveShapeError(`interview answer ${index + 1} is missing a value.`);
  return { id, status, value: text };
}

export function isGap(record: AnswerRecord): boolean {
  if (record.status === "SOFT") return true;
  return /^ASSUMED\b/i.test(record.value.trim());
}

export function answerLines(answers: readonly AnswerRecord[]): string {
  if (answers.length === 0) return "(no answers yet)";
  return answers.map((answer) => `${answer.id} [${answer.status}] ${answer.value}`).join("\n");
}

export function canonicalStyle(value: string): TaglineStyle | null {
  const folded = value.trim().toLowerCase();
  for (const style of TAGLINE_STYLES) {
    if (style.toLowerCase() === folded) return style;
  }
  return null;
}

export function taglineItemId(style: string, index: number): string {
  const slug = style
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tagline:${slug}:${index + 1}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.?!,"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sloganMatch(text: string, slogans: readonly string[]): string | null {
  const hay = normalizePhrase(text);
  if (hay === "") return null;
  for (const slogan of slogans) {
    const needle = normalizePhrase(slogan);
    if (needle.length < 2) continue;
    if (hay === needle) return slogan.trim();
    const words = needle.split(" ");
    if (words.length >= 2 && hay.includes(needle)) return slogan.trim();
  }
  return null;
}

/** Slogans named on the facts, plus crawl titles and h1 lines. Descriptions are not slogans. */
export function competitorPhrases(brand: BrandFacts): string[] {
  const phrases: string[] = [];
  const push = (value: string): void => {
    const text = value.trim();
    if (text === "" || text === "_" || text.toLowerCase() === "no h1 found") return;
    if (phrases.some((item) => normalizePhrase(item) === normalizePhrase(text))) return;
    phrases.push(text);
  };
  for (const slogan of brand.competitorSlogans ?? []) push(slogan);
  const report = brand.competitorReport ?? "";
  for (const raw of report.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    const match = /^- (?:H1|Title):\s*(.+)$/.exec(line);
    if (match?.[1] !== undefined) push(match[1]);
  }
  return phrases;
}

export function archetypeLabel(value: string): string | null {
  const key = value.trim().toLowerCase();
  return ARCHETYPE_ALIASES[key] ?? null;
}
