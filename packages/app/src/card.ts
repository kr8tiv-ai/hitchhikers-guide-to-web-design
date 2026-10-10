import type { InterviewCommand, InterviewSession, Question } from "@hitchhiker/engine";

/**
 * One question. The interview session stores the answer.
 * Suggest does not call a model from this card.
 */

export type CardMode = "express" | "standard" | "deep";

/** Position and open-required count, computed with interview coverage. The client does not recount. */
export interface CardCounts {
  index: number;
  total: number;
  phase: string;
  openRequired: number;
  mode: CardMode;
  modeNote: string;
}

/** The Suggest or Skip written on the previous card. */
export interface CardAssumption {
  value: string;
  kind: "suggested" | "skipped";
}

export interface CardState {
  question: Question | null;
  draft: string;
  pushback: string | null;
  error: string | null;
  done: boolean;
  /** True while a command is in flight. A second submit returns this same state. */
  pending: boolean;
  /** True while the talk button is held and the browser is listening. */
  listening?: boolean;
  /** A calm line under the field: listening, heard, or how to fix the mic. */
  notice?: string | null;
  /** True after Hold to talk has been used on this page. */
  voiceNote?: boolean;
  /** Desk progress. Absent on the before-jump card, which keeps the id kicker. */
  counts?: CardCounts | null;
  assumption?: CardAssumption | null;
  /** True when Skip must be confirmed before it writes. */
  required?: boolean;
  /** True after the first Skip click on a required question. */
  skipConfirm?: boolean;
  /** True on the desk, where Enter submits and Shift+Enter adds a line. */
  enterHint?: boolean;
}

/**
 * Prompt 167 named these labels with an em dash.
 * Screen copy rejects that glyph, so the break is a colon.
 */
export const SUGGEST_LABEL = "Suggest: I'll mark it as assumed";
export const SKIP_LABEL = "Skip: we'll assume";
export const ANSWER_HINT = "Enter sends the answer. Shift+Enter adds a line.";
export const PLACEHOLDER_FALLBACK = "A short sentence in your own words.";
export const SKIP_CONFIRM = "This one is required. Choose Skip again to write the assumption.";

export type CardEvent =
  | { type: "type"; text: string }
  | { type: "submit" }
  | { type: "suggest" }
  | { type: "skip" };

/** Engine session, plus lastPushback so a hold can be shown on the same card. */
export type CardSession = Pick<InterviewSession, "command" | "next" | "lastPushback">;

const EMPTY_ANSWER = "Write an answer or skip.";

/** Shown under Hold to talk the first time that button is used. Chrome's Web Speech API uploads the audio. */
export const VOICE_SERVICE_NOTE = "Chrome sends this audio to its speech service.";
const DONE_TITLE = "Guide Entry is next.";
const DONE_WHY = "The questions on this desk are finished.";
const EMPTY_TITLE = "No question yet.";
const EMPTY_WHY = "One card will sit here when the interview starts.";
const SAVE_FAILED = "The answer did not save. Try again, or skip.";

interface CardQuery {
  getAttribute(name: string): string | null;
  parentElement: CardQuery | null;
  textContent: string | null;
  disabled?: boolean;
  value?: string;
}

interface CardDomEvent {
  target: CardQuery | null;
  preventDefault(): void;
}

export interface CardRoot {
  innerHTML: string;
  querySelector(selector: string): CardQuery | null;
  addEventListener(type: string, listener: (event: CardDomEvent) => void): void;
  removeEventListener(type: string, listener: (event: CardDomEvent) => void): void;
}

