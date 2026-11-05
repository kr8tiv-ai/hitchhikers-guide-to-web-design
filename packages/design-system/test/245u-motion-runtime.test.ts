/**
 * 245u. Recipes register their own triggers, honour reduced motion, and kill cleanly.
 * gsap, ScrollTrigger, and Lenis are the in-memory fake. No network and no jsdom.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MOTION_COMPOSE_RULE as rootRule, recipesFor as rootRecipes } from "../src/index.ts";
import { MOTION_COMPOSE_RULE } from "../src/motion/compose-rule.ts";
import { isTaxonomyLetter, recipesFor, signatureRecipeCandidates } from "../src/motion/world-map.ts";
import { flushMotion, motionFake } from "./245u-motion-fake.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const motion = await import("../src/motion/index.ts");

const EXPECTED_RULE =
  "Compose motion only from `" +
  ["@hitchhiker", "design-system", "motion"].join("/") +
  "` recipes; do not write " +
  ["gsap", "to/from/timeline"].join(".") +
  " or " +
  ["Scroll", "Trigger.create"].join("") +
  " directly in site code.";

const KEYFRAMES = [
  { at: 0, position: { x: 0, y: 1, z: 4 }, lookAt: { x: 0, y: 0, z: 0 } },
  { at: 1, position: { x: 2, y: 1, z: 2 }, lookAt: { x: 0, y: 0, z: 0 } },
] as const;

function namesOf(entries: readonly { recipe: string }[]): string[] {
  return entries.map((entry) => entry.recipe);
}

function preferReduced(): void {
  motionFake.reset();
  motionFake.setQuery("(prefers-reduced-motion: reduce)", true);
  motionFake.setQuery("(prefers-reduced-motion: no-preference)", false);
}

async function finish(handle: { kill(): void } | undefined): Promise<void> {
  handle?.kill();
  handle?.kill();
  assert.equal(motionFake.activeTriggers().length, 0);
  assert.equal(motionFake.activeTweens().length, 0);
  assert.equal(motionFake.listenerTotal, 0);
  await flushMotion();
}

test("the compose rule and the style-world map", () => {
  assert.equal(MOTION_COMPOSE_RULE, EXPECTED_RULE);
  assert.equal(rootRule, MOTION_COMPOSE_RULE);
  assert.equal(rootRecipes({ world: "editorial", appetite: 6 })[0]?.recipe, "batchReveal");
  assert.equal(isTaxonomyLetter("A"), true);
  assert.equal(isTaxonomyLetter("type-led"), false);

  const immersive = recipesFor({ world: "3d-world", appetite: 9 });
  assert.equal(namesOf(immersive).includes("scrollCamera"), true);
  assert.equal(namesOf(immersive).includes("preloaderHandoff"), true);
  assert.equal(immersive.find((entry) => entry.recipe === "scrollCamera")?.cite, "A8");
  assert.equal(immersive.find((entry) => entry.recipe === "preloaderHandoff")?.cite, "C4");
  assert.equal(namesOf(recipesFor({ world: "3d-world", appetite: 8 })).includes("scrollCamera"), false);
  assert.equal(namesOf(recipesFor({ world: "editorial", appetite: 9 })).includes("scrollCamera"), false);

  const editorial = recipesFor({ world: "editorial", appetite: 6 });
  assert.equal(namesOf(editorial).includes("pinnedTimeline"), true);
  assert.equal(namesOf(editorial).includes("horizontalTrack"), true);
  assert.equal(namesOf(editorial).includes("snapToLabels"), true);
  assert.equal(editorial.find((entry) => entry.recipe === "pinnedTimeline")?.taxonomy, "A");

  const typeLed = recipesFor({ world: "brutalist", appetite: 6, taxonomy: ["type-led", "B"] });
  assert.equal(namesOf(typeLed).includes("kineticType"), true);
  assert.equal(namesOf(typeLed).includes("pageTransition"), true);
  assert.equal(typeLed.find((entry) => entry.recipe === "kineticType")?.cite, "B1");

  for (const appetite of [1, 2, 3]) {
    const calm = recipesFor({ world: "3d-world", appetite });
    assert.deepEqual(namesOf(calm), ["batchReveal", "parallaxLayers", "microInteractions"]);
    assert.equal(calm.find((entry) => entry.recipe === "parallaxLayers")?.subtle, true);
    for (const entry of calm) assert.equal(entry.cite.startsWith(entry.taxonomy), true);
  }

  assert.deepEqual(signatureRecipeCandidates("3d-world", 9), ["scrollCamera", "preloaderHandoff"]);
  assert.deepEqual(signatureRecipeCandidates("editorial", 6), ["pinnedTimeline", "horizontalTrack", "snapToLabels"]);
  assert.deepEqual(signatureRecipeCandidates("brutalist", 6), ["kineticType", "pageTransition"]);
  assert.deepEqual(signatureRecipeCandidates("playful", 2), ["batchReveal", "parallaxLayers", "microInteractions"]);
});

test("every recipe shows a final state when motion is reduced", { timeout: 5_000 }, async () => {
  const section = () => motionFake.element("section");
  const cases: Array<{ name: string; run: () => { kill(): void; reduced: boolean } }> = [
    { name: "pinnedTimeline", run: () => motion.createPinnedTimeline(section()) },
    { name: "horizontalTrack", run: () => motion.createHorizontalTrack(section()) },
    { name: "kineticType", run: () => motion.createKineticType(section(), { unit: "char" }) },
    { name: "scrollCamera", run: () => motion.createScrollCamera(section(), { keyframes: KEYFRAMES }) },
    { name: "preloaderHandoff", run: () => motion.createPreloaderHandoff(section()) },
    { name: "frameSequence", run: () => motion.createFrameSequence(section(), { frames: ["a.webp", "b.webp"] }) },
    { name: "pageTransition", run: () => motion.createPageTransition(section()) },
    { name: "batchReveal", run: () => motion.createBatchReveal([section(), section()]) },
    { name: "parallaxLayers", run: () => motion.createParallaxLayers(section(), { travel: 40 }) },
    { name: "snapToLabels", run: () => motion.createSnapToLabels(section()) },
    { name: "microInteractions", run: () => motion.createMicroInteractions(section(), { magnetic: true, cursor: true }) },
  ];
  for (const item of cases) {
    preferReduced();
    let handle: { kill(): void; reduced: boolean } | undefined;
    try {
      handle = item.run();
      assert.equal(handle.reduced, true, item.name);
      assert.equal(motionFake.activeTriggers().length, 0, item.name);
      assert.equal(motionFake.activeTweens().length, 0, item.name);
      assert.equal(
        motionFake.sets.some((set) => set.vars.opacity === 1),
        true,
        item.name,
      );
    } finally {
      await finish(handle);
    }
  }
});

test("pinnedTimeline pins with labels and cleans up", async () => {
  motionFake.reset();
  const section = motionFake.element("section");
  const headline = motionFake.element("h2");
  let handle: { kill(): void } | undefined;
  try {
    handle = motion.createPinnedTimeline(section, {
      beats: [{ target: headline, vars: { yPercent: 24, opacity: 0 }, label: "rise" }],
    });
    assert.equal(handle.reduced, false);
    assert.equal(motionFake.activeTriggers().length, 1);
    const config = motionFake.activeTriggers()[0]?.config;
    assert.equal(config?.pin, true);
    assert.equal(config?.pinType, "transform");
    assert.equal(config?.scrub, 1);
    assert.equal(config?.anticipatePin, 1);
    assert.equal(config?.invalidateOnRefresh, true);
    assert.deepEqual(motionFake.timelines[0]?.labels, ["start", "rise", "end"]);
  } finally {
    await finish(handle);
  }
});

test("horizontalTrack recomputes end after a width change and refresh", async () => {
  motionFake.reset();
  const track = motionFake.element("div");
  track.scrollWidth = 1400;
  track.clientWidth = 400;
  let handle: { kill(): void; refresh(): void } | undefined;
  try {
    handle = motion.createHorizontalTrack(track);
    const tween = motionFake.activeTweens()[0];
    const end = tween?.vars.scrollTrigger;
    assert.equal(tween?.vars.ease, "none");
    assert.equal(typeof end === "object" && end !== null && "end" in end, true);
    const config = end as { end: () => string; invalidateOnRefresh?: boolean; anticipatePin?: number };
    assert.equal(config.end(), "+=1000");
    track.scrollWidth = 2400;
    handle.refresh();
    assert.equal(config.end(), "+=2000");
    assert.equal(config.invalidateOnRefresh, true);
    assert.equal(config.anticipatePin, 1);
    assert.equal(motionFake.refreshCount > 0, true);
  } finally {
    await finish(handle);
  }
});

test("kineticType masks the split and reverts it on kill", async () => {
  motionFake.reset();
  const parent = motionFake.element("section");
  const headline = motionFake.element("h1");
  parent.appendChild(headline);
  let handle: { kill(): void } | undefined;
  try {
    handle = motion.createKineticType(headline, { unit: "char" });
    assert.equal(motionFake.activeTriggers().length, 1);
    assert.equal(motionFake.splits.length, 1);
    assert.equal(motionFake.splits[0]?.vars.type, "chars");
    assert.equal(motionFake.splits[0]?.vars.mask, "chars");
    assert.equal(motionFake.splits[0]?.vars.aria, "auto");
    assert.equal(parent.children.some((child) => child.attrs["data-motion-mask"] === ""), true);
    handle.kill();
    assert.equal(motionFake.splits[0]?.reverted, true);
    assert.equal(parent.children.some((child) => child.attrs["data-motion-mask"] === ""), false);
    handle = undefined;
  } finally {
    await finish(handle);
  }
});

test("scrollCamera scrubs a progress value and does not start a frame loop", async () => {
  motionFake.reset();
  const source = readFileSync(path.join(here, "..", "src", "motion", "scroll-camera.ts"), "utf8");
  assert.equal(source.includes("requestAnimationFrame"), false);
  const before = motionFake.ticker.length;
  const section = motionFake.element("section");
  let handle: { kill(): void } | undefined;
  try {
    assert.throws(() => motion.createScrollCamera(section, { keyframes: [] }), /keyframe/);
    const camera = motion.createScrollCamera(section, { keyframes: KEYFRAMES });
    handle = camera;
    assert.equal(motionFake.ticker.length, before);
    assert.equal(motionFake.activeTriggers().length, 1);
    assert.equal(camera.progress.value, 0);
    assert.equal(camera.sample().z, 4);
    camera.progress.value = 1;
    assert.equal(camera.sample().x, 2);
    assert.equal(motion.sampleCamera(KEYFRAMES, 0).z, 4);
  } finally {
    await finish(handle);
  }
});

test("preloaderHandoff waits for fonts and media, then plays the intro", async () => {
  motionFake.reset();
  const hero = motionFake.element("section");
  const overlay = motionFake.element("div");
  const media = motionFake.media();
  let decoded = false;
  media.decode = () => {
    decoded = true;
    return Promise.resolve();
  };
  let handle: { kill(): void } | undefined;
  try {
    const intro = motion.createPreloaderHandoff(hero, { media, overlay });
    handle = intro;
    assert.equal(motionFake.activeTriggers().length, 0);
    await intro.ready;
    assert.equal(decoded, true);
    assert.equal(motionFake.activeTriggers().length, 0);
    assert.equal(motionFake.activeTweens().length, 2);
  } finally {
    await finish(handle);
  }
});

test("preloaderHandoff still shows the hero when media decode fails", async () => {
  motionFake.reset();
  const hero = motionFake.element("section");
  const media = motionFake.media();
  media.decode = () => Promise.reject(new Error("decode"));
  let handle: { kill(): void } | undefined;
  try {
    const intro = motion.createPreloaderHandoff(hero, { media });
    handle = intro;
    await intro.ready;
    assert.equal(
      motionFake.sets.some((set) => set.target === hero && set.vars.opacity === 1),
      true,
    );
  } finally {
    await finish(handle);
  }
});

test("frameSequence snaps to whole frames and paints the poster first", async () => {
  motionFake.reset();
  const canvas = motionFake.element("canvas");
  const poster = motionFake.media();
  const frames = Array.from({ length: 10 }, (_item, index) => `frame-${index}.webp`);
  let handle: { kill(): void } | undefined;
  try {
    assert.equal(motion.snapFrameProgress(0.14, 10), 1 / 9);
    assert.throws(() => motion.createFrameSequence({}, { frames }), /canvas/);
    handle = motion.createFrameSequence(canvas, { frames, poster });
    assert.equal(motionFake.drawn[0], poster);
    assert.equal(motionFake.imageBuilds, 10);
    assert.equal(motionFake.activeTriggers().length, 1);
    const snap = motionFake.activeTriggers()[0]?.config.snap;
    assert.equal(typeof snap, "function");
    if (typeof snap === "function") assert.equal(snap(0.14), 1 / 9);
    const tween = motionFake.activeTweens()[0];
    assert.equal(tween?.vars.ease, "none");
  } finally {
    await finish(handle);
  }
});

test("pageTransition uses the View Transitions API and falls back to Flip", async () => {
  motionFake.reset();
  const card = motionFake.element("article");
  let handle: { kill(): void } | undefined;
  try {
    let updated = false;
    motionFake.document.startViewTransition = (update) => {
      update();
      return { finished: Promise.resolve() };
    };
    const transition = motion.createPageTransition(card);
    handle = transition;
    await transition.go(() => {
      updated = true;
    });
    assert.equal(updated, true);
    assert.equal(motionFake.activeTweens().length, 0);
    assert.equal(motionFake.activeTriggers().length, 0);
  } finally {
    await finish(handle);
  }

  motionFake.reset();
  const other = motionFake.element("article");
  try {
    let updated = false;
    const transition = motion.createPageTransition(other, { duration: 0.6 });
    handle = transition;
    await transition.go(() => {
      updated = true;
    });
    assert.equal(updated, true);
    assert.equal(motionFake.activeTriggers().length, 0);
    assert.equal(motionFake.activeTweens().length, 1);
    assert.equal(motionFake.activeTweens()[0]?.vars.ease, "power2.out");
  } finally {
    await finish(handle);
  }
});

test("batchReveal registers one batch and parallax stays inside the travel cap", async () => {
  motionFake.reset();
  const cards = [motionFake.element("article"), motionFake.element("article")];
  let handle: { kill(): void } | undefined;
  try {
    handle = motion.createBatchReveal(cards);
    assert.equal(motionFake.activeTriggers().length, 1);
    assert.equal(motionFake.activeTriggers()[0]?.config.once, true);
    assert.equal(motionFake.activeTweens().length, 0);
  } finally {
    await finish(handle);
  }

  motionFake.reset();
  const back = motionFake.element("div");
  const front = motionFake.element("div");
  try {
    handle = motion.createParallaxLayers(motionFake.element("section"), {
      layers: [
        { target: back, travel: 40 },
        { target: front, travel: 4 },
      ],
    });
    assert.equal(motionFake.activeTriggers().length, 2);
    assert.equal(motionFake.activeTweens().length, 2);
    assert.equal(motionFake.activeTweens()[0]?.vars.yPercent, -motion.PARALLAX_TRAVEL_CAP);
    assert.equal(motionFake.activeTweens()[0]?.fromVars?.yPercent, motion.PARALLAX_TRAVEL_CAP);
    assert.equal(motionFake.activeTweens()[1]?.vars.yPercent, -4);
    assert.equal(motionFake.activeTweens()[0]?.vars.ease, "none");
  } finally {
    await finish(handle);
  }
});

test("snapToLabels snaps a pin to labelsDirectional", async () => {
  motionFake.reset();
  let handle: { kill(): void } | undefined;
  try {
    handle = motion.createSnapToLabels(motionFake.element("section"));
    assert.equal(motionFake.activeTriggers().length, 1);
    const snap = motionFake.activeTriggers()[0]?.config.snap;
    assert.equal(typeof snap, "object");
    assert.ok(snap !== null && typeof snap === "object");
    const config = snap as { snapTo?: string; delay?: number; ease?: string; duration?: { min?: number; max?: number } };
    assert.equal(config.snapTo, "labelsDirectional");
    assert.equal(config.delay, 0.1);
    assert.equal(config.ease, "power1.inOut");
    assert.equal(config.duration?.min, 0.2);
    assert.equal(config.duration?.max, 0.8);
    assert.deepEqual(motionFake.timelines[0]?.labels, ["start", "end"]);
  } finally {
    await finish(handle);
  }
});

test("microInteractions allows one magnetic control and skips the cursor on a coarse pointer", async () => {
  motionFake.reset();
  motionFake.setQuery("(pointer: fine)", true);
  motionFake.setQuery("(pointer: coarse)", false);
  const page = motionFake.element("main");
  const button = motionFake.element("a");
  let handle: { kill(): void } | undefined;
  try {
    handle = motion.createMicroInteractions(page, { magnetic: true, magneticTarget: button, cursor: true });
    assert.throws(() => motion.createMicroInteractions(motionFake.element("main"), { magnetic: true }), /magnetic/i);
    assert.equal(motionFake.document.body.children.length, 1);
    assert.equal(motionFake.document.body.children[0]?.attrs["data-motion-cursor"], "");
    assert.equal(motionFake.listenerCount(motionFake.window, "pointermove"), 1);
    assert.equal(motionFake.activeTriggers().length, 0);
    motionFake.window.dispatch("pointermove", { clientX: 20, clientY: 12 });
    assert.equal(motionFake.activeTweens().length > 0, true);
    handle.kill();
    handle.kill();
    assert.equal(motionFake.listenerTotal, 0);
    assert.equal(motionFake.activeTweens().length, 0);
    assert.equal(motionFake.document.body.children.length, 0);
    const again = motion.createMicroInteractions(page, { magnetic: true });
    again.kill();
    handle = undefined;
  } finally {
    await finish(handle);
  }

  motionFake.reset();
  motionFake.setQuery("(pointer: fine)", true);
  motionFake.setQuery("(pointer: coarse)", true);
  try {
    handle = motion.createMicroInteractions(motionFake.element("main"), { cursor: true, magnetic: true });
    assert.equal(motionFake.listenerCount(motionFake.window, "pointermove"), 0);
    assert.equal(motionFake.document.body.children.length, 0);
    assert.equal(motionFake.listenerTotal, 0);
  } finally {
    await finish(handle);
  }
});

test("motionSetup owns one Lenis and refreshes after fonts and images", async () => {
  motionFake.reset();
  let releaseFonts: () => void = () => {};
  motionFake.setFontsReady(
    new Promise((resolve) => {
      releaseFonts = () => {
        resolve(undefined);
      };
    }),
  );
  const image = motionFake.media();
  motionFake.document.images.push(image);
  let handle: { kill(): void; reduced: boolean } | undefined;
  try {
    handle = motion.motionSetup();
    const again = motion.motionSetup();
    assert.equal(again, handle);
    assert.equal(handle.reduced, false);
    assert.equal(motionFake.lenis.length, 1);
    assert.equal(motionFake.lenis[0]?.options.autoRaf, false);
    assert.equal(motionFake.lenis[0]?.options.smoothTouch, false);
    assert.equal(motionFake.lenis[0]?.handlers[0]?.event, "scroll");
    assert.equal(motionFake.lenis[0]?.handlers[0]?.cb, motionFake.ScrollTrigger.update);
    assert.equal(motionFake.ticker.length, 1);
    assert.deepEqual([...motionFake.lag], [0]);
    assert.equal(motionFake.refreshCount, 0);
    releaseFonts();
    await flushMotion();
    assert.equal(motionFake.refreshCount, 1);
    image.dispatch("load");
    assert.equal(motionFake.refreshCount, 2);
    handle.kill();
    assert.equal(motionFake.ticker.length, 0);
    assert.equal(motionFake.lenis[0]?.destroyed, true);
    const refreshed = motionFake.refreshCount;
    image.dispatch("load");
    assert.equal(motionFake.refreshCount, refreshed);
    handle.kill();
    handle = undefined;
  } finally {
    await finish(handle);
  }
});

test("motionSetup disables Lenis when reduced motion is requested", async () => {
  preferReduced();
  let handle: { kill(): void; reduced: boolean } | undefined;
  try {
    handle = motion.motionSetup();
    assert.equal(handle.reduced, true);
    assert.equal(motionFake.lenis.length, 0);
    assert.equal(motionFake.ticker.length, 0);
    assert.equal(motionFake.lag.length, 0);
    assert.equal(
      motionFake.sets.some((set) => set.vars.opacity === 1),
      true,
    );
  } finally {
    await finish(handle);
  }
});

test("bindAstroBeforeSwap kills handles once", async () => {
  motionFake.reset();
  let kills = 0;
  const handle = {
    reduced: false,
    refresh(): void {},
    kill(): void {
      kills += 1;
    },
  };
  const unbind = motion.bindAstroBeforeSwap([handle]);
  try {
    motionFake.document.dispatch("astro:before-swap");
    assert.equal(kills, 1);
    unbind();
    motionFake.document.dispatch("astro:before-swap");
    assert.equal(kills, 1);
    assert.equal(motionFake.listenerCount(motionFake.document, "astro:before-swap"), 0);
  } finally {
    unbind();
    await flushMotion();
  }
});

test("the motion entry re-exports the 245d recipes", () => {
  for (const name of ["mountLenis", "mountReveal", "mountSplitLine", "mountParallax", "mountHorizontal", "mountMarquee", "mountHoverLift"] as const) {
    assert.equal(typeof motion[name], "function", name);
  }
});
