/**
 * Fixture walk of samples/towel-day.hhproject.
 *
 * Discovery, the brief, the design, a cassette build, one Elevate round,
 * and the quality check. Publish stays with the caller: this file does not
 * import the CLI or the deploy package, and it does not run
 * `hh brief --approve`. The cassette writes the page. It does not spawn Grok.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceDesignStages,
  approveSiteBrief,
  approveSitePlan,
  chooseDirection,
  clearProjectBuildRunner,
  dealDirections,
  ensureSiteBuild,
  hiddenChildOptions,
  loadConfig,
  loadQueue,
  openInterview,
  phonePerformanceBudget,
  readBriefDesk,
  restoreProject,
  saveDirectionDeal,
  setProjectBuildRunner,
  siteBuildSettled,
  startSiteBuild,
  type BuildSpawn,
  type SiteBrief,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import {
  OPACITY_KEEP_MS,
  REVIEW_WIDTHS,
  elevateRound,
  runAllGates,
  type DeviceProject,
  type ElevateRoundDeps,
  type GateRunners,
  type PhoneSceneSample,
  type ReducedSample,
  type TierZeroStill,
} from "@hitchhiker/qa";
import { enterFlow, type FlowPhase } from "./phase-lock.ts";

const LINE = "The site helps a visitor book a visit.";
const KEPT_FILE = "src/hero.tsx";
const REVERTED_FILE = "src/footer.tsx";
const ANSWER = "The shop sells towels for the home.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export interface GoldenPathInput {
  /** Empty folder that receives the sample. */
  projectDir: string;
  /** Defaults to samples/towel-day.hhproject in this repo. */
  samplePath?: string;
}

export interface GoldenPathResult {
  projectDir: string;
  head: string;
  applied: string[];
  refused: Array<{ id: string; reason: string }>;
  keptFile: string;
  revertedFile: string;
}

export async function runGoldenPath(input: GoldenPathInput): Promise<GoldenPathResult> {
  if (typeof input.projectDir !== "string" || input.projectDir.trim().length === 0) {
    throw new Error("The project folder is missing, so the sample could not be opened.");
  }
  const projectDir = path.resolve(input.projectDir);
  const samplePath = input.samplePath ?? towelSample();
  if (!existsSync(samplePath)) throw new Error("The sample project could not be found.");

  const previousHome = process.env.HH_PROJECT_HOME;
  process.env.HH_PROJECT_HOME = path.join(projectDir, ".hh-save-home");
  try {
    await restoreProject(samplePath, { projectDir, prefer: "file" });
    await step(projectDir, "discovery");
    await answerDiscovery(projectDir);
    await step(projectDir, "brief");
    await approveSiteBrief(projectDir, fixtureThink as never, { confirmFallback: true });
    const planned = await approveSitePlan(projectDir);
    if (!planned.planApproved) throw new Error("The plan was not approved.");
    await step(projectDir, "design");
    passStages(projectDir, readBriefDesk(projectDir).markdown);
    writeStack(projectDir);
    await step(projectDir, "build");
    await cassetteBuild(projectDir);
    writeShots(projectDir);
    // Save the elevate step before the commit. A refused pick resets the
    // tree to that commit, and the saved step has to survive the reset.
    await step(projectDir, "elevate");
    const head = await commitPages(projectDir);
    const round = await elevateRound(projectDir, elevateDeps(projectDir));
    const report = await runAllGates({ root: projectDir }, passingRunners());
    const blocked = report.results.filter((item) => item.status !== "PASS");
    if (blocked.length > 0) {
      const first = blocked[0];
      throw new Error(
        first === undefined
          ? "The quality check did not pass."
          : `The quality check did not pass. ${first.reason}`,
      );
    }
    if (report.head !== head) {
      throw new Error("The quality check is for a different version of this site, so launch stays closed.");
    }
    return {
      projectDir,
      head,
      applied: round.applied,
      refused: round.refused,
      keptFile: KEPT_FILE,
      revertedFile: REVERTED_FILE,
    };
  } finally {
    clearProjectBuildRunner(projectDir);
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
  }
}

function towelSample(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 6; hop += 1) {
    const candidate = path.join(dir, "samples", "towel-day.hhproject");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("The sample project could not be found.");
}

