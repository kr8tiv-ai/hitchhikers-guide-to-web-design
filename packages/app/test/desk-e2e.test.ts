/**
 * Don't Panic success criteria this file covers:
 * - lock: the skip write releases STATE.md.lock
 * - resume: a new session sits on the question the skip left behind
 * - tree ids: the card is the first Express question from the real tree
 * - card regions: title, why, and the Answer, Suggest, and Skip actions, plus the phase map
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadState,
  loadTree,
  missingRequired,
  openInterview,
  questionsForDepth,
  requiredIds,
  STATE_LOCK_NAME,
  type AnswerRecord,
  type InterviewSession,
} from "@hitchhiker/engine";
import { reduceCard, renderCard, type CardState } from "../src/card.ts";
import { renderMap } from "../src/map.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

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

function asString(value: unknown, label: string): string {
  assert.equal(typeof value, "string", label);
  if (typeof value !== "string") {
    throw new Error(label);
  }
  return value;
}

function readAnswers(projectDir: string): AnswerRecord[] {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  assert.ok(isRecord(parsed));
  assert.ok(Array.isArray(parsed.answers));
  const answers: AnswerRecord[] = [];
  for (const item of parsed.answers) {
    assert.ok(isRecord(item));
    const id = asString(item.id, "answer id");
    const value = asString(item.value, "answer value");
    assert.ok(isStatus(item.status), id);
    answers.push({ id, status: item.status, value });
  }
  return answers;
}

function homeStamp(): string {
  const file = path.join(os.homedir(), ".hitchhiker", "index.json");
  if (!existsSync(file)) return "absent";
  const stat = statSync(file);
  return `${stat.size}:${stat.mtimeMs}`;
}

function hasPlanningDir(root: string): boolean {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".planning") return true;
      pending.push(path.join(current, entry.name));
    }
  }
  return false;
}

function buttonTag(html: string, action: string): string {
  for (const match of html.matchAll(/<button\b[^>]*>/g)) {
    const tag = match[0];
    if (tag.includes(`data-action="${action}"`)) return tag;
  }
  assert.fail(`missing button ${action}`);
}

function listItems(html: string): string[] {
  const matches = html.match(/<li\b[\s\S]*?<\/li>/g);
  assert.ok(matches);
  return matches;
}

function cardFor(question: CardState["question"]): CardState {
  return {
    question,
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
}

test("the desk renders the question card and Don't Panic from a saved session", async () => {
  const express = questionsForDepth(loadTree(treeFile), "express");
  const first = express[0];
  const second = express[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.id, "DP-0.1");
  for (const id of requiredIds()) {
    if (!express.some((question) => question.id === id)) {
      assert.fail(id);
    }
  }

  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-desk-e2e-"));
  assert.ok(projectDir.startsWith(os.tmpdir()));
  const homeBefore = homeStamp();

  try {
    let session: InterviewSession | null = await openInterview(projectDir, "express");
    const current = session.next();
    assert.equal(current?.id, first.id);
    assert.equal(current?.ask, first.ask);

    const opening = renderCard(cardFor(current));
    assert.match(opening, /class="hh-qcard__title"/);
    assert.match(opening, /class="hh-qcard__why"/);
    assert.match(opening, /class="hh-qcard__actions"/);
    assert.match(opening, new RegExp(`data-question-id="${first.id}"`));
    assert.match(opening, /data-action="answer"[^>]*>Answer<\/button>/);
    assert.match(opening, /data-action="suggest"[^>]*>Suggest: I&#39;ll mark it as assumed<\/button>/);
    assert.match(opening, /data-action="skip"[^>]*>Skip: we&#39;ll assume<\/button>/);
    assert.match(buttonTag(opening, "answer"), /disabled/);
    assert.doesNotMatch(buttonTag(opening, "suggest"), /disabled/);
    assert.doesNotMatch(buttonTag(opening, "skip"), /disabled/);
    assert.equal(opening.includes("!"), false);

    const stepped = await reduceCard(cardFor(current), { type: "skip" }, session);
    assert.equal(stepped.error, null);
    assert.equal(stepped.done, false);
    assert.equal(stepped.question?.id, second.id);
    assert.equal(existsSync(path.join(projectDir, ".hitchhiker", STATE_LOCK_NAME)), false);

    const stored = readAnswers(projectDir);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, first.id);
    assert.equal(stored[0]?.status, "SKIPPED");
    assert.equal(stored[0]?.value, first.skipDefault);
    assert.notEqual(stored[0]?.value, "");
    assert.deepEqual(missingRequired(stored), [...requiredIds()]);

    // Drop the session. The next openInterview must read the saved cursor.
    session = null;
    const resumed = await openInterview(projectDir, "express");
    const resumedQuestion = resumed.next();
    assert.equal(resumedQuestion?.id, second.id);
    assert.equal(loadState(projectDir)?.promptId, `interview:${second.id}`);

    const card = renderCard(cardFor(resumedQuestion));
    assert.match(card, new RegExp(`data-question-id="${second.id}"`));
    assert.match(card, /class="hh-qcard__title"/);
    assert.match(card, /class="hh-qcard__why"/);
    assert.match(card, /class="hh-qcard__actions"/);
    assert.match(card, /data-action="answer"[^>]*>Answer<\/button>/);
    assert.match(card, /data-action="suggest"[^>]*>Suggest: I&#39;ll mark it as assumed<\/button>/);
    assert.match(card, /data-action="skip"[^>]*>Skip: we&#39;ll assume<\/button>/);
    assert.ok(resumedQuestion);
    assert.equal(card.includes(resumedQuestion.ask), true);

    const state = loadState(projectDir);
    assert.ok(state);
    assert.equal(state.phase, "Don't Panic");
    const map = renderMap(state);
    const items = listItems(map);
    const currentItems = items.filter((item) => item.includes('data-current="true"'));
    assert.equal(currentItems.length, 1);
    const marked = currentItems[0];
    assert.ok(marked);
    assert.match(marked, />Don't Panic</);
    assert.match(marked, /hh-map__item--current/);
    assert.equal(map.includes("!"), false);
    for (const item of items) {
      if (item === marked) continue;
      assert.equal(item.includes("data-current"), false);
    }

    assert.equal(hasPlanningDir(projectDir), false);
    assert.equal(homeStamp(), homeBefore);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

