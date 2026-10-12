import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mountDesk,
  VOICE_BLOCKED,
  VOICE_FIRST_ALLOW,
  VOICE_HEARD,
  VOICE_LISTENING,
  VOICE_RELEASE_EMPTY,
  VOICE_RESTART_BASE_MS,
  VOICE_SILENT,
  VOICE_STOP_WAIT_MS,
  VOICE_UNSUPPORTED,
  readVoiceInvariant,
  resetVoiceInvariant,
  voiceMessage,
  type DeskEnv,
  type SpeechRecognitionLike,
  type SpeechResultEventLike,
} from "../src/client/desk.ts";
import { DRAFT_DEBOUNCE_MS, draftStorageKey, type DraftStorage } from "../src/client/draft-store.ts";

/**
 * Click to talk on the desk. These tests drive the document listeners with a
 * fake SpeechRecognition: click, speak, click again, and the draft keeps the words.
 */

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
  key?: string;
  repeat?: boolean;
  button?: number;
  pointerId?: number;
}

interface FakeEl {
  innerHTML: string;
  value?: string;
  parentElement: FakeEl | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
  textContent?: string | null;
  setPointerCapture?(pointerId: number): void;
  insertAdjacentHTML?(position: string, html: string): void;
  innerHTMLWrites?: number;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  return {
    innerHTML: "",
    parentElement: null,
    getAttribute(name) {
      return store.has(name) ? (store.get(name) ?? "") : null;
    },
    setAttribute(name, value) {
      store.set(name, value);
    },
    removeAttribute(name) {
      store.delete(name);
    },
    querySelector() {
      return null;
    },
  };
}

/** How Chrome delivers events after stop(). `manual` leaves the test in charge. */
type StopOrder = "manual" | "final-then-end" | "end-then-final" | "final-only" | "end-only";

class FakeRecognition implements SpeechRecognitionLike {
  static last: FakeRecognition | null = null;
  static all: FakeRecognition[] = [];
  /** Chosen order for the next stop(). Default keeps the older tests in charge of events. */
  static stopOrder: StopOrder = "manual";
  /** Final transcript stop() delivers when the order is not manual or end-only. */
  static pendingFinal = "";
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRecognition.last = this;
    FakeRecognition.all.push(this);
  }
  start(): void {
    this.started = true;
  }
  /**
   * Chrome calls stop(), then the final result, then onend — or the reverse.
   * The final is queued so it runs after finishStop is already waiting, which
   * is the order that leaves onend unhooked when the final wins the race.
   */
  stop(): void {
    this.stopped = true;
    const order = FakeRecognition.stopOrder;
    const text = FakeRecognition.pendingFinal;
    if (order === "manual") return;
    const deliverFinal = (): void => {
      if (text === "") return;
      this.say(text, true);
    };
    if (order === "final-then-end" || order === "final-only") {
      queueMicrotask(() => {
        deliverFinal();
        if (order === "final-then-end") queueMicrotask(() => {
          this.onend?.();
        });
      });
      return;
    }
    if (order === "end-then-final") {
      queueMicrotask(() => {
        this.onend?.();
        queueMicrotask(() => {
          deliverFinal();
        });
      });
      return;
    }
    queueMicrotask(() => {
      this.onend?.();
    });
  }
  abort(): void {
    this.aborted = true;
    this.onend?.();
  }
  say(text: string, isFinal: boolean): void {
    this.hear([{ text, final: isFinal }]);
  }
  /** Whole results list, including a Chrome resend that sets resultIndex back to 0. */
  hear(pieces: { text: string; final: boolean }[], resultIndex = 0): void {
    const results = pieces.map((piece) => Object.assign([{ transcript: piece.text }], { isFinal: piece.final }));
    this.onresult?.({ resultIndex, results });
  }
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function renderedDraft(html: string): string {
  const match = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(html);
  return match?.[1] === undefined ? "" : decodeEntities(match[1]);
}

