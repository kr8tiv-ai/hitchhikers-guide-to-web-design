import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LockHeld } from "../src/lock.ts";
import { loadState, saveState, type GuideState } from "../src/state.ts";
import { loadTree, questionsForDepth } from "../src/tree.ts";
import {
  InterviewError,
  loadState as loadStateFromIndex,
  missingRequired,
  openInterview,
  type AnswerRecord,
  type InterviewSession,
} from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const interviewSource = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "interview.ts",
);
const SUGGEST_FALLBACK = "No suggestion is written for this question yet.";
const REQUIRED_BESIDES_MOTION = ["DP-2.1", "DP-2.6", "DP-2.2", "DP-5.3", "DP-9.2"] as const;

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function answersPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "interview.json");
}

function readAnswers(projectDir: string): AnswerRecord[] {
  const parsed: unknown = JSON.parse(readFileSync(answersPath(projectDir), "utf8"));
  assert.ok(Array.isArray(parsed));
  return parsed as AnswerRecord[];
}

function writeAnswers(projectDir: string, answers: AnswerRecord[]): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(answersPath(projectDir), `${JSON.stringify(answers, null, 2)}\n`, "utf8");
}

function stateFor(promptId: string): GuideState {
  return {
    phase: "dont-panic",
    slice: "Towel Check",
    promptId,
    lastGoodCommit: "abc123",
    blockers: ['quota: "soft"'],
    nextAction: 'resume: say "towel"',
    updatedAt: "2026-10-06T00:00:00.000Z",
  };
}

function writeLock(projectDir: string, pid: number): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "state.lock"),
    `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() })}\n`,
    "utf8",
  );
}

function questionYaml(id: string, depth: string, suggest: string | null): string {
  const suggestLine = suggest === null ? "" : `    suggest: "${suggest}"\n`;
  return `  - id: ${id}
    module: towel-check
    depth: [${depth}]
    ask: "Ask ${id}?"
    why: "Why ${id}."
    input: [text]
    skip_default: "Default for ${id}."
${suggestLine}    writes:
      - "PROJECT.md#${id}"
`;
}

