import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "@hitchhiker/engine";
import { webglLcpIsPoster } from "../src/lighthouse-gate.ts";
import {
  CLS_MAX,
  LCP_MAX_MS,
  TBT_PROXY_MS,
  evaluateDevicePerformance,
  evaluatePerformance,
  type DeviceRunInput,
} from "../src/performance-gate.ts";
import {
  REAL_DEVICE_EMULATION,
  TABLET_VIEWPORT,
  installedTbtP10,
  loadInstalledPresets,
  printDesktopThrottling,
  type LhPreset,
  type ThrottlingProfile,
} from "../src/lighthouse-preset.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const floors = defaultConfig().gates;

const POSTER = `<main>
<img src="poster.webp" alt="" width="1440" height="900" fetchpriority="high">
<canvas></canvas>
</main>`;

function lighthouseFile(relative: string): string {
  const require = createRequire(import.meta.url);
  const cliPkg = require.resolve("@lhci/cli/package.json");
  return createRequire(cliPkg).resolve(`lighthouse/${relative}`);
}

function report(overrides: { performance?: number; accessibility?: number; lcp?: number; cls?: number; tbt?: number } = {}) {
  return {
    categories: {
      performance: { score: overrides.performance ?? 0.95 },
      accessibility: { score: overrides.accessibility ?? 0.96 },
      "best-practices": { score: 0.97 },
      seo: { score: 0.98 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: overrides.lcp ?? 1800 },
      "cumulative-layout-shift": { numericValue: overrides.cls ?? 0.02 },
      "total-blocking-time": { numericValue: overrides.tbt ?? 80 },
    },
  };
}

function run(preset: LhPreset, patch: Partial<DeviceRunInput> = {}): DeviceRunInput {
  return {
    lighthouse: report({ tbt: Math.min(80, preset.tbtGoodMs) }),
    formFactor: preset.formFactor,
    viewport: {
      width: preset.screenEmulation.width,
      height: preset.screenEmulation.height,
      deviceScaleFactor: preset.screenEmulation.deviceScaleFactor,
    },
    tbtLimitMs: preset.tbtGoodMs,
    inpSampleMs: null,
    ...patch,
  };
}

function devices(presets: readonly LhPreset[], throttling: string) {
  const mobile = presets.find((item) => item.id === "mobile");
  const desktop = presets.find((item) => item.id === "desktop");
  const tablet = presets.find((item) => item.id === "tablet");
  assert.ok(mobile && desktop && tablet);
  return {
    floors,
    heavy: false,
    mobile: run(mobile),
    desktop: run(desktop),
    tablet: run(tablet),
    webgl: true,
    markup: POSTER,
    desktopThrottling: throttling,
  };
}

test("desktop throttling is printed from the installed Lighthouse", async () => {
  const presets = await loadInstalledPresets();
  const href = pathToFileURL(lighthouseFile("core/config/constants.js")).href;
  const installed = (await import(href)) as {
    throttling: { mobileSlow4G: ThrottlingProfile; desktopDense4G: ThrottlingProfile };
    screenEmulationMetrics: { mobile: { mobile: boolean; width: number; height: number; deviceScaleFactor: number } };
    userAgents: { desktop: string; mobile: string };
  };
  const mobile = presets[0];
  const desktop = presets[1];
  const tablet = presets[2];
  assert.ok(mobile && desktop && tablet);
  assert.equal(mobile.id, "mobile");
  assert.equal(desktop.id, "desktop");
  assert.equal(tablet.id, "tablet");
  assert.deepEqual(desktop.throttling, installed.throttling.desktopDense4G);
  assert.deepEqual(mobile.throttling, installed.throttling.mobileSlow4G);
  assert.equal(printDesktopThrottling(desktop.throttling), printDesktopThrottling(installed.throttling.desktopDense4G));
  assert.match(printDesktopThrottling(desktop.throttling), /cpuSlowdownMultiplier=/);
  assert.notEqual(desktop.throttling.cpuSlowdownMultiplier, mobile.throttling.cpuSlowdownMultiplier);
  assert.equal(desktop.formFactor, "desktop");
  assert.equal(desktop.screenEmulation.mobile, false);
  assert.deepEqual(mobile.screenEmulation, installed.screenEmulationMetrics.mobile);
  assert.equal(mobile.formFactor, "mobile");
  assert.equal(mobile.screenEmulation.mobile, true);
  assert.equal(mobile.userAgent, installed.userAgents.mobile);
  assert.equal(tablet.formFactor, "desktop");
  assert.equal(tablet.screenEmulation.mobile, false);
  assert.equal(tablet.screenEmulation.width, TABLET_VIEWPORT.width);
  assert.equal(tablet.screenEmulation.height, TABLET_VIEWPORT.height);
  assert.equal(tablet.screenEmulation.deviceScaleFactor, TABLET_VIEWPORT.deviceScaleFactor);
  assert.deepEqual(tablet.throttling, desktop.throttling);
  assert.equal(tablet.userAgent, installed.userAgents.desktop);
  assert.equal(mobile.throttlingMethod, "simulate");
  assert.equal(desktop.throttlingMethod, "simulate");
  const source = readFileSync(path.join(here, "..", "src", "lighthouse-preset.ts"), "utf8");
  assert.equal(source.includes("rttMs: 40"), false);
  assert.equal(source.includes("throughputKbps: 10240"), false);
  assert.equal(source.includes("10 * 1024"), false);
  assert.equal(REAL_DEVICE_EMULATION.screenEmulationDisabled, true);
  assert.equal(REAL_DEVICE_EMULATION.cpuSlowdownMultiplier, 1);
});

