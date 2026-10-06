import { readFileSync } from "node:fs";
import type { Question } from "./tree.ts";

/**
 * System prompt for the Guide interviewer.
 * The skill file lives in another package. Pass its path.
 * This module does not import that package.
 * Matching uses indexOf on a lowercased copy, never a regular expression,
 * so a coverage line cannot force a ReDoS.
 * No live model call.
 */

export interface PersonaContext {
  question: Question;
  depth: "express" | "standard" | "deep";
  coverageLine: string;
}

export class PersonaError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Persona text refused: ${reason}`);
    this.name = "PersonaError";
    this.reason = reason;
  }
}

const BANNED: readonly { needle: string; reason: string }[] = [
  { needle: "autistic", reason: "autistic" },
  { needle: "autism", reason: "autism" },
  { needle: "asperger", reason: "asperger" },
  { needle: "disorder", reason: "disorder" },
  { needle: "spectrum", reason: "spectrum" },
  { needle: "!", reason: "exclamation mark" },
  { needle: "\u2014", reason: "em dash" },
];

const PANIC = "don't panic";
/** Once is the phase name. More than twice is a book-title gag. */
const PANIC_LIMIT = 2;

const EXPRESS_LINE =
  "This is Express. Ask only this question, then move on. Do not open a side lesson.";

/**
 * Throws when the text names a diagnosis, uses an exclamation mark or an em
 * dash, or repeats the phase title more than twice.
 * Comparison is case-insensitive. Curly apostrophes count as straight ones.
 */
export function assertPersonaSafe(text: string): void {
  const lower = text.toLowerCase().replaceAll("\u2019", "'");
  for (const banned of BANNED) {
    if (lower.indexOf(banned.needle) !== -1) {
      throw new PersonaError(banned.reason);
    }
  }
  let count = 0;
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf(PANIC, from);
    if (at < 0) {
      return;
    }
    count += 1;
    if (count > PANIC_LIMIT) {
      throw new PersonaError("Don't Panic");
    }
    from = at + PANIC.length;
  }
}

function oneLine(value: string): string {
  return value.replaceAll("\r\n", " ").replaceAll("\n", " ").replaceAll("\r", " ");
}

/**
 * Reads the skill at skillPath and appends the current question.
 * Express adds one line so the model does not open a side lesson.
 * The result is refused if it fails assertPersonaSafe.
 */
export function buildSystemPrompt(skillPath: string, ctx: PersonaContext): string {
  let skill: string;
  try {
    skill = readFileSync(skillPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unreadable";
    throw new PersonaError(`cannot read persona skill: ${detail}`);
  }
  const lines = [
    skill.trimEnd(),
    "",
    "```text",
    `Current question id: ${oneLine(ctx.question.id)}`,
    `Ask: ${oneLine(ctx.question.ask)}`,
    `Depth: ${ctx.depth}`,
    `Coverage: ${oneLine(ctx.coverageLine)}`,
  ];
  if (ctx.depth === "express") {
    lines.push(EXPRESS_LINE);
  }
  lines.push("```", "");
  const prompt = lines.join("\n");
  assertPersonaSafe(prompt);
  return prompt;
}
