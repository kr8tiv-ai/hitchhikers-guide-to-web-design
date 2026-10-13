/**
 * PERF-001. Guide calls wait at least 600s. A 150s reply is not a timeout.
 * A judge timeout keeps the typed answer and says so.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ThinkTimeoutError,
  defaultConfig,
  think,
  type SpawnLike,
  type ThinkRequest,
  type ThinkResult,
} from "../src/index.ts";
import { GUIDE_CALL_TIMEOUT_MS, GUIDE_TIMEOUT_LINE, guideCallTimeoutMs } from "../src/guide/guide-progress.ts";
import { GUIDE_MESSAGE_SCHEMA } from "../src/guide/schemas.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const FLAGS = new Set([
  "-p",
  "--single",
  "--prompt-file",
  "--prompt-json",
  "-m",
  "--model",
  "--effort",
  "--reasoning-effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

test("the guide timeout defaults to at least 600s and the 110s cap is gone", () => {
  assert.ok(GUIDE_CALL_TIMEOUT_MS >= 600_000);
  assert.ok(guideCallTimeoutMs(defaultConfig().ai.timeoutMs) >= 600_000);
  assert.equal(guideCallTimeoutMs(900_000), 900_000);
  assert.ok(guideCallTimeoutMs(30_000) >= 600_000);
  const sources = [
    path.join(here, "../src/guide/guide-progress.ts"),
    path.join(here, "../src/ai/think.ts"),
  ];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    assert.equal(/\b110[\s_]*000\b/.test(text), false, file);
  }
});

test("a guide call that lasts 150s completes without a timeout", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-timeout-"));
  let seenTimeout = 0;
  const reply = JSON.stringify({
    message: "The next question is on the card.",
    explanationLevel: "beginner",
    joke: false,
  });
  const spawnImpl: SpawnLike = async (request) => {
    seenTimeout = request.timeoutMs;
    return {
      status: 0,
      stdout: JSON.stringify({ text: reply, stopReason: "end_turn", sessionId: "test" }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  try {
    const result = await think(
      { task: "guide-message", input: "Ask the question.", schema: GUIDE_MESSAGE_SCHEMA },
      {
        spawnImpl,
        projectDir: dir,
        cassetteDir: path.join(dir, "cassettes"),
        config: defaultConfig(),
        flags: FLAGS,
        env: { HH_CASSETTE: "off" },
      },
    );
    assert.ok(seenTimeout >= 600_000, `spawn timeout was ${seenTimeout}`);
    assert.equal(result.cassette, "live");
    const value = result.value as { message?: string };
    assert.equal(value.message, "The next question is on the card.");

    t.mock.timers.enable({ apis: ["setTimeout"] });
    const workMs = 150_000;
    const raced = new Promise<"ok" | "timeout">((resolve) => {
      let settled = false;
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve("timeout");
      }, seenTimeout);
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve("ok");
      }, workMs);
    });
    t.mock.timers.tick(workMs);
    assert.equal(await raced, "ok");
  } finally {
    try {
      t.mock.timers.reset();
    } catch {
      // The clock mock was not enabled.
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a judge timeout keeps the answer and names the timeout", async () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-keep-"));
  const model = asThink(async (req) => {
    if (req.task === "pushback-judge") throw new ThinkTimeoutError(GUIDE_CALL_TIMEOUT_MS);
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "A site for one person." });
    throw new Error(`unexpected ${req.task}`);
  });
  const session: GuideSession = { projectDir, depth: "deep", language: "en", pushes: {} };
  try {
    const turn = await runTurn(session, { kind: "answer", text: "For myself." }, { think: model });
    const saved = readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
    assert.match(saved, /For myself\./);
    assert.equal(turn.message, GUIDE_TIMEOUT_LINE);
    assert.match(turn.message, /kept/i);
    assert.equal(turn.questionId, "DP-0.2");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