test("the TBT proxy is the installed score curve, not a second cutoff", async () => {
  const presets = await loadInstalledPresets();
  const mobileP10 = installedTbtP10("mobile");
  const desktopP10 = installedTbtP10("desktop");
  assert.equal(TBT_PROXY_MS, mobileP10);
  assert.equal(presets[0].tbtGoodMs, mobileP10);
  assert.equal(presets[1].tbtGoodMs, desktopP10);
  assert.equal(presets[2].tbtGoodMs, desktopP10);
  assert.notEqual(mobileP10, desktopP10);
});

test("a WebGL fixture whose LCP node is the poster passes, and a canvas-first page fails", () => {
  assert.deepEqual(webglLcpIsPoster(POSTER), { ok: true, reasons: [] });
  const late = webglLcpIsPoster(`<canvas></canvas><img width="10" height="10" fetchpriority="high" alt="">`);
  assert.equal(late.ok, false);
  assert.match(late.reasons.join(" "), /after the canvas/);
  const lazy = webglLcpIsPoster(`<img loading="lazy" fetchpriority="high" width="8" height="8" alt=""><canvas></canvas>`);
  assert.equal(lazy.ok, false);
  assert.match(lazy.reasons.join(" "), /lazy/);
  const bare = webglLcpIsPoster(`<img fetchpriority="high" alt=""><canvas></canvas>`);
  assert.equal(bare.ok, false);
  assert.match(bare.reasons.join(" "), /width and height/);
  const canvas = webglLcpIsPoster(`<canvas></canvas>`);
  assert.equal(canvas.ok, false);
  assert.match(canvas.reasons.join(" "), /fetchpriority/);
});

test("three presets pass when the poster is the LCP element and the lab has no INP sample", async () => {
  const presets = await loadInstalledPresets();
  const throttling = printDesktopThrottling(presets[1].throttling);
  const result = evaluateDevicePerformance(devices(presets, throttling));
  assert.equal(result.status, "PASS", result.reasons.join("\n"));
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(
    result.recorded.map((item) => item.id),
    ["mobile", "desktop", "tablet"],
  );
  assert.equal(result.recorded[0]?.formFactor, "mobile");
  assert.equal(result.recorded[1]?.formFactor, "desktop");
  assert.equal(result.recorded[2]?.formFactor, "desktop");
  assert.equal(result.recorded[2]?.viewport.width, TABLET_VIEWPORT.width);
  assert.equal(result.recorded[2]?.viewport.height, TABLET_VIEWPORT.height);
  assert.equal(result.lab.mobile.inpSampleMs, null);
  assert.equal(result.lab.mobile.tbtMs, 80);
  assert.equal(result.desktopThrottling, throttling);
  assert.match(result.desktopThrottling, /rttMs=/);
});

test("desktop and tablet performance, LCP, and CLS use the same floors", async () => {
  const presets = await loadInstalledPresets();
  const throttling = printDesktopThrottling(presets[1].throttling);
  const base = devices(presets, throttling);
  const lowDesktop = evaluateDevicePerformance({
    ...base,
    desktop: run(presets[1], { lighthouse: report({ performance: 0.4 }) }),
  });
  assert.equal(lowDesktop.status, "BLOCKER");
  assert.match(lowDesktop.reasons.join(" "), /Desktop performance is 40, below the floor of 90/);
  assert.equal(lowDesktop.recorded[1]?.formFactor, "desktop");
  assert.equal(lowDesktop.recorded[1]?.viewport.width, presets[1].screenEmulation.width);

  const lowTablet = evaluateDevicePerformance({
    ...base,
    tablet: run(presets[2], { lighthouse: report({ performance: 89 }) }),
  });
  assert.equal(lowTablet.status, "BLOCKER");
  assert.match(lowTablet.reasons.join(" "), /Tablet performance is 89/);
  assert.match(lowTablet.reasons.join(" "), /820 by 1180/);

  const desktopA11y = evaluateDevicePerformance({
    ...base,
    desktop: run(presets[1], { lighthouse: report({ accessibility: 0.4 }) }),
  });
  assert.equal(desktopA11y.status, "PASS", desktopA11y.reasons.join("\n"));

  const desktopLcp = evaluateDevicePerformance({
    ...base,
    desktop: run(presets[1], { lighthouse: report({ lcp: LCP_MAX_MS + 1 }) }),
  });
  assert.equal(desktopLcp.status, "BLOCKER");
  assert.match(desktopLcp.reasons.join(" "), /desktop LCP is 2501 ms/);

  const tabletCls = evaluateDevicePerformance({
    ...base,
    tablet: run(presets[2], { lighthouse: report({ cls: CLS_MAX + 0.01 }) }),
  });
  assert.equal(tabletCls.status, "BLOCKER");
  assert.match(tabletCls.reasons.join(" "), /tablet CLS/);

  const phone = evaluateDevicePerformance({
    ...base,
    mobile: run(presets[0], { lighthouse: report({ performance: 0.89 }) }),
  });
  assert.equal(phone.status, "BLOCKER");
  assert.match(phone.reasons.join(" "), /Phone performance is 89/);
});

