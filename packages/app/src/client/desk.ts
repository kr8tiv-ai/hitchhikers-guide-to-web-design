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

  env.document.addEventListener("click", onClick);
  env.document.addEventListener("input", onInput);
  void load();

  return () => {
    env.document.removeEventListener("click", onClick);
    env.document.removeEventListener("input", onInput);
    source?.close();
  };

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
    pending = false;
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
  const script = create("script");
  script.setAttribute("type", "module");
  script.setAttribute("src", "/client/motion.js");
  parent.appendChild(script);
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
  };
  const document = root.document;
  const Source = root.EventSource;
  if (document === undefined || typeof document.querySelector !== "function") return null;
  if (typeof Source !== "function") return null;
  // A detached window.fetch throws in the browser. Call it as a method.
  const boundFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);
  return { document, EventSource: Source, fetch: boundFetch };
}

const detected = browserEnv();
if (detected !== null) mountDesk(detected);
