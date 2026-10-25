/**
 * BUG-069. A billing failure shows Retry and that button sends the same draft again.
 * The stub is the only model. No Grok process is spawned.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BILLING_TOP_UP,
  GrokBillingError,
  type Question,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleRaw } from "./settle-guide-job.ts";

const LINE = "For myself.";

function question(): Question {
  return {
    id: "DP-0.1",
    module: "towel-check",
    depth: ["deep"],
    ask: "Is this site for you, or for a client?",
    why: "The desk needs an answer.",
    input: ["text"],
    skipDefault: "For myself.",
    writes: ["PROJECT.md#audience"],
  };
}

function state(error: string | null, draft = LINE): CardState {
  return {
    question: question(),
    draft,
    pushback: null,
    error,
    done: false,
    pending: false,
  };
}

test("a billing failure renders a Retry control and leaves the draft", () => {
  const html = renderCard(state(BILLING_TOP_UP));
  assert.match(html, /data-retry="answer"/);
  assert.match(html, />Retry</);
  assert.equal(html.includes("data-long-wait-retry"), false);
  assert.match(html, /For myself\./);
  assert.match(html, /Your Grok Build usage balance is used up/);
  const other = renderCard(state("Write an answer or skip."));
  assert.equal(other.includes('data-retry="answer"'), false);
});

type Listener = (event: { target: FakeEl | null; preventDefault(): void }) => void;

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

test("pressing Retry re-sends the same draft for the same question", async () => {
  const bodies: string[] = [];
  let posts = 0;
  const session = {
    question: question(),
    pushback: null,
    done: false,
    mapHtml: "",
    transcriptHtml: "",
    statusHtml: "<span>Answer DP-0.1.</span>",
  };
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const region = element({ "data-region": "question" });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const listeners = new Map<string, Listener>();
  const env: DeskEnv = {
    document: {
      querySelector(selector: string): FakeEl | null {
        if (selector === 'meta[name="hh-csrf"]') return meta;
        if (selector === '[data-region="question"]') return region;
        if (selector === '[data-region="status"]') return element();
        return null;
      },
      addEventListener(type: string, listener: Listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    },
    EventSource: class {
      addEventListener(): void {}
      close(): void {}
    },
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/session") return Response.json(session);
      posts += 1;
      bodies.push(String(init?.body ?? ""));
      return Response.json({ error: BILLING_TOP_UP }, { status: 500 });
    },
  };
  const stop = mountDesk(env);
  try {
    await settle();
    field.value = LINE;
    listeners.get("click")?.({ target: element({ "data-action": "answer" }), preventDefault() {} });
    await settle();
    assert.match(region.innerHTML, /data-retry="answer"/);
    assert.match(region.innerHTML, />Retry</);
    assert.match(region.innerHTML, /For myself\./);
    assert.equal(region.innerHTML.includes("data-long-wait-retry"), false);
    listeners.get("click")?.({ target: element({ "data-retry": "answer" }), preventDefault() {} });
    await settle();
    assert.equal(posts, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.match(bodies[0] ?? "", /"questionId":"DP-0\.1"/);
    assert.match(bodies[0] ?? "", /For myself\./);
    assert.match(region.innerHTML, /For myself\./);
  } finally {
    stop();
  }
});

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

test("a billing failure then Retry runs the same turn once more and stores one answer", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-bill-243a-"));
  let judges = 0;
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge") {
      judges += 1;
      if (judges === 1) throw new GrokBillingError();
      return hit({ vague: false, quote: "myself", sharperChoice: "Who is it for?" });
    }
    if (req.task === "guide-message") {
      return hit({ message: "Noted.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "A site for one person." });
    throw new GrokBillingError();
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const first = await settleRaw(
      handle.port,
      await raw(
        handle.port,
        "POST",
        "/api/answer",
        { "content-type": "application/json", "x-hh-csrf": token },
        JSON.stringify({ questionId: "DP-0.1", text: LINE }),
      ),
    );
    assert.equal(first.status, 500);
    assert.match(first.body, /Your Grok Build usage balance is used up/);
    assert.equal(answerCount(dir, LINE), 0);
    const draft = readFileSync(path.join(dir, ".hitchhiker", "drafts.json"), "utf8");
    assert.match(draft, /For myself\./);
    const card = renderCard(state(BILLING_TOP_UP));
    assert.match(card, /data-retry="answer"/);
    const second = await settleRaw(
      handle.port,
      await raw(
        handle.port,
        "POST",
        "/api/answer",
        { "content-type": "application/json", "x-hh-csrf": token },
        JSON.stringify({ questionId: "DP-0.1", text: LINE }),
      ),
    );
    assert.equal(second.status, 200, second.body);
    assert.equal(judges, 2);
    assert.equal(answerCount(dir, LINE), 1);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function answerCount(dir: string, text: string): number {
  const file = path.join(dir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return 0;
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  const answers = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object" && Array.isArray((value as { answers?: unknown }).answers)
      ? (value as { answers: unknown[] }).answers
      : [];
  return answers.filter((item) => item !== null && typeof item === "object" && (item as { value?: unknown }).value === text).length;
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
