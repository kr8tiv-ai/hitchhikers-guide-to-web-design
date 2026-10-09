import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mountDesk,
  VOICE_BLOCKED,
  VOICE_HEARD,
  VOICE_LISTENING,
  VOICE_UNSUPPORTED,
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
}

interface FakeEl {
  innerHTML: string;
  value?: string;
  parentElement: FakeEl | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
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
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: SpeechResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.stopped = true;
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
      addEventListener(): void {}
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
  return { env, region, field, fire, listeners };
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
  } finally {
    stop();
  }
});

async function settle(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
