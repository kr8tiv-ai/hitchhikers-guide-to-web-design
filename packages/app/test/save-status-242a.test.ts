/**
 * BUG-048. The in-page save line follows the session, without a reload.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";

interface FakeEl {
  innerHTML: string;
  textContent: string;
  value?: string;
  parentElement: FakeEl | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  const node: FakeEl = {
    innerHTML: "",
    textContent: attrs.text ?? "",
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
  return node;
}

const question = {
  id: "DP-0.1",
  module: "towel-check",
  depth: ["deep"],
  ask: "Is this site for you, or for a client?",
  why: "The desk needs an answer.",
  input: ["text"],
  skipDefault: "For myself.",
  writes: ["PROJECT.md#audience"],
};

function session(id: string, saveStatus: { ok: boolean; savedAt: string | null; place: string; error: string | null }) {
  return {
    question: { ...question, id },
    pushback: null,
    done: false,
    mapHtml: "",
    transcriptHtml: "",
    statusHtml: "<span>Answer.</span>",
    saveStatus,
  };
}

class RecordingSource {
  static last: RecordingSource | null = null;
  listeners = new Map<string, (event: { data: string }) => void>();
  constructor() {
    RecordingSource.last = this;
  }
  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
  session(data: string): void {
    this.listeners.get("session")?.({ data });
  }
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("a session round-trip rewrites the save line, including a failed write", async () => {
  const save = element({ "data-save-status": "" });
  save.textContent = "Not saved · No save yet";
  const meta = element({ content: "csrf-token" });
  const region = element({ "data-region": "question" });
  const field = element();
  field.value = "";
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return region;
      if (selector === "[data-save-status]") return save;
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const savedAt = "2026-10-20T18:04:00.000Z";
  const env: DeskEnv = {
    document: doc,
    EventSource: RecordingSource as unknown as DeskEnv["EventSource"],
    fetch: async () =>
      ({
        ok: true,
        json: async () => session("DP-0.1", { ok: true, savedAt, place: "Desktop", error: null }),
      }) as Response,
  };
  const stop = mountDesk(env);
  try {
    await settle();
    assert.match(save.innerHTML, /Saved · /);
    assert.match(save.innerHTML, new RegExp(savedAt));
    assert.equal(save.innerHTML.includes("No save yet"), false);
    RecordingSource.last?.session(
      JSON.stringify(session("DP-0.2", { ok: false, savedAt: null, place: "", error: "The disk is full." })),
    );
    await settle();
    assert.equal(save.textContent, "Not saved · The disk is full.");
  } finally {
    stop();
  }
});
