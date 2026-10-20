import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { devices } from "playwright";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";
import { CHROME_FIX, assertBrowserEngine } from "../src/playwright-opener.ts";
import {
  EMULATION_LIMITS,
  OPTIONAL_DEVICE_LABS,
  OPTIONAL_ENGINES,
  PHONE_CLASS_WIDTHS,
  buildDeviceMatrix,
  missingDescriptorMessage,
  runDeviceMatrix,
  type DeviceDescriptor,
  type DeviceMap,
  type DeviceProject,
} from "../src/device-matrix.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function descriptor(
  viewport: { width: number; height: number },
  browser: "chromium" | "webkit",
  scale = 2,
): DeviceDescriptor {
  return {
    userAgent: `ua-${viewport.width}x${viewport.height}-${browser}`,
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: scale,
    isMobile: browser === "webkit" ? viewport.width < 1200 : viewport.width < 1100,
    hasTouch: viewport.width < 1400,
    defaultBrowserType: browser,
  };
}

function fixtureMap(): DeviceMap {
  return {
    "iPhone 15": descriptor({ width: 111, height: 222 }, "webkit", 3),
    "iPhone 15 landscape": descriptor({ width: 333, height: 444 }, "webkit", 3),
    "Pixel 7": descriptor({ width: 555, height: 666 }, "chromium", 2.625),
    "Pixel 7 landscape": descriptor({ width: 777, height: 888 }, "chromium", 2.625),
    "iPad Pro 11": descriptor({ width: 101, height: 202 }, "webkit", 2),
    "iPad Pro 11 landscape": descriptor({ width: 303, height: 404 }, "webkit", 2),
    "Galaxy Tab S9": descriptor({ width: 505, height: 606 }, "chromium", 2.5),
    "Galaxy Tab S9 landscape": descriptor({ width: 707, height: 808 }, "chromium", 2.5),
    "Galaxy Tab S4": descriptor({ width: 11, height: 22 }, "chromium", 2.25),
    "Galaxy Tab S4 landscape": descriptor({ width: 33, height: 44 }, "chromium", 2.25),
    "Desktop Chrome": descriptor({ width: 1280, height: 720 }, "chromium", 1),
    "iPhone SE": descriptor({ width: 320, height: 568 }, "webkit", 2),
  };
}

function project(projects: readonly DeviceProject[], id: string): DeviceProject {
  const found = projects.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

test("the matrix spreads installed descriptors and does not invent viewports", () => {
  const seen: string[] = [];
  const source = fixtureMap();
  const projects = buildDeviceMatrix(source, (key) => seen.push(key));
  const phone = project(projects, "iphone-15");
  const raw = source["iPhone 15"];
  assert.ok(raw);
  assert.equal(phone.p0Phone, true);
  assert.equal(phone.priority, "P0");
  assert.equal(phone.browser, "webkit");
  assert.equal(phone.descriptorKey, "iPhone 15");
  assert.equal(phone.context.userAgent, raw.userAgent);
  assert.deepEqual(phone.context.viewport, raw.viewport);
  assert.notEqual(phone.context.viewport, raw.viewport);
  assert.equal(phone.context.deviceScaleFactor, 3);
  assert.equal(phone.context.isMobile, raw.isMobile);
  assert.equal(phone.context.hasTouch, raw.hasTouch);
  phone.context.viewport.width = 1;
  assert.equal(raw.viewport.width, 111);

  const landscape = project(projects, "iphone-15-landscape");
  assert.deepEqual(landscape.context.viewport, { width: 333, height: 444 });
  assert.equal(landscape.browser, "webkit");
  assert.equal(landscape.priority, "P0");

  const pixel = project(projects, "pixel-7");
  assert.equal(pixel.browser, "chromium");
  assert.equal(pixel.priority, "P0");
  assert.deepEqual(pixel.context.viewport, { width: 555, height: 666 });
  assert.equal(pixel.context.deviceScaleFactor, 2.625);

  const ipad = project(projects, "ipad-pro-11-landscape");
  assert.equal(ipad.browser, "webkit");
  assert.deepEqual(ipad.context.viewport, { width: 303, height: 404 });

  const tab = project(projects, "galaxy-tab-s9");
  assert.equal(tab.descriptorKey, "Galaxy Tab S9");
  assert.equal(tab.fallbackNote, null);
  assert.equal(tab.browser, "chromium");

  assert.equal(seen.includes("390"), false);
  assert.equal(seen.includes("430"), false);
  assert.equal(seen.includes("1440"), false);
  assert.equal(seen.includes("1920"), false);
});

test("desktop 1440 and 1920 override Desktop Chrome and are not descriptor keys", () => {
  const source = fixtureMap();
  const projects = buildDeviceMatrix(source);
  for (const [id, width] of [
    ["desktop-1440", 1440],
    ["desktop-1920", 1920],
  ] as const) {
    const desk = project(projects, id);
    assert.equal(desk.descriptorKey, "Desktop Chrome");
    assert.equal(desk.requestedKey, "Desktop Chrome");
    assert.equal(desk.priority, "P0");
    assert.equal(desk.browser, "chromium");
    assert.deepEqual(desk.context.viewport, { width, height: 900 });
    assert.equal(desk.context.deviceScaleFactor, 1);
    assert.equal(desk.context.isMobile, false);
    assert.equal(desk.context.hasTouch, false);
    assert.equal(desk.context.userAgent, source["Desktop Chrome"]?.userAgent);
    assert.notEqual(desk.context.viewport.width, 1280);
  }
});

test("390 and 430 are width checks on top of the review widths", () => {
  const projects = buildDeviceMatrix(fixtureMap());
  assert.deepEqual(PHONE_CLASS_WIDTHS, [390, 430]);
  assert.deepEqual([...REVIEW_WIDTHS], [375, 768, 1440, 1920]);
  for (const width of PHONE_CLASS_WIDTHS) {
    const item = project(projects, `width-${width}`);
    assert.equal(item.descriptorKey, null);
    assert.equal(item.requestedKey, null);
    assert.equal(item.browser, "chromium");
    assert.deepEqual(item.context.viewport, { width, height: 812 });
    assert.equal(item.context.isMobile, true);
    assert.equal(item.context.hasTouch, true);
    assert.equal(REVIEW_WIDTHS.includes(width as 375), false);
  }
});

test("a missing descriptor fails and names the key", () => {
  const source = fixtureMap();
  delete source["Pixel 7"];
  assert.throws(
    () => buildDeviceMatrix(source),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, missingDescriptorMessage("Pixel 7"));
      assert.match(error.message, /Pixel 7/);
      assert.match(error.message, /does not invent/);
      return true;
    },
  );
});

