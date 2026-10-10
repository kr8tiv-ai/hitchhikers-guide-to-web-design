import type { Question } from "@hitchhiker/engine";
import type { CardAssumption, CardCounts, CardState } from "../card.ts";
import { escapeHtml, renderCard, VOICE_SERVICE_NOTE } from "../card.ts";

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

/**
 * Hold to talk. Chrome and Edge speech recognition fills the draft while the
 * button is held. Nothing is submitted: the person still presses Answer.
 * This desk does not store the audio and does not send it to hh app.
 * Chrome's Web Speech API sends the microphone audio to Google's speech service.
 */
/** Chrome can drop onend when stop() runs before onstart. Finish the hold anyway. */
const VOICE_STOP_GRACE_MS = 400;
export const VOICE_LISTENING = "Listening. Speak, then let go of the button.";
export const VOICE_HEARD = "Heard you. Check the words, then press Answer.";
export const VOICE_UNSUPPORTED =
  "Voice input needs Chrome or Edge on this computer. Type your answer instead.";
export const VOICE_BLOCKED =
  "The microphone is blocked. Click the icon at the left of the address bar, allow the microphone, then hold the button again.";
export const VOICE_FIRST_ALLOW =
  "If Chrome asks to use the microphone, press Allow. Then hold the button while you speak.";
/** A release with no words. Not the microphone permission sentence. */
export const VOICE_RELEASE_EMPTY = "Hold the button while you speak.";
export const VOICE_SILENT = "Nothing was heard. Hold the button while you speak, then let go.";
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
  setPointerCapture?(pointerId: number): void;
  insertAdjacentHTML?(position: "beforebegin" | "afterbegin" | "beforeend" | "afterend", html: string): void;
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
}

interface DeskParent {
  appendChild(node: DeskElement): void;
}

interface DeskDocument {
  querySelector(selector: string): DeskElement | null;
  addEventListener(type: string, listener: (event: DeskEvent) => void): void;
  removeEventListener(type: string, listener: (event: DeskEvent) => void): void;
  createElement?(tag: string): DeskElement;
  body?: DeskParent;
}

interface DeskMessage {
  data: string;
}

interface DeskSource {
  addEventListener(type: "session", listener: (event: DeskMessage) => void): void;
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
  };
}