function memoryStorage(): DraftStorage {
  const keys: string[] = [];
  const values = new Map<string, string>();
  return {
    get length() {
      return keys.length;
    },
    key(index) {
      return keys[index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (!values.has(key)) keys.push(key);
      values.set(key, value);
    },
    removeItem(key) {
      if (!values.has(key)) return;
      values.delete(key);
      const at = keys.indexOf(key);
      if (at >= 0) keys.splice(at, 1);
    },
  };
}

function harness(Recognition: DeskEnv["SpeechRecognition"], options?: { storage?: DraftStorage; projectKey?: string }) {
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  let inputBinds = 0;
  const windowListeners = new Map<string, Set<() => void>>();
  const region = element({ "data-region": "question" });
  // Paint replaces the article. The live textarea value has to follow that HTML,
  // or the next readDraft() still sees the empty field from before the paint.
  let regionHtml = "";
  Object.defineProperty(region, "innerHTML", {
    configurable: true,
    get() {
      return regionHtml;
    },
    set(value: string) {
      regionHtml = value;
      const match = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(value);
      if (match?.[1] !== undefined) field.value = decodeEntities(match[1]);
    },
  });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const listeners = new Map<string, Listener>();
  let sessionListener: ((event?: { data?: string }) => void) | null = null;
  let errorListener: (() => void) | null = null;
  const posts: { url: string; body: string }[] = [];
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return region;
      return null;
    },
    addEventListener(type: string, listener: Listener) {
      if (type === "input") inputBinds += 1;
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  };
  if (options?.storage !== undefined) {
    Object.assign(doc, {
      defaultView: {
        localStorage: options.storage,
        addEventListener(type: string, listener: () => void) {
          const set = windowListeners.get(type) ?? new Set<() => void>();
          set.add(listener);
          windowListeners.set(type, set);
        },
        removeEventListener(type: string, listener: () => void) {
          windowListeners.get(type)?.delete(listener);
        },
      },
    });
  }
  const env: DeskEnv = {
    document: doc,
    EventSource: class {
      addEventListener(type: string, listener: (event?: { data?: string }) => void): void {
        if (type === "session") sessionListener = listener;
        if (type === "error") errorListener = listener as () => void;
      }
      close(): void {}
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/answer") || url.includes("/api/skip") || url.includes("/api/suggest")) {
        posts.push({ url, body: typeof init?.body === "string" ? init.body : "" });
        return Response.json({
          session: {
            question: null,
            pushback: null,
            done: true,
            mapHtml: "",
            transcriptHtml: "",
            statusHtml: "",
          },
        });
      }
      const session: {
        question: {
          id: string;
          module: string;
          depth: string[];
          ask: string;
          why: string;
          input: string[];
          skipDefault: string;
          writes: string[];
        };
        pushback: null;
        done: false;
        mapHtml: string;
        transcriptHtml: string;
        statusHtml: string;
        projectKey?: string;
      } = {
        question: {
          id: "DP-1.2",
          module: "towel-check",
          depth: ["deep"],
          ask: "What does the shop sell?",
          why: "The desk needs an answer.",
          input: ["text", "voice"],
          skipDefault: "Tea.",
          writes: ["SITE-BRIEF.md#offer"],
        },
        pushback: null,
        done: false,
        mapHtml: "",
        transcriptHtml: "",
        statusHtml: "",
      };
      if (options?.projectKey !== undefined && options.projectKey !== "") session.projectKey = options.projectKey;
      return Response.json(session);
    },
    SpeechRecognition: Recognition,
    lang: "en-CA",
  };
  const fire = (type: string, event: Partial<FakeEvent> = {}): void => {
    listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
  };
  const emitSession = (data: string): void => {
    sessionListener?.({ data });
  };
  const fireError = (): void => {
    errorListener?.();
  };
  const firePageShow = (): void => {
    for (const listener of windowListeners.get("pageshow") ?? []) listener();
  };
  return { env, region, field, fire, listeners, emitSession, posts, fireError, inputBinds: () => inputBinds, firePageShow };
}

const talk = (): FakeEl => element({ "data-voice": "hold" });

test("clicking the talk button listens, fills the draft, and does not submit", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.equal(h.listeners.has("click"), true);
    assert.equal(h.listeners.has("pointerdown"), false);
    assert.equal(h.listeners.has("pointercancel"), false);
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    assert.equal(rec.started, true);
    assert.equal(rec.continuous, true);
    assert.equal(rec.lang, "en-CA");
    assert.equal(rec.interimResults, true);
    assert.match(h.region.innerHTML, /Stop listening/);
    assert.match(h.region.innerHTML, /data-voice-pulse/);
    assert.match(h.region.innerHTML, /aria-pressed="true"/);
    assert.match(h.region.innerHTML, new RegExp(VOICE_LISTENING.replaceAll(".", "\\.")));
    rec.onstart?.();
    rec.say("A tea shop", false);
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>A tea shop<\/textarea>/);
    rec.say("A tea shop on the corner", true);
    h.fire("click", { target: talk() });
    assert.equal(rec.stopped, true);
    assert.equal(rec.aborted, false);
    rec.onend?.();
    await settle();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>A tea shop on the corner<\/textarea>/);
    assert.match(h.region.innerHTML, />Click to talk</);
    assert.match(h.region.innerHTML, /aria-pressed="false"/);
    assert.ok(h.region.innerHTML.includes(VOICE_HEARD));
  } finally {
    stop();
  }
});

test("space and enter on the focused button toggle, and a repeat or keyup does not", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("keydown", { target: talk(), key: " " });
    const rec = FakeRecognition.last;
    assert.ok(rec?.started);
    rec.onstart?.();
    rec.say("Loose leaf", true);
    h.fire("keyup", { key: " " });
    assert.equal(rec.stopped, false);
    h.fire("keydown", { target: talk(), key: " ", repeat: true });
    assert.equal(rec.stopped, false);
    assert.equal(FakeRecognition.all.length, 1);
    h.fire("keydown", { target: talk(), key: " " });
    assert.equal(rec.stopped, true);
    rec.onend?.();
    await settle();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>Loose leaf<\/textarea>/);

    h.fire("keydown", { target: talk(), key: "Enter" });
    const again = FakeRecognition.last;
    assert.ok(again);
    assert.notEqual(again, rec);
    assert.equal(again.started, true);
    h.fire("keyup", { key: "Enter" });
    assert.equal(again.stopped, false);
    h.fire("keydown", { target: talk(), key: "Enter", repeat: true });
    assert.equal(again.stopped, false);
    h.fire("keydown", { target: talk(), key: "Enter" });
    assert.equal(again.stopped, true);
    again.onend?.();
  } finally {
    stop();
  }
});

test("a blocked microphone shows an inline alert instead of failing silently", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onerror?.({ error: "not-allowed" });
    rec.onend?.();
    assert.match(h.region.innerHTML, /role="alert"/);
    assert.ok(h.region.innerHTML.includes("The microphone is blocked."));
    assert.match(h.region.innerHTML, />Click to talk</);
    assert.match(h.region.innerHTML, /aria-pressed="false"/);
    assert.equal(VOICE_BLOCKED.includes("!"), false);
    assert.equal(rec.aborted, false);
  } finally {
    stop();
  }
});

test("a browser without speech recognition says so on the card", async () => {
  const h = harness(null);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    assert.match(h.region.innerHTML, /role="alert"/);
    assert.ok(h.region.innerHTML.includes(VOICE_UNSUPPORTED.split(".")[0] ?? ""));
    assert.equal(h.region.innerHTML.includes("speech service"), false);
  } finally {
    stop();
  }
});

test("a stop with nothing heard asks for another click, not for the microphone", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assert.match(h.region.innerHTML, new RegExp(VOICE_RELEASE_EMPTY.replaceAll(".", "\\.")));
    assert.equal(h.region.innerHTML.includes(VOICE_FIRST_ALLOW), false);
    assert.equal(h.region.innerHTML.includes("allow the microphone"), false);
    assert.equal(rec.aborted, false);
  } finally {
    stop();
  }
});

