import type { Question } from "@hitchhiker/engine";
import type { AttachChipView, CardAssumption, CardChoiceSet, CardCounts, CardState } from "../card.ts";
import { escapeHtml, renderCard, renderChoiceGroup, VOICE_SERVICE_NOTE } from "../card.ts";
import {
  MAX_ATTACH_FILES,
  type AnswerAttachment,
  addedFilesMessage,
  addedLinksMessage,
  collectLinks,
  fileCapError,
  formatBytes,
  kindsFor,
  linkLabel,
  linkTokens,
  pastedImageName,
  removedMessage,
  shortcutMissError,
  shortcutTarget,
  textIsOnlyLinks,
  uploadingMessage,
  urisFromList,
  validateFileMeta,
} from "./attach.ts";
import {
  engineForDesk,
  voiceChromeFor,
  VOICE_FALLBACK,
  type VoiceChrome,
  type VoiceDeskFlags,
  type VoiceEngineId,
} from "./voice-engine.ts";
import { applyToolsEvent, handleInstallClick, handleInstallKey, mountToolInstall } from "./tool-install.ts";
import { handleTourKey, mountTour } from "./tour.ts";
import { joinWords, mergeTranscript, settleVoice, type TranscriptPiece } from "./voice-text.ts";
import {
  clearDraft,
  createDraftWriter,
  dropOtherQuestions,
  forgetProjectDraftsBefore,
  loadDraft,
  type DraftRecord,
  type DraftStorage,
  type DraftWriter,
} from "./draft-store.ts";

const DRAFT_SAVED = "Draft saved";
const DRAFT_RESTORED = "Draft restored";
const DRAFT_BLOCKED =
  "This browser would not save the draft. Your words are still here, and stay until you press Answer.";
const DRAFT_POST_GAP_MS = 2_000;

const START_INTERVIEW_LABEL = "Start the interview";
const EMPTY_CARD_TITLE = "No question yet.";

/**
 * The empty card becomes one button to the first question.
 * A card that already has an ask is left alone.
 */
export function replaceEmptyCard(html: string, questionId: string | null): string {
  if (!html.includes(EMPTY_CARD_TITLE)) return html;
  const id = questionId !== null && /^[A-Za-z0-9._-]{1,64}$/.test(questionId) ? questionId : "DP-0.1";
  const href = escapeHtml(`/?question=${encodeURIComponent(id)}`);
  return `<article class="hh-qcard"><p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}">${START_INTERVIEW_LABEL}</a></p></article>`;
}

/** Shown on the mic when this browser has no speech recognition. */
export const TALK_NEEDS_CHROMIUM = "Talk needs Chrome or Edge";

const HOLD_BUTTON =
  /<button class="hh-btn hh-btn--secondary(?: hh-btn--listening)?" type="button" data-voice="hold"(?: aria-pressed="(?:true|false)")?(?: data-tip="[^"]*")?(?: disabled)?>[\s\S]*?<\/button>/;

/** Latest Guide line for the polite region. Empty when the desk has not asked. */
export function guideTurnText(ask: string | null, done: boolean): string {
  if (ask !== null && ask !== "") return ask;
  if (done) return "Guide Entry is next.";
  return "";
}

/**
 * Moves the voice button beside the field and gives the question heading a focus target.
 * When speech is missing, the mic is disabled and names Chrome or Edge.
 * The Answer row keeps Answer, Suggest, and Skip.
 */
export function reshapeDeskCard(html: string, speech: boolean, chrome?: VoiceChrome): string {
  const match = HOLD_BUTTON.exec(html);
  if (match === null || match.index === undefined) return withQuestionTabIndex(html);
  let button = match[0];
  const without = html.slice(0, match.index) + html.slice(match.index + button.length);
  const status = chrome ?? voiceChromeFor(speech ? "web-speech" : "none");
  if (status.engine === "xai") button = disableTalk(button);
  else if (!speech || status.engine !== "web-speech") button = unsupportedTalk(button);
  return withQuestionTabIndex(placeBesideField(without, button, voiceStatusHtml(status)));
}

function unsupportedTalk(button: string): string {
  const openEnd = button.indexOf(">");
  if (openEnd < 0) return button;
  let open = button.slice(0, openEnd);
  if (!/\sdisabled(?:\s|=|$)/.test(open)) open += " disabled";
  return `${open}>${TALK_NEEDS_CHROMIUM}</button>`;
}

function disableTalk(button: string): string {
  const openEnd = button.indexOf(">");
  if (openEnd < 0) return button;
  let open = button.slice(0, openEnd);
  if (!/\sdisabled(?:\s|=|$)/.test(open)) open += " disabled";
  return `${open}>${button.slice(openEnd + 1)}`;
}

function voiceStatusHtml(chrome: VoiceChrome): string {
  const limit =
    chrome.engine === "xai"
      ? `<p class="hh-qcard__voice-help" data-voice-limit>xAI speech-to-text is on at the accepted rate. This desk does not send the microphone to a paid service. Type your answer, or choose Browser in Settings.</p>\n  `
      : chrome.engine === "local-whisper"
        ? `<p class="hh-qcard__voice-help" data-voice-limit>Local whisper is installed. This desk does not send the microphone to it. Type your answer.</p>\n  `
        : "";
  const fallback =
    chrome.fallback === null
      ? ""
      : `<p class="hh-qcard__voice-help" data-voice-fallback>${escapeHtml(chrome.fallback)}</p>\n  `;
  return `<div class="hh-qcard__voice" data-voice-status>\n  <p class="hh-qcard__voice-engine" data-voice-engine="${escapeHtml(chrome.engine)}">${escapeHtml(chrome.label)}</p>\n  <p class="hh-qcard__voice-help" data-voice-help>${escapeHtml(chrome.help)}</p>\n  ${limit}${fallback}</div>`;
}

function placeBesideField(html: string, button: string, chrome: string): string {
  const start = html.indexOf('<label class="hh-qcard__field">');
  const end = start < 0 ? -1 : html.indexOf("</label>", start);
  if (start < 0 || end < 0) return html;
  const close = end + "</label>".length;
  const label = html.slice(start, close);
  const entry = `<div class="hh-qcard__entry">\n    ${label}\n    ${button}\n  </div>`;
  return html.slice(0, start) + entry + chrome + html.slice(close);
}

function withQuestionTabIndex(html: string): string {
  return html.replaceAll(
    '<h2 class="hh-qcard__title" id="hh-card-ask">',
    '<h2 class="hh-qcard__title" id="hh-card-ask" tabindex="-1">',
  );
}

/**
 * Logo questions are the ones that write the logo anchors, plus DP-0.4,
 * which asks for a logo among the brand assets and lists upload.
 * Other upload questions stay text-only.
 */
const LOGO_WRITES = new Set(["BRAND.md#logo", "ASSETS.md#logo"]);

export function isLogoQuestion(question: {
  id: string;
  input?: readonly string[];
  writes?: readonly string[];
}): boolean {
  if (question.writes?.some((write) => LOGO_WRITES.has(write)) === true) return true;
  return question.id === "DP-0.4" && question.input?.includes("upload") === true;
}

/** Summary control. The restatement is not in the card until this opens. */
export const READ_THIS_IN = "Read this in\u2026";

/**
 * Same question as the desk comp, in German. Only DP-1.1 has this line.
 * It stays out of the card HTML until the toggle opens.
 */
const LOGO_GERMAN =
  "Falls Sie bereits ein geliebtes Firmenlogo besitzen, legen Sie die Datei hier ab und sagen Sie mir, welche Teile unantastbar bleiben, ob Sie damit zufrieden sind, oder ob die Firmenlogoentscheidung noch bis zur Markenphase warten soll.";

export function germanRestatement(questionId: string): string | null {
  return questionId === "DP-1.1" ? LOGO_GERMAN : null;
}

/** Panel inserted when the toggle opens. Absent from the first card HTML. */
export function languagePanel(questionId: string): string {
  const text = germanRestatement(questionId);
  if (text === null) {
    return `<p class="hh-qcard__body" data-restatement>This question is not restated in German.</p>`;
  }
  return `<p class="hh-kicker">Same question, in German</p>\n<p class="hh-qcard__body" lang="de" data-restatement>${escapeHtml(text)}</p>`;
}

const LOGO_HINT =
  "Drop a logo file here, or choose one. PNG, JPG, WEBP, GIF, SVG, or PDF. Up to 25 MB. It stays on this machine.";

/** Matches the server cap in uploads.ts. The server still refuses a larger body. */
const LOGO_MAX_BYTES = 25 * 1024 * 1024;

const LOGO_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf";

/**
 * File input for logo questions, and a closed language toggle on every question.
 * The drop zone is before the composer: at 375 the composer sticks and this zone
 * scrolls with the question. At 1440 both stay in the 40rem read column.
 */
export function withInterviewExtras(
  html: string,
  question: { id: string; input?: readonly string[]; writes?: readonly string[] } | null,
  logoNote?: string,
): string {
  if (question === null) return html;
  if (!html.includes(`data-question-id="${escapeHtml(question.id)}"`)) return html;
  let next = html;
  if (!next.includes("data-lang-toggle")) next = insertBeforeComposer(next, languageToggle());
  if (isLogoQuestion(question) && !next.includes("data-logo-drop")) {
    next = insertBeforeComposer(next, logoDropZone(logoNote));
  }
  return next;
}

function languageToggle(): string {
  return `<details class="hh-qcard__lang" data-lang-toggle>\n    <summary>${READ_THIS_IN}</summary>\n  </details>\n  `;
}

function logoDropZone(logoNote?: string): string {
  const status = logoNote === undefined || logoNote === "" ? LOGO_HINT : logoNote;
  return `<div class="hh-qcard__drop" data-logo-drop role="group" aria-labelledby="hh-logo-label">
    <label class="hh-qcard__field">
      <span class="hh-qcard__label" id="hh-logo-label">Logo file</span>
      <input class="hh-qcard__file" id="hh-logo-file" name="logo" type="file" accept="${LOGO_ACCEPT}" data-logo-file aria-describedby="hh-logo-status" />
    </label>
    <p class="hh-qcard__hint" id="hh-logo-status" data-logo-status>${escapeHtml(status)}</p>
  </div>
  `;
}

function insertBeforeComposer(html: string, block: string): string {
  const marker = '<div class="hh-qcard__composer">';
  const at = html.indexOf(marker);
  if (at < 0) {
    const end = html.lastIndexOf("</article>");
    if (end < 0) return html;
    return `${html.slice(0, end)}${block}${html.slice(end)}`;
  }
  return `${html.slice(0, at)}${block}${html.slice(at)}`;
}

/**
 * Desk page. Fetches the session, paints the card, and posts with the CSRF token.
 * Importing this module from Node does nothing: there is no document.
 */

type DepthName = Question["depth"][number];
type InputName = Question["input"][number];
type LevelName = NonNullable<Question["levels"]>["beginner"];

const DEPTHS: readonly DepthName[] = ["express", "standard", "deep"];
const INPUTS: readonly InputName[] = ["upload", "text", "voice", "choice"];
const LEVELS: readonly LevelName[] = ["explain", "terse"];
const DRAFT_KEPT = "The desk could not reach hh app. Your draft is still here. Try again.";
const EMPTY_ANSWER = "Write an answer or skip.";
const LOAD_FAILED = "The desk could not load the session.";
/** Quiet status after the event stream has failed this many times. */
export const DESK_OFFLINE =
  "The desk lost its connection to hh app. Is the PowerShell window still open?";
const STREAM_FAILURES = 3;

const STACK_LINE = /(?:^|\n)\s*at\s+\S+/;

/** One-line card failures stay a single sentence. A stack goes behind Details. */
function publicCardError(error: string): string {
  const text = error.replace(/\r\n/g, "\n").trim();
  if (!STACK_LINE.test(text) && !text.includes("\n")) {
    return `<p class="hh-error" role="alert">${escapeHtml(error)}</p>`;
  }
  const first = text.split("\n").find((line) => line.trim().length > 0 && !/^\s*at\s+\S+/.test(line)) ?? "";
  const summary = first.trim().length > 0 ? first.trim() : "Something on the desk did not finish.";
  return `<div class="hh-error" role="alert"><p>${escapeHtml(summary)}</p><p>Reload the desk and try that answer again.</p><details class="hh-details"><summary>Details</summary><pre class="hh-details__pre">${escapeHtml(text)}</pre></details></div>`;
}

/**
 * Click to talk. Chrome and Edge speech recognition fills the draft while
 * listening is on. Nothing is submitted: the person still presses Answer.
 * This desk does not store the audio and does not send it to hh app.
 * Chrome's Web Speech API sends the microphone audio to Google's speech service.
 */
/** How long a stop waits for the final result or onend before it keeps what it has. */
export const VOICE_STOP_WAIT_MS = 2500;
/** First delay before Chrome's own onend is started again. Doubles up to the ceiling. */
export const VOICE_RESTART_BASE_MS = 250;
export const VOICE_RESTART_MAX_MS = 2000;
/** Empty onend cycles in a row. A cycle that produces a result resets the count. */
export const VOICE_RESTART_CAP = 8;
export const VOICE_LABEL_IDLE = "Click to talk";
export const VOICE_LABEL_STOP = "Stop listening";
export const VOICE_LIVE_STARTED = "Listening started";
export const VOICE_LIVE_STOPPED = "Listening stopped";
export const VOICE_CAP_NOTICE = "Listening stopped. Click the voice button to continue.";
export const VOICE_LISTENING = "Listening. Click the button again when you are done.";
export const VOICE_HEARD = "Heard you. Check the words, then press Answer.";
export const VOICE_UNSUPPORTED = VOICE_FALLBACK;
export const VOICE_BLOCKED =
  "The microphone is blocked. Click the icon at the left of the address bar, allow the microphone, then click the voice button again.";
export const VOICE_FIRST_ALLOW =
  "If Chrome asks to use the microphone, press Allow. Then click the voice button and speak.";
/** A stop with no words. Not the microphone permission sentence. */
export const VOICE_RELEASE_EMPTY = "Nothing was heard. Click the voice button and try again.";
export const VOICE_SILENT = "Nothing was heard. Click the voice button and try again.";
export const VOICE_NO_MIC = "No microphone was found. Plug one in, or type your answer.";
export const VOICE_NETWORK =
  "Voice input could not reach the browser's speech service. Check the internet connection, or type your answer.";
export const VOICE_FAILED = "Voice input stopped. Try again, or type your answer.";

interface SpeechAlternativeLike {
  transcript: string;
}

interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternativeLike;
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechResultLike };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface VoiceInvariant {
  constructed: number;
  live: number;
  handlers: number;
}