export async function postTurn(
  action: "answer" | "suggest" | "skip",
  token: string,
  input: TurnInput,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; session: SessionView } | { ok: false; error: string }> {
  const body: { questionId: string; text?: string } = { questionId: input.questionId };
  if (input.text !== undefined) body.text = input.text;
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
  let ready = false;
  let source: DeskSource | null = null;
  let notice: string | null = null;
  let streamFailures = 0;
  let connection: string | null = null;
  let listening = false;
  let held = false;
  let voiceSession = false;
  let voiceDisclosed = false;
  let restartQueued = false;
  let recognition: SpeechRecognitionLike | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let heardStart = false;
  let voiceBase = "";
  let voiceFinal = "";
  let voiceInterim = "";
  let voiceError: string | null = null;
  let skipConfirm = false;
  const editing = new Set<string>();

  const onClick = (event: DeskEvent): void => {
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
    const action = readAction(event.target);
    if (action === null) return;
    event.preventDefault();
    void submit(action);
  };
  const onInput = (event: DeskEvent): void => {
    const target = event.target;
    if (target === null || target.getAttribute("id") !== "hh-card-draft") return;
    draft = target.value ?? "";
    if (skipConfirm) {
      skipConfirm = false;
      const note = region()?.querySelector("[data-skip-confirm]");
      if (note !== null && note !== undefined && "textContent" in note) note.textContent = "";
    }
    const button = region()?.querySelector('[data-action="answer"]');
    if (button === null || button === undefined) return;
    const locked = pending || draft.trim() === "";
    button.disabled = locked;
    if (locked) button.setAttribute("disabled", "");
    else button.removeAttribute("disabled");
  };

  const onPointerDown = (event: DeskEvent): void => {
    if (!isVoiceTarget(event.target)) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const button = holdButton(event.target);
    if (button !== null) capturePointer(event, button);
    if (held || recognition !== null) return;
    held = true;
    startVoice();
  };
  const onPointerUp = (): void => {
    if (!held) return;
    held = false;
    stopVoice();
  };
  const onKeyDown = (event: DeskEvent): void => {
    if (isDraftTarget(event.target) && event.key === "Enter") {
      // Shift+Enter is a newline. An open IME composition is not a submit.
      if (event.shiftKey === true || event.isComposing === true) return;
      event.preventDefault();
      void submit("answer");
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    if (!isVoiceTarget(event.target)) return;
    event.preventDefault();
    if (event.repeat === true || held || recognition !== null) return;
    held = true;
    startVoice();
  };
  const onKeyUp = (event: DeskEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!held && recognition === null) return;
    event.preventDefault();
    held = false;
    stopVoice();
  };
  const onContextMenu = (event: DeskEvent): void => {
    // A long press on a phone opens a menu. The hold is the gesture here.
    if (isVoiceTarget(event.target)) event.preventDefault();
  };

  env.document.addEventListener("click", onClick);
  env.document.addEventListener("input", onInput);
  env.document.addEventListener("pointerdown", onPointerDown);
  env.document.addEventListener("pointerup", onPointerUp);
  env.document.addEventListener("pointercancel", onPointerUp);
  env.document.addEventListener("keydown", onKeyDown);
  env.document.addEventListener("keyup", onKeyUp);
  env.document.addEventListener("contextmenu", onContextMenu);
  void load();

  return () => {
    env.document.removeEventListener("click", onClick);
    env.document.removeEventListener("input", onInput);
    env.document.removeEventListener("pointerdown", onPointerDown);
    env.document.removeEventListener("pointerup", onPointerUp);
    env.document.removeEventListener("pointercancel", onPointerUp);
    env.document.removeEventListener("keydown", onKeyDown);
    env.document.removeEventListener("keyup", onKeyUp);
    env.document.removeEventListener("contextmenu", onContextMenu);
    cancelVoice();
    source?.close();
  };

  function readDraft(): void {
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.value === "string") draft = field.value;
  }

  function startVoice(): void {
    if (recognition !== null || voiceSession || !held) return;
    if (pending || view === null || view.question === null) {
      held = false;
      return;
    }
    const Recognition = env.SpeechRecognition ?? null;
    if (Recognition === null) {
      held = false;
      notice = null;
      error = VOICE_UNSUPPORTED;
      paint();
      return;
    }
    readDraft();
    voiceBase = draft.trim();
    voiceFinal = "";
    voiceInterim = "";
    voiceError = null;
    heardStart = false;
    voiceSession = true;
    listening = true;
    error = null;
    notice = VOICE_LISTENING;
    voiceDisclosed = true;
    if (!patchListening()) paint();
    beginRecognition();
    if (recognition === null && !restartQueued) commitVoice();
  }

  function beginRecognition(): "started" | "idle" {
    if (recognition !== null || !held || !voiceSession) return "idle";
    const Recognition = env.SpeechRecognition ?? null;
    if (Recognition === null) {
      voiceError = VOICE_UNSUPPORTED;
      return "idle";
    }
    if (voiceInterim !== "") {
      voiceFinal = joinWords(voiceFinal, voiceInterim);
      voiceInterim = "";
      draft = joinWords(voiceBase, voiceFinal);
      patchDraft();
    }
    let rec: SpeechRecognitionLike;
    try {
      rec = new Recognition();
      rec.lang = env.lang ?? "en-US";
      rec.continuous = true;
      rec.interimResults = true;
    } catch {
      voiceError = VOICE_UNSUPPORTED;
      return "idle";
    }
    rec.onstart = () => {
      heardStart = true;
    };
    rec.onresult = (event) => {
      applyResult(event);
    };
    rec.onerror = (event) => {
      // aborted is our own grace timer. no-speech is Chrome ending a pause.
      if (event.error === "aborted" || event.error === "no-speech") return;
      voiceError = voiceMessage(event.error, heardStart);
    };
    rec.onend = () => {
      endRecognition(rec);
    };
    recognition = rec;
    try {
      rec.start();
    } catch {
      voiceError = VOICE_FAILED;
      recognition = null;
      unhook(rec);
      return "idle";
    }
    return recognition === rec ? "started" : "idle";
  }

  function applyResult(event: SpeechResultEventLike): void {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result === undefined || result.length === 0) continue;
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) voiceFinal = joinWords(voiceFinal, text);
      else interim = joinWords(interim, text);
    }
    voiceInterim = interim;
    draft = joinWords(voiceBase, joinWords(voiceFinal, voiceInterim));
    if (!patchDraft()) paint();
  }

  function stopVoice(): void {
    held = false;
    const rec = recognition;
    if (rec === null) return;
    try {
      rec.stop();
    } catch {
      endRecognition(rec);
      return;
    }
    if (recognition === rec) armStopGrace(rec);
  }

  function endRecognition(rec: SpeechRecognitionLike): void {
    clearStopTimer();
    if (recognition !== rec) return;
    recognition = null;
    unhook(rec);
    if (!voiceSession) return;
    if (held && voiceError === null) {
      queueRestart();
      return;
    }
    commitVoice();
  }

  function queueRestart(): void {
    if (restartQueued) return;
    restartQueued = true;
    queueMicrotask(() => {
      restartQueued = false;
      if (!voiceSession || recognition !== null) return;
      if (held && voiceError === null && beginRecognition() === "started") return;
      commitVoice();
    });
  }

  function armStopGrace(rec: SpeechRecognitionLike): void {
    clearStopTimer();
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (recognition !== rec) return;
      try {
        rec.abort();
      } catch {
        // abort throws once the recognizer has already ended.
      }
      if (recognition === rec) endRecognition(rec);
    }, VOICE_STOP_GRACE_MS);
  }

  function clearStopTimer(): void {
    if (stopTimer === null) return;
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  function unhook(rec: SpeechRecognitionLike): void {
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
  }

  function commitVoice(): void {
    if (!voiceSession) return;
    voiceSession = false;
    restartQueued = false;
    listening = false;
    held = false;
    clearStopTimer();
    const heard = joinWords(voiceFinal, voiceInterim);
    if (heard !== "") {
      draft = joinWords(voiceBase, heard);
      error = null;
      notice = VOICE_HEARD;
    } else {
      draft = voiceBase;
      notice = null;
      error = voiceError ?? VOICE_RELEASE_EMPTY;
    }
    paint();
  }

  function cancelVoice(): void {
    voiceSession = false;
    restartQueued = false;
    held = false;
    listening = false;
    clearStopTimer();
    const rec = recognition;
    if (rec === null) return;
    recognition = null;
    unhook(rec);
    try {
      rec.abort();
    } catch {
      // Already ended.
    }
  }

  function patchListening(): boolean {
    const question = region();
    if (question === null) return false;
    const button = question.querySelector('[data-voice="hold"]');
    if (button === null || !("textContent" in button)) return false;
    button.textContent = "Listening. Release to stop";
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
    if (notice !== null && !patchNotice(question, notice)) return false;
    return true;
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
    view = session;
    if (typedValue.trim() !== "" && session.question !== null && session.question.id === existingId) {
      draft = typedValue;
    }
    error = null;
    paint();
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
    if (signature(session) === signature(view)) return;
    view = session;
    draft = "";
    error = null;
    notice = null;
    pending = false;
    skipConfirm = false;
    cancelVoice();
    paint();
  }

  async function submit(action: "answer" | "suggest" | "skip"): Promise<void> {
    if (pending || token === null || view === null || view.question === null) return;
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.value === "string") draft = field.value;
    if (action === "answer" && draft.trim() === "") {
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
    try {
      paint();
      const result = await postTurn(
        action,
        token,
        action === "answer" ? { questionId, text: draft } : { questionId },
        env.fetch,
      );
      if (!result.ok) {
        error = result.error;
        return;
      }
      view = result.session;
      draft = "";
      error = null;
    } catch {
      error = DRAFT_KEPT;
    } finally {
      pending = false;
      paint();
    }
  }

  function paint(): void {
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
        ...(voiceDisclosed ? { voiceNote: true } : {}),
      };
      question.innerHTML = renderCard(state);
    } else if (question !== null && error !== null) {
      question.innerHTML = `<p class="hh-error" role="alert">${escapeHtml(error)}</p>`;
    }
    const map = env.document.querySelector('[data-region="map"]');
    if (map !== null && view !== null) map.innerHTML = view.mapHtml;
    const transcript = env.document.querySelector('[data-region="transcript"]');
    if (transcript !== null && view !== null) transcript.innerHTML = view.transcriptHtml;
    const status = env.document.querySelector('[data-region="status"]');
    if (status !== null && (view !== null || connection !== null)) {
      const base = view?.statusHtml ?? "";
      status.innerHTML = connection === null ? base : `<span>${escapeHtml(connection)}</span>${base}`;
    }
    if (view !== null) applyMast(env.document, view.mastCompact, view.mastLine);
    applyEdits();
    ensureMotion(env.document, view?.question?.id);
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

function capturePointer(event: DeskEvent, button: DeskElement): void {
  if (typeof button.setPointerCapture !== "function") return;
  if (typeof event.pointerId !== "number") return;
  try {
    button.setPointerCapture(event.pointerId);
  } catch {
    // The document pointerup listener still stops the hold.
  }
}

function joinWords(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (a === "") return b;
  if (b === "") return a;
  return `${a} ${b}`;
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
