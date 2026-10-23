/**
 * The running summary is recorded after the next card is chosen.
 * The next turn waits for it. A failure leaves the last good summary on disk.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { isLive, writeSummaryFile } from "../src/context/disk.ts";
import { awaitPendingSummary, loadDecisions, loadSummary, refreshSummary, syncAnswer } from "../src/context/index.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";

const PHRASE = "LAST-GOOD-SUMMARY-PHRASE";
const REQUIRED = "Write a summary of at most 400 words. Keep every decision id and every asset file name.";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-249b-"));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function within<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function sessionFor(projectDir: string): GuideSession {
  return { projectDir, depth: "deep", language: "en", pushes: {} };
}

function liveIds(projectDir: string): string {
  return loadDecisions(projectDir)
    .filter((row) => isLive(row))
    .map((row) => row.id)
    .join(" ");
}

test("the next card is returned before context-summary resolves", async () => {
  const projectDir = tempProject();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let summaryInput = "";
  let summaryResolved = false;
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") {
      summaryInput = req.input;
      await gate;
      summaryResolved = true;
      return hit({ summary: `${liveIds(projectDir)} ${PHRASE}`.trim() });
    }
    throw new Error(`unexpected ${req.task}`);
  });
  const pending = runTurn(sessionFor(projectDir), { kind: "answer", text: "For myself." }, { think: model });
  try {
    const card = await within(pending, 2000, "next card");
    assert.equal(summaryResolved, false);
    assert.equal(card.questionId, "DP-0.2");
    assert.equal(summaryInput.includes("## Context packet"), false);
    assert.match(summaryInput, /For myself/);
    assert.match(summaryInput, /Write a summary of at most 400 words/);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers?: Array<{ id?: string; status?: string }>;
    };
    assert.equal(saved.answers?.find((answer) => answer.id === "DP-0.1")?.status, "ANSWERED");
  } finally {
    release();
    await pending.catch(() => undefined);
    await awaitPendingSummary(projectDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("the next turn waits for a pending summary before it builds a prompt", async () => {
  const projectDir = tempProject();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let judges = 0;
  let guides = 0;
  const guideInputs: string[] = [];
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") {
      judges += 1;
      return hit({ vague: false, quote: "", sharperChoice: "" });
    }
    if (req.task === "guide-message") {
      guides += 1;
      guideInputs.push(req.input);
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") {
      const ids = liveIds(projectDir);
      await gate;
      return hit({ summary: `${ids} ${PHRASE}`.trim() });
    }
    throw new Error(`unexpected ${req.task}`);
  });
  const session = sessionFor(projectDir);
  const first = runTurn(session, { kind: "answer", text: "For myself." }, { think: model });
  let second: Promise<unknown> | undefined;
  try {
    const card = await within(first, 2000, "first card");
    assert.equal(card.questionId, "DP-0.2");
    const judgesAfterFirst = judges;
    const guidesAfterFirst = guides;
    second = runTurn(session, { kind: "answer", text: "One old page from years ago." }, { think: model });
    await delay(200);
    assert.equal(judges, judgesAfterFirst);
    assert.equal(guides, guidesAfterFirst);
    release();
    const next = await within(second, 2000, "second card");
    assert.notEqual(next.questionId, "DP-0.1");
    assert.match(guideInputs.at(-1) ?? "", new RegExp(PHRASE));
  } finally {
    release();
    await first.catch(() => undefined);
    await second?.catch(() => undefined);
    await awaitPendingSummary(projectDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a failed summary keeps the answer and the next turn uses the last good summary", async () => {
  const projectDir = tempProject();
  await writeSummaryFile(projectDir, PHRASE);
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") throw new Error("summary down");
    throw new Error(`unexpected ${req.task}`);
  });
  const session = sessionFor(projectDir);
  try {
    const card = await runTurn(session, { kind: "answer", text: "For myself." }, { think: model });
    assert.equal(card.questionId, "DP-0.2");
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers?: Array<{ id?: string; status?: string }>;
    };
    assert.equal(saved.answers?.find((answer) => answer.id === "DP-0.1")?.status, "ANSWERED");
    const guideInputs: string[] = [];
    const secondModel = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      if (req.task === "guide-message") {
        guideInputs.push(req.input);
        return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
      }
      if (req.task === "context-summary") throw new Error("summary down");
      throw new Error(`unexpected ${req.task}`);
    });
    await runTurn(session, { kind: "answer", text: "One old page from years ago." }, { think: secondModel });
    await awaitPendingSummary(projectDir);
    assert.equal(loadSummary(projectDir), PHRASE);
    assert.match(guideInputs.at(-1) ?? "", new RegExp(PHRASE));
    const log = readFileSync(path.join(projectDir, ".hitchhiker", "logs", "ai.ndjson"), "utf8");
    const failures = log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { task?: string; outcome?: string; error?: string })
      .filter((row) => row.task === "context-summary" && row.outcome === "error");
    assert.ok(failures.length >= 1);
    assert.match(failures[0]?.error ?? "", /summary down/);
  } finally {
    await awaitPendingSummary(projectDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("two summaries for one project never overlap", async () => {
  const projectDir = tempProject();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0;
  let max = 0;
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") {
      active += 1;
      max = Math.max(max, active);
      try {
        await gate;
      } finally {
        active -= 1;
      }
      return hit({ summary: `${liveIds(projectDir)} kept`.trim() });
    }
    throw new Error(`unexpected ${req.task}`);
  });
  const first = runTurn(sessionFor(projectDir), { kind: "answer", text: "For myself." }, { think: model });
  let extra: Promise<string> | undefined;
  try {
    const started = Date.now();
    while (active < 1) {
      if (Date.now() - started > 2000) throw new Error("summary did not start");
      await delay(10);
    }
    extra = refreshSummary(projectDir, model);
    await delay(50);
    assert.equal(active, 1);
    assert.equal(max, 1);
    release();
    await within(first, 2000, "card");
    await within(extra, 2000, "second summary");
    assert.equal(max, 1);
  } finally {
    release();
    await first.catch(() => undefined);
    await extra?.catch(() => undefined);
    await awaitPendingSummary(projectDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("the summary prompt gets the previous summary and the new turn, not the whole history", async () => {
  const projectDir = tempProject();
  try {
    await syncAnswer(projectDir, {
      questionId: "DP-8.0",
      text: "UNIQUE-OLD-FACT-ALPHA",
      source: "answer",
      date: "2026-10-12",
      summarize: false,
    });
    const firstId = loadDecisions(projectDir).find((row) => row.text === "UNIQUE-OLD-FACT-ALPHA")?.id ?? "";
    assert.match(firstId, /^D-\d+$/);
    await writeSummaryFile(projectDir, `${firstId} already known.`);
    await syncAnswer(projectDir, {
      questionId: "DP-8.1",
      text: "UNIQUE-NEW-FACT-BETA",
      source: "answer",
      date: "2026-10-12",
      summarize: false,
    });
    let input = "";
    await refreshSummary(
      projectDir,
      asThink(async (req) => {
        assert.equal(req.task, "context-summary");
        input = req.input;
        return hit({ summary: `${liveIds(projectDir)} UNIQUE-NEW-FACT-BETA` });
      }),
    );
    assert.match(input, /already known/);
    assert.match(input, /UNIQUE-NEW-FACT-BETA/);
    assert.equal(input.includes("UNIQUE-OLD-FACT-ALPHA"), false);
    assert.equal(input.includes("## Context packet"), false);
    assert.equal(input.includes(REQUIRED), true);
  } finally {
    await awaitPendingSummary(projectDir);
    rmSync(projectDir, { recursive: true, force: true });
  }
});