async function step(projectDir: string, to: FlowPhase): Promise<void> {
  const decision = await enterFlow(projectDir, to);
  if (!decision.ok) throw new Error(decision.reason);
}

async function answerDiscovery(projectDir: string): Promise<void> {
  const session = await openInterview(projectDir, loadConfig(projectDir).interviewDepth);
  const seen = new Set<string>();
  for (let guard = 0; guard < 400; guard += 1) {
    const question = session.next();
    if (question === null) return;
    if (seen.has(question.id)) {
      throw new Error("A question stayed open, so the interview could not finish.");
    }
    seen.add(question.id);
    await session.command({ type: "keep", text: ANSWER });
  }
  throw new Error("The interview did not finish.");
}

function sampleBrief(): SiteBrief {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    pages: LINE,
    features: LINE,
    maintainer: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: LINE,
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
}

function fixtureThink(req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> {
  if (req.task === "brief-draft") {
    const brief = sampleBrief();
    return Promise.resolve({ value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "hit" });
  }
  if (req.task === "elevate-plan") {
    const value = {
      upgrades: [
        upgrade(KEPT_FILE, "Open the tracking on the display line", "copy"),
        upgrade(REVERTED_FILE, "Give the closing line more air", "type-and-spacing"),
      ],
    };
    return Promise.resolve({ value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" });
  }
  return Promise.reject(new Error("That step does not need a model reply."));
}

function upgrade(file: string, change: string, pass: "copy" | "type-and-spacing"): {
  file: string;
  change: string;
  pass: "copy" | "type-and-spacing";
  phone: string;
  reducedMotion: string;
} {
  return {
    file,
    change,
    pass,
    phone: "The line stays in one column.",
    reducedMotion: "The line stays still.",
  };
}

function passStages(projectDir: string, brief: string): void {
  advanceDesignStages(projectDir, { brief, approval: { stage: "sitemap", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "wireframe", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  const deal = dealDirections();
  saveDirectionDeal(projectDir, deal);
  const first = deal.directions[0];
  if (first === undefined) throw new Error("The design did not offer a direction.");
  chooseDirection(projectDir, first.id, "It fits the visit.");
  advanceDesignStages(projectDir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "direction", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "prebuild", text: "Approved." } });
}

function writeStack(projectDir: string): void {
  const file = path.join(projectDir, ".hitchhiker", "research", "STACK-DECISION.md");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe pages are finished files in dist.\n",
    "utf8",
  );
}

async function cassetteBuild(projectDir: string): Promise<void> {
  const spawn: BuildSpawn = (request) => {
    const page = path.join(request.cwd, "dist", "index.html");
    mkdirSync(path.dirname(page), { recursive: true });
    writeFileSync(
      page,
      "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>Mostly Towels</title></head>\n<body><h1>Mostly Towels</h1><p>The shop sells towels for the home.</p></body>\n</html>\n",
      "utf8",
    );
    // A tracked src file makes later picks show up as their own untracked paths.
    // An empty src directory is one git entry, so undoing a pick would keep the folder.
    const source = path.join(request.cwd, "src", "page.tsx");
    mkdirSync(path.dirname(source), { recursive: true });
    if (!existsSync(source)) {
      writeFileSync(source, "export const name = \"Mostly Towels\";\n", "utf8");
    }
    return {
      pid: 247,
      done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }),
    };
  };
  setProjectBuildRunner(projectDir, spawn);
  const started = await startSiteBuild(projectDir);
  if (!started.buildStarted) throw new Error("The build did not finish.");
  for (let pass = 0; pass < 4; pass += 1) {
    await siteBuildSettled(projectDir);
    const queue = await loadQueue(projectDir);
    const waiting = queue?.items.some((item) => item.status === "queued" || item.status === "running") === true;
    if (!waiting) break;
    await ensureSiteBuild(projectDir);
  }
  const queue = await loadQueue(projectDir);
  const failed = queue?.items.find((item) => item.status === "failed");
  if (failed !== undefined) throw new Error("The build did not finish.");
  if (!existsSync(path.join(projectDir, "dist", "index.html"))) {
    throw new Error("The pages were not written.");
  }
}

function writeShots(projectDir: string): void {
  const dir = path.join(projectDir, ".hitchhiker", "elevate", "shots");
  mkdirSync(dir, { recursive: true });
  for (const width of REVIEW_WIDTHS) {
    writeFileSync(path.join(dir, `full-${width}.png`), PNG);
  }
}

async function commitPages(projectDir: string): Promise<string> {
  await git(projectDir, ["init"]);
  await git(projectDir, ["add", "-A"]);
  await git(projectDir, ["commit", "-m", "Towel pages for the sample."]);
  const head = (await git(projectDir, ["rev-parse", "HEAD"])).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(head) && !/^[0-9a-f]{64}$/.test(head)) {
    throw new Error("The project could not be saved before Elevate.");
  }
  return head;
}

