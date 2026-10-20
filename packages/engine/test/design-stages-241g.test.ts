/**
 * Idea 7. Sitemap, then section wireframe, then DESIGN.md.
 * Each artifact waits for a recorded approval. A blank answer is not approval.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { emitDesignStages, openInterview } from "../src/interview.ts";

const BRIEF = "The site helps a visitor book a visit.";
const CLOCK = () => new Date("2026-10-20T12:00:00.000Z");

function paths(dir: string): { sitemap: string; wireframe: string; design: string; approvals: string } {
  return {
    sitemap: path.join(dir, ".hitchhiker", "sitemap.md"),
    wireframe: path.join(dir, ".hitchhiker", "wireframe.md"),
    design: path.join(dir, "DESIGN.md"),
    approvals: path.join(dir, ".hitchhiker", "design-stages.json"),
  };
}

test("a run that skips the wireframe approval does not write DESIGN.md", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-stages-241g-"));
  const early = mkdtempSync(path.join(os.tmpdir(), "hh-stages-241g-early-"));
  try {
    const file = paths(dir);
    const opened = await openInterview(dir, "express", CLOCK, { brief: BRIEF });
    assert.equal(opened.stages?.wrote, "sitemap");
    assert.equal(existsSync(file.sitemap), true);
    assert.match(readFileSync(file.sitemap, "utf8"), /Home/);
    assert.equal(existsSync(file.wireframe), false);
    assert.equal(existsSync(file.design), false);

    const wire = await emitDesignStages(dir, {
      brief: BRIEF,
      approval: { stage: "sitemap", text: "The pages are right." },
    });
    assert.equal(wire.wrote, "wireframe");
    assert.equal(existsSync(file.wireframe), true);
    assert.match(readFileSync(file.wireframe, "utf8"), /hero/);
    assert.equal(existsSync(file.design), false);
    const saved = JSON.parse(readFileSync(file.approvals, "utf8")) as { sitemap?: string; wireframe?: string };
    assert.equal(saved.sitemap, "The pages are right.");
    assert.equal(saved.wireframe, undefined);

    const skipped = await emitDesignStages(dir, { brief: BRIEF });
    assert.equal(skipped.wrote, "none");
    assert.equal(skipped.designMd, false);
    assert.equal(existsSync(file.design), false);

    const blank = await emitDesignStages(dir, {
      brief: BRIEF,
      approval: { stage: "wireframe", text: "   " },
    });
    assert.equal(blank.designMd, false);
    assert.equal(existsSync(file.design), false);

    const jumped = await emitDesignStages(early, {
      brief: BRIEF,
      approval: { stage: "wireframe", text: "Skip ahead." },
    });
    assert.equal(jumped.wrote, "sitemap");
    assert.equal(existsSync(paths(early).design), false);
    assert.equal(existsSync(paths(early).wireframe), false);

    const done = await emitDesignStages(dir, {
      brief: BRIEF,
      approval: { stage: "wireframe", text: "The sections are right." },
    });
    assert.equal(done.wrote, "style-guide");
    assert.equal(done.designMd, true);
    const design = readFileSync(file.design, "utf8");
    assert.match(design, /Families:/);
    assert.equal(design.includes("!"), false);
    const after = JSON.parse(readFileSync(file.approvals, "utf8")) as { sitemap: string; wireframe: string };
    assert.equal(after.sitemap, "The pages are right.");
    assert.equal(after.wireframe, "The sections are right.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(early, { recursive: true, force: true });
  }
});
