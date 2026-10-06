/// <reference lib="dom" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  families,
  familiesForLevel,
  renderDp6Supplement,
  renderMotionPage,
  weightCeiling,
} from "../src/motion-previews/index.ts";
import {
  STARTER_TOTAL,
  STANDARD_TOTAL,
  TWELVE_AT_1080,
  imaginePrices,
  renderMovieExplainer,
} from "../src/motion-previews/movie-explainer.ts";
import {
  bindSharedTicker,
  claimWebgl,
  holdsPoster,
  onSharedTick,
  releaseWebgl,
  resetSharedTickerForTests,
  resetWebglForTests,
  type TickFn,
} from "../src/motion-previews/slider.ts";
import {
  THEATRE_PREVIEW_STATE,
  mountPreviewWithState,
} from "../src/motion-previews/previews/theatre-sequence.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const ALL_IDS = [
  "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
  "B1", "B2", "B3", "B4", "B5",
  "C1", "C2", "C3", "C4",
  "D1", "D2", "D3", "D4", "D5", "D6",
  "E1", "E2", "E3", "E4", "E5",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7",
  "G1", "G2", "G3",
  "H1", "H2", "H3",
];

function fakeFrame(): HTMLElement {
  const dataset: Record<string, string> = {};
  return { dataset, innerHTML: "" } as unknown as HTMLElement;
}

test("weight ceilings at 1, 5, and 10 match the v2 table", () => {
  assert.deepEqual(weightCeiling(1), {
    maxJsKb: 90,
    webgl: false,
    note: "Native scroll, CSS hover, a load fade",
  });
  assert.deepEqual(weightCeiling(5), {
    maxJsKb: 160,
    webgl: false,
    note: "One pinned story, optional custom cursor if it carries the brand, vector accents",
  });
  assert.deepEqual(weightCeiling(10), {
    maxJsKb: 250,
    webgl: true,
    note: "Full world, physics, a dedicated phone path",
  });
  assert.equal(weightCeiling(4).webgl, false);
  assert.equal(weightCeiling(6).webgl, true);
  assert.equal(weightCeiling(6).maxJsKb, 160);
  assert.equal(weightCeiling(8).maxJsKb, 250);
  for (const level of [0, 11, 1.5, Number.NaN]) {
    assert.throws(() => weightCeiling(level), /whole number/);
  }
});

