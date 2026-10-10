/**
 * Map links, the next-action footer, and the trimmed transcript (prompt 168).
 * Rendered HTML from GET /, plus one edit posted to /api/answer.
 * Width, from the fold rules in the desk response.
 * 375 is inside max-width 719px: the summary shows and a closed disclosure hides the list.
 * 1440 is inside min-width 720px: the summary is hidden and the phase list stays in the rail.
 * Chromium keeps a closed details body at content-visibility:hidden on ::details-content.
 * The wide rule must set that to visible or the rail paints at height 0.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree, questionsForDepth, type AnswerRecord } from "@hitchhiker/engine";
import { escapeHtml, SKIP_LABEL, SUGGEST_LABEL } from "../src/card.ts";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";
import { compactMapLabel, savedFooterLine } from "../src/server/card.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");

const PHASE_LINKS = [
  ["/", "Don't Panic"],
  ["/brand", "Babel Fish"],
  ["/approve", "Deep Thought"],
  ["/hh-dashboard", "Improbability Drive"],
  ["/hh-dashboard", "Mostly Harmless"],
  ["/hh-dashboard", "So Long and Thanks for All the Fish"],
] as const;

function deepQuestions() {
  return questionsForDepth(loadTree(treeFile), "deep");
}

function writeInterview(dir: string, answers: readonly AnswerRecord[]): void {
  const folder = path.join(dir, ".hitchhiker");
  mkdirSync(folder, { recursive: true });
  const file = {
    version: 1,
    answers,
    cursor: answers.length,
    pushedIds: [],
  };
  writeFileSync(path.join(folder, "interview.json"), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

async function withDesk(
  prepare: (dir: string) => void,
  run: (handle: ServerHandle, dir: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-map-footer-"));
  let handle: ServerHandle | undefined;
  try {
    prepare(dir);
    handle = await startServer({ projectDir: dir, open: false });
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

function region(html: string, name: string): string {
  const matched = new RegExp(`data-region="${name}"[\\s\\S]*?</(?:section|nav|footer)>`).exec(html);
  assert.ok(matched, name);
  return matched[0];
}

function answer(id: string, value: string): AnswerRecord {
  return { id, status: "ANSWERED", value };
}

test("map phases link to desks and exactly one is the current step", async () => {
  const questions = deepQuestions();
  await withDesk(
    () => undefined,
    async (handle) => {
      const response = await fetch(handle.url);
      assert.equal(response.status, 200);
      const policy = response.headers.get("content-security-policy") ?? "";
      assert.match(policy, /style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
      assert.equal(policy.includes("unsafe-inline"), false);
      const html = await response.text();
      const map = region(html, "map");
      assert.equal(map.match(/<a class="hh-map__name"/g)?.length, PHASE_LINKS.length);
      for (const [href, name] of PHASE_LINKS) {
        const current = name === "Don't Panic" ? ' aria-current="step"' : "";
        assert.match(map, new RegExp(`<a class="hh-map__name" href="${href}"${current}>${name}</a>`));
      }
      assert.equal(map.match(/aria-current="step"/g)?.length, 1);
      assert.equal(html.match(/aria-current="step"/g)?.length, 1);
      assert.match(map, /<details class="hh-map-fold">/);
      assert.match(
        map,
        new RegExp(`<summary>${escapeHtml(compactMapLabel("Don't Panic", 1, questions.length))}</summary>`),
      );
      assert.match(html, /@media \(max-width: 719px\)/);
      assert.match(html, /\.hh-map-fold:not\(\[open\]\) > \.hh-map \{ display: none; \}/);
      assert.match(html, /\.hh-map-fold > summary \{[\s\S]*display: list-item;/);
      assert.match(html, /@media \(min-width: 720px\)/);
      assert.match(html, /\.hh-map-fold::details-content \{ content-visibility: visible; \}/);
      assert.match(html, /\.hh-map-fold > \.hh-map \{ display: grid; \}/);
      assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
      const withoutLabels = html
        .replaceAll(escapeHtml(SUGGEST_LABEL), "")
        .replaceAll(escapeHtml(SKIP_LABEL), "");
      assert.equal(withoutLabels.includes("\u2014"), false);

      for (const href of ["/", "/brand", "/approve", "/hh-dashboard"]) {
        const page = await fetch(new URL(href, handle.url));
        assert.equal(page.status, 200, href);
      }
    },
  );
});

test("the footer is the next action once an answer is saved", async () => {
  const questions = deepQuestions();
  const first = questions[0];
  const second = questions[1];
  assert.ok(first);
  assert.ok(second);
  await withDesk(
    (dir) => {
      writeInterview(dir, [answer(first.id, "For myself.")]);
    },
    async (handle) => {
      const html = await (await fetch(handle.url)).text();
      const status = region(html, "status");
      const line = savedFooterLine(second.id, questions.length - 2);
      assert.match(status, new RegExp(`<span>${escapeHtml(line)}</span>`));
      assert.equal(status.includes("Guide is quiet"), false);
      assert.equal(status.includes("Ready."), false);
      assert.match(region(html, "map"), new RegExp(escapeHtml(compactMapLabel("Don't Panic", 2, questions.length))));
    },
  );
});

test("five turns show the last three and Edit on every previous answer", async () => {
  const questions = deepQuestions();
  assert.ok(questions.length >= 6);
  const stored = questions.slice(0, 5).map((question, index) => answer(question.id, `Answer ${index + 1}.`));
  const current = questions[5];
  assert.ok(current);
  await withDesk(
    (dir) => {
      writeInterview(dir, stored);
    },
    async (handle) => {
      const html = await (await fetch(handle.url)).text();
      const transcript = region(html, "transcript");
      const earlier = /<details\b[^>]*data-earlier[\s\S]*?<\/details>/.exec(transcript);
      assert.ok(earlier);
      assert.match(earlier[0], /<summary>Earlier<\/summary>/);
      assert.equal(earlier[0].match(/data-answer-id="/g)?.length, 2);
      assert.match(earlier[0], new RegExp(`data-answer-id="${stored[0]?.id}"`));
      assert.match(earlier[0], new RegExp(`data-answer-id="${stored[1]?.id}"`));
      const rest = transcript.replace(earlier[0], "");
      assert.equal(rest.match(/data-answer-id="/g)?.length, 3);
      assert.equal(rest.includes(`data-answer-id="${stored[0]?.id}"`), false);
      assert.match(rest, new RegExp(`data-answer-id="${stored[2]?.id}"`));
      assert.match(rest, new RegExp(`data-answer-id="${stored[4]?.id}"`));
      assert.equal(transcript.match(/>Edit<\/button>/g)?.length, 5);
      assert.equal(earlier[0].match(/>Edit<\/button>/g)?.length, 2);
      assert.equal(rest.match(/>Edit<\/button>/g)?.length, 3);
      assert.equal(transcript.includes("Answers land here after you send one."), false);
      assert.equal(occurrences(region(html, "question"), current.ask), 1);
      assert.equal(occurrences(transcript, current.ask), 0);
      const line = savedFooterLine(current.id, questions.length - 6);
      assert.match(region(html, "status"), new RegExp(`<span>${escapeHtml(line)}</span>`));
      assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
    },
  );
});

test("Edit reuses /api/answer and replaces the stored text", async () => {
  const questions = deepQuestions();
  const first = questions[0];
  const second = questions[1];
  assert.ok(first);
  assert.ok(second);
  await withDesk(
    (dir) => {
      writeInterview(dir, [answer(first.id, "For myself.")]);
    },
    async (handle, dir) => {
      const page = await fetch(handle.url);
      const token = tokenFrom(await page.text());
      const posted = await fetch(new URL("/api/answer", handle.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": token },
        body: JSON.stringify({ questionId: first.id, text: "For a client." }),
      });
      assert.equal(posted.status, 200);
      const body = (await posted.json()) as { session?: { question?: { id?: string } } };
      assert.equal(body.session?.question?.id, second.id);
      const file = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
        answers: Array<{ id: string; status: string; value: string }>;
        cursor: number;
      };
      assert.equal(file.answers.length, 1);
      assert.equal(file.answers[0]?.id, first.id);
      assert.equal(file.answers[0]?.status, "ANSWERED");
      assert.equal(file.answers[0]?.value, "For a client.");
      assert.equal(file.cursor, 1);

      const again = await fetch(new URL("/api/answer", handle.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": token },
        body: JSON.stringify({ questionId: first.id, text: "For a client." }),
      });
      assert.equal(again.status, 200);
      const retry = (await again.json()) as { session?: { statusHtml?: string } };
      assert.match(retry.session?.statusHtml ?? "", /already saved/);
      const after = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
        answers: Array<{ id: string; value: string }>;
      };
      assert.equal(after.answers.length, 1);
      assert.equal(after.answers[0]?.value, "For a client.");

      const html = await (await fetch(handle.url)).text();
      const transcript = region(html, "transcript");
      assert.match(transcript, />Edit<\/button>/);
      assert.match(transcript, /For a client\./);
      assert.equal(transcript.includes("For myself."), false);
    },
  );
});

function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

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

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("the Edit control posts the revised text to /api/answer", async () => {
  const posts: Array<{ url: string; body: string }> = [];
  const meta = element({ content: "csrf-token" });
  const draft = element({ id: "hh-card-draft" });
  draft.value = "";
  const question = element();
  question.querySelector = (selector) => (selector === "#hh-card-draft" ? draft : null);
  const form = element({ "data-edit-form": "DP-0.1", hidden: "" });
  const field = element({ "data-edit-field": "DP-0.1" });
  field.value = "For a client.";
  const transcript = element();
  transcript.querySelector = (selector) => {
    if (selector === '[data-edit-form="DP-0.1"]') return form;
    if (selector === '[data-edit-field="DP-0.1"]') return field;
    return null;
  };
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const session = {
    question: {
      id: "DP-0.2",
      module: "towel-check",
      depth: ["deep"],
      ask: "Have you built a website before?",
      why: "Prior sites set the level.",
      input: ["text"],
      skipDefault: "No prior site.",
      writes: [],
    },
    pushback: null,
    done: false,
    mapHtml: "",
    transcriptHtml: '<button type="button" data-edit="DP-0.1">Edit</button>',
    statusHtml: "<span>Saved · DP-0.2 · 20 left</span>",
    counts: null,
    assumption: null,
    required: false,
    mastCompact: true,
    mastLine: "Don't Panic · DP-0.2",
  };
  const env: DeskEnv = {
    document: {
      querySelector(selector: string) {
        if (selector === 'meta[name="hh-csrf"]') return meta;
        if (selector === '[data-region="question"]') return question;
        if (selector === '[data-region="transcript"]') return transcript;
        if (selector === '[data-region="status"]') return element();
        if (selector === '[data-region="map"]') return element();
        if (selector === "[data-mast-full]") return element({ hidden: "" });
        if (selector === "[data-mast-line]") return element();
        if (selector === ".hh-mast") return element();
        return null;
      },
      addEventListener(type, listener) {
        listeners.set(type, listener as (event: FakeEvent) => void);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    },
    EventSource: class {
      addEventListener(): void {}
      close(): void {}
    } as unknown as DeskEnv["EventSource"],
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/session") return Response.json(session);
      if (init?.method === "POST") posts.push({ url, body: String(init.body ?? "") });
      return Response.json({ session });
    },
  };
  const stop = mountDesk(env);
  try {
    await settle();
    const fire = (target: FakeEl): void => {
      listeners.get("click")?.({ target, preventDefault() {} });
    };
    field.value = "   ";
    fire(element({ "data-edit-save": "DP-0.1" }));
    await settle();
    assert.equal(posts.length, 0);
    assert.match(question.innerHTML, /Write an answer or skip\./);

    fire(element({ "data-edit": "DP-0.1" }));
    assert.equal(form.getAttribute("hidden"), null);
    field.value = "For a client.";
    fire(element({ "data-edit-save": "DP-0.1" }));
    await settle();
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.url, "/api/answer");
    assert.match(posts[0]?.body ?? "", /"questionId":"DP-0\.1"/);
    assert.match(posts[0]?.body ?? "", /For a client\./);
  } finally {
    stop();
  }
});