/** Development counter only. The desk never branches on it, and the page does not show it. */
function voiceDebugEnabled(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

const voiceDebug = voiceDebugEnabled();
const trackedRecs: SpeechRecognitionLike[] = [];
const liveRecs = new Set<SpeechRecognitionLike>();

export function readVoiceInvariant(): VoiceInvariant {
  let handlers = 0;
  if (voiceDebug) {
    for (const rec of trackedRecs) {
      if (rec.onstart !== null) handlers += 1;
      if (rec.onresult !== null) handlers += 1;
      if (rec.onerror !== null) handlers += 1;
      if (rec.onend !== null) handlers += 1;
    }
  }
  return { constructed: trackedRecs.length, live: liveRecs.size, handlers };
}

export function resetVoiceInvariant(): void {
  trackedRecs.length = 0;
  liveRecs.clear();
}

function trackConstructed(rec: SpeechRecognitionLike): void {
  if (!voiceDebug) return;
  trackedRecs.push(rec);
}

function markLive(rec: SpeechRecognitionLike): void {
  if (!voiceDebug) return;
  liveRecs.add(rec);
}

function markDead(rec: SpeechRecognitionLike): void {
  if (!voiceDebug) return;
  liveRecs.delete(rec);
}

export interface SessionView {
  question: Question | null;
  pushback: string | null;
  done: boolean;
  mapHtml: string;
  transcriptHtml: string;
  statusHtml: string;
  counts: CardCounts | null;
  assumption: CardAssumption | null;
  required: boolean;
  mastCompact: boolean;
  mastLine: string;
  /** Null when this session has no picks. forId is the question they belong to. */
  choices: CardChoiceSet | null;
  /** Stable id for this project. Never a path. Empty when the session omitted it. */
  projectKey: string;
  /** Unsent text for the current question, from the project folder. */
  storedDraft: { text: string; savedAt: string; step: number } | null;
  /** Files already stored for the current question. Paths stay relative. */
  savedFiles: SavedFileView[];
  /** Set when a restart cleared drafts. Local rows older than this are dropped. */
  draftsClearedAt: string | null;
}

interface SavedFileView {
  path: string;
  originalName: string;
  size: number;
  type: string;
}

interface DeskElement {
  innerHTML: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): DeskElement | null;
  parentElement: DeskElement | null;
  value?: string;
  disabled?: boolean;
  textContent?: string | null;
  /** Present on `<input type="file">`. Absent on every other control. */
  files?: ArrayLike<File>;
  open?: boolean;
  setPointerCapture?(pointerId: number): void;
  insertAdjacentHTML?(position: "beforebegin" | "afterbegin" | "beforeend" | "afterend", html: string): void;
  focus?(): void;
  /** Set on real elements. The desk harness omits it. */
  tagName?: string;
  /** Present on `<dialog>`. The desk harness omits both. */
  showModal?(): void;
  close?(): void;
  /** Present on a real button and file input. The harness omits it. */
  click?(): void;
  /** Present on a real file input. The harness omits it. */
  showPicker?(): void;
}

interface DeskEvent {
  target: DeskElement | null;
  preventDefault(): void;
  key?: string;
  repeat?: boolean;
  button?: number;
  pointerId?: number;
  shiftKey?: boolean;
  /** True while an IME composition is open. Enter must not submit. */
  isComposing?: boolean;
  dataTransfer?: {
    files?: ArrayLike<File>;
    types?: ArrayLike<string>;
    getData?: (type: string) => string;
  } | null;
  clipboardData?: {
    files?: ArrayLike<File>;
    items?: ArrayLike<{ type: string; getAsFile?: () => File | null }>;
    getData?: (type: string) => string;
  } | null;
}

interface DeskParent {
  appendChild(node: DeskElement): void;
}

interface DeskWindow {
  addEventListener(type: string, listener: (event?: DeskEvent) => void): void;
  removeEventListener(type: string, listener: (event?: DeskEvent) => void): void;
}

interface DeskDocument {
  querySelector(selector: string): DeskElement | null;
  addEventListener(type: string, listener: (event: DeskEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: DeskEvent) => void, capture?: boolean): void;
  createElement?(tag: string): DeskElement;
  body?: DeskParent;
  /** Present on a browser document. Harnesses omit it. */
  defaultView?: DeskWindow | null;
  visibilityState?: string;
}

interface DeskMessage {
  data: string;
}

interface DeskSource {
  addEventListener(type: "session" | "tools", listener: (event: DeskMessage) => void): void;
  addEventListener(type: "error", listener: () => void): void;
  close(): void;
}

export interface DeskEnv {
  document: DeskDocument;
  EventSource: new (url: string) => DeskSource;
  fetch: typeof fetch;
  /** Chrome's SpeechRecognition (or webkitSpeechRecognition). Absent in Firefox. */
  SpeechRecognition?: (new () => SpeechRecognitionLike) | null;
  /** Page language for recognition, e.g. navigator.language. */
  lang?: string;
}

interface TurnInput {
  questionId: string;
  text?: string;
  assumed?: boolean;
  attachments?: AnswerAttachment[];
}

interface HeldChip {
  id: string;
  kind: "file" | "link";
  label: string;
  detail: string;
  removeName: string;
  previewUrl?: string;
  error?: string;
  ready: boolean;
  retry: boolean;
  path?: string;
  url?: string;
  size?: number;
  type?: string;
  originalName?: string;
}

export function parseSession(value: unknown): SessionView | null {
  if (!isRecord(value)) return null;
  const question = value.question === null ? null : asQuestion(value.question);
  if (value.question !== null && question === null) return null;
  const pushback = value.pushback === null || value.pushback === undefined
    ? null
    : typeof value.pushback === "string"
      ? value.pushback
      : null;
  if (value.pushback !== null && value.pushback !== undefined && typeof value.pushback !== "string") {
    return null;
  }
  return {
    question,
    pushback,
    done: value.done === true || question === null,
    mapHtml: typeof value.mapHtml === "string" ? value.mapHtml : "",
    transcriptHtml: typeof value.transcriptHtml === "string" ? value.transcriptHtml : "",
    statusHtml: typeof value.statusHtml === "string" ? value.statusHtml : "",
    counts: parseCounts(value.counts),
    assumption: parseAssumption(value.assumption),
    required: value.required === true,
    mastCompact: value.mastCompact === true,
    mastLine: typeof value.mastLine === "string" ? value.mastLine : "",
    choices: parseChoices(value.choices),
    projectKey: parseProjectKey(value.projectKey),
    storedDraft: parseStoredDraft(value.draft),
    savedFiles: parseSavedFiles(value.savedFiles),
    draftsClearedAt: typeof value.draftsClearedAt === "string" && value.draftsClearedAt.trim() !== ""
      ? value.draftsClearedAt
      : null,
  };
}

