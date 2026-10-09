import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mountDesk,
  VOICE_BLOCKED,
  VOICE_FIRST_ALLOW,
  VOICE_HEARD,
  VOICE_LISTENING,
  VOICE_RELEASE_EMPTY,
  VOICE_SILENT,
  VOICE_UNSUPPORTED,
  voiceMessage,
  type DeskEnv,
  type SpeechRecognitionLike,
  type SpeechResultEventLike,
} from "../src/client/desk.ts";

/**
 * Hold to talk on the desk. The button used to render with no listener at
 * all, so holding it did nothing. These tests drive the document listeners
 * with a fake SpeechRecognition: press, speak, release, and the draft fills.
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

class FakeRecognition implements SpeechRecognitionLike {
  static last: FakeRecognition | null = null;
  static all: FakeRecognition[] = [];
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
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
    this.onend?.();
  }
  say(text: string, isFinal: boolean): void {
    const result = Object.assign([{ transcript: text }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

function harness(Recognition: DeskEnv["SpeechRecognition"]) {
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const region = element({ "data-region": "question" });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const listeners = new Map<string, Listener>();
  let sessionListener: ((event?: { data?: string }) => void) | null = null;
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return region;
      return null;
    },
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
  };
  const env: DeskEnv = {
    document: doc,
    EventSource: class {
      addEventListener(type: string, listener: (event?: { data?: string }) => void): void {
        if (type === "session") sessionListener = listener;
      }
      close(): void {}
    },
    fetch: async () =>
      Response.json({
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
      }),
    SpeechRecognition: Recognition,
    lang: "en-CA",
  };
  const fire = (type: string, event: Partial<FakeEvent> = {}): void => {
    listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
  };
  const emitSession = (data: string): void => {
    sessionListener?.({ data });
  };
  return { env, region, field, fire, listeners, emitSession };
}

const talk = (): FakeEl => element({ "data-voice": "hold" });

test("holding the talk button listens, fills the draft, and does not submit", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.equal(h.listeners.has("pointerdown"), true);
    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    assert.equal(rec.started, true);
    assert.equal(rec.lang, "en-CA");
    assert.equal(rec.interimResults, true);
    assert.match(h.region.innerHTML, /Listening\. Release to stop/);
    assert.match(h.region.innerHTML, new RegExp(VOICE_LISTENING.replaceAll(".", "\\.")));
    rec.onstart?.();
    rec.say("A tea shop", false);
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>A tea shop<\/textarea>/);
    rec.say("A tea shop on the corner", true);
    h.fire("pointerup");
    assert.equal(rec.stopped, true);
    rec.onend?.();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>A tea shop on the corner<\/textarea>/);
    assert.match(h.region.innerHTML, />Hold to talk</);
    assert.ok(h.region.innerHTML.includes(VOICE_HEARD));
  } finally {
    stop();
  }
});

test("space on the focused button also holds to talk", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("keydown", { target: talk(), key: " " });
    const rec = FakeRecognition.last;
    assert.ok(rec?.started);
    rec.onstart?.();
    rec.say("Loose leaf", true);
    h.fire("keyup", { key: " " });
    assert.equal(rec.stopped, true);
    rec.onend?.();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>Loose leaf<\/textarea>/);
  } finally {
    stop();
  }
});

test("a blocked microphone shows an inline alert instead of failing silently", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onerror?.({ error: "not-allowed" });
    rec.onend?.();
    h.fire("pointerup");
    assert.match(h.region.innerHTML, /role="alert"/);
    assert.ok(h.region.innerHTML.includes("The microphone is blocked."));
    assert.equal(VOICE_BLOCKED.includes("!"), false);
  } finally {
    stop();
  }
});

test("a browser without speech recognition says so on the card", async () => {
  const h = harness(null);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("pointerdown", { target: talk(), button: 0 });
    assert.match(h.region.innerHTML, /role="alert"/);
    assert.ok(h.region.innerHTML.includes(VOICE_UNSUPPORTED.split(".")[0] ?? ""));
    assert.equal(h.region.innerHTML.includes("speech service"), false);
  } finally {
    stop();
  }
});

test("a fast release says to hold the button, not to allow the microphone", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    h.fire("pointerup");
    rec.onend?.();
    assert.match(h.region.innerHTML, new RegExp(VOICE_RELEASE_EMPTY.replaceAll(".", "\\.")));
    assert.equal(h.region.innerHTML.includes(VOICE_FIRST_ALLOW), false);
    assert.equal(h.region.innerHTML.includes("allow the microphone"), false);
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
    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    h.fire("pointerup");
    assert.equal(rec.stopped, true);
    assert.equal(rec.aborted, false);
    const deadline = Date.now() + 2_000;
    while (!rec.aborted && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(rec.aborted, true);
    assert.match(h.region.innerHTML, />Hold to talk</);
    assert.match(h.region.innerHTML, new RegExp(VOICE_RELEASE_EMPTY.replaceAll(".", "\\.")));
    assert.equal(h.region.innerHTML.includes(VOICE_FIRST_ALLOW), false);
    h.fire("pointerdown", { target: talk(), button: 0 });
    assert.equal(FakeRecognition.all.length, 2);
    assert.equal(FakeRecognition.last?.started, true);
  } finally {
    stop();
  }
});

test("pointerup outside the button still stops, and a disabled button never starts", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.last = null;
    const disabled = element({ "data-voice": "hold", disabled: "" });
    h.fire("pointerdown", { target: disabled, button: 0, pointerId: 4 });
    assert.equal(FakeRecognition.last, null);

    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("From outside", true);
    h.fire("pointerup", { target: element() });
    assert.equal(rec.stopped, true);
    rec.onend?.();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>From outside<\/textarea>/);
  } finally {
    stop();
  }
});

test("setPointerCapture runs on pointerdown and a throw does not block listening", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    const button = talk();
    const ids: number[] = [];
    button.setPointerCapture = (id) => {
      ids.push(id);
    };
    h.fire("pointerdown", { target: button, button: 0, pointerId: 7 });
    assert.deepEqual(ids, [7]);
    h.fire("pointerup");
    FakeRecognition.last?.onend?.();

    const shaky = talk();
    shaky.setPointerCapture = () => {
      throw new Error("pointer is gone");
    };
    h.fire("pointerdown", { target: shaky, button: 0, pointerId: 8 });
    assert.equal(FakeRecognition.last?.started, true);
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
    h.fire("pointerdown", { target: h.button, button: 0, pointerId: 2 });
    assert.equal(h.writes(), writes);
    assert.equal(h.button.textContent, "Listening. Release to stop");
    assert.equal(h.button.getAttribute("aria-pressed"), "true");
    assert.equal(h.notice?.textContent, VOICE_LISTENING);
    assert.match(h.note?.textContent ?? "", /Chrome sends this audio to its speech service/);
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("partial tea", false);
    assert.equal(h.writes(), writes);
    assert.equal(h.field.value, "partial tea");
    assert.equal(h.button.textContent, "Listening. Release to stop");
    rec.say("partial tea shop", true);
    h.fire("pointerup");
    rec.onend?.();
    assert.match(h.region.innerHTML, /partial tea shop/);
    assert.ok(h.region.innerHTML.includes(VOICE_HEARD));
    assert.match(h.region.innerHTML, /data-voice-note/);
  } finally {
    stop();
  }
});

test("recognition that ends while held starts again and keeps the words", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("pointerdown", { target: talk(), button: 0 });
    const first = FakeRecognition.last;
    assert.ok(first);
    first.onstart?.();
    first.say("hello", true);
    first.onerror?.({ error: "no-speech" });
    first.onend?.();
    await Promise.resolve();
    const second = FakeRecognition.last;
    assert.ok(second);
    assert.notEqual(second, first);
    assert.equal(second.started, true);
    assert.match(h.region.innerHTML, /Listening\. Release to stop/);
    second.onstart?.();
    second.say("there", true);
    h.fire("pointerup");
    second.onend?.();
    assert.match(h.region.innerHTML, /<textarea\b[^>]*>hello there<\/textarea>/);
  } finally {
    stop();
  }
});

test("a question change from the event stream aborts listening and does not restart", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("pointerdown", { target: talk(), button: 0 });
    const rec = FakeRecognition.last;
    assert.ok(rec);
    rec.onstart?.();
    rec.say("keep me", true);
    h.emitSession(sessionJson("DP-9.9"));
    await Promise.resolve();
    assert.equal(rec.aborted, true);
    assert.equal(FakeRecognition.all.length, 1);
    assert.match(h.region.innerHTML, /data-question-id="DP-9\.9"/);
    assert.doesNotMatch(h.region.innerHTML, /Listening\. Release to stop/);
    assert.doesNotMatch(h.region.innerHTML, /keep me/);
  } finally {
    stop();
  }
});

test("service-not-allowed shows the blocked alert and does not restart while held", async () => {
  const h = harness(FakeRecognition);
  const stop = mountDesk(h.env);
  try {
    await settle();
    FakeRecognition.all = [];
    h.fire("pointerdown", { target: talk(), button: 0 });
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

function sessionJson(id: string): string {
  return JSON.stringify({
    question: {
      id,
      module: "towel-check",
      depth: ["deep"],
      ask: "What is next?",
      why: "The stream moved on.",
      input: ["text", "voice"],
      skipDefault: "Tea.",
      writes: ["SITE-BRIEF.md#offer"],
    },
    pushback: null,
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
  button.textContent = "Hold to talk";
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
