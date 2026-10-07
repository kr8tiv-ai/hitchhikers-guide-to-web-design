/**
 * CONTEXT.md for site-build agents.
 * Pure. The caller writes `.hitchhiker/CONTEXT.md`.
 * This module does not read BRAND.md or any other spec from disk.
 * The caller passes a short gloss per file. Over-long glosses throw.
 *
 * Anchor ids are the markdown slugs of headings the writers already emit:
 * - compileBrand writes "# Purpose" in BRAND.md
 * - renderVoice writes "# VOICE" in VOICE.md
 * - planMotion writes "# MOTION" in MOTION.md
 * - decideStack writes "# STACK-DECISION"
 * - planSections writes "# SECTION-PLAN" in SECTION-PLAN.md
 *
 * decideStack, the PRD, and CONTEXT-PACKAGE v2 §10.4 place the stack record
 * at `.hitchhiker/research/STACK-DECISION.md`. The other four files sit in
 * `.hitchhiker/` itself. The stack anchor uses that research path.
 */

export class ContextDocError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextDocError";
  }
}

/** Rough ceiling for the assembled map. Exceeding it throws. */
export const TOKEN_CEILING = 30000;

/** A gloss above this word count throws. The caller cuts. This module does not. */
export const GLOSS_WORD_CAP = 40;

export const CONTEXT_ANCHORS = {
  brand: { file: "BRAND.md", id: "purpose" },
  voice: { file: "VOICE.md", id: "voice" },
  motion: { file: "MOTION.md", id: "motion" },
  stack: { file: "research/STACK-DECISION.md", id: "stack-decision" },
  sections: { file: "SECTION-PLAN.md", id: "section-plan" },
} as const;

const GLOSS_KEYS = ["brand", "voice", "motion", "stack", "sections"] as const;

type GlossKey = (typeof GLOSS_KEYS)[number];

const SECTION_HEADINGS: Record<GlossKey, string> = {
  brand: "Brand",
  voice: "Voice",
  motion: "Motion",
  stack: "Stack",
  sections: "Sections",
};

const ANTI_SLOP = [
  "no purple-to-blue gradients",
  "no magnetic buttons",
  "no default Tailwind indigo look",
  "no lorem",
  "no exclamation marks",
  "no invented testimonials or made-up numbers",
] as const;

const COEXISTENCE = [
  "one scroll owner per page: lenis+scrolltrigger, native, or none",
  "one library owns each effect",
  "Lenis and CSS scroll-driven animations are never both on the same page",
  "one WebGL context per page",
  "Theatre runtime is @theatre/core at 0.7.2, never studio",
  "prefers-reduced-motion turns Lenis off, with no scrub and no autoplay",
  "content stays visible when motion is reduced",
  "effects at level 6 and above keep a calm phone path",
] as const;

export interface ContextGloss {
  brand: string;
  voice: string;
  motion: string;
  stack: string;
  sections: string;
}

export interface ContextInput {
  name: string;
  siteWhy: string;
  gloss: ContextGloss;
}

export interface ContextDoc {
  markdown: string;
  tokens: number;
}

function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Word count times 1.3, rounded up.
 * An empty or whitespace-only string is 0 tokens.
 */
export function estimateTokens(markdown: string): number {
  if (typeof markdown !== "string") {
    throw new ContextDocError("estimateTokens expects a string.");
  }
  const words = countWords(markdown);
  if (words === 0) return 0;
  return Math.ceil(words * 1.3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneLine(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ContextDocError(`${field} must be a string.`);
  }
  if (value.includes("\n") || value.includes("\r")) {
    throw new ContextDocError(`${field} contains a newline.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new ContextDocError(`${field} is empty.`);
  }
  return trimmed;
}

function anchorLine(file: string, id: string): string {
  return `@.hitchhiker/${file}#${id}`;
}

function readGlosses(gloss: unknown): Record<GlossKey, string> {
  if (!isRecord(gloss)) {
    throw new ContextDocError("gloss must be an object.");
  }
  const out = {} as Record<GlossKey, string>;
  for (const key of GLOSS_KEYS) {
    const field = `Gloss ${key}`;
    const text = oneLine(gloss[key], field);
    const count = countWords(text);
    if (count > GLOSS_WORD_CAP) {
      throw new ContextDocError(
        `${field} is ${count} words. The cap is ${GLOSS_WORD_CAP}. The caller cuts it.`,
      );
    }
    out[key] = text;
  }
  return out;
}

function glossSection(key: GlossKey, text: string): string[] {
  const anchor = CONTEXT_ANCHORS[key];
  return [
    `## ${SECTION_HEADINGS[key]}`,
    "",
    anchorLine(anchor.file, anchor.id),
    "",
    text,
    "",
  ];
}

function rulesSection(): string[] {
  return [
    "## Rules",
    "",
    "### Anti-slop",
    "",
    ...ANTI_SLOP.map((item) => `- ${item}`),
    "",
    "### Coexistence",
    "",
    ...COEXISTENCE.map((item) => `- ${item}`),
    "",
  ];
}

function render(name: string, siteWhy: string, gloss: Record<GlossKey, string>): string {
  const lines = [
    "# CONTEXT",
    "",
    "This file is a map. It points at the specs. It does not paste them.",
    "",
    "## Identity",
    "",
    `Name: ${name}`,
    `Why: ${siteWhy}`,
    "",
  ];
  for (const key of GLOSS_KEYS) {
    lines.push(...glossSection(key, gloss[key]));
  }
  lines.push(...rulesSection());
  return lines.join("\n");
}

/**
 * Assemble the context map. Glosses are the caller's words.
 * A gloss longer than 40 words throws. The result throws when the
 * word-times-1.3 estimate exceeds 30,000 tokens.
 */
export function assembleContext(input: ContextInput): ContextDoc {
  if (!isRecord(input)) {
    throw new ContextDocError("assembleContext expects an object.");
  }
  const name = oneLine(input.name, "Name");
  const siteWhy = oneLine(input.siteWhy, "siteWhy");
  const gloss = readGlosses(input.gloss);
  const markdown = render(name, siteWhy, gloss);
  const tokens = estimateTokens(markdown);
  if (tokens > TOKEN_CEILING) {
    throw new ContextDocError(
      `CONTEXT.md estimates ${tokens} tokens. The ceiling is ${TOKEN_CEILING}.`,
    );
  }
  return { markdown, tokens };
}
