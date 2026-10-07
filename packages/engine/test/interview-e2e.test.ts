/**
 * Don't Panic success criteria this file covers:
 * - lock: a live state.lock blocks the write, and a finished command releases it
 * - resume: a second session continues at the saved question id
 * - tree ids: Express uses the real tree and includes every required id
 * - card regions: packages/app/test/desk-e2e.test.ts renders the question card and the phase map
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadState,
  loadTree,
  LockHeld,
  missingRequired,
  openInterview,
  questionsForDepth,
  requiredIds,
  type AnswerRecord,
  type InterviewSession,
  type Question,
} from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

const OPENING = [
  "For a client.",
  "One old page, built in a site builder.",
  "Loved the paper color. Winced at the tiny type.",
] as const;

/** Five required answers. Motion (DP-6.2) is skipped so the assumed level is stored. */
const REQUIRED_TEXT = new Map<string, string>([
  ["DP-2.1", "a tea shop site"],
  ["DP-2.6", "a visitor who wants a tin"],
  ["DP-2.2", "the action buy"],
  ["DP-5.3", "vibe earthy, anti-vibe neon"],
  ["DP-9.2", "hosting no idea"],
]);

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

function answersPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "interview.json");
}

function lockPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "state.lock");
}

function readAnswers(projectDir: string): AnswerRecord[] {
  const parsed: unknown = JSON.parse(readFileSync(answersPath(projectDir), "utf8"));
  assert.ok(isRecord(parsed));
  assert.equal(parsed.version, 1);
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

function writeLock(projectDir: string, pid: number): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    lockPath(projectDir),
    `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`,
    "utf8",
  );
}

function homeIndexFile(): string {
  return path.join(os.homedir(), ".hitchhiker", "index.json");
}

