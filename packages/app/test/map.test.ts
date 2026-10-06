import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnswerRecord, GuideState, Question } from "@hitchhiker/engine";
import { PHASES, renderGuideMap, renderMap } from "../src/map.ts";

function state(overrides: Partial<GuideState> = {}): GuideState {
  const base: GuideState = {
    phase: "Don't Panic",
    slice: "Towel Check",
    promptId: "interview:DP-4.2",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-4.2.",
    updatedAt: "2026-10-06T18:04:05.000Z",
  };
  return { ...base, ...overrides };
}

function question(id: string, module: string): Question {
  return {
    id,
    module,
    depth: ["deep"],
    ask: "What should this page do?",
    why: "The brief needs a concrete answer.",
    input: ["text"],
    skipDefault: "A sensible default.",
    writes: ["SITE-BRIEF.md"],
  };
}

function answer(id: string, status: AnswerRecord["status"]): AnswerRecord {
  return { id, status, value: `${id} value` };
}

function listItems(html: string): string[] {
  const matches = html.match(/<li\b[\s\S]*?<\/li>/g);
  assert.ok(matches);
  return matches;
}

function moduleHtml(html: string, name: string): string {
  const item = listItems(html).find((entry) => entry.includes(`data-module="${name}"`));
  assert.ok(item, name);
  return item;
}

test("PHASES is the six locked names, in order", () => {
  assert.deepEqual(PHASES, [
    "Don't Panic",
    "Babel Fish",
    "Deep Thought",
    "Improbability Drive",
    "Mostly Harmless",
    "So Long and Thanks for All the Fish",
  ]);
});

test("Babel Fish is the only current phase, and every locked name is listed", () => {
  const html = renderMap(
    state({
      phase: "Babel Fish",
      nextAction: 'Pick up <script> & "quotes"',
    }),
  );
  const items = listItems(html);
  assert.equal(items.length, 6);

  let cursor = -1;
  for (const name of PHASES) {
    const at = html.indexOf(`>${name}<`);
    assert.ok(at > cursor, name);
    cursor = at;
  }

  const current = items.filter((item) => item.includes('data-current="true"'));
  assert.equal(current.length, 1);
  const marked = current[0];
  assert.ok(marked);
  assert.match(marked, />Babel Fish</);
  assert.match(marked, /hh-map__item--current/);
  assert.match(marked, /Pick up &lt;script&gt; &amp; "quotes"/);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&amp;amp;"), false);

  for (const item of items) {
    if (item === marked) continue;
    assert.equal(item.includes("data-current"), false);
    assert.equal(item.includes("hh-map__item--current"), false);
  }
  assert.equal(html.includes("!"), false);
});

test("phase comparison is exact", () => {
  assert.throws(() => renderMap(state({ phase: "dont panic" })), /Unknown phase: dont panic/);
  assert.throws(() => renderMap(state({ phase: "Don't panic" })), /Unknown phase/);
  assert.throws(() => renderMap(state({ phase: "dont-panic" })), /Unknown phase/);
  const html = renderMap(state({ phase: "Don't Panic", nextAction: "" }));
  const items = listItems(html);
  assert.equal(items.filter((item) => item.includes('data-current="true"')).length, 1);
  assert.match(items[0] ?? "", /data-current="true"/);
  assert.match(items[0] ?? "", />Don't Panic</);
});

test("a module shows 3 answered, 2 skipped as assumed, and 1 soft on that module only", () => {
  const tree = [
    question("DP-0.1", "towel-check"),
    question("DP-2.1", "the-question"),
    question("DP-2.2", "the-question"),
    question("DP-2.3", "the-question"),
    question("DP-2.4", "the-question"),
    question("DP-2.5", "the-question"),
    question("DP-2.6", "the-question"),
    question("DP-2.7", "the-question"),
    question("DP-3.1", "tools"),
  ];
  const answers: AnswerRecord[] = [
    answer("DP-2.1", "SKIPPED"),
    answer("DP-2.1", "ANSWERED"),
    answer("DP-2.2", "ANSWERED"),
    answer("DP-2.3", "ANSWERED"),
    answer("DP-2.4", "SKIPPED"),
    answer("DP-2.5", "SKIPPED"),
    answer("DP-2.6", "SOFT"),
    answer("DP-0.1", "SUGGESTED"),
    answer("DP-3.1", "IMPORTED"),
    answer("DP-9.9", "ANSWERED"),
  ];
  const html = renderGuideMap(answers, tree);
  const questionModule = moduleHtml(html, "the-question");
  assert.match(questionModule, /data-status="answered" data-count="3"/);
  assert.match(questionModule, /3 answered\. DP-2\.1, DP-2\.2, DP-2\.3\./);
  assert.match(questionModule, /data-status="assumed" data-count="2"/);
  assert.match(questionModule, /2 assumed\. DP-2\.4, DP-2\.5\./);
  assert.match(questionModule, /data-status="soft" data-count="1"/);
  assert.match(questionModule, /1 soft\. DP-2\.6\./);
  assert.match(questionModule, /data-status="suggested" data-count="0"/);
  assert.match(questionModule, /data-status="imported" data-count="0"/);
  assert.match(questionModule, /data-status="todo" data-count="1"/);
  assert.match(questionModule, /1 to do\. DP-2\.7\./);
  assert.equal(questionModule.includes("DP-0.1"), false);
  assert.equal(questionModule.includes("DP-3.1"), false);
  assert.equal(questionModule.includes("DP-9.9"), false);

  const towel = moduleHtml(html, "towel-check");
  assert.match(towel, /data-status="suggested" data-count="1"/);
  assert.match(towel, /data-status="answered" data-count="0"/);
  assert.match(moduleHtml(html, "tools"), /data-status="imported" data-count="1"/);
  assert.equal(html.includes("!"), false);

  const order = ["towel-check", "the-question", "tools"];
  let cursor = -1;
  for (const name of order) {
    const at = html.indexOf(`data-module="${name}"`);
    assert.ok(at > cursor, name);
    cursor = at;
  }
});
