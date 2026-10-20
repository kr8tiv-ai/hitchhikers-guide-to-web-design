import assert from "node:assert/strict";
import { test } from "node:test";
import { devices } from "playwright";
import { stateSweepProjects, type DeviceDescriptor, type DeviceMap } from "../src/device-matrix.ts";
import {
  UI_STATES,
  ZOOM_PERCENT,
  evaluateStateSweeps,
  stateFixture,
  type StateFixture,
  type ZoomSample,
} from "../src/state-sweep.ts";

function descriptor(
  viewport: { width: number; height: number },
  browser: "chromium" | "webkit",
  touch: boolean,
  scale = 2,
): DeviceDescriptor {
  return {
    userAgent: `ua-${viewport.width}-${browser}`,
    viewport,
    deviceScaleFactor: scale,
    isMobile: touch,
    hasTouch: touch,
    defaultBrowserType: browser,
  };
}

function fixtureMap(): DeviceMap {
  return {
    "iPhone 15": descriptor({ width: 393, height: 659 }, "webkit", true, 3),
    "iPhone 15 landscape": descriptor({ width: 734, height: 343 }, "webkit", true, 3),
    "Pixel 7": descriptor({ width: 412, height: 839 }, "chromium", true, 2.625),
    "Pixel 7 landscape": descriptor({ width: 863, height: 360 }, "chromium", true, 2.625),
    "iPad Pro 11": descriptor({ width: 834, height: 1194 }, "webkit", true, 2),
    "iPad Pro 11 landscape": descriptor({ width: 1194, height: 834 }, "webkit", true, 2),
    "Galaxy Tab S9": descriptor({ width: 640, height: 1024 }, "chromium", true, 2.5),
    "Galaxy Tab S9 landscape": descriptor({ width: 1024, height: 640 }, "chromium", true, 2.5),
    "Desktop Chrome": descriptor({ width: 1280, height: 720 }, "chromium", false, 1),
    "iPhone SE": descriptor({ width: 320, height: 568 }, "webkit", true, 2),
  };
}

const cleanZoom: ZoomSample = { scrollWidth: 390, clientWidth: 390, titleClipped: false };

function eight(hoverChanges = true): StateFixture[] {
  return UI_STATES.map((state) => stateFixture(state, hoverChanges));
}

test("the state list is the eight named fixtures", () => {
  assert.deepEqual([...UI_STATES], [
    "default",
    "hover",
    "focus-visible",
    "active",
    "disabled",
    "loading",
    "error",
    "empty",
  ]);
  assert.equal(ZOOM_PERCENT, 200);
});

test("iOS Safari stays P0 and the sweep covers portrait, landscape, and the 320px SE", () => {
  const projects = stateSweepProjects(fixtureMap());
  const ids = projects.map((item) => item.id);
  assert.equal(ids[0], "iphone-15");
  assert.equal(projects[0]?.browser, "webkit");
  assert.equal(projects[0]?.p0Phone, true);
  for (const id of [
    "iphone-15",
    "iphone-15-landscape",
    "pixel-7",
    "pixel-7-landscape",
    "ipad-pro-11",
    "ipad-pro-11-landscape",
    "galaxy-tab-s9",
    "galaxy-tab-s9-landscape",
    "desktop-1440",
    "desktop-1920",
    "iphone-se",
  ]) {
    assert.ok(ids.includes(id), id);
  }
  const se = projects.find((item) => item.id === "iphone-se");
  assert.ok(se);
  assert.equal(se.browser, "webkit");
  assert.deepEqual(se.context.viewport, { width: 320, height: 568 });
  assert.equal(se.descriptorKey, "iPhone SE");
  assert.equal(se.p0Phone, false);
});

test("the installed iPhone SE descriptor is the 320px sweep", () => {
  const table = devices as unknown as DeviceMap;
  const projects = stateSweepProjects(table);
  const se = projects.find((item) => item.id === "iphone-se");
  assert.ok(se);
  assert.deepEqual(se.context.viewport, table["iPhone SE"]?.viewport);
  assert.equal(se.context.viewport.width, 320);
  assert.equal(se.context.viewport.height, 568);
  assert.equal(se.browser, "webkit");
});