test("stop before onstart finishes when onend never fires", async () => {
  class SilentStop extends FakeRecognition {
    override stop(): void {
      this.stopped = true;
    }
    override abort(): void {
      this.aborted = true;
    }
  }
  const h = harness(SilentStop);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    h.fire("click", { target: talk() });
    assert.equal(rec.stopped, true);
    assert.equal(rec.aborted, false);
    const deadline = Date.now() + VOICE_STOP_WAIT_MS + 800;
    while (!rec.aborted && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(rec.aborted, true);
    assert.match(h.region.innerHTML, />Click to talk</);
    assert.match(h.region.innerHTML, new RegExp(VOICE_RELEASE_EMPTY.replaceAll(".", "\\.")));
    assert.equal(h.region.innerHTML.includes(VOICE_FIRST_ALLOW), false);
    h.fire("click", { target: talk(), button: 0 });
    assert.equal(FakeRecognition.all.length, 2);
    assert.equal(FakeRecognition.last?.started, true);
  } finally {
    stop();
  }
});

test("a click outside the button does not stop, and a disabled button never starts", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.last = null;
    const disabled = element({ "data-voice": "hold", disabled: "" });
    h.fire("click", { target: disabled, button: 0, pointerId: 4 });
    assert.equal(FakeRecognition.last, null);

    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("From outside", true);
    h.fire("click", { target: element() });
    assert.equal(rec.stopped, false);
    h.fire("pointercancel", { target: talk() });
    assert.equal(rec.stopped, false);
    h.fire("click", { target: talk() });
    assert.equal(rec.stopped, true);
    assert.equal(rec.aborted, false);
    rec.onend?.();
    await settle();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>From outside<\/textarea>/);
  } finally {
    stop();
  }
});

test("a click starts listening without pointer capture", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    const button = talk();
    const ids: number[] = [];
    button.setPointerCapture = (id) => {
      ids.push(id);
    };
    h.fire("click", { target: button, button: 0, pointerId: 7 });
    assert.deepEqual(ids, []);
    assert.equal(FakeRecognition.last?.started, true);
    h.fire("click", { target: button });
    FakeRecognition.last?.onend?.();

    const shaky = talk();
    shaky.setPointerCapture = () => {
      throw new Error("pointer is gone");
    };
    h.fire("click", { target: shaky, button: 0, pointerId: 8 });
    assert.equal(FakeRecognition.last?.started, true);
    assert.deepEqual(ids, []);
  } finally {
    stop();
  }
});

test("a partial result updates the field in place and keeps the same button", async () => {
  const h = liveHarness();
  const stop = mountDesk(h.env);
  try {
    await settle();
    const writes = h.writes();
    h.fire("click", { target: h.button, button: 0, pointerId: 2 });
    assert.equal(h.writes(), writes);
    assert.match(h.button.innerHTML, /Stop listening/);
    assert.match(h.button.innerHTML, /data-voice-pulse/);
    assert.equal(h.button.getAttribute("aria-pressed"), "true");
    assert.equal(h.notice?.textContent, VOICE_LISTENING);
    assert.match(h.note?.textContent ?? "", /Chrome sends this audio to its speech service/);
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("partial tea", false);
    assert.equal(h.writes(), writes);
    assert.equal(h.field.value, "partial tea");
    assert.match(h.button.innerHTML, /Stop listening/);
    rec.say("partial tea shop", true);
    h.fire("click", { target: h.button });
    assert.equal(rec.aborted, false);
    rec.onend?.();
    await settle();
    assert.match(h.region.innerHTML, /partial tea shop/);
    assert.ok(h.region.innerHTML.includes(VOICE_HEARD));
    assert.match(h.region.innerHTML, /data-voice-note/);
  } finally {
    stop();
  }
});

test("recognition that ends while listening starts again and keeps the words", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const first = FakeRecognition.last;
    assert.ok(first);
    first.onstart?.();
    first.say("hello", true);
    first.onerror?.({ error: "no-speech" });
    const stale = first.onend;
    first.onend?.();
    await new Promise((resolve) => setTimeout(resolve, VOICE_RESTART_BASE_MS + 80));
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second.started, true);
    assert.match(h.region.innerHTML, /Stop listening/);
    stale?.();
    assert.equal(FakeRecognition.all.length, 2);
    assert.equal(second.stopped, false);
    second.onstart?.();
    second.say("there", true);
    h.fire("click", { target: talk() });
    second.onend?.();
    await settle();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>hello there<\/textarea>/);
    assert.equal(second.aborted, false);
  } finally {
    stop();
  }
});

test("a question change stops listening, keeps the words, and does not restart", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("keep me", true);
    h.emitSession(sessionJson("DP-9.9"));
    assert.equal(rec.stopped, true);
    assert.equal(rec.aborted, false);
    rec.onend?.();
    await settle();
    assert.equal(rec.aborted, false);
    assert.equal(FakeRecognition.all.length, 1);
    assert.match(h.region.innerHTML, /data-question-id="DP-9\.9"/);
    assert.doesNotMatch(h.region.innerHTML, /Stop listening/);
    assert.match(h.region.innerHTML, /keep me/);
  } finally {
    stop();
  }
});

test("service-not-allowed shows the blocked alert and does not restart while listening", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onerror?.({ error: "service-not-allowed" });
    rec.onend?.();
    await Promise.resolve();
    assert.equal(FakeRecognition.all.length, 1);
    assert.match(h.region.innerHTML, /role="alert"/);
    assert.ok(h.region.innerHTML.includes(VOICE_BLOCKED));
    assert.equal(voiceMessage("not-allowed", false), VOICE_BLOCKED);
    assert.equal(voiceMessage("service-not-allowed", true), VOICE_BLOCKED);
    assert.equal(voiceMessage("aborted", false), VOICE_RELEASE_EMPTY);
    assert.notEqual(voiceMessage("aborted", false), VOICE_FIRST_ALLOW);
    assert.equal(voiceMessage("no-speech", true), VOICE_SILENT);
    assert.equal(voiceMessage("no-speech", false), VOICE_RELEASE_EMPTY);
  } finally {
    stop();
  }
});

