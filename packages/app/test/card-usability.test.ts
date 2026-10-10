/**
 * Question card usability (prompt 167).
 * Rendered HTML covers the kicker, the single ask, labels, the hint, and the assumption.
 * The desk harness covers Enter, Shift+Enter, composition, and required Skip.
 * Sticky layout: the composer rule is inside max-width 719px, so 375 sticks and 1440 does not.
 * No browser was opened. These assertions are HTML and CSS, not a visual pass.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadTree,
  missingRequired,
  questionsForDepth,
  requiredIds,
  type AnswerRecord,
} from "@hitchhiker/engine";
import {
  ANSWER_HINT,
  PLACEHOLDER_FALLBACK,
  SKIP_CONFIRM,
  SKIP_LABEL,
  SUGGEST_LABEL,
  escapeHtml,
  renderCard,
  type CardState,
} from "../src/card.ts";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";
import {
  depthTouched,
  mastLine,
  modeNote,
  openRequiredCount,
  previousAssumption,
  questionNeedsConfirm,
} from "../src/server/card.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
const cssPath = path.resolve(here, "../src/card.css");

function question(id: string, ask = `Ask ${id}`): CardState["question"] {
  return {
    id,
    module: "towel-check",
    depth: ["express", "standard", "deep"],
    ask,
    why: "Why this question.",
    input: ["text"],
    skipDefault: "Skipped default.",
    suggest: "A sample answer.",
    writes: ["PROJECT.md#audience"],
  };
}

function state(overrides: Partial<CardState> = {}): CardState {
  return {
    question: question("DP-0.1", "Is this site for you, or for a client?"),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...overrides,
  };
}

function counts(openRequired = 6) {
  return {
    index: 2,
    total: 40,
    phase: "Don't Panic",
    openRequired,
    mode: "deep" as const,
    modeNote: modeNote("deep"),
  };
}

function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function buttonTag(html: string, action: string): string {
  for (const match of html.matchAll(/<button\b[^>]*>/g)) {
    if (match[0].includes(`data-action="${action}"`)) return match[0];
  }
  assert.fail(`missing button ${action}`);
}

function region(html: string, name: string): string {
  const matched = new RegExp(`data-region="${name}"[\\s\\S]*?</(?:section|nav|footer)>`).exec(html);
  assert.ok(matched, name);
  return matched[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is AnswerRecord["status"] {
  return (
    value === "ANSWERED" ||
    value === "SUGGESTED" ||
    value === "SKIPPED" ||
    value === "SOFT" ||
    value === "IMPORTED"
  );
}

function readAnswers(projectDir: string): AnswerRecord[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.answers)
      ? parsed.answers
      : [];
  const answers: AnswerRecord[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    if (!isStatus(item.status)) continue;
    answers.push({ id: item.id, status: item.status, value: item.value });
  }
  return answers;
}

async function withDesk(
  depth: "express" | "standard" | "deep",
  run: (handle: ServerHandle, dir: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-card-use-"));
  if (depth !== "deep") {
    const folder = path.join(dir, ".hitchhiker");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "config.json"), JSON.stringify({ interviewDepth: depth }));
  }
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    await run(handle, dir);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
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
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("open required uses the same answers as coverage and does not close the brief gate", () => {
  const depth = [{ id: "DP-2.1" }, { id: "DP-2.6" }, { id: "DP-9.9" }];
  const required = ["DP-2.1", "DP-2.6", "DP-9.2"];
  const answers: AnswerRecord[] = [
    { id: "DP-2.1", status: "SKIPPED", value: "A shop that sells towels." },
    { id: "DP-2.1", status: "ANSWERED", value: "   " },
    { id: "DP-2.6", status: "SUGGESTED", value: "One visitor." },
    { id: "DP-9.2", status: "ANSWERED", value: "Hostinger." },
    { id: "DP-9.9", status: "SOFT", value: "Outside the required list." },
  ];
  // Latest DP-2.1 is blank, so it stays open. DP-9.2 is answered but outside this depth.
  assert.equal(openRequiredCount(depth, answers, required), 2);
  const filled: AnswerRecord[] = [
    { id: "DP-2.1", status: "ANSWERED", value: "Sell towels." },
    { id: "DP-2.6", status: "SOFT", value: "A buyer." },
    { id: "DP-9.2", status: "IMPORTED", value: "This machine." },
  ];
  assert.equal(openRequiredCount([{ id: "DP-2.1" }, { id: "DP-2.6" }, { id: "DP-9.2" }], filled, required), 0);
  const assumed: AnswerRecord[] = [{ id: "DP-2.1", status: "SKIPPED", value: "A shop." }];
  assert.equal(openRequiredCount([{ id: "DP-2.1" }], assumed, ["DP-2.1"]), 1);
  assert.equal(missingRequired(assumed).includes("DP-2.1"), false);
});

test("assumption, confirm, mode, and mast follow the depth list", () => {
  const questions = [{ id: "DP-0.1" }, { id: "DP-0.2" }];
  const skipped: AnswerRecord[] = [{ id: "DP-0.1", status: "SKIPPED", value: "ASSUMED: For myself." }];
  assert.deepEqual(previousAssumption(questions, skipped, "DP-0.2"), {
    value: "ASSUMED: For myself.",
    kind: "skipped",
  });
  assert.equal(previousAssumption(questions, skipped, "DP-0.1"), null);
  assert.equal(
    previousAssumption(questions, [{ id: "DP-0.1", status: "ANSWERED", value: "For myself." }], "DP-0.2"),
    null,
  );
  assert.deepEqual(
    previousAssumption(questions, [{ id: "DP-0.1", status: "SUGGESTED", value: "Yourself." }], "DP-0.2"),
    { value: "Yourself.", kind: "suggested" },
  );
  // An express seed sits outside the depth list, so it does not shrink the mast or mark the card.
  const seeded: AnswerRecord[] = [{ id: "DP-8.4", status: "SKIPPED", value: "ASSUMED: Later." }];
  assert.equal(previousAssumption(questions, seeded, "DP-0.2"), null);
  assert.equal(depthTouched(questions, seeded), false);
  assert.equal(depthTouched(questions, skipped), true);
  assert.equal(depthTouched(questions, [{ id: "DP-0.1", value: "  " }]), false);

  assert.equal(questionNeedsConfirm(null, ["DP-2.1"]), false);
  assert.equal(questionNeedsConfirm({ id: "DP-0.1" }, ["DP-2.1"]), false);
  assert.equal(questionNeedsConfirm({ id: "DP-0.2", requiredFor: ["DP-0.2a"] }, []), true);
  assert.equal(questionNeedsConfirm({ id: "DP-2.1", requiredFor: [] }, ["DP-2.1"]), true);

  assert.equal(modeNote("deep"), "Deep.");
  assert.equal(modeNote("standard"), "Standard.");
  assert.match(modeNote("express"), /not dropped/);
  assert.equal(mastLine("Don't Panic", "DP-0.2"), "Don't Panic · DP-0.2");
  assert.equal(mastLine("Don't Panic", null), "Don't Panic");
});

test("rendered card shows the ask once, the counts, one filled Answer, and the assumption", () => {
  const ask = "Is this site for you, or for a client?";
  const html = renderCard(
    state({
      counts: counts(4),
      assumption: { value: "ASSUMED: For myself.", kind: "skipped" },
      required: true,
      skipConfirm: true,
      enterHint: true,
    }),
  );
  assert.equal(occurrences(html, ask), 1);
  assert.equal(html.match(/<h2\b/g)?.length, 1);
  assert.match(html, new RegExp(`data-card-kicker>DP-0\\.1 · 2 of 40 · ${escapeHtml("Don't Panic")}<`));
  assert.match(html, /data-open-required>4 required still open</);
  assert.match(html, /data-interview-mode="deep">Deep\.</);
  assert.match(html, /data-assumed="skipped">Assumed: For myself\.</);
  assert.equal(html.includes("ASSUMED:"), false);
  assert.equal(html.match(/hh-btn--primary/g)?.length, 1);
  assert.match(buttonTag(html, "answer"), /disabled/);
  assert.match(html, /data-action="answer"[^>]*>Answer<\/button>/);
  assert.doesNotMatch(buttonTag(html, "suggest"), /hh-btn--primary/);
  assert.doesNotMatch(buttonTag(html, "skip"), /hh-btn--primary/);
  assert.match(html, new RegExp(`>${escapeHtml(SUGGEST_LABEL)}</button>`));
  assert.match(html, new RegExp(`>${escapeHtml(SKIP_LABEL)}</button>`));
  assert.equal(html.includes(`id="hh-card-hint">${escapeHtml(ANSWER_HINT)}</p>`), true);
  assert.match(html, /aria-describedby="hh-card-hint"/);
  assert.match(html, /placeholder="A sample answer\."/);
  assert.match(html, /data-skip-confirm/);
  assert.match(html, new RegExp(escapeHtml(SKIP_CONFIRM)));
  assert.match(html, /class="hh-qcard__why"[^>]*>Why this question\.<\/p>\n  <div class="hh-qcard__composer">/);
  assert.equal(html.includes("!"), false);

  const ready = renderCard(state({ draft: "For a client.", enterHint: true, counts: counts(4) }));
  assert.doesNotMatch(buttonTag(ready, "answer"), /disabled/);
  const bare = question("DP-1.1", "Do you have a logo?");
  assert.ok(bare);
  delete bare.suggest;
  const fallback = renderCard(state({ question: bare }));
  assert.match(fallback, new RegExp(`placeholder="${escapeHtml(PLACEHOLDER_FALLBACK)}"`));
  assert.equal(fallback.includes("data-card-kicker"), false);
  assert.equal(fallback.includes("hh-card-hint"), false);
  assert.match(fallback, /<p class="hh-kicker">DP-1\.1<\/p>/);
  const quiet = renderCard(state({ required: true }));
  assert.equal(quiet.includes("data-skip-confirm"), false);
});

test("composer sticks under 720px and stays in flow at 1440", () => {
  // 375 is inside max-width 719px, so the field, hint, and actions stick.
  // 1440 is outside that query, so the composer stays in normal flow.
  const css = readFileSync(cssPath, "utf8");
  const media = /@media \(max-width: 719px\) \{[\s\S]*?\n\}/.exec(css);
  assert.ok(media);
  assert.match(media[0], /position:\s*sticky/);
  assert.match(media[0], /bottom:\s*0/);
  assert.match(media[0], /env\(safe-area-inset-bottom, 0px\)/);
  assert.equal(css.replace(media[0], "").includes("position: sticky"), false);
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /!important/);
});

test("the desk page shows one ask, Deep, the open count, and a full mast", async () => {
  await withDesk("deep", async (handle, dir) => {
    const page = await raw(handle.port, "GET", "/");
    assert.equal(page.status, 200);
    const html = page.body;
    const questions = questionsForDepth(loadTree(treeFile), "deep");
    const open = openRequiredCount(questions, readAnswers(dir), requiredIds());
    const ask = "Is this site for you, or for a client?";
    // The card shows the ask once. The clipped live region repeats it for assistive tech.
    assert.equal(occurrences(region(html, "question"), ask), 1);
    assert.equal(occurrences(region(html, "transcript"), ask), 0);
    assert.match(html, /Answers land here after you send one\./);
    const phase = escapeHtml("Don't Panic");
    assert.match(html, new RegExp(`data-card-kicker>DP-0\\.1 · 1 of ${questions.length} · ${phase}<`));
    assert.match(html, new RegExp(`data-open-required>${open} required still open<`));
    assert.match(html, /data-interview-mode="deep">Deep\.</);
    assert.match(html, /placeholder="Yourself, or one named client\."/);
    assert.equal(html.includes(`id="hh-card-hint">${escapeHtml(ANSWER_HINT)}`), true);
    const card = region(html, "question");
    assert.equal(card.match(/hh-btn--primary/g)?.length, 1);
    assert.match(buttonTag(card, "answer"), /disabled/);
    assert.match(card, new RegExp(`>${escapeHtml(SUGGEST_LABEL)}</button>`));
    assert.match(card, new RegExp(`>${escapeHtml(SKIP_LABEL)}</button>`));
    assert.equal(card.includes("data-assumed"), false);
    assert.match(html, /class="hh-wordmark"/);
    assert.match(html, /<div data-mast-full>/);
    assert.match(html, /data-mast-line hidden>/);
    assert.equal(html.includes('data-mast="line"'), false);
    assert.equal(card.includes("!"), false);

    const session = await raw(handle.port, "GET", "/api/session");
    const body: unknown = JSON.parse(session.body);
    assert.ok(isRecord(body));
    assert.ok(isRecord(body.counts));
    assert.equal(body.counts.openRequired, open);
    assert.equal(body.counts.index, 1);
    assert.equal(body.counts.total, questions.length);
    assert.equal(body.required, false);
    assert.equal(body.mastCompact, false);
  });
});

test("skip marks the assumption on the next card and shrinks the mast", async () => {
  await withDesk("deep", async (handle, dir) => {
    const opening = await raw(handle.port, "GET", "/");
    const token = tokenFrom(opening.body);
    const skipped = await raw(
      handle.port,
      "POST",
      "/api/skip",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ questionId: "DP-0.1" }),
    );
    assert.equal(skipped.status, 200);
    const payload: unknown = JSON.parse(skipped.body);
    assert.ok(isRecord(payload));
    assert.ok(isRecord(payload.session));
    const session = payload.session;
    assert.ok(isRecord(session.question));
    assert.equal(session.question.id, "DP-0.2");
    assert.equal(session.required, true);
    const questions = questionsForDepth(loadTree(treeFile), "deep");
    const answers = readAnswers(dir);
    const open = openRequiredCount(questions, answers, requiredIds());
    assert.ok(isRecord(session.counts));
    assert.equal(session.counts.openRequired, open);
    assert.equal(session.counts.index, 2);
    assert.ok(isRecord(session.progress));
    assert.equal(session.progress.skipped, 1);
    assert.equal(session.mastCompact, true);
    assert.equal(session.mastLine, "Don't Panic · DP-0.2");
    assert.ok(isRecord(session.assumption));
    assert.equal(session.assumption.kind, "skipped");
    assert.equal(session.assumption.value, "For myself.");

    const page = await raw(handle.port, "GET", "/");
    const html = page.body;
    const ask = "Have you built a website before, and with what? Drop any URLs, including the old ones.";
    const previous = "Is this site for you, or for a client?";
    assert.equal(occurrences(region(html, "question"), ask), 1);
    assert.equal(occurrences(region(html, "transcript"), ask), 0);
    assert.equal(occurrences(region(html, "transcript"), previous), 1);
    assert.match(html, /data-assumed="skipped">Assumed: For myself\.</);
    const phase = escapeHtml("Don't Panic");
    assert.match(html, new RegExp(`data-card-kicker>DP-0\\.2 · 2 of ${questions.length} · ${phase}<`));
    assert.match(html, new RegExp(`data-open-required>${open} required still open<`));
    assert.match(html, /data-mast="line"/);
    assert.match(html, /<div data-mast-full hidden>/);
    assert.match(html, new RegExp(`data-mast-line>${phase} · DP-0\\.2<`));
    assert.match(html, /class="hh-wordmark"/);
    assert.equal(region(html, "question").includes("data-skip-confirm"), false);
  });
});

test("Express and Standard name the mode without treating seeds as the first answer", async () => {
  await withDesk("express", async (handle) => {
    const page = await raw(handle.port, "GET", "/");
    assert.match(page.body, /data-interview-mode="express"/);
    assert.match(
      page.body,
      /Express\. Questions outside this depth stay on file as written assumptions, not dropped\./,
    );
    assert.equal(page.body.includes("data-assumed"), false);
    assert.equal(page.body.includes('data-mast="line"'), false);
    assert.match(page.body, /<div data-mast-full>/);
  });
  await withDesk("standard", async (handle) => {
    const page = await raw(handle.port, "GET", "/");
    assert.match(page.body, /data-interview-mode="standard">Standard\.</);
  });
});

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  button?: number;
  repeat?: boolean;
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

function sessionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question: {
      id: "DP-0.1",
      module: "towel-check",
      depth: ["deep"],
      ask: "Is this site for you, or for a client?",
      why: "A client job needs its own workspace.",
      input: ["text"],
      skipDefault: "For myself.",
      suggest: "Yourself, or one named client.",
      writes: ["PROJECT.md#audience"],
    },
    pushback: null,
    done: false,
    mapHtml: "",
    transcriptHtml: "",
    statusHtml: "<span>Answer DP-0.1.</span>",
    counts: counts(6),
    assumption: null,
    required: false,
    mastCompact: false,
    mastLine: "Don't Panic · DP-0.1",
    ...overrides,
  };
}

function harness(fetchImpl: DeskEnv["fetch"], session: Record<string, unknown> = sessionPayload()) {
  const meta = element({ content: "csrf-token" });
  const field = element({ id: "hh-card-draft" });
  field.value = "";
  const regionEl = element();
  regionEl.querySelector = (selector) => (selector === "#hh-card-draft" ? field : null);
  const full = element();
  const line = element();
  line.textContent = "";
  const header = element();
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const doc = {
    querySelector(selector: string): FakeEl | null {
      if (selector === 'meta[name="hh-csrf"]') return meta;
      if (selector === '[data-region="question"]') return regionEl;
      if (selector === "[data-mast-full]") return full;
      if (selector === "[data-mast-line]") return line;
      if (selector === ".hh-mast") return header;
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
      if (url === "/api/session") return Response.json(session);
      return fetchImpl(input, init);
    },
  };
  const fire = (type: string, event: Partial<FakeEvent> = {}): void => {
    listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
  };
  return { env, region: regionEl, field, full, line, header, fire };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("the client paints the server count and shrinks the mast from that session", async () => {
  const h = harness(async () => Response.json({}), sessionPayload({
    counts: { ...counts(4), index: 2 },
    mastCompact: true,
    mastLine: "Don't Panic · DP-0.2",
    required: true,
  }));
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.match(h.region.innerHTML, /data-open-required>4 required still open</);
    assert.match(h.region.innerHTML, new RegExp(`data-card-kicker>DP-0\\.1 · 2 of 40 · ${escapeHtml("Don't Panic")}<`));
    assert.equal(h.region.innerHTML.match(/hh-btn--primary/g)?.length, 1);
    assert.match(buttonTag(h.region.innerHTML, "answer"), /disabled/);
    assert.match(h.region.innerHTML, /id="hh-card-hint"/);
    assert.equal(h.full.getAttribute("hidden"), "");
    assert.equal(h.line.getAttribute("hidden"), null);
    assert.equal(h.line.textContent, "Don't Panic · DP-0.2");
    assert.equal(h.header.getAttribute("data-mast"), "line");
  } finally {
    stop();
  }
});

test("Enter submits, Shift+Enter and an open composition do not", async () => {
  const posts: Array<{ url: string; body: string }> = [];
  const h = harness(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    posts.push({ url, body: String(init?.body ?? "") });
    return Response.json({
      session: sessionPayload({
        question: {
          id: "DP-0.2",
          ask: "Have you built a website before?",
          why: "Prior sites set the level.",
          depth: ["deep"],
          input: ["text"],
          skipDefault: "No prior site.",
          writes: [],
        },
        counts: counts(6),
        mastCompact: true,
        mastLine: "Don't Panic · DP-0.2",
      }),
    });
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    let prevented = 0;
    const prevent = (): void => {
      prevented += 1;
    };
    h.field.value = "For a client.";
    h.fire("keydown", { target: h.field, key: "Enter", shiftKey: true, preventDefault: prevent });
    await settle();
    assert.equal(prevented, 0);
    assert.equal(posts.length, 0);

    h.fire("keydown", { target: h.field, key: "Enter", isComposing: true, preventDefault: prevent });
    await settle();
    assert.equal(prevented, 0);
    assert.equal(posts.length, 0);

    h.field.value = "   ";
    h.fire("keydown", { target: h.field, key: "Enter", preventDefault: prevent });
    await settle();
    assert.equal(prevented, 1);
    assert.equal(posts.length, 0);
    assert.match(h.region.innerHTML, /Write an answer or skip\./);

    h.field.value = "For a client.";
    h.fire("keydown", { target: h.field, key: "Enter", preventDefault: prevent });
    await settle();
    assert.equal(prevented, 2);
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.url, "/api/answer");
    assert.match(posts[0]?.body ?? "", /For a client\./);
    assert.match(h.region.innerHTML, /data-question-id="DP-0\.2"/);
  } finally {
    stop();
  }
});

test("Skip confirms a required field and posts on the second choice", async () => {
  const posts: string[] = [];
  const required = harness(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    posts.push(url);
    const question = sessionPayload().question;
    assert.ok(isRecord(question));
    return Response.json({ session: sessionPayload({ question: { ...question, id: "DP-0.2" } }) });
  }, sessionPayload({ required: true }));
  const stop = mountDesk(required.env);
  try {
    await settle();
    const skip = element({ "data-action": "skip" });
    required.fire("click", { target: skip });
    await settle();
    assert.equal(posts.length, 0);
    assert.match(required.region.innerHTML, /data-skip-confirm/);
    assert.match(required.region.innerHTML, new RegExp(escapeHtml(SKIP_CONFIRM)));
    assert.match(required.region.innerHTML, new RegExp(`>${escapeHtml(SKIP_LABEL)}</button>`));

    required.fire("click", { target: skip });
    await settle();
    assert.deepEqual(posts, ["/api/skip"]);
  } finally {
    stop();
  }

  const optionalPosts: string[] = [];
  const optional = harness(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    optionalPosts.push(url);
    return Response.json({ session: sessionPayload() });
  });
  const stopOptional = mountDesk(optional.env);
  try {
    await settle();
    optional.fire("click", { target: element({ "data-action": "skip" }) });
    await settle();
    assert.deepEqual(optionalPosts, ["/api/skip"]);
    assert.equal(optional.region.innerHTML.includes("data-skip-confirm"), false);
  } finally {
    stopOptional();
  }
});
