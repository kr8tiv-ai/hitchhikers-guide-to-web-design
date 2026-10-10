/**
 * Desk focus, live region, save error, and the mic (prompt 170).
 * 375 is under 720px: the mic row may wrap, and the composer sticks.
 * 1440 is outside that query: the mic stays on the field's row, in normal flow.
 * No browser was opened. These assertions are HTML, CSS, and a fake document.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderCard, type CardState } from "../src/card.ts";
import {
  TALK_NEEDS_CHROMIUM,
  mountDesk,
  reshapeDeskCard,
  type DeskEnv,
  type SpeechRecognitionLike,
} from "../src/client/desk.ts";
import { color } from "../src/design/tokens.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOT_SAVED = "The answer did not save. Try again, or skip.";

test("focus is ink and light cream, and the ring token is on the button and the field", () => {
  assert.equal(color.focus.light, "#1c1612");
  assert.equal(color.focus.dark, "#f4ede3");
  assert.notEqual(color.focus.light, color.accent.light);
  assert.notEqual(color.focus.dark, color.accent.dark);

  const tokens = readFileSync(path.resolve(here, "../src/design/tokens.css"), "utf8");
  assert.match(tokens, /--color-focus-light:\s*#1c1612;/);
  assert.match(tokens, /--color-focus-dark:\s*#f4ede3;/);
  assert.match(tokens, /--color-accent-light:\s*#8e2f1a;/);
  assert.match(tokens, /--color-accent-dark:\s*#e6a15c;/);

  const components = readFileSync(path.resolve(here, "../src/design/components.css"), "utf8");
  assert.match(components, /\.hh-btn--primary:focus-visible,\s*\.hh-qcard__input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/s);
  assert.match(components, /\.hh-qcard__entry\s*\{[^}]*display:\s*flex/s);
  assert.match(components, /\.hh-qcard__entry\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(components, /@media \(min-width: 720px\) \{\s*\.hh-qcard__entry \{\s*flex-wrap:\s*nowrap;/);
  assert.match(components, /\.hh-guide-live\s*\{[^}]*clip-path:\s*inset\(50%\)/s);

  const card = readFileSync(path.resolve(here, "../src/card.css"), "utf8");
  assert.match(card, /--rule:\s*var\(--color-focus\)/);
  assert.match(card, /\.hh-qcard textarea:focus-visible,[\s\S]*?\{[^}]*outline:\s*2px solid var\(--rule\)/);
  const sticky = /@media \(max-width: 719px\) \{[\s\S]*?\n\}/.exec(card);
  assert.ok(sticky);
  assert.match(sticky[0], /position:\s*sticky/);
  assert.equal(card.replace(sticky[0], "").includes("position: sticky"), false);
});

test("the mic sits beside the field, and a save error stays under the draft", () => {
  const html = reshapeDeskCard(
    renderCard(failedCard("A brass wordmark.", NOT_SAVED)),
    false,
  );
  const fieldAt = html.indexOf("<textarea");
  const errorAt = html.indexOf('id="hh-card-error"');
  assert.ok(fieldAt >= 0 && errorAt > fieldAt);
  assert.match(html, new RegExp(`<textarea\\b[^>]*>A brass wordmark\\.</textarea>`));
  assert.match(html, new RegExp(`id="hh-card-error"[^>]*>${escapeRegExp(NOT_SAVED)}</p>`));
  assert.match(html, /aria-describedby="[^"]*hh-card-error"/);
  assert.match(html, /tabindex="-1"/);
  const entry = entryBlock(html);
  assert.match(entry, /hh-qcard__field/);
  assert.match(entry, /data-voice="hold"[^>]*disabled/);
  assert.match(entry, new RegExp(`>${TALK_NEEDS_CHROMIUM}</button>`));
  assert.equal(actionsBlock(html).includes("data-voice"), false);

  const ready = reshapeDeskCard(renderCard(failedCard("", null)), true);
  assert.match(entryBlock(ready), />Hold to talk</);
  assert.doesNotMatch(entryBlock(ready), /disabled/);
  assert.equal(actionsBlock(ready).includes("data-voice"), false);
});

test("the desk page announces the question and keeps the mic off the action row", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-desk-a11y-"));
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    const page = await raw(handle.port, "GET", "/");
    assert.equal(page.status, 200);
    const ask = "Is this site for you, or for a client?";
    const question = region(page.body, "question");
    assert.equal(question.includes('aria-live="polite"'), false);
    assert.equal(occurrences(question, ask), 1);
    assert.match(question, /id="hh-card-ask" tabindex="-1"/);
    assert.match(entryBlock(question), /data-voice="hold"/);
    assert.match(entryBlock(question), />Hold to talk</);
    assert.equal(actionsBlock(question).includes("data-voice"), false);
    const live = /<p class="hh-guide-live" data-guide-live aria-live="polite">([^<]*)<\/p>/.exec(page.body);
    assert.equal(live?.[1], ask);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed save keeps the draft under the field and does not move focus", async () => {
  const h = harness(async () => Response.json({ error: NOT_SAVED }, { status: 500 }));
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.equal(h.focused, 0);
    h.field.value = "A brass wordmark.";
    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    const html = h.region.innerHTML;
    const fieldAt = html.indexOf("<textarea");
    const errorAt = html.indexOf('id="hh-card-error"');
    assert.ok(fieldAt >= 0 && errorAt > fieldAt);
    assert.match(html, /<textarea\b[^>]*>A brass wordmark\.<\/textarea>/);
    assert.match(html, new RegExp(`id="hh-card-error"[^>]*>${escapeRegExp(NOT_SAVED)}</p>`));
    assert.match(html, /data-question-id="DP-0\.1"/);
    assert.equal(h.focused, 0);
    assert.equal(h.live.textContent, "Is this site for you, or for a client?");
  } finally {
    stop();
  }
});

test("submit focuses the new question heading and updates the same live region", async () => {
  const nextAsk = "What should the first screen say?";
  const h = harness(async () =>
    Response.json({
      session: {
        question: question("DP-0.2", nextAsk),
        pushback: null,
        done: false,
        mapHtml: "",
        transcriptHtml: "",
        statusHtml: "",
      },
    }),
  );
  const stop = mountDesk(h.env);
  try {
    await settle();
    const live = h.live;
    assert.equal(live.textContent, "Is this site for you, or for a client?");
    assert.equal(h.focused, 0);
    h.field.value = "For a client.";
    h.fire("click", { target: element({ "data-action": "answer" }) });
    await settle();
    assert.equal(h.focused, 1);
    assert.equal(h.focusedAsk, nextAsk);
    assert.equal(h.live, live);
    assert.equal(live.textContent, nextAsk);
    assert.match(h.region.innerHTML, /tabindex="-1"/);
    assert.match(h.region.innerHTML, /data-question-id="DP-0\.2"/);
    assert.equal(h.region.innerHTML.includes('aria-live="polite"'), false);
  } finally {
    stop();
  }
});

test("a missing speech API disables the mic with the Chrome or Edge line", async () => {
  const button = element({ "data-voice": "hold" });
  button.textContent = "Hold to talk";
  const h = harness(async () => Response.json({}), { speech: false, talk: button });
  const stop = mountDesk(h.env);
  try {
    assert.equal(button.getAttribute("disabled"), "");
    assert.equal(button.textContent, TALK_NEEDS_CHROMIUM);
    await settle();
    const html = h.region.innerHTML;
    assert.match(entryBlock(html), /data-voice="hold"[^>]*disabled/);
    assert.match(entryBlock(html), new RegExp(`>${TALK_NEEDS_CHROMIUM}</button>`));
    assert.equal(actionsBlock(html).includes("data-voice"), false);
    assert.equal(html.includes("Hold to talk"), false);
  } finally {
    stop();
  }
});

function failedCard(draft: string, error: string | null): CardState {
  return {
    question: question("DP-0.1", "Is this site for you, or for a client?"),
    draft,
    pushback: null,
    error,
    done: false,
    pending: false,
    enterHint: true,
  };
}

function question(id: string, ask: string): NonNullable<CardState["question"]> {
  return {
    id,
    module: "towel-check",
    depth: ["deep"],
    ask,
    why: "The desk needs an answer.",
    input: ["text"],
    skipDefault: "For myself.",
    writes: ["PROJECT.md#audience"],
  };
}

function entryBlock(html: string): string {
  const matched = /<div class="hh-qcard__entry">[\s\S]*?<\/div>/.exec(html);
  assert.ok(matched, "entry");
  return matched[0];
}

function actionsBlock(html: string): string {
  const matched = /<div class="hh-qcard__actions">[\s\S]*?<\/div>/.exec(html);
  assert.ok(matched, "actions");
  return matched[0];
}

function region(html: string, name: string): string {
  const matched = new RegExp(`data-region="${name}"[\\s\\S]*?</(?:section|nav|footer)>`).exec(html);
  assert.ok(matched, name);
  return matched[0];
}

function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function raw(port: number, method: string, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
}

interface FakeEl {
  innerHTML: string;
  value?: string;
  textContent?: string | null;
  parentElement: FakeEl | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
  focus?: () => void;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  return {
    innerHTML: "",
    textContent: "",
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

class QuietRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: never) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start(): void {}
  stop(): void {}
  abort(): void {}
}

function harness(
  fetchImpl: DeskEnv["fetch"],
  options: { speech?: boolean; talk?: FakeEl } = {},
) {
  const speech = options.speech !== false;
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const heading = element({ id: "hh-card-ask" });
  const live = element();
  live.textContent = "";
  const regionEl = element({ "data-region": "question" });
  let focused = 0;
  let focusedAsk = "";
  heading.focus = () => {
    focused += 1;
    const matched = /id="hh-card-ask"[^>]*>([^<]*)</.exec(regionEl.innerHTML);
    focusedAsk = matched?.[1] ?? "";
  };
  regionEl.querySelector = (selector) => {
    if (selector === "#hh-card-draft") return field;
    if (selector === "#hh-card-ask" && regionEl.innerHTML.includes('id="hh-card-ask"')) return heading;
    if (selector === '[data-voice="hold"]') return options.talk ?? null;
    return null;
  };
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return regionEl;
      if (selector === "[data-guide-live]") return live;
      return null;
    },
    addEventListener(type: string, listener: (event: FakeEvent) => void) {
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
    } as unknown as DeskEnv["EventSource"],
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/session") {
        return Response.json({
          question: question("DP-0.1", "Is this site for you, or for a client?"),
          pushback: null,
          done: false,
          mapHtml: "",
          transcriptHtml: "",
          statusHtml: "",
        });
      }
      return fetchImpl(input, init);
    },
    ...(speech ? { SpeechRecognition: QuietRecognition } : {}),
  };
  const fire = (type: string, event: Partial<FakeEvent> = {}): void => {
    listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
  };
  return {
    env,
    region: regionEl,
    field,
    live,
    fire,
    get focused() {
      return focused;
    },
    get focusedAsk() {
      return focusedAsk;
    },
  };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
