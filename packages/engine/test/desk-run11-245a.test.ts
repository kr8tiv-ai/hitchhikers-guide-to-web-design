/**
 * 245a. A design stage cannot be approved, and a build cannot start, without
 * a picked direction, enough reference images, and a locked DESIGN.md.
 * Fonts and colour tokens that drift from DESIGN.md fail the prebuild check.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { saveDirectionDeal, readDirectionDeal, chooseDirection, dealDirections } from "../src/brand/directions.ts";
import { writeDesignLock } from "../src/spec/design-lock.ts";
import { advanceDesignStages, designReadyForBuild } from "../src/spec/design-stages.ts";
import { writeDesignMd } from "../src/spec/design-outputs.ts";
import { runPrebuildChecks } from "../src/spec/prebuild-checks.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a visit.";
const PICK_REASON = "Pick a design direction before the build.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-245a-"));
}

function direction(display: string, body: string, id = "dir-sample") {
  return {
    id,
    name: "Sample",
    description: "A quiet direction.",
    citationId: "sample",
    title: "Sample",
    url: "https://example.com/sample",
    display,
    body,
    sectionOrder: ["hero"],
    hue: "#1f6b4a",
  };
}

function writeShots(dir: string, count: number, folder = path.join("reference", "refs")): void {
  const target = path.join(dir, folder);
  mkdirSync(target, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    writeFileSync(path.join(target, `shot-${index}.png`), PNG);
  }
}

function readStages(dir: string): {
  sitemap?: string;
  wireframe?: string;
  styleGuide?: string;
  direction?: string;
  prebuild?: string;
} {
  return JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "design-stages.json"), "utf8")) as {
    sitemap?: string;
    wireframe?: string;
    styleGuide?: string;
    direction?: string;
    prebuild?: string;
  };
}

/** The engine writes an artefact, then records the approval on the next call. */
function approveThroughWireframe(dir: string): void {
  advanceDesignStages(dir, { brief: BRIEF });
  advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "sitemap", text: "Approved." } });
  advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "wireframe", text: "Approved." } });
}

function decisionLines(dir: string): string[] {
  const file = path.join(dir, ".hitchhiker", "decisions.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

test("a direction approval with no pick is not recorded", { timeout: 5_000 }, () => {
  const dir = tempDir();
  try {
    approveThroughWireframe(dir);
    saveDirectionDeal(dir, { pickedId: null, directions: [direction("General Sans", "X")] });
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "style-guide", text: "Approved." } });
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "direction", text: "Approved." } });
    const state = readStages(dir);
    assert.equal(state.styleGuide, undefined);
    assert.equal(state.direction, undefined);
    const gate = designReadyForBuild(dir, BRIEF);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, PICK_REASON);
  } finally {
    removeTempDir(dir);
  }
});

test("approved stages with a null pick are not ready and the later approvals clear once", { timeout: 5_000 }, () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "design-stages.json"),
      `${JSON.stringify({
        sitemap: "Approved.",
        wireframe: "Approved.",
        styleGuide: "Approved.",
        direction: "Approved.",
        prebuild: "Approved.",
      })}\n`,
    );
    writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "# Sitemap\n\n## Primary\n\n- Home at /\n", "utf8");
    writeFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "# Wireframe\n\n## Home\n", "utf8");
    saveDirectionDeal(dir, { pickedId: null, directions: [direction("General Sans", "X")] });
    const gate = designReadyForBuild(dir, BRIEF);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, PICK_REASON);
    const state = readStages(dir);
    assert.equal(state.sitemap, "Approved.");
    assert.equal(state.wireframe, "Approved.");
    assert.equal(state.styleGuide, undefined);
    assert.equal(state.direction, undefined);
    assert.equal(state.prebuild, undefined);
    const lines = decisionLines(dir);
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0] ?? "{}") as { reason?: string };
    assert.match(row.reason ?? "", /no direction is picked/i);
    designReadyForBuild(dir, BRIEF);
    assert.equal(decisionLines(dir).length, 1);
  } finally {
    removeTempDir(dir);
  }
});

