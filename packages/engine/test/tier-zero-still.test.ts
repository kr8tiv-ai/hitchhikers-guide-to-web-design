import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  OPACITY_KEEP_MS,
  OPACITY_KEEP_NOTE,
  classifyMotion,
  posesMatch,
  stillIsArtDirected,
  type TierZeroStill,
} from "../src/tier-zero-still.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function pose(over: {
  fov?: number;
  position?: readonly [number, number, number];
  lookAt?: readonly [number, number, number];
  grade?: string;
  exposure?: number;
  key?: string;
} = {}): TierZeroStill {
  return {
    camera: {
      fov: over.fov ?? 35,
      position: over.position ?? [0, 1.2, 4],
      lookAt: over.lookAt ?? [0, 0.8, 0],
    },
    grade: { name: over.grade ?? "Boreal", exposure: over.exposure ?? 1.1 },
    lighting: { key: over.key ?? "north" },
  };
}

test("the same camera, grade, and lighting match", () => {
  const scene = pose();
  assert.equal(posesMatch(scene, pose()), true);
  assert.equal(posesMatch(scene, pose({ fov: scene.camera.fov + 1e-7 })), true);
  assert.equal(posesMatch(scene, pose({ fov: scene.camera.fov + 0.01 })), false);
  assert.equal(posesMatch(scene, pose({ position: [0, 2, 5] })), false);
  assert.equal(posesMatch(scene, pose({ lookAt: [0, 1, 0] })), false);
  assert.equal(posesMatch(scene, pose({ grade: "other" })), false);
  assert.equal(posesMatch(scene, pose({ exposure: 1.4 })), false);
  assert.equal(posesMatch(scene, pose({ key: "rim" })), false);
});

test("a still is art-directed", () => {
  assert.equal(stillIsArtDirected(pose()), true);
  assert.equal(stillIsArtDirected(pose({ grade: "" })), false);
  assert.equal(stillIsArtDirected(pose({ grade: "  " })), false);
  assert.equal(stillIsArtDirected(pose({ grade: "blank poster" })), false);
  assert.equal(stillIsArtDirected(pose({ grade: "Placeholder" })), false);
  assert.equal(stillIsArtDirected(pose({ grade: "label" })), false);
  assert.equal(stillIsArtDirected(pose({ grade: "TODO frame" })), false);
  assert.equal(stillIsArtDirected(pose({ key: "" })), false);
  assert.equal(stillIsArtDirected(pose({ fov: 0 })), false);
  assert.equal(stillIsArtDirected(pose({ fov: Number.NaN })), false);
  assert.equal(stillIsArtDirected(pose({ position: [Number.POSITIVE_INFINITY, 0, 0] })), false);
  assert.equal(stillIsArtDirected(pose({ exposure: Number.NaN })), false);
});

test("width is not reduced motion and does not select the still", () => {
  const phone = classifyMotion({ prefersReducedMotion: false, viewportWidth: 390 });
  assert.equal(phone.reduced, false);
  assert.equal(phone.widthSelectsStill, false);
  const narrow = classifyMotion({ prefersReducedMotion: false, viewportWidth: 320 });
  assert.equal(narrow.reduced, false);
  const desk = classifyMotion({ prefersReducedMotion: true, viewportWidth: 1920 });
  assert.equal(desk.reduced, true);
  assert.equal(desk.widthSelectsStill, false);
});

test("the 200 ms opacity keep is marked as a heuristic", () => {
  assert.equal(OPACITY_KEEP_MS, 200);
  assert.match(OPACITY_KEEP_NOTE, /heuristic/i);
  assert.doesNotMatch(OPACITY_KEEP_NOTE, /WCAG/);
});

test("the engine barrel exports the tier-0 still", () => {
  const source = readFileSync(path.join(here, "..", "src", "index.ts"), "utf8");
  assert.match(source, /tier-zero-still/);
  assert.match(source, /posesMatch/);
  assert.match(source, /stillIsArtDirected/);
  assert.match(source, /classifyMotion/);
});
