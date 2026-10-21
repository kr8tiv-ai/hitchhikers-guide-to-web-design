/**
 * Spec 243 gate registry. Fails when a dimension is missing, when GATES.json
 * loses its shape, or when a reason uses internal jargon.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { jargonHits } from "@hitchhiker/engine";
import { EMULATION_LIMITS, type DeviceProject, type MatrixHooks } from "../src/device-matrix.ts";
import {
  GATE_IDS,
  GATE_REGISTRY,
  gatesJsonPath,
  runAllGates,
  type GateId,
  type GateReport,
  type GateResult,
  type GateRunners,
} from "../src/gates/registry.ts";
import { GATE_IDS as exportedIds, runAllGates as exportedRun } from "../src/index.ts";
import { OPACITY_KEEP_MS, type ReducedSample, type TierZeroStill } from "../src/reduced-motion.ts";

/** The eleven dimensions in spec 243. Motion and 3D are the motion-3d pair. Device is mobile/device. */
const SPEC_DIMENSIONS = [
  "fonts",
  "type-scale",
  "spacing",
  "color",
  "imagery",
  "motion",
  "3d",
  "copy",
  "device",
  "accessibility",
  "speed",
] as const satisfies readonly GateId[];

const WRAPPED_MODULES = [
  "type-gate.ts",
  "palette-proportion.ts",
  "imagery-grade.ts",
  "reduced-motion.ts",
  "antislop.ts",
  "device-matrix.ts",
  "a11y-gate.ts",
  "lighthouse-gate.ts",
  "weight-gate.ts",
  "console-gate.ts",
  "link-check.ts",
] as const;

const TECHNICAL =
  /\b(?:webkit|woff2|axe|lighthouse|viewport|chromium|wcag|hotlink|font-display|lenis|playwright)\b/i;

test("the registry lists every spec dimension once", () => {
  assert.equal(SPEC_DIMENSIONS.length, 11);
  assert.deepEqual(GATE_IDS, SPEC_DIMENSIONS);
  assert.equal(new Set(GATE_IDS).size, SPEC_DIMENSIONS.length);
  assert.deepEqual(
    GATE_REGISTRY.map((entry) => entry.id),
    SPEC_DIMENSIONS,
  );
  const wrapped = GATE_REGISTRY.flatMap((entry) => [...entry.modules]);
  for (const file of WRAPPED_MODULES) {
    assert.equal(wrapped.includes(file), true, file);
  }
  assert.deepEqual(
    GATE_REGISTRY.find((entry) => entry.id === "spacing")?.modules,
    [],
  );
  assert.equal(exportedRun, runAllGates);
  assert.deepEqual(exportedIds, GATE_IDS);
});

