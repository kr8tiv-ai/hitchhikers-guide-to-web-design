import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { devices } from "playwright";
import { phonePerformanceBudget } from "@hitchhiker/engine";
import { buildDeviceMatrix, type DeviceDescriptor, type DeviceMap, type DeviceProject } from "../src/device-matrix.ts";
import {
  OPACITY_KEEP_MS,
  PHONE_FRAME_MAX_MS,
  PHONE_LONG_TASK_MAX_MS,
  evaluateReducedMotion,
  judgePhoneScene,
  runReducedMotion,
  type PhoneSceneSample,
  type ReducedSample,
  type TierZeroStill,
} from "../src/reduced-motion.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function descriptor(
  viewport: { width: number; height: number },
  browser: "chromium" | "webkit",
  touch: boolean,
): DeviceDescriptor {
  return {
    userAgent: `ua-${viewport.width}`,
    viewport,
    deviceScaleFactor: 2,
    isMobile: touch,
    hasTouch: touch,
    defaultBrowserType: browser,
  };
}

function fixtureMap(): DeviceMap {
  return {
    "iPhone 15": descriptor({ width: 393, height: 659 }, "webkit", true),
    "iPhone 15 landscape": descriptor({ width: 734, height: 343 }, "webkit", true),
    "Pixel 7": descriptor({ width: 412, height: 839 }, "chromium", true),
    "Pixel 7 landscape": descriptor({ width: 863, height: 360 }, "chromium", true),
    "iPad Pro 11": descriptor({ width: 834, height: 1194 }, "webkit", true),
    "iPad Pro 11 landscape": descriptor({ width: 1194, height: 834 }, "webkit", true),
    "Galaxy Tab S9": descriptor({ width: 640, height: 1024 }, "chromium", true),
    "Galaxy Tab S9 landscape": descriptor({ width: 1024, height: 640 }, "chromium", true),
    "Desktop Chrome": descriptor({ width: 1280, height: 720 }, "chromium", false),
  };
}

function pose(): TierZeroStill {
  return {
    camera: { fov: 35, position: [0, 1.2, 4], lookAt: [0, 0.8, 0] },
    grade: { name: "Boreal", exposure: 1.1 },
    lighting: { key: "north" },
  };
}

function quiet(project: DeviceProject, over: Partial<ReducedSample> = {}): ReducedSample {
  return {
    projectId: project.id,
    viewportWidth: project.context.viewport.width,
    prefersReducedMotion: true,
    sections: [
      { id: "hero", text: "The valley holds", image: "/still.jpg" },
      { id: "work", text: "Three jobs", image: "/work.jpg" },
    ],
    lenis: { respectReducedMotion: true, smoothingActive: false },
    parallax: false,
    scrub: false,
    cameraMoving: false,
    autoplay: false,
    canvasLoopStarted: false,
    opacityDurationMs: OPACITY_KEEP_MS,
    pinned: false,
    revealedOnlyByScroll: false,
    has3d: true,
    scene: pose(),
    still: pose(),
    treatedWidthAsReducedMotion: false,
    widthSelectedStill: false,
    ...over,
  };
}

function phone(): DeviceProject {
  const found = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(found);
  return found;
}

test("reduced motion passes on every device project, including WebKit", () => {
  const projects = buildDeviceMatrix(fixtureMap());
  const report = runReducedMotion(projects, (project) => quiet(project));
  assert.equal(report.ok, true, report.problems.join("\n"));
  const ios = report.reports.find((item) => item.projectId === "iphone-15");
  assert.ok(ios);
  assert.equal(ios.browser, "webkit");
  assert.equal(ios.reduced, true);
  assert.equal(report.reports.some((item) => item.browser === "webkit"), true);
  assert.equal(report.reports.length, projects.length);
});

test("a matrix with no WebKit project fails the reduced-motion pass", () => {
  const projects = buildDeviceMatrix(fixtureMap()).filter((item) => item.browser !== "webkit");
  const report = runReducedMotion(projects, (project) => quiet(project));
  assert.equal(report.ok, false);
  assert.match(report.problems.join("\n"), /WebKit/);
});

test("reduced motion keeps every section's text and image", () => {
  const project = phone();
  const missingText = evaluateReducedMotion(project, quiet(project, {
    sections: [{ id: "hero", text: "", image: "/still.jpg" }],
  }));
  assert.match(missingText.problems.join("\n"), /text/);
  const missingImage = evaluateReducedMotion(project, quiet(project, {
    sections: [{ id: "hero", text: "The valley holds", image: "  " }],
  }));
  assert.match(missingImage.problems.join("\n"), /image/);
});