export async function postTurn(
  action: "answer" | "suggest" | "skip",
  token: string,
  input: TurnInput,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; session: SessionView } | { ok: false; error: string }> {
  const body: {
    questionId: string;
    text?: string;
    assumed?: true;
    attachments?: AnswerAttachment[];
  } = { questionId: input.questionId };
  if (input.text !== undefined) body.text = input.text;
  if (input.assumed === true) body.assumed = true;
  if (input.attachments !== undefined && input.attachments.length > 0) body.attachments = input.attachments;
  let response: Response;
  try {
    response = await fetcher(`/api/${action}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-hh-csrf": token,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: DRAFT_KEPT };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : DRAFT_KEPT;
    return { ok: false, error: message };
  }
  const session = isRecord(payload) ? parseSession(payload.session) : null;
  if (session === null) return { ok: false, error: DRAFT_KEPT };
  return { ok: true, session };
}

/** Wire the current document. Returns a cleanup, or does nothing outside a browser. */
export function mountDesk(env: DeskEnv): () => void {
  const token = readToken(env.document);
  let view: SessionView | null = null;
  let draft = "";
  let error: string | null = null;
  let pending = false;
  /** Latest choice pressed while the suggest POST is still pending. */
  let choiceWait: string | null = null;
  let ready = false;
  let source: DeskSource | null = null;
  let notice: string | null = null;
  let streamFailures = 0;
  let connection: string | null = null;
  let listening = false;
  /** The person clicked to listen and has not clicked to stop. */
  let toggled = false;
  let voiceSession = false;
  let voiceDisclosed = false;
  let recognition: SpeechRecognitionLike | null = null;
  /** Recognizer that may still deliver a final after stop, until the late window closes. */
  let lateRec: SpeechRecognitionLike | null = null;
  /** Recognizer Chrome ended. The next beginRecognition retires it without a second abort. */
  let restartRec: SpeechRecognitionLike | null = null;
  /** Heard text from recognizers that already ended during this dictation. */
  let recognizerBase = "";
  /** onend ran. A recognizer that never ended is an orphan and is retired on the next start. */
  const endedRecs = new WeakSet<SpeechRecognitionLike>();
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let stopWait: { rec: SpeechRecognitionLike; resolve: () => void } | null = null;
  let stopping: Promise<void> | null = null;
  let committed = false;
  let heardStart = false;
  let voiceBase = "";
  let voiceFinal = "";
  let voiceInterim = "";
  let voiceError: string | null = null;
  let userTouched = false;
  let lastHeard = "";
  let promotedUtterance = "";
  let emptyRestarts = 0;
  let restartDelay = VOICE_RESTART_BASE_MS;
  let cycleHeard = false;
  let capHit = false;
  /** Bumped on each click-to-talk. Handlers from an older id ignore the new session. */
  let voiceEpoch = 0;
  let voiceLive: DeskElement | null = null;
  let skipConfirm = false;
  /** True while Suggest must not replace the question card. */
  let cardHold = false;
  /** The suggestion on screen, plus the next session waiting for Answer. */
  let suggestHold: { questionId: string; suggestion: string; session: SessionView } | null = null;
  /** Other was picked. The next submit is the user's own words, even if the text matches. */
  let ownWords = false;
  const editing = new Set<string>();
  let logoSaved: { id: string; text: string } | null = null;
  let chips: HeldChip[] = [];
  let linkDraft = "";
  let attachLive = "";
  let uploadingLabel: string | null = null;
  let chipSeq = 0;
  let chipQuestionId: string | null = null;
  let dragDepth = 0;
  const filesById = new Map<string, File>();
  let uploadQueue: Promise<void> = Promise.resolve();
  let projectKey = "";
  let pageTyped = false;
  let offerOnFocus: string | null = null;
  let draftNote: string | null = null;
  let draftFade = false;
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  let writer: DraftWriter | null = null;
  let writerQuestionId: string | null = null;
  let lastDraftPost = 0;
  let draftPostTimer: ReturnType<typeof setTimeout> | null = null;
  let draftPostBody: string | null = null;
  const postedQuestions = new Set<string>();
  let filesSeededFor: string | null = null;

  const onClick = (event: DeskEvent): void => {
    if (isDeskLink(event.target)) flushLeaving();
    if (readMarked(event.target, "data-restart-open") !== null) {
      event.preventDefault();
      env.document.querySelector("[data-restart-dialog]")?.showModal?.();
      return;
    }
    if (readMarked(event.target, "data-restart-cancel") !== null) {
      event.preventDefault();
      env.document.querySelector("[data-restart-dialog]")?.close?.();
      return;
    }
    if (handleInstallClick(env, event)) return;
    if (isVoiceTarget(event.target)) {
      event.preventDefault();
      toggleVoice();
      return;
    }
    const details = langDetails(event.target);
    if (details !== null) queueMicrotask(() => syncLanguage(details));
    const saveId = readMarked(event.target, "data-edit-save");
    if (saveId !== null) {
      event.preventDefault();
      void saveEdit(saveId);
      return;
    }
    const editId = readMarked(event.target, "data-edit");
    if (editId !== null) {
      event.preventDefault();
      toggleEdit(editId);
      return;
    }
    const choiceId = readMarked(event.target, "data-choice-id");
    if (choiceId !== null) {
      event.preventDefault();
      void pickChoice(choiceId);
      return;
    }
    if (readMarked(event.target, "data-retry") === "suggest") {
      event.preventDefault();
      const id = suggestHold?.questionId ?? view?.question?.id ?? null;
      if (id !== null) void requestSuggestion(id);
      return;
    }
    if (hasMark(event.target, "data-attach-button")) {
      event.preventDefault();
      const input = region()?.querySelector("[data-attach-file]");
      if (input === null || input === undefined) return;
      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
          return;
        } catch {
          // click still opens the picker when showPicker is refused.
        }
      }
      input.click?.();
      return;
    }
    if (hasMark(event.target, "data-attach-add")) {
      event.preventDefault();
      addLinkFromField();
      return;
    }
    const removeId = readMarked(event.target, "data-attach-remove");
    if (removeId !== null) {
      event.preventDefault();
      removeChip(removeId);
      return;
    }
    const retryId = readMarked(event.target, "data-attach-retry");
    if (retryId !== null) {
      event.preventDefault();
      retryChip(retryId);
      return;
    }
    const action = readAction(event.target);
    if (action === null) return;
    event.preventDefault();
    void submit(action);
  };
  const onInput = (event: DeskEvent): void => {
    const target = event.target;
    if (target !== null && target.getAttribute("data-attach-url") !== null) {
      linkDraft = target.value ?? "";
      return;
    }
    if (target === null || target.getAttribute("id") !== "hh-card-draft") return;
    draft = target.value ?? "";
    pageTyped = true;
    offerOnFocus = null;
    rememberDraft(false);
    if (voiceSession) userTouched = true;
    if (suggestHold !== null) {
      if (draft.trim() === suggestHold.suggestion.trim()) showAssumed(suggestHold.suggestion);
      else hideAssumed();
    }
    if (skipConfirm) {
      skipConfirm = false;
      const note = region()?.querySelector("[data-skip-confirm]");
      if (note !== null && note !== undefined && "textContent" in note) note.textContent = "";
    }
    syncAnswerLock();
  };

  const onKeyDown = (event: DeskEvent): void => {
    if (handleTourKey(env.document, event)) return;
    if (handleInstallKey(env, event)) return;
    // Escape stops listening from the button or the draft. Idle Escape stays with choices.
    if (
      event.key === "Escape" &&
      voiceActive() &&
      (isVoiceTarget(event.target) || isDraftTarget(event.target))
    ) {
      event.preventDefault();
      void stopVoice();
      return;
    }
    if (isTypingTarget(event.target)) {
      if (
        event.target !== null &&
        event.target.getAttribute("data-attach-url") !== null &&
        event.key === "Enter" &&
        event.shiftKey !== true &&
        event.isComposing !== true
      ) {
        event.preventDefault();
        addLinkFromField();
        return;
      }
      if (isDraftTarget(event.target) && event.key === "Enter") {
        // Shift+Enter is a newline. An open IME composition is not a submit.
        if (event.shiftKey === true || event.isComposing === true) return;
        event.preventDefault();
        void submit("answer");
      }
      return;
    }
    if (choicesOpen()) {
      const key = event.key ?? "";
      if (key === "Escape") {
        event.preventDefault();
        focusField();
        return;
      }
      const letter = letterChoice(key);
      if (letter !== null && choiceNode(letter) !== null) {
        event.preventDefault();
        void pickChoice(letter);
        return;
      }
      if (insideChoices(event.target)) {
        if (key === "ArrowDown" || key === "ArrowRight") {
          event.preventDefault();
          moveChoice(1);
          return;
        }
        if (key === "ArrowUp" || key === "ArrowLeft") {
          event.preventDefault();
          moveChoice(-1);
          return;
        }
        if (key === "Enter" || key === " ") {
          event.preventDefault();
          const current = currentChoiceId();
          if (current !== null) void pickChoice(current);
          return;
        }
      }
      // Arrow moves the radios, then focus can land back on Suggest.
      // That button's Enter would no-op while a suggestion is open.
      if (key === "Enter" && enterPicksSlippedChoice(event.target)) {
        event.preventDefault();
        const current = currentChoiceId();
        if (current !== null) void pickChoice(current);
        return;
      }
    }
    if (event.key !== " " && event.key !== "Enter") return;
    if (!isVoiceTarget(event.target)) return;
    // One toggle per press. preventDefault so the key does not also click.
    event.preventDefault();
    if (event.repeat === true) return;
    toggleVoice();
  };
  const onContextMenu = (event: DeskEvent): void => {
    // A long press on a phone opens a menu. The voice button is a toggle, not a hold.
    if (isVoiceTarget(event.target)) event.preventDefault();
  };
  const onPageHide = (): void => {
    stopImmediately();
    flushLeaving();
  };
  const onVisibility = (): void => {
    if (env.document.visibilityState === "hidden") {
      stopImmediately();
      flushLeaving();
    }
  };
  const onFocusIn = (event: DeskEvent): void => {
    if (!isDraftTarget(event.target) || offerOnFocus === null) return;
    const field = event.target;
    if (field === null) return;
    const value = typeof field.value === "string" ? field.value : draft;
    if (value.trim() !== "") return;
    draft = offerOnFocus;
    offerOnFocus = null;
    field.value = draft;
    syncAnswerLock();
    showDraftNote(DRAFT_RESTORED, false);
  };

  const onChange = (event: DeskEvent): void => {
    const target = event.target;
    if (target === null) return;
    if (target.getAttribute("data-attach-file") !== null) {
      const picked = filesFrom(target.files);
      if (typeof target.value === "string") target.value = "";
      if (picked.length > 0) void addIncomingFiles(picked);
      return;
    }
    if (target.getAttribute("data-logo-file") === null) return;
    const file = firstFile(target.files);
    if (file === null) return;
    void uploadLogo(file);
  };
  const onDragEnter = (event: DeskEvent): void => {
    if (attachZone(event.target) === null) return;
    event.preventDefault();
    dragDepth += 1;
    setDrag(true);
  };
  const onDragLeave = (event: DeskEvent): void => {
    if (attachZone(event.target) === null) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDrag(false);
  };
  const onDragOver = (event: DeskEvent): void => {
    if (dropHost(event.target) === null && attachZone(event.target) === null) return;
    event.preventDefault();
  };
  const onDrop = (event: DeskEvent): void => {
    if (dropHost(event.target) !== null) {
      event.preventDefault();
      const file = firstFile(event.dataTransfer?.files);
      if (file === null) return;
      void uploadLogo(file);
      return;
    }
    if (attachZone(event.target) === null) return;
    event.preventDefault();
    dragDepth = 0;
    setDrag(false);
    void receiveDrop(event);
  };
  const onPaste = (event: DeskEvent): void => {
    if (!insideQuestion(event.target)) return;
    const questionId = view?.question?.id;
    const kinds = questionId === undefined ? null : kindsFor(questionId);
    if (kinds === null) return;
    const images = kinds.includes("images") || kinds.includes("files") ? pastedImages(event) : [];
    if (images.length > 0) {
      event.preventDefault();
      void addIncomingFiles(images);
      return;
    }
    if (!kinds.includes("links")) return;
    const text = pasteText(event);
    if (text === null || !textIsOnlyLinks(text)) return;
    event.preventDefault();
    addLinkParts(linkTokens(text));
  };
  const onWindowDrag = (event?: DeskEvent): void => {
    event?.preventDefault();
  };
  const onToggle = (event: DeskEvent): void => {
    const details = langDetails(event.target);
    if (details === null) return;
    // The open flag is settled by the time the click task yields.
    queueMicrotask(() => syncLanguage(details));
  };

  env.document.addEventListener("click", onClick);
  env.document.addEventListener("input", onInput);
  env.document.addEventListener("change", onChange);
  env.document.addEventListener("dragenter", onDragEnter);
  env.document.addEventListener("dragleave", onDragLeave);
  env.document.addEventListener("dragover", onDragOver);
  env.document.addEventListener("drop", onDrop);
  env.document.addEventListener("paste", onPaste);
  // toggle does not bubble. Capture still sees it when the summary opens.
  env.document.addEventListener("toggle", onToggle, true);
  env.document.addEventListener("keydown", onKeyDown);
  env.document.addEventListener("contextmenu", onContextMenu);
  env.document.addEventListener("visibilitychange", onVisibility);
  env.document.addEventListener("focusin", onFocusIn);
  const deskWindow = env.document.defaultView ?? null;
  if (deskWindow !== null) {
    deskWindow.addEventListener("pagehide", onPageHide);
    deskWindow.addEventListener("beforeunload", onPageHide);
    deskWindow.addEventListener("dragover", onWindowDrag);
    deskWindow.addEventListener("drop", onWindowDrag);
  }
  markTalkSupport();
  const stopTools = mountToolInstall(env);
  const stopTour = mountTour(env.document);
  void load();

  return () => {
    stopTour();
    stopTools();
    env.document.removeEventListener("click", onClick);
    env.document.removeEventListener("input", onInput);
    env.document.removeEventListener("change", onChange);
    env.document.removeEventListener("dragenter", onDragEnter);
    env.document.removeEventListener("dragleave", onDragLeave);
    env.document.removeEventListener("dragover", onDragOver);
    env.document.removeEventListener("drop", onDrop);
    env.document.removeEventListener("paste", onPaste);
    env.document.removeEventListener("toggle", onToggle, true);
    env.document.removeEventListener("keydown", onKeyDown);
    env.document.removeEventListener("contextmenu", onContextMenu);
    env.document.removeEventListener("visibilitychange", onVisibility);
    env.document.removeEventListener("focusin", onFocusIn);
    if (deskWindow !== null) {
      deskWindow.removeEventListener("pagehide", onPageHide);
      deskWindow.removeEventListener("beforeunload", onPageHide);
      deskWindow.removeEventListener("dragover", onWindowDrag);
      deskWindow.removeEventListener("drop", onWindowDrag);
    }
    if (noteTimer !== null) clearTimeout(noteTimer);
    if (draftPostTimer !== null) clearTimeout(draftPostTimer);
    writer?.stop();
    releaseChips();
    cancelVoice();
    source?.close();
  };

  function readDraft(): void {
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.value === "string") draft = field.value;
  }

  function browserStorage(): DraftStorage | null {
    const host = env.document.defaultView as { localStorage?: DraftStorage } | null | undefined;
    if (host == null) return null;
    try {
      const storage = host.localStorage;
      if (storage == null) return null;
      void storage.length;
      return storage;
    } catch {
      return null;
    }
  }

  function browserLifecycle(): {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    hidden(): boolean;
  } {
    const doc = env.document;
    const win = env.document.defaultView ?? null;
    return {
      addEventListener(type: string, listener: () => void): void {
        if (type === "visibilitychange") {
          doc.addEventListener(type, listener);
          return;
        }
        win?.addEventListener(type, listener);
      },
      removeEventListener(type: string, listener: () => void): void {
        if (type === "visibilitychange") {
          doc.removeEventListener(type, listener);
          return;
        }
        win?.removeEventListener(type, listener);
      },
      hidden(): boolean {
        return doc.visibilityState === "hidden";
      },
    };
  }

  function ensureWriter(): void {
    const id = view?.question?.id ?? null;
    const storage = browserStorage();
    if (id === null || storage === null || !/^[a-f0-9]{32}$/.test(projectKey)) return;
    if (writer !== null && writerQuestionId === id) return;
    if (writer !== null) {
      writer.stop();
      writer = null;
    }
    writerQuestionId = id;
    const step = view?.counts?.index ?? 0;
    writer = createDraftWriter({
      storage,
      projectKey,
      questionId: id,
      step,
      now: () => Date.now(),
      schedule(fn, ms) {
        const handle = setTimeout(fn, ms);
        return { cancel: () => clearTimeout(handle) };
      },
      lifecycle: browserLifecycle(),
      onResult(result) {
        if (result.text.trim() === "") {
          if (postedQuestions.has(result.questionId)) {
            queueDraftPost(
              {
                questionId: result.questionId,
                text: "",
                step: result.step,
                savedAt: new Date(result.savedAt).toISOString(),
                pushback: null,
                choices: null,
              },
              false,
            );
          }
          return;
        }
        postedQuestions.add(result.questionId);
        if (!result.ok) showDraftNote(DRAFT_BLOCKED, false);
        else showDraftNote(DRAFT_SAVED, true);
        queueDraftPost(draftBody(result.questionId, result.text, result.step, result.savedAt), false);
      },
    });
  }

  function draftBody(questionId: string, text: string, step: number, savedAt: number): {
    questionId: string;
    text: string;
    step: number;
    savedAt: string;
    pushback?: string | null;
    choices?: CardChoiceSet | null;
  } {
    const body: {
      questionId: string;
      text: string;
      step: number;
      savedAt: string;
      pushback?: string | null;
      choices?: CardChoiceSet | null;
    } = { questionId, text, step, savedAt: new Date(savedAt).toISOString() };
    if (view?.question?.id === questionId) {
      body.pushback = view.pushback;
      body.choices = choicesForPost();
    }
    return body;
  }

  function choicesForPost(): CardChoiceSet | null {
    const set = view?.choices ?? null;
    const id = view?.question?.id;
    if (set === null || id === undefined || set.forId !== id) return null;
    return set;
  }

  function rememberDraft(immediate: boolean): void {
    try {
      ensureWriter();
      if (writer === null) return;
      writer.push(draft);
      if (immediate) writer.flush();
    } catch {
      // A blocked store must not stop typing.
    }
  }

  function flushLeaving(): void {
    try {
      readDraft();
      if (draft.trim() === "" && offerOnFocus !== null && offerOnFocus.trim() !== "") {
        const offered = offerOnFocus;
        draft = offered;
        rememberDraft(true);
        draft = "";
      } else {
        rememberDraft(true);
      }
      sendDraftNow();
    } catch {
      // Navigation still proceeds. The words stay in the box until then.
    }
  }

  function releaseDraft(questionId: string): void {
    if (draftPostTimer !== null) {
      clearTimeout(draftPostTimer);
      draftPostTimer = null;
    }
    draftPostBody = null;
    offerOnFocus = null;
    const savedHere = postedQuestions.has(questionId) || (writer !== null && writerQuestionId === questionId);
    if (writer !== null && writerQuestionId === questionId) {
      writer.clear();
      writer.stop();
      writer = null;
      writerQuestionId = null;
    } else {
      const storage = browserStorage();
      if (storage !== null && projectKey !== "") clearDraft(storage, projectKey, questionId);
    }
    postedQuestions.add(questionId);
    if (savedHere) {
      queueDraftPost(
        {
          questionId,
          text: "",
          step: 0,
          savedAt: new Date().toISOString(),
          pushback: null,
          choices: null,
        },
        true,
      );
    }
  }

  function finishTurn(questionId: string, session: SessionView, keptText: string): void {
    const moved = session.done || session.question?.id !== questionId;
    if (moved) {
      releaseDraft(questionId);
      view = session;
    } else if ((session.pushback ?? "") !== "") {
      holdDraftForPushback(session, keptText);
    } else {
      view = session;
    }
    draft = "";
    draftNote = null;
    draftFade = false;
  }

  function holdDraftForPushback(session: SessionView, keptText: string): void {
    view = session;
    if (keptText.trim() !== "") {
      offerOnFocus = keptText;
      publishShown(keptText);
    } else {
      offerOnFocus = null;
      publishShown(null);
    }
  }

  function publishShown(text: string | null): void {
    const id = view?.question?.id;
    if (id === undefined || token === null) return;
    const body: {
      questionId: string;
      text?: string;
      step: number;
      savedAt: string;
      pushback: string | null;
      choices: CardChoiceSet | null;
    } = {
      questionId: id,
      step: view?.counts?.index ?? 0,
      savedAt: new Date().toISOString(),
      pushback: view?.pushback ?? null,
      choices: choicesForPost(),
    };
    if (text !== null && text.trim() !== "") body.text = text;
    queueDraftPost(body, true);
  }

  function queueDraftPost(body: {
    questionId: string;
    text?: string;
    step: number;
    savedAt?: string;
    pushback?: string | null;
    choices?: CardChoiceSet | null;
  }, immediate: boolean): void {
    draftPostBody = JSON.stringify(body);
    if (immediate) {
      sendDraftNow();
      return;
    }
    if (draftPostTimer !== null) return;
    const elapsed = Date.now() - lastDraftPost;
    const wait = lastDraftPost === 0 ? 0 : Math.max(0, DRAFT_POST_GAP_MS - elapsed);
    draftPostTimer = setTimeout(() => {
      draftPostTimer = null;
      sendDraftNow();
    }, wait);
  }

  function sendDraftNow(): void {
    if (draftPostTimer !== null) {
      clearTimeout(draftPostTimer);
      draftPostTimer = null;
    }
    const body = draftPostBody;
    if (body === null || token === null) return;
    draftPostBody = null;
    lastDraftPost = Date.now();
    void env.fetch("/api/draft", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
      headers: {
        "content-type": "application/json",
        "x-hh-csrf": token,
      },
      body,
    }).catch(() => {
      // The browser copy is the primary. A missed post retries on the next change.
    });
  }

  function showDraftNote(text: string, fade: boolean): void {
    draftNote = text;
    draftFade = false;
    if (noteTimer !== null) {
      clearTimeout(noteTimer);
      noteTimer = null;
    }
    const node = region()?.querySelector("#hh-draft-status");
    if (node !== null && node !== undefined) {
      node.removeAttribute("data-draft-fade");
      if ("textContent" in node) node.textContent = "";
    }
    announceDraftNote(text);
    if (!fade || text === "") return;
    noteTimer = setTimeout(() => {
      noteTimer = null;
      if (draftNote !== text) return;
      draftFade = true;
      const live = region()?.querySelector("#hh-draft-status");
      if (live !== null && live !== undefined) live.setAttribute("data-draft-fade", "true");
    }, 2_000);
  }

  function announceDraftNote(text: string): void {
    const expected = text;
    queueMicrotask(() => {
      if (draftNote !== expected) return;
      const live = region()?.querySelector("#hh-draft-status");
      if (live !== null && live !== undefined && "textContent" in live) live.textContent = expected;
    });
  }

  function adoptSavedFiles(): void {
    const id = view?.question?.id;
    if (id === undefined) return;
    if (filesSeededFor === id) return;
    if (chips.length > 0) {
      filesSeededFor = id;
      return;
    }
    const files = view?.savedFiles ?? [];
    for (const file of files) {
      const prefix = `.hitchhiker/uploads/${id}/`;
      if (!file.path.startsWith(prefix) || file.path.includes("..")) continue;
      chipSeq += 1;
      chips.push({
        id: `s${chipSeq}`,
        kind: "file",
        label: file.originalName,
        detail: formatBytes(file.size),
        removeName: `Remove ${file.originalName}`,
        ready: true,
        retry: false,
        path: file.path,
        originalName: file.originalName,
        size: file.size,
        type: file.type,
      });
    }
    filesSeededFor = id;
  }

  function isDeskLink(start: DeskElement | null): boolean {
    let node = start;
    const seen = new Set<DeskElement>();
    while (node !== null && !seen.has(node)) {
      seen.add(node);
      if (typeof node.getAttribute !== "function") return false;
      if (node.tagName?.toLowerCase() === "a") {
        const href = node.getAttribute("href") ?? "";
        return href.startsWith("/") && !href.startsWith("//");
      }
      node = node.parentElement;
    }
    return false;
  }

  function voiceActive(): boolean {
    return voiceSession || toggled || recognition !== null || restartTimer !== null || stopping !== null;
  }

  function toggleVoice(): void {
    if (stopping !== null || toggled || voiceSession) {
      void stopVoice();
      return;
    }
    startVoice();
  }

  /**
   * One recognizer. Clear its four handlers, abort it if it never ended, and drop it.
   * A recognizer that already fired onend is not aborted again: the restart cap stays at zero aborts.
   */
  function retireRecognizer(rec: SpeechRecognitionLike | null): void {
    if (rec === null) return;
    const ended = endedRecs.has(rec);
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    if (!ended) {
      try {
        rec.abort();
      } catch {
        // Already ended or aborted.
      }
    }
    if (recognition === rec) recognition = null;
    if (lateRec === rec) lateRec = null;
    if (restartRec === rec) restartRec = null;
    markDead(rec);
  }

  function startVoice(): void {
    if (voiceSession || stopping !== null || toggled) return;
    if (pending || view === null || view.question === null) return;
    readDraft();
    const engineNow = activeEngine();
    if (engineNow !== "web-speech") {
      notice = null;
      error = engineNow === "none" ? VOICE_UNSUPPORTED : null;
      paint();
      return;
    }
    const Recognition = env.SpeechRecognition ?? null;
    if (Recognition === null) {
      notice = null;
      error = VOICE_UNSUPPORTED;
      paint();
      return;
    }
    voiceEpoch += 1;
    const epoch = voiceEpoch;
    retireRecognizer(recognition);
    // A stop that never fired onend is still holding the microphone.
    if (lateRec !== null && !endedRecs.has(lateRec)) retireRecognizer(lateRec);
    if (restartRec !== null) retireRecognizer(restartRec);
    voiceBase = draft;
    voiceFinal = "";
    voiceInterim = "";
    recognizerBase = "";
    voiceError = null;
    heardStart = false;
    userTouched = false;
    lastHeard = "";
    promotedUtterance = "";
    emptyRestarts = 0;
    restartDelay = VOICE_RESTART_BASE_MS;
    cycleHeard = false;
    capHit = false;
    committed = false;
    voiceSession = true;
    toggled = true;
    listening = true;
    error = null;
    notice = VOICE_LISTENING;
    voiceDisclosed = true;
    announceVoice(VOICE_LIVE_STARTED);
    if (!patchListening()) paint();
    beginRecognition(epoch);
    if (recognition === null && restartTimer === null) commitVoice(null);
  }

  function beginRecognition(epoch: number = voiceEpoch): "started" | "idle" {
    if (!toggled || !voiceSession || committed) return "idle";
    retireRecognizer(recognition);
    if (restartRec !== null) retireRecognizer(restartRec);
    const Recognition = env.SpeechRecognition ?? null;
    if (Recognition === null) {
      voiceError = VOICE_UNSUPPORTED;
      return "idle";
    }
    if (voiceInterim !== "") {
      voiceFinal = joinWords(voiceFinal, voiceInterim);
      voiceInterim = "";
      applyHeardToDraft();
    }
    // A restart keeps earlier words. The next recognizer starts a new segment list.
    recognizerBase = voiceFinal.trim();
    promotedUtterance = "";
    cycleHeard = false;
    let rec: SpeechRecognitionLike;
    try {
      rec = new Recognition();
      trackConstructed(rec);
      rec.lang = env.lang ?? "en-US";
      rec.continuous = true;
      rec.interimResults = true;
    } catch {
      voiceError = VOICE_UNSUPPORTED;
      return "idle";
    }
    rec.onstart = () => {
      if (epoch !== voiceEpoch || recognition !== rec) return;
      heardStart = true;
    };
    rec.onresult = (event) => {
      if (epoch !== voiceEpoch) return;
      if (recognition !== rec && lateRec !== rec) return;
      applyResult(event);
    };
    rec.onerror = (event) => {
      if (epoch !== voiceEpoch) return;
      if (recognition !== rec && lateRec !== rec) return;
      // aborted is the empty-stop timeout. no-speech is Chrome ending a pause.
      if (event.error === "aborted" || event.error === "no-speech") return;
      voiceError = voiceMessage(event.error, heardStart);
      toggled = false;
    };
    rec.onend = () => {
      if (epoch !== voiceEpoch) return;
      endRecognition(rec);
    };
    recognition = rec;
    try {
      rec.start();
    } catch {
      voiceError = VOICE_FAILED;
      recognition = null;
      unhook(rec);
      markDead(rec);
      return "idle";
    }
    if (recognition === rec) markLive(rec);
    return recognition === rec ? "started" : "idle";
  }

  function applyResult(event: SpeechResultEventLike): void {
    const pieces = piecesFrom(event);
    if (pieces.length === 0) return;
    const eventOnly = mergeTranscript(pieces);
    if (eventOnly.heard === "") return;
    const folded = mergeTranscript(pieces, recognizerBase);
    voiceFinal = folded.finals;
    voiceInterim = folded.interim;
    if (eventOnly.finals !== "" || eventOnly.interim !== "") {
      if (eventOnly.finals !== "") promotedUtterance = "";
      cycleHeard = true;
      emptyRestarts = 0;
      restartDelay = VOICE_RESTART_BASE_MS;
    }
    applyHeardToDraft();
    if (eventOnly.finals !== "" && stopWait !== null) stopWait.resolve();
  }

  function stopVoice(): Promise<void> {
    if (stopping !== null) return stopping;
    if (!voiceSession && !toggled && recognition === null && restartTimer === null) return Promise.resolve();
    toggled = false;
    stopping = finishStop().finally(() => {
      stopping = null;
    });
    return stopping;
  }

  async function finishStop(): Promise<void> {
    toggled = false;
    clearRestartTimer();
    const rec = recognition;
    if (rec === null) {
      if (voiceSession && !committed) commitVoice(null);
      else resetVoiceSession(null);
      return;
    }
    promoteInterim();
    if (lateRec !== null && lateRec !== rec) retireRecognizer(lateRec);
    lateRec = rec;
    const ended = waitForStop(rec);
    try {
      rec.stop();
    } catch {
      // stop throws once the recognizer has already ended.
    }
    if (recognition === rec || stopWait?.rec === rec) await ended;
    const pending = promotedUtterance;
    const contributed = joinWords(voiceFinal, voiceInterim);
    const capped = capHit;
    const failed = voiceError !== null;
    if (voiceSession && !committed) commitVoice(rec);
    else resetVoiceSession(rec);
    sealLate(rec, pending, contributed, capped, failed);
  }

  function waitForStop(rec: SpeechRecognitionLike): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearStopTimer();
        if (stopWait?.rec === rec) stopWait = null;
        resolve();
      };
      stopWait = { rec, resolve: finish };
      stopTimer = setTimeout(() => {
        stopTimer = null;
        if (recognition === rec) {
          const heard = joinWords(voiceFinal, voiceInterim) !== "";
          if (!heard) {
            try {
              rec.abort();
            } catch {
              // abort throws once the recognizer has already ended.
            }
          }
          markDead(rec);
          recognition = null;
        }
        finish();
      }, VOICE_STOP_WAIT_MS);
    });
  }

  function endRecognition(rec: SpeechRecognitionLike): void {
    if (recognition !== rec) return;
    const heardCycle = cycleHeard;
    endedRecs.add(rec);
    recognition = null;
    markDead(rec);
    if (stopWait !== null && stopWait.rec === rec) {
      const wake = stopWait.resolve;
      stopWait = null;
      wake();
      return;
    }
    unhook(rec);
    if (lateRec === rec) lateRec = null;
    if (!voiceSession || committed) return;
    if (toggled && voiceError === null) {
      restartRec = rec;
      queueRestart(heardCycle);
      return;
    }
    commitVoice(rec);
  }

  function queueRestart(hadResult: boolean): void {
    if (restartTimer !== null || committed || !toggled || !voiceSession) return;
    if (hadResult) {
      emptyRestarts = 0;
      restartDelay = VOICE_RESTART_BASE_MS;
    } else {
      emptyRestarts += 1;
      if (emptyRestarts >= VOICE_RESTART_CAP) {
        capHit = true;
        toggled = false;
        commitVoice(null);
        return;
      }
    }
    const delay = restartDelay;
    if (!hadResult) restartDelay = Math.min(VOICE_RESTART_MAX_MS, restartDelay * 2);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!toggled || !voiceSession || recognition !== null || committed || voiceError !== null) {
        if (voiceSession && !committed && voiceError !== null) commitVoice(recognition);
        return;
      }
      if (beginRecognition() !== "started") commitVoice(null);
    }, delay);
  }

  function promoteInterim(): void {
    if (voiceInterim.trim() === "") return;
    promotedUtterance = voiceInterim.trim();
    voiceFinal = joinWords(voiceFinal, voiceInterim);
    voiceInterim = "";
    applyHeardToDraft();
  }

  function applyHeardToDraft(): void {
    const heard = joinWords(voiceFinal, voiceInterim);
    if (heard === "" && !userTouched) return;
    readDraft();
    const typed = draft;
    if (!userTouched) {
      draft = settleVoice({ base: voiceBase, typed, final: voiceFinal, interim: voiceInterim }).draft;
    } else {
      draft = mergeTyped(typed, heard);
    }
    lastHeard = heard;
    if (!patchDraft()) paint();
  }

  function mergeTyped(typed: string, heard: string): string {
    if (heard === "") return typed;
    const trimmed = typed.trimEnd();
    if (lastHeard !== "" && (trimmed === lastHeard || trimmed.endsWith(` ${lastHeard}`))) {
      const head = trimmed === lastHeard ? "" : trimmed.slice(0, trimmed.length - lastHeard.length).trimEnd();
      return joinWords(head, heard);
    }
    if (typed.includes(heard)) return typed;
    return joinWords(typed, heard);
  }

  function clearStopTimer(): void {
    if (stopTimer === null) return;
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  function clearRestartTimer(): void {
    if (restartTimer === null) return;
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  function unhook(rec: SpeechRecognitionLike): void {
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    if (lateRec === rec) lateRec = null;
  }

  function sealLate(
    rec: SpeechRecognitionLike,
    pending: string,
    contributed: string,
    capped: boolean,
    failed: boolean,
  ): void {
    let alive = true;
    let anchor = pending.trim();
    let heard = contributed.trim();
    const handler = (event: SpeechResultEventLike): void => {
      if (!alive) return;
      const incoming = finalsFrom(event);
      if (incoming === "") return;
      readDraft();
      const next = placeLateFinal(draft, heard, anchor, incoming);
      const changed = next !== draft;
      draft = next;
      heard = incoming.trim();
      anchor = "";
      // A new session owns the notice. This result only edits its own utterance.
      // Heard you is only for a box that still has words.
      if (changed && !voiceSession && !capped && !failed) {
        if (draft.trim() === "") {
          notice = null;
          error = VOICE_RELEASE_EMPTY;
        } else {
          error = null;
          notice = VOICE_HEARD;
        }
      }
      if (!patchDraft()) paint();
      else syncAnswerLock();
      if (changed) rememberDraft(true);
      close();
    };
    const close = (): void => {
      if (!alive) return;
      alive = false;
      if (rec.onresult === handler) {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
      }
      if (lateRec === rec) lateRec = null;
    };
    if (lateRec !== null && lateRec !== rec) retireRecognizer(lateRec);
    lateRec = rec;
    rec.onstart = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onresult = handler;
    setTimeout(() => {
      close();
    }, VOICE_STOP_WAIT_MS);
  }

  /**
   * Drops every flag from the dictation that just ended.
   * The draft is left alone. `owner` is cleared only when it is still current,
   * so a newer recognizer is not dropped.
   */
  function resetVoiceSession(owner: SpeechRecognitionLike | null): void {
    if (recognition !== null && (owner === null || recognition === owner)) {
      markDead(recognition);
      recognition = null;
    }
    if (owner !== null) markDead(owner);
    recognizerBase = "";
    const waiter = stopWait;
    stopWait = null;
    clearStopTimer();
    clearRestartTimer();
    userTouched = false;
    lastHeard = "";
    promotedUtterance = "";
    heardStart = false;
    emptyRestarts = 0;
    restartDelay = VOICE_RESTART_BASE_MS;
    cycleHeard = false;
    capHit = false;
    voiceError = null;
    voiceFinal = "";
    voiceInterim = "";
    voiceBase = "";
    voiceSession = false;
    toggled = false;
    listening = false;
    committed = true;
    if (waiter !== null) waiter.resolve();
  }

  function commitVoice(owner: SpeechRecognitionLike | null): void {
    if (committed || !voiceSession) return;
    committed = true;
    readDraft();
    const settled = settleVoice({
      base: voiceBase,
      typed: draft,
      final: voiceFinal,
      interim: voiceInterim,
    });
    draft = settled.draft;
    const failure = voiceError;
    const capped = capHit;
    const heard = settled.heard;
    resetVoiceSession(owner);
    if (failure !== null) {
      notice = null;
      error = failure;
    } else if (capped) {
      error = null;
      notice = VOICE_CAP_NOTICE;
    } else if (heard && draft.trim() !== "") {
      error = null;
      notice = VOICE_HEARD;
    } else {
      notice = null;
      error = VOICE_RELEASE_EMPTY;
    }
    const extra = notice ?? error ?? "";
    announceVoice(extra === "" ? VOICE_LIVE_STOPPED : `${VOICE_LIVE_STOPPED}. ${extra}`);
    paint();
    rememberDraft(true);
  }

  /** Page hide and unmount. Keeps heard words and does not abort when any were heard. */
  function stopImmediately(): void {
    if (!voiceSession && !toggled && recognition === null && restartTimer === null) return;
    const rec = recognition;
    toggled = false;
    promoteInterim();
    const pending = promotedUtterance;
    const contributed = joinWords(voiceFinal, voiceInterim);
    const heard = contributed !== "";
    const capped = capHit;
    const failed = voiceError !== null;
    if (rec !== null && recognition === rec) recognition = null;
    if (rec !== null) {
      try {
        if (heard) rec.stop();
        else rec.abort();
      } catch {
        // Already ended.
      }
    }
    if (stopWait !== null) {
      const wake = stopWait.resolve;
      stopWait = null;
      wake();
    }
    if (voiceSession && !committed) commitVoice(rec);
    else resetVoiceSession(rec);
    if (rec !== null) sealLate(rec, pending, contributed, capped, failed);
  }

  function cancelVoice(): void {
    if (voiceActive()) {
      stopImmediately();
      return;
    }
    clearStopTimer();
    clearRestartTimer();
  }

  function patchListening(): boolean {
    const question = region();
    if (question === null) return false;
    const button = question.querySelector('[data-voice="hold"]');
    if (button === null) return false;
    button.innerHTML = `<span class="hh-voice-pulse" data-voice-pulse aria-hidden="true"></span>${VOICE_LABEL_STOP}`;
    button.setAttribute("aria-pressed", "true");
    const cls = button.getAttribute("class") ?? "";
    if (!cls.split(/\s+/).includes("hh-btn--listening")) {
      button.setAttribute("class", `${cls} hh-btn--listening`.trim());
    }
    if (!patchNotice(question, VOICE_LISTENING)) return false;
    if (!patchVoiceNote(question)) return false;
    const errorNode = question.querySelector("[data-card-error]");
    if (errorNode !== null && "textContent" in errorNode) errorNode.textContent = "";
    const field = question.querySelector("#hh-card-draft");
    if (field !== null) {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
    }
    return true;
  }

  function patchDraft(): boolean {
    const question = region();
    if (question === null) return false;
    const field = question.querySelector("#hh-card-draft");
    if (field === null || typeof field.value !== "string") return false;
    field.value = draft;
    syncAnswerLock();
    if (notice !== null && !patchNotice(question, notice)) return false;
    return true;
  }

  function syncAnswerLock(): void {
    const button = region()?.querySelector('[data-action="answer"]');
    if (button === null || button === undefined) return;
    const locked = answerLocked(pending);
    button.disabled = locked;
    if (locked) button.setAttribute("disabled", "");
    else button.removeAttribute("disabled");
  }

  /** After a paint, the textarea shows the live draft and Answer follows that text. */
  function alignDraftField(): void {
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.value === "string" && field.value !== draft) {
      // An empty draft must not erase words the person already put in the box.
      if (draft.trim() !== "" || field.value.trim() === "") field.value = draft;
    }
    syncAnswerLock();
  }

  function announceVoice(text: string): void {
    const doc = env.document;
    if (typeof doc.createElement !== "function" || doc.body === undefined) return;
    try {
      if (voiceLive === null) {
        const node = doc.createElement("div");
        node.setAttribute("class", "hh-guide-live");
        node.setAttribute("data-voice-live", "");
        node.setAttribute("role", "status");
        node.setAttribute("aria-live", "polite");
        doc.body.appendChild(node);
        voiceLive = node;
      }
      if ("textContent" in voiceLive) voiceLive.textContent = text;
    } catch {
      voiceLive = null;
    }
  }

  function patchNotice(question: DeskElement, text: string): boolean {
    let node = question.querySelector("[data-card-notice]");
    if (node === null) {
      const anchor = question.querySelector(".hh-qcard__actions");
      if (anchor === null || typeof anchor.insertAdjacentHTML !== "function") return false;
      anchor.insertAdjacentHTML(
        "beforebegin",
        `<p class="hh-qcard__notice" role="status" data-card-notice></p>`,
      );
      node = question.querySelector("[data-card-notice]");
    }
    if (node === null || !("textContent" in node)) return false;
    node.textContent = text;
    return true;
  }

  function patchVoiceNote(question: DeskElement): boolean {
    if (!voiceDisclosed) return true;
    if (question.querySelector("[data-voice-note]") !== null) return true;
    const anchor = question.querySelector(".hh-qcard__actions");
    if (anchor === null || typeof anchor.insertAdjacentHTML !== "function") return false;
    anchor.insertAdjacentHTML(
      "afterend",
      `<p class="hh-qcard__voice-note" data-voice-note>${escapeHtml(VOICE_SERVICE_NOTE)}</p>`,
    );
    return question.querySelector("[data-voice-note]") !== null;
  }

  function region(): DeskElement | null {
    return env.document.querySelector('[data-region="question"]');
  }

  async function load(): Promise<void> {
    const question = region();
    if (token === null || question === null) return;
    let payload: unknown;
    try {
      const response = await env.fetch("/api/session", { cache: "no-store" });
      payload = await response.json();
      if (!response.ok) throw new Error(LOAD_FAILED);
    } catch {
      error = LOAD_FAILED;
      paint();
      return;
    }
    const session = parseSession(payload);
    if (session === null) {
      error = LOAD_FAILED;
      paint();
      return;
    }
    const typed = question.querySelector("#hh-card-draft");
    const existingId = question.querySelector("[data-question-id]")?.getAttribute("data-question-id") ?? null;
    const typedValue = typed?.value ?? "";
    projectKey = session.projectKey;
    const questionId = session.question?.id ?? null;
    const storage = browserStorage();
    if (storage !== null && projectKey !== "" && questionId !== null) {
      const clearedAt = session.draftsClearedAt === null ? Number.NaN : Date.parse(session.draftsClearedAt);
      if (!Number.isNaN(clearedAt)) forgetProjectDraftsBefore(storage, projectKey, clearedAt);
      dropOtherQuestions(storage, projectKey, questionId);
    }
    const sameCard = session.question !== null && session.question.id === existingId;
    const keepField = pageTyped || (typedValue.trim() !== "" && sameCard);
    view = session;
    if (keepField) {
      draft = typedValue;
    } else if ((typed?.value ?? "").trim() === "") {
      const local =
        storage !== null && projectKey !== "" && questionId !== null
          ? loadDraft(storage, projectKey, questionId, Date.now())
          : null;
      const chosen = newerDraft(local, session.storedDraft);
      if (chosen !== null && chosen.trim() !== "") {
        draft = chosen;
        draftNote = DRAFT_RESTORED;
        draftFade = false;
      }
    }
    error = null;
    paint();
    if (draftNote === DRAFT_RESTORED) announceDraftNote(DRAFT_RESTORED);
    if (keepField && draft.trim() !== "") rememberDraft(false);
    question.setAttribute("data-live", "true");
    ready = true;
    source = new env.EventSource("/api/events");
    source.addEventListener("session", (event) => {
      if (!ready) return;
      streamFailures = 0;
      const recover = connection !== null;
      connection = null;
      applyStream(event.data);
      if (recover) paint();
    });
    source.addEventListener("error", () => {
      streamFailures += 1;
      if (streamFailures < STREAM_FAILURES || connection !== null) return;
      connection = DESK_OFFLINE;
      paint();
    });
    source.addEventListener("tools", (event) => {
      applyToolsEvent(event.data);
    });
  }

  function applyStream(raw: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const session = parseSession(payload);
    if (session === null || view === null) return;
    if (cardHold) {
      if (view.question === null) return;
      const questionId = suggestHold?.questionId ?? view.question.id;
      if (
        suggestHold !== null &&
        signature(session) === signature(suggestHold.session) &&
        session.transcriptHtml === suggestHold.session.transcriptHtml
      ) {
        return;
      }
      // The stream arrives before the POST body. Park the suggestion on this card.
      placeSuggestion(session, questionId);
      return;
    }
    if (signature(session) === signature(view)) return;
    if (voiceActive()) {
      const next = session;
      void (async () => {
        await stopVoice();
        if (view === null || signature(next) === signature(view)) return;
        const kept = draft;
        const same = view.question !== null && next.question?.id === view.question.id;
        view = next;
        draft = kept.trim() === "" ? "" : kept;
        error = null;
        pending = false;
        skipConfirm = false;
        if (!same) {
          draftNote = null;
          draftFade = false;
        }
        paint();
        if (same && draft.trim() !== "") rememberDraft(true);
      })();
      return;
    }
    const sameQuestion = view.question !== null && session.question?.id === view.question.id;
    const pushbackArrived =
      ready &&
      sameQuestion &&
      (session.pushback ?? "") !== "" &&
      session.pushback !== view.pushback;
    if (pushbackArrived) {
      readDraft();
      const kept = draft.trim() !== "" ? draft : (offerOnFocus ?? "");
      if (kept.trim() !== "") {
        offerOnFocus = kept;
        draft = kept;
        rememberDraft(true);
      } else {
        offerOnFocus = null;
      }
      view = session;
      draft = "";
      error = null;
      notice = null;
      pending = false;
      skipConfirm = false;
      draftNote = null;
      draftFade = false;
      paint();
      publishShown(kept.trim() === "" ? null : kept);
      return;
    }
    view = session;
    draft = "";
    error = null;
    notice = null;
    pending = false;
    skipConfirm = false;
    if (!sameQuestion) {
      draftNote = null;
      draftFade = false;
    }
    paint();
  }

  async function submit(action: "answer" | "suggest" | "skip"): Promise<void> {
    if (pending || token === null || view === null || view.question === null) return;
    if (voiceActive()) await stopVoice();
    readDraft();
    if (action === "suggest") {
      if (suggestHold !== null) return;
      await requestSuggestion(view.question.id);
      return;
    }
    if (action === "answer" && suggestHold !== null) {
      await acceptSuggestion();
      return;
    }
    if (action === "skip" && suggestHold !== null) {
      suggestHold = null;
      cardHold = false;
      ownWords = false;
    }
    if (action === "answer" && uploadingLabel !== null) return;
    if (action === "answer" && draft.trim() === "" && !hasReadyChip()) {
      error = EMPTY_ANSWER;
      paint();
      return;
    }
    if (action === "skip" && view.required && !skipConfirm) {
      skipConfirm = true;
      paint();
      return;
    }
    skipConfirm = false;
    const questionId = view.question.id;
    pending = true;
    error = null;
    notice = null;
    let advance = false;
    let focusChoices = false;
    try {
      paint();
      const attachments = action === "answer" ? attachmentPayload() : [];
      const result = await postTurn(
        action,
        token,
        action === "answer"
          ? {
              questionId,
              text: draft,
              ...(attachments.length > 0 ? { attachments } : {}),
            }
          : { questionId },
        env.fetch,
      );
      if (!result.ok) {
        error = result.error;
        return;
      }
      finishTurn(questionId, result.session, draft);
      error = null;
      ownWords = false;
      advance = true;
      focusChoices =
        result.session.question?.id === questionId &&
        result.session.pushback !== null &&
        result.session.choices?.forId === questionId;
    } catch {
      error = DRAFT_KEPT;
    } finally {
      pending = false;
      paint();
      if (advance) {
        if (focusChoices) focusChoiceGroup();
        else focusNewQuestion();
      }
    }
  }

  async function requestSuggestion(questionId: string): Promise<void> {
    if (token === null) return;
    pending = true;
    choiceWait = null;
    error = null;
    notice = null;
    cardHold = true;
    clearSuggestNotice();
    setBusy(true);
    let result: { ok: true; session: SessionView } | { ok: false; error: string };
    try {
      result = await postTurn("suggest", token, { questionId }, env.fetch);
    } catch {
      result = { ok: false, error: DRAFT_KEPT };
    }
    pending = false;
    if (!result.ok) {
      // A session event may already have placed the suggestion. Do not paint over it.
      if (suggestHold !== null) {
        setBusy(false);
        resumeChoice();
        return;
      }
      choiceWait = null;
      cardHold = false;
      showSuggestFailure(result.error);
      setBusy(false);
      return;
    }
    placeSuggestion(result.session, questionId);
    resumeChoice();
  }

  async function acceptSuggestion(): Promise<void> {
    if (suggestHold === null || token === null) return;
    readDraft();
    if (draft.trim() === "") {
      showFieldError(EMPTY_ANSWER);
      return;
    }
    const held = suggestHold;
    if (!ownWords && draft.trim() === held.suggestion.trim()) {
      releaseDraft(held.questionId);
      suggestHold = null;
      cardHold = false;
      ownWords = false;
      view = held.session;
      draft = "";
      draftNote = null;
      draftFade = false;
      error = null;
      notice = null;
      pending = false;
      paint();
      focusNewQuestion();
      return;
    }
    pending = true;
    error = null;
    notice = null;
    setBusy(true);
    let advance = false;
    try {
      const result = await postTurn("answer", token, { questionId: held.questionId, text: draft }, env.fetch);
      if (!result.ok) {
        showFieldError(result.error);
        return;
      }
      finishTurn(held.questionId, result.session, draft);
      suggestHold = null;
      cardHold = false;
      ownWords = false;
      error = null;
      advance = true;
    } catch {
      showFieldError(DRAFT_KEPT);
    } finally {
      pending = false;
      if (advance) {
        paint();
        focusNewQuestion();
      } else {
        setBusy(false);
      }
    }
  }

  function suggestionText(session: SessionView, questionId: string): string {
    const assumed = session.assumption;
    if (assumed !== null && assumed.kind === "suggested") {
      return assumed.value.trim().replace(/^ASSUMED:\s*/i, "");
    }
    if (view !== null && view.question !== null && view.question.id === questionId) {
      return (view.question.suggest ?? "").trim().replace(/^ASSUMED:\s*/i, "");
    }
    return "";
  }

  function placeSuggestion(session: SessionView, questionId: string): void {
    const incoming = suggestionText(session, questionId);
    const previous = suggestHold;
    const edited = previous !== null && draft.trim() !== previous.suggestion.trim();
    const suggestion = incoming !== "" ? incoming : (previous?.suggestion ?? "");
    suggestHold = {
      questionId,
      suggestion: edited && previous !== null ? previous.suggestion : suggestion,
      session,
    };
    cardHold = true;
    if (!edited) {
      draft = suggestion;
      const field = region()?.querySelector("#hh-card-draft");
      if (field !== null && field !== undefined) field.value = suggestion;
      if (suggestion !== "") showAssumed(suggestion);
      else hideAssumed();
      clearFieldError();
      if (suggestion.trim() !== "") rememberDraft(true);
    }
    const transcript = env.document.querySelector('[data-region="transcript"]');
    if (transcript !== null) transcript.innerHTML = session.transcriptHtml;
    if (mountChoices(session, questionId)) focusChoiceGroup();
    clearSuggestNotice();
    if (!pending) setBusy(false);
  }

  function mountChoices(session: SessionView, questionId: string): boolean {
    const set = session.choices;
    if (set === null || set.forId !== questionId || set.items.length < 1) return false;
    const article = region()?.querySelector(`[data-question-id="${questionId}"]`);
    if (article === null || article === undefined) return false;
    if (article.querySelector("[data-choices]") !== null) return false;
    const html = renderChoiceGroup(set);
    if (html === "") return false;
    const composer = article.querySelector(".hh-qcard__composer");
    if (composer !== null && typeof composer.insertAdjacentHTML === "function") {
      composer.insertAdjacentHTML("afterbegin", html);
    } else {
      const ask = article.querySelector("#hh-card-ask");
      if (ask === null || typeof ask.insertAdjacentHTML !== "function") return false;
      ask.insertAdjacentHTML("afterend", html);
    }
    return article.querySelector("[data-choices]") !== null;
  }

  function focusChoiceGroup(): void {
    const first = choiceNodeByTab() ?? region()?.querySelector("[data-choice-id]");
    if (first !== null && first !== undefined && typeof first.focus === "function") first.focus();
  }

  function focusField(): void {
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.focus === "function") field.focus();
  }

  function announceChoices(text: string): void {
    const node = region()?.querySelector("[data-choices-live]");
    if (node !== null && node !== undefined && "textContent" in node) node.textContent = text;
  }

  function showSuggestFailure(message: string): void {
    error = null;
    notice = message;
    clearFieldError();
    const question = region();
    if (question === null) return;
    patchNotice(question, message);
    let retry = question.querySelector('[data-retry="suggest"]');
    if (retry === null) {
      const html = `<p class="hh-qcard__retry"><button type="button" class="hh-btn hh-btn--secondary" data-retry="suggest">Retry</button></p>`;
      const noticeNode = question.querySelector("[data-card-notice]");
      if (noticeNode !== null && typeof noticeNode.insertAdjacentHTML === "function") {
        noticeNode.insertAdjacentHTML("afterend", html);
      } else {
        question.querySelector(".hh-qcard__actions")?.insertAdjacentHTML?.("beforebegin", html);
      }
      retry = question.querySelector('[data-retry="suggest"]');
    }
    retry?.removeAttribute("hidden");
  }

  function clearSuggestNotice(): void {
    notice = null;
    const question = region();
    if (question === null) return;
    const node = question.querySelector("[data-card-notice]");
    if (node !== null && "textContent" in node) node.textContent = "";
    const retry = question.querySelector('[data-retry="suggest"]');
    if (retry !== null) {
      retry.setAttribute("hidden", "");
      const wrap = retry.parentElement;
      if (wrap !== null && wrap.getAttribute("class") === "hh-qcard__retry") wrap.setAttribute("hidden", "");
    }
  }

  function resumeChoice(): void {
    const id = choiceWait;
    choiceWait = null;
    if (id === null || pending || token === null || !choicesOpen()) return;
    void pickChoice(id);
  }

  async function pickChoice(id: string): Promise<void> {
    if (token === null) return;
    if (pending) {
      // The session stream shows choices before the suggest POST settles.
      if (choicesOpen()) choiceWait = id;
      return;
    }
    choiceWait = null;
    if (voiceActive()) await stopVoice();
    if (id === "other") {
      ownWords = true;
      // Other asks for a blank box. Do not offer the pushback draft back on focus.
      offerOnFocus = null;
      draft = "";
      const field = region()?.querySelector("#hh-card-draft");
      if (field !== null && field !== undefined) field.value = "";
      rememberDraft(true);
      hideAssumed();
      const button = region()?.querySelector('[data-action="answer"]');
      if (button !== null && button !== undefined) {
        button.disabled = true;
        button.setAttribute("disabled", "");
      }
      announceChoices("Write your own answer.");
      focusField();
      return;
    }
    const node = choiceNode(id);
    if (node === null) return;
    const label = node.getAttribute("data-choice-label") ?? "";
    if (label.trim() === "") return;
    ownWords = false;
    draft = label;
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined) field.value = label;
    showAssumed(label);
    announceChoices(`Assumed: ${label}`);
    rememberDraft(true);
    if (suggestHold !== null) {
      if (label.trim() === suggestHold.suggestion.trim()) {
        const held = suggestHold;
        releaseDraft(held.questionId);
        suggestHold = null;
        cardHold = false;
        view = held.session;
        draft = "";
        draftNote = null;
        draftFade = false;
        error = null;
        notice = null;
        pending = false;
        paint();
        focusNewQuestion();
        return;
      }
      await postAssumed(suggestHold.questionId, label);
      return;
    }
    const questionId = view?.question?.id ?? null;
    if (questionId === null) return;
    await postAssumed(questionId, label);
  }

  async function postAssumed(questionId: string, text: string): Promise<void> {
    if (token === null) return;
    pending = true;
    error = null;
    notice = null;
    setBusy(true);
    let advance = false;
    try {
      const result = await postTurn("answer", token, { questionId, text, assumed: true }, env.fetch);
      if (!result.ok) {
        showFieldError(result.error);
        return;
      }
      finishTurn(questionId, result.session, text);
      suggestHold = null;
      cardHold = false;
      ownWords = false;
      error = null;
      advance = true;
    } catch {
      showFieldError(DRAFT_KEPT);
    } finally {
      pending = false;
      if (advance) {
        paint();
        focusNewQuestion();
      } else {
        setBusy(false);
      }
    }
  }

  function choiceNode(id: string): DeskElement | null {
    return region()?.querySelector(`[data-choice-id="${id}"]`) ?? null;
  }

  function choiceNodeByTab(): DeskElement | null {
    return region()?.querySelector('[data-choice-id][tabindex="0"]') ?? null;
  }

  function choicesOpen(): boolean {
    return region()?.querySelector("[data-choices]") !== null;
  }

  function currentChoiceId(): string | null {
    return choiceNodeByTab()?.getAttribute("data-choice-id") ?? null;
  }

  function moveChoice(delta: number): void {
    const ids = ["A", "B", "C", "D", "other"];
    const nodes: DeskElement[] = [];
    for (const id of ids) {
      const node = choiceNode(id);
      if (node !== null) nodes.push(node);
    }
    if (nodes.length === 0) return;
    let index = 0;
    for (let cursor = 0; cursor < nodes.length; cursor += 1) {
      if (nodes[cursor]?.getAttribute("tabindex") === "0") index = cursor;
    }
    const next = (index + delta + nodes.length) % nodes.length;
    for (let cursor = 0; cursor < nodes.length; cursor += 1) {
      const node = nodes[cursor];
      if (node === undefined) continue;
      const on = cursor === next;
      node.setAttribute("tabindex", on ? "0" : "-1");
      node.setAttribute("aria-checked", on ? "true" : "false");
    }
    const target = nodes[next];
    if (target !== undefined && typeof target.focus === "function") target.focus();
  }

  function showAssumed(text: string): void {
    const question = region();
    if (question === null) return;
    const clean = text.trim().replace(/^ASSUMED:\s*/i, "");
    const line = `Assumed: ${clean}`;
    const existing = question.querySelector("#hh-card-assumed");
    if (existing !== null) {
      existing.removeAttribute("hidden");
      existing.setAttribute("data-assumed", "suggested");
      existing.setAttribute("class", "hh-qcard__assumed");
      if ("textContent" in existing) existing.textContent = line;
      return;
    }
    const ask = question.querySelector("#hh-card-ask");
    if (ask === null || typeof ask.insertAdjacentHTML !== "function") return;
    ask.insertAdjacentHTML(
      "beforebegin",
      `<p class="hh-qcard__assumed" id="hh-card-assumed" data-assumed="suggested">${escapeHtml(line)}</p>`,
    );
  }

  function hideAssumed(): void {
    const node = region()?.querySelector("#hh-card-assumed");
    if (node === null || node === undefined) return;
    node.removeAttribute("data-assumed");
    node.setAttribute("hidden", "");
    node.setAttribute("class", "hh-qcard__assumed");
    if ("textContent" in node) node.textContent = "";
  }

  function showFieldError(message: string): void {
    error = message;
    const node = region()?.querySelector("[data-card-error]");
    if (node === null || node === undefined) return;
    if ("textContent" in node) node.textContent = message;
    node.setAttribute("role", "alert");
    node.setAttribute("class", "hh-error hh-qcard__error");
    const field = region()?.querySelector("#hh-card-draft");
    if (field === null || field === undefined) return;
    field.setAttribute("aria-invalid", "true");
    const described = field.getAttribute("aria-describedby") ?? "";
    if (!described.split(/\s+/).includes("hh-card-error")) {
      field.setAttribute("aria-describedby", `${described} hh-card-error`.trim());
    }
  }

  function clearFieldError(): void {
    error = null;
    const node = region()?.querySelector("[data-card-error]");
    if (node === null || node === undefined) return;
    if ("textContent" in node) node.textContent = "";
    node.removeAttribute("role");
    node.setAttribute("class", "hh-qcard__error");
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined) field.removeAttribute("aria-invalid");
  }

  function setBusy(on: boolean): void {
    const question = region();
    if (question === null) return;
    const article = question.querySelector("[data-question-id]");
    if (article !== null) {
      if (on) article.setAttribute("aria-busy", "true");
      else article.removeAttribute("aria-busy");
    }
    for (const name of ["answer", "suggest", "skip"] as const) {
      const button = question.querySelector(`[data-action="${name}"]`);
      if (button === null) continue;
      const lock = name === "answer" ? answerLocked(on) : on;
      button.disabled = lock;
      if (lock) button.setAttribute("disabled", "");
      else button.removeAttribute("disabled");
    }
    const voice = question.querySelector('[data-voice="hold"]');
    if (voice === null) {
      if (!on) alignDraftField();
      return;
    }
    if (on) {
      voice.disabled = true;
      voice.setAttribute("disabled", "");
      return;
    }
    if ((voice.textContent ?? "") === TALK_NEEDS_CHROMIUM) {
      alignDraftField();
      return;
    }
    voice.disabled = false;
    voice.removeAttribute("disabled");
    alignDraftField();
  }

  function firstFile(list: ArrayLike<File> | undefined): File | null {
    if (list === undefined || list.length < 1) return null;
    return list[0] ?? null;
  }

  function markedHost(start: DeskElement | null, name: string): DeskElement | null {
    let node = start;
    const seen = new Set<DeskElement>();
    while (node !== null && !seen.has(node)) {
      seen.add(node);
      if (typeof node.getAttribute !== "function") return null;
      if (node.getAttribute(name) !== null) return node;
      node = node.parentElement;
    }
    return null;
  }

  function dropHost(start: DeskElement | null): DeskElement | null {
    return markedHost(start, "data-logo-drop");
  }

  function langDetails(start: DeskElement | null): DeskElement | null {
    return markedHost(start, "data-lang-toggle");
  }

  function currentQuestionId(): string | null {
    return (
      view?.question?.id ??
      region()?.querySelector("[data-question-id]")?.getAttribute("data-question-id") ??
      null
    );
  }

  /** The German line is inserted here, so the first card HTML does not contain it. */
  function syncLanguage(details: DeskElement): void {
    const open = details.open === true || details.getAttribute("open") !== null;
    if (!open) return;
    if (details.querySelector("[data-restatement]") !== null) return;
    const id = currentQuestionId() ?? "";
    details.insertAdjacentHTML?.("beforeend", languagePanel(id));
  }

  async function uploadLogo(file: File): Promise<void> {
    const question = view?.question ?? null;
    if (question === null || !isLogoQuestion(question) || token === null) return;
    if (file.size === 0) {
      logoSaved = { id: question.id, text: "File is empty." };
      paint();
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      logoSaved = { id: question.id, text: "File is over 25 MB." };
      paint();
      return;
    }
    const body = new FormData();
    body.append("file", file, file.name);
    let response: Response;
    try {
      response = await env.fetch("/api/upload", {
        method: "POST",
        cache: "no-store",
        headers: {
          "x-hh-csrf": token,
          "x-hh-question": question.id,
        },
        body,
      });
    } catch {
      logoSaved = { id: question.id, text: "The logo did not save. Try again." };
      paint();
      return;
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message =
        isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The logo did not save. Try again.";
      logoSaved = { id: question.id, text: message };
      paint();
      return;
    }
    const safeName = isRecord(payload) && typeof payload.safeName === "string" ? payload.safeName : "";
    if (safeName === "" || !/^[A-Za-z0-9._-]{1,80}$/.test(safeName)) {
      logoSaved = { id: question.id, text: "The logo did not save. Try again." };
      paint();
      return;
    }
    const line = `Logo file: ${safeName}`;
    if (!draft.includes(line)) draft = draft.trim() === "" ? line : `${draft.trim()}\n${line}`;
    logoSaved = { id: question.id, text: `Saved as ${safeName}.` };
    paint();
    rememberDraft(true);
  }

  function answerLocked(busy: boolean): boolean {
    const field = region()?.querySelector("#hh-card-draft");
    const text = field !== null && field !== undefined && typeof field.value === "string" ? field.value : draft;
    return busy || uploadingLabel !== null || (text.trim() === "" && !hasReadyChip());
  }

  function hasReadyChip(): boolean {
    return chips.some((chip) => chip.ready && chip.error === undefined);
  }

  function attachmentPayload(): AnswerAttachment[] {
    const out: AnswerAttachment[] = [];
    for (const chip of chips) {
      if (!chip.ready || chip.error !== undefined) continue;
      if (
        chip.kind === "file" &&
        chip.path !== undefined &&
        chip.originalName !== undefined &&
        chip.size !== undefined &&
        chip.type !== undefined
      ) {
        out.push({
          kind: "file",
          path: chip.path,
          originalName: chip.originalName,
          size: chip.size,
          type: chip.type,
        });
        continue;
      }
      if (chip.kind === "link" && chip.url !== undefined) out.push({ kind: "link", url: chip.url });
    }
    return out;
  }

  function syncAttachQuestion(): void {
    const id = view?.question?.id ?? null;
    if (id === chipQuestionId) return;
    releaseChips();
    chipQuestionId = id;
    filesSeededFor = null;
    linkDraft = "";
    attachLive = "";
    uploadingLabel = null;
    dragDepth = 0;
  }

  function attachSnapshot(): CardState["attach"] {
    const id = view?.question?.id;
    if (id === undefined || kindsFor(id) === null) return undefined;
    const viewChips: AttachChipView[] = chips.map((chip) => ({
      id: chip.id,
      kind: chip.kind,
      label: chip.label,
      detail: chip.detail,
      removeName: chip.removeName,
      ...(chip.previewUrl === undefined ? {} : { previewUrl: chip.previewUrl }),
      ...(chip.error === undefined ? {} : { error: chip.error }),
      ready: chip.ready,
      ...(chip.retry ? { retry: true } : {}),
    }));
    return { linkDraft, uploading: uploadingLabel, live: attachLive, chips: viewChips };
  }

  function attachSpread(): { attach: NonNullable<CardState["attach"]> } | Record<string, never> {
    const attach = attachSnapshot();
    if (attach === undefined) return {};
    return { attach };
  }

  function releaseChips(): void {
    for (const chip of chips) revokePreview(chip.previewUrl);
    chips = [];
    filesById.clear();
  }

  function readLinkField(): void {
    const field = region()?.querySelector("[data-attach-url]");
    if (field !== null && field !== undefined && typeof field.value === "string") linkDraft = field.value;
  }

  function rememberBeforePaint(): void {
    readDraft();
    readLinkField();
  }

  function addLinkFromField(): void {
    rememberBeforePaint();
    const id = view?.question?.id;
    if (id === undefined || kindsFor(id)?.includes("links") !== true) return;
    const parts = linkTokens(linkDraft);
    if (parts.length === 0) return;
    const before = linkUrls();
    const result = collectLinks(before, parts);
    for (const url of result.added) chips.push(linkChip(url));
    const messages: string[] = [];
    if (result.added.length > 0) messages.push(addedLinksMessage(result.added.map((url) => linkLabel(url))));
    if (result.errors.length > 0 && result.errors[0] !== undefined) messages.push(result.errors[0]);
    if (messages.length > 0) attachLive = messages.join(" ");
    if (result.errors.length === 0 && result.added.length > 0) linkDraft = "";
    paint();
  }

  function addLinkParts(parts: readonly string[]): void {
    rememberBeforePaint();
    const result = collectLinks(linkUrls(), parts);
    for (const url of result.added) chips.push(linkChip(url));
    const messages: string[] = [];
    if (result.added.length > 0) messages.push(addedLinksMessage(result.added.map((url) => linkLabel(url))));
    if (result.errors.length > 0 && result.errors[0] !== undefined) messages.push(result.errors[0]);
    if (messages.length > 0) attachLive = messages.join(" ");
    paint();
  }

  function linkUrls(): string[] {
    const urls: string[] = [];
    for (const chip of chips) {
      if (chip.kind === "link" && chip.url !== undefined && chip.error === undefined) urls.push(chip.url);
    }
    return urls;
  }

  function linkChip(url: string): HeldChip {
    const label = linkLabel(url);
    chipSeq += 1;
    return {
      id: `a${chipSeq}`,
      kind: "link",
      label,
      detail: "",
      removeName: `Remove ${label}`,
      ready: true,
      retry: false,
      url,
    };
  }

  function removeChip(id: string): void {
    const index = chips.findIndex((chip) => chip.id === id);
    const chip = chips[index];
    if (chip === undefined) return;
    rememberBeforePaint();
    revokePreview(chip.previewUrl);
    filesById.delete(id);
    chips.splice(index, 1);
    attachLive = removedMessage(chip.label);
    paint();
    const next = chips[index] ?? chips[chips.length - 1];
    const focus =
      next === undefined
        ? region()?.querySelector("[data-attach-zone]")
        : region()?.querySelector(`[data-attach-remove="${next.id}"]`);
    focus?.focus?.();
  }

  function retryChip(id: string): void {
    const chip = chips.find((item) => item.id === id);
    if (chip === undefined || chip.retry !== true) return;
    delete chip.error;
    chip.ready = false;
    chip.retry = false;
    rememberBeforePaint();
    scheduleUploads([id]);
  }

  async function addIncomingFiles(list: readonly File[]): Promise<void> {
    const questionId = view?.question?.id;
    const kinds = questionId === undefined ? null : kindsFor(questionId);
    if (kinds === null || questionId === undefined) return;
    rememberBeforePaint();
    const messages: string[] = [];
    let added = 0;
    const toUpload: string[] = [];
    for (const file of list) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if ((ext === "url" || ext === "webloc") && kinds.includes("links")) {
        if (file.size > 65_536) {
          messages.push(shortcutMissError());
          chips.push(problemChip(file.name, shortcutMissError()));
          continue;
        }
        let text = "";
        try {
          text = await file.text();
        } catch {
          text = "";
        }
        const target = shortcutTarget(file.name, text);
        if (target === null || target === "") {
          messages.push(shortcutMissError());
          chips.push(problemChip(file.name, shortcutMissError()));
          continue;
        }
        const result = collectLinks(linkUrls(), [target]);
        for (const url of result.added) chips.push(linkChip(url));
        if (result.added.length > 0) messages.push(addedLinksMessage(result.added.map((url) => linkLabel(url))));
        if (result.errors[0] !== undefined) messages.push(result.errors[0]);
        continue;
      }
      if (readyFileCount() >= MAX_ATTACH_FILES) {
        messages.push(fileCapError());
        chips.push(problemChip(file.name, fileCapError()));
        continue;
      }
      const meta = validateFileMeta({ name: file.name, type: file.type, size: file.size }, kinds);
      if (!meta.ok) {
        messages.push(meta.error);
        chips.push(problemChip(file.name, meta.error));
        continue;
      }
      const chip = fileChip(file, meta.name);
      chips.push(chip);
      filesById.set(chip.id, file);
      toUpload.push(chip.id);
      added += 1;
    }
    if (added > 0) messages.unshift(addedFilesMessage(added));
    if (messages.length > 0) attachLive = messages.join(" ");
    paint();
    if (toUpload.length > 0) scheduleUploads(toUpload);
  }

  function readyFileCount(): number {
    return chips.filter((chip) => chip.kind === "file" && chip.error === undefined).length;
  }

  function problemChip(name: string, error: string): HeldChip {
    const label = name.split(/[/\\]/).pop() || "That file";
    chipSeq += 1;
    return {
      id: `a${chipSeq}`,
      kind: "file",
      label,
      detail: "",
      removeName: `Remove ${label}`,
      error,
      ready: false,
      retry: false,
    };
  }

  function fileChip(file: File, stored: string): HeldChip {
    const label = file.name.split(/[/\\]/).pop() || stored;
    chipSeq += 1;
    const previewUrl = objectUrl(file);
    return {
      id: `a${chipSeq}`,
      kind: "file",
      label,
      detail: formatBytes(file.size),
      removeName: `Remove ${label}`,
      ...(previewUrl === undefined ? {} : { previewUrl }),
      ready: false,
      retry: false,
      originalName: label,
      size: file.size,
      type: file.type,
    };
  }

  function scheduleUploads(ids: readonly string[]): void {
    const questionId = view?.question?.id ?? "";
    const total = ids.length;
    uploadQueue = uploadQueue
      .then(async () => {
        for (let index = 0; index < ids.length; index += 1) {
          const id = ids[index];
          if (id === undefined || view?.question?.id !== questionId) return;
          uploadingLabel = uploadingMessage(index + 1, total);
          attachLive = uploadingLabel;
          rememberBeforePaint();
          paint();
          await uploadChip(id, questionId);
        }
        if (view?.question?.id !== questionId) return;
        uploadingLabel = null;
        const problems = chips.flatMap((chip) => (chip.error === undefined ? [] : [chip.error]));
        if (problems.length > 0) attachLive = problems.join(" ");
        else {
          const readyFiles = chips.filter((chip) => chip.kind === "file" && chip.ready).length;
          if (readyFiles > 0) attachLive = addedFilesMessage(readyFiles);
        }
        rememberBeforePaint();
        paint();
      })
      .catch(() => {
        uploadingLabel = null;
      });
  }

  async function uploadChip(id: string, questionId: string): Promise<void> {
    const chip = chips.find((item) => item.id === id);
    const file = filesById.get(id);
    if (chip === undefined || file === undefined || token === null) return;
    if (view?.question?.id !== questionId) return;
    const body = new FormData();
    body.append("file", file, file.name);
    let response: Response;
    try {
      response = await env.fetch(`/api/attach/${encodeURIComponent(questionId)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "x-hh-csrf": token },
        body,
      });
    } catch {
      markUploadFailed(chip, `${chip.label} did not save. Try again.`);
      return;
    }
    if (view?.question?.id !== questionId) return;
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      markUploadFailed(chip, `${chip.label} did not save. Try again.`);
      return;
    }
    const row = firstAttachRow(payload);
    if (row === null || row.ok !== true) {
      const error =
        row !== null && row.ok === false && row.error !== ""
          ? row.error
          : `${chip.label} did not save. Try again.`;
      chip.error = error;
      chip.ready = false;
      chip.retry = row !== null && row.ok === false ? false : true;
      attachLive = error;
      return;
    }
    if (!row.path.startsWith(`.hitchhiker/uploads/${questionId}/`) || row.path.includes("..")) {
      markUploadFailed(chip, `${chip.label} did not save. Try again.`);
      return;
    }
    chip.ready = true;
    delete chip.error;
    chip.retry = false;
    chip.path = row.path;
    chip.originalName = row.originalName === "" ? chip.label : row.originalName;
    chip.size = row.size;
    chip.type = row.type;
    chip.label = chip.originalName;
    chip.removeName = `Remove ${chip.label}`;
  }

  function markUploadFailed(chip: HeldChip, error: string): void {
    chip.error = error;
    chip.ready = false;
    chip.retry = true;
    attachLive = error;
  }

  async function receiveDrop(event: DeskEvent): Promise<void> {
    const questionId = view?.question?.id;
    const kinds = questionId === undefined ? null : kindsFor(questionId);
    if (kinds === null) return;
    const transfer = event.dataTransfer;
    const files = filesFrom(transfer?.files);
    if (files.length > 0) await addIncomingFiles(files);
    if (!kinds.includes("links") || transfer?.getData === undefined) return;
    const parts = droppedLinkParts(transfer);
    if (parts.length > 0) addLinkParts(parts);
  }

  function setDrag(on: boolean): void {
    const zone = region()?.querySelector("[data-attach-zone]");
    if (zone === null || zone === undefined) return;
    const parts = (zone.getAttribute("class") ?? "").split(/\s+/).filter((part) => part !== "" && part !== "is-drag");
    if (on) parts.push("is-drag");
    zone.setAttribute("class", parts.join(" "));
  }

  function attachZone(start: DeskElement | null): DeskElement | null {
    return markedHost(start, "data-attach-zone");
  }

  function paint(): void {
    syncAttachQuestion();
    adoptSavedFiles();
    const question = region();
    if (question !== null && view !== null) {
      const state: CardState = {
        question: view.question,
        draft,
        pushback: view.pushback,
        error,
        done: view.done,
        pending,
        listening,
        notice,
        counts: view.counts,
        assumption: view.assumption,
        required: view.required,
        skipConfirm: skipConfirm && view.required,
        enterHint: true,
        choices:
          view.choices !== null && view.question !== null && view.choices.forId === view.question.id
            ? view.choices
            : null,
        ...(voiceDisclosed ? { voiceNote: true } : {}),
        ...attachSpread(),
        keepDraft: true,
        ...(draftNote !== null && draftNote !== "" ? { draftNote, draftFade } : {}),
      };
      const engine = activeEngine();
      const card = reshapeDeskCard(
        replaceEmptyCard(renderCard(state), view.question?.id ?? null),
        speechReady() && engine === "web-speech",
        voiceChromeFor(engine),
      );
      const saved =
        logoSaved !== null && view.question?.id === logoSaved.id ? logoSaved.text : undefined;
      const html =
        saved === undefined
          ? withInterviewExtras(card, view.question)
          : withInterviewExtras(card, view.question, saved);
      if (!refillSameCard(question, html)) question.innerHTML = html;
    } else if (question !== null && error !== null) {
      question.innerHTML = publicCardError(error);
    }
    const map = env.document.querySelector('[data-region="map"]');
    if (map !== null && view !== null) map.innerHTML = view.mapHtml;
    const transcript = env.document.querySelector('[data-region="transcript"]');
    if (transcript !== null && view !== null) transcript.innerHTML = view.transcriptHtml;
    const status = env.document.querySelector('[data-region="status"]');
    if (status !== null && (view !== null || connection !== null)) {
      const base = view?.statusHtml ?? "";
      status.innerHTML =
        connection === null
          ? base
          : `<span>${escapeHtml(connection)}</span><a class="hh-btn hh-btn--ghost" href="/" data-tip="Loads the desk again.">Reload</a>${base}`;
    }
    const progress = env.document.querySelector("[data-progress]");
    if (progress !== null && view?.counts != null) {
      progress.textContent = `Question ${view.counts.index} of ${view.counts.total}`;
    }
    if (view !== null) applyMast(env.document, view.mastCompact, view.mastLine);
    applyEdits();
    ensureMotion(env.document, view?.question?.id);
    syncGuideLive();
    alignDraftField();
    ensureWriter();
  }

  function speechReady(): boolean {
    return env.SpeechRecognition != null;
  }

  function deskFlags(): VoiceDeskFlags {
    return {
      xaiSetting: flag("data-xai-setting"),
      rateAccepted: flag("data-rate-accepted"),
      localWhisper: flag("data-local-whisper"),
    };
  }

  function flag(name: string): boolean {
    const node = region();
    if (node === null) return false;
    return node.getAttribute(name) === "true";
  }

  function activeEngine(): VoiceEngineId {
    return engineForDesk(deskFlags(), speechReady());
  }

  function markTalkSupport(): void {
    if (speechReady()) return;
    const button = region()?.querySelector('[data-voice="hold"]');
    if (button === null || button === undefined) return;
    button.setAttribute("disabled", "");
    if ("textContent" in button) button.textContent = TALK_NEEDS_CHROMIUM;
  }

  function syncGuideLive(): void {
    const node = env.document.querySelector("[data-guide-live]");
    if (node === null || !("textContent" in node)) return;
    const next = guideTurnText(view?.question?.ask ?? null, view?.done === true);
    if ((node.textContent ?? "") === next) return;
    node.textContent = next;
  }

  function focusNewQuestion(): void {
    const heading = region()?.querySelector("#hh-card-ask");
    if (heading === null || heading === undefined) return;
    if (heading.getAttribute("tabindex") !== "-1") heading.setAttribute("tabindex", "-1");
    if (typeof heading.focus === "function") heading.focus();
  }

  function toggleEdit(id: string): void {
    if (!isQuestionId(id)) return;
    if (editing.has(id)) editing.delete(id);
    else editing.add(id);
    const form = editNode(id, "data-edit-form");
    if (form === null) return;
    if (editing.has(id)) form.removeAttribute("hidden");
    else form.setAttribute("hidden", "");
  }

  function applyEdits(): void {
    for (const id of editing) {
      editNode(id, "data-edit-form")?.removeAttribute("hidden");
    }
  }

  async function saveEdit(id: string): Promise<void> {
    if (pending || token === null || view === null || !isQuestionId(id)) return;
    const field = editNode(id, "data-edit-field");
    const text = field !== null && typeof field.value === "string" ? field.value : "";
    if (text.trim() === "") {
      error = EMPTY_ANSWER;
      paint();
      return;
    }
    pending = true;
    error = null;
    notice = null;
    try {
      const result = await postTurn("answer", token, { questionId: id, text }, env.fetch);
      if (!result.ok) {
        error = result.error;
        return;
      }
      view = result.session;
      editing.delete(id);
      error = null;
    } catch {
      error = DRAFT_KEPT;
    } finally {
      pending = false;
      paint();
    }
  }

  function editNode(id: string, attribute: "data-edit-form" | "data-edit-field"): DeskElement | null {
    const transcript = env.document.querySelector('[data-region="transcript"]');
    if (transcript === null) return null;
    return transcript.querySelector(`[${attribute}="${id}"]`);
  }
}

