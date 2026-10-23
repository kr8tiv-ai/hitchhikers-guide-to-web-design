import type { InterviewCommand, InterviewSession, Question } from "@hitchhiker/engine";
import { acceptAttribute, kindsFor, zoneCopy } from "./client/attach.ts";
import { dropInternalCopy, omitModelInstructions, stripQuestionIds, stripRawMarkdown } from "./question-parts.ts";
import { SPECIMEN_SVG } from "./type-specimen-data.ts";

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

export type CardChoiceId = "A" | "B" | "C" | "D";

export interface CardChoice {
  id: CardChoiceId;
  label: string;
  why: string;
  source: string;
}

/** Shared by Suggest and a weak-answer follow-up. `origin` says model or fallback. */
export interface CardChoiceSet {
  forId: string;
  origin: "model" | "fallback";
  items: CardChoice[];
}

export const OTHER_CHOICE_LABEL = "Other: I'll write my own";

/** One saved file or link on the card. Rendered from state, so a repaint keeps it. */
export interface AttachChipView {
  id: string;
  kind: "file" | "link";
  label: string;
  detail: string;
  removeName: string;
  previewUrl?: string;
  error?: string;
  ready: boolean;
  retry?: boolean;
}

export interface AttachView {
  linkDraft: string;
  uploading: string | null;
  live: string;
  chips: AttachChipView[];
}

export interface CardState {
  question: Question | null;
  draft: string;
  pushback: string | null;
  error: string | null;
  done: boolean;
  /** True while a command is in flight. A second submit returns this same state. */
  pending: boolean;
  /** True while the voice button is on and the browser is listening. */
  listening?: boolean;
  /** A calm line under the field: listening, heard, or how to fix the mic. */
  notice?: string | null;
  /** True after the voice button has been used on this page. */
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
  /** Picks under the question. Absent when this card has nothing to choose. */
  choices?: CardChoiceSet | null;
  /** Files and links already on this question. Absent until the desk has some. */
  attach?: AttachView;
  /**
   * Repaint of the card already on screen. The live draft stays in the field.
   * A newly shown pushback leaves this off, so the field starts empty.
   */
  keepDraft?: boolean;
  /** Quiet line under the box: saved, restored, or the browser refused storage. */
  draftNote?: string | null;
  /** True after the saved line has faded. Reduced motion keeps the words visible. */
  draftFade?: boolean;
  /** Phase lead-in and recap. Rendered above the question, never inside the heading. */
  lead?: string;
  /** Extra sentences that are not the question and not button instructions. */
  help?: string;
  /** Stage line while an answer is in flight. Absent until the server names a stage. */
  reading?: string;
  /**
   * Long-wait note and Try again, already escaped, under the stage line.
   * Absent until a check has run long enough.
   */
  longWaitHtml?: string;
  /**
   * Set only after the interview is finished.
   * Omitted, the done card stays a heading with no action.
   */
  brief?: {
    status: "idle" | "drafting" | "pending" | "approved" | "revising";
    buildStarted?: boolean;
    planApproved?: boolean;
  } | null;
  /** Dealt type pairs for DP-1.5. Absent, the card uses the six canned moods. */
  fontSamples?: readonly FontSampleView[];
}

