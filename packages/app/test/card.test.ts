import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { InterviewCommand, Question } from "@hitchhiker/engine";
import {
  bindCard,
  reduceCard,
  renderCard,
  type CardSession,
  type CardState,
} from "../src/card.ts";
import { reduceCard as reduceExported, renderCard as renderExported } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../src/card.css");

function question(id: string, ask: string, why = "The logo anchors color, type, and tone."): Question {
  return {
    id,
    module: "ford-field-notes",
    depth: ["express", "standard", "deep"],
    ask,
    why,
    input: ["text", "voice"],
    skipDefault: "SKIP-DEFAULT-SHOULD-NOT-RENDER",
    suggest: "SUGGEST-TEXT-SHOULD-NOT-RENDER",
    followUps: [{ id: `${id}-later`, ask: "FOLLOW-UP-SHOULD-NOT-RENDER" }],
    writes: ["BRAND.md#logo"],
  };
}

function state(overrides: Partial<CardState> = {}): CardState {
  const base: CardState = {
    question: question("DP-1.1", "Do you have a logo you love?"),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
  return { ...base, ...overrides };
}

function throwingSession(current: Question | null): CardSession & { calls: number } {
  return {
    calls: 0,
    command() {
      this.calls += 1;
      throw new Error("command should not be called");
    },
    next() {
      return current;
    },
    lastPushback: null,
  };
}

function buttonTag(html: string, action: string): string {
  for (const match of html.matchAll(/<button\b[^>]*>/g)) {
    if (match[0].includes(`data-action="${action}"`)) return match[0];
  }
  assert.fail(`missing button ${action}`);
}

test("the app index exports the card functions", () => {
  assert.equal(renderExported, renderCard);
  assert.equal(reduceExported, reduceCard);
});

test("an ask and a why that contain markup are escaped", () => {
  const html = renderCard(
    state({
      question: question(
        `A&B<C">`,
        `Before <script>alert(1)</script> & after`,
        `Because <b>x</b> > y`,
      ),
      draft: `</textarea><script>alert(1)</script>`,
    }),
  );
  assert.equal(html.match(/<h2\b/g)?.length, 1);
  assert.match(html, /data-question-id="A&amp;B&lt;C&quot;&gt;"/);
  assert.match(html, /Before &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; after/);
  assert.match(html, /Because &lt;b&gt;x&lt;\/b&gt; &gt; y/);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>/);
  assert.doesNotMatch(html, /<\/textarea><script>/);
});

test("the speech-service note stays off the card until Hold to talk has been used", () => {
  const plain = renderCard(state());
  assert.equal(plain.includes("data-voice-note"), false);
  const used = renderCard(state({ voiceNote: true }));
  assert.match(used, /data-voice-note>Chrome sends this audio to its speech service\.</);
  assert.doesNotMatch(used, /!/);
});