interface VoiceHarness {
  region: { innerHTML: string };
  field: { value?: string; getAttribute(name: string): string | null };
  fire(type: string, event?: Partial<FakeEvent>): void;
  posts: { url: string; body: string }[];
  fireError(): void;
}

function liveCount(): number {
  return FakeRecognition.all.filter((item) => item.started && !item.stopped && !item.aborted).length;
}

function answerPosts(h: VoiceHarness): { url: string; body: string }[] {
  return h.posts.filter((item) => item.url.includes("/api/answer"));
}

function assertDraft(h: VoiceHarness, value: string): void {
  assert.equal(renderedDraft(h.region.innerHTML), value);
  assert.equal(h.field.value, value);
  assert.equal(answerPosts(h).length, 0);
}

/**
 * One click-to-talk cycle. The stop order is Chrome's, not the manual onend
 * the older tests fire in the same turn as the click.
 */
async function dictate(
  h: VoiceHarness,
  order: Exclude<StopOrder, "manual">,
  text: string,
  during?: string,
): Promise<FakeRecognition> {
  FakeRecognition.stopOrder = order;
  FakeRecognition.pendingFinal = order === "end-only" ? "" : text;
  const before = FakeRecognition.all.length;
  h.fire("click", { target: talk(), button: 0 });
  const rec = FakeRecognition.last;
  assert.ok(rec, "a click to talk creates a recognizer");
  assert.equal(rec.started, true);
  assert.equal(FakeRecognition.all.length, before + 1, "the click starts one new recognizer");
  assert.equal(liveCount(), 1, "one recognizer is live");
  assert.match(h.region.innerHTML, /Stop listening/);
  rec.onstart?.();
  if (order === "end-only") rec.say(text, false);
  if (during !== undefined) {
    h.field.value = during;
    h.fire("input", { target: h.field });
  }
  h.fire("click", { target: talk() });
  await settle();
  assert.equal(answerPosts(h).length, 0);
  return rec;
}

function useVoiceHarness(): { h: ReturnType<typeof harness>; stop(): void } {
  FakeRecognition.all = [];
  FakeRecognition.last = null;
  FakeRecognition.stopOrder = "manual";
  FakeRecognition.pendingFinal = "";
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  return { h, stop };
}