function homeStamp(): string {
  const file = homeIndexFile();
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

function expressQuestions(): Question[] {
  return questionsForDepth(loadTree(treeFile), "express");
}

/** Answers three questions, proves the lock, then drops this session when it returns. */
async function answerOpening(projectDir: string, fourthId: string): Promise<void> {
  const session = await openInterview(projectDir, "express");
  for (const text of OPENING) {
    const question = session.next();
    assert.ok(question);
    const saved = await session.command({ type: "answer", text });
    assert.ok(saved, question.id);
    assert.equal(saved.status, "ANSWERED");
    assert.equal(saved.value, text);
    assert.equal(existsSync(lockPath(projectDir)), false);
  }
  assert.equal(session.next()?.id, fourthId);
  assert.equal(loadState(projectDir)?.promptId, `interview:${fourthId}`);
  assert.equal(existsSync(lockPath(projectDir)), false);

  writeLock(projectDir, process.pid);
  await assert.rejects(
    () => session.command({ type: "answer", text: "Used a site builder." }),
    (error: unknown) => error instanceof LockHeld && error.pid === process.pid,
  );
  assert.equal(readAnswers(projectDir).length, OPENING.length);
  assert.equal(session.next()?.id, fourthId);
  rmSync(lockPath(projectDir), { force: true });
}

async function walkRest(session: InterviewSession): Promise<void> {
  for (;;) {
    const question = session.next();
    if (question === null) return;
    const text = REQUIRED_TEXT.get(question.id);
    if (text !== undefined) {
      const saved = await session.command({ type: "answer", text });
      assert.ok(saved, question.id);
      assert.equal(saved.status, "ANSWERED");
      assert.equal(saved.value, text);
      continue;
    }
    const saved = await session.command({ type: "skip" });
    assert.ok(saved, question.id);
    assert.equal(saved.status, "SKIPPED");
    assert.equal(saved.value, question.skipDefault);
    assert.notEqual(saved.value, "");
  }
}

test("express saves, resumes at the next id, and finishes with no missing required field", async () => {
  const express = expressQuestions();
  const fourth = express[OPENING.length];
  assert.ok(fourth);
  assert.equal(express[0]?.id, "DP-0.1");
  assert.equal(fourth.id, "DP-0.3");
  assert.equal(express.at(-1)?.id, "DP-9.5");
  assert.equal(express.some((question) => question.id === "DP-0.5"), false);
  assert.equal(express.some((question) => question.id === "DP-7.2"), false);
  assert.ok(new Set(express.map((question) => question.module)).size >= 8);

  assert.deepEqual(
    [...requiredIds()],
    ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-6.2", "DP-9.2"],
  );
  assert.deepEqual(missingRequired([]), [...requiredIds()]);
  for (const id of requiredIds()) {
    if (!express.some((question) => question.id === id)) {
      assert.fail(id);
    }
    if (id === "DP-6.2") {
      assert.equal(REQUIRED_TEXT.has(id), false);
    } else {
      assert.equal(REQUIRED_TEXT.has(id), true, id);
    }
  }

  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-interview-e2e-"));
  assert.ok(projectDir.startsWith(os.tmpdir()));
  const homeBefore = homeStamp();

  try {
    await answerOpening(projectDir, fourth.id);

    const resumed = await openInterview(projectDir, "express");
    assert.equal(resumed.next()?.id, fourth.id);
    assert.equal(loadState(projectDir)?.promptId, `interview:${fourth.id}`);
    assert.equal(resumed.coverage().answered, OPENING.length);

    await walkRest(resumed);
    assert.equal(resumed.next(), null);
    assert.equal(existsSync(lockPath(projectDir)), false);

    const finished = await openInterview(projectDir, "express");
    assert.equal(finished.next(), null);
    const state = loadState(projectDir);
    assert.ok(state);
    assert.equal(state.phase, "Don't Panic");
    assert.equal(state.promptId, "interview:done");
    const stateText = readFileSync(path.join(projectDir, ".hitchhiker", "STATE.md"), "utf8");
    assert.match(stateText, /## Prompt id\n\ninterview:done\n/);

    const saved = readAnswers(projectDir);
    assert.equal(saved.length, express.length);
    assert.deepEqual(
      saved.map((answer) => answer.id),
      express.map((question) => question.id),
    );
    for (const answer of saved) {
      assert.notEqual(answer.value, "", answer.id);
      assert.notEqual(answer.value.trim(), "", answer.id);
      const required = REQUIRED_TEXT.get(answer.id);
      if (required !== undefined) {
        assert.equal(answer.status, "ANSWERED");
        assert.equal(answer.value, required);
        continue;
      }
      const openingAt = express.findIndex((question) => question.id === answer.id);
      if (openingAt >= 0 && openingAt < OPENING.length) {
        assert.equal(answer.status, "ANSWERED");
        assert.equal(answer.value, OPENING[openingAt]);
        continue;
      }
      assert.equal(answer.status, "SKIPPED", answer.id);
    }
    const motion = saved.find((answer) => answer.id === "DP-6.2");
    const motionQuestion = express.find((question) => question.id === "DP-6.2");
    assert.ok(motion);
    assert.ok(motionQuestion);
    assert.equal(motion.status, "SKIPPED");
    assert.equal(motion.value, motionQuestion.skipDefault);
    assert.match(motion.value, /ASSUMED/);
    assert.equal(saved.some((answer) => answer.status === "SOFT"), false);
    assert.deepEqual(missingRequired(saved), []);
    assert.equal(finished.coverage().answered, OPENING.length + REQUIRED_TEXT.size);
    assert.equal(finished.coverage().skipped, express.length - OPENING.length - REQUIRED_TEXT.size);
    assert.equal(finished.coverage().suggested, 0);
    assert.equal(finished.coverage().soft, 0);
    assert.equal(hasPlanningDir(projectDir), false);
    assert.equal(homeStamp(), homeBefore);
    assert.equal(existsSync(path.join(projectDir, ".hitchhiker")), true);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
