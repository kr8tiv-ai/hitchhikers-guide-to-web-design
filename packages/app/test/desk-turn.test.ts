import assert from "node:assert/strict";
import { test } from "node:test";
import { DESK_OFFLINE, mountDesk, type DeskEnv } from "../src/client/desk.ts";

/**
 * A failed Answer must leave the card usable. The draft stays, the button
 * enables again, and a second click posts the same words.
 */

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
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

const session = {
  question: {
    id: "DP-0.1",
    module: "towel-check",
    depth: ["deep"],
    ask: "Is this site for you, or for a client?",
    why: "The desk needs an answer.",
    input: ["text"],
    skipDefault: "For myself.",
    writes: ["PROJECT.md#audience"],
  },
  pushback: null,
  done: false,
  mapHtml: "",
  transcriptHtml: "",
  statusHtml: "<span>Answer DP-0.1.</span>",
};

function harness(fetchImpl: DeskEnv["fetch"], Source: DeskEnv["EventSource"]) {
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const region = element({ "data-region": "question" });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const status = element({ "data-region": "status" });
  const listeners = new Map<string, Listener>();
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return region;
      if (selector === '[data-region="status"]') return status;
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
    EventSource: Source,
    fetch: fetchImpl,
  };
  const fire = (type: string, event: Partial<FakeEvent> = {}): void => {
    listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
  };
  return { env, region, field, status, fire };
}

class RecordingSource {
  static last: RecordingSource | null = null;
  listeners = new Map<string, () => void>();
  constructor() {
    RecordingSource.last = this;
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
  fail(): void {
    this.listeners.get("error")?.();
  }
  session(data: string): void {
    const listener = this.listeners.get("session") as ((event: { data: string }) => void) | undefined;
    listener?.({ data });
  }
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("a failed answer leaves pending clear, keeps the draft, and accepts a second click", async () => {
  const bodies: string[] = [];
  let posts = 0;
  let rejectFirst: (error: Error) => void = () => {};
  const h = harness(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/session") return Response.json(session);
    posts += 1;
    bodies.push(String(init?.body ?? ""));
    if (posts === 1) {
      return new Promise((_resolve, reject) => {
        rejectFirst = reject;
      });
    }
    return Response.json(
      { error: "The Guide took too long to answer. Your answer is kept. Try again." },
      { status: 500 },
    );
  }, class {
    addEventListener(): void {}
    close(): void {}
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    h.field.value = "A brass wordmark.";
    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    assert.equal(posts, 1);
    assert.match(h.region.innerHTML, /aria-busy="true"/);
    assert.match(h.region.innerHTML, /data-action="answer" disabled/);
    assert.match(h.region.innerHTML, /A brass wordmark\./);

    rejectFirst(new Error("socket closed"));
    await settle();
    assert.equal(h.region.innerHTML.includes('aria-busy="true"'), false);
    assert.equal(/data-action="answer" disabled/.test(h.region.innerHTML), false);
    assert.match(h.region.innerHTML, /A brass wordmark\./);
    assert.match(h.region.innerHTML, /Your draft is still here/);

    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    assert.equal(posts, 2);
    assert.equal(h.region.innerHTML.includes('aria-busy="true"'), false);
    assert.equal(/data-action="answer" disabled/.test(h.region.innerHTML), false);
    assert.match(h.region.innerHTML, /A brass wordmark\./);
    assert.match(h.region.innerHTML, /took too long/);
    assert.equal(bodies[0]?.includes("A brass wordmark."), true);
    assert.equal(bodies[1]?.includes("A brass wordmark."), true);
  } finally {
    stop();
  }
});

test("the event stream says the desk is offline after a few failed reconnects", async () => {
  const h = harness(async () => Response.json(session), RecordingSource as unknown as DeskEnv["EventSource"]);
  const stop = mountDesk(h.env);
  try {
    await settle();
    const source = RecordingSource.last;
    assert.ok(source);
    source.fail();
    source.fail();
    assert.equal(h.status.innerHTML.includes(DESK_OFFLINE), false);
    source.fail();
    assert.match(h.status.innerHTML, /lost its connection to hh app/);
    assert.match(h.status.innerHTML, /PowerShell window still open/);
    source.session(JSON.stringify(session));
    await settle();
    assert.equal(h.status.innerHTML.includes(DESK_OFFLINE), false);
  } finally {
    stop();
  }
});