test("Galaxy Tab S4 is used only when Galaxy Tab S9 is absent", () => {
  const source = fixtureMap();
  delete source["Galaxy Tab S9"];
  delete source["Galaxy Tab S9 landscape"];
  const projects = buildDeviceMatrix(source);
  const tab = project(projects, "galaxy-tab-s9");
  assert.equal(tab.descriptorKey, "Galaxy Tab S4");
  assert.equal(tab.requestedKey, "Galaxy Tab S9");
  assert.match(tab.fallbackNote ?? "", /Galaxy Tab S4/);
  assert.deepEqual(tab.context.viewport, { width: 11, height: 22 });

  delete source["Galaxy Tab S4"];
  assert.throws(() => buildDeviceMatrix(source), /Galaxy Tab S9/);
});

test("the P0 phone must be WebKit iPhone 15", () => {
  const source = fixtureMap();
  const iphone = source["iPhone 15"];
  assert.ok(iphone);
  source["iPhone 15"] = { ...iphone, defaultBrowserType: "chromium" };
  assert.throws(() => buildDeviceMatrix(source), /iOS Safari/);
  assert.throws(() => buildDeviceMatrix(source), /WebKit/);
});

test("a missing WebKit engine fails clearly and a missing Chromium engine keeps its message", () => {
  assert.throws(() => assertBrowserEngine("webkit", "", false), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /WebKit is missing/);
    assert.match(error.message, /iOS Safari/);
    assert.match(error.message, /P0/);
    assert.match(error.message, /pnpm exec playwright install webkit/);
    return true;
  });
  assert.throws(() => assertBrowserEngine("chromium", "", false), new RegExp(CHROME_FIX.replace(/[.]/g, "\\.")));
  assert.doesNotThrow(() => assertBrowserEngine("webkit", "/engines/webkit", true));
});

test("playwright-opener launches a WebKit project", () => {
  const source = readFileSync(path.join(here, "..", "src", "playwright-opener.ts"), "utf8");
  assert.match(source, /from "playwright"/);
  assert.match(source, /\bwebkit\b/);
  assert.match(source, /export async function withWebKit/);
  assert.match(source, /export async function withProjectBrowser/);
  assert.match(source, /captureDeviceShot/);
  const run = readFileSync(path.join(here, "..", "src", "device-run.ts"), "utf8");
  assert.match(run, /withProjectBrowser/);
  assert.match(run, /detailChecksIn/);
  assert.match(run, /ensureWebKit/);
  assert.match(run, /buildDeviceMatrix/);
});

