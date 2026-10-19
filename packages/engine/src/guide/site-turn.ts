/**
 * A turn cap is a stream event, not a phrase in tool output or file text.
 * The desk does not pass a turn cap, so turnCap stays null unless a caller sets one.
 */

export interface TurnCap {
  turns: number | null;
  /** Null when the desk set no cap. */
  turnCap: number | null;
  stopReason: string;
  sessionId: string;
}

export interface TurnCapInput {
  stdout: string;
  stderr: string;
  log: string;
  code: number | null;
  /** Desk cap. The site runner passes null. */
  turnCap?: number | null;
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STDERR_TAIL = 20;

/** Plain sentence for the drive. No raw JSON. */
export function turnLimitReason(turns: number | null, turnCap: number | null): string {
  if (turnCap !== null && turns !== null) {
    return `Grok stopped after ${turns} turns (cap ${turnCap}). Press Retry to run this prompt again.`;
  }
  if (turnCap !== null) {
    return `Grok stopped at a turn limit (cap ${turnCap}). Press Retry to run this prompt again.`;
  }
  if (turns !== null) {
    return `Grok stopped after ${turns} turns; the desk sets no cap, so Grok's own limit applied. Press Retry to run this prompt again.`;
  }
  return "Grok stopped at a turn limit; the desk sets no cap, so Grok's own limit applied. Press Retry to run this prompt again.";
}

/**
 * A cap is a top-level JSON event, a final end whose stop reason means the cap,
 * or a non-zero exit whose last stderr lines say the process hit the cap.
 * Text inside tool results, assistant text, and file contents does not count.
 */
export function judgeTurnCap(input: TurnCapInput): TurnCap | null {
  const events = [...parseEvents(input.stdout), ...parseEvents(input.log), ...parseEvents(input.stderr)];
  let capEvent = false;
  let turns: number | null = null;
  let sessionId = "";
  let stopReason = "";
  let endStop = "";
  let endTurns: number | null = null;
  let endSession = "";

  for (const event of events) {
    const type = event.type;
    if (type === "max_turns_reached") {
      capEvent = true;
      turns = turns ?? numberField(event, "num_turns") ?? numberField(event, "turns");
      if (sessionId === "") sessionId = sessionField(event);
      const reason = stringField(event, "stopReason");
      if (reason !== "") stopReason = reason;
      continue;
    }
    if (type === "end") {
      endStop = stringField(event, "stopReason");
      endTurns = numberField(event, "num_turns") ?? numberField(event, "turns");
      endSession = sessionField(event);
    }
  }

  const endMeansCap = endStop === "max_turns_reached" || (endStop === "cancelled" && endTurns !== null);
  const stderrCap = !capEvent && !endMeansCap && nonzero(input.code) && stderrSaysCap(input.stderr);
  if (!capEvent && !endMeansCap && !stderrCap) return null;

  if (endMeansCap) {
    if (turns === null) turns = endTurns;
    if (endStop !== "") stopReason = endStop;
  }
  if (capEvent && (stopReason === "" || stopReason === "end_turn")) stopReason = "max_turns_reached";
  if (stderrCap && stopReason === "") stopReason = "max_turns_reached";
  if (endSession !== "") sessionId = endSession;

  const deskCap = input.turnCap === undefined || input.turnCap === null ? null : finite(input.turnCap);
  return { turns, turnCap: deskCap, stopReason, sessionId };
}

function nonzero(code: number | null): boolean {
  return typeof code === "number" && Number.isFinite(code) && code !== 0;
}

function finite(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Last stderr lines only. JSON lines are stream events, already handled above. */
function stderrSaysCap(stderr: string): boolean {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  for (const line of lines.slice(-STDERR_TAIL)) {
    if (line.startsWith("{")) continue;
    if (/\bmax turns reached\b/i.test(line)) return true;
  }
  return false;
}

function parseEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      if (typeof (parsed as { type?: unknown }).type !== "string") continue;
      events.push(parsed as Record<string, unknown>);
    } catch {
      continue;
    }
  }
  return events;
}

function stringField(event: Record<string, unknown>, key: string): string {
  const value = event[key];
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function numberField(event: Record<string, unknown>, key: string): number | null {
  const value = event[key];
  return typeof value === "number" ? finite(value) : null;
}

function sessionField(event: Record<string, unknown>): string {
  const value = event.sessionId;
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SESSION_ID.test(trimmed) ? trimmed : "";
}