function applyMast(document: DeskDocument, compact: boolean, line: string): void {
  const full = document.querySelector("[data-mast-full]");
  const text = document.querySelector("[data-mast-line]");
  if (full === null || text === null) return;
  if ("textContent" in text) text.textContent = line;
  const header = document.querySelector(".hh-mast");
  if (compact) {
    full.setAttribute("hidden", "");
    text.removeAttribute("hidden");
    header?.setAttribute("data-mast", "line");
  } else {
    full.removeAttribute("hidden");
    text.setAttribute("hidden", "");
    header?.removeAttribute("data-mast");
  }
}

function isDraftTarget(start: DeskElement | null): boolean {
  return start !== null && start.getAttribute("id") === "hh-card-draft";
}

function filesFrom(list: ArrayLike<File> | undefined): File[] {
  if (list === undefined) return [];
  const out: File[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    if (file !== undefined) out.push(file);
  }
  return out;
}

function pastedImages(event: DeskEvent): File[] {
  const data = event.clipboardData;
  const out: File[] = [];
  const take = (file: File | null | undefined, mime: string): void => {
    if (file === null || file === undefined) return;
    const type = file.type !== "" ? file.type : mime;
    if (!type.startsWith("image/")) return;
    try {
      out.push(new File([file], pastedImageName(type, Date.now() + out.length), { type }));
    } catch {
      // Leave the clipboard alone when this runtime cannot rename a file.
    }
  };
  if (data?.files !== undefined) {
    for (let index = 0; index < data.files.length; index += 1) take(data.files[index], "");
  }
  if (out.length === 0 && data?.items !== undefined) {
    for (let index = 0; index < data.items.length; index += 1) {
      const item = data.items[index];
      if (item === undefined || !item.type.startsWith("image/")) continue;
      take(item.getAsFile?.() ?? null, item.type);
    }
  }
  return out;
}