test("each project captures a full shot, a fold shot, the detail pass, and a scroll strip", async () => {
  const projects = buildDeviceMatrix(fixtureMap());
  const calls: string[] = [];
  const run = await runDeviceMatrix(projects, ["main"], {
    engineReady(browser) {
      calls.push(`engine:${browser}`);
    },
    screenshot(item, kind) {
      calls.push(`shot:${item.id}:${kind}`);
      return Promise.resolve();
    },
    detail(item) {
      calls.push(`detail:${item.id}`);
      return Promise.resolve();
    },
    scrollStrip(item, section) {
      calls.push(`strip:${item.id}:${section}`);
      return Promise.resolve();
    },
  });

  assert.equal(calls[0], "engine:webkit");
  assert.equal(calls[1], "engine:chromium");
  assert.equal(run.captures[0]?.projectId, "iphone-15");
  assert.equal(run.captures[0]?.browser, "webkit");
  for (const item of projects) {
    assert.ok(calls.includes(`shot:${item.id}:full`));
    assert.ok(calls.includes(`shot:${item.id}:fold`));
    assert.ok(calls.includes(`detail:${item.id}`));
    assert.ok(calls.includes(`strip:${item.id}:main`));
  }
  const webkit = run.captures.filter((row) => row.browser === "webkit");
  assert.ok(webkit.length >= 4);
  assert.deepEqual(run.limits, [...EMULATION_LIMITS]);
  assert.deepEqual(run.optionalLabs, [...OPTIONAL_DEVICE_LABS]);
  assert.equal(run.optionalEngines.some((engine) => engine.name === "firefox" && engine.required === false), true);
  assert.equal(OPTIONAL_ENGINES.some((engine) => engine.name === "edge"), true);
  assert.match(EMULATION_LIMITS.join(" "), /not iOS Safari/);
  assert.match(EMULATION_LIMITS.join(" "), /GPU tier/);
  assert.match(EMULATION_LIMITS.join(" "), /safe-area/);
  assert.match(EMULATION_LIMITS.join(" "), /playing/);
});

test("a missing P0 WebKit engine stops the matrix before any capture", async () => {
  const projects = buildDeviceMatrix(fixtureMap());
  const calls: string[] = [];
  await assert.rejects(
    () =>
      runDeviceMatrix(projects, ["main"], {
        engineReady(browser) {
          calls.push(browser);
          if (browser === "webkit") throw new Error("WebKit is missing. iOS Safari (WebKit iPhone 15) is the P0 phone.");
        },
        screenshot(item, kind) {
          calls.push(`shot:${item.id}:${kind}`);
          return Promise.resolve();
        },
        detail() {
          return Promise.resolve();
        },
        scrollStrip() {
          return Promise.resolve();
        },
      }),
    /P0/,
  );
  assert.deepEqual(calls, ["webkit"]);
});

test("the installed Playwright list is what iPhone 15, Pixel 7, iPad, and Galaxy Tab S9 spread", () => {
  const table = devices as unknown as DeviceMap;
  const projects = buildDeviceMatrix(table);
  const phone = project(projects, "iphone-15");
  const installed = table["iPhone 15"];
  assert.ok(installed);
  assert.equal(phone.browser, "webkit");
  assert.deepEqual(phone.context.viewport, installed.viewport);
  assert.equal(phone.context.deviceScaleFactor, installed.deviceScaleFactor);
  assert.equal(phone.context.isMobile, true);
  assert.equal(phone.context.hasTouch, true);
  assert.equal(installed.viewport.width, 393);
  assert.equal(installed.viewport.height, 659);

  const pixel = project(projects, "pixel-7");
  assert.deepEqual(pixel.context.viewport, table["Pixel 7"]?.viewport);
  assert.equal(pixel.browser, "chromium");
  assert.equal(table["Pixel 7"]?.viewport.width, 412);

  const ipad = project(projects, "ipad-pro-11");
  assert.equal(ipad.browser, "webkit");
  assert.deepEqual(ipad.context.viewport, table["iPad Pro 11"]?.viewport);

  const tab = project(projects, "galaxy-tab-s9");
  assert.equal(tab.descriptorKey, "Galaxy Tab S9");
  assert.equal(tab.browser, "chromium");
  assert.deepEqual(tab.context.viewport, table["Galaxy Tab S9"]?.viewport);

  const desk = project(projects, "desktop-1440");
  assert.deepEqual(desk.context.viewport, { width: 1440, height: 900 });
  assert.notEqual(desk.context.viewport.width, table["Desktop Chrome"]?.viewport.width);
});
