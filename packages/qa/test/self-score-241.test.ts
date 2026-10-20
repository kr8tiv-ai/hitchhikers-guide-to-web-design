import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "@hitchhiker/engine";
import { devices } from "playwright";
import { buildDeviceMatrix, type DeviceDescriptor, type DeviceMap, type DeviceProject } from "../src/device-matrix.ts";
import { applyFixLoop } from "../src/fix-prompts.ts";
import { loadInstalledPresets, printDesktopThrottling, type LhPreset } from "../src/lighthouse-preset.ts";
import type { DevicePerformanceInput, DeviceRunInput } from "../src/performance-gate.ts";
import { OPACITY_KEEP_MS, type ReducedSample, type TierZeroStill } from "../src/reduced-motion.ts";
import { renderSelfScore } from "../src/report.ts";
import { readHeadings, scoreSelf, selfScoreVerdict, type SelfScoreInput } from "../src/self-score.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const floors = defaultConfig().gates;
const se = devices["iPhone SE"];
assert.ok(se?.viewport, "installed Playwright iPhone SE descriptor");
const seViewport = se.viewport;

const HTML = [
  "<nav>",
  '<button type="button">Menu</button>',
  '<a href="/" aria-current="page">Work</a>',
  '<a href="/about">About</a>',
  "</nav>",
  "<footer>",
  '<p class="wordmark">North</p>',
  '<p class="colophon">Set in the brand type.</p>',
  '<a href="#top">Top</a>',
  "<p>Type and imagery credits.</p>",
  '<a href="/contact">Contact</a>',
  "</footer>",
].join("");

const CSS = "footer { padding-bottom: env(safe-area-inset-bottom); }";

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

function phone(): DeviceProject {
  const found = buildDeviceMatrix(fixtureMap()).find((item) => item.p0Phone && item.browser === "webkit");
  assert.ok(found);
  return found;
}

function quiet(project: DeviceProject): ReducedSample {
  return {
    projectId: project.id,
    viewportWidth: project.context.viewport.width,
    prefersReducedMotion: true,
    sections: [{ id: "hero", text: "The valley holds", image: "/still.jpg" }],
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
  };
}

function lhReport(performance = 0.95) {
  return {
    categories: {
      performance: { score: performance },
      accessibility: { score: 0.96 },
      "best-practices": { score: 0.97 },
      seo: { score: 0.98 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 1800 },
      "cumulative-layout-shift": { numericValue: 0.02 },
      "total-blocking-time": { numericValue: 80 },
    },
  };
}

function run(preset: LhPreset): DeviceRunInput {
  return {
    lighthouse: lhReport(0.95),
    formFactor: preset.formFactor,
    viewport: {
      width: preset.screenEmulation.width,
      height: preset.screenEmulation.height,
      deviceScaleFactor: preset.screenEmulation.deviceScaleFactor,
    },
    tbtLimitMs: preset.tbtGoodMs,
    inpSampleMs: null,
  };
}

async function base(): Promise<SelfScoreInput> {
  const presets = await loadInstalledPresets();
  const mobile = presets.find((item) => item.id === "mobile");
  const desktop = presets.find((item) => item.id === "desktop");
  const tablet = presets.find((item) => item.id === "tablet");
  assert.ok(mobile && desktop && tablet);
  const project = phone();
  const devicesInput: DevicePerformanceInput = {
    floors,
    heavy: false,
    mobile: run(mobile),
    desktop: run(desktop),
    tablet: run(tablet),
    webgl: true,
    markup: '<img src="poster.webp" alt="" width="1440" height="900" fetchpriority="high"><canvas></canvas>',
    desktopThrottling: printDesktopThrottling(desktop.throttling),
  };
  return {
    nav: {
      navFamily: "Boska",
      brandFamilies: ["Boska", "General Sans"],
      namedFamilies: [],
      currentMark: "aria",
      html: HTML,
      css: CSS,
      tabOrder: ["Work", "About", "Contact"],
      visualOrder: ["Work", "About", "Contact"],
      navTargets: [{ name: "Work", width: 44, height: 44 }],
      phoneButton: { name: "Menu", width: 44, height: 44 },
      pointer: "coarse",
      barHides: false,
      recallTarget: null,
      barCoversFocused: false,
      menuOpened: true,
      menuEscapeClosed: true,
      footerLinks: ["#top", "/contact"],
      footerLinksReached: ["#top", "/contact"],
      focusRingVisible: true,
      footerInk: "#f4f1ea",
      footerPaper: "#1a1a1a",
    },
    palette: { enabled: true, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } },
    devices: devicesInput,
    coldLoadId: "mobile",
    headingsHtml: "<h1>North</h1>",
    sweep: { descriptorKey: "iPhone SE", viewport: { width: seViewport.width, height: seViewport.height }, overflow: false },
    motionProjects: [project],
    motionSamples: [quiet(project)],
    creativity: 9,
    shots: [],
  };
}

