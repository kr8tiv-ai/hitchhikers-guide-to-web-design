/**
 * A recorded answer fills an empty or unstated Site Brief field.
 * A Change something correction still wins for the field it names, once, in SITE-BRIEF.md.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { approveSiteBrief, draftSiteBrief, reviseSiteBrief } from "../src/guide/brief-desk.ts";
import { readSiteBrief } from "../src/guide/brief-loop.ts";
import { BRIEF_KEYS, type SiteBrief } from "../src/guide/schemas.ts";

const UNSTATED = "The field is not stated yet.";
const GOAL = "The site exists so a neighbor can order tea without calling.";
const EXISTS = "it's fine";
const RECORDED_VIBE = "Calm, about a three, enough to feel considered.";
const CORRECTED_VIBE = "The shop should feel like warm paper, quieter than before.";
const CORRECTION = "The vibe should say warm paper.";

function unstatedBrief(): SiteBrief {
  const brief = {} as SiteBrief;
  for (const key of BRIEF_KEYS) brief[key] = UNSTATED;
  return brief;
}

function countOf(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

test("recorded answers fill unstated fields and a correction still wins", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-219-"));
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    if (req.task === "brief-draft") {
      return { value: unstatedBrief(), raw: "{}", durationMs: 0, cassette: "live" };
    }
    if (req.task === "brief-revise") {
      const vibe = { vibe: CORRECTED_VIBE };
      return { value: vibe, raw: JSON.stringify(vibe), durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(
      path.join(hitch, "interview.json"),
      JSON.stringify({
        version: 1,
        answers: [
          { id: "DP-2.1", status: "ANSWERED", value: GOAL },
          { id: "DP-0.2", status: "SOFT", value: EXISTS },
          { id: "DP-5.3", status: "ANSWERED", value: RECORDED_VIBE },
        ],
        cursor: "DP-6.2",
        pushedIds: [],
      }),
    );
    const drafted = await draftSiteBrief(dir, think as never);
    const draft = drafted.draft;
    assert.ok(draft);
    assert.equal(draft.goal, GOAL);
    assert.equal(draft.exists, EXISTS);
    assert.equal(draft.vibe, RECORDED_VIBE);
    assert.match(draft.pages, /not stated yet/);
    assert.equal(draft.pages.includes(GOAL), false);

    const revised = await reviseSiteBrief(dir, CORRECTION, think as never);
    assert.equal(revised.draft?.vibe, CORRECTED_VIBE);
    assert.equal(revised.draft?.goal, GOAL);
    assert.equal(revised.draft?.exists, EXISTS);
    assert.match(revised.draft?.pages ?? "", /not stated yet/);
    assert.equal(revised.draft?.vibe.includes(RECORDED_VIBE), false);

    const approved = await approveSiteBrief(dir, think as never);
    assert.equal(approved.status, "approved");
    assert.equal(approved.draft?.vibe, CORRECTED_VIBE);
    const brief = readSiteBrief(dir) ?? "";
    assert.equal(brief, readFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), "utf8"));
    assert.equal(countOf(brief, CORRECTED_VIBE), 1);
    assert.equal(brief.includes(RECORDED_VIBE), false);
    assert.match(brief, /not stated yet/);
    assert.equal(brief.includes("!"), false);

    const reviseCall = calls.find((req) => req.task === "brief-revise");
    const draftCall = calls.find((req) => req.task === "brief-draft");
    assert.ok(reviseCall);
    assert.ok(draftCall);
    assert.equal(reviseCall.model, "grok-4.7-build-fast");
    assert.equal(reviseCall.effort, "xhigh");
    assert.equal(draftCall.model, "grok-4.7-build-fast");
    assert.equal(draftCall.effort, "xhigh");
    assert.equal(calls.filter((req) => req.task === "brief-revise").length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
