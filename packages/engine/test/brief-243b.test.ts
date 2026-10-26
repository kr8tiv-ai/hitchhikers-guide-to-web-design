/**
 * BUG-074: a "Heading: text" correction scopes the revise.
 * An instruction is applied by the model and is not written as the field value.
 * A short value with no instruction words is a literal replacement.
 * Two failed revises leave instruction fields as they were and keep a Retry error.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { reviseSiteBrief } from "../src/guide/brief-desk.ts";
import { deterministicBrief } from "../src/guide/brief-loop.ts";
import { type SiteBrief } from "../src/guide/schemas.ts";
import { loadFacts } from "../src/guide/suggest.ts";

const RUN11 =
  "Motion: the home page opens with gentle motion on the hero photo only, no video file, since there is no video at launch. Action: say it once, without repeating the follow-up.";

const MOTION_UNDER =
  "Gentle parallax on the hero only. Farm cards fade in at about 400 ms. Everything stays still under reduced motion. A branching story stays. There is no 3D. The home page is a short calm film.";

const ACTION_UNDER =
  "Send an inquiry about one farm they can see. The form is prefilled with that farm ID. The follow-up is the same action: with the form.";

const MOTION_REVISED =
  "Gentle parallax on the hero only. Farm cards fade in at about 400 ms. Everything stays still under reduced motion. A branching story stays. There is no 3D.";

const ACTION_REVISED = "Send an inquiry about one farm they can see, and the form is prefilled with that farm ID.";

const MOTION_ANSWER =
  "Medium appetite: gentle parallax on the hero only, farm cards fade in at about 400 ms, everything still when reduced motion is on. A branching story stays. No 3D models. The home page is a short calm film.";

const ACTION_ANSWER = "Send an inquiry about one farm they can see. The form is prefilled with that farm ID.";

function seed(answers: readonly { id: string; value: string }[]): { dir: string; draft: SiteBrief } {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-243b-"));
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(
    path.join(hitch, "interview.json"),
    JSON.stringify({
      version: 1,
      answers: answers.map((answer) => ({ id: answer.id, status: "ANSWERED", value: answer.value })),
      cursor: "DP-9.5",
      pushedIds: [],
    }),
  );
  const draft = deterministicBrief(loadFacts(dir), "en");
  return { dir, draft };
}

function writeDraft(dir: string, draft: SiteBrief, error = ""): void {
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, error, note: "", fallback: false })}\n`,
  );
}

test("a scoped instruction revises the field and does not replace it with the instruction", async () => {
  const { dir, draft } = seed([
    { id: "DP-6.1", value: MOTION_ANSWER },
    { id: "DP-6.3", value: "A branching story stays. There is no film file." },
    { id: "DP-6.4", value: "No 3D models." },
    { id: "DP-2.2", value: ACTION_ANSWER },
  ]);
  draft.motion = MOTION_UNDER;
  draft.action = ACTION_UNDER;
  writeDraft(dir, draft);
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    assert.equal(req.task, "brief-revise");
    const value = { motion: MOTION_REVISED, action: ACTION_REVISED };
    return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "live" };
  };
  try {
    const revised = await reviseSiteBrief(dir, RUN11, think as never);
    const motion = revised.draft?.motion ?? "";
    const action = revised.draft?.action ?? "";
    assert.match(motion, /parallax/);
    assert.match(motion, /400 ms/);
    assert.match(motion, /reduced motion/);
    assert.match(motion, /no 3D/);
    assert.equal(motion.toLowerCase().includes("film"), false);
    assert.equal(motion.toLowerCase().includes("since there is no video"), false);
    assert.match(action, /inquiry/);
    assert.match(action, /prefilled/);
    assert.equal(action.toLowerCase().includes("say it once"), false);
    assert.equal(action.toLowerCase().includes("without repeating"), false);
    assert.equal(revised.error, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a short named value replaces the field, and a revise that already contains it wins", async () => {
  const { dir, draft } = seed([{ id: "DP-7.2", value: "Up to 50 dollars for stills." }]);
  writeDraft(dir, draft);
  let calls = 0;
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    assert.equal(req.task, "brief-revise");
    if (calls === 1) {
      const value = { budget: "The stills cost 50 dollars total." };
      return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "live" };
    }
    const value = { budget: "Pay later for the stills.", maintainer: "Someone else reviews the site." };
    return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "live" };
  };
  try {
    const kept = await reviseSiteBrief(dir, "Budget: 50 dollars", think as never);
    assert.equal(kept.draft?.budget, "The stills cost 50 dollars total.");
    const replaced = await reviseSiteBrief(
      dir,
      "Budget: 50 dollars. Maintainer: The owner approves every change.",
      think as never,
    );
    assert.match(replaced.draft?.budget ?? "", /^50 dollars\.?$/);
    assert.match(replaced.draft?.maintainer ?? "", /^The owner approves every change\.?$/);
    assert.equal((replaced.draft?.budget ?? "").includes("Pay later"), false);
    assert.equal((replaced.draft?.maintainer ?? "").includes("Someone else"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two failed revises leave instruction fields unchanged and show Retry", async () => {
  const { dir, draft } = seed([
    { id: "DP-6.1", value: MOTION_ANSWER },
    { id: "DP-2.2", value: ACTION_ANSWER },
  ]);
  draft.motion = MOTION_UNDER;
  draft.action = ACTION_UNDER;
  writeDraft(dir, draft);
  let calls = 0;
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    assert.equal(req.task, "brief-revise");
    throw new Error("The revise stopped.");
  };
  try {
    const revised = await reviseSiteBrief(dir, RUN11, think as never);
    assert.equal(calls, 2);
    assert.equal(revised.draft?.motion, MOTION_UNDER);
    assert.equal(revised.draft?.action, ACTION_UNDER);
    assert.match(revised.error, /Use Retry/);
    assert.equal((revised.draft?.motion ?? "").includes("say it once"), false);
    assert.equal((revised.draft?.action ?? "").toLowerCase().includes("say it once"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