test("runAllGates writes GATES.json for the project commit", { timeout: 30_000 }, async () => {
  const project = tempProject();
  try {
    const report = await runAllGates({ root: project.root }, passingRunners());
    const onDisk = JSON.parse(readFileSync(gatesJsonPath(project.root), "utf8")) as GateReport;
    assert.deepEqual(onDisk, report);
    assert.deepEqual(Object.keys(onDisk).sort(), ["head", "ranAt", "results"]);
    assert.equal(report.head, project.head);
    assert.match(report.ranAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(Number.isNaN(Date.parse(report.ranAt)), false);
    assert.deepEqual(
      report.results.map((item) => item.id),
      [...SPEC_DIMENSIONS],
    );
    for (const item of report.results) {
      assert.deepEqual(Object.keys(item).sort(), ["evidence", "id", "reason", "status"]);
      assert.equal(item.status, "PASS", item.id);
      assert.equal(item.reason.trim().length > 0, true, item.id);
    }
    assert.equal(result(report, "spacing").reason, "not measured yet");
    assertPlain(report);
    const matrix = evidenceOf(result(report, "device")).matrix as { limits?: unknown };
    assert.deepEqual(matrix.limits, [...EMULATION_LIMITS]);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

test("folded gates return FIX or BLOCKER in plain words", { timeout: 30_000 }, async () => {
  const project = tempProject();
  try {
    const font = await runAllGates(
      { root: project.root },
      passingRunners({
        typeAudit: async () => ({
          ok: false,
          problems: ["Headline font is 62000 bytes. Maximum is 40960."],
          samples: [],
        }),
      }),
    );
    assert.equal(result(font, "fonts").status, "FIX");
    assert.equal(result(font, "type-scale").status, "PASS");
    assertPlain(font);
    assert.equal(result(font, "spacing").reason, "not measured yet");

    const scale = await runAllGates(
      { root: project.root },
      passingRunners({
        typeAudit: async () => ({
          ok: false,
          problems: ["Body is 12.00px at 375. Minimum is 16px."],
          samples: [],
        }),
      }),
    );
    assert.equal(result(scale, "type-scale").status, "FIX");
    assert.equal(result(scale, "fonts").status, "PASS");
    assertPlain(scale);

    const color = await runAllGates(
      { root: project.root },
      passingRunners({
        palette: async () => ({ enabled: true, shares: { dominant: 0.6, secondary: 0.3, accent: 0.5 } }),
      }),
    );
    assert.equal(result(color, "color").status, "FIX");
    assert.match(JSON.stringify(result(color, "color").evidence), /Accent covers half the page/);
    assertPlain(color);

    const imagery = await runAllGates(
      { root: project.root },
      passingRunners({
        imagery: async () => [
          { src: "a.jpg", temperature: 0.1, contrast: 0.1, saturation: 0.1 },
          { src: "b.jpg", temperature: 0.9, contrast: 0.9, saturation: 0.9 },
        ],
      }),
    );
    assert.equal(result(imagery, "imagery").status, "FIX");
    assertPlain(imagery);

    const motion = await runAllGates(
      { root: project.root },
      passingRunners({
        motion: async () => ({
          projects: [phoneProject()],
          sampleFor: (item) => quiet(item, { parallax: true }),
        }),
      }),
    );
    assert.equal(result(motion, "motion").status, "FIX");
    assert.equal(result(motion, "3d").status, "PASS");
    assertPlain(motion);

    const three = await runAllGates(
      { root: project.root },
      passingRunners({
        motion: async () => ({
          projects: [phoneProject()],
          sampleFor: (item) => quiet(item, { scene: null, still: null }),
        }),
      }),
    );
    assert.equal(result(three, "3d").status, "BLOCKER");
    assert.equal(result(three, "motion").status, "PASS");
    assertPlain(three);

    const slop = await runAllGates(
      { root: project.root },
      passingRunners({ copyText: async () => "A seamless towel dries on the line." }),
    );
    assert.equal(result(slop, "copy").status, "FIX");
    assertPlain(slop);

    const filler = await runAllGates(
      { root: project.root },
      passingRunners({ copyText: async () => "lorem ipsum sits where the story should be." }),
    );
    assert.equal(result(filler, "copy").status, "BLOCKER");
    assert.match(result(filler, "copy").reason, /filler text/);
    assertPlain(filler);

    const links = await runAllGates(
      { root: project.root },
      passingRunners({
        links: async () => ({ broken: ["/missing"], bytes: 100, pages: [], pass: false }),
      }),
    );
    assert.equal(result(links, "copy").status, "BLOCKER");
    assert.match(result(links, "copy").reason, /link on the page does not open/);
    assertPlain(links);

    const consoleGate = await runAllGates(
      { root: project.root },
      passingRunners({
        console: async () => ({ errors: 2, failedRequests: 1, pass: false }),
      }),
    );
    assert.equal(result(consoleGate, "device").status, "BLOCKER");
    assert.match(result(consoleGate, "device").reason, /errors while it opens/);
    assertPlain(consoleGate);

    const missingPhone = await runAllGates(
      { root: project.root },
      passingRunners({
        device: async () => ({ projects: [desktopOnly()], sections: [], hooks: hooks() }),
      }),
    );
    assert.equal(result(missingPhone, "device").status, "BLOCKER");
    assert.match(result(missingPhone, "device").reason, /did not finish/);
    assertPlain(missingPhone);

    const access = await runAllGates(
      { root: project.root },
      passingRunners({
        a11y: async () => ({
          violations: [],
          hasKeyboardPath: false,
          hasReducedMotion: true,
          contrastRatio: 7,
          motionUsed: false,
        }),
      }),
    );
    assert.equal(result(access, "accessibility").status, "BLOCKER");
    assert.match(result(access, "accessibility").reason, /keyboard/);
    assert.match(JSON.stringify(result(access, "accessibility").evidence), /Keyboard path is missing/);
    assertPlain(access);

    const heavy = await runAllGates(
      { root: project.root },
      passingRunners({
        weight: async () => ({
          title: "Field notes",
          h1Count: 1,
          textLength: 80,
          brokenLinks: [],
          bytes: 9_000_000,
          appetite: 5,
        }),
      }),
    );
    assert.equal(result(heavy, "speed").status, "BLOCKER");
    assert.match(result(heavy, "speed").reason, /size limit/);
    assertPlain(heavy);

    const slow = await runAllGates(
      { root: project.root },
      passingRunners({
        lighthouse: async () => ({
          phone: { performance: 10, accessibility: 95, bestPractices: 95, seo: 95 },
          heavy: false,
          floors: { phonePerfMin: 90, a11yMin: 90, bestPracticesMin: 90, seoMin: 90 },
        }),
      }),
    );
    assert.equal(result(slow, "speed").status, "BLOCKER");
    assert.match(result(slow, "speed").reason, /phone/);
    assert.equal(result(slow, "spacing").reason, "not measured yet");
    assertPlain(slow);
  } finally {
    rmSync(project.root, { recursive: true, force: true });
  }
});

function assertPlain(report: GateReport): void {
  const reasons = report.results.map((item) => item.reason);
  const hits = reasons.flatMap((line) => jargonHits(line).map((hit) => `${hit}: ${line}`));
  assert.deepEqual(hits, []);
  for (const line of reasons) assert.equal(TECHNICAL.test(line), false, line);
}

function result(report: GateReport, id: GateId): GateResult {
  const found = report.results.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

function evidenceOf(item: GateResult): Record<string, unknown> {
  assert.equal(typeof item.evidence, "object");
  assert.ok(item.evidence !== null);
  assert.equal(Array.isArray(item.evidence), false);
  return item.evidence as Record<string, unknown>;
}

function tempProject(): { root: string; head: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-gates-"));
  const hooks = path.join(root, "hooks");
  mkdirSync(hooks);
  writeFileSync(path.join(root, "note.txt"), "notes\n");
  const git = (args: readonly string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init"]);
  git(["add", "note.txt"]);
  git([
    "-c",
    "user.email=hh@localhost",
    "-c",
    "user.name=Hitchhiker",
    "-c",
    "commit.gpgsign=false",
    "-c",
    `core.hooksPath=${hooks.replaceAll("\\", "/")}`,
    "commit",
    "-m",
    "start",
  ]);
  return { root, head: git(["rev-parse", "HEAD"]).trim().toLowerCase() };
}

function phoneProject(): DeviceProject {
  return {
    id: "iphone-15",
    priority: "P0",
    role: "ios-safari",
    browser: "webkit",
    p0Phone: true,
    requestedKey: "iPhone 15",
    descriptorKey: "iPhone 15",
    fallbackNote: null,
    context: {
      userAgent: "test",
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      defaultBrowserType: "webkit",
    },
  };
}

function desktopOnly(): DeviceProject {
  const phone = phoneProject();
  return {
    ...phone,
    id: "desktop-1440",
    priority: "required",
    role: "desktop",
    browser: "chromium",
    p0Phone: false,
    context: {
      ...phone.context,
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      defaultBrowserType: "chromium",
    },
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
  const still = pose();
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
    scene: still,
    still,
    treatedWidthAsReducedMotion: false,
    widthSelectedStill: false,
    ...over,
  };
}

function hooks(): MatrixHooks {
  return {
    engineReady() {
      return undefined;
    },
    screenshot() {
      return Promise.resolve();
    },
    detail() {
      return Promise.resolve();
    },
    scrollStrip() {
      return Promise.resolve();
    },
  };
}

function passingRunners(overrides: Partial<GateRunners> = {}): GateRunners {
  const phone = phoneProject();
  const base: GateRunners = {
    typeAudit: async () => ({ ok: true, problems: [], samples: [] }),
    palette: async () => ({ enabled: true, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } }),
    imagery: async () => [{ src: "hero.jpg", temperature: 0.5, contrast: 0.5, saturation: 0.5 }],
    motion: async () => ({ projects: [phone], sampleFor: (project) => quiet(project) }),
    copyText: async () => "The valley holds three jobs and a quiet road.",
    device: async () => ({ projects: [phone], sections: [], hooks: hooks() }),
    console: async () => ({ errors: 0, failedRequests: 0, pass: true }),
    links: async () => ({ broken: [], bytes: 1200, pages: [], pass: true }),
    a11y: async () => ({
      violations: [],
      hasKeyboardPath: true,
      hasReducedMotion: true,
      contrastRatio: 7,
      motionUsed: false,
    }),
    lighthouse: async () => ({
      phone: { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 },
      heavy: false,
      floors: { phonePerfMin: 90, a11yMin: 90, bestPracticesMin: 90, seoMin: 90 },
    }),
    weight: async () => ({
      title: "Field notes",
      h1Count: 1,
      textLength: 80,
      brokenLinks: [],
      bytes: 20_000,
      appetite: 5,
    }),
  };
  return { ...base, ...overrides };
}
