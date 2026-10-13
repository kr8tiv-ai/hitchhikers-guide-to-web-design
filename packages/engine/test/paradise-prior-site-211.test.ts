/**
 * BUG-001. DP-0.2a does not talk about "that site" when there is no prior site.
 * The exact "no prior site" phrase still skips. Any other no-site answer is reworded.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import {
  ADMIRED_SITES_ASK,
  gateQuestion,
  guardPriorSiteText,
  loadSessionState,
  noPriorSite,
} from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const BANNED = [/\bthat site\b/i, /\byour current site\b/i, /\byour site\b/i];
const DRIFT =
  "So the question is about that one. What do you love about that site, and what makes you wince?";

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

function withAnswer(dir: string, id: string, value: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify({
      version: 1,
      answers: [
        { id: "DP-0.1", status: "ANSWERED", value: "For myself." },
        { id, status: "ANSWERED", value },
      ],
      cursor: 2,
      pushedIds: [],
    }),
    "utf8",
  );
}

test("no prior site rewords DP-0.2a, and a real site keeps the love and wince ask", () => {
  const all = loadTree(treeFile);
  const question = byId(all, "DP-0.2a");
  const none = mkdtempSync(path.join(tmpdir(), "hh-211-nosite-"));
  const some = mkdtempSync(path.join(tmpdir(), "hh-211-hassite-"));
  const skipped = mkdtempSync(path.join(tmpdir(), "hh-211-skipsite-"));
  try {
    withAnswer(none, "DP-0.2", "No. This is the first site.");
    withAnswer(some, "DP-0.2", "Yes. Webflow, https://tea.example");
    withAnswer(skipped, "DP-0.2", "No prior site. No builder named.");
    const noneState = loadSessionState(none, all);
    const someState = loadSessionState(some, all);
    const skipState = loadSessionState(skipped, all);
    assert.equal(noPriorSite("No. This is the first site."), true);
    assert.equal(noPriorSite("Yes. Webflow, https://tea.example"), false);
    assert.equal(noPriorSite("No, I use Wix"), false);
    const noneGate = gateQuestion(question, noneState, all);
    assert.equal(noneGate.action, "ask");
    assert.equal(noneGate.ask, ADMIRED_SITES_ASK);
    for (const phrase of BANNED) assert.equal(phrase.test(noneGate.ask), false);
    const someGate = gateQuestion(question, someState, all);
    assert.equal(someGate.action, "ask");
    assert.equal(someGate.ask, question.ask);
    assert.match(someGate.ask, /that site/);
    assert.equal(gateQuestion(question, skipState, all).action, "skip");
    const drifted = guardPriorSiteText(DRIFT, noneState, "DP-0.2a");
    assert.equal(drifted, ADMIRED_SITES_ASK);
    for (const phrase of BANNED) assert.equal(phrase.test(drifted), false);
    assert.equal(guardPriorSiteText(question.ask, someState, "DP-0.2a"), question.ask);
  } finally {
    rmSync(none, { recursive: true, force: true });
    rmSync(some, { recursive: true, force: true });
    rmSync(skipped, { recursive: true, force: true });
  }
});

test("a stubbed model cannot keep a banned site phrase when there is no site", async () => {
  const none = mkdtempSync(path.join(tmpdir(), "hh-211-drift-"));
  const some = mkdtempSync(path.join(tmpdir(), "hh-211-keep-"));
  try {
    const bad = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      return hit({ message: DRIFT, explanationLevel: "beginner", joke: false });
    });
    const loved = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      return hit({
        message: "What do you love about that site, and what makes you wince?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const first: GuideSession = { projectDir: none, depth: "deep", language: "en", pushes: {} };
    await runTurn(first, { kind: "skip" }, { think: bad });
    const drifted = await runTurn(first, { kind: "answer", text: "No. This is the first site." }, { think: bad });
    assert.equal(drifted.questionId, "DP-0.2a");
    assert.equal(drifted.message, ADMIRED_SITES_ASK);
    for (const phrase of BANNED) assert.equal(phrase.test(drifted.message), false);
    const second: GuideSession = { projectDir: some, depth: "deep", language: "en", pushes: {} };
    await runTurn(second, { kind: "skip" }, { think: loved });
    const kept = await runTurn(
      second,
      { kind: "answer", text: "Yes. Webflow, https://tea.example" },
      { think: loved },
    );
    assert.equal(kept.questionId, "DP-0.2a");
    assert.match(kept.message, /\bthat site\b/i);
  } finally {
    rmSync(none, { recursive: true, force: true });
    rmSync(some, { recursive: true, force: true });
  }
});
