import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  brandKitFromAnswers,
  defaultPalette,
  passesBodyContrast,
  passesLargeContrast,
  writeBrandKit,
} from "../src/brand/kit-from-interview.ts";

test("a fixture interview with no logo and four references yields a complete kit", () => {
  const kit = brandKitFromAnswers([
    { id: "DP-2.7", value: "Quiet stays on working farms" },
    { id: "DP-3.1", value: "Book a visit" },
    { id: "DP-1.6", value: "Warm, plain, exact" },
    { id: "DP-5.3", value: "Calm, editorial, warm" },
    { id: "DP-5.1", value: "Kinfolk, Aesop, Patagonia, Linear" },
    { id: "DP-1.1", value: "", status: "SKIPPED" },
    { id: "DP-1.5", value: "A quiet serif with one size jump" },
    { id: "DP-5.6", value: "Fields at dusk" },
    { id: "DP-5.5", value: "Soft daylight" },
    { id: "DP-6.2", value: "Polished, not a spectacle" },
  ]);
  for (const heading of ["## Offer", "## Logo", "## Palette", "## Type", "## Imagery", "## Motion", "## Voice", "## References"]) {
    assert.match(kit.markdown, new RegExp(heading));
  }
  assert.match(kit.markdown, /Kinfolk, Aesop, Patagonia, Linear/);
  assert.match(kit.markdown, /Wordmark in the chosen type/);
  assert.equal(passesBodyContrast(kit.palette.ink, kit.palette.paper), true);
  assert.equal(passesLargeContrast(kit.palette.accent, kit.palette.paper), true);
  assert.match(kit.moduleSource, /export const brand/);
});

test("editorial, quiet, publishing selects an editorial pair and records the adjectives", () => {
  const kit = brandKitFromAnswers([{ id: "DP-1.5", value: "editorial, quiet, publishing" }]);
  assert.match(kit.markdown, /Dealt families: Gambetta and Synonym\./);
  assert.match(kit.markdown, /Adjectives: editorial, quiet, publishing\./);
  assert.match(kit.markdown, /License: ffl-owner-download\./);
  assert.match(kit.markdown, /editorial, quiet, publishing/);
  assert.doesNotMatch(kit.markdown, /\bInter\b/);
  assert.doesNotMatch(kit.markdown, /Bebas Neue/);
  assert.match(kit.markdown, /palette follows the mood words/);
  assert.equal(passesBodyContrast(kit.palette.ink, kit.palette.paper), true);
  assert.equal(passesBodyContrast(kit.palette.muted, kit.palette.paper), true);
  assert.equal(passesLargeContrast(kit.palette.accent, kit.palette.paper), true);
});

test("an answer that names Inter keeps Inter", () => {
  const kit = brandKitFromAnswers([{ id: "DP-1.5", value: "Use Inter" }]);
  assert.match(kit.markdown, /Use Inter/);
  assert.match(kit.markdown, /Dealt families: Inter\./);
  assert.match(kit.markdown, /confirm-at-install/);
});

test("a type skip sentence does not deal a pair and does not receive Inter", () => {
  const kit = brandKitFromAnswers([
    { id: "DP-1.5", value: "No type yet. Show a quiet pairing with one clear size jump." },
  ]);
  assert.match(kit.markdown, /Dealt families: Switzer\./);
  assert.doesNotMatch(kit.markdown, /\bInter\b/);
  assert.doesNotMatch(kit.markdown, /Bespoke/);
  const palette = defaultPalette();
  assert.equal(kit.palette.paper, palette.paper);
  assert.equal(kit.palette.ink, palette.ink);
  assert.equal(kit.palette.accent, palette.accent);
});

test("a skipped colour answer uses a default palette that passes contrast", () => {
  const kit = brandKitFromAnswers([{ id: "DP-1.2", value: "neon", status: "SKIPPED" }]);
  const palette = defaultPalette();
  assert.equal(kit.palette.paper, palette.paper);
  assert.equal(kit.palette.ink, palette.ink);
  assert.equal(passesBodyContrast(kit.palette.ink, kit.palette.paper), true);
  assert.equal(passesBodyContrast(kit.palette.muted, kit.palette.paper), true);
  assert.equal(passesLargeContrast(kit.palette.accent, kit.palette.paper), true);
  assert.match(kit.markdown, /skipped colour/);
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-brand-239-"));
  try {
    writeBrandKit(dir, [{ id: "DP-1.2", value: "", status: "SKIPPED" }]);
    const written = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    assert.match(written, /## Palette/);
    assert.match(readFileSync(path.join(dir, "src", "data", "brand.ts"), "utf8"), /export const brand/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
