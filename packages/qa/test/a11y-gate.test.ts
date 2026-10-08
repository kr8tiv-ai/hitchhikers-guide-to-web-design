import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BODY_CONTRAST_MIN,
  evaluateA11y,
  type A11yGateInput,
  type A11yViolation,
} from "../src/a11y-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function gate(overrides: Partial<A11yGateInput> = {}): A11yGateInput {
  return {
    violations: overrides.violations ?? [],
    hasKeyboardPath: overrides.hasKeyboardPath ?? true,
    hasReducedMotion: overrides.hasReducedMotion ?? true,
    contrastRatio: overrides.contrastRatio ?? 21,
    motionUsed: overrides.motionUsed ?? true,
  };
}

function hit(impact: A11yViolation["impact"], id: string): A11yViolation {
  return { impact, id };
}

test("empty axe, keyboard, reduced motion, and contrast 21 pass", () => {
  const result = evaluateA11y(gate());
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.notes, []);
});

test("a serious axe hit blocks", () => {
  const result = evaluateA11y(gate({ violations: [hit("serious", "button-name")] }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, ["Axe serious button-name blocks."]);
});

test("a critical axe hit blocks", () => {
  const result = evaluateA11y(gate({ violations: [hit("critical", "image-alt")] }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, ["Axe critical image-alt blocks."]);
});

test("a moderate axe hit blocks and the note says moderate is included", () => {
  const result = evaluateA11y(gate({ violations: [hit("moderate", "region")] }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, [
    "Axe moderate region blocks.",
    "Moderate is included. It blocks along with serious and critical.",
  ]);
});

test("a minor axe hit is a note and does not block", () => {
  const result = evaluateA11y(gate({ violations: [hit("minor", "empty-heading")] }));
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.notes, ["Axe minor empty-heading is a note."]);
});

test("a minor hit stays listed when a serious hit blocks", () => {
  const result = evaluateA11y(
    gate({
      violations: [hit("serious", "button-name"), hit("minor", "empty-heading")],
    }),
  );
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, [
    "Axe serious button-name blocks.",
    "Axe minor empty-heading is a note.",
  ]);
});

test("a missing keyboard path blocks when axe is empty", () => {
  const result = evaluateA11y(gate({ violations: [], hasKeyboardPath: false }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, ["Keyboard path is missing."]);
});

test("motion without reduced-motion handling blocks", () => {
  const result = evaluateA11y(gate({ motionUsed: true, hasReducedMotion: false }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, ["Motion is used and reduced-motion handling is missing."]);
});

test("motion with reduced-motion handling does not block", () => {
  const result = evaluateA11y(gate({ motionUsed: true, hasReducedMotion: true }));
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.notes, []);
});

test("unused motion does not require the reduced-motion flag", () => {
  const missing = evaluateA11y(
    gate({ motionUsed: false, hasReducedMotion: false, contrastRatio: 4.5 }),
  );
  const present = evaluateA11y(
    gate({ motionUsed: false, hasReducedMotion: true, contrastRatio: 4.5 }),
  );
  assert.equal(missing.status, "PASS");
  assert.deepEqual(missing.notes, []);
  assert.equal(present.status, "PASS");
  assert.deepEqual(present.notes, []);
});

test("body contrast 4.5 passes and 4.49 blocks", () => {
  const passed = evaluateA11y(gate({ contrastRatio: 4.5, motionUsed: false }));
  const blocked = evaluateA11y(gate({ contrastRatio: 4.49, motionUsed: false }));
  assert.equal(passed.status, "PASS");
  assert.deepEqual(passed.notes, []);
  assert.equal(blocked.status, "BLOCKER");
  assert.deepEqual(blocked.notes, [`Body contrast is 4.49, under ${BODY_CONTRAST_MIN}.`]);
});

test("the body contrast floor matches the brand token helper", () => {
  const tokensPath = path.resolve(here, "..", "..", "engine", "src", "brand", "tokens.ts");
  const source = readFileSync(tokensPath, "utf8");
  const bodyMin = source.match(/const BODY_MIN = ([\d.]+);/)?.[1];
  assert.equal(typeof bodyMin, "string");
  assert.equal(Number(bodyMin), BODY_CONTRAST_MIN);
  assert.equal(BODY_CONTRAST_MIN, 4.5);
  assert.match(source, /kind === "body" \? BODY_MIN : LARGE_MIN/);
});

test("every blocker is listed, and a minor stays a note", () => {
  const result = evaluateA11y(
    gate({
      violations: [
        hit("critical", "image-alt"),
        hit("minor", "empty-heading"),
        hit("moderate", "region"),
        hit("serious", "button-name"),
      ],
      hasKeyboardPath: false,
      hasReducedMotion: false,
      contrastRatio: 4.49,
      motionUsed: true,
    }),
  );
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.notes, [
    "Axe critical image-alt blocks.",
    "Axe moderate region blocks.",
    "Axe serious button-name blocks.",
    "Moderate is included. It blocks along with serious and critical.",
    "Keyboard path is missing.",
    "Motion is used and reduced-motion handling is missing.",
    "Body contrast is 4.49, under 4.5.",
    "Axe minor empty-heading is a note.",
  ]);
});

test("an unknown axe impact throws", () => {
  const bad = {
    ...gate(),
    violations: [{ impact: "trivial", id: "made-up" }],
  };
  assert.throws(
    () => evaluateA11y(bad as A11yGateInput),
    /violations\[0\]\.impact is "trivial"\. Expected minor, moderate, serious, or critical\./,
  );
});

test("a missing impact throws", () => {
  const bad = {
    ...gate(),
    violations: [{ id: "button-name" }],
  };
  assert.throws(
    () => evaluateA11y(bad as A11yGateInput),
    /violations\[0\]\.impact is undefined\. Expected minor, moderate, serious, or critical\./,
  );
});

test("the gate source does not import a browser or axe-core", () => {
  const source = readFileSync(path.resolve(here, "..", "src", "a11y-gate.ts"), "utf8");
  assert.match(source, /export function evaluateA11y/);
  assert.doesNotMatch(source, /node:child_process/);
  assert.doesNotMatch(source, /playwright/);
  assert.doesNotMatch(source, /puppeteer/);
  assert.doesNotMatch(source, /from\s+["'][^"']*axe-core/);
  assert.doesNotMatch(source, /require\(\s*["'][^"']*axe-core/);
});