test("pinned sections unpin and nothing waits on scroll", () => {
  const project = phone();
  const pinned = evaluateReducedMotion(project, quiet(project, { pinned: true }));
  assert.match(pinned.problems.join("\n"), /pin/);
  const hidden = evaluateReducedMotion(project, quiet(project, { revealedOnlyByScroll: true }));
  assert.match(hidden.problems.join("\n"), /scroll/);
});

test("Lenis may be absent, and when present it respects reduced motion", () => {
  const project = phone();
  const absent = evaluateReducedMotion(project, quiet(project, { lenis: null }));
  assert.equal(absent.ok, true, absent.problems.join("\n"));
  const ignored = evaluateReducedMotion(project, quiet(project, {
    lenis: { respectReducedMotion: false, smoothingActive: false },
  }));
  assert.match(ignored.problems.join("\n"), /respectReducedMotion|Lenis/);
  const smooth = evaluateReducedMotion(project, quiet(project, {
    lenis: { respectReducedMotion: true, smoothingActive: true },
  }));
  assert.match(smooth.problems.join("\n"), /smooth/);
});

test("parallax, scrub, camera move, autoplay, and the canvas loop stop", () => {
  const project = phone();
  const flags = [
    ["parallax", /parallax/],
    ["scrub", /scrub/],
    ["cameraMoving", /camera/],
    ["autoplay", /autoplay/],
    ["canvasLoopStarted", /loop/],
  ] as const;
  for (const [flag, pattern] of flags) {
    const report = evaluateReducedMotion(project, quiet(project, { [flag]: true }));
    assert.equal(report.ok, false, flag);
    assert.match(report.problems.join("\n"), pattern);
  }
});

test("opacity at 200 ms may stay, and a longer fade fails as a heuristic", () => {
  const project = phone();
  const kept = evaluateReducedMotion(project, quiet(project, { opacityDurationMs: 200 }));
  assert.equal(kept.ok, true, kept.problems.join("\n"));
  const none = evaluateReducedMotion(project, quiet(project, { opacityDurationMs: null }));
  assert.equal(none.ok, true, none.problems.join("\n"));
  const long = evaluateReducedMotion(project, quiet(project, { opacityDurationMs: 201 }));
  assert.match(long.problems.join("\n"), /200/);
  assert.match(long.problems.join("\n"), /heuristic/);
});

test("the 3D still matches the scene camera, grade, and lighting", () => {
  const project = phone();
  const blank = evaluateReducedMotion(project, quiet(project, {
    still: { ...pose(), grade: { name: "blank poster", exposure: 1.1 } },
  }));
  assert.match(blank.problems.join("\n"), /art-directed|blank/);
  const shifted = evaluateReducedMotion(project, quiet(project, {
    still: { ...pose(), camera: { fov: 50, position: [0, 1.2, 4], lookAt: [0, 0.8, 0] } },
  }));
  assert.match(shifted.problems.join("\n"), /camera|grade|lighting/);
  const flat = evaluateReducedMotion(project, quiet(project, { has3d: true, scene: null, still: null }));
  assert.match(flat.problems.join("\n"), /still/);
  const brochure = evaluateReducedMotion(project, quiet(project, { has3d: false, scene: null, still: null }));
  assert.equal(brochure.ok, true, brochure.problems.join("\n"));
});

test("a phone width keeps the picture and is not reduced motion", () => {
  const projects = buildDeviceMatrix(fixtureMap());
  const width = projects.find((item) => item.id === "width-390");
  assert.ok(width);
  assert.equal(width.context.viewport.width, 390);
  const moving = evaluateReducedMotion(width, quiet(width, {
    prefersReducedMotion: false,
    parallax: true,
    scrub: true,
    cameraMoving: true,
    autoplay: true,
    canvasLoopStarted: true,
    pinned: true,
    opacityDurationMs: 800,
    has3d: true,
    still: null,
  }));
  assert.equal(moving.ok, true, moving.problems.join("\n"));
  assert.equal(moving.reduced, false);
  const classified = evaluateReducedMotion(width, quiet(width, {
    prefersReducedMotion: false,
    treatedWidthAsReducedMotion: true,
    canvasLoopStarted: false,
  }));
  assert.match(classified.problems.join("\n"), /width/);
  assert.match(classified.problems.join("\n"), /reduced/);
  const poster = evaluateReducedMotion(width, quiet(width, {
    prefersReducedMotion: false,
    widthSelectedStill: true,
    canvasLoopStarted: false,
  }));
  assert.match(poster.problems.join("\n"), /still/);
  assert.match(poster.problems.join("\n"), /width/);
});