function pasteText(event: DeskEvent): string | null {
  const data = event.clipboardData;
  if (data?.getData === undefined) return null;
  try {
    return data.getData("text/plain");
  } catch {
    return null;
  }
}

function objectUrl(file: File): string | undefined {
  if (!file.type.startsWith("image/")) return undefined;
  const create = globalThis.URL?.createObjectURL;
  if (typeof create !== "function") return undefined;
  try {
    // A detached createObjectURL throws Illegal invocation and drops the thumbnail.
    return create.call(globalThis.URL, file);
  } catch {
    return undefined;
  }
}

function revokePreview(url: string | undefined): void {
  if (url === undefined) return;
  const revoke = globalThis.URL?.revokeObjectURL;
  if (typeof revoke !== "function") return;
  try {
    revoke.call(globalThis.URL, url);
  } catch {
    // Already revoked, or this runtime has no object URLs.
  }
}

function droppedLinkParts(transfer: {
  types?: ArrayLike<string>;
  getData?: (type: string) => string;
}): string[] {
  if (transfer.getData === undefined) return [];
  const types: string[] = [];
  if (transfer.types !== undefined) {
    for (let index = 0; index < transfer.types.length; index += 1) {
      const item = transfer.types[index];
      if (item !== undefined) types.push(item);
    }
  }
  const read = (type: string): string => transfer.getData?.(type) ?? "";
  if (types.length === 0 || types.includes("text/uri-list")) {
    try {
      const parts = urisFromList(read("text/uri-list"));
      if (parts.length > 0) return parts;
    } catch {
      // text/plain is the fallback when the browser refuses uri-list.
    }
  }
  try {
    const plain = read("text/plain");
    if (textIsOnlyLinks(plain)) return linkTokens(plain);
  } catch {
    return [];
  }
  return [];
}

