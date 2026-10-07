/**
 * Desk panel for one drive escalation.
 *
 * The record is decideTriage's escalate branch: `promptId` and `rule` from
 * that call, `reason` from the action, and `at` from the caller. This module
 * returns HTML. It does not write a log, start a session, or continue the drive.
 *
 * Rule 4 adds one sentence. The only control is Pause the drive.
 */

import { escapeHtml } from "./card.ts";

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
const PAUSE_LABEL = "Pause the drive";

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

/** Show a Zulu timestamp as a clock time. Anything else stays verbatim. */
function visibleAt(at: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?Z$/.exec(at);
  if (match === null) return at;
  const day = match[1];
  const clock = match[2];
  if (day === undefined || clock === undefined) return at;
  return `${day} ${clock} UTC`;
}

function titleId(promptId: string, rule: 1 | 2 | 3 | 4): string {
  const slug = promptId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const body = slug.length > 0 ? slug : "prompt";
  return `hh-escalation-${rule}-${body}`;
}

/**
 * Visible panel. Prompt id is the heading. Reason is one paragraph.
 * Both are escaped. Rule 4 adds the stack sentence. One button, no session.
 */
export function renderEscalation(record: EscalationRecord): string {
  const clean = assertRecord(record);
  const id = titleId(clean.promptId, clean.rule);
  const stack = clean.rule === 4 ? `\n  <p>${STACK_SENTENCE}</p>` : "";
  return `<section class="hh-error hh-rise" data-escalation data-prompt-id="${escapeHtml(clean.promptId)}" data-rule="${clean.rule}" role="alert" aria-labelledby="${id}">
  <p class="hh-kicker">Marvin</p>
  <h2 class="hh-error__title hh-qcard__title" id="${id}">Prompt ${escapeHtml(clean.promptId)}</h2>
  <p class="hh-kicker">Rule ${clean.rule}</p>
  <p class="hh-dek"><time datetime="${escapeHtml(clean.at)}">${escapeHtml(visibleAt(clean.at))}</time></p>
  <p>${escapeHtml(clean.reason)}</p>${stack}
  <p class="hh-error__next">${NEXT_ACTION}</p>
  <p>${STOPPED}</p>
  <div class="hh-qcard__actions">
    <button class="hh-btn hh-btn--secondary" type="button" data-pause-drive>${PAUSE_LABEL}</button>
  </div>
</section>`;
}
