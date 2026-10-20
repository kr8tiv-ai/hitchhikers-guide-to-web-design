/**
 * BUG-055 idea 2. Screenshot fix loop: top 3 issues, at most 3 rounds,
 * at the three review widths below 1920. A fourth known issue stays
 * untouched. A clean page stops on round one. No browser and no model.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { type SectionShot } from "../src/beauty-gate.ts";
import { falseVisualBans } from "../src/zaphod-vision.ts";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";
import { runScreenshotFixLoop, screenshotFixWidths } from "../src/elevate-loop.ts";

function shot(section: string, score: number): SectionShot {
  return {
    page: "home",
    section,
    score,
    reason: score < 8 ? "Thin." : "Fine.",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    slop: "",
    screenshot: `.hitchhiker/review/${section}.png`,
    ...falseVisualBans(),
  };
}

const FOUR = [shot("alpha", 1), shot("beta", 2), shot("gamma", 3), shot("delta", 4)];
const CLEAN = [shot("hero", 9)];

test("screenshot fix widths are the review widths without 1920", () => {
  assert.deepEqual(
    [...screenshotFixWidths()],
    REVIEW_WIDTHS.filter((width) => width !== 1920),
  );
  assert.equal(screenshotFixWidths().includes(1920), false);
  assert.deepEqual([...screenshotFixWidths()], [375, 768, 1440]);
});

test("four known issues stop after three rounds and leave the fourth untouched", async () => {
  const captures: Array<{ round: number; width: number }> = [];
  const fixed: string[][] = [];
  const report = await runScreenshotFixLoop({
    capture: async (width, round) => {
      captures.push({ round, width });
      return FOUR;
    },
    fix: (issues) => {
      fixed.push(issues.map((issue) => issue.id));
    },
  });
  assert.equal(report.rounds, 3);
  assert.equal(report.stopped, "cap");
  assert.equal(captures.length, 9);
  assert.equal(captures.some((row) => row.width === 1920), false);
  assert.deepEqual(
    captures.map((row) => row.width),
    [375, 768, 1440, 375, 768, 1440, 375, 768, 1440],
  );
  assert.equal(fixed.length, 3);
  for (const round of fixed) {
    assert.deepEqual(round, ["home::alpha", "home::beta", "home::gamma"]);
    assert.equal(round.includes("home::delta"), false);
  }
  assert.deepEqual(report.untouched, ["home::delta"]);
  assert.deepEqual(report.fixed, ["home::alpha", "home::beta", "home::gamma"]);
});

test("a clean page stops at round one and does not ask for a fix", async () => {
  const captures: number[] = [];
  let fixes = 0;
  const report = await runScreenshotFixLoop({
    capture: async (width) => {
      captures.push(width);
      return CLEAN;
    },
    fix: () => {
      fixes += 1;
    },
  });
  assert.equal(report.rounds, 1);
  assert.equal(report.stopped, "clean");
  assert.equal(fixes, 0);
  assert.deepEqual(captures, [375, 768, 1440]);
  assert.deepEqual(report.untouched, []);
  assert.deepEqual(report.fixed, []);
});