function firstAttachRow(payload: unknown): {
  ok: boolean;
  path: string;
  originalName: string;
  size: number;
  type: string;
  error: string;
} | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const files = (payload as { files?: unknown }).files;
  if (!Array.isArray(files) || files[0] === undefined) return null;
  const row = files[0];
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (record.ok === true) {
    if (typeof record.path !== "string" || record.path.includes("\\") || record.path.includes("..")) return null;
    return {
      ok: true,
      path: record.path,
      originalName: typeof record.originalName === "string" ? record.originalName : "",
      size: typeof record.size === "number" ? record.size : 0,
      type: typeof record.type === "string" ? record.type : "",
      error: "",
    };
  }
  return {
    ok: false,
    path: "",
    originalName: "",
    size: 0,
    type: "",
    error: typeof record.error === "string" ? record.error : "",
  };
}

function isTypingTarget(start: DeskElement | null): boolean {
  if (start === null) return false;
  if (start.getAttribute("id") === "hh-card-draft") return true;
  if (start.getAttribute("data-edit-field") !== null) return true;
  if (start.getAttribute("data-logo-file") !== null) return true;
  if (start.getAttribute("data-attach-url") !== null) return true;
  if (start.getAttribute("data-attach-file") !== null) return true;
  return false;
}

function isAttachControl(start: DeskElement | null): boolean {
  if (start === null) return false;
  return (
    start.getAttribute("data-attach-button") !== null ||
    start.getAttribute("data-attach-add") !== null ||
    start.getAttribute("data-attach-remove") !== null ||
    start.getAttribute("data-attach-retry") !== null ||
    start.getAttribute("data-attach-url") !== null ||
    start.getAttribute("data-attach-file") !== null ||
    start.getAttribute("data-attach-zone") !== null
  );
}