/** Replaces &, <, and >, plus quotes so attribute values cannot break out of the tag. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return SAVE_FAILED;
}

function isFlight(event: CardEvent): boolean {
  return event.type === "submit" || event.type === "suggest" || event.type === "skip";
}

export async function reduceCard(
  state: CardState,
  event: CardEvent,
  session: CardSession,
): Promise<CardState> {
  if (event.type === "type") {
    return {
      question: state.question,
      draft: event.text,
      pushback: state.pushback,
      error: null,
      done: state.done,
      pending: state.pending,
    };
  }

  // Submit, suggest, and skip share one in-flight command. A second one waits.
  if (state.pending || state.done || state.question === null) {
    return state;
  }

  if (event.type === "submit" && state.draft.trim() === "") {
    return {
      question: state.question,
      draft: state.draft,
      pushback: state.pushback,
      error: EMPTY_ANSWER,
      done: false,
      pending: false,
    };
  }

  const command: InterviewCommand =
    event.type === "submit"
      ? { type: "answer", text: state.draft }
      : event.type === "suggest"
        ? { type: "suggest" }
        : { type: "skip" };

  try {
    await session.command(command);
  } catch (error) {
    return {
      question: state.question,
      draft: state.draft,
      pushback: state.pushback,
      error: messageFrom(error),
      done: state.done,
      pending: false,
    };
  }

  const question = await session.next();
  return {
    question,
    draft: "",
    pushback: session.lastPushback ?? null,
    error: null,
    done: question === null,
    pending: false,
  };
}

function attr(name: string, value: string): string {
  return ` ${name}="${escapeHtml(value)}"`;
}

function button(
  action: "answer" | "suggest" | "skip",
  label: string,
  variant: "primary" | "secondary" | "ghost",
  disabled: boolean,
): string {
  const flag = disabled ? " disabled" : "";
  return `<button class="hh-btn hh-btn--${variant}" type="button" data-action="${action}"${flag}>${escapeHtml(label)}</button>`;
}

/** Hold fills the draft. It does not submit. Typing in the field still works. */
function talkButton(disabled: boolean, listening: boolean): string {
  const flag = disabled ? " disabled" : "";
  if (listening) {
    return `<button class="hh-btn hh-btn--secondary hh-btn--listening" type="button" data-voice="hold" aria-pressed="true"${flag}>Listening. Release to stop</button>`;
  }
  return `<button class="hh-btn hh-btn--secondary" type="button" data-voice="hold"${flag}>Hold to talk</button>`;
}

function noticeLine(notice: string | null): string {
  if (notice === null || notice === "") return "";
  return `  <p class="hh-qcard__notice" role="status" data-card-notice>${escapeHtml(notice)}</p>\n`;
}

function voiceNoteLine(show: boolean): string {
  if (!show) return "";
  return `  <p class="hh-qcard__voice-note" data-voice-note>${escapeHtml(VOICE_SERVICE_NOTE)}</p>\n`;
}

function httpsHref(url: string | undefined): string | null {
  if (url === undefined || url === "") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname === "") return null;
    return url;
  } catch {
    return null;
  }
}

/** Places to look, under the why. Absent resources leave the card unchanged. */
function whereToLook(resources: Question["resources"]): string {
  if (resources === undefined || resources.length === 0) return "";
  const items = resources.map((item) => {
    const note = escapeHtml(item.note);
    const href = httpsHref(item.url);
    if (href === null) return `      <li>${escapeHtml(item.label)}: ${note}</li>`;
    return `      <li><a${attr("href", href)} target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>, ${note}</li>`;
  });
  return `  <details class="hh-qcard__look" open>
    <summary>Where to look</summary>
    <ul>
${items.join("\n")}
    </ul>
  </details>
`;
}

function heading(title: string, why: string, done: boolean): string {
  const marker = done ? ' data-done="true"' : "";
  return `<article class="hh-qcard"${marker} aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(title)}</h2>
  <p class="hh-qcard__why">${escapeHtml(why)}</p>
</article>`;
}

function kickerBlock(question: Question, counts: CardCounts | null | undefined): string {
  if (counts === undefined || counts === null) {
    return `  <p class="hh-kicker">${escapeHtml(question.id)}</p>\n`;
  }
  const line = `${question.id} · ${counts.index} of ${counts.total} · ${counts.phase}`;
  return `  <p class="hh-kicker" data-card-kicker>${escapeHtml(line)}</p>
  <p class="hh-qcard__count" data-open-required>${counts.openRequired} required still open</p>
  <p class="hh-qcard__mode" data-interview-mode="${escapeHtml(counts.mode)}">${escapeHtml(counts.modeNote)}</p>
`;
}

function assumptionBlock(assumption: CardAssumption | null | undefined): string {
  if (assumption === undefined || assumption === null) return "";
  const value = assumption.value.trim().replace(/^ASSUMED:\s*/i, "");
  if (value === "") return "";
  return `  <p class="hh-qcard__assumed" data-assumed="${assumption.kind}">Assumed: ${escapeHtml(value)}</p>\n`;
}

function confirmBlock(state: CardState): string {
  if (state.skipConfirm !== true || state.required !== true) return "";
  return `  <p class="hh-qcard__confirm" data-skip-confirm>${escapeHtml(SKIP_CONFIRM)}</p>\n`;
}

function sampleAnswer(question: Question): string {
  const suggest = question.suggest?.trim() ?? "";
  return suggest === "" ? PLACEHOLDER_FALLBACK : suggest;
}

