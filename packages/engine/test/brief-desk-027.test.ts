/**
 * BUG-027: drafting and approving the Site Brief go through briefLoop
 * with the context packet, then start one build.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { loadDecisions } from "../src/context/index.ts";
import { defaultConfig } from "../src/config.ts";
import {
  approveSiteBrief,
  draftSiteBrief,
  reviseSiteBrief,
} from "../src/guide/brief-desk.ts";
import { planInterview } from "../src/guide/interview-call.ts";
import type { SiteBrief } from "../src/guide/schemas.ts";
import { readRevisitId } from "../src/interview.ts";
import { loadQueue } from "../src/queue-file.ts";
import { loadState } from "../src/state.ts";

const LINE = "The site helps a visitor book a visit.";

function sampleBrief(goal = LINE): SiteBrief {
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
    maintainer: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: LINE,
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
}

function asThink(
  onCall: (req: ThinkRequest<unknown>) => SiteBrief | null,
): (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>> {
  return async (req) => {
    const brief = onCall(req);
    if (brief === null) throw new Error(`unexpected ${req.task}`);
    return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
  };
}

test("brief-draft stays on grok-4.7-build-fast at the chosen effort", () => {
  const planned = planInterview({ task: "brief-draft", effort: "medium" }, defaultConfig());
  assert.equal(planned.model, "grok-4.7-build-fast");
  assert.equal(planned.effort, "xhigh");
  assert.equal(planned.interview, true);
  const revise = planInterview({ task: "brief-revise" }, defaultConfig());
  assert.equal(revise.model, "grok-4.7-build-fast");
  assert.equal(revise.effort, "xhigh");
});

test("draftSiteBrief calls briefLoop with the context packet and does not draft twice", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-027-"));
  const calls: Array<{ task: string; input: string }> = [];
  const think = asThink((req) => {
    calls.push({ task: req.task, input: req.input });
    if (req.task === "brief-draft") return sampleBrief();
    return null;
  });
  try {
    const first = await draftSiteBrief(dir, think as never);
    assert.equal(first.status, "pending");
    assert.equal(first.draft?.goal, LINE);
    assert.match(first.markdown, /## Goal/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.task, "brief-draft");
    assert.match(calls[0]?.input ?? "", /## Context packet/);
    assert.match(calls[0]?.input ?? "", /Purpose: brief/);
    const second = await draftSiteBrief(dir, think as never);
    assert.equal(second.status, "pending");
    assert.equal(calls.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approve starts one build and a second approve does not call the model", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-027-approve-"));
  const tasks: string[] = [];
  const think = asThink((req) => {
    tasks.push(req.task);
    if (req.task === "brief-draft") return sampleBrief();
    return null;
  });
  try {
    const approved = await approveSiteBrief(dir, think as never);
    assert.equal(approved.status, "approved");
    assert.equal(approved.buildStarted, true);
    assert.equal(approved.phase, "Babel Fish");
    assert.equal(approved.nextAction, "The build is started.");
    const state = loadState(dir);
    assert.equal(state?.phase, "Babel Fish");
    assert.equal(state?.slice, "Guide Entry");
    assert.equal(state?.promptId, "guide-entry");
    const queue = await loadQueue(dir);
    assert.ok((queue?.items.length ?? 0) > 1);
    assert.equal(queue?.items[0]?.id, "001");
    assert.equal(queue?.items[0]?.kind, "build");
    assert.equal(queue?.items[0]?.status, "queued");
    assert.equal(queue?.items.some((item) => item.id === "guide-entry"), false);
    const briefFile = path.join(dir, ".hitchhiker", "SITE-BRIEF.md");
    assert.equal(existsSync(briefFile), true);
    assert.match(readFileSync(briefFile, "utf8"), /The site helps a visitor book a visit/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "brief-yes.json")), true);
    const drafts = tasks.filter((task) => task === "brief-draft");
    assert.equal(drafts.length, 1);
    const again = await approveSiteBrief(dir, think as never);
    assert.equal(again.buildStarted, true);
    assert.equal(tasks.filter((task) => task === "brief-draft").length, 1);
    const queueAgain = await loadQueue(dir);
    assert.equal(queueAgain?.items.length, queue?.items.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a question id returns to that question and prose revises without approving", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-027-change-"));
  const tasks: string[] = [];
  const nextGoal = "The site helps a visitor book a tour.";
  const think = asThink((req) => {
    tasks.push(req.task);
    if (req.task === "brief-draft") return sampleBrief();
    if (req.task === "brief-revise") return sampleBrief(nextGoal);
    return null;
  });
  try {
    await draftSiteBrief(dir, think as never);
    const back = await reviseSiteBrief(dir, "DP-2.1", think as never);
    assert.equal(back.revisit, "DP-2.1");
    assert.equal(readRevisitId(dir), "DP-2.1");
    assert.equal(tasks.includes("brief-revise"), false);
    await assert.rejects(() => reviseSiteBrief(dir, "approve", think as never), /Use Approve/);
    const revised = await reviseSiteBrief(dir, "The goal should name a tour.", think as never);
    assert.equal(revised.status, "pending");
    assert.equal(revised.buildStarted, false);
    assert.equal(revised.draft?.goal, nextGoal);
    assert.equal(loadState(dir)?.phase ?? "Don't Panic", "Don't Panic");
    const decisions = loadDecisions(dir);
    assert.equal(decisions.some((item) => item.text === "The goal should name a tour."), true);
    assert.equal((await loadQueue(dir))?.items.length ?? 0, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