function letterChoice(key: string): "A" | "B" | "C" | "D" | null {
  if (key === "a" || key === "A") return "A";
  if (key === "b" || key === "B") return "B";
  if (key === "c" || key === "C") return "C";
  if (key === "d" || key === "D") return "D";
  return null;
}

function insideChoices(start: DeskElement | null): boolean {
  return insideAttribute(start, "data-choices");
}

function insideQuestion(start: DeskElement | null): boolean {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return false;
    if (node.getAttribute("data-region") === "question") return true;
    node = node.parentElement;
  }
  return false;
}

function insideAttribute(start: DeskElement | null, name: string): boolean {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return false;
    if (node.getAttribute(name) !== null) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Enter confirms the highlighted choice when focus is no longer on a radio.
 * Answer, Skip, the voice button, and the tour's own buttons keep their keys.
 */
function enterPicksSlippedChoice(start: DeskElement | null): boolean {
  if (start === null || insideChoices(start)) return false;
  if (isVoiceTarget(start)) return false;
  if (isAttachControl(start)) return false;
  const action = readAction(start);
  if (action === "answer" || action === "skip") return false;
  if (tourControl(start)) return false;
  if (insideQuestion(start) || insideAttribute(start, "data-tour")) return true;
  const tag = (start.tagName ?? "").toUpperCase();
  return tag === "BODY" || tag === "HTML";
}

function tourControl(start: DeskElement | null): boolean {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return false;
    const tag = (node.tagName ?? "").toUpperCase();
    if (
      tag === "BUTTON" ||
      tag === "A" ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "SUMMARY"
    ) {
      return insideAttribute(node, "data-tour");
    }
    if (node.getAttribute("data-tour") !== null) return false;
    node = node.parentElement;
  }
  return false;
}