test("families cover research ids except the banned magnetic control", () => {
  const seen = new Map<string, string>();
  for (const family of families) {
    assert.equal(family.toolClause.includes("!"), false);
    assert.equal(family.toolClause.includes("\u2014"), false);
    const clause = family.toolClause.replace(/\.js\b/g, "JS");
    assert.equal((clause.match(/\./g) ?? []).length, 1);
    assert.ok(family.examples.length >= 1 && family.examples.length <= 2);
    for (const href of family.examples) assert.match(href, /^https?:\/\//);
    for (const id of family.researchIds) {
      assert.equal(seen.has(id), false, id);
      seen.set(id, family.id);
    }
  }
  assert.equal(seen.has("D2"), false);
  const covered = [...seen.keys(), "D2"].sort();
  assert.deepEqual(covered, [...ALL_IDS].sort());
  assert.deepEqual(
    familiesForLevel(1).map((family) => family.id),
    ["tiny-fade"],
  );
  const atFive = familiesForLevel(5).map((family) => family.id);
  assert.ok(atFive.includes("scroll-sequence"));
  assert.ok(atFive.includes("svg-stagger"));
  assert.equal(atFive.includes("shader"), false);
  assert.equal(atFive.includes("three-hero"), false);
  assert.equal(atFive.includes("cinematic"), false);
  assert.equal(familiesForLevel(10).length, families.length);
  assert.equal(familiesForLevel(7).some((family) => family.id === "shader"), true);
  assert.equal(familiesForLevel(7).some((family) => family.id === "three-hero"), false);
  assert.throws(() => familiesForLevel(0), /whole number/);
});

test("one ticker listener fans out to every preview", () => {
  resetSharedTickerForTests();
  const added: TickFn[] = [];
  const host = {
    add(fn: TickFn) {
      added.push(fn);
    },
    remove(fn: TickFn) {
      const index = added.indexOf(fn);
      if (index >= 0) added.splice(index, 1);
    },
  };
  bindSharedTicker(host);
  const seen: number[] = [];
  onSharedTick(() => seen.push(1));
  onSharedTick(() => seen.push(2));
  bindSharedTicker(host);
  assert.equal(added.length, 1);
  const loop = added[0];
  assert.ok(loop);
  loop(1.25, 16, 4);
  assert.deepEqual(seen, [1, 2]);
  resetSharedTickerForTests();
  assert.equal(added.length, 0);
});

test("only one WebGL preview can be live", () => {
  resetWebglForTests();
  assert.equal(claimWebgl("three-hero"), true);
  assert.equal(claimWebgl("shader"), false);
  releaseWebgl("three-hero");
  assert.equal(claimWebgl("shader"), true);
  releaseWebgl("shader");
  resetWebglForTests();
});

test("a narrow fine-pointer window is not treated as a phone", () => {
  const desktop = { width: 375, coarse: false, fine: true, saveData: false };
  const phone = { width: 390, coarse: true, fine: false, saveData: false };
  assert.equal(holdsPoster(8, 3, desktop), false);
  assert.equal(holdsPoster(8, 3, phone), true);
  assert.equal(holdsPoster(3, 3, phone), false);
  assert.equal(holdsPoster(8, 3, { width: 1440, coarse: false, fine: true, saveData: true }), true);
  assert.equal(holdsPoster(1, 3, { width: 1440, coarse: false, fine: true, saveData: true }), false);
});

test("reduced motion paints a still and does not ask for WebGL", async () => {
  const host = globalThis as { matchMedia?: (query: string) => { matches: boolean } };
  const previous = host.matchMedia;
  host.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion") });
  try {
    for (const family of families) {
      const frame = fakeFrame();
      const stop = await family.mount(frame);
      assert.equal(frame.dataset.still, "true");
      assert.equal(frame.dataset.live, "false");
      assert.match(frame.innerHTML, /Still\. Motion is reduced\./);
      stop();
    }
  } finally {
    if (previous === undefined) delete host.matchMedia;
    else host.matchMedia = previous;
  }
});

test("a missing theatre state stays a still and does not fetch studio", async () => {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };
  try {
    const frame = fakeFrame();
    const stop = await mountPreviewWithState(frame, null);
    assert.match(lines.join("\n"), /Theatre state JSON is missing/);
    assert.equal(frame.dataset.still, "true");
    assert.match(frame.innerHTML, /timeline state is missing/);
    stop();
  } finally {
    console.warn = original;
  }
  const file = path.resolve(here, "../src/motion-previews/theatre-state.json");
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(parsed, THEATRE_PREVIEW_STATE);
  const source = readFileSync(path.resolve(here, "../src/motion-previews/previews/theatre-sequence.ts"), "utf8");
  assert.equal(source.includes("@theatre/studio"), false);
  assert.equal(source.includes("fetch("), false);
});

test("the explainer uses the 053 price card and the page bans magnetic controls", () => {
  assert.equal(STARTER_TOTAL.toFixed(2), "0.60");
  assert.equal(STANDARD_TOTAL.toFixed(2), "4.40");
  assert.equal(TWELVE_AT_1080.toFixed(2), "30.00");
  assert.equal(10 * imaginePrices.video15PerSecond.p1080, 2.5);
  const film = renderMovieExplainer();
  assert.match(film, /grok-imagine-video-1\.5-lite/);
  assert.match(film, /grok-imagine-image-2\.0/);
  assert.match(film, /\$0\.60/);
  assert.match(film, /\$4\.40/);
  assert.match(film, /\$30\.00/);
  assert.match(film, /2026-09-29/);
  assert.equal(film.includes("!"), false);
  assert.equal(film.includes("\u2014"), false);
  const page = renderMotionPage();
  assert.equal(page.split("Magnetic buttons are banned.").length - 1, 1);
  assert.equal(page.includes("data-magnetic"), false);
  assert.equal(page.includes("!"), false);
  assert.equal(page.includes("\u2014"), false);
  assert.equal(page.includes("@theatre/studio"), false);
  for (const word of ["unlock", "seamless", "revolutionize", "delve", "leverage", "synergy", "tapestry"]) {
    assert.equal(page.toLowerCase().includes(word), false, word);
  }
  assert.match(page, /data-family="cinematic"/);
  assert.match(page, /id="hh-appetite"/);
  const pkg = JSON.parse(readFileSync(path.resolve(here, "../package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  assert.equal(pkg.dependencies["@theatre/studio"], undefined);
  assert.equal(pkg.dependencies["@theatre/core"], "0.7.2");
  assert.match(renderDp6Supplement("DP-6.6"), /Reduced motion is always implemented/);
  assert.match(renderDp6Supplement("DP-6.4"), /Tripo/);
  assert.match(renderDp6Supplement("DP-6.2"), /hh-appetite/);
  assert.equal(renderDp6Supplement("DP-7.1"), "");
});
