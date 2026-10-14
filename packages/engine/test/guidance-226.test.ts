/**
 * BUG-036 and BUG-025. Model-only guidance stays off the card.
 * User-facing ask, why, suggest, skip, tip, follow-ups, and resource lines
 * must not carry instructions aimed at the model.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { guidanceMarkerHits, userFacingText } from "../src/index.ts";
import { buildSystemPrompt } from "../src/persona.ts";
import { loadTree, type Question } from "../src/tree.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
const skillPath = path.resolve(here, "..", "..", "grok-plugin", "skills", "guide-persona", "SKILL.md");

const DP71_GUIDANCE =
  "Show the model and the resolution on every line. Do not promise 1080p inside a small cap. Prices live on the cost meter, not in this question. Stop at the cap.";
const DP92_GUIDANCE = "Hostinger is the recommended word, not a forced value.";

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function userFacingFields(question: Question): string {
  const parts = [question.ask, question.why, question.suggest ?? "", question.skipDefault, question.tip ?? ""];
  for (const follow of question.followUps ?? []) parts.push(follow.ask);
  for (const resource of question.resources ?? []) parts.push(resource.label, resource.note);
  return parts.join("\n");
}

test("user-facing tree fields contain no internal-guidance markers", () => {
  const all = loadTree(treeFile);
  const hits: string[] = [];
  for (const question of all) {
    const found = guidanceMarkerHits(userFacingFields(question));
    if (found.length > 0) hits.push(`${question.id}: ${found.join(", ")}`);
  }
  assert.deepEqual(hits, []);
});

test("DP-7.1 and DP-9.2 keep model instructions on guidance, not on the card copy", () => {
  const all = loadTree(treeFile);
  const budget = byId(all, "DP-7.1");
  const host = byId(all, "DP-9.2");
  assert.equal(budget.guidance, DP71_GUIDANCE);
  assert.equal(host.guidance, DP92_GUIDANCE);
  assert.equal(userFacingFields(budget).includes("Show the model"), false);
  assert.equal(userFacingFields(budget).includes("Do not promise 1080p"), false);
  assert.equal(userFacingFields(budget).includes("Stop at the cap"), false);
  assert.equal(userFacingFields(host).includes("not a forced value"), false);
  assert.equal(userFacingFields(host).includes("recommended word"), false);
  assert.equal(userFacingText(budget).includes(DP71_GUIDANCE), false);
  assert.equal(userFacingText(host).includes(DP92_GUIDANCE), false);
  assert.match(budget.why, /cost meter/);
  assert.match(host.why, /equal choices/);
});

test("the Guide prompt receives DP-7.1 guidance and the card shape, and stays persona-safe", () => {
  const budget = byId(loadTree(treeFile), "DP-7.1");
  const prompt = buildSystemPrompt(skillPath, {
    question: budget,
    depth: "standard",
    coverageLine: "none yet",
  });
  assert.match(prompt, /Internal guidance, never show this to the user: Show the model and the resolution on every line/);
  assert.match(prompt, /Card shape: the heading is only this question/);
  assert.match(prompt, /Never join them with a colon/);
  assert.equal(prompt.includes("!"), false);
});