function git(dir: string, args: readonly string[], attempt = 0): Promise<string> {
  const hooks = path.join(dir, ".hh-git-hooks");
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
    `core.hooksPath=${hooks.replaceAll("\\", "/")}`,
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
      }),
      (error, stdout, stderr) => {
        if (error) {
          const detail = typeof stderr === "string" && stderr.trim().length > 0 ? stderr.trim() : error.message;
          if (attempt < 5 && /permission denied|unable to write file|index\.lock|updating files failed/i.test(detail)) {
            rmSync(path.join(dir, ".git", "index.lock"), { force: true });
            setTimeout(() => {
              git(dir, args, attempt + 1).then(resolve, reject);
            }, 300 * (attempt + 1));
            return;
          }
          const calm = detail.replaceAll("!", ".").replaceAll("\u2014", "-");
          reject(new Error(`The project could not be saved before Elevate. ${calm}`));
          return;
        }
        resolve(String(stdout).trim());
      },
    );
  });
}

function elevateDeps(projectDir: string): ElevateRoundDeps {
  let gateCalls = 0;
  return {
    think: fixtureThink as ElevateRoundDeps["think"],
    pick: (items) => Promise.resolve(items.slice(0, 2)),
    runPrompt: async (file) => {
      const text = readFileSync(file, "utf8");
      const named = [...text.matchAll(/^File: (\S+)\s*$/gm)];
      const relative = named.at(-1)?.[1];
      if (relative === undefined || relative.split(/[/\\]/).includes("..")) return;
      const full = path.join(projectDir, relative);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, `export const line = ${JSON.stringify(relative)};\n`, "utf8");
    },
    gates: () => {
      gateCalls += 1;
      const links = gateCalls >= 3 ? "FIX" : "PASS";
      return Promise.resolve({
        lh: "PASS",
        a11y: "PASS",
        console: "PASS",
        links,
        weight: "PASS",
      });
    },
  };
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

function pose(): TierZeroStill {
  return {
    camera: { fov: 35, position: [0, 1.2, 4], lookAt: [0, 0.8, 0] },
    grade: { name: "Boreal", exposure: 1.1 },
    lighting: { key: "north" },
  };
}

function quiet(project: DeviceProject): ReducedSample {
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
  };
}

function sceneSample(): PhoneSceneSample {
  return {
    webgl: true,
    posterPresent: true,
    rendersWhen3dOff: true,
    longestLongTaskMs: 40,
    slowestFrameMs: 16,
    brief: phonePerformanceBudget(),
  };
}

function passingRunners(): GateRunners {
  const phone = phoneProject();
  return {
    typeAudit: async () => ({ ok: true, problems: [], samples: [] }),
    palette: async () => ({ enabled: true, shares: { dominant: 0.6, secondary: 0.3, accent: 0.1 } }),
    spacing: async () => ({
      boxes: [
        {
          name: "the hero",
          lengths: [
            { kind: "padding", pixels: 16 },
            { kind: "gap", pixels: 24 },
          ],
        },
      ],
    }),
    contrast: async () => [
      { kind: "body", place: "the opening paragraph", ratio: 7 },
      { kind: "large", place: "the title", ratio: 4 },
    ],
    imagery: async () => [{ src: "hero.jpg", temperature: 0.5, contrast: 0.5, saturation: 0.5 }],
    motion: async () => ({
      projects: [phone],
      sampleFor: (project) => quiet(project),
      scene: sceneSample(),
    }),
    copyText: async () => "The valley holds three jobs and a quiet road.",
    device: async () => ({
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
    }),
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
      runs: [
        { performance: 92, accessibility: 95, bestPractices: 95, seo: 95 },
        { performance: 96, accessibility: 95, bestPractices: 95, seo: 95 },
        { performance: 98, accessibility: 95, bestPractices: 95, seo: 95 },
      ],
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
}
