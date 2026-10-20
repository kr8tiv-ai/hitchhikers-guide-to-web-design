/**
 * BUG-052 harness idea 34. The canvas sits on a DOM hero.
 * Teardown releases the GPU resources and the one shared context.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activeCanvasId,
  driveFromDom,
  getContext,
  heroLayerCss,
  refreshAfterFonts,
  resetSharedContext,
  teardownScene,
} from "../shared/webgl.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the hero layer keeps the poster in flow and the canvas over it", () => {
  const css = heroLayerCss();
  assert.match(css.hero, /position:\s*relative/);
  assert.match(css.poster, /display:\s*block/);
  assert.doesNotMatch(css.poster, /position:\s*absolute/);
  assert.match(css.canvas, /position:\s*absolute/);
  assert.match(css.canvas, /inset:\s*0/);
});

test("scroll and pointer from the DOM are normalized", () => {
  assert.deepEqual(
    driveFromDom({ scrollY: 250, maxScroll: 1000, pointerX: 200, pointerY: 50, width: 400, height: 200 }),
    { scroll: 0.25, pointerX: 0, pointerY: -0.5 },
  );
  assert.equal(driveFromDom({ scrollY: 5000, maxScroll: 1000, pointerX: 0, pointerY: 0, width: 100, height: 100 }).scroll, 1);
  assert.equal(driveFromDom({ scrollY: 0, maxScroll: 0, pointerX: 10, pointerY: 10, width: 0, height: 0 }).scroll, 0);
});

test("fonts ready refresh scroll once", async () => {
  let calls = 0;
  let resolveFonts: () => void = () => {};
  const fonts = new Promise<void>((resolve) => {
    resolveFonts = resolve;
  });
  const pending = refreshAfterFonts(() => {
    calls += 1;
  }, fonts);
  assert.equal(calls, 0);
  resolveFonts();
  await pending;
  assert.equal(calls, 1);
});

test("teardown disposes the scene and clears the shared context", () => {
  resetSharedContext();
  const gl = { kind: "webgl2" };
  const first = { id: "hh-canvas", getContext: () => gl } as unknown as HTMLCanvasElement;
  assert.equal(getContext(first), gl as unknown as WebGL2RenderingContext);
  const counts = { geometries: 0, materials: 0, textures: 0, renderer: 0 };
  teardownScene({
    geometries: [{ dispose: () => { counts.geometries += 1; } }],
    materials: [{ dispose: () => { counts.materials += 1; } }],
    textures: [{ dispose: () => { counts.textures += 1; } }],
    renderer: { dispose: () => { counts.renderer += 1; } },
  });
  assert.deepEqual(counts, { geometries: 1, materials: 1, textures: 1, renderer: 1 });
  assert.equal(activeCanvasId(), null);
  const next = { id: "next-page", getContext: () => ({ kind: "next" }) } as unknown as HTMLCanvasElement;
  assert.doesNotThrow(() => getContext(next));
  resetSharedContext();

  const three = readFileSync(path.join(here, "..", "shared", "effects", "three-hero.ts"), "utf8");
  const ogl = readFileSync(path.join(here, "..", "shared", "effects", "ogl-shader.ts"), "utf8");
  assert.match(three, /teardownScene\(/);
  assert.match(ogl, /teardownScene\(/);
});
