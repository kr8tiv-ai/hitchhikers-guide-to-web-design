/**
 * 241k. Blocked gates are on the review and Elevate path.
 * Each test fails if that call is removed.
 * Browsers stay stubbed. Font licences are not checked.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { QueueFile } from "@hitchhiker/engine";
import { BODY_CONTRAST_MIN } from "../src/a11y-gate.ts";
import { judgeBeauty, type SectionShot } from "../src/beauty-gate.ts";
import { elevateRound, screenshotFixWidths } from "../src/elevate-loop.ts";
import type { ElevateItem } from "../src/elevate.ts";
import type { JurorSample } from "../src/juror-floor.ts";
import { PRIMARY_TARGET_MIN } from "../src/mobile-checks.ts";
import { checkRecipeDir, checkRecipes } from "../src/recipe-check.ts";
import {
  runElevateReview,
  runJuryReview,
  runVerdictReview,
  type QualityGates,
  type ReviewProject,
} from "../src/review-runners.ts";
import { falseVisualBans } from "../src/zaphod-vision.ts";
import { TYPE_MIN_BODY_PX } from "../src/type-gate.ts";
import { removeTempDir } from "./remove-temp.ts";

const RUNNERS = [runElevateReview, runVerdictReview, runJuryReview] as const;

const PLAN = {
  upgrades: [
    {
      file: "src/hero.tsx",
      change: "Open the tracking on the display line",
      pass: "type-and-spacing",
      phone: "poster",
      reducedMotion: "the same poster",
    },
  ],
};

function shot(): SectionShot {
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
    ...falseVisualBans(),
  };
}

function queue(): QueueFile {
  return { items: [{ id: "010", kind: "build", status: "queued" }] };
}

function project(root: string, overrides: Partial<ReviewProject> = {}): ReviewProject {
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

function spyGates(): QualityGates {
  return {
    judgeBeauty: (shots, rubric) => judgeBeauty(shots, rubric),
    checkRecipes,
    checkRecipeDir,
    auditBuiltType: async () => ({ ok: true, problems: [], samples: [] }),
    runDeviceMatrix: async () => {
      throw new Error("device matrix stays stubbed");
    },
    runMobileChecks: () => ({ ok: true, problems: [], reports: [] }),
    runReducedMotion: () => ({ ok: true, problems: [], reports: [] }),
    evaluateStateSweeps: () => ({
      ok: true,
      problems: [],
      states: [],
      projects: [],
      p0ProjectId: "iphone-15",
      hoverByProject: {},
    }),
    assertPhoneBudgetBefore3d: () => undefined,
    auditHandoffMarkup: () => ({ cls: 0, blankFirstFrame: false }),
    shouldUsePoster: () => false,
    evaluateDevicePerformance: () => ({
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
    }),
    evaluateNavFooter: () => ({ status: "PASS", reasons: [] }),
    checkPaletteProportion: () => ({ flagged: false, reasons: [] }),
    scoreSelf: async () => ({
      status: "PASS",
      reasons: [],
      criteria: [
        { id: "design", weight: 40, score: 9 },
        { id: "usability", weight: 30, score: 9 },
        { id: "creativity", weight: 20, score: 9 },
        { id: "content", weight: 10, score: 9 },
      ],
      fixes: ["Keep the measured lab.", "Keep the measured lab.", "Keep the measured lab."],
      lab: {
        mobile: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
        desktop: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
        tablet: { lcpMs: 1, cls: 0, tbtMs: 1, inpSampleMs: null, performance: 1 },
        line: "lab",
      },
      coldLoad: "mobile",
      sweep: { descriptorKey: "phone", width: 390, height: 844, overflow: false },
      juryTotal: 90,
      juryStatus: "PASS",
      jury: { brand: 9, craft: 9, clarity: 9, performance: 9, blocked: false },
    }),
  };
}

function temp(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-sweep-241k-"));
}

function cleanJuror(): JurorSample {
  return {
    scrollWidth: 390,
    clientWidth: 390,
    controls: [{ width: PRIMARY_TARGET_MIN, height: PRIMARY_TARGET_MIN }],
    keyboardTrap: false,
    missingFocus: false,
    textPx: [TYPE_MIN_BODY_PX],
    contrastRatio: BODY_CONTRAST_MIN,
    hoverOnlyControls: 0,
    videos: [{ autoplay: true, muted: true }],
    reducedMotionHidesContent: false,
    headings: ["Valley"],
    fakeTestimonials: false,
  };
}

function git(dir: string, args: readonly string[]): Promise<void> {
  const hooks = path.join(os.tmpdir(), "hh-elevate-no-hooks").replaceAll("\\", "/");
  mkdirSync(hooks, { recursive: true });
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [
        "-c",
        "user.name=Hitchhiker",
        "-c",
        "user.email=hh@localhost",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=" + hooks,
        "-C",
        dir,
        ...args,
      ],
      {
        windowsHide: true,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Hitchhiker",
          GIT_AUTHOR_EMAIL: "hh@localhost",
          GIT_COMMITTER_NAME: "Hitchhiker",
          GIT_COMMITTER_EMAIL: "hh@localhost",
          GIT_TERMINAL_PROMPT: "0",
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim().length > 0 ? stderr.trim() : error.message));
          return;
        }
        resolve();
      },
    );
  });
}

test("mixed imagery or a missing image credit blocks elevate, verdict, and jury", async () => {
  const dir = temp();
  try {
    const imagery = [
      { src: "cool.jpg", temperature: 0.1, contrast: 0.1, saturation: 0.1 },
      { src: "warm.jpg", temperature: 0.9, contrast: 0.9, saturation: 0.9 },
    ];
    const gates = spyGates();
    for (const run of RUNNERS) {
      const graded = await run(project(dir, { imagery }), gates);
      assert.equal(graded.blocked, true);
      assert.match(graded.failures.map((failure) => failure.reason).join("\n"), /outside the page grade/);
    }
    const credited = project(dir, {
      html: '<main><img src="towel.jpg" alt=""></main>',
      credits: { assets: [] },
    });
    for (const run of RUNNERS) {
      const missing = await run(credited, gates);
      assert.equal(missing.blocked, true);
      assert.match(missing.failures.map((failure) => failure.reason).join("\n"), /towel\.jpg/);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("a craft score under 7 blocks the review even when the shot is clean", async () => {
  const dir = temp();
  try {
    const reviewed = await runElevateReview(
      project(dir, { scores: { brand: 9, craft: 4, clarity: 9, performance: 9 } }),
      spyGates(),
    );
    assert.equal(reviewed.blocked, true);
    assert.match(reviewed.failures.map((failure) => failure.reason).join("\n"), /Usability is 4/);
  } finally {
    removeTempDir(dir);
  }
});

test("a juror no, a skipped redesign step, or one variant refuses before think", async () => {
  const dir = temp();
  let thoughts = 0;
  const base = {
    think: async () => {
      thoughts += 1;
      return { value: PLAN, raw: "{}", durationMs: 1, cassette: "live" as const };
    },
    pick: async () => [],
    runPrompt: async () => undefined,
    gates: async () => ({ lh: "PASS" as const, a11y: "PASS" as const, console: "PASS" as const, links: "PASS" as const, weight: "PASS" as const }),
  };
  try {
    const juror = await elevateRound(dir, { ...base, juror: { ...cleanJuror(), fakeTestimonials: true } });
    assert.equal(thoughts, 0);
    assert.match(juror.refused.map((row) => row.reason).join("\n"), /fake testimonial/i);

    const redesign = await elevateRound(dir, {
      ...base,
      redesign: {
        namedFamilies: ["Fraunces"],
        steps: [
          {
            step: "components",
            before: Buffer.from("before"),
            after: Buffer.from("after"),
            displayFamily: "Fraunces",
          },
        ],
      },
    });
    assert.equal(thoughts, 0);
    assert.match(redesign.refused.map((row) => row.reason).join("\n"), /skipped/);

    const variants = await elevateRound(dir, {
      ...base,
      variants: {
        approved: { id: "approved", sectionId: "hero", regions: { copy: "Towels" } },
        variants: [{ id: "v1", sectionId: "hero", regions: { copy: "Towels" } }],
        picks: [{ region: "copy", variantId: "v1" }],
      },
    });
    assert.equal(thoughts, 0);
    assert.match(variants.refused.map((row) => row.reason).join("\n"), /four variants/);
  } finally {
    removeTempDir(dir);
  }
});

test("the screenshot loop captures, and a closed blocker without a retest blocks the review", async () => {
  const dir = temp();
  const shots = path.join(dir, ".hitchhiker", "elevate", "shots");
  mkdirSync(shots, { recursive: true });
  writeFileSync(path.join(shots, "full-375.png"), Buffer.from("png"));
  writeFileSync(path.join(shots, "full-768.png"), Buffer.from("png"));
  writeFileSync(path.join(shots, "full-1440.png"), Buffer.from("png"));
  writeFileSync(path.join(shots, "full-1920.png"), Buffer.from("png"));
  let captures = 0;
  try {
    const reviewed = await runJuryReview(
      project(dir, {
        defects: [{ id: "d1", severity: "blocker", project: "towel", state: "closed", retest: null }],
      }),
      spyGates(),
    );
    assert.equal(reviewed.blocked, true);
    assert.match(reviewed.failures.map((failure) => failure.reason).join("\n"), /without a retest/);

    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "defects.json"),
      `${JSON.stringify([{ id: "d1", severity: "blocker", project: "towel", state: "closed", retest: null }])}\n`,
      "utf8",
    );
    const round = await elevateRound(dir, {
      think: async () => ({ value: { upgrades: [] }, raw: "{}", durationMs: 1, cassette: "live" }),
      pick: async () => [],
      runPrompt: async () => undefined,
      gates: async () => ({ lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" }),
      captureShots: async () => {
        captures += 1;
        return [shot()];
      },
    });
    assert.equal(captures, screenshotFixWidths().length);
    assert.deepEqual(round.refused, []);
    const saved = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "defects.json"), "utf8")) as Array<{
      retest: { elevatePass: string; result: string } | null;
    }>;
    assert.equal(saved[0]?.retest?.elevatePass, "elevate-1");
    assert.equal(saved[0]?.retest?.result, "fail");
  } finally {
    removeTempDir(dir);
  }
});

test("a section lock that moves refuses the pick", { timeout: 60_000 }, async () => {
  const dir = temp();
  const shots = path.join(dir, ".hitchhiker", "elevate", "shots");
  mkdirSync(path.join(dir, "src"), { recursive: true });
  mkdirSync(shots, { recursive: true });
  writeFileSync(path.join(dir, "src", "hero.tsx"), "export {}\n", "utf8");
  for (const width of [375, 768, 1440, 1920]) {
    writeFileSync(path.join(shots, `full-${width}.png`), Buffer.from("png"));
  }
  let seen = 0;
  try {
    await git(dir, ["init", "-b", "main"]);
    await git(dir, ["add", "-A"]);
    await git(dir, ["commit", "-m", "start"]);
    const round = await elevateRound(dir, {
      think: async () => ({ value: PLAN, raw: "{}", durationMs: 1, cassette: "live" }),
      pick: async (items: ElevateItem[]) => items.slice(0, 1),
      runPrompt: async () => undefined,
      gates: async () => ({ lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" }),
      sectionScope: { target: "hero", lock: ["footer"] },
      captureSections: async () => {
        seen += 1;
        return [{ id: "footer", png: Buffer.from(seen === 1 ? "before" : "after") }];
      },
    });
    assert.ok(seen >= 2);
    assert.equal(round.applied.length, 0);
    assert.match(round.refused.map((row) => row.reason).join("\n"), /Locked section footer/);
  } finally {
    removeTempDir(dir);
  }
});