export interface FontSampleView {
  adjectives: string;
  display: string;
  body: string;
  pair: string;
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

/** Shown under the voice button the first time that button is used. Chrome's Web Speech API uploads the audio. */
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

const ACTION_TIP = {
  answer: "Sends this answer and opens the next question.",
  suggest: "Writes a marked assumption you can edit, replace, or keep.",
  skip: "Skips this question and marks an assumption. A required question asks you to confirm.",
} as const;

function button(
  action: "answer" | "suggest" | "skip",
  label: string,
  variant: "primary" | "secondary" | "ghost",
  disabled: boolean,
): string {
  const flag = disabled ? " disabled" : "";
  return `<button class="hh-btn hh-btn--${variant}" type="button" data-action="${action}" data-tip="${escapeHtml(ACTION_TIP[action])}"${flag}>${escapeHtml(label)}</button>`;
}

/** Click fills the draft. It does not submit. Typing in the field still works. */
function talkButton(disabled: boolean, listening: boolean): string {
  const flag = disabled ? " disabled" : "";
  if (listening) {
    return `<button class="hh-btn hh-btn--secondary hh-btn--listening" type="button" data-voice="hold" aria-pressed="true" data-tip="Stops listening and keeps every word heard so far."${flag}><span class="hh-voice-pulse" data-voice-pulse aria-hidden="true"></span>Stop listening</button>`;
  }
  return `<button class="hh-btn hh-btn--secondary" type="button" data-voice="hold" aria-pressed="false" data-tip="Starts listening. Click again to stop. Spoken words stay in the answer."${flag}>Click to talk</button>`;
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

/** Last guard. The eyebrow keeps the id. The heading does not. */
function headingAsk(ask: string): string {
  return stripRawMarkdown(stripQuestionIds(ask)).replace(/\s+/g, " ").trim();
}

function heading(title: string, why: string, done: boolean): string {
  const marker = done ? ' data-done="true"' : "";
  return `<article class="hh-qcard"${marker} aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(title)}</h2>
  <p class="hh-qcard__why">${escapeHtml(why)}</p>
</article>`;
}

/** Finished interview. The action is absent until the desk names a brief status. Progress stays on the interview head. */
function doneCard(brief: CardState["brief"]): string {
  if (brief === undefined || brief === null) {
    return `<article class="hh-qcard" data-done="true" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(DONE_TITLE)}</h2>
  <p class="hh-qcard__why">${escapeHtml(DONE_WHY)}</p>
</article>`;
  }
  const status = brief.status;
  let action = "";
  if (status === "idle") {
    action = `  <p class="hh-qcard__next"><button type="button" class="hh-btn hh-btn--primary" data-action="draft-brief" data-brief-auto="once">Draft the Site Brief</button></p>\n`;
  } else if (status === "drafting") {
    action = `  <p class="hh-qcard__reading" data-guide-reading aria-live="polite">Drafting the Site Brief · 0s</p>\n  <p class="hh-qcard__next"><button type="button" class="hh-btn hh-btn--primary" data-action="draft-brief" disabled>Draft the Site Brief</button></p>\n`;
  } else if (status === "pending" || status === "revising") {
    action = `  <p class="hh-qcard__next"><a class="hh-btn hh-btn--primary" href="/approve">Review the Site Brief</a></p>\n`;
  } else if (brief.buildStarted === true) {
    action = `  <p class="hh-qcard__next"><a class="hh-btn hh-btn--primary" href="/hh-dashboard">The build is started.</a></p>\n`;
  } else if (brief.planApproved === true) {
    action = `  <p class="hh-qcard__next"><a class="hh-btn hh-btn--primary" href="/approve">Review the design</a></p>\n`;
  } else {
    action = `  <p class="hh-qcard__next"><a class="hh-btn hh-btn--primary" href="/approve">Approve the plan</a></p>\n`;
  }
  return `<article class="hh-qcard" data-done="true" data-brief-status="${status}" aria-labelledby="hh-card-ask">
  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(DONE_TITLE)}</h2>
  <p class="hh-qcard__why">${escapeHtml(DONE_WHY)}</p>
${action}</article>`;
}

function kickerBlock(question: Question, counts: CardCounts | null | undefined): string {
  if (counts === undefined || counts === null) {
    return `  <p class="hh-kicker">${escapeHtml(question.id)}</p>\n`;
  }
  const line = `${question.id} · ${counts.index} of ${counts.total} · ${counts.phase}`;
  return `  <p class="hh-kicker" data-card-kicker>${escapeHtml(line)}</p>
  <p class="hh-qcard__count" data-open-required>${counts.openRequired} required still open</p>
  <p class="hh-qcard__mode" data-interview-mode="${escapeHtml(counts.mode)}">${escapeHtml(counts.modeNote)}</p>
  <p class="hh-progress" data-card-progress>Question ${counts.index} of ${counts.total}</p>
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

function hiddenLines(question: Question): string[] {
  const line = question.guidance?.trim() ?? "";
  return line === "" ? [] : [line];
}

function scrubCopy(text: string, question: Question): string {
  return dropInternalCopy(text, hiddenLines(question));
}

function leadBlock(lead: string | undefined): string {
  const text = (lead ?? "").trim();
  if (text === "") return "";
  return `  <p class="hh-qcard__lead" data-card-lead>${escapeHtml(text)}</p>\n`;
}

function helpBlock(help: string | undefined): string {
  const text = (help ?? "").trim();
  if (text === "" || /suggest for me|skipping is allowed|three ways forward/i.test(text)) return "";
  return `  <p class="hh-qcard__help" data-card-help>${escapeHtml(text)}</p>\n`;
}

function whyLine(why: string): string {
  if (why === "") return "";
  return `  <p class="hh-qcard__why">${escapeHtml(why)}</p>\n`;
}

/** Same tab. The desk nav on /gallery is the way back to this question. */
function galleryOpen(question: Question): string {
  if (question.id !== "DP-5.2") return "";
  return `  <p class="hh-qcard__next"><a class="hh-btn hh-btn--primary hh-qcard__gallery" href="/gallery">Open the gallery</a></p>\n`;
}

const FONT_EXAMPLES = /pick a style from these examples/i;

/**
 * Six moods from the pairing library. Labels are the dealt families.
 * The browser bundle cannot import the engine, so the names are written here.
 * question-parts-226 checks each label against pickType.
 */
const FONT_SAMPLES: readonly FontSampleView[] = [
  { adjectives: "editorial, quiet, publishing", display: "Gambetta", body: "Synonym", pair: "Gambetta + Synonym" },
  { adjectives: "playful food", display: "Erode", body: "Ranade", pair: "Erode + Ranade" },
  { adjectives: "brutalist poster", display: "Tanker", body: "Cabinet Grotesk", pair: "Tanker + Cabinet Grotesk" },
  { adjectives: "fashion, sharp", display: "Clash Display", body: "Satoshi", pair: "Clash Display + Satoshi" },
  { adjectives: "product, one family", display: "Switzer", body: "Switzer", pair: "Switzer" },
  { adjectives: "3d-world poster", display: "Unbounded", body: "Instrument Sans", pair: "Unbounded + Instrument Sans" },
];

const SAMPLE_LINE = "Find your calm";
/** Cached outline of "Find your calm" in that display face. Null when the face was not outlined. */
export function specimenSvg(display: string): string | null {
  const svg = SPECIMEN_SVG[display];
  if (svg === undefined) return null;
  if (!svg.includes(`<!-- face:${display} -->`) || !svg.includes("<path")) return null;
  if (/ui-sans-serif|font-family\s*=/i.test(svg)) return null;
  return svg;
}

function specimenSrc(display: string): string | null {
  const svg = specimenSvg(display);
  if (svg === null) return null;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Each sample names a library pair. The live line uses that display face.
 * Until the face loads, the specimen image is what you see. A system stand-in
 * is used only with the approximate-preview label.
 */
function fontExamplesHtml(ask: string, samples: readonly FontSampleView[] | undefined): string {
  if (!FONT_EXAMPLES.test(ask)) return "";
  const list = samples !== undefined && samples.length > 0 ? samples : FONT_SAMPLES;
  const buttons = list.map((sample) => {
    const display = sample.display;
    const body = sample.body === "" ? display : sample.body;
    const src = specimenSrc(display);
    const outlined = src !== null;
    const image = outlined
      ? `<img class="hh-type-sample__specimen" alt="Find your calm, set in ${escapeHtml(display)}" src="${src}" />`
      : "";
    const approx = outlined
      ? `<span class="hh-type-sample__approx" hidden>approximate preview</span>`
      : `<span class="hh-type-sample__approx">approximate preview</span>`;
    return `    <button type="button" class="hh-type-sample" data-font-sample="${escapeHtml(sample.adjectives)}" data-display="${escapeHtml(display)}" data-body="${escapeHtml(body)}" data-specimen="${outlined ? "outline" : "missing"}" aria-pressed="false">
      <span class="hh-type-sample__display" data-display="${escapeHtml(display)}">${SAMPLE_LINE}</span>
      ${image}
      ${approx}
      <span class="hh-type-sample__text" data-body="${escapeHtml(body)}">${escapeHtml(sample.pair)}</span>
      <span class="hh-type-sample__name">${escapeHtml(sample.adjectives)}</span>
    </button>`;
  });
  return `  <div class="hh-type-samples" role="group" aria-label="Font examples">
${buttons.join("\n")}
  </div>
`;
}

function sampleAnswer(question: Question): string {
  const suggest = question.suggest?.trim() ?? "";
  return suggest === "" ? PLACEHOLDER_FALLBACK : suggest;
}

const CHOICE_IDS: readonly CardChoiceId[] = ["A", "B", "C", "D"];
const CHOICE_DP = /\bDP-\d+(?:\.\d+)?[a-z]?(?:-[a-z0-9]+)?\b/gi;

/** Option labels and values never carry a question id. */
export function choiceCopy(value: string): string {
  return value
    .replace(CHOICE_DP, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+:/g, ":")
    .replace(/:\s*$/g, "")
    .trim();
}

/**
 * Choices for this question only. A set keyed to another id is dropped.
 * Letters are reassigned so a filtered list stays A, B, C, D.
 */
export function buildChoicesForQuestion(
  questionId: string,
  ask: string,
  pushback: string | null,
  set: CardChoiceSet | null | undefined,
): CardChoiceSet | null {
  if (set === null || set === undefined || set.forId !== questionId) return null;
  const items: CardChoice[] = [];
  for (const item of set.items) {
    const label = choiceCopy(item.label);
    if (label === "") continue;
    if (sameQuestion(label, ask) || sameQuestion(label, pushback ?? "")) continue;
    const id = CHOICE_IDS[items.length];
    if (id === undefined) break;
    const source = choiceCopy(item.source);
    items.push({
      id,
      label,
      why: choiceCopy(item.why),
      source: source === "" ? "choice" : source,
    });
  }
  if (items.length === 0) return null;
  return { forId: questionId, origin: set.origin, items };
}

function sameQuestion(label: string, other: string): boolean {
  const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.?!,:;]+$/g, "");
  const left = norm(label);
  const right = norm(other);
  return left !== "" && left === right;
}

/**
 * Radiogroup under the question. Letter picks plus Other.
 * The live line counts lettered choices only.
 */
export function renderChoiceGroup(set: CardChoiceSet): string {
  const items = set.items.filter((item, index) => item.id === CHOICE_IDS[index]).slice(0, 4);
  if (items.length < 1) return "";
  const noun = items.length === 1 ? "choice" : "choices";
  const radios = items.map((item, index) => {
    const tab = index === 0 ? "0" : "-1";
    const checked = "false";
    const label = choiceCopy(item.label);
    const source = choiceCopy(item.source);
    const shownSource = source === "" ? "choice" : source;
    const name = `${item.id}. ${label}`;
    return `    <div class="hh-choice" role="radio" aria-checked="${checked}" tabindex="${tab}" data-choice-id="${item.id}" data-choice-label="${escapeHtml(label)}" data-suggest-option="${escapeHtml(shownSource)}" aria-label="${escapeHtml(name)}"><span class="hh-choice__key">${item.id}</span><span class="hh-choice__label">${escapeHtml(label)}</span></div>`;
  });
  radios.push(
    `    <div class="hh-choice" role="radio" aria-checked="false" tabindex="-1" data-choice-id="other" aria-label="${escapeHtml(OTHER_CHOICE_LABEL)}"><span class="hh-choice__label">${escapeHtml(OTHER_CHOICE_LABEL)}</span></div>`,
  );
  return `  <div class="hh-choices" role="radiogroup" aria-labelledby="hh-card-ask" data-choices data-choices-for="${escapeHtml(set.forId)}" data-choices-origin="${set.origin}" tabindex="-1">
${radios.join("\n")}
  </div>
  <p class="hh-choices__live" data-choices-live aria-live="polite">Options ready: ${items.length} ${noun}</p>`;
}

/** Shown only when the Guide call itself timed out. The draft stays in the field. */
function timeoutRetry(error: string | null): string {
  if (error === null || !/took too long/i.test(error)) return "";
  return `  <p class="hh-qcard__retry"><button type="button" class="hh-btn hh-btn--secondary" data-retry="answer">Retry</button></p>\n`;
}

/** HTML for the current question only. Mounts inside data-region="question". */
export function renderCard(state: CardState): string {
  if (state.done) return doneCard(state.brief);
  const question = state.question;
  if (question === null) return heading(EMPTY_TITLE, EMPTY_WHY, false);

  // A newly shown pushback starts empty, so the soft line is not sent again.
  // A repaint (keepDraft) renders the live draft and lets Answer follow that text.
  const field = state.pushback !== null && state.keepDraft !== true ? "" : state.draft;
  const hint = state.enterHint === true;
  const describedBy = [hint ? "hh-card-hint" : "", state.error === null ? "" : "hh-card-error"]
    .filter((id) => id !== "")
    .join(" ");
  const described = [
    state.error === null ? "" : ' aria-invalid="true"',
    describedBy === "" ? "" : ` aria-describedby="${describedBy}"`,
  ].join("");
  const alert = state.error === null ? "" : ' role="alert"';
  // An empty slot stays in the card for a later failure. The red treatment is only for a real error.
  const errorClass = state.error === null ? "hh-qcard__error" : "hh-error hh-qcard__error";
  const busy = state.pending ? ' aria-busy="true"' : "";
  const ask = scrubCopy(headingAsk(question.ask), question);
  const why = scrubCopy(question.why, question);
  const lead = scrubCopy(stripRawMarkdown(state.lead ?? ""), question);
  const help = scrubCopy(stripRawMarkdown(state.help ?? ""), question);
  const pushback = state.pushback === null ? null : scrubCopy(state.pushback, question);
  const pushAttr = pushback === null || pushback === "" ? "" : attr("data-pushback", pushback);
  const pushLine =
    pushback === null || pushback === ""
      ? ""
      : `  <p class="hh-qcard__push">${escapeHtml(pushback)}</p>\n`;
  const hintLine = hint
    ? `  <p class="hh-qcard__hint" id="hh-card-hint">${escapeHtml(ANSWER_HINT)}</p>\n`
    : "";
  const prepared = buildChoicesForQuestion(question.id, ask, pushback, state.choices);
  const choicesHtml = prepared === null ? "" : `${renderChoiceGroup(prepared)}\n`;
  const tip = question.tip === undefined ? "" : scrubCopy(question.tip, question);
  const tipLine =
    tip !== "" && state.counts?.index === 1
      ? `  <p class="hh-qcard__tip" data-card-tip>${escapeHtml(tip)}</p>\n`
      : "";
  const fontHtml = fontExamplesHtml(ask, state.fontSamples);
  const galleryHtml = galleryOpen(question);
  const resources = question.resources?.map((item) => ({
    ...item,
    label: scrubCopy(item.label, question),
    note: scrubCopy(item.note, question),
  }));
  const attachHtml = renderAttach(question.id, state.attach);
  const attachReady = (state.attach?.chips ?? []).some((chip) => chip.ready && chip.error === undefined);
  const uploading = (state.attach?.uploading ?? null) !== null;
  const answerOff = state.pending || uploading || (field.trim() === "" && !attachReady);

  return omitModelInstructions(`<article class="hh-qcard"${attr("data-question-id", question.id)}${pushAttr}${busy} aria-labelledby="hh-card-ask">
${kickerBlock(question, state.counts)}${assumptionBlock(state.assumption)}${leadBlock(lead)}  <h2 class="hh-qcard__title" id="hh-card-ask">${escapeHtml(ask)}</h2>
${helpBlock(help)}${whyLine(why)}${galleryHtml}${tipLine}${whereToLook(resources)}${fontHtml}${pushLine}  <div class="hh-qcard__composer">
${choicesHtml}  <label class="hh-qcard__field">
    <span class="hh-qcard__label">Your answer</span>
    <textarea class="hh-qcard__input" id="hh-card-draft" name="draft" rows="5" autocomplete="off"${attr("placeholder", scrubCopy(sampleAnswer(question), question))}${described}>${escapeHtml(field)}</textarea>
${draftStatus(state.draftNote, state.draftFade)}  </label>
${attachHtml}${hintLine}  <p class="${errorClass}" id="hh-card-error" data-card-error${alert}>${escapeHtml(state.error ?? "")}</p>
${timeoutRetry(state.error)}
${noticeLine(state.notice ?? null)}${confirmBlock(state)}  <div class="hh-qcard__actions">
    ${talkButton(false, state.listening === true)}
    ${button("answer", "Answer", "primary", answerOff)}
    ${button("suggest", SUGGEST_LABEL, "secondary", state.pending)}
    ${button("skip", SKIP_LABEL, "ghost", state.pending)}
    <p class="hh-qcard__reading" data-guide-reading aria-live="polite">${state.pending ? escapeHtml(state.reading && state.reading !== "" ? state.reading : "Guide is reading your answer…") : ""}</p>
${state.longWaitHtml ?? ""}  </div>
${voiceNoteLine(state.voiceNote === true)}  </div>
</article>`);
}

function draftStatus(note: string | null | undefined, fade: boolean | undefined): string {
  const text = note ?? "";
  const fading = fade === true && text !== "";
  const flag = fading ? ' data-draft-fade="true"' : "";
  return `    <span class="hh-qcard__draft-status" id="hh-draft-status" data-testid="draft-saved" role="status" aria-live="polite" aria-atomic="true"${flag}>${escapeHtml(text)}</span>\n`;
}

function renderAttach(questionId: string, view: AttachView | undefined): string {
  const copy = zoneCopy(questionId);
  const kinds = kindsFor(questionId);
  if (copy === null || kinds === null) return "";
  const accept = acceptAttribute(kinds);
  const chips = view?.chips ?? [];
  const errorIds = chips.filter((chip) => chip.error !== undefined).map((chip) => `hh-attach-err-${chip.id}`);
  const described = ["hh-attach-live", ...errorIds].join(" ");
  const live = view?.live ?? "";
  const linkField = kinds.includes("links")
    ? `<div class="hh-attach__url">
    <label class="hh-sr" for="hh-attach-url">Link</label>
    <input class="hh-attach__input" id="hh-attach-url" type="text" inputmode="url" autocomplete="off" data-attach-url${attr("value", view?.linkDraft ?? "")} />
    <button class="hh-btn hh-btn--ghost hh-attach__add" type="button" data-attach-add>Add</button>
  </div>
  `
    : "";
  return `  <div class="hh-attach" data-attach-zone role="group" aria-labelledby="hh-attach-label" aria-describedby="${described}" tabindex="-1">
    <p class="hh-attach__label" id="hh-attach-label">${escapeHtml(copy.group)}</p>
    <p class="hh-attach__copy" data-attach-copy><span class="hh-attach__fine">${escapeHtml(copy.fine)}</span><span class="hh-attach__coarse">${escapeHtml(copy.coarse)}</span></p>
    <button class="hh-btn hh-btn--secondary hh-attach__button" type="button" data-attach-button>Attach</button>
    <label class="hh-sr" for="hh-attach-file">Choose files</label>
    <input class="hh-attach__file" id="hh-attach-file" name="attach" type="file" multiple accept="${escapeHtml(accept)}" data-attach-file tabindex="-1" aria-describedby="hh-attach-live" />
    ${linkField}${renderChips(chips)}<p class="hh-attach__live" id="hh-attach-live" data-attach-live aria-live="polite">${escapeHtml(live)}</p>
  </div>
`;
}

/** Chip rows only. A live list can replace its contents without rebuilding the card. */
export function renderChipItems(chips: readonly AttachChipView[]): string {
  return chips.map((chip) => chipItem(chip)).join("\n");
}

function renderChips(chips: AttachChipView[]): string {
  const items = renderChipItems(chips);
  if (items === "") return "";
  return `<ul class="hh-attach__chips" data-attach-chips>
${items}
  </ul>
  `;
}

function chipItem(chip: AttachChipView): string {
  const src = previewSrc(chip.previewUrl);
  const thumb = src === null ? "" : `<img class="hh-attach__thumb" alt="" src="${escapeHtml(src)}" />`;
  const problem =
    chip.error === undefined
      ? ""
      : `<p class="hh-error hh-attach__error" id="hh-attach-err-${escapeHtml(chip.id)}">${escapeHtml(chip.error)}</p>`;
  const described = chip.error === undefined ? "" : ` aria-describedby="hh-attach-err-${escapeHtml(chip.id)}"`;
  const retry =
    chip.retry === true
      ? `<button class="hh-btn hh-btn--ghost" type="button" data-attach-retry="${escapeHtml(chip.id)}" aria-label="${escapeHtml(`Retry ${chip.label}`)}">Retry</button>`
      : "";
  return `    <li class="hh-attach__chip" data-attach-chip="${escapeHtml(chip.id)}">${thumb}<span class="hh-attach__name">${escapeHtml(chip.label)}</span><span class="hh-attach__meta">${escapeHtml(chip.detail)}</span><button class="hh-btn hh-btn--ghost" type="button" data-attach-remove="${escapeHtml(chip.id)}" aria-label="${escapeHtml(chip.removeName)}"${described}>Remove</button>${retry}${problem}</li>`;
}

function previewSrc(url: string | undefined): string | null {
  if (url === undefined) return null;
  if (url.startsWith("blob:") || url.startsWith("data:image/")) return url;
  return null;
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
