import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkPaletteProportion, PALETTE_TOLERANCE, PALETTE_TARGETS } from "../src/palette-proportion.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("60/30/10 within tolerance passes, and the check can be off", () => {
  assert.deepEqual(PALETTE_TARGETS, { dominant: 0.6, secondary: 0.3, accent: 0.1 });
  assert.equal(PALETTE_TOLERANCE, 0.08);
  const balanced = checkPaletteProportion({
    enabled: true,
    shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 },
  });
  assert.equal(balanced.flagged, false);
  assert.deepEqual(balanced.reasons, []);
  const edge = checkPaletteProportion({
    enabled: true,
    shares: { dominant: 0.68, secondary: 0.22, accent: 0.18 },
  });
  assert.equal(edge.flagged, false, edge.reasons.join("\n"));
  const off = checkPaletteProportion({
    enabled: false,
    shares: { dominant: 0.2, secondary: 0.2, accent: 0.6 },
  });
  assert.equal(off.flagged, false);
  assert.deepEqual(off.reasons, []);
});

test("an accent that covers half the page flags the proportion", () => {
  const half = checkPaletteProportion({
    enabled: true,
    shares: { dominant: 0.3, secondary: 0.2, accent: 0.5 },
  });
  assert.equal(half.flagged, true);
  assert.match(half.reasons.join(" "), /Accent covers half the page/);
  const near = checkPaletteProportion({
    enabled: true,
    shares: { dominant: 0.6, secondary: 0.21, accent: 0.19 },
  });
  assert.equal(near.flagged, true);
  assert.match(near.reasons.join(" "), /0\.19/);
  assert.equal(/half the page/.test(near.reasons.join(" ")), false);
});

test("the proportion check measures shares and does not ban a technique", () => {
  const source = readFileSync(path.join(here, "..", "src", "palette-proportion.ts"), "utf8");
  assert.equal(/three\.js|gsap|lenis|ban(ned)? library/i.test(source), false);
  assert.equal(/child_process|playwright/.test(source), false);
});