test("readHeadings counts h1 text and treats a blank heading as empty", () => {
  assert.deepEqual(readHeadings("<h1>North</h1>"), { count: 1, empty: false });
  assert.deepEqual(readHeadings("<h1>One</h1><h1>Two</h1>"), { count: 2, empty: false });
  assert.deepEqual(readHeadings("<h1> </h1>"), { count: 1, empty: true });
  assert.deepEqual(readHeadings("<p>No heading</p>"), { count: 0, empty: true });
});

test("a clean fixture reports four scores, the mobile lab, and three fixes", async () => {
  const report = await scoreSelf(await base());
  assert.equal(report.status, "PASS", report.reasons.join("\n"));
  assert.deepEqual(report.criteria.map((item) => item.id), ["design", "usability", "creativity", "content"]);
  assert.deepEqual(report.criteria.map((item) => item.weight), [40, 30, 20, 10]);
  assert.equal(report.criteria[0]?.score, 10);
  assert.equal(report.criteria[2]?.score, 9);
  assert.equal(report.coldLoad, "mobile");
  assert.equal(report.sweep.width, seViewport.width);
  assert.equal(report.sweep.height, seViewport.height);
  assert.equal(report.lab.lcpMs, 1800);
  assert.equal(report.lab.cls, 0.02);
  assert.equal(report.lab.inpSampleMs, null);
  assert.match(report.lab.line, /INP was not sampled/);
  assert.match(report.lab.line, /TBT is 80 ms/);
  assert.deepEqual(report.fixes, [
    "Keep LCP at 1800 ms.",
    "Keep CLS at 0.02.",
    "INP was not sampled. TBT is 80 ms.",
  ]);
  assert.equal(report.juryStatus, "PASS");
  const markdown = renderSelfScore(report);
  for (const heading of ["## Design", "## Usability", "## Creativity", "## Content", "## Lab", "## Fixes", "## Overall"]) {
    assert.ok(markdown.includes(heading), heading);
  }
  assert.match(markdown, /Cold load uses the mobile preset/);
  assert.match(markdown, new RegExp(`Sweep iPhone SE at ${seViewport.width} by ${seViewport.height}`));
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("$"), false);
  assert.equal(markdown.includes("<"), false);
  assert.equal(markdown.includes("\u2014"), false);
  assert.equal(/award/i.test(markdown), false);
});

test("an accent that covers half the page flags design and does not block", async () => {
  const input = await base();
  input.palette = { enabled: true, shares: { dominant: 0.3, secondary: 0.2, accent: 0.5 } };
  const report = await scoreSelf(input);
  assert.equal(report.status, "PASS");
  assert.equal(report.criteria[0]?.score, 7);
  assert.equal(report.juryStatus, "PASS");
  assert.equal(report.juryTotal, 86);
  assert.match(report.fixes[0] ?? "", /Accent covers half the page/);
  assert.match(report.fixes[1] ?? "", /Keep LCP/);
  assert.match(report.fixes[2] ?? "", /Keep CLS/);
  assert.equal(report.fixes.some((item) => /Creativity/.test(item)), false);
  const verdict = selfScoreVerdict(report, 0);
  assert.equal(verdict.verdict, "PASS");
  assert.equal(verdict.fixes.length, 3);
});

test("equal design deductions break ties by the fix text", async () => {
  const input = await base();
  input.nav = { ...input.nav, navFamily: "Fraunces", html: input.nav.html.replace('class="wordmark"', 'class="mark"') };
  const report = await scoreSelf(input);
  assert.equal(report.status, "PASS", report.reasons.join("\n"));
  assert.match(report.fixes[0] ?? "", /^Nav type is Fraunces/);
  assert.match(report.fixes[1] ?? "", /wordmark/);
  assert.match(report.fixes[2] ?? "", /Keep LCP/);
});

test("a scripted INP sample is kept, and a missing sample is not a failure", async () => {
  const input = await base();
  input.devices = { ...input.devices, mobile: { ...input.devices.mobile, inpSampleMs: 120 } };
  const report = await scoreSelf(input);
  assert.equal(report.status, "PASS", report.reasons.join("\n"));
  assert.equal(report.fixes[2], "Keep INP at 120 ms.");
  assert.match(report.lab.line, /INP is 120 ms/);
});

