/**
 * 241l. hh elevate passes a ReviewProject, so gateProblems runs.
 * An unbuilt project is refused before any gate. The loader invents nothing.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os, { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { hiddenChildOptions, OPACITY_KEEP_MS, phonePerformanceBudget } from "@hitchhiker/engine";
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

const CLEAR_GATES = { lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" } as const;

const PLAN = {
  value: {
    upgrades: [
      {
        file: "src/hero.tsx",
        change: "Open the tracking on the display line",
        pass: "type-and-spacing",
        phone: "poster",
        reducedMotion: "the same poster",
      },
    ],
  },
  raw: "{}",
  durationMs: 1,
  cassette: "live" as const,
};

// Git for Windows rejects "NUL" as a config path. One empty file isolates both configs.
const emptyGitConfigDir = mkdtempSync(path.join(os.tmpdir(), "hh-git-config-"));
const emptyGitConfig = path.join(emptyGitConfigDir, "empty.gitconfig");
writeFileSync(emptyGitConfig, "");

function removeEmptyGitConfig(): void {
  try {
    rmSync(emptyGitConfigDir, { recursive: true, force: true });
  } catch {
    // Removal must never fail a test.
  }
}

process.on("exit", removeEmptyGitConfig);
after(removeEmptyGitConfig);

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  env.GIT_AUTHOR_NAME = "Hitchhiker";
  env.GIT_AUTHOR_EMAIL = "hh@localhost";
  env.GIT_COMMITTER_NAME = "Hitchhiker";
  env.GIT_COMMITTER_EMAIL = "hh@localhost";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CONFIG_GLOBAL = emptyGitConfig;
  env.GIT_CONFIG_SYSTEM = emptyGitConfig;
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function git(dir: string, args: readonly string[], attempt = 0): Promise<string> {
  const hooks = path.join(os.tmpdir(), "hh-elevate-no-hooks").replaceAll("\\", "/");
  mkdirSync(hooks, { recursive: true });
  const full = [
    "-c",
    "user.name=Hitchhiker",
    "-c",
    "user.email=hh@localhost",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.fscache=false",
    "-c",
    "core.editor=true",
    "-c",
    `core.hooksPath=${hooks}`,
    "-C",
    dir,
    ...args,
  ];
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      full,
      hiddenChildOptions({
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
        env: gitEnv(),
      }),
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? "").trim();
          const message = detail.length > 0 ? detail : error.message;
          if (attempt < 8 && /permission denied|unable to write file|index\.lock|updating files failed/i.test(message)) {
            rmSync(path.join(dir, ".git", "index.lock"), { force: true });
            wait(400 * (attempt + 1)).then(() => git(dir, args, attempt + 1).then(resolve, reject), reject);
            return;
          }
          reject(new Error(`${args.join(" ")}: ${message}`));
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}

function phoneProject(): Record<string, unknown> {
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

function passingRunners(): object {
  const phone = phoneProject();
  const still = {
    camera: { fov: 35, position: [0, 1.2, 4], lookAt: [0, 0.8, 0] },
    grade: { name: "Boreal", exposure: 1.1 },
    lighting: { key: "north" },
  };
  return {
    async typeAudit() {
      return { ok: true, problems: [], samples: [] };
    },
    async palette() {
      return { enabled: true, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } };
    },
    async spacing() {
      return {
        boxes: [
          {
            name: "the hero",
            lengths: [
              { kind: "padding", pixels: 16 },
              { kind: "gap", pixels: 24 },
            ],
          },
        ],
      };
    },
    async contrast() {
      return [
        { kind: "body", place: "the opening paragraph", ratio: 7 },
        { kind: "large", place: "the title", ratio: 4 },
      ];
    },
    async imagery() {
      return [{ src: "hero.jpg", temperature: 0.5, contrast: 0.5, saturation: 0.5 }];
    },
    async motion() {
      return {
        projects: [phone],
        sampleFor: () => ({
          projectId: "iphone-15",
          viewportWidth: 393,
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
        }),
        scene: {
          webgl: true,
          posterPresent: true,
          rendersWhen3dOff: true,
          longestLongTaskMs: 40,
          slowestFrameMs: 16,
          brief: phonePerformanceBudget(),
        },
      };
    },
    async copyText() {
      return "The valley holds three jobs and a quiet road.";
    },
    async device() {
      return {
        projects: [phone],
        sections: [],
        hooks: {
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
        },
      };
    },
    async console() {
      return { errors: 0, failedRequests: 0, pass: true };
    },
    async links() {
      return { broken: [], bytes: 1200, pages: [], pass: true };
    },
    async a11y() {
      return {
        violations: [],
        hasKeyboardPath: true,
        hasReducedMotion: true,
        contrastRatio: 7,
        motionUsed: false,
      };
    },
    async lighthouse() {
      return {
        runs: [
          { performance: 92, accessibility: 95, bestPractices: 95, seo: 95 },
          { performance: 96, accessibility: 95, bestPractices: 95, seo: 95 },
          { performance: 98, accessibility: 95, bestPractices: 95, seo: 95 },
        ],
      };
    },
    async weight() {
      return {
        title: "Field notes",
        h1Count: 1,
        textLength: 80,
        brokenLinks: [],
        bytes: 20_000,
        appetite: 5,
      };
    },
  };
}

async function plantRepo(dir: string): Promise<void> {
  writePage(dir);
  writeLab(dir);
  writeShots(dir);
  const brand = path.join(dir, ".hitchhiker", "brand");
  mkdirSync(brand, { recursive: true });
  writeFileSync(path.join(brand, "BRAND.md"), "A quiet towel shop. Paper, ink, and one green stitch.\n", "utf8");
  writeFileSync(path.join(brand, "VOICE.md"), "Short sentences. Concrete nouns. No hype.\n", "utf8");
  writeFileSync(path.join(brand, "MOTION.md"), "One pinned story on the desktop. A still on the phone.\n", "utf8");
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "hero.tsx"), "export function Hero() { return null; }\n", "utf8");
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-m", "start"]);
}

test("elevate --rounds 2 --pick all uses both rounds when the scores climb", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-rounds-"));
  const log: string[] = [];
  let thought = 0;
  try {
    await plantRepo(dir);
    const result = await runElevateCommand(["--rounds", "2", "--project", dir, "--pick", "all"], {
      think: async () => {
        thought += 1;
        return PLAN;
      },
      qualityGates: spyGates(log),
      runners: passingRunners(),
      scores: (round) => ({ beauty: 7 + round, jury: 7 + round }),
      verdict: () => "PASS",
      runPrompt: async () => undefined,
      gates: async () => ({ ...CLEAR_GATES }),
    });
    assert.equal(result.exitCode, 0, result.stdout);
    assert.match(result.stdout, /Round 1/);
    assert.match(result.stdout, /Round 2/);
    assert.match(result.stdout, /1\. src\/hero\.tsx: Open the tracking on the display line/);
    assert.match(result.stdout, /Applied: r1-01/);
    assert.match(result.stdout, /Applied: r2-01/);
    assert.match(result.stdout, /The improvements have used every round they are allowed\./);
    assert.equal(result.stdout.includes("No picks. This round changes nothing."), false);
    assert.equal(thought, 2);
    const report = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "qa", "GATES.json"), "utf8")) as {
      head: string;
      results: unknown[];
    };
    const head = (await git(dir, ["rev-parse", "HEAD"])).toLowerCase();
    assert.equal(report.head, head);
    assert.equal(report.results.length, 11);
    assert.equal(log.length > 0, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("elevate --rounds stops when the measurements or the scores are missing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-rounds-gap-"));
  writePage(dir);
  writeLab(dir);
  try {
    const missingRunners = await runElevateCommand(["--rounds", "2", "--project", dir, "--pick", "none"], {
      think: async () => thinkStub(),
      qualityGates: spyGates([]),
    });
    assert.equal(missingRunners.exitCode, 1, missingRunners.stdout);
    assert.match(missingRunners.stdout, /The quality check needs its measurements before a round can finish\./);

    const missingScores = await runElevateCommand(["--rounds", "2", "--project", dir, "--pick", "none"], {
      think: async () => thinkStub(),
      qualityGates: spyGates([]),
      runners: passingRunners(),
    });
    assert.equal(missingScores.exitCode, 1, missingScores.stdout);
    assert.match(missingScores.stdout, /Each round needs a design score, a jury score, and a review result\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("elevate --rounds rejects a count outside 1 to 99", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-rounds-bad-"));
  try {
    const zero = await runElevateCommand(["--project", dir, "--rounds", "0", "--pick", "none"]);
    assert.equal(zero.exitCode, 2);
    assert.match(zero.stdout, /Choose a whole number of rounds from 1 to 99\./);

    const missing = await runElevateCommand(["--project", dir, "--rounds", "--pick", "none"]);
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stdout, /Missing --rounds\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