test("the sample width has to match the device project", () => {
  const project = phone();
  const wrong = evaluateReducedMotion(project, quiet(project, { viewportWidth: 400 }));
  assert.match(wrong.problems.join("\n"), /400/);
  assert.match(wrong.problems.join("\n"), /393/);
});

test("installed devices include a WebKit reduced-motion project", () => {
  const projects = buildDeviceMatrix(devices as unknown as DeviceMap);
  const report = runReducedMotion(projects, (project) => quiet(project));
  assert.equal(report.ok, true, report.problems.join("\n"));
  const ios = projects.find((item) => item.id === "iphone-15");
  assert.ok(ios);
  assert.equal(ios.browser, "webkit");
  assert.equal(ios.p0Phone, true);
});

test("width and core count do not select the tier-0 still", () => {
  const webgl = readFileSync(path.join(here, "..", "..", "templates", "shared", "webgl.ts"), "utf8");
  assert.doesNotMatch(webgl, /viewportWidth\s*<=\s*430/);
  assert.doesNotMatch(webgl, /cores\s*<=\s*4/);
  assert.match(webgl, /contextLosses/);
  assert.match(webgl, /tierOverride/);
  const index = readFileSync(path.join(here, "..", "src", "index.ts"), "utf8");
  assert.match(index, /evaluateReducedMotion/);
  assert.match(index, /posesMatch/);
  assert.match(index, /classifyMotion/);
  assert.match(index, /judgePhoneScene/);
});

function scene(over: Partial<PhoneSceneSample> = {}): PhoneSceneSample {
  return {
    webgl: true,
    posterPresent: true,
    rendersWhen3dOff: true,
    longestLongTaskMs: 40,
    slowestFrameMs: 16,
    brief: phonePerformanceBudget(),
    ...over,
  };
}

test("the phone budget names the long-task and frame lines", () => {
  const block = phonePerformanceBudget();
  assert.match(block, /long task on the phone stays at or under 200 ms/);
  assert.match(block, /45 frames a second/);
  assert.equal(PHONE_LONG_TASK_MAX_MS, 200);
  assert.equal(PHONE_FRAME_MAX_MS, 1000 / 45);
  assert.equal(block.includes("!"), false);
});

test("a WebGL scene needs a poster, the phone plan, and a page that still renders", () => {
  assert.equal(judgePhoneScene(scene()).status, "PASS");
  const poster = judgePhoneScene(scene({ posterPresent: false }));
  assert.equal(poster.status, "BLOCKER");
  assert.match(poster.problems.map((item) => item.reason).join(" "), /still picture/);
  const plan = judgePhoneScene(scene({ brief: "No WebGL on phones." }));
  assert.equal(plan.status, "BLOCKER");
  assert.match(plan.problems.map((item) => item.reason).join(" "), /phone plan/);
  const missing = judgePhoneScene(scene({ brief: "A towel shop." }));
  assert.equal(missing.status, "BLOCKER");
});

test("the scene turned off still has to render, and a slow phone is a fix", () => {
  const off = judgePhoneScene(scene({ webgl: false, posterPresent: false, brief: "", rendersWhen3dOff: true }));
  assert.equal(off.status, "PASS");
  const blank = judgePhoneScene(scene({ webgl: false, rendersWhen3dOff: false }));
  assert.equal(blank.status, "BLOCKER");
  assert.match(blank.problems.map((item) => item.reason).join(" "), /turned off/);
  const slow = judgePhoneScene(scene({ longestLongTaskMs: PHONE_LONG_TASK_MAX_MS + 1, slowestFrameMs: PHONE_FRAME_MAX_MS + 0.1 }));
  assert.equal(slow.status, "FIX");
  assert.equal(slow.problems.every((item) => item.gate === "motion"), true);
  const edge = judgePhoneScene(scene({ longestLongTaskMs: PHONE_LONG_TASK_MAX_MS, slowestFrameMs: PHONE_FRAME_MAX_MS }));
  assert.equal(edge.status, "PASS");
});
