/**
 * PERF-001. An answer reports real stages, and the judge still runs.
 * A skip is not an answer, so it does not report those stages or call the judge.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { defaultConfig, parseConfig } from "../src/config.ts";
import { ANSWER_PROGRESS } from "../src/guide/guide-progress.ts";
import { INTERVIEW_MODEL, planInterview } from "../src/guide/interview-call.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("one answer emits Checking, Writing, then Saving, and a skip emits none", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-progress-"));
  const stages: string[] = [];
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    throw new Error(`unexpected ${req.task}`);
  });
  const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
  try {
    const answered = await runTurn(session, { kind: "answer", text: "For myself." }, {
      think: model,
      onProgress: (stage) => stages.push(stage),
    });
    assert.equal(answered.questionId, "DP-0.2");
    assert.deepEqual(stages, [...ANSWER_PROGRESS]);
    const skipped = await runTurn(session, { kind: "skip" }, {
      think: model,
      onProgress: (stage) => stages.push(stage),
    });
    assert.notEqual(skipped.questionId, "DP-0.2");
    assert.deepEqual(stages, [...ANSWER_PROGRESS]);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("an answer runs the judge and a skip does not, on grok-4.7-build-fast at the chosen effort", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-judge-"));
  const tasks: string[] = [];
  const model = asThink(async (req) => {
    tasks.push(req.task);
    const planned = planInterview(req, defaultConfig());
    assert.equal(planned.model, INTERVIEW_MODEL);
    assert.equal(planned.model, "grok-4.7-build-fast");
    assert.equal(planned.effort, "xhigh");
    assert.equal(planned.interview, true);
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    throw new Error(`unexpected ${req.task}`);
  });
  const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
  try {
    await runTurn(session, { kind: "answer", text: "For myself." }, { think: model });
    assert.equal(tasks.filter((task) => task === "pushback-judge").length, 1);
    const afterAnswer = tasks.length;
    await runTurn(session, { kind: "skip" }, { think: model });
    assert.equal(tasks.slice(afterAnswer).includes("pushback-judge"), false);
    await runTurn(session, { kind: "answer", text: "A shop I admire is the one on the corner." }, { think: model });
    assert.equal(tasks.filter((task) => task === "pushback-judge").length, 2);
    const picked = parseConfig({ ai: { model: "grok-4.7", effort: { default: "high", picked: "yes" } } });
    for (const task of ["pushback-judge", "guide-message"] as const) {
      const planned = planInterview({ task, effort: "medium" }, picked);
      assert.equal(planned.model, "grok-4.7-build-fast");
      assert.equal(planned.effort, "high");
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
