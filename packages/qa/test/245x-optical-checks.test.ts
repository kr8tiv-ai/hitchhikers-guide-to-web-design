/**
 * 245x. Optical checks turn collected facts into findings with a one-line
 * fix. No browser, no network, no grok. The runner is given a fake collector.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { defaultConfig, loadConfig, parseConfig } from "@hitchhiker/engine";
import { SUMMARY_MAX_BYTES, summaryForModel, type CollectedFacts, type Finding } from "../src/cdp-assertions.ts";
import { runCdpAssertions } from "../src/cdp-runner.ts";
import {
  evaluateOptical,
  opticalFixInstructions,
  opticalMotionFromReading,
  opticalStateFromStyles,
  reducedMotionReading,
  type OpticalFacts,
} from "../src/optical-checks.ts";
import { removeTempDir } from "./remove-temp.ts";

const TIMEOUT = 5_000;

const DESIGN = `---
name: "Sample"
colors:
  ink: "#1a1a1a"
typography:
  display:
    fontFamily: "General Sans"
    fontSize: "64px"
  body:
    fontFamily: "Satoshi"
    fontSize: "18px"
spacing:
  space-4: "16px"
---

## Layout

Baseline unit: 4px.
- poster: breaks-grid
- hero: centred: intentional
`;

function cleanFacts(width: number, optical?: OpticalFacts): CollectedFacts {
  return {
    url: "http://127.0.0.1:4599/",
    width,
    styles: [],
    boxes: { scrollWidth: width, clientWidth: width, interactives: [], texts: [], taps: [] },
    interactions: [],
    axe: [],
    ...(optical !== undefined ? { optical } : {}),
  };
}

function kinds(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.kind);
}

test("a headline with a leading quote is flagged with a nudge and a balanced headline passes", { timeout: TIMEOUT }, () => {
  const quoted = evaluateOptical(
    {
      centring: [
        {
          selector: "h1.hero__title",
          text: "\u201CStay awhile",
          boxLeft: 200,
          boxWidth: 400,
          inkLeft: 201,
          inkWidth: 380,
          centred: true,
          fontSizePx: 75,
        },
      ],
    },
    { width: 1440, designMd: DESIGN },
  );
  const hit = quoted.fixes.find((finding) => finding.kind === "optical.centring");
  assert.ok(hit);
  assert.equal(hit.selector, "h1.hero__title");
  assert.match(hit.detail, /mathematically centred/);
  assert.match(hit.detail, /9px left of centre/);
  assert.match(hit.detail, /opening quote/);
  assert.match(hit.detail, /text-indent: -0\.12em/);
  assert.match(hit.detail, /hanging-punctuation: first/);
  assert.equal(quoted.blockers.length, 0);

  const balanced = evaluateOptical({
    centring: [
      {
        selector: "h1.hero__title",
        text: "Stay awhile",
        boxLeft: 200,
        boxWidth: 400,
        inkLeft: 210,
        inkWidth: 380,
        centred: true,
        fontSizePx: 75,
      },
    ],
  });
  assert.equal(kinds(balanced.fixes).includes("optical.centring"), false);
  assert.equal(kinds(balanced.blockers).includes("optical.centring"), false);
});

test("body lines off the 4px baseline are flagged and a breaks-grid section is skipped", { timeout: TIMEOUT }, () => {
  const result = evaluateOptical(
    {
      baselines: [
        { selector: "p.story", sectionId: "story", lineHeightPx: 22, lineTops: [0, 22, 44] },
        { selector: "p.poster", sectionId: "poster", lineHeightPx: 22, lineTops: [0, 22, 44] },
        { selector: "p.even", sectionId: "essay", lineHeightPx: 24, lineTops: [0, 24, 48] },
      ],
    },
    { designMd: DESIGN, baselineUnit: 4 },
  );
  const hit = result.fixes.find((finding) => finding.kind === "optical.baseline");
  assert.ok(hit);
  assert.equal(hit.selector, "p.story");
  assert.match(hit.detail, /4px/);
  assert.equal(
    result.fixes.some((finding) => finding.selector === "p.poster"),
    false,
  );
  assert.equal(
    result.fixes.some((finding) => finding.selector === "p.even"),
    false,
  );
  assert.equal(result.blockers.length, 0);
});

test("64px display text at default tracking is a fix and -0.02em passes", { timeout: TIMEOUT }, () => {
  const loose = evaluateOptical(
    {
      tracking: [
        { selector: "h1.display", fontSizePx: 64, letterSpacing: "normal", textTransform: "none" },
        { selector: "span.eyebrow", fontSizePx: 12, letterSpacing: "normal", textTransform: "uppercase" },
      ],
    },
    { width: 1440 },
  );
  const display = loose.fixes.find((finding) => finding.selector === "h1.display");
  assert.ok(display);
  assert.equal(display.kind, "optical.tracking");
  assert.match(display.detail, /set tracking from the type scale, e\.g\. -0\.02em/);
  assert.equal(display.expected.includes("-0.02em"), true);
  const caps = loose.fixes.find((finding) => finding.selector === "span.eyebrow");
  assert.ok(caps);
  assert.match(caps.detail, /positive tracking/);
  assert.equal(loose.blockers.length, 0);

  const tight = evaluateOptical(
    {
      tracking: [{ selector: "h1.display", fontSizePx: 64, letterSpacing: "-0.02em", textTransform: "none" }],
    },
    { width: 1440 },
  );
  assert.equal(kinds(tight.fixes).includes("optical.tracking"), false);
  assert.equal(kinds(tight.blockers).includes("optical.tracking"), false);
});

test("three consecutive purely centred sections is a blocker, an offset column passes, and centred: intentional passes", { timeout: TIMEOUT }, () => {
  const pure = (sectionId: string, hasOffset = false) => ({
    sectionId,
    selector: `section.${sectionId}`,
    contentLeft: 120,
    contentRight: 1320,
    containerLeft: 0,
    containerRight: 1440,
    centredText: true,
    hasOffset,
  });
  const run = evaluateOptical(
    { symmetry: [pure("one"), pure("two"), pure("three")] },
    { width: 1440, designMd: DESIGN },
  );
  assert.equal(run.blockers.length, 1);
  const blocker = run.blockers[0];
  assert.ok(blocker);
  assert.equal(blocker.kind, "optical.symmetry");
  assert.match(blocker.actual, /purely centred, no asymmetric breathing room/);
  assert.match(blocker.selector, /section\.one/);
  assert.match(blocker.selector, /section\.three/);
  assert.equal(run.fixes.length, 0);

  const offset = evaluateOptical({ symmetry: [pure("media", true)] }, { width: 1440 });
  assert.equal(kinds(offset.blockers).includes("optical.symmetry"), false);
  assert.equal(kinds(offset.fixes).includes("optical.symmetry"), false);

  const intentional = evaluateOptical({ symmetry: [pure("hero"), pure("hero-b"), pure("hero-c")] }, {
    width: 1440,
    designMd: DESIGN,
    centredIntentional: ["hero", "hero-b", "hero-c"],
  });
  assert.equal(kinds(intentional.blockers).includes("optical.symmetry"), false);
  assert.equal(kinds(intentional.fixes).includes("optical.symmetry"), false);
});

test("a UA focus ring is a fix, a link with no visible focus is a blocker, and a designed hover passes", { timeout: TIMEOUT }, () => {
  const button = opticalStateFromStyles({
    selector: "button.buy",
    visible: true,
    rest: { "outline-style": "none", "background-color": "rgb(0, 0, 0)", color: "rgb(255, 255, 255)" },
    hover: { "outline-style": "none", "background-color": "rgb(20, 20, 20)", color: "rgb(255, 255, 255)" },
    focus: {
      "outline-style": "auto",
      "outline-color": "rgb(0, 95, 204)",
      "background-color": "rgb(0, 0, 0)",
      color: "rgb(255, 255, 255)",
    },
  });
  const ring = evaluateOptical({ states: [button] });
  const ringHit = ring.fixes.find((finding) => finding.kind === "optical.states");
  assert.ok(ringHit);
  assert.equal(ringHit.selector, "button.buy");
  assert.match(ringHit.detail, /browser default focus ring|UA outline/);
  assert.equal(ring.blockers.length, 0);

  const link = opticalStateFromStyles({
    selector: "a.more",
    visible: true,
    rest: { color: "rgb(0, 0, 0)", "outline-style": "none" },
    hover: { color: "rgb(40, 90, 60)", "outline-style": "none" },
    focus: { color: "rgb(0, 0, 0)", "outline-style": "none" },
  });
  const missing = evaluateOptical({ states: [link] });
  const missingHit = missing.blockers.find((finding) => finding.kind === "optical.states");
  assert.ok(missingHit);
  assert.equal(missingHit.selector, "a.more");
  assert.match(missingHit.actual, /no visible focus/);

  const designed = opticalStateFromStyles({
    selector: "a.nav",
    visible: true,
    rest: { color: "rgb(0, 0, 0)", "box-shadow": "none", "outline-style": "none" },
    hover: { color: "rgb(40, 90, 60)", "box-shadow": "none", "outline-style": "none" },
    focus: { color: "rgb(0, 0, 0)", "box-shadow": "0 0 0 2px rgb(47, 107, 79)", "outline-style": "none" },
  });
  const pass = evaluateOptical({ states: [designed] });
  assert.deepEqual(pass.blockers, []);
  assert.deepEqual(pass.fixes, []);
});

test("reduced motion left at opacity 0 is a blocker and a static designed fallback passes", { timeout: TIMEOUT }, () => {
  const hidden = opticalMotionFromReading({
    selector: ".hero__title",
    animates: true,
    reduced: reducedMotionReading({
      present: true,
      opacity: 0,
      display: "block",
      visibility: "visible",
      x: 40,
      y: 80,
      width: 320,
      height: 72,
      viewportWidth: 1440,
      viewportHeight: 900,
      text: "Stay awhile",
      backgroundColor: "rgb(10, 10, 10)",
      borderTopWidth: "0px",
      hasMedia: false,
    }),
  });
  const blocked = evaluateOptical({ motion: [hidden] });
  const hit = blocked.blockers.find((finding) => finding.kind === "optical.reducedMotion");
  assert.ok(hit);
  assert.equal(hit.selector, ".hero__title");
  assert.match(hit.actual, /opacity 0/);
  assert.match(hit.detail, /opacity 1/);

  const fallback = opticalMotionFromReading({
    selector: ".hero__title",
    animates: true,
    reduced: reducedMotionReading({
      present: true,
      opacity: 1,
      display: "block",
      visibility: "visible",
      x: 40,
      y: 80,
      width: 320,
      height: 72,
      viewportWidth: 1440,
      viewportHeight: 900,
      text: "Stay awhile",
      backgroundColor: "rgb(10, 10, 10)",
      borderTopWidth: "0px",
      hasMedia: false,
    }),
  });
  const passed = evaluateOptical({ motion: [fallback] });
  assert.deepEqual(passed.blockers, []);
  assert.deepEqual(passed.fixes, []);
});

test("the summary lists OPTICAL lines after FIXES and stays under the cap", { timeout: TIMEOUT }, () => {
  const instruction =
    "h1.hero__title is mathematically centred; ink sits 9px left of centre because of the opening quote; shift with text-indent: -0.12em or hanging-punctuation: first";
  const report = evaluateOptical(
    {
      centring: [
        {
          selector: "h1.hero__title",
          text: "\u201CStay awhile",
          boxLeft: 200,
          boxWidth: 400,
          inkLeft: 201,
          inkWidth: 380,
          centred: true,
          fontSizePx: 75,
        },
      ],
    },
    { width: 1440 },
  );
  const summary = summaryForModel(
    [{ kind: "style.font-family", selector: "h1.hero__title", actual: "Syne", expected: "General Sans", detail: "font" }],
    report.fixes,
  );
  const fixesAt = summary.indexOf("\nFIXES\n");
  const opticalAt = summary.indexOf("\nOPTICAL\n");
  assert.ok(fixesAt > summary.indexOf("BLOCKERS"));
  assert.ok(opticalAt > fixesAt);
  assert.match(summary.slice(opticalAt), /text-indent: -0\.12em/);
  assert.equal(summary.slice(0, opticalAt).includes(instruction), false);
  assert.equal(opticalFixInstructions({ blockers: [], fixes: report.fixes }), instruction);
  assert.ok(Buffer.byteLength(summary, "utf8") <= SUMMARY_MAX_BYTES);

  const many: Finding[] = [];
  for (let index = 0; index < 80; index += 1) {
    many.push({
      kind: "optical.centring",
      selector: `h1.n-${index}`,
      actual: "9px left",
      expected: "centred",
      detail: `h1.n-${index} is mathematically centred; ${"ink ".repeat(40)}`,
    });
  }
  const flooded = summaryForModel([], many);
  assert.ok(Buffer.byteLength(flooded, "utf8") <= SUMMARY_MAX_BYTES);
  assert.match(flooded, /Omitted \d+ lines/);
});

test("runCdpAssertions merges optical findings and base-only skips them", { timeout: TIMEOUT }, async () => {
  const optical: OpticalFacts = {
    tracking: [{ selector: "h1.display", fontSizePx: 64, letterSpacing: "normal", textTransform: "none" }],
  };
  const seen: string[][] = [];
  const both = await runCdpAssertions({
    baseUrl: "http://127.0.0.1:4599",
    pages: [{ path: "/", sections: [] }],
    scope: "page",
    designMd: DESIGN,
    widths: [1440],
    collect: async (request) => {
      seen.push([...(request.checks ?? [])]);
      return cleanFacts(request.width, optical);
    },
  });
  assert.deepEqual(seen[0], ["base", "optical"]);
  const report = both.reports[0];
  assert.ok(report);
  assert.equal(report.passed, true);
  const tracking = report.fixes.find((finding) => finding.kind === "optical.tracking");
  assert.ok(tracking);
  assert.match(report.summaryForModel, /\nOPTICAL\n/);
  assert.equal(
    opticalFixInstructions(report),
    tracking.detail,
  );
  assert.match(both.summaryForModel, /\nOPTICAL\n/);

  const heroSeen: string[][] = [];
  await runCdpAssertions({
    baseUrl: "http://127.0.0.1:4599",
    pages: ["/"],
    scope: "hero",
    designMd: DESIGN,
    widths: [1440],
    collect: async (request) => {
      heroSeen.push([...(request.checks ?? [])]);
      return cleanFacts(request.width);
    },
  });
  assert.deepEqual(heroSeen[0], ["base", "optical"]);

  const baseOnly = await runCdpAssertions({
    baseUrl: "http://127.0.0.1:4599",
    pages: [{ path: "/", sections: [] }],
    scope: "page",
    designMd: DESIGN,
    widths: [1440],
    checks: ["base"],
    collect: async (request) => cleanFacts(request.width, optical),
  });
  const baseReport = baseOnly.reports[0];
  assert.ok(baseReport);
  assert.equal(
    [...baseReport.blockers, ...baseReport.fixes].some((finding) => finding.kind.startsWith("optical.")),
    false,
  );
  assert.equal(opticalFixInstructions(baseReport), "");
});

test("design.optical loads through the config loader", { timeout: TIMEOUT }, () => {
  const defaults = defaultConfig().design.optical;
  assert.deepEqual(defaults, { enabled: true, baselineUnit: 4, centringTolerance: 0.015 });
  const parsed = parseConfig({
    design: { optical: { enabled: false, baselineUnit: 8, centringTolerance: 0.02 } },
  });
  assert.equal(parsed.design.minReferenceImages, 6);
  assert.equal(parsed.design.optical.enabled, false);
  assert.equal(parsed.design.optical.baselineUnit, 8);
  assert.equal(parsed.design.optical.centringTolerance, 0.02);
  const partial = parseConfig({ design: { minReferenceImages: 5 } });
  assert.equal(partial.design.optical.enabled, true);
  assert.equal(partial.design.optical.baselineUnit, 4);
  assert.equal(partial.design.optical.centringTolerance, 0.015);

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-optical-"));
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch);
    writeFileSync(
      path.join(hitch, "config.json"),
      `${JSON.stringify({ design: { optical: { enabled: true, baselineUnit: 4, centringTolerance: 0.015 } } })}\n`,
      "utf8",
    );
    assert.deepEqual(loadConfig(dir).design.optical, defaults);
  } finally {
    removeTempDir(dir);
  }
});
