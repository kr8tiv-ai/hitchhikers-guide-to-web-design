import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  confirmPulse,
  enter,
  mapProgress,
  prefersReducedMotion,
  toast,
} from "../src/design/motion.ts";
import { color, contrastRatio } from "../src/design/tokens.ts";

const motionSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/design/motion.ts"),
  "utf8",
);

test("text pairs clear WCAG AA in both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    assert.ok(
      contrastRatio(color.ink[theme], color.surface[theme]) >= 4.5,
      `ink on surface ${theme}`,
    );
    assert.ok(
      contrastRatio(color.accentInk[theme], color.accent[theme]) >= 4.5,
      `accent ink on accent ${theme}`,
    );
    assert.ok(
      contrastRatio(color.muted[theme], color.surface[theme]) >= 4.5,
      `muted on surface ${theme}`,
    );
    assert.equal(color.focus[theme], color.ink[theme], `focus uses ink ${theme}`);
    assert.notEqual(color.focus[theme], color.accent[theme], `focus is its own token ${theme}`);
    assert.ok(
      contrastRatio(color.focus[theme], color.surface[theme]) >= 3,
      `focus on surface ${theme}`,
    );
    // The ring is ink on cream and light cream on the dark page, offset from the
    // filled Answer button. One colour cannot clear 3:1 against both that page
    // and the rust or brass fill. The gap is the page, so the ring reads there.
    assert.ok(
      contrastRatio(color.success[theme], color.surface[theme]) >= 4.5,
      `success on surface ${theme}`,
    );
    assert.ok(
      contrastRatio(color.warning[theme], color.surface[theme]) >= 4.5,
      `warning on surface ${theme}`,
    );
    assert.ok(
      contrastRatio(color.danger[theme], color.surface[theme]) >= 4.5,
      `danger on surface ${theme}`,
    );
  }
});

test("contrastRatio rejects a colour it cannot parse", () => {
  assert.throws(() => contrastRatio("red", "#ffffff"), /Unsupported colour/);
});

interface MatchMediaHost {
  matchMedia?: (query: string) => { matches: boolean };
}

test("missing matchMedia does not pretend the user asked for less motion", () => {
  const host = globalThis as MatchMediaHost;
  const previous = host.matchMedia;
  delete host.matchMedia;
  try {
    assert.equal(prefersReducedMotion(), false);
  } finally {
    if (previous !== undefined) host.matchMedia = previous;
  }
});

test("reduced motion resolves immediately and skips GSAP", async () => {
  assert.match(motionSource, /import\("gsap"\)/);
  assert.doesNotMatch(motionSource, /^import\s+.+\sfrom\s+["']gsap["']/m);

  const host = globalThis as MatchMediaHost;
  const previous = host.matchMedia;
  host.matchMedia = () => ({ matches: true });
  const el = {} as Element;
  try {
    assert.equal(prefersReducedMotion(), true);
    const started = performance.now();
    await Promise.all([
      enter(el),
      enter(el, { delay: 4000 }),
      confirmPulse(el),
      mapProgress(el),
      toast(el),
    ]);
    assert.ok(performance.now() - started < 50);
  } finally {
    if (previous === undefined) delete host.matchMedia;
    else host.matchMedia = previous;
  }
});
