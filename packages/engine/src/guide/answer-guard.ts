import type { Question } from "../tree.ts";

/** Shown when a post repeats the question's own helper, hint, or why line. */
export const STATIC_ANSWER_ERROR = "That line is the question's helper, not an answer. Write your own.";

/**
 * Helper, placeholder, hint, and why text are not answers.
 * Comparison is the trimmed line with collapsed whitespace.
 */
export function bannedAnswer(question: Question, text: string, extras: readonly string[] = []): string | null {
  const trimmed = collapse(text);
  if (trimmed === "") return null;
  const fields = [question.suggest, question.why, question.tip, ...extras];
  for (const field of fields) {
    const line = collapse(field ?? "");
    if (line !== "" && line === trimmed) return STATIC_ANSWER_ERROR;
  }
  return null;
}

function collapse(text: string): string {
  let out = "";
  let space = false;
  for (const ch of text.trim()) {
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      space = out !== "";
      continue;
    }
    if (space) out += " ";
    space = false;
    out += ch;
  }
  return out;
}
