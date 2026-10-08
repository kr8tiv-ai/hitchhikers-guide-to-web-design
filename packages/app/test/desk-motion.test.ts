import assert from "node:assert/strict";
import { test } from "node:test";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";

/**
 * Arriving on a DP-6 card injects motion.js. createElement has to be called
 * as a method. A detached call throws Illegal invocation, paint aborts, and
 * the answer request never leaves the browser.
 */

interface FakeEl {
  innerHTML: string;
  value?: string;
  disabled?: boolean;
  parentElement: FakeEl | null;
  attrs: Map<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
  appendChild(node: FakeEl): void;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  const el: FakeEl = {
    innerHTML: "",
    parentElement: null,
    attrs: store,
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
    appendChild(node) {
      node.parentElement = el;
    },
  };
  return el;
}

function question(id: string): Record<string, unknown> {
  return {
    id,
    module: "towel-check",
    depth: ["deep"],
    ask: id === "DP-6.2" ? "What motion level fits?" : "Which three words fit the shop?",
    why: "The desk needs an answer.",
    input: ["text"],
    skipDefault: "Calm.",
    writes: ["SITE-BRIEF.md#vibe"],
  };
}

function session(id: string | null, done: boolean): Record<string, unknown> {
  return {
    question: id === null ? null : question(id),
    pushback: null,
    done,
    mapHtml: "<p>map</p>",
    transcriptHtml: "<p>transcript</p>",
    statusHtml: "<span>Ready.</span>",
  };
}

test("a DP-6 card calls createElement on the document and the next answer still posts", async () => {
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "Calm, about a three, enough to feel considered.";
  const region = element({ "data-region": "question" });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const map = element();
  const transcript = element();
  const status = element();
  const scripts: FakeEl[] = [];
  const listeners = new Map<string, (event: { target: FakeEl | null; preventDefault(): void }) => void>();
  const body = element();
  body.appendChild = (node) => {
    node.parentElement = body;
    scripts.push(node);
  };
  const doc = {
    body,
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return region;
      if (selector === '[data-region="map"]') return map;
      if (selector === '[data-region="transcript"]') return transcript;
      if (selector === '[data-region="status"]') return status;
      if (selector === 'script[src="/client/motion.js"]') return scripts[0] ?? null;
      return null;
    },
    addEventListener(type: string, listener: (event: { target: FakeEl | null; preventDefault(): void }) => void) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
    createElement(this: unknown, tag: string): FakeEl {
      if (this !== doc) throw new TypeError("Illegal invocation");
      const node = element();
      node.setAttribute("tag", tag);
      return node;
    },
  };
  const urls: string[] = [];
  let posts = 0;
  const env: DeskEnv = {
    document: doc,
    EventSource: class {
      addEventListener(): void {}
      close(): void {}
    },
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      if (url === "/api/session") return Response.json(session("DP-5.3", false));
      posts += 1;
      if (posts === 1) return Response.json({ session: session("DP-6.2", false) });
      return Response.json({ session: session(null, true) });
    },
  };

  const stop = mountDesk(env);
  try {
    await settle();
    assert.deepEqual(urls, ["/api/session"]);
    assert.equal(scripts.length, 0);
    const button = element({ "data-action": "answer" });
    listeners.get("click")?.({ target: button, preventDefault() {} });
    await settle();
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0]?.getAttribute("src"), "/client/motion.js");
    assert.equal(scripts[0]?.getAttribute("type"), "module");
    assert.equal(region.innerHTML.includes("DP-6.2"), true);
    listeners.get("click")?.({ target: button, preventDefault() {} });
    await settle();
    assert.deepEqual(urls, ["/api/session", "/api/answer", "/api/answer"]);
    assert.equal(region.innerHTML.includes("Guide Entry is next"), true);
    assert.equal(scripts.length, 1);
  } finally {
    stop();
  }
});

async function settle(): Promise<void> {
  for (let step = 0; step < 5; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
