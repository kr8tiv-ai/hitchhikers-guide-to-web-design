import type { AnswerRecord } from "@hitchhiker/engine";

/**
 * How a stored answer is spoken in the transcript.
 * The interview file keeps the original value. Only the rendered line changes.
 */

export type TranscriptKind = "you" | "skip" | "not-asked" | "assumed";

const NOT_APPLICABLE_3D = "Not applicable: 3D is none, so the custom generation budget is not asked.";
const NOT_ASKED_3D = "Not asked: 3D is none, so the custom budget is not needed";

export function transcriptKind(status: AnswerRecord["status"], value: string): TranscriptKind {
  const trimmed = value.trim();
  if (status === "SKIPPED" && isNotApplicable(trimmed)) return "not-asked";
  if (status === "SUGGESTED" || (status === "SKIPPED" && isAssumed(trimmed))) return "assumed";
  if (status === "SKIPPED") return "skip";
  return "you";
}

export function transcriptCopy(kind: TranscriptKind, value: string): string {
  const trimmed = value.trim();
  if (kind === "skip") return "Skipped";
  if (kind === "not-asked") return notAskedCopy(trimmed);
  if (kind === "assumed") return `Assumed: ${stripAssumed(trimmed)}`;
  return value;
}

function isNotApplicable(trimmed: string): boolean {
  return trimmed.toLowerCase().startsWith("not applicable:");
}

function isAssumed(trimmed: string): boolean {
  return trimmed.toLowerCase().startsWith("assumed:");
}

function notAskedCopy(trimmed: string): string {
  if (trimmed.toLowerCase() === NOT_APPLICABLE_3D.toLowerCase()) return NOT_ASKED_3D;
  const rest = trimmed.slice("not applicable:".length).trim();
  return `Not asked: ${rest}`;
}

function stripAssumed(trimmed: string): string {
  if (!isAssumed(trimmed)) return trimmed;
  return trimmed.slice("assumed:".length).trim();
}
