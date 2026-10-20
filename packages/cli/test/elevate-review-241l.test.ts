/**
 * 241l. hh elevate passes a ReviewProject, so gateProblems runs.
 * An unbuilt project is refused before any gate. The loader invents nothing.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runElevateCommand } from "../src/commands/elevate.ts";

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

function spyGates(log: string[]): object {
  const hit = (name: (typeof GATE_NAMES)[number]): void => {
    log.push(name);
  };
  return {
    judgeBeauty() {
      hit("judgeBeauty");
      return { pass: true, failures: [] };
    },
    checkRecipes() {
      hit("checkRecipes");
      return [];
    },
    checkRecipeDir() {
      hit("checkRecipeDir");
      return [];
    },
    async auditBuiltType() {
      hit("auditBuiltType");
      return { ok: true, problems: [] };
    },
    async runDeviceMatrix() {
      hit("runDeviceMatrix");
      return { projects: [] };
    },
    runMobileChecks() {
      hit("runMobileChecks");
      return { ok: true, problems: [] };
    },
    runReducedMotion() {
      hit("runReducedMotion");
      return { ok: true, problems: [] };
    },
    evaluateStateSweeps() {
      hit("evaluateStateSweeps");
      return { ok: true, problems: [] };
    },
    assertPhoneBudgetBefore3d() {
      hit("assertPhoneBudgetBefore3d");
    },
    auditHandoffMarkup() {
      hit("auditHandoffMarkup");
      return { cls: 0, blankFirstFrame: false };
    },
    shouldUsePoster() {
      hit("shouldUsePoster");
      return false;
    },
    evaluateDevicePerformance() {
      hit("evaluateDevicePerformance");
      return { status: "PASS", reasons: [] };
    },
    evaluateNavFooter() {
      hit("evaluateNavFooter");
      return { status: "PASS", reasons: [] };
    },
    checkPaletteProportion() {
      hit("checkPaletteProportion");
      return { flagged: false, reasons: [] };
    },
    async scoreSelf() {
      hit("scoreSelf");
      return { status: "PASS", reasons: [] };
    },
  };
}

function thinkStub(): {
  value: { upgrades: [] };
  raw: string;
  durationMs: number;
  cassette: "live";
} {
  return { value: { upgrades: [] }, raw: "{}", durationMs: 1, cassette: "live" };
}

function lab(extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      world: "editorial",
      page: "home",
      section: "hero",
      brief: "A towel shop.\n\n## Phone performance budget\n\nThe phone keeps the scene.\n",
      artDirection: "Editorial world, slow scroll, warm paper.",
      designLanguage: "Direction and vocabulary, not a limit.",
      scores: { brand: 9, craft: 9, clarity: 9, performance: 9 },
      phoneSignals: { reducedMotion: false, viewportWidth: 390, saveData: false, cores: 8 },
      palette: { enabled: false, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } },
      devices: { heavy: false, mobile: {}, desktop: {}, tablet: {} },
      nav: { currentMark: "aria" },
      self: { creativity: 9 },
      shots: [],
      matrixProjects: [],
      matrixSections: ["hero"],
      gateIds: ["review"],
      ...extra,
    },
    null,
    2,
  )}\n`;
}

function writeLab(dir: string, body = lab()): void {
  const folder = path.join(dir, ".hitchhiker", "review");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "lab.json"), body, "utf8");
}

function writePage(dir: string): void {
  writeFileSync(path.join(dir, "index.html"), "<main><h1>Field notes</h1><p>A measured page.</p></main>\n", "utf8");
}

function writeShots(dir: string): void {
  const folder = path.join(dir, ".hitchhiker", "elevate", "shots");
  mkdirSync(folder, { recursive: true });
  for (const width of [375, 768, 1440, 1920]) {
    writeFileSync(path.join(folder, `full-${width}.png`), "shot");
  }
}

test("elevate on a built fixture runs the review gates", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-built-"));
  writePage(dir);
  writeLab(dir);
  writeShots(dir);
  const log: string[] = [];
  let thought = 0;
  try {
    const result = await runElevateCommand(["--project", dir, "--pick", "none"], {
      think: async () => {
        thought += 1;
        return thinkStub();
      },
      qualityGates: spyGates(log),
    });
    assert.equal(result.exitCode, 0, result.stdout);
    assert.deepEqual(log, [...GATE_NAMES]);
    assert.match(result.stdout, /No picks\. This round changes nothing\./);
    assert.equal(thought, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("elevate on an unbuilt project names what is missing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-empty-"));
  const log: string[] = [];
  let thought = 0;
  try {
    const result = await runElevateCommand(["--project", dir, "--pick", "none"], {
      think: async () => {
        thought += 1;
        return thinkStub();
      },
      qualityGates: spyGates(log),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /Elevate refused\./);
    assert.match(result.stdout, /Missing: index\.html/);
    assert.match(result.stdout, /Build the site so index\.html is at the project root/);
    assert.match(result.stdout, /Prompts alone do not build the page/);
    assert.match(result.stdout, /Missing: \.hitchhiker\/review\/lab\.json/);
    assert.match(result.stdout, /Write \.hitchhiker\/review\/lab\.json from the device lab/);
    assert.match(result.stdout, /heavy set to true or false/);
    assert.match(result.stdout, /currentMark set to color, aria, or text/);
    assert.match(result.stdout, /creativity from 0 to 10/);
    assert.match(result.stdout, /Elevate does not invent these/);
    assert.equal(log.length, 0);
    assert.equal(thought, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("elevate names the one input that is absent", async () => {
  const pageOnly = mkdtempSync(path.join(tmpdir(), "hh-elevate-page-"));
  const labOnly = mkdtempSync(path.join(tmpdir(), "hh-elevate-lab-"));
  const thin = mkdtempSync(path.join(tmpdir(), "hh-elevate-thin-"));
  try {
    writePage(pageOnly);
    const noLab = await runElevateCommand(["--project", pageOnly, "--pick", "none"], {
      think: async () => thinkStub(),
      qualityGates: spyGates([]),
    });
    assert.equal(noLab.exitCode, 1);
    assert.match(noLab.stdout, /Missing: \.hitchhiker\/review\/lab\.json/);
    assert.equal(noLab.stdout.includes("Missing: index.html"), false);

    writeLab(labOnly);
    const noPage = await runElevateCommand(["--project", labOnly, "--pick", "none"], {
      think: async () => thinkStub(),
      qualityGates: spyGates([]),
    });
    assert.equal(noPage.exitCode, 1);
    assert.match(noPage.stdout, /Missing: index\.html/);
    assert.match(noPage.stdout, /Build the site so index\.html is at the project root/);
    assert.equal(noPage.stdout.includes("Missing: .hitchhiker/review/lab.json\n"), false);

    writePage(thin);
    const body = JSON.parse(lab()) as Record<string, unknown>;
    const devices = body.devices as Record<string, unknown>;
    delete devices.heavy;
    writeLab(thin, `${JSON.stringify(body, null, 2)}\n`);
    const log: string[] = [];
    const missingHeavy = await runElevateCommand(["--project", thin, "--pick", "none"], {
      think: async () => thinkStub(),
      qualityGates: spyGates(log),
    });
    assert.equal(missingHeavy.exitCode, 1);
    assert.match(missingHeavy.stdout, /devices\.heavy/);
    assert.match(missingHeavy.stdout, /Elevate does not invent it/);
    assert.equal(log.length, 0);
  } finally {
    rmSync(pageOnly, { recursive: true, force: true });
    rmSync(labOnly, { recursive: true, force: true });
    rmSync(thin, { recursive: true, force: true });
  }
});