test("multi-cycle: three dictations append one, then one two, then one two three", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-then-end", "one");
    assertDraft(h, "one");
    await dictate(h, "final-then-end", "two");
    assertDraft(h, "one two");
    await dictate(h, "final-then-end", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: three dictations append when the final arrives and then onend", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-then-end", "one");
    assertDraft(h, "one");
    await dictate(h, "final-then-end", "two");
    assertDraft(h, "one two");
    await dictate(h, "final-then-end", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: three dictations append when onend arrives and then the final", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "end-then-final", "one");
    assertDraft(h, "one");
    await dictate(h, "end-then-final", "two");
    assertDraft(h, "one two");
    await dictate(h, "end-then-final", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: three dictations append when the final arrives and onend never fires", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-only", "one");
    assertDraft(h, "one");
    await dictate(h, "final-only", "two");
    assertDraft(h, "one two");
    await dictate(h, "final-only", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: three dictations append when only onend fires", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "end-only", "one");
    assertDraft(h, "one");
    await dictate(h, "end-only", "two");
    assertDraft(h, "one two");
    await dictate(h, "end-only", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: text typed between dictations stays, then the next words append once", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-then-end", "one");
    assertDraft(h, "one");
    h.field.value = "one typed in the middle";
    h.fire("input", { target: h.field });
    await dictate(h, "final-then-end", "two");
    assertDraft(h, "one typed in the middle two");
    assert.equal(renderedDraft(h.region.innerHTML).split("typed in the middle").length - 1, 1);
    assert.equal(renderedDraft(h.region.innerHTML).split("two").length - 1, 1);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: text typed during the second dictation stays with the spoken words", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-then-end", "one");
    assertDraft(h, "one");
    await dictate(h, "final-then-end", "two", "one friend");
    assertDraft(h, "one friend two");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: a late final from the first recognizer does not erase or duplicate the second", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    const first = await dictate(h, "end-only", "alpha");
    assertDraft(h, "alpha");
    FakeRecognition.stopOrder = "manual";
    FakeRecognition.pendingFinal = "";
    h.fire("click", { target: talk(), button: 0 });
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second.started, true);
    second.onstart?.();
    second.say("beta", true);
    assert.equal(renderedDraft(h.region.innerHTML), "alpha beta");
    first.say("alpha expanded", true);
    assert.equal(renderedDraft(h.region.innerHTML), "alpha expanded beta");
    assert.equal(renderedDraft(h.region.innerHTML).includes("alpha alpha"), false);
    assert.equal(renderedDraft(h.region.innerHTML).split("beta").length - 1, 1);
    FakeRecognition.stopOrder = "end-only";
    h.fire("click", { target: talk() });
    await settle();
    assertDraft(h, "alpha expanded beta");
    assert.equal(second.stopped, true);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: a stale onend and onerror from the first recognizer are ignored", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const first = FakeRecognition.last;
    assert.ok(first);
    const staleEnd = first.onend;
    const staleError = first.onerror;
    first.onstart?.();
    FakeRecognition.stopOrder = "final-then-end";
    FakeRecognition.pendingFinal = "one";
    h.fire("click", { target: talk() });
    await settle();
    assertDraft(h, "one");
    h.fire("click", { target: talk(), button: 0 });
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    second.onstart?.();
    second.say("two", false);
    const count = FakeRecognition.all.length;
    staleEnd?.();
    staleError?.({ error: "network" });
    await new Promise((resolve) => setTimeout(resolve, VOICE_RESTART_BASE_MS + 80));
    assert.equal(FakeRecognition.all.length, count);
    assert.equal(second.stopped, false);
    assert.equal(liveCount(), 1);
    assert.match(h.region.innerHTML, /Stop listening/);
    assert.equal(h.region.innerHTML.includes("could not reach"), false);
    assert.equal(answerPosts(h).length, 0);
    FakeRecognition.stopOrder = "final-then-end";
    FakeRecognition.pendingFinal = "two";
    h.fire("click", { target: talk() });
    await settle();
    assertDraft(h, "one two");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: a dictation that hears nothing keeps the earlier text and says so", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-then-end", "one");
    assertDraft(h, "one");
    await dictate(h, "end-only", "");
    assert.equal(renderedDraft(h.region.innerHTML), "one");
    assert.match(h.region.innerHTML, new RegExp(VOICE_RELEASE_EMPTY.replaceAll(".", "\\.")));
    assert.equal(answerPosts(h).length, 0);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: the next click after a final-only stop starts one recognizer immediately", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-only", "one");
    assertDraft(h, "one");
    const before = FakeRecognition.all.length;
    h.fire("click", { target: talk(), button: 0 });
    assert.equal(FakeRecognition.all.length, before + 1);
    assert.equal(FakeRecognition.last?.started, true);
    assert.equal(liveCount(), 1);
    assert.match(h.region.innerHTML, /Stop listening/);
    h.fire("click", { target: talk() });
    assert.equal(FakeRecognition.all.length, before + 1, "a second quick click does not start another");
    assert.equal(liveCount(), 0);
    await settle();
    assert.equal(answerPosts(h).length, 0);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: ten dictations then Answer submits every word in order once", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    const words = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"];
    let expected = "";
    for (const word of words) {
      expected = expected === "" ? word : `${expected} ${word}`;
      await dictate(h, "final-then-end", word);
      assertDraft(h, expected);
    }
    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    const posts = answerPosts(h);
    assert.equal(posts.length, 1);
    const body = JSON.parse(posts[0]?.body ?? "{}") as { text?: string };
    assert.equal(body.text, expected);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("multi-cycle: a paint between dictations still appends the later words", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await dictate(h, "final-only", "one");
    assertDraft(h, "one");
    h.fireError();
    h.fireError();
    h.fireError();
    assertDraft(h, "one");
    await dictate(h, "final-only", "two");
    assertDraft(h, "one two");
    h.fireError();
    assertDraft(h, "one two");
    await dictate(h, "final-only", "three");
    assertDraft(h, "one two three");
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

function sessionJson(id: string, pushback: string | null = null): string {
  return JSON.stringify({
    question: {
      id,
      module: "towel-check",
      depth: ["deep"],
      ask: "What is next?",
      why: "The stream moved on.",
      input: ["text", "voice"],
      skipDefault: "Tea.",
      suggest: "Yourself, or one named client.",
      writes: ["SITE-BRIEF.md#offer"],
    },
    pushback,
    done: false,
    mapHtml: "",
    transcriptHtml: "",
    statusHtml: "",
  });
}

function liveHarness() {
  const h = harness(FakeRecognition);
  let notice: FakeEl | null = null;
  let note: FakeEl | null = null;
  const button = element({ class: "hh-btn hh-btn--secondary", "data-voice": "hold" });
  button.textContent = "Click to talk";
  const actions = element({ class: "hh-qcard__actions" });
  actions.insertAdjacentHTML = (_position, html) => {
    if (html.includes("data-card-notice") && notice === null) {
      notice = element({ "data-card-notice": "" });
      notice.textContent = "";
    }
    if (html.includes("data-voice-note") && note === null) {
      note = element({ "data-voice-note": "" });
      const match = html.match(/data-voice-note>([^<]*)</);
      note.textContent = match?.[1] ?? "";
    }
  };
  const errorNode = element({ "data-card-error": "" });
  errorNode.textContent = "";
  let html = "";
  let writes = 0;
  Object.defineProperty(h.region, "innerHTML", {
    configurable: true,
    get() {
      return html;
    },
    set(value: string) {
      html = value;
      writes += 1;
    },
  });
  h.region.querySelector = (selector) => {
    if (selector === "#hh-card-draft") return h.field;
    if (selector === '[data-voice="hold"]') return button;
    if (selector === "[data-card-notice]") return notice;
    if (selector === "[data-voice-note]") return note;
    if (selector === ".hh-qcard__actions") return actions;
    if (selector === "[data-card-error]") return errorNode;
    return null;
  };
  return {
    ...h,
    button,
    get notice() {
      return notice;
    },
    get note() {
      return note;
    },
    writes: () => writes,
  };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const PUSH_LINE = "Name one concrete detail.";
const KEPT_SENTENCE = "Yourself, or one named client.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function answerTag(html: string): string {
  const match = /<button\b[^>]*data-action="answer"[^>]*>/.exec(html);
  assert.ok(match, "missing Answer button");
  return match[0];
}

function typeDraft(h: VoiceHarness, value: string): void {
  h.field.value = value;
  h.fire("input", { target: h.field as FakeEl });
}

/** A new pushback on the card already loaded by the harness. */
async function showPushback(h: VoiceHarness & { emitSession(data: string): void }): Promise<void> {
  await settle();
  h.emitSession(sessionJson("DP-1.2", PUSH_LINE));
  assert.match(h.region.innerHTML, /data-pushback="Name one concrete detail\."/);
  assert.equal(renderedDraft(h.region.innerHTML), "");
  assert.equal(h.field.value, "");
  assert.match(answerTag(h.region.innerHTML), /\sdisabled(?:\s|>)/);
}

function assertBox(h: VoiceHarness, value: string, mode: "heard" | "silent" | "empty"): void {
  assert.equal(renderedDraft(h.region.innerHTML), value);
  assert.equal(h.field.value, value);
  const enabled = value.trim() !== "";
  if (enabled) assert.doesNotMatch(answerTag(h.region.innerHTML), /disabled/);
  else assert.match(answerTag(h.region.innerHTML), /\sdisabled(?:\s|>)/);
  if (mode === "heard") {
    assert.equal(enabled, true);
    assert.ok(h.region.innerHTML.includes(VOICE_HEARD));
  } else {
    assert.equal(h.region.innerHTML.includes(VOICE_HEARD), false);
    assert.ok(h.region.innerHTML.includes(VOICE_RELEASE_EMPTY));
  }
  if (mode === "empty") {
    const placeholder = /placeholder="([^"]*)"/.exec(h.region.innerHTML)?.[1] ?? "";
    assert.notEqual(placeholder, "");
    assert.equal(value, "");
    assert.notEqual(value, decodeEntities(placeholder));
  }
  assert.equal(answerPosts(h).length, 0);
}