test("a missing iPhone SE descriptor fails clearly", () => {
  const source = fixtureMap();
  delete source["iPhone SE"];
  assert.throws(() => stateSweepProjects(source), /iPhone SE/);
  assert.throws(() => stateSweepProjects(source), /does not invent/);
});

test("eight local fixtures pass on every project, and hover is skipped on a coarse pointer", () => {
  const projects = stateSweepProjects(fixtureMap());
  const seen: string[] = [];
  const report = evaluateStateSweeps(projects, (project) => {
    seen.push(project.id);
    return { fixtures: eight(true), zoom: cleanZoom, zoomPercent: 200 };
  });
  assert.equal(report.ok, true, report.problems.join("\n"));
  assert.equal(seen[0], "iphone-15");
  assert.equal(report.p0ProjectId, "iphone-15");
  assert.equal(report.hoverByProject["iphone-15"], "skipped-coarse-pointer");
  assert.equal(report.hoverByProject["desktop-1440"], "checked");
  assert.equal(report.states.length, 8);
  assert.ok(seen.includes("iphone-se"));
  assert.ok(seen.includes("pixel-7-landscape"));
});

test("a missing state fixture fails by name", () => {
  const projects = stateSweepProjects(fixtureMap()).filter((item) => item.id === "iphone-15");
  const fixtures = eight().filter((item) => item.state !== "error");
  const report = evaluateStateSweeps(
    projects,
    () => ({ fixtures, zoom: cleanZoom, zoomPercent: 200 }),
    { requireMatrix: false },
  );
  assert.equal(report.ok, false);
  assert.match(report.problems.join("\n"), /error/);
  assert.match(report.problems.join("\n"), /iphone-15/);
});

test("hover is required only for a fine pointer", () => {
  const projects = stateSweepProjects(fixtureMap());
  const desktop = projects.filter((item) => item.id === "desktop-1440");
  const phone = projects.filter((item) => item.id === "iphone-15");
  const quiet = eight(false);
  const desk = evaluateStateSweeps(
    desktop,
    () => ({ fixtures: quiet, zoom: cleanZoom, zoomPercent: 200 }),
    { requireMatrix: false },
  );
  assert.equal(desk.ok, false);
  assert.match(desk.problems.join("\n"), /hover/);
  const touch = evaluateStateSweeps(
    phone,
    () => ({ fixtures: quiet, zoom: cleanZoom, zoomPercent: 200 }),
    { requireMatrix: false },
  );
  assert.equal(touch.ok, true, touch.problems.join("\n"));
  assert.equal(touch.hoverByProject["iphone-15"], "skipped-coarse-pointer");
});

test("200% zoom fails when the title clips or the page overflows sideways", () => {
  const projects = stateSweepProjects(fixtureMap()).filter((item) => item.id === "pixel-7");
  const clipped = evaluateStateSweeps(
    projects,
    () => ({
      fixtures: eight(),
      zoom: { scrollWidth: 390, clientWidth: 390, titleClipped: true },
      zoomPercent: 200,
    }),
    { requireMatrix: false },
  );
  assert.match(clipped.problems.join("\n"), /clips the title/);
  assert.match(clipped.problems.join("\n"), /200%/);
  const wide = evaluateStateSweeps(
    projects,
    () => ({
      fixtures: eight(),
      zoom: { scrollWidth: 800, clientWidth: 390, titleClipped: false },
      zoomPercent: 200,
    }),
    { requireMatrix: false },
  );
  assert.match(wide.problems.join("\n"), /overflow/);
  const wrong = evaluateStateSweeps(
    projects,
    () => ({ fixtures: eight(), zoom: cleanZoom, zoomPercent: 150 }),
    { requireMatrix: false },
  );
  assert.match(wrong.problems.join("\n"), /200%/);
});

test("the sweep refuses a matrix that drops portrait or landscape", () => {
  const projects = stateSweepProjects(fixtureMap()).filter((item) => item.id !== "ipad-pro-11-landscape");
  const report = evaluateStateSweeps(projects, () => ({ fixtures: eight(), zoom: cleanZoom, zoomPercent: 200 }));
  assert.equal(report.ok, false);
  assert.match(report.problems.join("\n"), /ipad-pro-11-landscape/);
  assert.match(report.problems.join("\n"), /landscape/);
});
