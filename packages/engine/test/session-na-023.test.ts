/**
 * BUG-023. "3D: None" records the Tripo/Meshy budget as not applicable.
 * The question is not asked. Budget copy drops custom-generation lines.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { recordedField } from "../src/guide/brief-loop.ts";
import {
  budgetCardCopy,
  gateQuestion,
  notApplicablePatches,
  threeDBudgetReason,
  type SessionState,
} from "../src/guide/session-state.ts";
import { openInterview } from "../src/interview.ts";
import { loadTree } from "../src/tree.ts";
import { removeTempDir } from "./remove-temp.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");

const MINI = `questions:
  - id: DP-6.4
    module: pan-galactic
    depth: [express, standard, deep]
    ask: "Will the site use 3D?"
    why: "None means no custom model budget."
    input: [text]
    skip_default: "None."
    writes:
      - "ASSETS.md"
  - id: DP-7.2
    module: pan-galactic
    depth: [standard, deep]
    ask: "What is the Tripo or Meshy budget?"
    why: "Only when a generated model is in scope."
    input: [text]
    skip_default: "No custom 3D generation budget."
    writes:
      - "BUDGET.md"
  - id: DP-7.3
    module: pan-galactic
    depth: [standard, deep]
    ask: "Which photos should the page keep?"
    why: "Photos stay even when there is no model."
    input: [text]
    skip_default: "No photos."
    writes:
      - "ASSETS.md"
`;

function stateFor(text: string): SessionState {
  return { answers: [{ id: "DP-6.4", text, assumed: false }], uploads: [], decided: [] };
}

test("3D None marks DP-7.2 not applicable on the tree", () => {
  const all = loadTree(treeFile);
  const budget = all.find((question) => question.id === "DP-7.2");
  assert.ok(budget);
  assert.equal(gateQuestion(budget, stateFor("None."), all).action, "skip");
  assert.equal(gateQuestion(budget, stateFor("No 3D models. None."), all).action, "skip");
  assert.equal(gateQuestion(budget, stateFor("Use Tripo for the hero."), all).action, "ask");
  const reason = threeDBudgetReason("No 3D models. None.");
  assert.ok(reason);
  assert.match(reason, /Not applicable/);
  assert.equal(threeDBudgetReason("None."), reason);
  assert.equal(threeDBudgetReason("Skip."), reason);
  assert.equal(threeDBudgetReason(""), null);
  assert.equal(threeDBudgetReason("Hover states stay small."), null);
  assert.equal(threeDBudgetReason("No, use Tripo for the hero."), null);
  assert.equal(threeDBudgetReason("DP-6.4 has a concrete answer for the farm."), null);
});

test("a None answer records DP-7.2 and the walk does not ask it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-na-023-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), MINI);
  try {
    const session = await openInterview(dir, "standard");
    assert.equal(session.next()?.id, "DP-6.4");
    const stored = await session.command({ type: "answer", text: "No 3D models. None." });
    assert.equal(stored?.id, "DP-6.4");
    assert.notEqual(session.next()?.id, "DP-7.2");
    assert.equal(session.next()?.id, "DP-7.3");
    const saved = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    const budget = saved.answers.find((answer) => answer.id === "DP-7.2");
    assert.ok(budget);
    assert.equal(budget.status, "SKIPPED");
    assert.match(budget.value, /Not applicable/);
  } finally {
    removeTempDir(dir);
  }
});

test("a saved None answer does not offer DP-7.2 on resume", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-na-023-resume-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), MINI);
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    `${JSON.stringify({
      version: 1,
      answers: [{ id: "DP-6.4", status: "ANSWERED", value: "None." }],
      cursor: 1,
      pushedIds: [],
    })}\n`,
  );
  try {
    const session = await openInterview(dir, "standard");
    assert.notEqual(session.next()?.id, "DP-7.2");
    const questions = loadTree(path.join(dir, "interview", "tree.yaml"));
    const patches = notApplicablePatches(questions, [
      { id: "DP-6.4", status: "ANSWERED", value: "None." },
    ]);
    assert.equal(patches.length, 1);
    assert.equal(patches[0]?.id, "DP-7.2");
    assert.equal(patches[0]?.status, "SKIPPED");
    const kept = notApplicablePatches(questions, [
      { id: "DP-6.4", status: "ANSWERED", value: "None." },
      { id: "DP-7.2", status: "SKIPPED", value: "ASSUMED: No custom 3D generation budget." },
    ]);
    assert.equal(kept.length, 0);
  } finally {
    removeTempDir(dir);
  }
});

test("Tripo stays on the walk and budget copy drops only custom 3D lines", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-na-023-tripo-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), MINI);
  try {
    const session = await openInterview(dir, "standard");
    await session.command({ type: "answer", text: "Use Tripo for the hero." });
    assert.equal(session.next()?.id, "DP-7.2");
  } finally {
    removeTempDir(dir);
  }

  const dropped = budgetCardCopy("Tripo at forty dollars. Meshy at twenty dollars. Hosting stays put.", "None.");
  assert.equal(dropped.includes("Tripo"), false);
  assert.equal(dropped.includes("Meshy"), false);
  assert.match(dropped, /Hosting stays put/);
  assert.equal(budgetCardCopy("$0 for 3D.", "No 3D models. None."), "$0 for 3D.");
  assert.equal(budgetCardCopy("Zero dollars for 3D.", "Hover states stay small."), "Zero dollars for 3D.");
  assert.equal(budgetCardCopy("Custom 3D generation at forty dollars.", "Skip."), "No custom generation budget.");

  const field = recordedField("budget", {
    answers: [
      { id: "DP-6.4", value: "No 3D models. None." },
      { id: "DP-7.2", value: "Tripo at forty dollars. $0 for 3D." },
    ],
    uploads: [],
    crawlNotes: [],
  });
  assert.equal(field.text.includes("Tripo"), false);
  assert.match(field.text, /\$0 for 3D/);
});