test("reference images use the configured minimum and count captured shots", { timeout: 20_000 }, () => {
  const dir = tempDir();
  try {
    approveThroughWireframe(dir);
    const deal = dealDirections();
    saveDirectionDeal(dir, deal);
    const first = deal.directions[0];
    assert.ok(first);
    chooseDirection(dir, first.id, "It fits the visit.");
    writeShots(dir, 5);
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "style-guide", text: "Approved." } });
    assert.equal(readStages(dir).styleGuide, undefined);
    const five = designReadyForBuild(dir, BRIEF);
    assert.equal(five.ok, false);
    assert.match(five.reason, /Add at least 6 reference images before the build/);

    writeFileSync(
      path.join(dir, ".hitchhiker", "config.json"),
      `${JSON.stringify({ design: { minReferenceImages: 5 } })}\n`,
    );
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "style-guide", text: "Approved." } });
    assert.equal(readStages(dir).styleGuide, "Approved.");
    writeDesignLock(dir, first.id);
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "direction", text: "Approved." } });
    advanceDesignStages(dir, {
      brief: BRIEF,
      approval: { stage: "prebuild", text: "Approved." },
      acknowledge: true,
    });
    const overridden = designReadyForBuild(dir, BRIEF);
    assert.equal(overridden.ok, true, overridden.reason);

    rmSync(path.join(dir, ".hitchhiker", "config.json"));
    const back = designReadyForBuild(dir, BRIEF);
    assert.equal(back.ok, false);
    assert.match(back.reason, /Add at least 6 reference images before the build/);

    const captured = tempDir();
    try {
      approveThroughWireframe(captured);
      const again = dealDirections();
      saveDirectionDeal(captured, again);
      const picked = again.directions[0];
      assert.ok(picked);
      chooseDirection(captured, picked.id, "It fits the visit.");
      writeShots(captured, 6);
      writeFileSync(path.join(captured, "reference", "refs", "README.md"), "# Reference shots\n\nCaptured automatically.\n", "utf8");
      advanceDesignStages(captured, { brief: BRIEF, approval: { stage: "style-guide", text: "Approved." } });
      writeDesignLock(captured, picked.id);
      advanceDesignStages(captured, { brief: BRIEF, approval: { stage: "direction", text: "Approved." } });
      advanceDesignStages(captured, {
        brief: BRIEF,
        approval: { stage: "prebuild", text: "Approved." },
        acknowledge: true,
      });
      const ready = designReadyForBuild(captured, BRIEF);
      assert.equal(ready.ok, true, ready.reason);
    } finally {
      removeTempDir(captured);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("a missing, unsectioned, or unlocked DESIGN.md blocks the build", { timeout: 20_000 }, () => {
  const dir = tempDir();
  try {
    approveThroughWireframe(dir);
    const deal = dealDirections();
    saveDirectionDeal(dir, deal);
    const first = deal.directions[0];
    assert.ok(first);
    chooseDirection(dir, first.id, "It fits the visit.");
    writeShots(dir, 6);
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "style-guide", text: "Approved." } });
    writeDesignLock(dir, first.id);
    advanceDesignStages(dir, { brief: BRIEF, approval: { stage: "direction", text: "Approved." } });
    advanceDesignStages(dir, {
      brief: BRIEF,
      approval: { stage: "prebuild", text: "Approved." },
      acknowledge: true,
    });
    const ready = designReadyForBuild(dir, BRIEF);
    assert.equal(ready.ok, true, ready.reason);

    const designPath = path.join(dir, "DESIGN.md");
    const original = readFileSync(designPath, "utf8");
    const withoutIdea = original.replace(/## Brand idea\n\n[\s\S]*?\n## /, "## ");
    writeFileSync(designPath, withoutIdea, "utf8");
    const unsectioned = designReadyForBuild(dir, BRIEF);
    assert.equal(unsectioned.ok, false);
    assert.match(unsectioned.reason, /Brand idea/);

    rmSync(designPath);
    const missing = designReadyForBuild(dir, BRIEF);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "DESIGN.md is missing.");

    writeFileSync(designPath, original.replace("carries that idea", "holds that idea"), "utf8");
    const unlocked = designReadyForBuild(dir, BRIEF);
    assert.equal(unlocked.ok, false);
    assert.equal(unlocked.reason, "DESIGN.md is not locked.");
  } finally {
    removeTempDir(dir);
  }
});

test("a picked pair is written through, and a token edit is design drift", { timeout: 5_000 }, () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "brand"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "brand", "BRAND.md"),
      "# Brand\n\n## Directions\n\nPick one.\n\n## Type\n\nDealt families: Switzer.\n",
      "utf8",
    );
    saveDirectionDeal(dir, { pickedId: "dir-sample", directions: [direction("General Sans", "X")] });
    writeDesignMd(dir, BRIEF, [], null);
    const design = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.match(design, /General Sans/);
    assert.match(design, /\bX\b/);
    assert.doesNotMatch(design, /Syne/);
    assert.doesNotMatch(design, /Spline Sans/);
    assert.doesNotMatch(design, /Switzer/);
    const tokens = readFileSync(path.join(dir, ".hitchhiker", "design", "tokens.json"), "utf8");
    assert.match(tokens, /General Sans/);
    assert.match(tokens, /"X"/);
    const brand = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    assert.match(brand, /Picked families: General Sans and X\./);
    const picked = readDirectionDeal(dir);
    assert.equal(picked?.pickedId, "dir-sample");

    const edited = tokens.replace("General Sans", "Syne");
    writeFileSync(path.join(dir, ".hitchhiker", "design", "tokens.json"), edited, "utf8");
    const report = runPrebuildChecks(BRIEF, dir);
    const drift = report.checks.find((check) => check.id === "design-drift");
    assert.ok(drift);
    assert.equal(drift.status, "fail");
    assert.match(drift.detail, /tokens\.json/);
    assert.match(drift.detail, /typography\.display\.fontFamily/);
    assert.match(drift.detail, /Syne/);
  } finally {
    removeTempDir(dir);
  }
});

test("saving a fresh deal does not drop a pick that is still in the set", { timeout: 5_000 }, () => {
  const dir = tempDir();
  try {
    const kept = direction("General Sans", "X");
    saveDirectionDeal(dir, { pickedId: kept.id, directions: [kept] });
    saveDirectionDeal(dir, { pickedId: null, directions: [kept] });
    assert.equal(readDirectionDeal(dir)?.pickedId, kept.id);
    const other = direction("Sentient", "Switzer", "dir-other");
    saveDirectionDeal(dir, { pickedId: null, directions: [other] });
    assert.equal(readDirectionDeal(dir)?.pickedId, kept.id);
  } finally {
    removeTempDir(dir);
  }
});
