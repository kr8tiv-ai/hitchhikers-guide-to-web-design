/**
 * BUG-070: a closing recap that asks a real question stays open.
 * The generic closer "What did I get wrong?" still ends the interview.
 * An answer replaces the motion fact the recap quotes. Skip stores the conflict as one sentence.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { deterministicBrief } from "../src/guide/brief-loop.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { loadFacts } from "../src/guide/suggest.ts";

const FILM = "The home page is a short calm film.";
const RECAP =
  "Here is what I heard. You said the home page is a short calm film, and you also said no video at launch. Should I treat the film as gentle motion only, with no video file?";
const CLOSER = "Here is what I heard. The site is a calm brochure. What did I get wrong?";
const RESOLUTION = "Treat the film as gentle motion only, with no video file.";
const CONFLICT = "You said the home page is a short calm film, and you also said no video at launch.";

const TREE = `questions:
  - id: DP-6.3
    module: motion
    depth: [express, standard, deep]
    ask: "How should the home page move?"
    why: "Motion sets the first screen."
    input: [text]
    skip_default: "Motion not stated."
    writes:
      - "SITE-BRIEF.md"
  - id: DP-9.5
    module: motion
    depth: [express, standard, deep]
    ask: "Anything else the Guide should know?"
    why: "A last open field."
    input: [text]
    skip_default: "Nothing else."
    writes:
      - "SITE-BRIEF.md"
`;

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function project(): { dir: string; session: GuideSession } {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-recap-243b-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), TREE);
  return { dir, session: { projectDir: dir, depth: "deep", language: "en", pushes: {} } };
}

function guide(message: string) {
  return hit({ message, explanationLevel: "beginner", joke: false });
}

function model(closing: string, calls: { guide: number; settle: number }) {
  return async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "guide-message") {
      calls.guide += 1;
      if (calls.guide === 1) return guide("What should the last note say?");
      return guide(closing);
    }
    if (req.task === "mirror") throw new Error("mirror skipped");
    return hit({ summary: "Noted." });
  };
}

function stored(dir: string, id: string): string {
  const file = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
    answers: Array<{ id: string; value: string }>;
  };
  return file.answers.filter((answer) => answer.id === id).at(-1)?.value ?? "";
}

function pending(dir: string): { questionId?: string; ask?: string } | null {
  const file = path.join(dir, ".hitchhiker", "guide-session.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { pendingClose?: { questionId?: string; ask?: string } };
  return parsed.pendingClose ?? null;
}

test("a closing recap that asks a question leaves that question open", async () => {
  const { dir, session } = project();
  const calls = { guide: 0, settle: 0 };
  const think = model(RECAP, calls);
  try {
    await runTurn(session, { kind: "answer", text: FILM }, { think: think as never });
    const closed = await runTurn(session, { kind: "answer", text: "No video at launch." }, { think: think as never });
    assert.equal(closed.status, "asked");
    assert.equal(closed.questionId, "DP-6.3");
    assert.match(closed.message, /Should I treat the film/);
    const held = pending(dir);
    assert.equal(held?.questionId, "DP-6.3");
    assert.match(held?.ask ?? "", /Should I treat the film/);
    const before = calls.guide;
    const answered = await runTurn(session, { kind: "answer", text: RESOLUTION }, { think: think as never });
    assert.equal(calls.guide, before);
    assert.equal(answered.status, "done");
    assert.equal(answered.questionId, null);
    assert.equal(stored(dir, "DP-6.3"), RESOLUTION);
    assert.equal(pending(dir), null);
    const motion = deterministicBrief(loadFacts(dir), "en").motion;
    assert.match(motion, /gentle motion only/);
    assert.equal(motion.includes(FILM), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skipping the recap question stores the conflict as one sentence and finishes", async () => {
  const { dir, session } = project();
  const calls = { guide: 0, settle: 0 };
  const think = model(RECAP, calls);
  try {
    await runTurn(session, { kind: "answer", text: FILM }, { think: think as never });
    await runTurn(session, { kind: "answer", text: "No video at launch." }, { think: think as never });
    const skipped = await runTurn(session, { kind: "skip" }, { think: think as never });
    assert.equal(skipped.status, "done");
    assert.equal(skipped.questionId, null);
    assert.equal(stored(dir, "DP-6.3"), CONFLICT);
    assert.equal(pending(dir), null);
    const motion = deterministicBrief(loadFacts(dir), "en").motion;
    assert.match(motion, /You said the home page is a short calm film/);
    assert.match(motion, /no video at launch/);
    const filmSentences = motion.split(/(?<=\.)\s+/).filter((part) => part.includes("short calm film"));
    assert.equal(filmSentences.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recap whose only question is the generic closer is done", async () => {
  const { dir, session } = project();
  const calls = { guide: 0, settle: 0 };
  const think = model(CLOSER, calls);
  try {
    await runTurn(session, { kind: "answer", text: FILM }, { think: think as never });
    const done = await runTurn(session, { kind: "answer", text: "Nothing else." }, { think: think as never });
    assert.equal(done.status, "done");
    assert.equal(done.questionId, null);
    assert.match(done.message, /What did I get wrong\?/);
    assert.equal(pending(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
