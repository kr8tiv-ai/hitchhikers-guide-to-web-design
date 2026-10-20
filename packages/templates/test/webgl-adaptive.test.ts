/**
 * BUG-052. The phone keeps the picture. Width and core count do not select the still.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { playState, type TheatreCoreLike } from "../shared/theatre-loader.ts";
import {
  DPR_FLOOR,
  DPR_MAX_FLIPS,
  DPR_STEP,
  GPU_TIER_SOURCE,
  HERO_POSE,
  capDpr,
  claimCanvas,
  createContextGuard,
  createDprMonitor,
  getContext,
  onContextLost,
  onContextRestored,
  pauseCommand,
  pauseOffscreen,
  posterAttributes,
  posesMatch,
  resetSharedContext,
  resolveGpuTier,
  shouldStartLoop,
  shouldUsePoster,
  showPoster,
  stepDpr,
  stillIsArtDirected,
  tierSettings,
  type PowerSignals,
} from "../shared/webgl.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function signals(extra: Partial<PowerSignals> = {}): PowerSignals {
  return {
    reducedMotion: false,
    viewportWidth: 400,
    saveData: false,
    cores: 4,
    ...extra,
  };
}

test("a 400px viewport with a tier-3 override still starts the loop", () => {
  const phone = signals({ viewportWidth: 400, cores: 2, tierOverride: 3 });
  assert.equal(shouldUsePoster(phone), false);
  assert.equal(shouldStartLoop(phone), true);
  const settings = tierSettings(phone);
  assert.equal(settings.tier, 3);
  assert.equal(settings.dprCap, 2);
  assert.equal(settings.post.bloom?.strength, 0.3);
  assert.equal(settings.post.ssao, false);
  assert.equal(settings.antialias, false);
  assert.equal(settings.instancing, true);
  assert.equal(capDpr(settings.dprCap, 3), 2);
});

test("width and core count do not select the poster", () => {
  const narrow = signals({ viewportWidth: 320, cores: 1 });
  assert.equal(shouldStartLoop(narrow), true);
  assert.equal(resolveGpuTier(narrow), 1);
  const wide = signals({ viewportWidth: 1920, cores: 16 });
  assert.equal(shouldUsePoster(narrow), shouldUsePoster(wide));
  const source = readFileSync(path.join(here, "..", "shared", "webgl.ts"), "utf8");
  assert.doesNotMatch(source, /viewportWidth\s*<=\s*430/);
  assert.doesNotMatch(source, /cores\s*<=\s*4/);
  assert.equal(source.includes("OffscreenCanvas"), false);
  assert.match(source, /detect-gpu/);
  assert.match(GPU_TIER_SOURCE, /benchmarksURL/);
  assert.match(GPU_TIER_SOURCE, /unpkg/);
  const contract = readFileSync(path.join(here, "..", "src", "motion-contract.ts"), "utf8");
  assert.doesNotMatch(contract, /max-width:\s*430px/);
  const recipes = readFileSync(path.join(here, "..", "..", "knowledge", "packs", "motion", "recipes.md"), "utf8");
  assert.doesNotMatch(recipes, /max-width:\s*430px/);
});

test("saveData keeps a tier-1 scene and reduced motion keeps the still", () => {
  const saved = signals({ saveData: true, tierOverride: 3, viewportWidth: 1440, cores: 8 });
  assert.equal(shouldUsePoster(saved), false);
  const settings = tierSettings(saved);
  assert.equal(settings.benchmarkTier, 3);
  assert.equal(settings.tier, 1);
  assert.equal(settings.dprCap, 1);
  assert.equal(settings.post.composer, false);
  assert.equal(settings.post.bloom, null);
  assert.equal(settings.textureScale, 0.5);
  assert.equal(shouldUsePoster(signals({ reducedMotion: true, tierOverride: 3 })), true);
  assert.equal(shouldStartLoop(signals({ reducedMotion: true, tierOverride: 3 })), false);
});

test("gpu tier thresholds, fallback, blocklist, and a missing context", () => {
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 3, type: "BENCHMARK", fps: 14 } })), 0);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 0, type: "BENCHMARK", fps: 15 } })), 1);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 0, type: "BENCHMARK", fps: 30 } })), 2);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 0, type: "BENCHMARK", fps: 60 } })), 3);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 3, type: "FALLBACK" } })), 1);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 3, type: "BENCHMARK_FETCH_FAILED" } })), 1);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 3, type: "BLOCKLISTED" } })), 0);
  assert.equal(resolveGpuTier(signals({ gpu: { tier: 3, type: "WEBGL_UNSUPPORTED" } })), 0);
  assert.equal(resolveGpuTier(signals({ webglAvailable: false, tierOverride: 3 })), 0);
  assert.equal(resolveGpuTier(signals({ majorPerformanceCaveat: true, tierOverride: 3 })), 0);
  const tier2 = tierSettings(signals({ tierOverride: 2 }));
  assert.equal(tier2.dprCap, 1.5);
  assert.equal(tier2.post.bloom, null);
  assert.equal(tier2.post.grain, true);
  assert.equal(tier2.post.lod, 1);
  assert.deepEqual(tier2.ktx2, { color: "etc1s", normal: "uastc" });
  assert.equal(tier2.meshopt, true);
  assert.equal(tier2.draco, "after-first-frame");
  assert.equal(tier2.instancing, true);
  assert.equal(tierSettings(signals({ tierOverride: 0 })).draco, "off");
});

test("performance step-down moves by 0.25, floors at 1, and holds after two flips", () => {
  assert.equal(DPR_STEP, 0.25);
  assert.equal(DPR_FLOOR, 1);
  assert.equal(DPR_MAX_FLIPS, 2);
  let monitor = createDprMonitor(2, 3);
  assert.equal(monitor.dpr, 2);
  monitor = stepDpr(monitor, true);
  assert.equal(monitor.dpr, 1.75);
  monitor = stepDpr(monitor, true);
  assert.equal(monitor.dpr, 1.5);
  monitor = stepDpr(monitor, false);
  assert.equal(monitor.flips, 1);
  assert.equal(monitor.dpr, 1.75);
  monitor = stepDpr(monitor, true);
  assert.equal(monitor.flips, 2);
  assert.equal(monitor.held, true);
  const held = monitor.dpr;
  monitor = stepDpr(monitor, true);
  assert.equal(monitor.dpr, held);
  let floor = createDprMonitor(2, 1);
  floor = stepDpr(floor, true);
  assert.equal(floor.dpr, 1);
});

test("two context losses show the still and a second context throws", () => {
  const guard = createContextGuard();
  let prevented = 0;
  const once = onContextLost(guard, {
    preventDefault() {
      prevented += 1;
    },
  });
  assert.equal(prevented, 1);
  assert.equal(once.stopped, false);
  assert.equal(onContextRestored(once), "rebuild");
  const twice = onContextLost(once, { preventDefault() {} });
  assert.equal(twice.losses, 2);
  assert.equal(twice.stopped, true);
  assert.equal(onContextRestored(twice), "still");
  assert.equal(shouldUsePoster(signals({ contextLosses: 2, tierOverride: 3 })), true);
  assert.equal(shouldStartLoop(signals({ contextLosses: 1, tierOverride: 3 })), true);

  resetSharedContext();
  const gl = { kind: "webgl2" };
  const first = { id: "hh-canvas", getContext: () => gl } as unknown as HTMLCanvasElement;
  const second = { id: "other", getContext: () => ({ kind: "webgl2-b" }) } as unknown as HTMLCanvasElement;
  assert.equal(getContext(first), gl as unknown as WebGL2RenderingContext);
  assert.throws(() => getContext(second), /one context per page/);
  assert.throws(() => claimCanvas("hh-canvas", "other"), /one context per page/);
  resetSharedContext();
  const missing = { id: "bare", getContext: () => null } as unknown as HTMLCanvasElement;
  assert.throws(() => getContext(missing), /WebGL2 is unavailable/);
  resetSharedContext();
});

test("a hidden tab pauses the loop and a visible intersecting canvas resumes", () => {
  assert.equal(pauseCommand(true, false), "resume");
  assert.equal(pauseCommand(false, false), "pause");
  assert.equal(pauseCommand(true, true), "pause");
  let hidden = false;
  const listeners: Array<() => void> = [];
  const host = {
    get hidden() {
      return hidden;
    },
    addEventListener(_type: "visibilitychange", listener: () => void) {
      listeners.push(listener);
    },
    removeEventListener(_type: "visibilitychange", listener: () => void) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  const states: Array<"pause" | "resume"> = [];
  const stop = pauseOffscreen({} as Element, (state) => {
    states.push(state);
  }, host);
  hidden = true;
  listeners[0]?.();
  assert.equal(states.at(-1), "pause");
  hidden = false;
  listeners[0]?.();
  assert.equal(states.at(-1), "resume");
  stop();
  assert.equal(listeners.length, 0);
});

test("the tier-0 still matches the scene and a label is refused", () => {
  assert.equal(stillIsArtDirected(HERO_POSE), true);
  assert.equal(posesMatch(HERO_POSE, HERO_POSE), true);
  assert.equal(
    stillIsArtDirected({ ...HERO_POSE, grade: { name: "Still.", exposure: 1.1 } }),
    false,
  );
  const attrs = posterAttributes({
    src: "/hero-still.webp",
    width: 1440,
    height: 900,
    alt: HERO_POSE.grade.name,
  });
  assert.equal(attrs.fetchpriority, "high");
  assert.equal(attrs.width, "1440");
  assert.equal(attrs.height, "900");
  assert.equal(Object.hasOwn(attrs, "loading"), false);
  assert.throws(() => posterAttributes({ src: "", width: 10, height: 10, alt: "cool-dark" }), /image/);
  assert.throws(() => showPoster({ hidden: false, textContent: "" } as HTMLElement, "Still."), /art-directed/);
});

test("a phone flag does not stop theatre playback", async () => {
  let played = false;
  const core: TheatreCoreLike = {
    createRafDriver() {
      return { tick() {} };
    },
    getProject() {
      return {
        ready: Promise.resolve(undefined),
        sheet() {
          return { sequence: { play() { played = true; }, pause() {} } };
        },
      };
    },
  };
  playState({}, core, { add() {}, remove() {}, lagSmoothing() {} }, { phone: true, reducedMotion: false });
  await Promise.resolve();
  assert.equal(played, true);
});
