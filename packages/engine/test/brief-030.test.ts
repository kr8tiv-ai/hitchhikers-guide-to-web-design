/**
 * BUG-030: one revise replaces the pending draft and is not a question answer.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { loadDecisions, syncAnswer } from "../src/context/index.ts";
import { loadFacts } from "../src/guide/suggest.ts";
import { BRIEF_SAME_NOTE, BRIEF_REVISE_STAGES, draftSiteBrief, reviseSiteBrief } from "../src/guide/brief-desk.ts";
import type { SiteBrief } from "../src/guide/schemas.ts";

const LINE = "The site helps a visitor book a visit.";
const NEXT = "The site helps a visitor book a tour.";
const CORRECTION = "The goal should name a tour.";
const OLD = "Help a visitor book a glass tour.";

function sample(goal = LINE): SiteBrief {
  return {
    goal,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    pages: LINE,
    features: LINE,
    coverage: LINE,
  };
}

test("a revise replaces the pending draft and does not become the DP-2.1 answer", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-030-"));
  const stages: string[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    const brief = req.task === "brief-revise" ? sample(NEXT) : req.task === "brief-draft" ? sample() : null;
    if (brief === null) throw new Error(req.task);
    return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
  };
  try {
    await syncAnswer(dir, { questionId: "DP-2.1", text: OLD, source: "answer", moveCursor: false, summarize: false });
    await draftSiteBrief(dir, think as never);
    const revised = await reviseSiteBrief(dir, CORRECTION, think as never, {
      onProgress(stage) {
        stages.push(stage);
      },
    });
    assert.equal(revised.status, "pending");
    assert.equal(revised.draft?.goal, NEXT);
    assert.equal(revised.note, "");
    assert.deepEqual(stages, [...BRIEF_REVISE_STAGES]);
    const decisions = loadDecisions(dir);
    assert.equal(
      decisions.some((item) => item.questionId === "brief" && item.source === "brief-correction" && item.text === CORRECTION),
      true,
    );
    assert.equal(
      decisions.some((item) => item.questionId === "DP-2.1" && item.source === "answer" && item.text === CORRECTION),
      false,
    );
    const liveAnswer = decisions.find((item) => item.questionId === "DP-2.1" && item.source === "answer" && item.supersededBy === "");
    assert.equal(liveAnswer, undefined);
    const corrected = decisions.find((item) => item.questionId === "DP-2.1" && item.supersededBy === "");
    assert.equal(corrected?.source, "brief-correction");
    assert.equal(corrected?.text, NEXT);
    const facts = loadFacts(dir);
    assert.equal(facts.answers.some((item) => item.id === "DP-2.1" && item.value === CORRECTION), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one revise is in flight, and an identical draft says so", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-030-once-"));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let revises = 0;
  let drafted: SiteBrief | null = null;
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "brief-draft") {
      return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
    }
    if (req.task !== "brief-revise") throw new Error(req.task);
    revises += 1;
    await gate;
    return { value: drafted ?? sample(), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    const pending = await draftSiteBrief(dir, think as never);
    drafted = pending.draft;
    const first = reviseSiteBrief(dir, CORRECTION, think as never);
    const second = reviseSiteBrief(dir, CORRECTION, think as never);
    assert.equal(first, second);
    for (let attempt = 0; attempt < 20 && revises === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(revises, 1);
    release();
    const revised = await first;
    assert.equal(revises, 1);
    assert.equal(revised.draft?.goal, LINE);
    assert.equal(revised.note, BRIEF_SAME_NOTE);
  } finally {
    release();
    rmSync(dir, { recursive: true, force: true });
  }
});
