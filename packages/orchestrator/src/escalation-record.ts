/**
 * Markdown for one escalation, for the drive log under .hitchhiker/logs.
 * Pure function. It does not write a file, start a session, or continue the drive.
 * toMarkdown and escalationMarkdown are the same writer. The app does not call it.
 *
 * The record matches decideTriage's escalate branch: promptId, rule, reason, at.
 * Rule 4 adds the same stack sentence the desk panel shows.
 */

export interface EscalationRecord {
  promptId: string;
  rule: 1 | 2 | 3 | 4;
  reason: string;
  at: string;
}

export class EscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscalationError";
  }
}

const STACK_SENTENCE = "A failed install is not a license to change the stack.";
const NEXT_ACTION = "Next action: Pause the drive.";
const STOPPED = "The drive does not continue from here.";

const FORBIDDEN = ["replace gsap", "swap package", "try a different library"];

function assertRecord(record: EscalationRecord): { promptId: string; rule: 1 | 2 | 3 | 4; reason: string; at: string } {
  if (typeof record !== "object" || record === null) {
    throw new EscalationError("Escalation record is missing.");
  }
  if (typeof record.promptId !== "string" || record.promptId.trim() === "") {
    throw new EscalationError("Escalation needs a prompt id.");
  }
  const rule: unknown = record.rule;
  if (rule !== 1 && rule !== 2 && rule !== 3 && rule !== 4) {
    throw new EscalationError("rule must be 1, 2, 3, or 4.");
  }
  if (typeof record.reason !== "string" || record.reason.trim() === "") {
    throw new EscalationError("Escalation reason is empty.");
  }
  if (typeof record.at !== "string" || record.at.trim() === "") {
    throw new EscalationError("Escalation needs a time.");
  }

  const promptId = record.promptId.trim();
  const reason = record.reason.trim();
  const at = record.at.trim();
  if (promptId.includes("\n") || promptId.includes("\r")) {
    throw new EscalationError("Prompt id must be a single line.");
  }
  if (at.includes("\n") || at.includes("\r")) {
    throw new EscalationError("Escalation time must be a single line.");
  }
  assertPublishable(promptId);
  assertPublishable(reason);
  assertPublishable(at);
  return { promptId, rule, reason, at };
}

function assertPublishable(value: string): void {
  if (value.includes("!")) {
    throw new EscalationError("Escalation copy cannot use an exclamation mark.");
  }
  const lower = value.toLowerCase();
  for (const phrase of FORBIDDEN) {
    if (lower.includes(phrase)) {
      throw new EscalationError("Escalation cannot offer a stack change.");
    }
  }
}

/** Same facts as the desk panel, as markdown for the drive log. */
export function toMarkdown(record: EscalationRecord): string {
  const clean = assertRecord(record);
  const lines = [
    "# Escalation",
    "",
    `Prompt: ${clean.promptId}`,
    `Rule: ${clean.rule}`,
    `At: ${clean.at}`,
    "",
    "Reason:",
    "",
    clean.reason,
    "",
  ];
  if (clean.rule === 4) {
    lines.push(STACK_SENTENCE, "");
  }
  lines.push(NEXT_ACTION, "", STOPPED, "");
  return lines.join("\n");
}

export function escalationMarkdown(record: EscalationRecord): string {
  return toMarkdown(record);
}
