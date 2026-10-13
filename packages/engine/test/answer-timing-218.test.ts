/**
 * PERF-001. Stage timings land in the AI log, and the first stage is not waiting on the model.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { ANSWER_PROGRESS } from "../src/guide/guide-progress.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("a slow judge still reports Checking within 2s and the log records each stage", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-timing-"));
  const stages: string[] = [];
  let firstAt = 0;
  const started = Date.now();
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge" || req.task === "guide-message" || req.task === "context-summary") {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "A shop site." });
    throw new Error(`unexpected ${req.task}`);
  });
  const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
  try {
    const pending = runTurn(session, { kind: "answer", text: "For myself." }, {
      think: model,
      onProgress: (stage) => {
        if (firstAt === 0) firstAt = Date.now();
        stages.push(stage);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(stages[0], "Checking your answer");
    assert.ok(firstAt - started < 2000, `first stage at ${firstAt - started}ms`);
    const answered = await pending;
    assert.equal(answered.questionId, "DP-0.2");
    assert.deepEqual(stages, [...ANSWER_PROGRESS]);
    const log = readFileSync(path.join(projectDir, ".hitchhiker", "logs", "ai.ndjson"), "utf8");
    const rows = log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { task?: string; stage?: string; durationMs?: number; model?: string; effort?: string });
    const timed = rows.filter((row) => row.task === "answer-stage");
    assert.deepEqual(
      timed.map((row) => row.stage),
      [...ANSWER_PROGRESS],
    );
    for (const row of timed) {
      assert.equal(typeof row.durationMs, "number");
      assert.ok((row.durationMs ?? -1) >= 0);
      assert.equal(row.model, "grok-4.7-build-fast");
      assert.equal(row.effort, "xhigh");
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
