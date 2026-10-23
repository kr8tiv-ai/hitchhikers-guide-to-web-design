/**
 * The status line is read from saved answers at render time.
 * An id already in interview.json is not listed again, and a finished
 * interview names the Site Brief instead of an earlier "Answer …" list.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertCanAdvance, formatStatusLine, readStatus, recordFact } from "../src/context/index.ts";
import { saveState, type GuideState } from "../src/state.ts";
import { loadTree, questionsToAsk } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const REQUIRED = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"] as const;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-status-249e-"));
}

function stateFor(phase: string, promptId: string, nextAction: string): GuideState {
  return {
    phase,
    slice: "Desk",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction,
    updatedAt: "2026-10-23T09:53:04.836Z",
  };
}

function writeInterview(dir: string, rows: readonly { id: string; value: string }[]): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify({
      version: 1,
      answers: rows.map((row) => ({ id: row.id, status: "ANSWERED", value: row.value })),
    }),
  );
}

test("an empty project still has no phase and lists every required id", () => {
  const dir = tempDir();
  try {
    const line = formatStatusLine(dir);
    assert.match(line, /^No phase yet\. Next: Answer /);
    assert.equal(readStatus(dir).phase, "");
    for (const id of REQUIRED) assert.match(line, new RegExp(id));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("answered required ids leave the Next list and an empty phase becomes Don't Panic", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("", "interview:DP-4.1", "Answer DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2."));
    writeInterview(dir, [
      { id: "DP-2.1", value: "Sell the tea." },
      { id: "DP-2.6", value: "A visitor who wants tea." },
      { id: "DP-2.2", value: "Book a tasting." },
    ]);
    const status = readStatus(dir);
    assert.equal(status.phase, "");
    assert.deepEqual(status.unanswered, ["DP-5.3", "DP-6.2", "DP-9.2"]);
    const line = formatStatusLine(dir);
    assert.match(line, /^Don't Panic\. Next: Answer DP-5\.3, DP-6\.2, DP-9\.2\./);
    assert.equal(line.includes("DP-2.1"), false);
    assert.equal(line.includes("DP-2.6"), false);
    assert.equal(line.includes("DP-2.2"), false);
    assert.equal(line.includes("No phase yet"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a finished interview says to review the Site Brief and keeps a saved phase name", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("Don't Panic", "interview:done", "Answer DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2."));
    writeInterview(dir, REQUIRED.map((id) => ({ id, value: `${id} saved.` })));
    const status = readStatus(dir);
    assert.equal(status.phase, "Don't Panic");
    assert.deepEqual(status.unanswered, []);
    assert.equal(status.next, "review the Site Brief.");
    const line = formatStatusLine(dir);
    assert.equal(
      line,
      "Don't Panic. Next: review the Site Brief. Blockers: none. Open decisions: none.",
    );
    for (const id of REQUIRED) assert.equal(line.includes(id), false, id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a finished interview with an empty phase still names Don't Panic", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("", "interview:done", "Continue the interview."));
    writeInterview(dir, REQUIRED.map((id) => ({ id, value: `${id} saved.` })));
    assert.equal(readStatus(dir).phase, "");
    assert.match(formatStatusLine(dir), /^Don't Panic\. Next: review the Site Brief\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saved answers for every asked question finish the interview even when the prompt is stale", async () => {
  const dir = tempDir();
  try {
    const questions = questionsToAsk(loadTree(treeFile), "deep");
    assert.ok(questions.length > REQUIRED.length);
    await saveState(
      dir,
      stateFor("Don't Panic", "interview:DP-0.1", "Answer DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2."),
    );
    writeInterview(
      dir,
      questions.map((question) => ({ id: question.id, value: "Saved." })),
    );
    const status = readStatus(dir);
    assert.equal(status.questionId, "DP-0.1");
    assert.deepEqual(status.unanswered, []);
    assert.equal(status.next, "review the Site Brief.");
    const line = formatStatusLine(dir);
    assert.match(line, /Next: review the Site Brief\./);
    assert.equal(line.includes("Answer DP-"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an open decision still blocks advance after the interview is done", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("Don't Panic", "interview:done", "Approve the Site Brief."));
    writeInterview(dir, REQUIRED.map((id) => ({ id, value: `${id} saved.` })));
    await recordFact(dir, {
      questionId: "adr:hosting",
      text: "The host is still open.",
      source: "approval",
      phase: "Don't Panic",
      date: "2026-10-23",
      open: true,
      kind: "adr",
    });
    const status = readStatus(dir);
    assert.ok(status.openDecisions.length > 0);
    assert.equal(status.next, "review the Site Brief.");
    assert.equal(status.gate, "decision");
    const gate = assertCanAdvance(dir);
    assert.equal(gate.ok, false);
    assert.match(gate.reasons.join(" "), /Open decisions:/);
    const line = formatStatusLine(dir);
    assert.match(line, /Next: review the Site Brief\./);
    assert.equal(line.includes("Settle "), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a live decision phase fills an empty state phase before the interview starts", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("", "interview:DP-0.1", "Answer DP-0.1."));
    await recordFact(dir, {
      questionId: "DP-0.1",
      text: "For myself.",
      source: "answer",
      phase: "Babel Fish",
      date: "2026-10-23",
    });
    assert.equal(readStatus(dir).phase, "");
    assert.match(formatStatusLine(dir), /^Babel Fish\. Next: Answer /);
    assert.equal(formatStatusLine(dir).includes("No phase yet"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
