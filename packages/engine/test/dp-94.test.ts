/**
 * DP-9.4 was marked surface: default, so the walk stored the skip line and
 * never asked it. It stays a real question. A stored default such as DP-6.5
 * is still recorded with its skip text, which is the reason it was not asked.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gateQuestion, type SessionState } from "../src/guide/session-state.ts";
import { openInterview, type AnswerRecord } from "../src/interview.ts";
import { loadTree, questionsForDepth, questionsToAsk } from "../src/tree.ts";
import { removeTempDir } from "./remove-temp.ts";

const treeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "interview", "tree.yaml");

/** Answers that change which later questions apply, from the Paradise Found interview. */
const PARADISE: Record<string, string> = {
  "DP-0.2": "No. This is the first site.",
  "DP-2.3": "Sales, local, content. Sales leads: show the farms first.",
  "DP-5.1": "Kinfolk's muted olive, close to our jungle green.",
  "DP-5.6": "Photography.",
  "DP-6.2": "4.",
  "DP-6.4": "No 3D models. None.",
  "DP-9.3": "Me, on Cloudflare Pages.",
};

function paradiseState(): SessionState {
  return {
    answers: Object.entries(PARADISE).map(([id, text]) => ({ id, text, assumed: false })),
    uploads: [],
    decided: [],
  };
}

test("DP-9.3 is followed by DP-9.4 and then DP-9.5", async () => {
  const all = loadTree(treeFile);
  const asked = questionsToAsk(all, "deep");
  const ids = asked.map((question) => question.id);
  const at = ids.indexOf("DP-9.3");
  assert.deepEqual(ids.slice(at, at + 3), ["DP-9.3", "DP-9.4", "DP-9.5"]);

  const dir = mkdtempSync(path.join(tmpdir(), "hh-dp-94-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const prior = asked.slice(0, ids.indexOf("DP-9.4"));
  const seeded: AnswerRecord[] = prior.map((question) => ({
    id: question.id,
    status: "ANSWERED",
    value: `${question.id} has a concrete answer for the farm.`,
  }));
  writeFileSync(path.join(dir, ".hitchhiker", "interview.json"), JSON.stringify(seeded));
  try {
    const session = await openInterview(dir, "deep");
    assert.equal(session.next()?.id, "DP-9.4");
    const stored = await session.command({
      type: "answer",
      text: "Captions on every film. Nothing else beyond WCAG 2.2 AA.",
    });
    assert.equal(stored?.id, "DP-9.4");
    assert.equal(stored?.status, "ANSWERED");
    assert.equal(session.next()?.id, "DP-9.5");
  } finally {
    removeTempDir(dir);
  }
});

test("no required question is unreachable on the Paradise Found answer path", () => {
  const all = loadTree(treeFile);
  const asked = new Set(questionsToAsk(all, "deep").map((question) => question.id));
  const state = paradiseState();
  const skipped: string[] = [];
  for (const question of questionsForDepth(all, "deep")) {
    if (question.surface === "default") {
      assert.equal(asked.has(question.id), false, question.id);
      assert.notEqual(question.skipDefault.trim(), "", question.id);
      continue;
    }
    assert.equal(asked.has(question.id), true, question.id);
    const gate = gateQuestion(question, state, all);
    if (gate.action === "skip") skipped.push(question.id);
    else assert.equal(gate.action, "ask", question.id);
  }
  assert.equal(asked.has("DP-9.4"), true);
  assert.equal(skipped.includes("DP-9.4"), false);
  const phone = all.find((question) => question.id === "DP-6.5");
  assert.ok(phone);
  assert.equal(phone.surface, "default");
  assert.equal(phone.skipDefault, "Calm.");
});