test("a newly shown pushback opens with the line and an empty field", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    typeDraft(h, "not sent again");
    await showPushback(h);
    assert.equal(h.region.innerHTML.includes(PUSH_LINE), true);
    assert.equal(renderedDraft(h.region.innerHTML), "");
    assert.match(answerTag(h.region.innerHTML), /\sdisabled(?:\s|>)/);
  } finally {
    stop();
  }
});

test("pushback: interim, final, stop, and onend keep the words and enable Answer", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await showPushback(h);
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    assert.equal(renderedDraft(h.region.innerHTML), "");
    rec.say("for", false);
    assert.equal(renderedDraft(h.region.innerHTML), "for");
    assert.equal(h.field.value, "for");
    rec.say("for me", true);
    assert.equal(renderedDraft(h.region.innerHTML), "for me");
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertBox(h, "for me", "heard");
    assert.match(h.region.innerHTML, /data-pushback=/);
  } finally {
    stop();
  }
});

test("pushback: typed text plus a final stays, and Answer is enabled", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await showPushback(h);
    typeDraft(h, "Typed.");
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    assert.equal(renderedDraft(h.region.innerHTML), "Typed.");
    assert.equal(h.field.value, "Typed.");
    rec.say("for me", true);
    assert.equal(renderedDraft(h.region.innerHTML), "Typed. for me");
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertBox(h, "Typed. for me", "heard");
  } finally {
    stop();
  }
});

test("pushback: a silent stop keeps typed text and says nothing was heard", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await showPushback(h);
    typeDraft(h, "Typed.");
    h.fire("click", { target: talk(), button: 0 });
    assert.equal(renderedDraft(h.region.innerHTML), "Typed.");
    h.fire("click", { target: talk() });
    FakeRecognition.last?.onend?.();
    await settle();
    assertBox(h, "Typed.", "silent");
  } finally {
    stop();
  }
});

test("plain: typed suggest text is never cleared and the words append once", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    typeDraft(h, KEPT_SENTENCE);
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    assert.equal(renderedDraft(h.region.innerHTML), KEPT_SENTENCE);
    rec.say("today", false);
    assert.equal(renderedDraft(h.region.innerHTML), `${KEPT_SENTENCE} today`);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertBox(h, `${KEPT_SENTENCE} today`, "heard");
    assert.equal(renderedDraft(h.region.innerHTML).split(KEPT_SENTENCE).length - 1, 1);
    assert.equal(renderedDraft(h.region.innerHTML).split("today").length - 1, 1);
  } finally {
    stop();
  }
});

test("an empty box keeps the placeholder out and leaves Answer off", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    const before = /placeholder="([^"]*)"/.exec(h.region.innerHTML)?.[1] ?? "";
    assert.notEqual(before, "");
    h.fire("click", { target: talk(), button: 0 });
    assert.equal(renderedDraft(h.region.innerHTML), "");
    h.fire("click", { target: talk() });
    FakeRecognition.last?.onend?.();
    await settle();
    assertBox(h, "", "empty");
    const after = /placeholder="([^"]*)"/.exec(h.region.innerHTML)?.[1] ?? "";
    assert.equal(decodeEntities(after), decodeEntities(before));
  } finally {
    stop();
  }
});

test("pushback and plain: a late final at 400ms stays once and enables Answer", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await lateFinal(h, 400, false);
    await showPushback(h);
    await lateFinal(h, 400, true);
  } finally {
    stop();
  }
});

test("pushback and plain: a late final at 900ms stays once and enables Answer", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await lateFinal(h, 900, false);
    await showPushback(h);
    await lateFinal(h, 900, true);
  } finally {
    stop();
  }
});

test("after the stop wait the box still holds the text and the late words", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    await lateSurvives(h, false);
    await showPushback(h);
    await lateSurvives(h, true);
  } finally {
    stop();
  }
});

test("pushback: Answer submits the box text once after a stop", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await showPushback(h);
    typeDraft(h, "Typed.");
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("for me", true);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertBox(h, "Typed. for me", "heard");
    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    const posts = answerPosts(h);
    assert.equal(posts.length, 1);
    const body = JSON.parse(posts[0]?.body ?? "{}") as { text?: string };
    assert.equal(body.text, "Typed. for me");
  } finally {
    stop();
  }
});

test("pushback: a banner paint and a view update keep the box and Answer", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await showPushback(h);
    typeDraft(h, "Typed.");
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("for me", true);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertBox(h, "Typed. for me", "heard");
    h.fireError();
    h.fireError();
    h.fireError();
    assertBox(h, "Typed. for me", "heard");
    h.emitSession(sessionJson("DP-1.2", PUSH_LINE));
    assertBox(h, "Typed. for me", "heard");
  } finally {
    stop();
  }
});