/** HTML for the current question only. Mounts inside data-region="question". */
export function renderCard(state: CardState): string {
  if (state.done) return heading(DONE_TITLE, DONE_WHY, true);
  const question = state.question;
  if (question === null) return heading(EMPTY_TITLE, EMPTY_WHY, false);

  // A hold shows the pushback and an empty field, so the soft line is not sent again.
  const field = state.pushback === null ? state.draft : "";
  const hint = state.enterHint === true;
  const describedBy = [hint ? "hh-card-hint" : "", state.error === null ? "" : "hh-card-error"]
    .filter((id) => id !== "")
    .join(" ");
  const described = [
    state.error === null ? "" : ' aria-invalid="true"',
    describedBy === "" ? "" : ` aria-describedby="${describedBy}"`,
  ].join("");
  const alert = state.error === null ? "" : ' role="alert"';
  const busy = state.pending ? ' aria-busy="true"' : "";
  const pushAttr = state.pushback === null ? "" : attr("data-pushback", state.pushback);
  const pushLine =
    state.pushback === null || state.pushback === ""
      ? ""
      : `  <p class="hh-qcard__push">${escapeHtml(state.pushback)}</p>\n`;
  const hintLine = hint
    ? `  <p class="hh-qcard__hint" id="hh-card-hint">${escapeHtml(ANSWER_HINT)}</p>\n`
    : "";

  return `<article class="hh-qcard"${attr("data-question-id", question.id)}${pushAttr}${busy} aria-labelledby="hh-card-ask">
${kickerBlock(question, state.counts)}${assumptionBlock(state.assumption)}  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(question.ask)}</h2>
  <p class="hh-qcard__why">${escapeHtml(question.why)}</p>
${whereToLook(question.resources)}${pushLine}  <div class="hh-qcard__composer">
  <label class="hh-qcard__field">
    <span class="hh-qcard__label">Your answer</span>
    <textarea class="hh-qcard__input" id="hh-card-draft" name="draft" rows="5" autocomplete="off"${attr("placeholder", sampleAnswer(question))}${described}>${escapeHtml(field)}</textarea>
  </label>
${hintLine}  <p class="hh-error hh-qcard__error" id="hh-card-error" data-card-error${alert}>${escapeHtml(state.error ?? "")}</p>
${noticeLine(state.notice ?? null)}${confirmBlock(state)}  <div class="hh-qcard__actions">
    ${talkButton(state.pending, state.listening === true)}
    ${button("answer", "Answer", "primary", state.pending || field.trim() === "")}
    ${button("suggest", SUGGEST_LABEL, "secondary", state.pending)}
    ${button("skip", SKIP_LABEL, "ghost", state.pending)}
  </div>
${voiceNoteLine(state.voiceNote === true)}  </div>
</article>`;
}

function readAction(start: CardQuery | null): "answer" | "suggest" | "skip" | null {
  let node = start;
  const seen = new Set<CardQuery>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    const action = node.getAttribute("data-action");
    if (action === "answer" || action === "suggest" || action === "skip") return action;
    node = node.parentElement;
  }
  return null;
}

/**
 * Wires a minimal question-region root to the session.
 * Typing updates the draft in place. Commands re-render the one card.
 */
export function bindCard(root: CardRoot, session: CardSession): () => void {
  const question = session.next();
  let state: CardState = {
    question,
    draft: "",
    pushback: session.lastPushback ?? null,
    error: null,
    done: question === null,
    pending: false,
  };

  const onClick = (event: CardDomEvent): void => {
    event.preventDefault();
    const action = readAction(event.target);
    if (action === "answer") void run({ type: "submit" });
    else if (action === "suggest") void run({ type: "suggest" });
    else if (action === "skip") void run({ type: "skip" });
  };

  const onInput = (event: CardDomEvent): void => {
    const text = event.target?.value;
    if (typeof text !== "string") return;
    void run({ type: "type", text });
  };

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.innerHTML = renderCard(state);

  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
  };

  async function run(event: CardEvent): Promise<void> {
    if (isFlight(event) && state.pending) {
      state = await reduceCard(state, event, session);
      return;
    }

    const snapshot = state;
    if (isFlight(event)) {
      state = { ...snapshot, pending: true };
      root.innerHTML = renderCard(state);
    }

    const result = await reduceCard(isFlight(event) ? snapshot : state, event, session);
    if (event.type === "type") {
      state = result;
      const answer = root.querySelector('[data-action="answer"]');
      if (answer !== null) answer.disabled = result.pending || result.draft.trim() === "";
      const errorNode = root.querySelector("[data-card-error]");
      if (errorNode !== null) errorNode.textContent = result.error ?? "";
      return;
    }

    state = result;
    root.innerHTML = renderCard(state);
  }
}
