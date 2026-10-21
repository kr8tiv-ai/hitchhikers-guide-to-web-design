/**
 * BUG-052 and BUG-054. Page rows come from the Pages section.
 * A Feel/Never answer becomes whole sentences.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deterministicBrief, renderSiteBrief, vibeProse } from "../src/guide/brief-loop.ts";
import { planFromBrief } from "../src/spec/brief-plan.ts";
import { loadTree, questionsToAsk } from "../src/tree.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Run 6 answers are 11 pages and 14 features, and Limits words are not pages", () => {
  const raw = JSON.parse(readFileSync(path.join(here, "fixtures", "project4-interview.json"), "utf8")) as {
    answers: Array<{ id: string; value: string; status?: string }>;
  };
  const facts = { answers: raw.answers, uploads: [], crawlNotes: [] };
  const markdown = renderSiteBrief(deterministicBrief(facts, "en"));
  const limits = `Pages: Yes, price, residency, or returns, set by the seller", 2026, that is right.`;
  const dirty = markdown.replace(/## Limits\n\n[\s\S]*?\n\n## /, `## Limits\n\n${limits}\n\n## `);
  const planned = planFromBrief(dirty, raw.answers);
  assert.equal(planned.pages.length, 11);
  assert.equal(planned.features.length, 14);
  const ids = planned.requirements.map((item) => item.id);
  for (const phantom of ["yes", "price", "residency", "returns", "set-by-the-seller", "2026", "that-is-right"]) {
    assert.equal(ids.includes(`REQ-PAGE-${phantom}`), false, phantom);
  }
  for (const row of planned.requirements) assert.equal(row.label.includes('"'), false);
  assert.equal(planned.pages.some((page) => page.title === "Blog"), true);
  assert.equal(planned.pages.some((page) => page.title === "Privacy"), true);
});

test("the Run 6 vibe answer is a whole sentence", () => {
  const prose = vibeProse("Feel: calm, warm, honest. Never: salesy, cluttered, loud.");
  assert.equal(
    prose,
    "Calm, warm, and honest is the test for the words, the space, and the photos. It should never feel salesy, cluttered, or loud.",
  );
  const facts = {
    answers: [{ id: "DP-5.3", value: "Feel: calm, warm, honest. Never: salesy, cluttered, loud." }],
    uploads: [],
    crawlNotes: [],
  };
  const brief = deterministicBrief(facts, "en");
  assert.match(brief.vibe, /^Calm, warm, and honest is the test/);
  assert.equal(/^\s*is the test/.test(brief.vibe), false);
  const emptyFeel = vibeProse("Feel: . Never: salesy, cluttered, loud.");
  assert.equal(emptyFeel, "It should never feel salesy, cluttered, or loud.");
  assert.equal(emptyFeel?.startsWith("is "), false);
  const feelOnly = vibeProse("Feel: calm.");
  assert.equal(feelOnly, "Calm is the test for the words, the space, and the photos.");
  assert.equal(feelOnly?.startsWith("is "), false);
  const neverOnly = vibeProse("Never: loud.");
  assert.equal(neverOnly, "It should never feel loud.");
  const oneWord = vibeProse("Feel: warm. Never: loud.");
  assert.equal(oneWord, "Warm is the test for the words, the space, and the photos. It should never feel loud.");
  const long = vibeProse("Feel: calm, warm, honest, quiet, slow. Never: salesy, cluttered, loud, cheap, or frantic.");
  assert.equal(
    long,
    "Calm, warm, honest, quiet, and slow is the test for the words, the space, and the photos. It should never feel salesy, cluttered, loud, cheap, or frantic.",
  );
  assert.equal(/^(is|are|was|were)\b/i.test(long ?? ""), false);
  assert.equal((long ?? "").includes(" or or "), false);
});

test("the coverage count uses the questions the desk asks, not the stored default", () => {
  const tree = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
  const asked = questionsToAsk(loadTree(tree), "deep");
  assert.equal(asked.length, 61);
  assert.equal(asked.some((question) => question.id === "DP-6.5"), false);
  const answers = [
    ...asked.map((question) => ({ id: question.id, value: "Yes.", status: "ANSWERED" })),
    { id: "DP-6.5", value: "A stored default.", status: "ANSWERED" },
  ];
  const brief = deterministicBrief({ answers, uploads: [], crawlNotes: [] }, "en");
  assert.match(brief.coverage, /Covered 61 of 61/);
  assert.equal(brief.coverage.includes("62 of 62"), false);
});
