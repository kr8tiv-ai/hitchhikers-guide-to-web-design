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

const CHOICE_ITEM_SCHEMA: JsonSchema = {
  type: "object",
  required: ["id", "label", "why", "source"],
  properties: {
    id: { type: "string", enum: ["A", "B", "C", "D"] },
    label: { type: "string", maxLength: 160 },
    why: { type: "string", maxLength: 280 },
    source: { type: "string", maxLength: 160 },
  },
};

/** 2 to 4 labelled choices. Ids must also be A, B, C, D in order; the parser checks that. */
export const CHOICES_SCHEMA: JsonSchema = {
  type: "object",
  required: ["choices"],
  properties: {
    choices: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: CHOICE_ITEM_SCHEMA,
    },
  },
};

const OPTION_LIST_SCHEMA: JsonSchema = {
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
};

export const PUSHBACK_SCHEMA: JsonSchema = {
  type: "object",
  required: ["vague", "quote", "sharperChoice"],
  properties: {
    vague: { type: "boolean" },
    quote: { type: "string", maxLength: 240 },
    sharperChoice: { type: "string", maxLength: 400 },
    choices: CHOICES_SCHEMA.properties?.choices ?? { type: "array" },
  },
};

export const SUGGEST_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    options: OPTION_LIST_SCHEMA,
    choices: CHOICES_SCHEMA.properties?.choices ?? { type: "array" },
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

/** Prose brief fields. The draft prompt states this same hard cap. */
export const BRIEF_PROSE_MAX = 500;

/** List-like brief fields: pages, features, limits, references, cadence. */
export const BRIEF_LIST_MAX = 1200;

/** Prose target. The schema description and the draft prompt both state it. */
export const BRIEF_PROSE_TARGET = 300;

/**
 * List-field target. It matches the hard cap so a page or feature list is kept whole.
 * A shorter target cut the approved pages at a semicolon.
 */
export const BRIEF_LIST_TARGET = BRIEF_LIST_MAX;

const BRIEF_LIST_KEYS = new Set(["pages", "features", "limits", "references", "cadence"]);

/** Length the draft should land on. The schema maxLength stays the hard cap. */
export function briefFieldTarget(key: string): number {
  return BRIEF_LIST_KEYS.has(key) ? BRIEF_LIST_TARGET : BRIEF_PROSE_TARGET;
}

/** Same sentence the draft prompt quotes, so the schema and the prompt cannot drift. */
export function briefFieldDescription(key: string): string {
  const list = BRIEF_LIST_KEYS.has(key);
  const target = briefFieldTarget(key);
  const cap = list ? BRIEF_LIST_MAX : BRIEF_PROSE_MAX;
  const kind = list ? "Short items." : "Prose.";
  return `${kind} Target ${target} characters. Hard cap ${cap}.`;
}

function briefField(key: string): JsonSchema {
  const list = BRIEF_LIST_KEYS.has(key);
  return {
    type: "string",
    maxLength: list ? BRIEF_LIST_MAX : BRIEF_PROSE_MAX,
    description: briefFieldDescription(key),
  };
}

const BRIEF_FIELDS = {
  goal: briefField("goal"),
  visitor: briefField("visitor"),
  action: briefField("action"),
  offer: briefField("offer"),
  vibe: briefField("vibe"),
  references: briefField("references"),
  exists: briefField("exists"),
  protected: briefField("protected"),
  motion: briefField("motion"),
  limits: briefField("limits"),
  hosting: briefField("hosting"),
  maintainer: briefField("maintainer"),
  pages: briefField("pages"),
  features: briefField("features"),
  cadence: briefField("cadence"),
  languages: briefField("languages"),
  imagery: briefField("imagery"),
  budget: briefField("budget"),
  session: briefField("session"),
  logo: briefField("logo"),
  palette: briefField("palette"),
  coverage: briefField("coverage"),
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
  "maintainer",
  "pages",
  "features",
  "cadence",
  "languages",
  "imagery",
  "budget",
  "session",
  "logo",
  "palette",
  "coverage",
] as const;

export type BriefKey = (typeof BRIEF_KEYS)[number];

/**
 * Keys an older pending file, or a stub, may omit.
 * Load fills them. The draft schema still requires them from the model.
 */
export const BRIEF_OPTIONAL_KEYS: ReadonlySet<BriefKey> = new Set([
  "maintainer",
  "cadence",
  "languages",
  "imagery",
  "budget",
  "session",
  "logo",
  "palette",
]);

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

export type ChoiceId = "A" | "B" | "C" | "D";

export type ChoiceOrigin = "model" | "fallback";

/** One pick-on-the-spot choice. `origin` on the set says model or fallback. */
export interface SuggestChoice {
  id: ChoiceId;
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
  maintainer: string;
  pages: string;
  features: string;
  cadence: string;
  languages: string;
  imagery: string;
  budget: string;
  session: string;
  logo: string;
  palette: string;
  coverage: string;
}

/**
 * Known material Suggest may cite.
 * `source` on an option is `answer:<id>`, `upload:<file>`, `crawl:<note>`, or `industry:<name>`.
 */
export interface Facts {
  answers: ReadonlyArray<{ id: string; value: string; status?: string }>;
  uploads: readonly string[];
  crawlNotes: readonly string[];
  industry?: string;
}

/**
 * Gallery card shape used by Suggest.
 * The engine cannot import the crawler package, so this mirrors that entry.
 */
export interface GalleryPalette {
  note: string;
  hex: string[];
}

export interface GalleryEntry {
  industry: string;
  styleWorld: string;
  motionLevel: number;
  name: string;
  url: string;
  source: "awwwards" | "recent" | "godly" | "gsap-showcase" | "aura" | "other";
  award: string;
  noted: string;
  /** Optional on load so older packs and fixture files still open. */
  id?: string;
  title?: string;
  sourceName?: string;
  sourcePage?: string | null;
  family?: string;
  styleTags?: string[];
  why?: string;
  palette?: GalleryPalette;
  typography?: string;
  borrow?: string;
  attribution?: string;
  verified?: boolean;
  verificationNote?: string;
  checked?: string;
}
