/**
 * Spacing gate (spec 243, G5). Exactly 10 percent off the scale passes.
 * Anything over that is FIX. No measured boxes passes, with a reason.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { jargonHits } from "@hitchhiker/engine";
import {
  contrastFloorsFromSource,
  evaluateSpacing,
  loadBrandScale,
  spacingStepsFromSource,
  type SpacingBox,
  type SpacingLength,
} from "../src/spacing-gate.ts";

const SCALE = [0, 4, 8, 12, 16, 24, 40, 64, 96] as const;
const ON = 16;
const OFF = 6;

const TECHNICAL =
  /\b(?:webkit|woff2|axe|lighthouse|viewport|chromium|wcag|hotlink|font-display|lenis|playwright)\b/i;

function length(kind: SpacingLength["kind"], pixels: number): SpacingLength {
  return { kind, pixels };
}

function box(name: string, pixels: number, kind: SpacingLength["kind"] = "padding"): SpacingBox {
  return { name, lengths: [length(kind, pixels)] };
}

function copies(count: number, pixels: number, name: string): SpacingBox[] {
  return Array.from({ length: count }, (_, index) => box(`${name} ${index + 1}`, pixels));
}

function assertPlain(reason: string): void {
  assert.deepEqual(jargonHits(reason), []);
  assert.equal(TECHNICAL.test(reason), false, reason);
  assert.equal(reason.trim().length > 0, true);
}

test("exactly 10 percent of boxes off the scale passes", () => {
  const judged = evaluateSpacing({ boxes: [...copies(90, ON, "card"), ...copies(10, OFF, "loose")] }, SCALE);
  assert.equal(judged.status, "PASS");
  assert.equal(judged.evidence.measured, 100);
  assert.equal(judged.evidence.offScale, 10);
  assert.equal(judged.evidence.ratio, 0.1);
  assert.match(judged.reason, /close enough/);
  assert.match(judged.reason, /off the spacing scale/);
  assertPlain(judged.reason);
});

test("10.1 percent of boxes off the scale is FIX", () => {
  const judged = evaluateSpacing({ boxes: [...copies(899, ON, "card"), ...copies(101, OFF, "loose")] }, SCALE);
  assert.equal(judged.status, "FIX");
  assert.equal(judged.evidence.measured, 1000);
  assert.equal(judged.evidence.offScale, 101);
  assert.ok(Math.abs(judged.evidence.ratio - 0.101) < 1e-12);
  assert.match(judged.reason, /off the spacing scale/);
  assertPlain(judged.reason);
});

test("no measured boxes passes with a reason", () => {
  const empty = evaluateSpacing({ boxes: [] }, SCALE);
  assert.equal(empty.status, "PASS");
  assert.equal(empty.evidence.measured, 0);
  assert.equal(empty.evidence.offScale, 0);
  assert.equal(empty.evidence.ratio, 0);
  assert.equal(empty.reason, "No spacing was measured.");
  assertPlain(empty.reason);

  const blank = evaluateSpacing({ boxes: [{ name: "the hero", lengths: [] }] }, SCALE);
  assert.equal(blank.status, "PASS");
  assert.equal(blank.evidence.measured, 0);
  assert.equal(blank.reason, "No spacing was measured.");
});

test("a length within 1px of a step is on the scale, and 1px past that is not", () => {
  const onEdge = evaluateSpacing(
    { boxes: [box("the hero", ON + 1, "gap")] },
    SCALE,
  );
  assert.equal(onEdge.status, "PASS");
  assert.equal(onEdge.evidence.offScale, 0);
  assert.equal(onEdge.reason, "The spacing sits on the scale.");

  const past = evaluateSpacing({ boxes: [box("the hero", ON + 1.1, "gap")] }, SCALE);
  assert.equal(past.status, "FIX");
  assert.equal(past.evidence.offScale, 1);
  assert.match(past.reason, /gap on the hero/);
  assertPlain(past.reason);
});

test("one off length makes the whole box off, and the worst box is named first", () => {
  const boxes: SpacingBox[] = [
    ...Array.from({ length: 8 }, (_, index) => ({
      name: `card ${index + 1}`,
      lengths: [length("padding", 16), length("margin", 8), length("gap", 24), length("padding", 4), length("margin", 0)],
    })),
    { name: "the hero", lengths: [length("padding", 10)] },
    { name: "the footer", lengths: [length("margin", 30)] },
  ];
  const judged = evaluateSpacing({ boxes }, SCALE);
  assert.equal(judged.evidence.measured, 10);
  assert.equal(judged.evidence.offScale, 2);
  assert.equal(judged.status, "FIX");
  const first = judged.evidence.offenders[0];
  assert.equal(first?.name, "the footer");
  assert.match(judged.reason, /^The margin on the footer/);
  assert.match(judged.reason, /padding on the hero/);
  assertPlain(judged.reason);
});

test("a declared spacing scale in the brand tokens wins, and zero is on it", () => {
  const declared = spacingStepsFromSource(
    'export const SPACING_SCALE = [4, 8, 32] as const;\nconst unused = "space-1: 4px";\n',
  );
  assert.deepEqual(declared, [0, 4, 8, 32]);
  const lines = spacingStepsFromSource(['- space-1: 4px', '- space-2: 8px', '  space-6: "40px"'].join("\n"));
  assert.deepEqual(lines, [0, 4, 8, 40]);
  const none = spacingStepsFromSource("export const TYPE_LICENSE = \"confirm-at-install\";\n");
  assert.deepEqual(none, []);
});

test("the live brand file supplies contrast floors and the site spacing scale", () => {
  const brand = loadBrandScale();
  assert.equal(brand.bodyContrast, 4.5);
  assert.equal(brand.largeContrast, 3);
  assert.equal(brand.spacing[0], 0);
  for (const step of [4, 8, 12, 16, 24, 40, 64, 96]) {
    assert.equal(brand.spacing.includes(step), true, String(step));
  }
  const floors = contrastFloorsFromSource("const BODY_MIN = 4.5;\nconst LARGE_MIN = 3;\n");
  assert.deepEqual(floors, { body: 4.5, large: 3 });
});

test("a length that is not a number is refused", () => {
  assert.throws(
    () =>
      evaluateSpacing(
        { boxes: [{ name: "the hero", lengths: [{ kind: "padding", pixels: Number.NaN }] }] },
        SCALE,
      ),
    /pixel number/,
  );
});
