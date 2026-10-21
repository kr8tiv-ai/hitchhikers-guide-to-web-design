import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSplashLoop } from "../src/splash/markup.ts";
import {
  capSplashDpr,
  splashBudget,
  splashForm,
  splashTier,
  type SplashSignals,
} from "../src/splash/tier.ts";

function signals(over: Partial<SplashSignals> = {}): SplashSignals {
  return {
    reducedMotion: false,
    reducedData: false,
    saveData: false,
    webgl: true,
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)",
    performanceCaveat: false,
    width: 1440,
    devicePixelRatio: 2,
    ...over,
  };
}

test("splash form follows width and does not pick the still", () => {
  assert.equal(splashForm(375), "phone");
  assert.equal(splashForm(767), "phone");
  assert.equal(splashForm(768), "tablet");
  assert.equal(splashForm(1099), "tablet");
  assert.equal(splashForm(1100), "desktop");
  assert.equal(splashForm(Number.NaN), "phone");
});

test("capSplashDpr uses native pixels up to the form cap and ignores tier", () => {
  assert.equal(capSplashDpr("phone", 3, 3), 1.5);
  assert.equal(capSplashDpr("phone", 1.25, 3), 1.25);
  assert.equal(capSplashDpr("phone", 3, 1), 1.5);
  assert.equal(capSplashDpr("tablet", 2, 1), 2);
  assert.equal(capSplashDpr("tablet", 4, 3), 3);
  assert.equal(capSplashDpr("desktop", 2, 1), 2);
  assert.equal(capSplashDpr("desktop", 4, 3), 3);
  assert.equal(capSplashDpr("desktop", 0, 2), 1);
  assert.equal(capSplashDpr("desktop", Number.NaN, 1), 1);
});

test("a low GPU drops particles before it drops resolution", () => {
  const phone = splashBudget(signals({
    width: 390,
    devicePixelRatio: 3,
    renderer: "Google SwiftShader",
    performanceCaveat: true,
  }));
  const desk = splashBudget(signals({
    width: 1440,
    devicePixelRatio: 2,
    renderer: "llvmpipe",
  }));
  assert.equal(phone.mode, "scene");
  assert.equal(phone.tier, 1);
  assert.equal(phone.form, "phone");
  assert.equal(phone.dpr, 1.5);
  assert.equal(desk.mode, "scene");
  assert.equal(desk.tier, 1);
  assert.equal(desk.dpr, 2);
  assert.ok(phone.counts.stars < splashBudget(signals({ width: 390, devicePixelRatio: 3 })).counts.stars);
  assert.equal(phone.dpr, splashBudget(signals({ width: 390, devicePixelRatio: 3 })).dpr);
  assert.ok(phone.counts.comets > 0);
  assert.ok(phone.counts.debris > 0);
});

test("poster is reduced motion, reduced data, save-data, or no WebGL", () => {
  assert.equal(splashTier(signals({ reducedMotion: true })), 0);
  assert.equal(splashTier(signals({ reducedData: true, width: 390 })), 0);
  assert.equal(splashTier(signals({ saveData: true })), 0);
  assert.equal(splashTier(signals({ webgl: false, width: 1440 })), 0);
  assert.equal(splashBudget(signals({ reducedMotion: true })).mode, "poster");
  assert.equal(splashBudget(signals({ webgl: false })).counts.stars, 0);
});

test("integrated graphics sit between software and a discrete GPU", () => {
  assert.equal(splashTier(signals({ renderer: "Intel(R) HD Graphics 620" })), 2);
  assert.equal(splashTier(signals({ renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)" })), 3);
  assert.equal(splashTier(signals({ renderer: "Apple GPU" })), 3);
  const mid = splashBudget(signals({ renderer: "Intel(R) UHD Graphics 620", width: 820, devicePixelRatio: 2 }));
  const high = splashBudget(signals({ width: 820, devicePixelRatio: 2 }));
  assert.equal(mid.tier, 2);
  assert.equal(mid.dpr, high.dpr);
  assert.ok(mid.counts.stars < high.counts.stars);
  assert.ok(mid.counts.stars > splashBudget(signals({ renderer: "Microsoft Basic Render Driver" })).counts.stars);
});

test("the splash loop defaults to cosmos and the URL can select either", () => {
  assert.equal(resolveSplashLoop("/"), "cosmos");
  assert.equal(resolveSplashLoop("/?stay=1"), "cosmos");
  assert.equal(resolveSplashLoop("/?splash=nebula"), "nebula");
  assert.equal(resolveSplashLoop("http://127.0.0.1:9/?splash=cosmos"), "cosmos");
  assert.equal(resolveSplashLoop("/?splash=other"), "cosmos");
});
