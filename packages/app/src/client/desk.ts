import type { Question } from "@hitchhiker/engine";
import type { CardState } from "../card.ts";
import { escapeHtml, renderCard } from "../card.ts";

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
const SAVE_FAILED = "The answer did not save. Try again, or skip.";
const EMPTY_ANSWER = "Write an answer or skip.";
const LOAD_FAILED = "The desk could not load the session.";

/**
 * Hold to talk. The browser's own speech recognition (Chrome and Edge) fills
 * the draft while the button is held. Nothing is submitted: the person still
 * presses Answer. No API key, no paid call, nothing stored on the server.
 */
export const VOICE_LISTENING = "Listening. Speak, then let go of the button.";
export const VOICE_HEARD = "Heard you. Check the words, then press Answer.";
export const VOICE_UNSUPPORTED =
  "Voice input needs Chrome or Edge on this computer. Type your answer instead.";
export const VOICE_BLOCKED =
  "The microphone is blocked. Click the icon at the left of the address bar, allow the microphone, then hold the button again.";
export const VOICE_FIRST_ALLOW =
  "If Chrome asks to use the microphone, press Allow. Then hold the button while you speak.";
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
}

interface DeskEvent {
  target: DeskElement | null;
  preventDefault(): void;
  key?: string;
  repeat?: boolean;
  button?: number;
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
    return { ok: false, error: SAVE_FAILED };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : SAVE_FAILED;
    return { ok: false, error: message };
  }
  const session = isRecord(payload) ? parseSession(payload.session) : null;
  if (session === null) return { ok: false, error: SAVE_FAILED };
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
  let listening = false;
  let recognition: SpeechRecognitionLike | null = null;
  let heardStart = false;
  let voiceBase = "";
  let voiceFinal = "";
  let voiceInterim = "";
  let voiceError: string | null = null;

  const onClick = (event: DeskEvent): void => {
    const action = readAction(event.target);
    if (action === null) return;
    event.preventDefault();
    void submit(action);
  };
  const onInput = (event: DeskEvent): void => {
    const target = event.target;
    if (target === null || target.getAttribute("id") !== "hh-card-draft") return;
    draft = target.value ?? "";
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
    startVoice();
  };
  const onPointerUp = (): void => {
    if (listening) stopVoice();
  };
  const onKeyDown = (event: DeskEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!isVoiceTarget(event.target)) return;
    event.preventDefault();
    if (event.repeat === true || listening) return;
    startVoice();
  };
  const onKeyUp = (event: DeskEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!listening) return;
    event.preventDefault();
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
    recognition?.abort();
    source?.close();
  };

  function readDraft(): void {
    const field = region()?.querySelector("#hh-card-draft");
    if (field !== null && field !== undefined && typeof field.value === "string") draft = field.value;
  }

  function startVoice(): void {
    if (listening || recognition !== null) return;
    if (pending || view === null || view.question === null) return;
    const Recognition = env.SpeechRecognition ?? null;
    if (Recognition === null) {
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
    let rec: SpeechRecognitionLike;
    try {
      rec = new Recognition();
      rec.lang = env.lang ?? "en-US";
      rec.continuous = true;
      rec.interimResults = true;
    } catch {
      error = VOICE_UNSUPPORTED;
      paint();
      return;
    }
    rec.onstart = () => {
      heardStart = true;
    };
    rec.onresult = (event) => {
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
      paint();
    };
    rec.onerror = (event) => {
      voiceError = voiceMessage(event.error, heardStart);
    };
    rec.onend = () => {
      finishVoice(rec);
    };
    recognition = rec;
    listening = true;
    error = null;
    notice = VOICE_LISTENING;
    paint();
    try {
      rec.start();
    } catch {
      voiceError = VOICE_FAILED;
      finishVoice(rec);
    }
  }

  function stopVoice(): void {
    listening = false;
    const rec = recognition;
    if (rec === null) return;
    if (!heardStart && voiceError === null) voiceError = VOICE_FIRST_ALLOW;
    paint();
    try {
      rec.stop();
    } catch {
      finishVoice(rec);
    }
  }

  function finishVoice(rec: SpeechRecognitionLike): void {
    if (recognition !== rec) return;
    recognition = null;
    listening = false;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    const heard = joinWords(voiceFinal, voiceInterim);
    if (heard !== "") {
      draft = joinWords(voiceBase, heard);
      error = null;
      notice = VOICE_HEARD;
    } else {
      draft = voiceBase === "" ? draft : voiceBase;
      notice = null;
      error = voiceError ?? VOICE_SILENT;
    }
    paint();
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
      applyStream(event.data);
    });
    source.addEventListener("error", () => {
      // The browser retries. A dropped stream is not a failed answer.
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
    if (recognition !== null) {
      const rec = recognition;
      recognition = null;
      listening = false;
      rec.abort();
    }
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
    const questionId = view.question.id;
    pending = true;
    error = null;
    notice = null;
    paint();
    const result = await postTurn(
      action,
      token,
      action === "answer" ? { questionId, text: draft } : { questionId },
      env.fetch,
    );
    pending = false;
    if (!result.ok) {
      error = result.error;
      paint();
      return;
    }
    view = result.session;
    draft = "";
    error = null;
    paint();
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
    if (status !== null && view !== null) status.innerHTML = view.statusHtml;
    ensureMotion(env.document, view?.question?.id);
  }
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

function isVoiceTarget(start: DeskElement | null): boolean {
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && node !== undefined && !seen.has(node)) {
    seen.add(node);
    if (typeof node.getAttribute !== "function") return false;
    if (node.getAttribute("data-voice") === "hold") return node.getAttribute("disabled") === null;
    node = node.parentElement;
  }
  return false;
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
  if (code === "no-speech") return VOICE_SILENT;
  if (code === "audio-capture") return VOICE_NO_MIC;
  if (code === "network") return VOICE_NETWORK;
  if (code === "aborted") return started ? VOICE_SILENT : VOICE_FIRST_ALLOW;
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
  let node = start;
  const seen = new Set<DeskElement>();
  while (node !== null && !seen.has(node)) {
    seen.add(node);
    const action = node.getAttribute("data-action");
    if (action === "answer" || action === "suggest" || action === "skip") return action;
    node = node.parentElement;
  }
  return null;
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
  return question;
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
