/**
 * BUG-052 audit 12, preloader half. The overlay does not shift layout.
 * Progress comes from load counts and fonts, not a timer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HANDOFF_OPACITY_MS,
  PRELOADER_SESSION_KEY,
  PRELOADER_TIMEOUT_MS,
  auditHandoffMarkup,
  bindLoadingProgress,
  clsFromOverlay,
  createPreloader,
  firstFrameIsBlank,
  handoffDocument,
  progressFromLoads,
  shouldLiftOverlay,
  type SessionStore,
} from "../shared/preloader.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixtures", "webgl-handoff.html");

function memorySession(seen = false): SessionStore {
  const data = new Map<string, string>();
  if (seen) data.set(PRELOADER_SESSION_KEY, "1");
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("the WebGL fixture has no CLS from the overlay and no blank first frame", () => {
  const html = readFileSync(fixturePath, "utf8");
  assert.equal(html, handoffDocument());
  const audit = auditHandoffMarkup(html);
  assert.equal(audit.cls, 0);
  assert.equal(audit.blankFirstFrame, false);
  assert.match(html, /class="hh-poster"/);
  assert.ok(html.indexOf("hh-poster") < html.indexOf("<canvas"));
  assert.match(html, /width="1440"/);
  assert.match(html, /height="900"/);
  assert.match(html, /fetchpriority="high"/);
  assert.equal(/loading="lazy"/i.test(html), false);
  assert.match(html, /position:\s*fixed/);
  assert.equal(clsFromOverlay({ position: "fixed" }, { width: 1440, height: 900 }), 0);
});

test("a poster that is missing, lazy, or under a layout overlay is a blank or shifting first frame", () => {
  const cleared = auditHandoffMarkup("<canvas></canvas><img class=\"hh-poster\" src=\"/x.webp\">");
  assert.equal(cleared.blankFirstFrame, true);
  const lazy = handoffDocument().replace("fetchpriority=\"high\"", "fetchpriority=\"high\" loading=\"lazy\"");
  assert.equal(auditHandoffMarkup(lazy).blankFirstFrame, true);
  const flowing = handoffDocument().replace("position: fixed", "position: static");
  assert.ok(auditHandoffMarkup(flowing).cls > 0);
  assert.ok(clsFromOverlay({ position: "static" }, { width: 1440, height: 900 }) > 0);
  assert.ok(clsFromOverlay({ position: "fixed" }, { width: 0, height: 900 }) > 0);
  assert.equal(firstFrameIsBlank({
    posterPresent: false,
    posterPainted: false,
    posterWidth: 0,
    posterHeight: 0,
    canvasClearedBeforePoster: false,
    overlayLiftedBeforeFirstDraw: false,
  }), true);
  assert.equal(firstFrameIsBlank({
    posterPresent: true,
    posterPainted: false,
    posterWidth: 1440,
    posterHeight: 900,
    canvasClearedBeforePoster: false,
    overlayLiftedBeforeFirstDraw: false,
  }), true);
  assert.equal(firstFrameIsBlank({
    posterPresent: true,
    posterPainted: true,
    posterWidth: 0,
    posterHeight: 900,
    canvasClearedBeforePoster: false,
    overlayLiftedBeforeFirstDraw: false,
  }), true);
  assert.equal(firstFrameIsBlank({
    posterPresent: true,
    posterPainted: true,
    posterWidth: 1440,
    posterHeight: 900,
    canvasClearedBeforePoster: true,
    overlayLiftedBeforeFirstDraw: false,
  }), true);
  assert.equal(firstFrameIsBlank({
    posterPresent: true,
    posterPainted: false,
    posterWidth: 1440,
    posterHeight: 900,
    canvasClearedBeforePoster: false,
    overlayLiftedBeforeFirstDraw: true,
  }), true);
  assert.equal(firstFrameIsBlank({
    posterPresent: true,
    posterPainted: true,
    posterWidth: 1440,
    posterHeight: 900,
    canvasClearedBeforePoster: false,
    overlayLiftedBeforeFirstDraw: false,
  }), false);
});

test("progress comes from load counts, and a timer is not progress", () => {
  assert.equal(progressFromLoads({ loaded: 1, total: 4, fontsReady: false }), 0.25);
  assert.equal(progressFromLoads({ loaded: 1, total: 4, fontsReady: true }), 0.25);
  assert.equal(progressFromLoads({ loaded: 0, total: 0, fontsReady: false }), 0);
  assert.equal(progressFromLoads({ loaded: 0, total: 0, fontsReady: true }), 1);
  const source = readFileSync(path.join(here, "..", "shared", "preloader.ts"), "utf8");
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("setTimeout"), false);
  assert.match(source, /onProgress/);
  assert.match(source, /fonts\.ready|fontsReady/);
  const manager: { onProgress?: (url: string, loaded: number, total: number) => void; onLoad?: () => void } = {};
  const seen: number[] = [];
  const fonts = deferred();
  const stop = bindLoadingProgress(manager, { ready: fonts.promise }, (progress) => {
    seen.push(progress);
  });
  assert.equal(typeof manager.onProgress, "function");
  manager.onProgress?.("/hero.glb", 1, 2);
  assert.deepEqual(seen, [0.5]);
  fonts.resolve();
  return fonts.promise.then(() => {
    assert.deepEqual(seen, [0.5, 0.5]);
    stop();
  });
});

test("the overlay lifts on fonts plus the first frame, on an 8 second timeout, or on a return visit", () => {
  assert.equal(PRELOADER_TIMEOUT_MS, 8000);
  assert.equal(HANDOFF_OPACITY_MS, 200);
  const waiting = shouldLiftOverlay({
    seenThisSession: false,
    reducedMotion: false,
    fontsReady: true,
    firstFrame: false,
    elapsedMs: 7999,
  });
  assert.equal(waiting.lift, false);
  const frame = shouldLiftOverlay({
    seenThisSession: false,
    reducedMotion: false,
    fontsReady: true,
    firstFrame: true,
    elapsedMs: 10,
  });
  assert.equal(frame.lift, true);
  if (frame.lift) assert.ok(frame.opacityMs <= 200);
  const timeout = shouldLiftOverlay({
    seenThisSession: false,
    reducedMotion: false,
    fontsReady: false,
    firstFrame: false,
    elapsedMs: 8000,
  });
  assert.equal(timeout.lift, true);
  if (timeout.lift) {
    assert.equal(timeout.reason, "timeout");
    assert.equal(timeout.keepPoster, true);
  }
  const quiet = shouldLiftOverlay({
    seenThisSession: false,
    reducedMotion: true,
    fontsReady: true,
    firstFrame: false,
    elapsedMs: 0,
  });
  assert.equal(quiet.lift, true);
  if (quiet.lift) {
    assert.equal(quiet.reason, "reduced-motion");
    assert.ok(quiet.opacityMs <= 200);
    assert.equal(quiet.cameraMove, false);
  }
  const again = shouldLiftOverlay({
    seenThisSession: true,
    reducedMotion: false,
    fontsReady: false,
    firstFrame: false,
    elapsedMs: 0,
  });
  assert.equal(again.lift, true);
  if (again.lift) assert.equal(again.reason, "seen");
});

test("fonts and the overlay lift each refresh scroll, and a return visit skips the intro", async () => {
  const fonts = deferred();
  const refreshes: string[] = [];
  let clock = 0;
  const session = memorySession(false);
  const preloader = createPreloader({
    reducedMotion: false,
    session,
    fonts: { ready: fonts.promise },
    now: () => clock,
    refresh: () => {
      refreshes.push("refresh");
    },
  });
  assert.equal(preloader.decide(false).lift, false);
  fonts.resolve();
  await fonts.promise;
  await Promise.resolve();
  assert.deepEqual(refreshes, ["refresh"]);
  const lifted = preloader.decide(true);
  assert.equal(lifted.lift, true);
  assert.deepEqual(refreshes, ["refresh", "refresh"]);
  assert.equal(session.getItem(PRELOADER_SESSION_KEY), "1");

  const returnVisit = createPreloader({
    reducedMotion: false,
    session,
    fonts: { ready: Promise.resolve() },
    now: () => 0,
    refresh: () => {
      refreshes.push("skip");
    },
  });
  const skipped = returnVisit.decide(false);
  assert.equal(skipped.lift, true);
  if (skipped.lift) assert.equal(skipped.reason, "seen");

  let stuckClock = 0;
  const stuck = createPreloader({
    reducedMotion: false,
    session: memorySession(false),
    fonts: { ready: new Promise(() => {}) },
    now: () => stuckClock,
    refresh: () => {},
  });
  stuckClock = 8000;
  const gaveUp = stuck.decide(false);
  assert.equal(gaveUp.lift, true);
  if (gaveUp.lift) {
    assert.equal(gaveUp.reason, "timeout");
    assert.equal(gaveUp.keepPoster, true);
  }
});