/** Keep the article node when the question id did not change. */
function refillSameCard(region: DeskElement, html: string): boolean {
  const existing = region.querySelector("[data-question-id]");
  if (existing === null) return false;
  const openAt = html.indexOf("<article");
  if (openAt < 0) return false;
  const openEnd = html.indexOf(">", openAt);
  const closeAt = html.lastIndexOf("</article>");
  if (openEnd < 0 || closeAt < openEnd) return false;
  const open = html.slice(openAt, openEnd);
  const idMatch = /data-question-id="([^"]*)"/.exec(open);
  if (idMatch === null || decodeAttr(idMatch[1] ?? "") !== existing.getAttribute("data-question-id")) return false;
  existing.innerHTML = html.slice(openEnd + 1, closeAt);
  const push = /data-pushback="([^"]*)"/.exec(open);
  if (push !== null) existing.setAttribute("data-pushback", decodeAttr(push[1] ?? ""));
  else existing.removeAttribute("data-pushback");
  if (/aria-busy="true"/.test(open)) existing.setAttribute("aria-busy", "true");
  else existing.removeAttribute("aria-busy");
  return true;
}

function decodeAttr(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function ensureMotion(document: DeskDocument, questionId: string | undefined): void {
  if (questionId === undefined || !questionId.startsWith("DP-6.")) return;
  if (document.querySelector('script[src="/client/motion.js"]') !== null) return;
  const create = document.createElement;
  const parent = document.body;
  if (typeof create !== "function" || parent === undefined) return;
  // A detached createElement throws Illegal invocation and skips the answer post.
  const script = create.call(document, "script");
  script.setAttribute("type", "module");
  script.setAttribute("src", "/client/motion.js");
  parent.appendChild(script);
}

function holdButton(start: DeskElement | null): DeskElement | null {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && node !== undefined && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return null;
    if (node.getAttribute("data-voice") === "hold") return node;
    node = node.parentElement;
  }
  return null;
}

function isVoiceTarget(start: DeskElement | null): boolean {
  const button = holdButton(start);
  if (button === null) return false;
  return button.getAttribute("disabled") === null;
}

function piecesFrom(event: SpeechResultEventLike): TranscriptPiece[] {
  const pieces: TranscriptPiece[] = [];
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (result === undefined || result.length === 0) continue;
    pieces.push({ transcript: result[0]?.transcript ?? "", isFinal: result.isFinal });
  }
  return pieces;
}

function finalsFrom(event: SpeechResultEventLike): string {
  return mergeTranscript(piecesFrom(event)).finals;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace one whole-phrase occurrence. Null when the phrase is not in the draft. */
function replacePhrase(host: string, phrase: string, incoming: string): string | null {
  const needle = phrase.trim();
  const next = incoming.trim();
  if (needle === "" || next === "") return null;
  const match = new RegExp(`(^|\\s)${escapeRegExp(needle)}(?=\\s|$)`).exec(host);
  if (match === null) return null;
  const at = match.index + (match[1]?.length ?? 0);
  return `${host.slice(0, at)}${next}${host.slice(at + needle.length)}`;
}

/**
 * A late final edits the utterance that produced it.
 * It replaces that promoted interim in the current draft, or appends once.
 */
function placeLateFinal(current: string, contributed: string, pending: string, incoming: string): string {
  const next = incoming.trim();
  if (next === "") return current;
  const pendingText = pending.trim();
  if (pendingText !== "" && sameUtterance(pendingText, next)) {
    const replaced = replacePhrase(current, pendingText, next);
    if (replaced !== null) return replaced;
  }
  const heard = contributed.trim();
  if (heard !== "" && heard !== pendingText && sameUtterance(heard, next)) {
    const replaced = replacePhrase(current, heard, next);
    if (replaced !== null) return replaced;
  }
  if (replacePhrase(current, next, next) !== null) return current;
  return joinWords(current, next);
}

function sameUtterance(pending: string, incoming: string): boolean {
  const left = pending.trim();
  const right = incoming.trim();
  if (left === "" || right === "") return false;
  return left === right || right.startsWith(left) || left.startsWith(right);
}

/** Chrome's SpeechRecognition error codes, in words a person can act on. */
export function voiceMessage(code: string, started: boolean): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return VOICE_BLOCKED;
  }
  if (code === "no-speech") return started ? VOICE_SILENT : VOICE_RELEASE_EMPTY;
  if (code === "audio-capture") return VOICE_NO_MIC;
  if (code === "network") return VOICE_NETWORK;
  if (code === "aborted") return VOICE_RELEASE_EMPTY;
  return VOICE_FAILED;
}

function signature(session: SessionView): string {
  return `${session.question?.id ?? ""}|${session.pushback ?? ""}|${session.done ? "1" : "0"}`;
}

function readToken(document: DeskDocument): string | null {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const token = meta?.getAttribute("content") ?? "";
  return token.length === 0 ? null : token;
}

function readAction(start: DeskElement | null): "answer" | "suggest" | "skip" | null {
  const action = readMarked(start, "data-action");
  if (action === "answer" || action === "suggest" || action === "skip") return action;
  return null;
}

function readMarked(start: DeskElement | null, name: string): string | null {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return null;
    const value = node.getAttribute(name);
    if (value !== null && value !== "") return value;
    node = node.parentElement;
  }
  return null;
}

/** True when the attribute is present, including a boolean attribute with an empty value. */
function hasMark(start: DeskElement | null, name: string): boolean {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return false;
    if (node.getAttribute(name) !== null) return true;
    node = node.parentElement;
  }
  return false;
}

function isQuestionId(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function asQuestion(value: unknown): Question | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.ask !== "string" || typeof value.why !== "string") {
    return null;
  }
  const question: Question = {
    id: value.id,
    module: typeof value.module === "string" ? value.module : "",
    depth: stringList(value.depth).filter(isDepth),
    ask: value.ask,
    why: value.why,
    input: stringList(value.input).filter(isInput),
    skipDefault: typeof value.skipDefault === "string" ? value.skipDefault : "",
    writes: stringList(value.writes),
  };
  if (question.depth.length === 0) question.depth = ["deep"];
  if (question.input.length === 0) question.input = ["text"];
  if (typeof value.suggest === "string") question.suggest = value.suggest;
  const pushbackIf = stringList(value.pushbackIf);
  if (Array.isArray(value.pushbackIf)) question.pushbackIf = pushbackIf;
  const requiredFor = stringList(value.requiredFor);
  if (Array.isArray(value.requiredFor)) question.requiredFor = requiredFor;
  const followUps = asFollowUps(value.followUps);
  if (followUps !== null) question.followUps = followUps;
  const levels = asLevels(value.levels);
  if (levels !== null) question.levels = levels;
  const resources = asResources(value.resources);
  if (resources !== null) question.resources = resources;
  return question;
}

function asResources(value: unknown): NonNullable<Question["resources"]> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items: NonNullable<Question["resources"]> = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.label !== "string" || item.label.trim() === "") return null;
    if (typeof item.note !== "string" || item.note.trim() === "") return null;
    const resource: NonNullable<Question["resources"]>[number] = {
      label: item.label,
      note: item.note,
    };
    if (Object.hasOwn(item, "url")) {
      if (typeof item.url !== "string" || !isHttpsUrl(item.url)) return null;
      resource.url = item.url;
    }
    items.push(resource);
  }
  return items;
}

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname !== "";
  } catch {
    return false;
  }
}

function asFollowUps(value: unknown): Array<{ id: string; ask: string }> | null {
  if (!Array.isArray(value)) return null;
  const items: Array<{ id: string; ask: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.ask !== "string") return null;
    items.push({ id: item.id, ask: item.ask });
  }
  return items;
}

function asLevels(value: unknown): { beginner: LevelName; pro: LevelName } | null {
  if (!isRecord(value) || !isLevel(value.beginner) || !isLevel(value.pro)) return null;
  return { beginner: value.beginner, pro: value.pro };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    if (typeof item === "string") items.push(item);
  }
  return items;
}

function isDepth(value: string): value is DepthName {
  return (DEPTHS as readonly string[]).includes(value);
}

function isInput(value: string): value is InputName {
  return (INPUTS as readonly string[]).includes(value);
}

function isLevel(value: unknown): value is LevelName {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProjectKey(value: unknown): string {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : "";
}

function parseStoredDraft(value: unknown): { text: string; savedAt: string; step: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.text !== "string" || value.text.trim() === "") return null;
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
  if (typeof value.step !== "number" || !Number.isFinite(value.step)) return null;
  return { text: value.text, savedAt: value.savedAt, step: value.step };
}

function parseSavedFiles(value: unknown): SavedFileView[] {
  if (!Array.isArray(value)) return [];
  const files: SavedFileView[] = [];
  for (const item of value) {
    if (files.length >= 8 || !isRecord(item)) continue;
    if (typeof item.path !== "string" || typeof item.originalName !== "string") continue;
    if (typeof item.size !== "number" || !Number.isFinite(item.size) || item.size < 0) continue;
    if (typeof item.type !== "string") continue;
    const rel = item.path.replaceAll("\\", "/");
    if (!rel.startsWith(".hitchhiker/uploads/") || rel.includes("..")) continue;
    files.push({
      path: rel,
      originalName: item.originalName.slice(0, 120),
      size: item.size,
      type: item.type.slice(0, 120),
    });
  }
  return files;
}

/** The newer copy wins. A blank side is ignored. */
function newerDraft(
  local: DraftRecord | null,
  remote: { text: string; savedAt: string; step: number } | null,
): string | null {
  const localText = local !== null && local.text.trim() !== "" ? local : null;
  const remoteAt = remote === null ? Number.NaN : Date.parse(remote.savedAt);
  const remoteText = remote !== null && remote.text.trim() !== "" && !Number.isNaN(remoteAt) ? remote : null;
  if (localText === null) return remoteText === null ? null : remoteText.text;
  if (remoteText === null) return localText.text;
  return remoteAt > localText.savedAt ? remoteText.text : localText.text;
}

function parseChoices(value: unknown): CardChoiceSet | null {
  if (!isRecord(value)) return null;
  if (value.origin !== "model" && value.origin !== "fallback") return null;
  if (typeof value.forId !== "string" || value.forId.trim() === "") return null;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 4) return null;
  const ids = ["A", "B", "C", "D"] as const;
  const items: CardChoiceSet["items"] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index];
    const id = ids[index];
    if (!isRecord(item) || id === undefined || item.id !== id) return null;
    if (typeof item.label !== "string" || item.label.trim() === "") return null;
    if (typeof item.why !== "string" || typeof item.source !== "string") return null;
    items.push({ id, label: item.label, why: item.why, source: item.source });
  }
  return { forId: value.forId, origin: value.origin, items };
}

function parseCounts(value: unknown): CardCounts | null {
  if (!isRecord(value)) return null;
  const { index, total, phase, openRequired, mode, modeNote } = value;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1) return null;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1) return null;
  if (typeof phase !== "string" || phase.trim() === "") return null;
  if (typeof openRequired !== "number" || !Number.isInteger(openRequired) || openRequired < 0) return null;
  if (mode !== "express" && mode !== "standard" && mode !== "deep") return null;
  if (typeof modeNote !== "string" || modeNote.trim() === "") return null;
  return { index, total, phase, openRequired, mode, modeNote };
}

function parseAssumption(value: unknown): CardAssumption | null {
  if (!isRecord(value)) return null;
  if (typeof value.value !== "string" || value.value.trim() === "") return null;
  if (value.kind !== "suggested" && value.kind !== "skipped") return null;
  return { value: value.value, kind: value.kind };
}

function browserEnv(): DeskEnv | null {
  const root = globalThis as {
    document?: DeskDocument;
    EventSource?: new (url: string) => DeskSource;
    fetch?: typeof fetch;
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    navigator?: { language?: string };
  };
  const document = root.document;
  const Source = root.EventSource;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (typeof Source !== "function") return null;
  // A detached window.fetch throws in the browser. Call it as a method.
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  const Recognition = root.SpeechRecognition ?? root.webkitSpeechRecognition ?? null;
  const lang = root.navigator?.language ?? "en-US";
  return { document, EventSource: Source, fetch: boundFetch, SpeechRecognition: Recognition, lang };
}

const detected = browserEnv();
if (detected !== null) mountDesk(detected);
