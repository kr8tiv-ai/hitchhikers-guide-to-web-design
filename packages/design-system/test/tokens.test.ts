/**
 * 245d. Each style world ships a fluid type scale. Brand colours fill the roles.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  tokensFor,
  type BrandFill,
  type StyleWorld,
} from "../src/index.ts";

const TIMEOUT = 5_000;
const WORLDS: readonly StyleWorld[] = ["editorial", "3d-world", "playful", "brutalist"];
const CLAMP = /^clamp\(([0-9.]+)rem,\s*(-?[0-9.]+)rem\s*\+\s*([0-9.]+)vw,\s*([0-9.]+)rem\)$/;

const BRAND: BrandFill = {
  paper: "#f3e6d0",
  ink: "#14241c",
  accent: "#8a6a12",
  muted: "#5c6570",
  display: "Fraunces",
  body: "Satoshi",
  sources: {
    paper: "owner (DP-1.2)",
    ink: "owner (DP-1.2)",
    accent: "owner (DP-1.2)",
    muted: "derived for contrast",
  },
  swatches: [{ name: "Sunset gold", hex: "#8a6a12", source: "owner (DP-1.2)" }],
};

function clampPx(value: string, viewport: number): number {
  const match = CLAMP.exec(value);
  assert.ok(match, value);
  const min = Number(match[1]);
  const intercept = Number(match[2]);
  const slope = Number(match[3]);
  const max = Number(match[4]);
  const preferred = intercept * 16 + slope * (viewport / 100);
  return Math.min(max * 16, Math.max(min * 16, preferred));
}

function namedClamp(world: StyleWorld, name: string): string {
  const step = tokensFor(world, BRAND).type.steps.find((item) => item.name === name);
  assert.ok(step, `${world} ${name}`);
  return step.clamp;
}

test("tokensFor builds a clamp scale and fills brand roles", { timeout: TIMEOUT }, () => {
  const displays = new Set<string>();
  const editorialSpace = tokensFor("editorial", BRAND).spacing.map((step) => step.value);
  for (const world of WORLDS) {
    const tokens = tokensFor(world, BRAND);
    assert.equal(tokens.world, world);
    assert.ok(tokens.type.steps.length >= 5, world);
    for (const step of tokens.type.steps) {
      assert.match(step.clamp, CLAMP, `${world} ${step.name}`);
    }
    const display = clampPx(namedClamp(world, "display"), 1440);
    const body = clampPx(namedClamp(world, "body"), 1440);
    assert.ok(display / body >= 2.5, `${world} ${display} / ${body}`);
    displays.add(namedClamp(world, "display"));
    assert.equal(tokens.color.paper, BRAND.paper);
    assert.equal(tokens.color.ink, BRAND.ink);
    assert.equal(tokens.color.accent, BRAND.accent);
    assert.equal(tokens.color.muted, BRAND.muted);
    assert.equal(tokens.color.surface, BRAND.paper);
    assert.equal(tokens.font.display, BRAND.display);
    assert.equal(tokens.font.body, BRAND.body);
    assert.match(tokens.colorLine, /paper #f3e6d0 Source: owner \(DP-1\.2\)/);
    assert.match(tokens.colorLine, /sunset-gold #8a6a12 Source: owner \(DP-1\.2\)/);
    assert.match(tokens.motion.durations.reveal, /^\d+(\.\d+)?s$/);
    assert.match(tokens.motion.easings.reveal, /\S/);
    assert.ok(tokens.radii.length >= 3);
    if (world === "editorial") {
      assert.deepEqual(editorialSpace, ["4px", "8px", "12px", "16px", "24px", "40px", "64px", "96px"]);
    } else {
      assert.notDeepEqual(
        tokens.spacing.map((step) => step.value),
        editorialSpace,
        world,
      );
    }
  }
  assert.equal(displays.size, WORLDS.length);
  const surfaced = tokensFor("brutalist", { ...BRAND, surface: "#101010" });
  assert.equal(surfaced.color.surface, "#101010");
  assert.equal(surfaced.color.paper, BRAND.paper);
});