async function lateFinal(h: VoiceHarness, waitMs: number, pushed: boolean): Promise<void> {
  typeDraft(h, "Hello");
  h.fire("click", { target: talk(), button: 0 });
  const rec = FakeRecognition.last;
  assert.ok(rec);
  rec.onstart?.();
  assert.equal(renderedDraft(h.region.innerHTML), "Hello");
  h.fire("click", { target: talk() });
  rec.onend?.();
  await settle();
  await delay(waitMs);
  rec.say("late words", true);
  await settle();
  assertBox(h, "Hello late words", "heard");
  if (pushed) assert.match(h.region.innerHTML, /data-pushback=/);
  assert.equal(renderedDraft(h.region.innerHTML).split("late words").length - 1, 1);
}

async function lateSurvives(h: VoiceHarness, pushed: boolean): Promise<void> {
  typeDraft(h, "Hello");
  h.fire("click", { target: talk(), button: 0 });
  const rec = FakeRecognition.last;
  assert.ok(rec);
  rec.onstart?.();
  h.fire("click", { target: talk() });
  rec.onend?.();
  await settle();
  await delay(400);
  rec.say("late words", true);
  await settle();
  assertBox(h, "Hello late words", "heard");
  await delay(VOICE_STOP_WAIT_MS);
  assertBox(h, "Hello late words", "heard");
  rec.say("too late", true);
  await settle();
  assertBox(h, "Hello late words", "heard");
  assert.equal(renderedDraft(h.region.innerHTML).includes("too late"), false);
  if (pushed) assert.match(h.region.innerHTML, /data-pushback=/);
}

function resultHandlers(): number {
  return FakeRecognition.all.filter((item) => item.onresult !== null).length;
}

function handlersCleared(rec: FakeRecognition): boolean {
  return rec.onstart === null && rec.onresult === null && rec.onerror === null && rec.onend === null;
}

test("ten cycles keep one live recognizer and at most one late result handler", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    resetVoiceInvariant();
    FakeRecognition.all = [];
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const word = `w${cycle}`;
      h.fire("click", { target: talk(), button: 0 });
      const rec = FakeRecognition.last;
      assert.ok(rec);
      assert.equal(liveCount(), 1);
      assert.equal(readVoiceInvariant().live, 1);
      assert.ok(readVoiceInvariant().handlers <= 5);
      assert.ok(resultHandlers() <= 2, `cycle ${cycle} started with ${resultHandlers()} result handlers`);
      rec.onstart?.();
      rec.hear([{ text: word, final: false }]);
      rec.hear([{ text: word, final: true }]);
      FakeRecognition.stopOrder = "final-then-end";
      FakeRecognition.pendingFinal = word;
      h.fire("click", { target: talk() });
      await settle();
      assert.equal(liveCount(), 0);
      assertDraft(h, Array.from({ length: cycle + 1 }, (_, index) => `w${index}`).join(" "));
    }
    await delay(VOICE_STOP_WAIT_MS + 50);
    assert.equal(resultHandlers(), 0);
    assert.equal(FakeRecognition.all.filter((item) => item.onstart !== null || item.onerror !== null || item.onend !== null).length, 0);
    assert.equal(liveCount(), 0);
    assert.equal(readVoiceInvariant().live, 0);
    assert.equal(readVoiceInvariant().handlers, 0);
    assert.equal(readVoiceInvariant().constructed, 10);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("a stop without onend retires that recognizer before the next start", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const first = FakeRecognition.last;
    assert.ok(first);
    first.onstart?.();
    first.say("alpha beta gamma", true);
    FakeRecognition.stopOrder = "final-only";
    FakeRecognition.pendingFinal = "alpha beta gamma";
    h.fire("click", { target: talk() });
    await settle();
    assertDraft(h, "alpha beta gamma");
    assert.equal(first.aborted, false);
    h.fire("click", { target: talk(), button: 0 });
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second.started, true);
    assert.equal(liveCount(), 1);
    assert.equal(first.aborted || handlersCleared(first), true);
    first.hear([{ text: "should not land", final: true }]);
    assert.equal(renderedDraft(h.region.innerHTML), "alpha beta gamma");
    assert.equal(answerPosts(h).length, 0);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("a cumulative resend with resultIndex 0 does not repeat the words", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.hear([{ text: "one two", final: true }], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "one two");
    rec.hear([
      { text: "one two", final: true },
      { text: "three four", final: true },
    ], 1);
    assert.equal(renderedDraft(h.region.innerHTML), "one two three four");
    rec.hear([
      { text: "one two", final: true },
      { text: "three four", final: true },
      { text: "five six", final: true },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "one two three four five six");
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, "one two three four five six");
    assert.equal(answerPosts(h).length, 0);
  } finally {
    stop();
  }
});

test("a growing sentence delivered at resultIndex 0 appears once", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.hear([{ text: "turn on", final: false }], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "turn on");
    rec.hear([
      { text: "turn on", final: false },
      { text: "turn on the", final: false },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "turn on the");
    rec.hear([
      { text: "turn on", final: false },
      { text: "turn on the", final: false },
      { text: "turn on the light", final: true },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "turn on the light");
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, "turn on the light");
  } finally {
    stop();
  }
});

test("one event with a final and an interim shows both", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.hear([
      { text: "one two", final: true },
      { text: "three", final: false },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "one two three");
    rec.hear([
      { text: "one two", final: true },
      { text: "three", final: true },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "one two three");
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, "one two three");
  } finally {
    stop();
  }
});

test("a late cumulative resend does not append a repeat", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.hear([{ text: "turn on the", final: false }], 0);
    FakeRecognition.stopOrder = "end-only";
    FakeRecognition.pendingFinal = "";
    h.fire("click", { target: talk() });
    await settle();
    assertDraft(h, "turn on the");
    rec.hear([
      { text: "turn on", final: true },
      { text: "turn on the", final: true },
      { text: "turn on the light", final: true },
    ], 0);
    await settle();
    assertDraft(h, "turn on the light");
    assert.equal(renderedDraft(h.region.innerHTML).split("turn on").length - 1, 1);
  } finally {
    FakeRecognition.stopOrder = "manual";
    stop();
  }
});

