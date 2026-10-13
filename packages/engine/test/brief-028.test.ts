/**
 * BUG-028: brief fields come from recorded answers before the model speaks.
 * A recorded answer never renders as unstated. Pages and Features are fields.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { syncAnswer } from "../src/context/index.ts";
import { draftSiteBrief, readBriefDesk } from "../src/guide/brief-desk.ts";
import {
  BRIEF_ANSWER_IDS,
  BRIEF_DRAFT_ERROR,
  BRIEF_DRAFT_MAX_TURNS,
  BRIEF_SOURCES,
  deterministicBrief,
} from "../src/guide/brief-loop.ts";
import { BRIEF_KEYS, type BriefKey, type Facts, type SiteBrief } from "../src/guide/schemas.ts";

const UNSTATED = "The field is not stated yet.";
const OLD_GOAL = "Help a visitor book a glass tour.";
const NEW_GOAL = "Help a visitor book a private tour.";

const EXPECTED_SOURCES: Record<BriefKey, readonly string[]> = {
  goal: ["DP-2.1"],
  visitor: ["DP-2.6"],
  action: ["DP-2.2"],
  offer: ["DP-2.7"],
  vibe: ["DP-5.3"],
  references: ["DP-5.1", "DP-5.2"],
  exists: ["DP-0.2"],
  protected: ["DP-1.9"],
  motion: ["DP-6.1", "DP-6.2", "DP-6.3", "DP-6.4", "DP-6.6"],
  limits: ["DP-8.4", "DP-9.1", "DP-9.5"],
  hosting: ["DP-9.2"],
  maintainer: ["DP-9.3"],
  pages: ["DP-2.8"],
  features: ["DP-3.7"],
  cadence: ["DP-3.5", "DP-8.3"],
  coverage: [],
};

const ANSWERS: Record<string, string> = {
  "DP-2.1": NEW_GOAL,
  "DP-2.6": "A homeowner choosing a facade.",
  "DP-2.2": "Book a site measure.",
  "DP-2.7": "Architectural glass cut to the opening.",
  "DP-5.3": "Quiet, exact, and warm.",
  "DP-5.1": "Steal the calm pacing from a workshop site.",
  "DP-5.2": "A workshop wall, not a showroom.",
  "DP-0.2": "A one page site already exists.",
  "DP-1.9": "The family name stays as written.",
  "DP-6.1": "Motion stays slow.",
  "DP-6.2": "Still, unless the visitor asks.",
  "DP-6.3": "No autoplay video.",
  "DP-6.4": "Hover states stay small.",
  "DP-6.6": "Reduced motion is the default.",
  "DP-8.4": "No stock photography.",
  "DP-9.1": "Keep the copy short.",
  "DP-9.5": "Do not add a shop.",
  "DP-9.2": "A static host the client already pays for.",
  "DP-9.3": "The owner looks after the site.",
  "DP-2.8": "Home, work, and visit.",
  "DP-3.7": "A contact form and a visit request.",
  "DP-3.5": "One guide a month.",
  "DP-8.3": "A short note each month.",
};

function unstatedBrief(): SiteBrief {
  const brief = {} as SiteBrief;
  for (const key of BRIEF_KEYS) brief[key] = UNSTATED;
  return brief;
}

function factsFrom(answers: Record<string, string>): Facts {
  return {
    answers: Object.entries(answers).map(([id, value]) => ({ id, value })),
    uploads: [],
    crawlNotes: [],
  };
}

async function seedInterview(dir: string, goal: string): Promise<void> {
  await syncAnswer(dir, {
    questionId: "DP-2.1",
    text: OLD_GOAL,
    source: "answer",
    moveCursor: false,
    summarize: false,
  });
  await syncAnswer(dir, {
    questionId: "DP-2.1",
    text: goal,
    source: "answer",
    moveCursor: false,
    summarize: false,
  });
  for (const [id, text] of Object.entries(ANSWERS)) {
    if (id === "DP-2.1") continue;
    await syncAnswer(dir, { questionId: id, text, source: "answer", moveCursor: false, summarize: false });
  }
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: OLD_GOAL }]),
  );
}

test("brief fields map to question ids, including Pages and Features", () => {
  assert.deepEqual(BRIEF_SOURCES, EXPECTED_SOURCES);
  assert.equal(BRIEF_ANSWER_IDS.motion, "DP-6.2");
  assert.equal(BRIEF_ANSWER_IDS.references, "DP-5.2");
  assert.equal(BRIEF_ANSWER_IDS.pages, "DP-2.8");
  assert.equal(BRIEF_ANSWER_IDS.features, "DP-3.7");
  const filled = deterministicBrief(factsFrom(ANSWERS), "en");
  for (const key of BRIEF_KEYS) {
    assert.equal(filled[key].includes("not stated yet"), false, key);
    for (const id of EXPECTED_SOURCES[key]) assert.match(filled[key], new RegExp(ANSWERS[id].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(filled.coverage, /Covered:/);
  assert.match(filled.coverage, /DP-2\.1/);
  assert.match(filled.pages, /Home, work, and visit/);
  assert.match(filled.features, /contact form/);
});

test("a superseded answer is not used and a model unstated line cannot blank a field", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-028-"));
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    if (req.task !== "brief-draft") throw new Error(req.task);
    return { value: unstatedBrief(), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    await seedInterview(dir, NEW_GOAL);
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(desk.status, "pending");
    assert.equal(desk.error, "");
    const draft = desk.draft;
    assert.ok(draft);
    for (const key of BRIEF_KEYS) assert.equal(draft[key].includes("not stated yet"), false, key);
    assert.equal(draft.goal.includes("glass tour"), false);
    assert.match(draft.goal, /private tour/);
    assert.match(draft.pages, /Home, work, and visit/);
    assert.match(draft.features, /contact form/);
    assert.match(draft.motion, /Still, unless the visitor asks/);
    assert.match(desk.markdown, /## Pages/);
    assert.match(desk.markdown, /## Features/);
    assert.equal(calls.length, 1);
    const req = calls[0];
    assert.ok(req);
    assert.equal(req.model, "grok-4.7-build-fast");
    assert.equal(req.effort, "xhigh");
    assert.equal(req.maxTurns, BRIEF_DRAFT_MAX_TURNS);
    assert.ok((req.schema?.required ?? []).includes("pages"));
    assert.ok((req.schema?.required ?? []).includes("features"));
    assert.match(req.input, /## Context packet/);
    assert.match(req.input, /private tour/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("max turns retries once, then keeps the recorded fields and an honest error", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-028-turns-"));
  let calls = 0;
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    if (req.task !== "brief-draft") throw new Error(req.task);
    throw new Error("max turns reached");
  };
  try {
    await seedInterview(dir, NEW_GOAL);
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(calls, 2);
    assert.equal(desk.status, "pending");
    assert.equal(desk.error, BRIEF_DRAFT_ERROR);
    assert.match(desk.error, /Retry/);
    assert.equal(desk.error.includes("!"), false);
    const draft = desk.draft;
    assert.ok(draft);
    assert.match(draft.goal, /private tour/);
    assert.equal(draft.goal.includes("glass tour"), false);
    assert.match(draft.pages, /Home, work, and visit/);
    assert.match(draft.features, /contact form/);
    for (const key of BRIEF_KEYS) assert.equal(draft[key].trim() === "", false, key);
    const again = readBriefDesk(dir);
    assert.equal(again.error, BRIEF_DRAFT_ERROR);
    assert.match(again.draft?.goal ?? "", /private tour/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