test("the card shows one question and the three exact actions", () => {
  const html = renderCard(state());
  assert.match(html, /<h2 class="hh-qcard__title"[^>]*>Do you have a logo you love\?<\/h2>/);
  assert.match(html, /<p class="hh-qcard__why">The logo anchors color, type, and tone\.<\/p>/);
  assert.equal(html.match(/data-question-id=/g)?.length, 1);
  assert.match(html, /data-question-id="DP-1\.1"/);
  assert.equal(html.match(/<button\b/g)?.length, 4);
  assert.match(html, /<button class="hh-btn hh-btn--secondary" type="button" data-voice="hold">Hold to talk<\/button>/);
  assert.doesNotMatch(html, /style=/);
  assert.match(buttonTag(html, "answer"), /type="button"/);
  assert.match(buttonTag(html, "answer"), /\sdisabled(?:\s|>)/);
  assert.match(html, /data-action="answer"[^>]*>Answer<\/button>/);
  assert.match(html, /data-action="suggest"[^>]*>Suggest: I&#39;ll mark it as assumed<\/button>/);
  assert.match(html, /data-action="skip"[^>]*>Skip: we&#39;ll assume<\/button>/);
  assert.match(buttonTag(html, "suggest"), /type="button"/);
  assert.match(buttonTag(html, "skip"), /type="button"/);
  assert.doesNotMatch(buttonTag(html, "suggest"), /disabled/);
  assert.doesNotMatch(buttonTag(html, "skip"), /disabled/);
  assert.doesNotMatch(html, /FOLLOW-UP-SHOULD-NOT-RENDER/);
  assert.match(html, /placeholder="SUGGEST-TEXT-SHOULD-NOT-RENDER"/);
  assert.equal(
    html.replace('placeholder="SUGGEST-TEXT-SHOULD-NOT-RENDER"', "").includes("SUGGEST-TEXT-SHOULD-NOT-RENDER"),
    false,
  );
  assert.doesNotMatch(html, /SKIP-DEFAULT-SHOULD-NOT-RENDER/);
  assert.doesNotMatch(html, /NEXT-ASK-SHOULD-NOT-RENDER/);
  assert.doesNotMatch(html, /coverage|answered:|suggested:|skipped:/i);
  assert.doesNotMatch(html, /!/);
  assert.equal(html.split("Do you have a logo you love?").length - 1, 1);
});

test("a draft enables Answer, and pushback keeps the field empty", () => {
  const ready = renderCard(state({ draft: "A brass wordmark." }));
  assert.doesNotMatch(buttonTag(ready, "answer"), /disabled/);
  assert.match(ready, /<textarea\b[^>]*>A brass wordmark\.<\/textarea>/);

  const held = renderCard(
    state({
      draft: "fine",
      pushback: `You wrote "fine". Name one concrete detail.`,
    }),
  );
  assert.match(held, /data-pushback="You wrote &quot;fine&quot;\. Name one concrete detail\."/);
  assert.match(held, /<textarea\b[^>]*><\/textarea>/);
  assert.match(buttonTag(held, "answer"), /disabled/);
  assert.match(held, /You wrote &quot;fine&quot;\. Name one concrete detail\./);
  assert.doesNotMatch(held, /<textarea\b[^>]*>fine<\/textarea>/);
});

test("an empty submit sets the error and does not call command", async () => {
  const session = throwingSession(question("DP-1.1", "Do you have a logo you love?"));
  const current = state();
  const empty = await reduceCard(current, { type: "submit" }, session);
  assert.equal(session.calls, 0);
  assert.equal(empty.error, "Write an answer or skip.");
  assert.equal(empty.question?.id, "DP-1.1");
  assert.equal(empty.done, false);
  assert.equal(empty.pending, false);

  const blank = await reduceCard(state({ draft: "   \n\t" }), { type: "submit" }, session);
  assert.equal(session.calls, 0);
  assert.equal(blank.error, "Write an answer or skip.");
});

test("typing updates the draft and does not call command", async () => {
  const session = throwingSession(question("DP-1.1", "Do you have a logo you love?"));
  const typed = await reduceCard(
    state({ error: "Write an answer or skip." }),
    { type: "type", text: "A brass wordmark." },
    session,
  );
  assert.equal(session.calls, 0);
  assert.equal(typed.draft, "A brass wordmark.");
  assert.equal(typed.error, null);
  assert.equal(typed.question?.id, "DP-1.1");
});

test("submit with text calls answer, then next", async () => {
  const order: string[] = [];
  const second = question("DP-1.2", "Which colours are already decided?");
  let pushback: string | null = "stale";
  const session: CardSession = {
    async command(input: InterviewCommand) {
      order.push("command");
      assert.deepEqual(input, { type: "answer", text: "A brass wordmark." });
      pushback = null;
      return null;
    },
    next() {
      order.push("next");
      return second;
    },
    get lastPushback() {
      return pushback;
    },
  };
  const next = await reduceCard(state({ draft: "A brass wordmark." }), { type: "submit" }, session);
  assert.deepEqual(order, ["command", "next"]);
  assert.equal(next.question?.id, "DP-1.2");
  assert.equal(next.draft, "");
  assert.equal(next.pushback, null);
  assert.equal(next.error, null);
  assert.equal(next.done, false);
  assert.equal(next.pending, false);
  const html = renderCard(next);
  assert.match(html, /Which colours are already decided\?/);
  assert.doesNotMatch(html, /Do you have a logo you love\?/);
  assert.doesNotMatch(html, /NEXT-ASK-SHOULD-NOT-RENDER/);
});

test("suggest calls suggest and then next", async () => {
  const order: string[] = [];
  const second = question("DP-1.2", "Which colours are already decided?");
  const session: CardSession = {
    async command(input: InterviewCommand) {
      order.push(`command:${input.type}`);
      assert.deepEqual(input, { type: "suggest" });
      return null;
    },
    next() {
      order.push("next");
      return second;
    },
    lastPushback: null,
  };
  const next = await reduceCard(state({ draft: "ignored" }), { type: "suggest" }, session);
  assert.deepEqual(order, ["command:suggest", "next"]);
  assert.equal(next.question?.id, "DP-1.2");
  assert.equal(next.draft, "");
  assert.equal(next.pushback, null);
});

test("skip calls skip and then next", async () => {
  const order: string[] = [];
  const second = question("DP-1.2", "Which colours are already decided?");
  const session: CardSession = {
    async command(input: InterviewCommand) {
      order.push(`command:${input.type}`);
      assert.deepEqual(input, { type: "skip" });
      return null;
    },
    next() {
      order.push("next");
      return second;
    },
    lastPushback: null,
  };
  const next = await reduceCard(state(), { type: "skip" }, session);
  assert.deepEqual(order, ["command:skip", "next"]);
  assert.equal(next.question?.id, "DP-1.2");
  assert.equal(next.done, false);
  const html = renderCard(next);
  assert.doesNotMatch(html, /FOLLOW-UP-SHOULD-NOT-RENDER/);
  assert.match(html, /data-question-id="DP-1\.2"/);
});

test("a held answer stays on the question and shows pushback", async () => {
  const current = question("DP-5.3", "How should the site feel?");
  let pushback: string | null = null;
  const session: CardSession = {
    async command(input: InterviewCommand) {
      assert.deepEqual(input, { type: "answer", text: "It's fine" });
      pushback = `You wrote "fine". Name one concrete detail.`;
      return null;
    },
    next() {
      return current;
    },
    get lastPushback() {
      return pushback;
    },
  };
  const held = await reduceCard(
    state({ question: current, draft: "It's fine" }),
    { type: "submit" },
    session,
  );
  assert.equal(held.question?.id, "DP-5.3");
  assert.equal(held.done, false);
  assert.equal(held.draft, "");
  assert.equal(held.pushback, `You wrote "fine". Name one concrete detail.`);
  const html = renderCard(held);
  assert.match(html, /data-pushback="/);
  assert.match(html, /<textarea\b[^>]*><\/textarea>/);
  assert.doesNotMatch(html, /FOLLOW-UP-SHOULD-NOT-RENDER/);
});

test("a failed command stays on the question", async () => {
  const session: CardSession = {
    command() {
      return Promise.reject(new Error("The interview session is single-flight. Wait for the in-progress command."));
    },
    next() {
      return question("DP-9.9", "This ask must not replace the card.");
    },
    lastPushback: null,
  };
  const next = await reduceCard(state({ draft: "A brass wordmark." }), { type: "submit" }, session);
  assert.equal(next.question?.id, "DP-1.1");
  assert.equal(next.done, false);
  assert.equal(next.pending, false);
  assert.equal(next.draft, "A brass wordmark.");
  assert.match(next.error ?? "", /single-flight/);
});

test("a second submit while pending returns the same state", async () => {
  const session = throwingSession(question("DP-1.1", "Do you have a logo you love?"));
  const pending = state({ pending: true, draft: "A brass wordmark." });
  const submit = await reduceCard(pending, { type: "submit" }, session);
  const suggest = await reduceCard(pending, { type: "suggest" }, session);
  const skip = await reduceCard(pending, { type: "skip" }, session);
  assert.equal(submit, pending);
  assert.equal(suggest, pending);
  assert.equal(skip, pending);
  assert.equal(session.calls, 0);
});

test("done renders Guide Entry is next and no buttons", async () => {
  const order: string[] = [];
  const session: CardSession = {
    async command() {
      order.push("command");
      return null;
    },
    next() {
      order.push("next");
      return null;
    },
    lastPushback: null,
  };
  const done = await reduceCard(state(), { type: "skip" }, session);
  assert.deepEqual(order, ["command", "next"]);
  assert.equal(done.done, true);
  assert.equal(done.question, null);
  const html = renderCard(done);
  assert.match(html, /<h2[^>]*>Guide Entry is next\.<\/h2>/);
  assert.doesNotMatch(html, /<button\b/);
  assert.doesNotMatch(html, /data-action=/);
  assert.doesNotMatch(html, /textarea/i);
  assert.doesNotMatch(html, /approved/i);
  assert.doesNotMatch(html, /!/);
  assert.doesNotMatch(html, /Do you have a logo you love\?/);
});

test("a question with resources lists where to look, and one without does not", () => {
  const plain = renderCard(state());
  assert.doesNotMatch(plain, /Where to look/);
  assert.doesNotMatch(plain, /<details/);
  assert.doesNotMatch(plain, /target="_blank"/);
  assert.match(plain, /<p class="hh-qcard__why">The logo anchors color, type, and tone\.<\/p>\n  <div class="hh-qcard__composer">\n  <label/);

  const html = renderCard(
    state({
      question: {
        ...question(
          "DP-5.1",
          "Name three to five sites you love.",
          "Three to five keeps the board small enough to use.",
        ),
        resources: [
          {
            label: `Awwwards <script>`,
            url: `https://example.com/?a=1&b=2"onclick`,
            note: `bold & "experimental"`,
          },
          {
            label: "Land-book",
            url: "https://land-book.com",
            note: "landing pages sorted by industry and style.",
          },
          {
            label: "Old",
            url: "http://example.com",
            note: "not a link",
          },
          {
            label: "And",
            note: "competitors and brands you already admire in your own industry.",
          },
        ],
      },
    }),
  );
  assert.ok(html.indexOf("hh-qcard__why") < html.indexOf("hh-qcard__look"));
  assert.ok(html.indexOf("hh-qcard__look") < html.indexOf("hh-qcard__field"));
  assert.match(html, /<details class="hh-qcard__look" open>/);
  assert.match(html, /<summary>Where to look<\/summary>/);
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(anchors.length, 2);
  for (const tag of anchors) {
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noopener noreferrer"/);
    assert.match(tag, /href="https:/);
  }
  assert.match(
    html,
    /<a href="https:\/\/example.com\/\?a=1&amp;b=2&quot;onclick" target="_blank" rel="noopener noreferrer">Awwwards &lt;script&gt;<\/a>, bold &amp; &quot;experimental&quot;/,
  );
  assert.match(html, /<li>Old: not a link<\/li>/);
  assert.match(html, /<li>And: competitors and brands you already admire in your own industry\.<\/li>/);
  assert.doesNotMatch(html, /href="http:/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /!/);
});

test("card css stacks the actions and uses the rule outline", () => {
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /outline:\s*2px solid var\(--rule\)/);
  assert.match(css, /\.hh-qcard \.hh-qcard__actions\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.hh-btn\s*\{[^}]*display:\s*block/s);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /indigo|violet|purple|magenta/i);
  assert.doesNotMatch(css, /rounded-full|bg-indigo|magnetic|!important/);
  assert.match(css, /\.hh-qcard__look\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.hh-qcard__look li\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
});

test("bindCard sends skip once and refuses an empty answer", async () => {
  const calls: InterviewCommand[] = [];
  let cursor = 0;
  const first = question("DP-1.1", "Do you have a logo you love?");
  const second = question("DP-1.2", "Which colours are already decided?");
  const questions = [first, second];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session: CardSession = {
    async command(input: InterviewCommand) {
      calls.push(input);
      await gate;
      cursor += 1;
      return null;
    },
    next() {
      return questions[cursor] ?? null;
    },
    lastPushback: null,
  };

  const root = fakeRoot();
  const stop = bindCard(root, session);
  assert.match(root.innerHTML, /Do you have a logo you love\?/);
  assert.doesNotMatch(root.innerHTML, /Which colours are already decided\?/);

  const answer = fakeNode();
  answer.attrs.set("data-action", "answer");
  root.emit("click", answer);
  await settle();
  assert.equal(calls.length, 0);
  assert.match(root.innerHTML, /Write an answer or skip\./);
  assert.match(root.innerHTML, /Do you have a logo you love\?/);

  const skip = fakeNode();
  skip.attrs.set("data-action", "skip");
  root.emit("click", skip);
  root.emit("click", skip);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { type: "skip" });
  release();
  await settle();
  assert.equal(calls.length, 1);
  assert.match(root.innerHTML, /Which colours are already decided\?/);
  assert.doesNotMatch(root.innerHTML, /Do you have a logo you love\?/);
  assert.doesNotMatch(root.innerHTML, /FOLLOW-UP-SHOULD-NOT-RENDER/);
  stop();
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface Listener {
  (event: { target: FakeNode | null; preventDefault(): void }): void;
}

class FakeNode {
  innerHTML = "";
  textContent: string | null = null;
  disabled = false;
  value = "";
  parentElement: FakeNode | null = null;
  attrs = new Map<string, string>();
  listeners = new Map<string, Listener[]>();

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  querySelector(selector: string): FakeNode | null {
    if (selector === '[data-action="answer"]') return this.found ?? null;
    if (selector === "[data-card-error]") return this.foundError ?? null;
    return null;
  }

  found: FakeNode | null = null;
  foundError: FakeNode | null = null;

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = (this.listeners.get(type) ?? []).filter((item) => item !== listener);
    this.listeners.set(type, list);
  }

  emit(type: string, target: FakeNode | null): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({
        target,
        preventDefault() {},
      });
    }
  }
}

function fakeNode(): FakeNode {
  return new FakeNode();
}

function fakeRoot(): FakeNode {
  return new FakeNode();
}