test("open offers one question and does not write answers yet", async () => {
  const dir = tempDir("hh-interview-open-");
  try {
    const session = await openInterview(dir, "deep");
    const current = session.next();
    assert.equal(Array.isArray(current), false);
    assert.equal(current?.id, "DP-0.1");
    assert.deepEqual(Object.keys(session).sort(), ["command", "coverage", "next"]);
    assert.equal("questions" in session, false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), true);
    assert.equal(existsSync(answersPath(dir)), false);
    assert.deepEqual(session.coverage(), {
      answered: 0,
      suggested: 0,
      skipped: 0,
      soft: 0,
      imported: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume continues at the third question", async () => {
  const dir = tempDir("hh-interview-resume-");
  const deep = questionsForDepth(loadTree(treeFile), "deep");
  const third = deep[2];
  assert.ok(third);
  try {
    const session = await openInterview(dir, "deep");
    assert.equal(session.next()?.id, deep[0]?.id);
    await session.command({ type: "answer", text: "For myself." });
    await session.command({ type: "answer", text: "No prior site." });
    assert.equal(session.next()?.id, third.id);
    assert.equal(loadState(dir)?.promptId, `interview:${third.id}`);
    assert.equal(session.coverage().answered, 2);

    const resumed = await openInterview(dir, "deep");
    assert.equal(resumed.next()?.id, third.id);
    assert.equal(resumed.coverage().answered, 2);
    const saved = readAnswers(dir);
    assert.equal(saved.length, 2);
    assert.equal(Array.isArray(saved), true);
    assert.equal(loadStateFromIndex(dir)?.promptId, `interview:${third.id}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty answer throws and does not skip", async () => {
  const dir = tempDir("hh-interview-empty-");
  try {
    const session = await openInterview(dir, "express");
    const first = session.next()?.id;
    await assert.rejects(
      () => session.command({ type: "answer", text: "" }),
      (error: unknown) => {
        assert.ok(error instanceof InterviewError);
        assert.equal(error.name, "InterviewError");
        assert.equal(error.code, "empty-answer");
        return true;
      },
    );
    await assert.rejects(
      () => session.command({ type: "answer", text: "   " }),
      (error: unknown) => error instanceof InterviewError && error.code === "empty-answer",
    );
    assert.equal(session.next()?.id, first);
    assert.equal(existsSync(answersPath(dir)), false);
    assert.equal(session.coverage().skipped, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("suggest stores the question text or the fallback", async () => {
  const dir = tempDir("hh-interview-suggest-");
  const yaml = `questions:
${questionYaml("DP-0.7", "express, standard, deep", "Standard is the shorter walk.")}
${questionYaml("DP-9.9", "express, standard, deep", null)}`;
  try {
    mkdirSync(path.join(dir, "interview"), { recursive: true });
    writeFileSync(path.join(dir, "interview", "tree.yaml"), yaml, "utf8");
    const session = await openInterview(dir, "express");
    assert.equal(session.next()?.id, "DP-0.7");
    const suggested = await session.command({ type: "suggest" });
    assert.equal(suggested.status, "SUGGESTED");
    assert.match(suggested.value, /Standard/);
    assert.equal(session.next()?.id, "DP-9.9");
    const fallback = await session.command({ type: "suggest" });
    assert.equal(fallback.status, "SUGGESTED");
    assert.equal(fallback.value, SUGGEST_FALLBACK);
    assert.equal(fallback.id, "DP-9.9");
    assert.deepEqual(session.coverage(), {
      answered: 0,
      suggested: 2,
      skipped: 0,
      soft: 0,
      imported: 0,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skip stores the DP-6.2 default and express never offers DP-0.5", async () => {
  const dir = tempDir("hh-interview-skip-");
  const express = questionsForDepth(loadTree(treeFile), "express");
  const motion = express.find((question) => question.id === "DP-6.2");
  const depthOffer = express.find((question) => question.id === "DP-0.7");
  assert.ok(motion);
  assert.ok(depthOffer?.suggest);
  assert.match(depthOffer.suggest, /Standard/);
  const answerThese = new Set<string>(REQUIRED_BESIDES_MOTION);
  try {
    const session = await openInterview(dir, "express");
    let skippedMotion: AnswerRecord | null = null;
    let suggestedDepth: AnswerRecord | null = null;
    for (;;) {
      const question = session.next();
      if (question === null) break;
      assert.notEqual(question.id, "DP-0.5");
      assert.notEqual(question.id, "DP-7.2");
      if (question.id === "DP-6.2") {
        skippedMotion = await session.command({ type: "skip" });
        continue;
      }
      if (question.id === "DP-0.7") {
        suggestedDepth = await session.command({ type: "suggest" });
        continue;
      }
      if (answerThese.has(question.id)) {
        await session.command({ type: "answer", text: `${question.id} value` });
        continue;
      }
      await session.command({ type: "skip" });
    }
    assert.ok(skippedMotion);
    assert.equal(skippedMotion.status, "SKIPPED");
    assert.equal(skippedMotion.value, motion.skipDefault);
    assert.equal(suggestedDepth?.status, "SUGGESTED");
    assert.match(suggestedDepth?.value ?? "", /Standard/);
    const saved = readAnswers(dir);
    assert.deepEqual(missingRequired(saved), []);
    assert.equal(saved.length, express.length);
    assert.equal(session.next(), null);
    assert.equal(loadState(dir)?.promptId, "interview:done");
    const before = readFileSync(answersPath(dir), "utf8");
    await assert.rejects(
      () => session.command({ type: "skip" }),
      (error: unknown) => error instanceof InterviewError && error.code === "finished",
    );
    assert.equal(readFileSync(answersPath(dir), "utf8"), before);
    assert.equal(session.coverage().answered, REQUIRED_BESIDES_MOTION.length);
    assert.equal(session.coverage().suggested, 1);
    assert.equal(
      session.coverage().skipped,
      express.length - REQUIRED_BESIDES_MOTION.length - 1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a second command on a finished session does not append", async () => {
  const dir = tempDir("hh-interview-done-");
  const yaml = `questions:
${questionYaml("DP-0.1", "express", "Yourself.")}`;
  try {
    mkdirSync(path.join(dir, "interview"), { recursive: true });
    writeFileSync(path.join(dir, "interview", "tree.yaml"), yaml, "utf8");
    const session = await openInterview(dir, "express");
    await session.command({ type: "answer", text: "For myself." });
    assert.equal(session.next(), null);
    assert.equal(loadState(dir)?.promptId, "interview:done");
    assert.equal(loadState(dir)?.nextAction, "Approve the Site Brief.");
    const before = readFileSync(answersPath(dir), "utf8");
    await assert.rejects(
      () => session.command({ type: "answer", text: "ghost" }),
      (error: unknown) => error instanceof InterviewError && error.code === "finished",
    );
    assert.equal(readFileSync(answersPath(dir), "utf8"), before);
    assert.equal(readAnswers(dir).length, 1);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
    assert.equal(
      existsSync(path.join(dir, ".hitchhiker", `interview.json.tmp-${process.pid}`)),
      false,
    );
    assert.equal(existsSync(path.join(dir, ".planning")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corrupt interview.json throws and the file stays", async () => {
  const dir = tempDir("hh-interview-corrupt-");
  const file = answersPath(dir);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{", "utf8");
    await assert.rejects(
      () => openInterview(dir, "express"),
      (error: unknown) => {
        assert.ok(error instanceof InterviewError);
        assert.equal(error.name, "InterviewError");
        assert.equal(error.code, "corrupt-answers");
        return true;
      },
    );
    assert.equal(readFileSync(file, "utf8"), "{");
    assert.equal(existsSync(file), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("express does not resume on an id outside the depth", async () => {
  const dir = tempDir("hh-interview-depth-");
  const express = questionsForDepth(loadTree(treeFile), "express");
  try {
    await saveState(dir, stateFor("interview:DP-0.5"));
    const session = await openInterview(dir, "express");
    assert.notEqual(session.next()?.id, "DP-0.5");
    assert.equal(session.next()?.id, express[0]?.id);

    const answered = ["DP-0.1", "DP-0.2", "DP-0.2a", "DP-0.3", "DP-0.4"];
    writeAnswers(
      dir,
      answered.map((id) => ({ id, status: "ANSWERED", value: `${id} value` })),
    );
    await saveState(dir, stateFor("interview:DP-0.5"));
    const continued = await openInterview(dir, "express");
    const expected = express.find((question) => !answered.includes(question.id));
    assert.ok(expected);
    assert.notEqual(expected.id, "DP-0.5");
    assert.equal(continued.next()?.id, expected.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("standard resumes on DP-0.5 when that id is still unanswered", async () => {
  const dir = tempDir("hh-interview-standard-");
  try {
    await saveState(dir, stateFor("interview:DP-0.5"));
    const session = await openInterview(dir, "standard");
    assert.equal(session.next()?.id, "DP-0.5");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stored id is not asked again when STATE still names it", async () => {
  const dir = tempDir("hh-interview-stale-");
  const deep = questionsForDepth(loadTree(treeFile), "deep");
  try {
    writeAnswers(dir, [{ id: "DP-0.1", status: "ANSWERED", value: "For myself." }]);
    await saveState(dir, stateFor("interview:DP-0.1"));
    const session = await openInterview(dir, "deep");
    assert.equal(session.next()?.id, deep[1]?.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("coverage counts every saved status", async () => {
  const dir = tempDir("hh-interview-coverage-");
  try {
    writeAnswers(dir, [
      { id: "DP-0.1", status: "ANSWERED", value: "For myself." },
      { id: "DP-0.2", status: "SUGGESTED", value: "A builder." },
      { id: "DP-0.2a", status: "SKIPPED", value: "No prior site to love or wince at." },
      { id: "DP-0.3", status: "SOFT", value: "it's fine" },
      { id: "DP-0.4", status: "IMPORTED", value: "Logo on file." },
    ]);
    const session = await openInterview(dir, "deep");
    assert.deepEqual(session.coverage(), {
      answered: 1,
      suggested: 1,
      skipped: 1,
      soft: 1,
      imported: 1,
    });
    assert.equal(session.next()?.id, "DP-0.5");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("command keeps phase, slice, blockers, and commit, and stamps the clock", async () => {
  const dir = tempDir("hh-interview-state-");
  const clock = (): Date => new Date("2026-10-06T15:04:05.000Z");
  const deep = questionsForDepth(loadTree(treeFile), "deep");
  const second = deep[1];
  assert.ok(second);
  try {
    await saveState(dir, stateFor("interview:DP-0.1"));
    const session = await openInterview(dir, "deep", clock);
    await session.command({ type: "answer", text: "For myself." });
    const state = loadState(dir);
    assert.ok(state);
    assert.equal(state.phase, "dont-panic");
    assert.equal(state.slice, "Towel Check");
    assert.equal(state.lastGoodCommit, "abc123");
    assert.deepEqual(state.blockers, ['quota: "soft"']);
    assert.equal(state.promptId, `interview:${second.id}`);
    assert.equal(state.nextAction, `Answer ${second.id}.`);
    assert.equal(state.updatedAt, "2026-10-06T15:04:05.000Z");
    const raw = readFileSync(path.join(dir, ".hitchhiker", "STATE.md"), "utf8");
    assert.equal(raw.includes("\r"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fresh save names Don't Panic and the next question", async () => {
  const dir = tempDir("hh-interview-fresh-");
  const clock = (): Date => new Date("2026-10-06T15:04:05.000Z");
  const deep = questionsForDepth(loadTree(treeFile), "deep");
  const second = deep[1];
  assert.ok(second);
  try {
    const session = await openInterview(dir, "deep", clock);
    await session.command({ type: "skip" });
    const state = loadState(dir);
    assert.ok(state);
    assert.equal(state.phase, "Don't Panic");
    assert.equal(state.slice, "The Guide");
    assert.equal(state.promptId, `interview:${second.id}`);
    assert.equal(state.nextAction, `Answer ${second.id}.`);
    assert.equal(state.lastGoodCommit, "");
    assert.deepEqual(state.blockers, []);
    assert.equal(state.updatedAt, "2026-10-06T15:04:05.000Z");
    const record = readAnswers(dir)[0];
    assert.equal(record?.status, "SKIPPED");
    assert.equal(record?.value, deep[0]?.skipDefault);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a live lock blocks the command and writes no answer", async () => {
  const dir = tempDir("hh-interview-lock-");
  try {
    const session = await openInterview(dir, "express");
    writeLock(dir, process.pid);
    await assert.rejects(
      () => session.command({ type: "skip" }),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, process.pid);
        return true;
      },
    );
    assert.equal(existsSync(answersPath(dir)), false);
    assert.equal(session.next()?.id, "DP-0.1");
    assert.equal(session.coverage().skipped, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("overlapping command calls are rejected", async () => {
  const dir = tempDir("hh-interview-flight-");
  try {
    const session: InterviewSession = await openInterview(dir, "express");
    const first = session.command({ type: "answer", text: "For myself." });
    const second = session.command({ type: "skip" });
    await assert.rejects(
      second,
      (error: unknown) => error instanceof InterviewError && error.code === "busy",
    );
    const saved = await first;
    assert.equal(saved.status, "ANSWERED");
    assert.equal(saved.value, "For myself.");
    assert.equal(readAnswers(dir).length, 1);
    assert.equal(session.next()?.id, "DP-0.2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the interview module saves under the lock and does not call the network", () => {
  const source = readFileSync(interviewSource, "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.match(source, /loadTree/);
  assert.match(source, /withStateLock/);
  assert.match(source, /AnswerRecord/);
  const answersRename = source.indexOf("await rename(answersTemp, answersPath)");
  const stateRename = source.indexOf("await rename(stateTemp, stateFile)");
  assert.ok(answersRename > 0);
  assert.ok(stateRename > answersRename);
  const answersWrite = source.indexOf("writeFile(answersTemp");
  const stateWrite = source.indexOf("writeFile(stateTemp");
  assert.ok(answersWrite > 0);
  assert.ok(stateWrite > answersWrite);
  assert.ok(answersRename > stateWrite);
});
