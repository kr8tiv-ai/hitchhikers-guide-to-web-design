/**
 * Bounded Elevate loop (spec 243-02, E1). One cassette replay per stop
 * rule. No Chrome. Gate runners are injected.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig, hiddenChildOptions, phonePerformanceBudget, think, type SpawnLike } from "@hitchhiker/engine";
import type { ElevateRoundDeps, GateResult as RoundGates } from "../src/elevate-loop.ts";
import {
  DEFAULT_ELEVATE_ROUNDS,
  ELEVATE_SCORE_GAIN,
  elevateStopWhen,
  runElevateLoop,
  type ElevateLoopResult,
  type ElevateLoopSnapshot,
  type ElevateScores,
  type ElevateStop,
  type ElevateStopRule,
} from "../src/elevate-rounds.ts";
import { runElevateLoop as exportedLoop } from "../src/index.ts";
import type { DeviceProject, MatrixHooks } from "../src/device-matrix.ts";
import { gatesJsonPath, type GateReport, type GateRunners } from "../src/gates/registry.ts";
import { OPACITY_KEEP_MS, type PhoneSceneSample, type ReducedSample, type TierZeroStill } from "../src/reduced-motion.ts";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "..", "src", "elevate-rounds.ts");

const FLAGS = new Set([
  "-p",
  "-m",
  "--effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const PLAN_PAYLOAD = {
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

const BRAND = "A quiet towel shop. Paper, ink, and one green stitch.";
const VOICE = "Short sentences. Concrete nouns. No hype.";
const MOTION = "One pinned story on the desktop. A still on the phone.";
const SOURCE = "export function Hero() { return null; }\n";

const PLAIN =
  /\b(?:webkit|woff2|axe|lighthouse|viewport|chromium|wcag|playwright|puppeteer|chrome|blocker|escalate|cassette|json)\b/i;

interface Scenario {
  accept: boolean;
  maxRounds?: number;
  scoresFor: (round: number) => ElevateScores;
  verdictFor: (round: number) => string;
  stopWhen?: (snapshot: ElevateLoopSnapshot) => ElevateStop | null;
  expect: { roundsRun: number; rule: ElevateStopRule; reason: RegExp };
}

function clearGates(): RoundGates {
  return { lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" };
}

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
  env.GIT_CONFIG_GLOBAL = "NUL";
  env.GIT_CONFIG_SYSTEM = "NUL";
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

function plant(projectDir: string): void {
  const shots = path.join(projectDir, ".hitchhiker", "elevate", "shots");
  mkdirSync(shots, { recursive: true });
  for (const width of REVIEW_WIDTHS) {
    writeFileSync(path.join(shots, `full-${width}.png`), PNG);
  }
  const brandDir = path.join(projectDir, ".hitchhiker", "brand");
  mkdirSync(brandDir, { recursive: true });
  writeFileSync(path.join(brandDir, "BRAND.md"), `${BRAND}\n`, "utf8");
  writeFileSync(path.join(brandDir, "VOICE.md"), `${VOICE}\n`, "utf8");
  writeFileSync(path.join(brandDir, "MOTION.md"), `${MOTION}\n`, "utf8");
  mkdirSync(path.join(projectDir, "src"), { recursive: true });
  writeFileSync(path.join(projectDir, "src", "hero.tsx"), SOURCE, "utf8");
}

async function initRepo(projectDir: string): Promise<void> {
  plant(projectDir);
  await git(projectDir, ["init", "-b", "main"]);
  await git(projectDir, ["add", "-A"]);
  await git(projectDir, ["commit", "-m", "start"]);
}

function snap(
  over: Pick<ElevateLoopSnapshot, "round" | "accepted" | "verdict" | "history"> &
    Partial<Omit<ElevateLoopSnapshot, "round" | "accepted" | "verdict" | "history">>,
): ElevateLoopSnapshot {
  const latest = over.history[over.history.length - 1] ?? { beauty: 0, jury: 0 };
  return {
    round: over.round,
    maxRounds: over.maxRounds ?? DEFAULT_ELEVATE_ROUNDS,
    accepted: over.accepted,
    applied: over.applied ?? (over.accepted > 0 ? ["r1-01"] : []),
    refused: over.refused ?? [],
    scores: over.scores ?? latest,
    history: over.history,
    verdict: over.verdict,
    head: over.head ?? "a".repeat(40),
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
  return { ...base, ...overrides };
}

function assertPlain(stop: ElevateStop): void {
  assert.equal(stop.reason.includes("!"), false, stop.reason);
  assert.equal(stop.reason.includes("\u2014"), false, stop.reason);
  assert.equal(PLAIN.test(stop.reason), false, stop.reason);
  assert.equal(stop.reason.trim().length > 0, true);
}

async function assertGatesMatchHead(projectDir: string, report: GateReport): Promise<void> {
  const onDisk = JSON.parse(readFileSync(gatesJsonPath(projectDir), "utf8")) as GateReport;
  const head = (await git(projectDir, ["rev-parse", "HEAD"])).toLowerCase();
  assert.equal(report.head, head);
  assert.equal(onDisk.head, head);
  assert.equal(onDisk.results.length, 11);
  assert.equal(report.results.length, 11);
}

function depsFor(model: typeof think, scenario: Scenario): ElevateRoundDeps {
  return {
    think: model,
    pick: async (items) => (scenario.accept ? items.slice(0, 1) : []),
    runPrompt: async () => {
      throw new Error("This round should not run a prompt.");
    },
    gates: async () => clearGates(),
  };
}

async function runOnce(
  projectDir: string,
  model: typeof think,
  scenario: Scenario,
): Promise<{ result: ElevateLoopResult; gateCalls: number; prompts: number }> {
  const counter = { n: 0 };
  const prompts = { n: 0 };
  const wired = { deps: depsFor(model, scenario) };
  wired.deps.runPrompt = async () => {
    prompts.n += 1;
    writeFileSync(
      path.join(projectDir, "src", "hero.tsx"),
      `${SOURCE}export const pass = ${prompts.n};\n`,
      "utf8",
    );
    await git(projectDir, ["add", "-A"]);
    await git(projectDir, ["commit", "-m", `r-pick-${prompts.n}`]);
  };
  const input = {
    projectDir,
    deps: wired.deps,
    runners: passingRunners({
      typeAudit: async () => {
        counter.n += 1;
        return { ok: true, problems: [], samples: [] };
      },
    }),
    scores: (round: number) => scenario.scoresFor(round),
    verdict: (round: number) => scenario.verdictFor(round),
    ...(scenario.maxRounds !== undefined ? { maxRounds: scenario.maxRounds } : {}),
    ...(scenario.stopWhen !== undefined ? { stopWhen: scenario.stopWhen } : {}),
  };
  const result = await runElevateLoop(input);
  return { result, gateCalls: counter.n, prompts: prompts.n };
}

async function replay(scenario: Scenario): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-loop-"));
  const cassetteDir = path.join(root, "cassettes");
  const projectA = path.join(root, "a");
  const projectB = path.join(root, "b");
  let spawns = 0;
  let replaySpawns = 0;
  const spawnImpl: SpawnLike = async () => {
    spawns += 1;
    return {
      status: 0,
      stdout: JSON.stringify({
        text: JSON.stringify(PLAN_PAYLOAD),
        stopReason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 40 },
      }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  const recorded: typeof think = (request, thinkDeps) =>
    think(request, {
      ...thinkDeps,
      spawnImpl,
      projectDir: projectA,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "" },
    });
  const replayed: typeof think = (request, thinkDeps) =>
    think(request, {
      ...thinkDeps,
      spawnImpl: async () => {
        replaySpawns += 1;
        throw new Error("spawned during replay");
      },
      projectDir: projectB,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "replay", PATH: "" },
    });

  try {
    await initRepo(projectA);
    await initRepo(projectB);
    const first = await runOnce(projectA, recorded, scenario);
    const second = await runOnce(projectB, replayed, scenario);
    assert.equal(spawns, scenario.expect.roundsRun);
    assert.equal(replaySpawns, 0);
    for (const run of [first, second]) {
      assert.equal(run.result.roundsRun, scenario.expect.roundsRun);
      assert.equal(run.result.snapshots.length, scenario.expect.roundsRun);
      assert.equal(run.result.stop.rule, scenario.expect.rule);
      assert.match(run.result.stop.reason, scenario.expect.reason);
      assertPlain(run.result.stop);
      assert.equal(run.gateCalls, scenario.expect.roundsRun);
      assert.equal(run.prompts, scenario.accept ? scenario.expect.roundsRun : 0);
      await assertGatesMatchHead(run === first ? projectA : projectB, run.result.gates);
      const heads = run.result.snapshots.map((shot) => shot.head);
      for (const head of heads) assert.match(head, /^[0-9a-f]{40}$/);
      const lastHead = heads[heads.length - 1];
      assert.equal(lastHead, run.result.gates.head);
      if (scenario.accept && scenario.expect.roundsRun > 1) {
        assert.equal(new Set(heads).size, heads.length);
      }
      const projectDir = run === first ? projectA : projectB;
      const count = await git(projectDir, ["rev-list", "--count", "HEAD"]);
      const expected = scenario.accept ? String(1 + scenario.expect.roundsRun) : "1";
      assert.equal(count, expected);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the loop module stays free of a browser and a license check", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(exportedLoop, runElevateLoop);
  assert.equal(DEFAULT_ELEVATE_ROUNDS, 3);
  assert.equal(ELEVATE_SCORE_GAIN, 0.3);
  assert.match(source, /maxRounds = 3/);
  assert.match(source, /elevateRound\(/);
  assert.match(source, /runAllGates\(/);
  assert.equal(/playwright|puppeteer|chrome|chromium|child_process|licenses/i.test(source), false);
  assert.equal(source.includes("\u2014"), false);
});

describe("stop rules", { concurrency: false }, () => {
test("no accepted picks stops the loop after one round", { timeout: 60_000 }, async () => {
  const escalateWins = elevateStopWhen(
    snap({
      round: 1,
      accepted: 0,
      verdict: "ESCALATE",
      history: [{ beauty: 8, jury: 80 }],
    }),
  );
  assert.equal(escalateWins?.rule, "escalate");
  const none = elevateStopWhen(
    snap({
      round: 3,
      maxRounds: 3,
      accepted: 0,
      verdict: "PASS",
      history: [
        { beauty: 7, jury: 70 },
        { beauty: 7, jury: 70 },
        { beauty: 7, jury: 70 },
      ],
    }),
  );
  assert.equal(none?.rule, "no-picks");
  assertPlain(none as ElevateStop);

  await replay({
    accept: false,
    scoresFor: () => ({ beauty: 8, jury: 90 }),
    verdictFor: () => "PASS",
    expect: {
      roundsRun: 1,
      rule: "no-picks",
      reason: /Nothing was chosen this round/,
    },
  });
});

test("the loop stops at the round limit when scores keep rising", { timeout: 90_000 }, async () => {
  const limit = elevateStopWhen(
    snap({
      round: 3,
      accepted: 1,
      verdict: "PASS",
      history: [
        { beauty: 6, jury: 60 },
        { beauty: 6.5, jury: 60.5 },
        { beauty: 7, jury: 61 },
      ],
    }),
  );
  assert.equal(limit?.rule, "max-rounds");
  assertPlain(limit as ElevateStop);

  const scores: ElevateScores[] = [
    { beauty: 6, jury: 60 },
    { beauty: 6.5, jury: 60.5 },
    { beauty: 7, jury: 61 },
  ];
  await replay({
    accept: true,
    scoresFor: (round) => {
      const row = scores[round - 1];
      if (row === undefined) throw new Error("The design score for this round is missing.");
      return row;
    },
    verdictFor: () => "PASS",
    expect: {
      roundsRun: 3,
      rule: "max-rounds",
      reason: /every round they are allowed/,
    },
  });
});

test("a flat design score and jury score stops before the round limit", { timeout: 90_000 }, async () => {
  const under = elevateStopWhen(
    snap({
      round: 2,
      accepted: 1,
      verdict: "PASS",
      history: [
        { beauty: 7, jury: 70 },
        { beauty: 7 + ELEVATE_SCORE_GAIN - 0.01, jury: 70 + ELEVATE_SCORE_GAIN - 0.01 },
      ],
    }),
  );
  assert.equal(under?.rule, "plateau");
  assertPlain(under as ElevateStop);

  const exact = elevateStopWhen(
    snap({
      round: 2,
      accepted: 1,
      verdict: "PASS",
      history: [
        { beauty: 7, jury: 70 },
        { beauty: 7 + ELEVATE_SCORE_GAIN, jury: 70 + ELEVATE_SCORE_GAIN },
      ],
    }),
  );
  assert.equal(exact, null);

  const oneClimbs = elevateStopWhen(
    snap({
      round: 2,
      accepted: 1,
      verdict: "PASS",
      history: [
        { beauty: 7, jury: 70 },
        { beauty: 8, jury: 70 },
      ],
    }),
  );
  assert.equal(oneClimbs, null);

  const tooSoon = elevateStopWhen(
    snap({
      round: 1,
      accepted: 1,
      verdict: "PASS",
      history: [{ beauty: 7, jury: 70 }],
    }),
  );
  assert.equal(tooSoon, null);

  await replay({
    accept: true,
    scoresFor: (round) => (round === 1 ? { beauty: 7, jury: 70 } : { beauty: 7.1, jury: 70.1 }),
    verdictFor: () => "PASS",
    expect: {
      roundsRun: 2,
      rule: "plateau",
      reason: /barely moved over the last two rounds/,
    },
  });
});

test("an escalate verdict stops the loop even when a pick was accepted", { timeout: 60_000 }, async () => {
  const stop = elevateStopWhen(
    snap({
      round: 1,
      accepted: 1,
      verdict: "Round note: ESCALATE",
      history: [{ beauty: 9, jury: 95 }],
    }),
  );
  assert.equal(stop?.rule, "escalate");
  assertPlain(stop as ElevateStop);
  assert.equal(stop?.reason.includes("ESCALATE"), false);

  await replay({
    accept: true,
    scoresFor: () => ({ beauty: 9, jury: 95 }),
    verdictFor: () => "ESCALATE",
    expect: {
      roundsRun: 1,
      rule: "escalate",
      reason: /needs a person to decide/,
    },
  });
});

test("stopWhen can end the loop before a built-in rule fires", { timeout: 60_000 }, async () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-extra-"));
  const scripted: typeof think = async () => ({
    value: PLAN_PAYLOAD,
    raw: JSON.stringify(PLAN_PAYLOAD),
    durationMs: 1,
    cassette: "live",
  });
  try {
    await initRepo(projectDir);
    const run = await runOnce(projectDir, scripted, {
      accept: true,
      scoresFor: () => ({ beauty: 6, jury: 60 }),
      verdictFor: () => "PASS",
      stopWhen: () => ({
        rule: "caller",
        reason: "The towel shop asked to pause here.",
      }),
      expect: { roundsRun: 1, rule: "caller", reason: /asked to pause/ },
    });
    assert.equal(run.result.roundsRun, 1);
    assert.equal(run.result.stop.rule, "caller");
    assert.match(run.result.stop.reason, /asked to pause/);
    assertPlain(run.result.stop);
    assert.equal(run.gateCalls, 1);
    assert.equal(run.prompts, 1);
    await assertGatesMatchHead(projectDir, run.result.gates);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
});