test("device performance, headings, the sweep, cold load, and reduced motion block", async () => {
  const low = await base();
  const desktop = low.devices.desktop.lighthouse as { categories: { performance: { score: number } } };
  desktop.categories.performance.score = 0.4;
  const device = await scoreSelf(low);
  assert.equal(device.status, "BLOCKER");
  assert.equal(device.juryStatus, "FAIL");
  assert.ok(device.juryTotal >= 70);
  assert.match(device.fixes[0] ?? "", /Desktop performance is 40/);
  const headings = await scoreSelf({ ...(await base()), headingsHtml: "<h1>One</h1><h1>Two</h1>" });
  assert.equal(headings.status, "BLOCKER");
  assert.match(headings.reasons.join(" "), /2 h1 headings/);
  const blank = await scoreSelf({ ...(await base()), headingsHtml: "<h1></h1>" });
  assert.equal(blank.status, "BLOCKER");
  assert.match(blank.reasons.join(" "), /heading is empty/);
  assert.equal(blank.criteria[3]?.score, 7);
  const wrong = await base();
  wrong.sweep = { ...wrong.sweep, descriptorKey: "Pixel 7" };
  const sweep = await scoreSelf(wrong);
  assert.equal(sweep.status, "BLOCKER");
  assert.match(sweep.reasons.join(" "), /iPhone SE descriptor is required/);
  const overflow = await base();
  overflow.sweep = { ...overflow.sweep, overflow: true };
  assert.match((await scoreSelf(overflow)).reasons.join(" "), /overflows/);
  const cold = await scoreSelf({ ...(await base()), coldLoadId: "desktop" });
  assert.equal(cold.status, "BLOCKER");
  assert.match(cold.fixes[0] ?? "", /phone preset is required/);
  const motion = await base();
  const sample = motion.motionSamples[0];
  assert.ok(sample);
  motion.motionSamples = [{ ...sample, parallax: true }];
  assert.match((await scoreSelf(motion)).reasons.join(" "), /parallax/);
  const none = await scoreSelf({ ...(await base()), motionProjects: [] });
  assert.equal(none.status, "BLOCKER");
  assert.match(none.reasons.join(" "), /Reduced motion was not measured/);
});

test("a text-only beauty shot lowers design and a creativity score under 8 is a fix", async () => {
  const input = await base();
  input.shots = [
    {
      page: "home",
      section: "hero",
      score: 9,
      reason: "quiet",
      textOnly: true,
      todoImage: false,
      placeholderImage: false,
      slop: "",
      screenshot: "shots/hero.png",
    },
  ];
  const beauty = await scoreSelf(input);
  assert.equal(beauty.status, "PASS");
  assert.equal(beauty.criteria[0]?.score, 8);
  assert.match(beauty.fixes[0] ?? "", /Text only/);
  const low = await scoreSelf({ ...(await base()), creativity: 5 });
  assert.equal(low.status, "PASS");
  assert.equal(low.criteria[2]?.score, 5);
  assert.match(low.fixes[0] ?? "", /Creativity is 5 out of 10/);
});

test("a blocker feeds three fixes into the remediation loop", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-self-score-"));
  try {
    const blocked = await scoreSelf({
      ...(await base()),
      sweep: { descriptorKey: "iPhone SE", viewport: { width: seViewport.width, height: seViewport.height }, overflow: true },
    });
    assert.equal(selfScoreVerdict(blocked, 0).verdict, "FIX");
    assert.equal(selfScoreVerdict(blocked, 2).verdict, "ESCALATE");
    const loop = await applyFixLoop({
      projectDir: dir,
      initial: selfScoreVerdict(blocked, 0),
      nextReview: async (round) => selfScoreVerdict(await scoreSelf(await base()), round),
      runPrompt: async () => 0,
    });
    assert.equal(loop.verdict, "PASS");
    assert.equal(loop.roundsRun, 1);
    assert.equal(loop.filesWritten.length, 3);
    const body = readFileSync(loop.filesWritten[0] ?? "", "utf8");
    assert.match(body, /overflows/);
    assert.equal(body.includes("!"), false);
    const clean = selfScoreVerdict(await scoreSelf(await base()), 0);
    const skipped = await applyFixLoop({
      projectDir: dir,
      initial: clean,
      nextReview: async (round) => selfScoreVerdict(await scoreSelf(await base()), round),
      runPrompt: async () => 0,
    });
    assert.equal(skipped.roundsRun, 0);
    assert.equal(skipped.filesWritten.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the self-score calls the gates and does not invent the SE width or call a model", () => {
  const source = readFileSync(path.join(here, "..", "src", "self-score.ts"), "utf8");
  const report = readFileSync(path.join(here, "..", "src", "report.ts"), "utf8");
  assert.equal(/\b320\b/.test(source), false);
  assert.equal(/\b320\b/.test(report), false);
  assert.match(source, /loadInstalledPresets/);
  assert.match(source, /evaluateDevicePerformance/);
  assert.match(source, /evaluateNavFooter/);
  assert.match(source, /checkPaletteProportion/);
  assert.match(source, /judgeBeauty/);
  assert.match(source, /runReducedMotion/);
  assert.match(source, /jury\(/);
  assert.equal(/from "playwright"|child_process|puppeteer|grok-4|imagine/i.test(source), false);
});
