/**
 * Finished desk: one progress line, one next step, and a status line
 * that follows interview.json instead of the first page paint.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree, questionsToAsk, requiredIds, saveState } from "@hitchhiker/engine";
import { guideTurnText, mountDesk, type DeskEnv } from "../src/client/desk.ts";
import { openRequiredCount } from "../src/server/card.ts";
import { renderContextMain } from "../src/server/context-desk.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "../../../interview/tree.yaml");
const REQUIRED = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"] as const;
const FORBIDDEN_PORTS = new Set([4175, 4188, 4210]);

function times(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

test("guide turn text does not repeat the finished card heading", () => {
  assert.equal(guideTurnText(null, true), "");
  assert.equal(guideTurnText("What is the stack?", true), "What is the stack?");
  assert.equal(guideTurnText(null, false), "");
});

test("answered required ids are not part of the open count", () => {
  const questions = questionsToAsk(loadTree(treeFile), "deep");
  const answers = [
    { id: "DP-2.1", status: "ANSWERED" as const, value: "Sell the tea." },
    { id: "DP-2.6", status: "ANSWERED" as const, value: "A visitor." },
    { id: "DP-2.2", status: "ANSWERED" as const, value: "Book a tasting." },
    { id: "DP-5.3", status: "SKIPPED" as const, value: "Calm." },
  ];
  assert.equal(openRequiredCount(questions, answers, requiredIds()), 3);
  assert.equal(
    openRequiredCount(
      questions,
      REQUIRED.map((id) => ({ id, status: "ANSWERED" as const, value: "Saved." })),
      requiredIds(),
    ),
    0,
  );
});

test("the context panel names Don't Panic once the interview has saved answers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-context-249e-"));
  try {
    await saveState(dir, {
      phase: "",
      slice: "Desk",
      promptId: "interview:DP-2.2",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Answer DP-2.1.",
      updatedAt: "2026-10-23T09:53:04.836Z",
    });
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "interview.json"),
      JSON.stringify({
        version: 1,
        answers: [{ id: "DP-2.1", status: "ANSWERED", value: "Sell the tea." }],
      }),
    );
    const html = renderContextMain(dir, "token");
    assert.match(html, /Phase: Don&#39;t Panic\./);
    assert.equal(html.includes("No phase yet"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the finished screen says Interview done and Guide Entry once, from saved answers", async () => {
  const previousHome = process.env.HH_PROJECT_HOME;
  const previousE2e = process.env.HH_E2E_PROJECT;
  const home = mkdtempSync(path.join(tmpdir(), "hh-home-249e-"));
  process.env.HH_PROJECT_HOME = home;
  delete process.env.HH_E2E_PROJECT;
  const dir = mkdtempSync(path.join(tmpdir(), "hh-desk-249e-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const questions = loadTree(treeFile);
  const asked = questionsToAsk(questions, "deep");
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify(questions.map((item) => ({ id: item.id, status: "ANSWERED", value: "Saved." }))),
  );
  await saveState(dir, {
    phase: "Don't Panic",
    slice: "Desk",
    promptId: "interview:done",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2.",
    updatedAt: "2026-10-23T09:53:04.836Z",
  });
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      turnHandler: async () => ({ next: null, events: [] }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    assert.equal(FORBIDDEN_PORTS.has(handle.port), false);
    const html = await (await fetch(handle.url)).text();
    const progress = `Interview done (${asked.length} of ${asked.length})`;
    assert.equal(times(html, progress), 1);
    assert.equal(times(html, "Guide Entry is next."), 1);
    const router = /data-router-status>([^<]*)</.exec(html);
    assert.ok(router?.[1]);
    assert.match(router[1], /review the Site Brief/);
    for (const id of REQUIRED) assert.equal(router[1].includes(id), false, id);
    const session = (await (await fetch(new URL("/api/session", handle.url))).json()) as unknown;
    assert.ok(isRecord(session));
    assert.equal(typeof session.routerLine, "string");
    assert.match(String(session.routerLine), /Don't Panic\. Next: review the Site Brief\./);
    for (const id of REQUIRED) assert.equal(String(session.routerLine).includes(id), false, id);
    assert.ok(isRecord(session.counts));
    assert.equal(session.counts.openRequired, 0);
  } finally {
    if (handle !== undefined) await handle.close();
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
    if (previousE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = previousE2e;
    removeTempDir(dir);
    removeTempDir(home);
  }
});

interface FakeEl {
  innerHTML: string;
  textContent: string | null;
  value?: string;
  parentElement: FakeEl | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
}

function element(attrs: Record<string, string> = {}, text = ""): FakeEl {
  const store = new Map(Object.entries(attrs));
  const node: FakeEl = {
    innerHTML: "",
    textContent: text,
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

class RecordingSource {
  static last: RecordingSource | null = null;
  listeners = new Map<string, (event?: { data: string }) => void>();
  constructor() {
    RecordingSource.last = this;
  }
  addEventListener(type: string, listener: (event?: { data: string }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
  session(data: string): void {
    this.listeners.get("session")?.({ data });
  }
}

function counts(openRequired: number) {
  return {
    index: 12,
    total: 61,
    phase: "Don't Panic",
    openRequired,
    mode: "deep",
    modeNote: "Deep interview",
  };
}

function session(routerLine: string, openRequired: number, questionId = "DP-4.1") {
  return {
    question: {
      id: questionId,
      module: "desk",
      depth: ["deep"],
      ask: "What should this page do?",
      why: "The next step depends on it.",
      input: ["text"],
      skipDefault: "A simple page.",
      writes: ["PROJECT.md#goals"],
    },
    pushback: null,
    done: false,
    mapHtml: "",
    transcriptHtml: "",
    statusHtml: "<span>Ready.</span>",
    counts: counts(openRequired),
    routerLine,
  };
}

const STALE =
  "No phase yet. Next: Answer DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2. Blockers: none. Open decisions: none.";
const LIVE = "Don't Panic. Next: Answer DP-5.3, DP-6.2, DP-9.2. Blockers: none. Open decisions: none.";

test("a same-card session replaces the stale Next list and the required count", async () => {
  const router = element({ "data-router-status": "" }, STALE);
  const open = element({ "data-open-required": "" }, "6 required still open");
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const region = element({ "data-region": "question" });
  region.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return element({ content: "csrf-token" });
      if (selector === '[data-region="question"]') return region;
      if (selector === "[data-router-status]") return router;
      if (selector === "[data-open-required]") return open;
      if (selector === '[data-region="status"]') return element();
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const env: DeskEnv = {
    document: doc,
    EventSource: RecordingSource as unknown as DeskEnv["EventSource"],
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/session") return Response.json(session(STALE, 6));
      return Response.json({ error: "not this test" }, { status: 500 });
    },
  };
  const stop = mountDesk(env);
  try {
    for (let step = 0; step < 8; step += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    const source = RecordingSource.last;
    assert.ok(source);
    source.session(JSON.stringify(session(LIVE, 3)));
    assert.equal(router.textContent, LIVE);
    assert.equal(router.textContent?.includes("DP-2.1"), false);
    assert.equal(router.textContent?.includes("DP-2.6"), false);
    assert.equal(router.textContent?.includes("DP-2.2"), false);
    assert.match(router.textContent ?? "", /DP-5\.3/);
    assert.equal(open.textContent, "3 required still open");
    const moved = "Don't Panic. Next: review the Site Brief. Blockers: none. Open decisions: none.";
    source.session(JSON.stringify(session(moved, 0, "DP-4.2")));
    assert.equal(router.textContent, moved);
    assert.equal(open.textContent, "0 required still open");
  } finally {
    stop();
  }
});