test("a restart replays old results once and stays at one live recognizer", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const first = FakeRecognition.last;
    assert.ok(first);
    first.onstart?.();
    first.hear([
      { text: "alpha", final: true },
      { text: "beta", final: true },
      { text: "gamma", final: true },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "alpha beta gamma");
    first.onend?.();
    // Chrome has ended this recognizer. stop() was not the path that did it.
    first.stopped = true;
    await delay(VOICE_RESTART_BASE_MS + 40);
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second.started, true);
    assert.equal(FakeRecognition.all.length, 2);
    assert.equal(liveCount(), 1);
    second.onstart?.();
    second.hear([
      { text: "alpha", final: true },
      { text: "beta", final: true },
      { text: "gamma", final: true },
    ], 0);
    assert.equal(renderedDraft(h.region.innerHTML), "alpha beta gamma");
    assert.equal(answerPosts(h).length, 0);
  } finally {
    stop();
  }
});

/** The utterance from the Chrome screenshot, without the revised last word. */
const UTTERANCE =
  "this web page is for myself to operate I'm creating a page where people can buy";
const DRAFT_PROJECT = "a".repeat(32);

function occurrences(host: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  while (from < host.length) {
    const at = host.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function storedDraftText(storage: DraftStorage): string | null {
  const raw = storage.getItem(draftStorageKey(DRAFT_PROJECT, "DP-1.2"));
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { text?: unknown };
  return typeof parsed.text === "string" ? parsed.text : null;
}

test("a revised interim keeps the fixed base and never repeats the sentence", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.field.value = "Intro.";
    h.fire("input", { target: h.field });
    FakeRecognition.all = [];
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    const seen: string[] = [];
    for (const word of ["fire", "Farm", "firewood"]) {
      rec.hear([{ text: `${UTTERANCE} ${word}`, final: false }], 0);
      seen.push(h.field.value ?? "");
    }
    rec.hear([{ text: `${UTTERANCE} firewood`, final: true }], 0);
    seen.push(h.field.value ?? "");
    assert.deepEqual(seen, [
      `Intro. ${UTTERANCE} fire`,
      `Intro. ${UTTERANCE} Farm`,
      `Intro. ${UTTERANCE} firewood`,
      `Intro. ${UTTERANCE} firewood`,
    ]);
    for (const value of seen) assert.equal(occurrences(value, UTTERANCE), 1);
    assert.equal(liveCount(), 1);
    assert.equal(FakeRecognition.all.filter((item) => item.onresult !== null).length, 1);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, `Intro. ${UTTERANCE} firewood`);
  } finally {
    stop();
  }
});

test("repeated Chrome finals at resultIndex 0 leave the box unchanged", async () => {
  const { h, stop } = useVoiceHarness();
  try {
    await settle();
    h.field.value = "Intro.";
    h.fire("input", { target: h.field });
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    const list = [
      { text: "one two", final: true },
      { text: "three four", final: true },
    ];
    rec.hear(list, 0);
    rec.hear(list, 0);
    rec.hear(list, 0);
    assertDraft(h, "Intro. one two three four");
    assert.equal(occurrences(h.field.value ?? "", "one two three four"), 1);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, "Intro. one two three four");
  } finally {
    stop();
  }
});

test("a mid-dictation restore, repaint, or programmatic write does not repeat the sentence", async () => {
  FakeRecognition.all = [];
  FakeRecognition.last = null;
  FakeRecognition.stopOrder = "manual";
  FakeRecognition.pendingFinal = "";
  const storage = memoryStorage();
  const h = harness(FakeRecognition, { storage, projectKey: DRAFT_PROJECT });
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.equal(h.inputBinds(), 1);
    h.field.value = "Intro.";
    h.fire("input", { target: h.field });
    h.fire("click", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.hear([{ text: `${UTTERANCE} fire`, final: false }], 0);
    assert.equal(h.field.value, `Intro. ${UTTERANCE} fire`);
    await delay(DRAFT_DEBOUNCE_MS + 50);
    assert.equal(storedDraftText(storage), `Intro. ${UTTERANCE} fire`);
    h.fireError();
    h.fireError();
    h.fireError();
    h.firePageShow();
    assert.equal(h.field.value, `Intro. ${UTTERANCE} fire`);
    assert.equal(h.inputBinds(), 1);
    assert.equal(FakeRecognition.all.filter((item) => item.onresult !== null).length, 1);
    assert.equal(liveCount(), 1);
    h.fire("input", { target: h.field });
    h.field.value = "Intro. STALE COPY";
    rec.hear([{ text: `${UTTERANCE} Farm`, final: false }], 0);
    assert.equal(h.field.value, `Intro. ${UTTERANCE} Farm`);
    assert.equal(occurrences(h.field.value ?? "", UTTERANCE), 1);
    h.field.value = `${h.field.value ?? ""} please`;
    h.fire("input", { target: h.field });
    rec.hear([{ text: `${UTTERANCE} firewood`, final: false }], 0);
    const heardOnce = `Intro. please ${UTTERANCE} firewood`;
    assert.equal(h.field.value, heardOnce);
    assert.equal(occurrences(h.field.value ?? "", "please"), 1);
    assert.equal(occurrences(h.field.value ?? "", UTTERANCE), 1);
    await delay(DRAFT_DEBOUNCE_MS + 50);
    assert.equal(storedDraftText(storage), heardOnce);
    h.fire("click", { target: talk() });
    rec.onend?.();
    await settle();
    assertDraft(h, heardOnce);
    assert.equal(h.inputBinds(), 1);
  } finally {
    stop();
  }
});