test("a missing desktop run does not pass on the phone, and a phone form factor on the tablet is explained", async () => {
  const presets = await loadInstalledPresets();
  const throttling = printDesktopThrottling(presets[1].throttling);
  const base = devices(presets, throttling);
  const missing = evaluateDevicePerformance({
    ...base,
    desktop: run(presets[1], { lighthouse: null }),
  });
  assert.equal(missing.status, "BLOCKER");
  assert.match(missing.reasons.join(" "), /real desktop run is required/);
  assert.match(missing.reasons.join(" "), /does not waive the phone/);

  const wrong = evaluateDevicePerformance({
    ...base,
    tablet: run(presets[2], { formFactor: "mobile" }),
  });
  assert.equal(wrong.status, "BLOCKER");
  const text = wrong.reasons.join(" ");
  assert.match(text, /tablet formFactor is mobile/);
  assert.match(text, /desktop preset/);
  assert.match(text, /820 by 1180/);
});

test("lab INP is not a failure without a sample, and TBT over the installed p10 is", async () => {
  const presets = await loadInstalledPresets();
  const throttling = printDesktopThrottling(presets[1].throttling);
  const base = devices(presets, throttling);
  const atLimit = evaluateDevicePerformance({
    ...base,
    mobile: run(presets[0], { lighthouse: report({ tbt: presets[0].tbtGoodMs }), inpSampleMs: null }),
    desktop: run(presets[1], { lighthouse: report({ tbt: presets[1].tbtGoodMs }), inpSampleMs: null }),
  });
  assert.equal(atLimit.status, "PASS", atLimit.reasons.join("\n"));

  const over = evaluateDevicePerformance({
    ...base,
    desktop: run(presets[1], { lighthouse: report({ tbt: presets[1].tbtGoodMs + 1 }), inpSampleMs: null }),
  });
  assert.equal(over.status, "BLOCKER");
  assert.match(over.reasons.join(" "), new RegExp(`desktop TBT is ${presets[1].tbtGoodMs + 1} ms`));
  assert.match(over.reasons.join(" "), /lab stand-in for INP/);

  const sampled = evaluateDevicePerformance({
    ...base,
    mobile: run(presets[0], { inpSampleMs: 201 }),
  });
  assert.equal(sampled.status, "BLOCKER");
  assert.match(sampled.reasons.join(" "), /mobile INP is 201 ms/);

  const phoneAtLimit = evaluatePerformance({
    lighthouse: report({ tbt: TBT_PROXY_MS }),
    floors,
    heavy: false,
    webglContexts: 0,
    glbBytes: 0,
    videoBytes: 0,
    mobileStill: false,
    animates: false,
    reducedMotionComplete: false,
  });
  assert.equal(phoneAtLimit.status, "PASS", phoneAtLimit.reasons.join("\n"));
  const hot = evaluatePerformance({
    lighthouse: report({ tbt: TBT_PROXY_MS + 1 }),
    floors,
    heavy: false,
    webglContexts: 0,
    glbBytes: 0,
    videoBytes: 0,
    mobileStill: false,
    animates: false,
    reducedMotionComplete: false,
  });
  assert.equal(hot.status, "BLOCKER");
  assert.match(hot.reasons.join(" "), /TBT is 201 ms/);
});

test("a WebGL page whose LCP node is not the poster fails the device gate", async () => {
  const presets = await loadInstalledPresets();
  const throttling = printDesktopThrottling(presets[1].throttling);
  const result = evaluateDevicePerformance({
    ...devices(presets, throttling),
    markup: "<canvas></canvas>",
  });
  assert.equal(result.status, "BLOCKER");
  assert.match(result.reasons.join(" "), /fetchpriority/);
});

test("blank desktop throttling is a blocker", async () => {
  const presets = await loadInstalledPresets();
  const result = evaluateDevicePerformance(devices(presets, "   "));
  assert.equal(result.status, "BLOCKER");
  assert.match(result.reasons.join(" "), /not printed from the installed Lighthouse/);
});
