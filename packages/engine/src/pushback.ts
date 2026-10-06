import type { AnswerRecord } from "./required.ts";
import type { Question } from "./tree.ts";

/**
 * Deterministic soft-answer check. The live model is a later prompt.
 * Matching is String indexOf on the first 500 characters, never a regular
 * expression, so the user text cannot force a ReDoS.
 * List phrases are used whole. A shorter word such as "fine" does not match
 * the phrase "it's fine".
 */

const INSPECT_CHARS = 500;

const GLOBAL_SOFT_PHRASES: readonly string[] = [
  "it's fine",
  "whatever",
  "you decide",
  "idk",
  "something modern",
  "make it pop",
];

/**
 * A calm question when the trimmed text contains a pushback_if phrase or a
 * global soft phrase. Null when it does not.
 */
export function pushbackFor(question: Question, text: string): string | null {
  const inspected = text.slice(0, INSPECT_CHARS);
  const phrases = [...(question.pushbackIf ?? []), ...GLOBAL_SOFT_PHRASES];
  for (const phrase of phrases) {
    const quoted = matchedSlice(inspected, phrase);
    if (quoted !== null) {
      return `You wrote "${quoted}". What is one concrete detail the site should use?`;
    }
  }
  return null;
}

/**
 * Markdown the brief can show. Counts every status. Lists each non-empty
 * SOFT id and its value. The chrome has no exclamation mark.
 */
export function coverageReport(answers: readonly AnswerRecord[]): string {
  const counts = {
    answered: 0,
    suggested: 0,
    skipped: 0,
    soft: 0,
    imported: 0,
  };
  const softLines: string[] = [];
  for (const answer of answers) {
    if (answer.status === "ANSWERED") counts.answered += 1;
    else if (answer.status === "SUGGESTED") counts.suggested += 1;
    else if (answer.status === "SKIPPED") counts.skipped += 1;
    else if (answer.status === "SOFT") {
      counts.soft += 1;
      const value = answer.value.trim();
      if (value !== "") softLines.push(`- ${answer.id}: ${value}`);
    } else if (answer.status === "IMPORTED") counts.imported += 1;
  }
  const softBody = softLines.length === 0 ? "None." : softLines.join("\n");
  return [
    "# Coverage",
    "",
    `Answered: ${counts.answered}`,
    `Suggested: ${counts.suggested}`,
    `Skipped: ${counts.skipped}`,
    `Soft: ${counts.soft}`,
    `Imported: ${counts.imported}`,
    "",
    "## Soft",
    "",
    softBody,
    "",
  ].join("\n");
}

function matchedSlice(inspected: string, phrase: string): string | null {
  const needle = phrase.trim().toLowerCase();
  if (needle.length === 0) return null;
  const at = inspected.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  return inspected.slice(at, at + needle.length);
}
