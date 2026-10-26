/**
 * An ordinary answer returns the next card without a closing recap or a host lookup.
 * Those steps run only when the interview is finished, or when a launch card is drawn.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { awaitPendingSummary } from "../src/context/index.ts";
import { closingRecapCheckCount, readPendingClose, runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { hostStepCount } from "../src/guide/named-host.ts";
import { removeTempDir } from "./remove-temp.ts";

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("an ordinary answer does not run the closing recap or the host step", async () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "hh-243c-"));
  const recapsBefore = closingRecapCheckCount();
  const hostsBefore = hostStepCount();
  const tasks: string[] = [];
  const model = asThink(async (req) => {
    tasks.push(req.task);
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      return hit({ message: "Who is the site for?", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "For myself." });
    throw new Error(`unexpected ${req.task}`);
  });
  const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
  try {
    const card = await runTurn(session, { kind: "answer", text: "For myself." }, { think: model });
    assert.equal(card.questionId, "DP-0.2");
    assert.equal(card.status, "asked");
    assert.equal(readPendingClose(projectDir), null);
    assert.equal(closingRecapCheckCount(), recapsBefore);
    assert.equal(hostStepCount(), hostsBefore);
    assert.equal(tasks.includes("context-summary"), true);
    assert.equal(
      tasks.some((task) => task !== "pushback-judge" && task !== "guide-message" && task !== "context-summary"),
      false,
    );
  } finally {
    await awaitPendingSummary(projectDir);
    removeTempDir(projectDir);
  }
});
