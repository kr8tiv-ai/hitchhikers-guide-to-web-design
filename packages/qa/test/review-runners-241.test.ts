/**
 * BUG-054 audit 5. Elevate, verdict, and jury runners call the beauty gate,
 * the recipe checker, and the 241a-241d gates. A spy records each call.
 * Device, Lighthouse, and vision work stay on local fixtures and stubs.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { QueueFile } from "@hitchhiker/engine";
import { judgeBeauty, type SectionShot } from "../src/beauty-gate.ts";
import { elevateRound } from "../src/elevate-loop.ts";
import { checkRecipeDir, checkRecipes } from "../src/recipe-check.ts";
import {
  runElevateReview,
  runJuryReview,
  runVerdictReview,
  type QualityGates,
  type ReviewProject,
} from "../src/review-runners.ts";
import { zaphodReview, type SitePrompt } from "../src/zaphod-vision.ts";

const GATE_NAMES = [
  "judgeBeauty",
  "checkRecipes",
  "checkRecipeDir",
  "auditBuiltType",
  "runDeviceMatrix",
  "runMobileChecks",
  "runReducedMotion",
  "evaluateStateSweeps",
  "assertPhoneBudgetBefore3d",
  "auditHandoffMarkup",
  "shouldUsePoster",
  "evaluateDevicePerformance",
  "evaluateNavFooter",
  "checkPaletteProportion",
  "scoreSelf",
] as const;

const RUNNERS = [
  ["elevate", runElevateReview],
  ["verdict", runVerdictReview],
  ["jury", runJuryReview],
] as const;

function shot(overrides: Partial<SectionShot> = {}): SectionShot {
  return {
    page: "home",
    section: "hero",
    screenshot: ".hitchhiker/review/home-hero.png",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    score: 9,
    reason: "Layered media and a real type scale.",
    slop: "",
    ...overrides,
  };
}

function queue(): QueueFile {
  return {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "010", kind: "build", status: "queued" },
    ],
  };
}

function project(root = "site", overrides: Partial<ReviewProject> = {}): ReviewProject {
  return {
    root,
    pageSource: 'export const towel = "field";\n',
    pageFile: "src/page.ts",
    shots: [shot()],
    world: "editorial",
    matrixProjects: [],
    matrixSections: ["hero"],
    matrixHooks: {
      engineReady() {
        return undefined;
      },
      async screenshot() {
        return undefined;
      },
      async detail() {
        return undefined;
      },
      async scrollStrip() {
        return undefined;
      },
    },
    mobileDocument: () => {
      throw new Error("mobileDocument is for the gate, not the runner.");
    },
    motionSample: () => {
      throw new Error("motionSample is for the gate, not the runner.");
    },
    sweepSample: () => {
      throw new Error("sweepSample is for the gate, not the runner.");
    },
    brief: "A towel shop.\n\n## Phone performance budget\n\nThe phone keeps the scene.\n",
    asksFor3d: false,
    html: "<main><h1>Field notes</h1></main>",
    phoneSignals: {
      reducedMotion: false,
      viewportWidth: 390,
      saveData: false,
      cores: 8,
      webglAvailable: true,
      tierOverride: 3,
    },
    devices: {} as ReviewProject["devices"],
    nav: {} as ReviewProject["nav"],
    palette: { enabled: false, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } },
    self: {} as ReviewProject["self"],
    scores: { brand: 9, craft: 9, clarity: 9, performance: 9 },
    queue: queue(),
    gateIds: ["010"],
    round: 1,
    artDirection: "Editorial world, slow Lenis, warm film grade.",
    designLanguage: "This is direction and vocabulary, not a limit.",
    now: "2026-10-20T15:00:00.000Z",
    page: "home",
    section: "hero",
    ...overrides,
  };
}

function spyGates(log: string[]): QualityGates {
  const hit = (name: (typeof GATE_NAMES)[number]): void => {
    log.push(name);
  };
  return {
    judgeBeauty: (shots) => {
      hit("judgeBeauty");
      return judgeBeauty(shots);
    },
    checkRecipes: (source, file) => {
      hit("checkRecipes");
      return checkRecipes(source, file);
    },
    checkRecipeDir: (dir) => {
      hit("checkRecipeDir");
      return checkRecipeDir(dir);
    },
    auditBuiltType: async () => {
      hit("auditBuiltType");
      return { ok: true, problems: [], samples: [] };
    },
    runDeviceMatrix: async () => {
      hit("runDeviceMatrix");
      return {
        projects: [],
        captures: [],
        limits: [],
        optionalEngines: [],
        optionalLabs: [],
      } as unknown as Awaited<ReturnType<QualityGates["runDeviceMatrix"]>>;
    },
    runMobileChecks: () => {
      hit("runMobileChecks");
      return { ok: true, problems: [], reports: [] };
    },
    runReducedMotion: () => {
      hit("runReducedMotion");
      return { ok: true, problems: [], reports: [] };
    },
    evaluateStateSweeps: () => {
      hit("evaluateStateSweeps");
      return { ok: true, problems: [], states: [], projects: [], p0ProjectId: "iphone-15", hoverByProject: {} };
    },
    assertPhoneBudgetBefore3d: () => {
      hit("assertPhoneBudgetBefore3d");
    },
    auditHandoffMarkup: () => {
      hit("auditHandoffMarkup");
      return { cls: 0, blankFirstFrame: false };
    },
    shouldUsePoster: () => {
      hit("shouldUsePoster");
      return false;
    },
    evaluateDevicePerformance: () => {
      hit("evaluateDevicePerformance");
      return {
        status: "PASS",
        reasons: [],
        notes: [],
        recorded: [],
        lab: {
          mobile: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
          desktop: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
          tablet: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
        },
        desktopThrottling: "printed",
      };
    },
    evaluateNavFooter: () => {
      hit("evaluateNavFooter");
      return { status: "PASS", reasons: [] };
    },
    checkPaletteProportion: () => {
      hit("checkPaletteProportion");
      return { flagged: false, reasons: [] };
    },
    scoreSelf: async () => {
      hit("scoreSelf");
      return {
        status: "PASS",
        reasons: [],
        criteria: [
          { id: "design", weight: 40, score: 9 },
          { id: "usability", weight: 30, score: 9 },
          { id: "creativity", weight: 20, score: 9 },
          { id: "content", weight: 10, score: 9 },
        ],
        fixes: ["Keep the measured lab.", "Keep the measured lab.", "Keep the measured lab."],
      } as unknown as Awaited<ReturnType<QualityGates["scoreSelf"]>>;
    },
  };
}

test("elevate, verdict, and jury runners call beauty, recipes, and the 241 gates", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-review-241-"));
  writeFileSync(path.join(dir, "page.ts"), 'export const towel = "field";\n', "utf8");
  const site = project(dir);
  try {
    for (const [name, run] of RUNNERS) {
      const log: string[] = [];
      const result = await run(site, spyGates(log));
      assert.deepEqual(log, [...GATE_NAMES], name);
      assert.equal(result.blocked, false, name);
      assert.equal(result.verdict, "PASS", name);
      assert.equal(result.jury.status, "PASS", name);
      assert.equal(result.remediation.prompts.length, 0, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a beauty or recipe failure blocks and feeds a remediation prompt", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-review-fail-"));
  const broken = [
    'import Lenis from "lenis";',
    "const lenis = new Lenis();",
    "gsap.to(node, { width: 10 });",
    "animation-timeline: scroll();",
  ].join("\n");
  writeFileSync(path.join(dir, "page.ts"), broken, "utf8");
  const site = project(dir, {
    pageSource: broken,
    shots: [shot({ textOnly: true, reason: "The section is a column of text." })],
  });
  try {
    for (const [name, run] of RUNNERS) {
      const result = await run(site, spyGates([]));
      assert.equal(result.blocked, true, name);
      assert.equal(result.verdict, "FIX", name);
      assert.equal(result.jury.status, "FAIL", name);
      assert.equal(result.jury.total, 90, name);
      assert.ok(result.remediation.prompts.length >= 1, name);
      const body = result.remediation.prompts.map((prompt) => prompt.body).join("\n");
      assert.match(body, /Text only/, name);
      assert.match(body, /two scroll owners|scroll owners/i, name);
      assert.match(body, /model: grok-4\.7-build-fast/, name);
      assert.match(body, /effort: xhigh/, name);
      assert.ok(result.fixes.length >= 1 && result.fixes.length <= 3, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("each 241 gate failure blocks on its own", async () => {
  const cases: Array<{ name: (typeof GATE_NAMES)[number]; reason: RegExp; patch: (gates: QualityGates, site: ReviewProject) => void }> = [
    {
      name: "auditBuiltType",
      reason: /index\.html is missing/,
      patch: (gates) => {
        gates.auditBuiltType = async () => ({ ok: false, problems: ["index.html is missing."], samples: [] });
      },
    },
    {
      name: "runDeviceMatrix",
      reason: /iOS Safari/,
      patch: (gates) => {
        gates.runDeviceMatrix = async () => {
          throw new Error("iOS Safari (WebKit iPhone 15) is the P0 phone and is missing from the device matrix.");
        };
      },
    },
    {
      name: "runMobileChecks",
      reason: /horizontal overflow/,
      patch: (gates) => {
        gates.runMobileChecks = () => ({ ok: false, problems: ["The page has horizontal overflow."], reports: [] });
      },
    },
    {
      name: "runReducedMotion",
      reason: /reduced motion/i,
      patch: (gates) => {
        gates.runReducedMotion = () => ({ ok: false, problems: ["Reduced motion still moves the camera."], reports: [] });
      },
    },
    {
      name: "evaluateStateSweeps",
      reason: /state sweep/,
      patch: (gates) => {
        gates.evaluateStateSweeps = () => ({
          ok: false,
          problems: ["The state sweep missed a fixture."],
          states: [],
          projects: [],
          p0ProjectId: "iphone-15",
          hoverByProject: {},
        });
      },
    },
    {
      name: "assertPhoneBudgetBefore3d",
      reason: /phone performance budget/,
      patch: (gates) => {
        gates.assertPhoneBudgetBefore3d = () => {
          throw new Error("A WebGL hero needs the phone performance budget in the brief before any 3D prompt.");
        };
      },
    },
    {
      name: "auditHandoffMarkup",
      reason: /preloader handoff/,
      patch: (gates, site) => {
        site.html = '<canvas></canvas><img class="hh-poster">';
        gates.auditHandoffMarkup = () => ({ cls: 0.25, blankFirstFrame: true });
      },
    },
    {
      name: "shouldUsePoster",
      reason: /phone width replaced the scene/,
      patch: (gates) => {
        gates.shouldUsePoster = () => true;
      },
    },
    {
      name: "evaluateDevicePerformance",
      reason: /LCP/,
      patch: (gates) => {
        const pass = spyGates([]).evaluateDevicePerformance;
        gates.evaluateDevicePerformance = (input) => {
          const result = pass(input);
          return { ...result, status: "BLOCKER", reasons: ["LCP is over 2.5 s."] };
        };
      },
    },
    {
      name: "evaluateNavFooter",
      reason: /disclosure/,
      patch: (gates) => {
        gates.evaluateNavFooter = () => ({
          status: "BLOCKER",
          reasons: ['The nav uses role="menu". Site navigation is a disclosure, not an application menu.'],
        });
      },
    },
    {
      name: "checkPaletteProportion",
      reason: /half the page/,
      patch: (gates) => {
        gates.checkPaletteProportion = () => ({ flagged: true, reasons: ["Accent covers half the page."] });
      },
    },
    {
      name: "scoreSelf",
      reason: /self-score/,
      patch: (gates) => {
        gates.scoreSelf = async () =>
          ({
            status: "BLOCKER",
            reasons: ["The self-score missed the phone preset."],
            criteria: [
              { id: "design", weight: 40, score: 4 },
              { id: "usability", weight: 30, score: 4 },
              { id: "creativity", weight: 20, score: 4 },
              { id: "content", weight: 10, score: 4 },
            ],
            fixes: ["Use the phone preset.", "Keep the measured lab.", "Keep the measured lab."],
          }) as unknown as Awaited<ReturnType<QualityGates["scoreSelf"]>>;
      },
    },
  ];

  for (const [runnerName, run] of RUNNERS) {
    for (const item of cases) {
      const log: string[] = [];
      const gates = spyGates(log);
      const site = project();
      item.patch(gates, site);
      const result = await run(site, gates);
      assert.equal(result.blocked, true, `${runnerName} ${item.name}`);
      assert.match(result.failures.map((failure) => failure.reason).join(" "), item.reason, `${runnerName} ${item.name}`);
      assert.equal(result.remediation.prompts.length >= 1, true, `${runnerName} ${item.name} remediation`);
      assert.equal(log.includes("judgeBeauty"), true, `${runnerName} ${item.name}`);
    }
  }
});

test("a Three.js import is not a failure", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-review-three-"));
  const source = 'import * as THREE from "three";\nexport const scene = THREE.Scene;\n';
  writeFileSync(path.join(dir, "scene.ts"), source, "utf8");
  try {
    const result = await runJuryReview(project(dir, { pageSource: source, pageFile: "scene.ts" }), spyGates([]));
    assert.equal(result.blocked, false);
    assert.equal(result.failures.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("elevateRound and zaphodReview call the same gates", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-review-hook-"));
  const log: string[] = [];
  const prompt: SitePrompt = {
    id: "010",
    kind: "build",
    body: "<must_haves>\ntruths:\n- The towel sits in the hero shot.\n</must_haves>\n",
  };
  const reviewValue = {
    truths: [{ truth: "The towel sits in the hero shot.", note: "Seen." }],
    pillars: ["copy", "visuals", "color", "type", "spacing", "experience", "motion", "brand"].map((name) => ({
      name,
      status: "PASS",
      note: `${name} holds.`,
    })),
    jury: { brand: 9, craft: 9, clarity: 9, performance: 9 },
    boots: true,
    copy: "A quiet towel page.",
  };
  try {
    const elevated = await elevateRound(dir, {
      think: async () => {
        throw new Error("think should not run when the quality gates block.");
      },
      pick: async () => [],
      runPrompt: async () => undefined,
      gates: async () => ({ lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" }),
      review: project(dir, { shots: [shot({ textOnly: true })] }),
      qualityGates: spyGates(log),
    });
    assert.equal(elevated.applied.length, 0);
    assert.ok(elevated.refused.length >= 1);
    assert.match(elevated.refused.map((row) => row.reason).join(" "), /Text only/);
    assert.deepEqual(log, [...GATE_NAMES]);

    const verdictLog: string[] = [];
    const verdict = await zaphodReview(
      {
        prompt,
        shots: [],
        diff: "",
        quality: { project: project(dir, { shots: [shot({ score: 4, reason: "The layout is plain." })] }), gates: spyGates(verdictLog) },
      },
      {
        think: async () => ({ value: reviewValue, raw: "{}", durationMs: 1, cassette: "hit" }),
      },
    );
    assert.equal(verdict.verdict, "FIX");
    assert.equal(verdict.jury.blocked, true);
    assert.match(verdict.reasons.join(" "), /plain/);
    assert.ok(verdict.fixes.length >= 1);
    assert.deepEqual(verdictLog, [...GATE_NAMES]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
