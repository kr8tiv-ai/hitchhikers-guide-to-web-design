import type { JsonSchema } from "../ai/schema-validate.ts";

/**
 * Think schemas for the live Guide.
 * Tasks: guide-message, pushback-judge, suggest, mirror, brief-draft, brief-revise.
 */

export const GUIDE_MESSAGE_TASK = "guide-message";
export const PUSHBACK_TASK = "pushback-judge";
export const SUGGEST_TASK = "suggest";
export const MIRROR_TASK = "mirror";
export const BRIEF_DRAFT_TASK = "brief-draft";
export const BRIEF_REVISE_TASK = "brief-revise";

export const GUIDE_MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["message", "explanationLevel", "joke"],
  properties: {
    message: { type: "string", maxLength: 600 },
    explanationLevel: { type: "string", enum: ["beginner", "pro"] },
    joke: { type: "boolean" },
  },
};

export const PUSHBACK_SCHEMA: JsonSchema = {
  type: "object",
  required: ["vague", "quote", "sharperChoice"],
  properties: {
    vague: { type: "boolean" },
    quote: { type: "string", maxLength: 240 },
    sharperChoice: { type: "string", maxLength: 400 },
  },
};

export const SUGGEST_SCHEMA: JsonSchema = {
  type: "object",
  required: ["options"],
  properties: {
    options: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        required: ["label", "why", "source"],
        properties: {
          label: { type: "string", maxLength: 160 },
          why: { type: "string", maxLength: 280 },
          source: { type: "string", maxLength: 160 },
        },
      },
    },
  },
};

export const MIRROR_SCHEMA: JsonSchema = {
  type: "object",
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", maxLength: 240 },
    },
  },
};

const BRIEF_FIELDS = {
  goal: { type: "string", maxLength: 500 },
  visitor: { type: "string", maxLength: 500 },
  action: { type: "string", maxLength: 500 },
  offer: { type: "string", maxLength: 500 },
  vibe: { type: "string", maxLength: 500 },
  references: { type: "string", maxLength: 500 },
  exists: { type: "string", maxLength: 500 },
  protected: { type: "string", maxLength: 500 },
  motion: { type: "string", maxLength: 500 },
  limits: { type: "string", maxLength: 500 },
  hosting: { type: "string", maxLength: 500 },
  coverage: { type: "string", maxLength: 500 },
} as const;

export const BRIEF_KEYS = [
  "goal",
  "visitor",
  "action",
  "offer",
  "vibe",
  "references",
  "exists",
  "protected",
  "motion",
  "limits",
  "hosting",
  "coverage",
] as const;

export type BriefKey = (typeof BRIEF_KEYS)[number];

export const BRIEF_DRAFT_SCHEMA: JsonSchema = {
  type: "object",
  required: [...BRIEF_KEYS],
  properties: BRIEF_FIELDS,
};

export const BRIEF_REVISE_SCHEMA: JsonSchema = {
  type: "object",
  properties: BRIEF_FIELDS,
};

export interface GuideMessage {
  message: string;
  explanationLevel: "beginner" | "pro";
  joke: boolean;
}

export interface PushbackVerdict {
  vague: boolean;
  quote: string;
  sharperChoice: string;
}

export interface SuggestOption {
  label: string;
  why: string;
  source: string;
}

export interface SuggestVerdict {
  options: SuggestOption[];
}

export interface MirrorVerdict {
  lines: [string, string, string];
}

/** One-page Site Brief. Field names follow Guide Entry in the context package. */
export interface SiteBrief {
  goal: string;
  visitor: string;
  action: string;
  offer: string;
  vibe: string;
  references: string;
  exists: string;
  protected: string;
  motion: string;
  limits: string;
  hosting: string;
  coverage: string;
}

/**
 * Known material Suggest may cite.
 * `source` on an option is `answer:<id>`, `upload:<file>`, `crawl:<note>`, or `industry:<name>`.
 */
export interface Facts {
  answers: ReadonlyArray<{ id: string; value: string }>;
  uploads: readonly string[];
  crawlNotes: readonly string[];
  industry?: string;
}

/**
 * Gallery card shape used by Suggest.
 * The engine cannot import the crawler package, so this mirrors that entry.
 */
export interface GalleryEntry {
  industry: string;
  styleWorld: string;
  motionLevel: number;
  name: string;
  url: string;
  source: "awwwards" | "godly" | "other";
  award: string;
  noted: string;
}
