/**
 * One Elevate round, the detail pass, and copy approval (prompt 131).
 * The cassette is written in a temp directory and replayed. No live token.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig, think, type SpawnLike, type ThinkRequest } from "@hitchhiker/engine";
import {
  COPY_REFINE_SCHEMA,
  COPY_REFINE_TASK,
  approveCopy,
  copyCards,
  proposeCopy,
  type CopyProposal,
} from "../src/copy-refine.ts";
import { DETAIL_AREAS, detailChecks, writeDetailPrompts } from "../src/detail-pass.ts";
import { elevateRound, type GateResult } from "../src/elevate-loop.ts";
import type { ElevateItem } from "../src/elevate.ts";
import { startFixtureSite } from "../src/playwright-opener.ts";
import { REVIEW_WIDTHS } from "../src/screenshots.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");

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
    {
      file: "src/story.tsx",
      change: "Pin the origin story for one viewport",
      pass: "standout",
      feature: "scroll-storytelling",
      phone: "a short still",
      reducedMotion: "the still, no pin",
    },
    {
      file: "src/button.tsx",
      change: "add a magnetic hover",
      pass: "motion",
      phone: "none",
      reducedMotion: "none",
    },
    {
      file: "../secret.ts",
      change: "Read a token from disk",
      pass: "copy",
      phone: "same",
      reducedMotion: "same",
    },
  ],
};

const BRAND = "A quiet towel shop. Paper, ink, and one green stitch.";
const VOICE = "Short sentences. Concrete nouns. No hype.";
const MOTION = "One pinned story on the desktop. A still on the phone.";
const SOURCE = "export function Hero() { return null; }\n";

function clearGates(): GateResult {
  return { lh: "PASS", a11y: "PASS", console: "PASS", links: "PASS", weight: "PASS" };
}

function codeOf(error: Error | null): number {
  if (error === null) return 0;
  if ("code" in error && typeof error.code === "number") return error.code;
  return 1;
}

function git(dir: string, args: readonly string[]): Promise<void> {
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
      {
        windowsHide: true,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Hitchhiker",
          GIT_AUTHOR_EMAIL: "hh@localhost",
          GIT_COMMITTER_NAME: "Hitchhiker",
          GIT_COMMITTER_EMAIL: "hh@localhost",
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr.trim().length > 0 ? stderr.trim() : error.message;
          reject(new Error(detail));
          return;
        }
        resolve();
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

function scriptedThink(value: unknown): typeof think {
  return async () => ({
    value,
    raw: JSON.stringify(value),
    durationMs: 1,
    cassette: "live",
  });
}

function runHh(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const main = path.join(repo, "packages", "cli", "src", "main.ts");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["--experimental-strip-types", main, ...args],
      { cwd: repo, windowsHide: true, encoding: "utf8", timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error !== null && error.message.includes("spawn") && !("code" in error)) {
          reject(error);
          return;
        }
        resolve({
          code: codeOf(error),
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        });
      },
    );
  });
}

test("a cassette round keeps one pick and refuses a Lighthouse regression", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-round-"));
  const cassetteDir = path.join(root, "cassettes");
  const projectA = path.join(root, "a");
  const projectB = path.join(root, "b");
  let spawns = 0;
  let replaySpawns = 0;
  const seen: ThinkRequest<unknown>[] = [];
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
  const recorded: typeof think = (request, deps) => {
    seen.push(request);
    return think(request, {
      ...deps,
      spawnImpl,
      projectDir: projectA,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "" },
    });
  };
  const replayed: typeof think = (request, deps) =>
    think(request, {
      ...deps,
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

  async function oneRound(projectDir: string, model: typeof think): Promise<void> {
    let gateCalls = 0;
    const prompts: string[] = [];
    const result = await elevateRound(projectDir, {
      think: model,
      pick: async (items) => {
        const stranger: ElevateItem = { file: "src/stranger.tsx", change: "A line that was not planned" };
        return [...items, stranger];
      },
      runPrompt: async (file) => {
        prompts.push(file);
        writeFileSync(path.join(projectDir, "site.txt"), `${file}\n`, "utf8");
        await git(projectDir, ["add", "-A"]);
        await git(projectDir, ["commit", "-m", "apply pick"]);
      },
      gates: async () => {
        gateCalls += 1;
        if (gateCalls === 3) return { ...clearGates(), lh: "BLOCKER" };
        return clearGates();
      },
    });
    assert.deepEqual(result.applied, ["r1-01"]);
    assert.equal(result.refused.length, 1);
    const refused = result.refused[0];
    assert.ok(refused);
    assert.equal(refused.id, "r1-02");
    assert.match(refused.reason, /Lighthouse/);
    assert.match(refused.reason, /BLOCKER/);
    assert.equal(gateCalls, 3);
    assert.equal(prompts.length, 2);
    const kept = path.join(projectDir, ".hitchhiker", "prompts", "elevate", "r1-01.md");
    const prompt = readFileSync(kept, "utf8");
    assert.equal(prompt.includes("Open the tracking on the display line"), true);
    assert.equal(prompt.includes("packages/engine/src/spec/site-rules.ts"), true);
    assert.equal(prompt.includes("antihero.community"), true);
    assert.equal(prompt.includes("Apply only this upgrade."), true);
    assert.equal(prompt.includes("Pin the origin story"), false);
    assert.equal(prompt.includes("!"), false);
    assert.equal(readFileSync(path.join(projectDir, "site.txt"), "utf8").trim(), kept);
    const round = readFileSync(path.join(projectDir, ".hitchhiker", "elevate", "ROUND-1.md"), "utf8");
    assert.match(round, /^# Round 1/m);
    assert.match(round, /r1-01 kept\./);
    assert.match(round, /r1-02 refused\./);
    assert.match(round, /Lighthouse/);
    assert.equal(round.includes("!"), false);
    assert.equal(round.includes("\u2014"), false);
  }

  try {
    await initRepo(projectA);
    await initRepo(projectB);
    await oneRound(projectA, recorded);
    assert.equal(spawns, 1);
    const request = seen[0];
    assert.ok(request);
    assert.equal(request.task, "elevate-plan");
    assert.equal(request.effort, "xhigh");
    assert.equal(replaySpawns, 0);
    await oneRound(projectB, replayed);
    assert.equal(spawns, 1);
    assert.equal(replaySpawns, 0);
    const saved = readdirSync(path.join(cassetteDir, "elevate-plan")).filter((name) => name.endsWith(".json"));
    assert.equal(saved.length, 1);
    assert.equal(existsSync(path.join(repo, "packages", "qa", "test", "cassettes", "elevate-plan")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no picks ends the round without gates or prompts", { timeout: 60_000 }, async () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-none-"));
  let gateCalls = 0;
  let promptCalls = 0;
  try {
    plant(projectDir);
    const result = await elevateRound(projectDir, {
      think: scriptedThink(PLAN_PAYLOAD),
      pick: async () => [],
      runPrompt: async () => {
        promptCalls += 1;
      },
      gates: async () => {
        gateCalls += 1;
        return clearGates();
      },
    });
    assert.deepEqual(result, { applied: [], refused: [] });
    assert.equal(gateCalls, 0);
    assert.equal(promptCalls, 0);
    const round = readFileSync(path.join(projectDir, ".hitchhiker", "elevate", "ROUND-1.md"), "utf8");
    assert.match(round, /This round changes nothing\./);
    assert.equal(existsSync(path.join(projectDir, "site.txt")), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("every regressing pick is refused and nothing is kept", { timeout: 60_000 }, async () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-regress-"));
  let gateCalls = 0;
  try {
    await initRepo(projectDir);
    const result = await elevateRound(projectDir, {
      think: scriptedThink(PLAN_PAYLOAD),
      pick: async (items) => items,
      runPrompt: async (file) => {
        writeFileSync(path.join(projectDir, "site.txt"), `${file}\n`, "utf8");
        await git(projectDir, ["add", "-A"]);
        await git(projectDir, ["commit", "-m", "apply pick"]);
      },
      gates: async () => {
        gateCalls += 1;
        if (gateCalls === 1) return clearGates();
        return { ...clearGates(), lh: "BLOCKER" };
      },
    });
    assert.deepEqual(result.applied, []);
    assert.equal(result.refused.length, 2);
    for (const row of result.refused) {
      assert.match(row.reason, /Lighthouse/);
      assert.match(row.reason, /BLOCKER/);
    }
    const round = readFileSync(path.join(projectDir, ".hitchhiker", "elevate", "ROUND-1.md"), "utf8");
    assert.match(round, /Nothing was kept\./);
    assert.equal(existsSync(path.join(projectDir, "site.txt")), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("detail checks report every area on the fixture site", { timeout: 180_000 }, async () => {
  const site = await startFixtureSite();
  try {
    const report = await detailChecks(site.url);
    assert.deepEqual(
      report.map((row) => row.area),
      [...DETAIL_AREAS],
    );
    for (const row of report) {
      assert.equal(row.note.trim().length > 0, true, row.area);
      assert.equal(row.note.includes("!"), false, row.note);
      assert.equal(row.note.includes("\u2014"), false, row.note);
    }
    const ok = new Map(report.map((row) => [row.area, row]));
    const expectOk = (area: string, pass: boolean): void => {
      const row = ok.get(area);
      assert.ok(row, area);
      assert.equal(row.ok, pass, `${area}: ${row.note}`);
    };
    expectOk("favicon", true);
    expectOk("og-image", false);
    expectOk("404", false);
    expectOk("print", false);
    expectOk("kerning", true);
    expectOk("optical-alignment", true);
    expectOk("hover", false);
    expectOk("focus", true);
    expectOk("empty", false);
    expectOk("error", false);
  } finally {
    await site.close();
  }
});

test("detail prompts cover each area and cite the site rules", async () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-detail-"));
  try {
    const files = await writeDetailPrompts(projectDir);
    assert.equal(files.length, DETAIL_AREAS.length);
    for (const area of DETAIL_AREAS) {
      const file = path.join(projectDir, ".hitchhiker", "prompts", "detail", `${area}.md`);
      const text = readFileSync(file, "utf8");
      assert.equal(files.includes(file), true);
      assert.match(text, /packages\/engine\/src\/spec\/site-rules\.ts/);
      assert.equal(text.includes("!"), false);
      assert.equal(text.includes("\u2014"), false);
      assert.equal(/\belevate\b/i.test(text), false);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("copy proposals drop banned lines and a write needs approval", async () => {
  const pages = ["Reserve a towel\nCome in when you are ready.\n"];
  const seen: ThinkRequest<unknown>[] = [];
  const model: typeof think = async (request) => {
    seen.push(request);
    return {
      value: {
        rewrites: [
          { id: "towel", before: "Reserve a towel", after: "Hold a towel", why: "The line stays concrete." },
          { id: "bang", before: "Reserve a towel", after: "Book a call!", why: "A sharper ask." },
          { id: "hype", before: "Reserve a towel", after: "Unlock a seamless visit", why: "A broader promise." },
          { id: "stars", before: "Reserve a towel", after: "Loved by 5 stars", why: "Social proof." },
          { id: "missing", before: "This line is not on the page", after: "A quiet line", why: "It was not there." },
        ],
      },
      raw: "{}",
      durationMs: 1,
      cassette: "live",
    };
  };
  const proposals = await proposeCopy(pages, VOICE, { think: model });
  assert.deepEqual(proposals, [
    { id: "towel", before: "Reserve a towel", after: "Hold a towel", why: "The line stays concrete." },
  ]);
  const request = seen[0];
  assert.ok(request);
  assert.equal(request.task, COPY_REFINE_TASK);
  assert.equal(request.effort, "xhigh");
  const cards = copyCards(proposals);
  assert.match(cards, /approve or reject/);
  assert.equal(cards.includes("!"), false);

  const approvedDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-copy-"));
  const rejected: CopyProposal = {
    id: "bang",
    before: "Reserve a towel",
    after: "Book a call!",
    why: "A sharper ask.",
  };
  try {
    const saved = await approveCopy(
      approvedDir,
      [...proposals, rejected],
      [
        { id: "towel", approve: true },
        { id: "bang", approve: true },
      ],
    );
    assert.ok(saved.file);
    assert.equal(path.basename(saved.file), "copy.md");
    const body = readFileSync(saved.file, "utf8");
    assert.equal(body.includes("Hold a towel"), true);
    assert.equal(body.includes("Book a call!"), false);
    assert.deepEqual(saved.approved, ["towel"]);
    assert.deepEqual(saved.rejected, ["bang"]);

    const noneDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-copy-none-"));
    const existing = path.join(noneDir, ".hitchhiker", "prompts", "elevate", "copy.md");
    mkdirSync(path.dirname(existing), { recursive: true });
    writeFileSync(existing, "keep this\n", "utf8");
    const skipped = await approveCopy(
      noneDir,
      proposals,
      proposals.map((item) => ({ id: item.id, approve: false })),
    );
    assert.equal(skipped.file, null);
    assert.equal(readFileSync(existing, "utf8"), "keep this\n");

    const smuggledDir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-copy-bang-"));
    const smuggled = await approveCopy(smuggledDir, [rejected], [{ id: "bang", approve: true }]);
    assert.equal(smuggled.file, null);
    assert.equal(existsSync(path.join(smuggledDir, ".hitchhiker", "prompts", "elevate", "copy.md")), false);
    rmSync(noneDir, { recursive: true, force: true });
    rmSync(smuggledDir, { recursive: true, force: true });
  } finally {
    rmSync(approvedDir, { recursive: true, force: true });
  }
});

test("copy refinement replays a recorded cassette through the adapter", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-copy-cassette-"));
  const cassetteDir = path.join(root, "cassettes");
  const projectDir = path.join(root, "project");
  const pages = ["Reserve a towel\nCome in when you are ready.\n"];
  const payload = {
    rewrites: [
      { id: "towel", before: "Reserve a towel", after: "Hold a towel", why: "The line stays concrete." },
      { id: "bang", before: "Reserve a towel", after: "Book a call!", why: "A sharper ask." },
    ],
  };
  let spawns = 0;
  let replaySpawns = 0;
  let args: readonly string[] = [];
  const seen: ThinkRequest<unknown>[] = [];
  const spawnImpl: SpawnLike = async (request) => {
    spawns += 1;
    args = request.args;
    return {
      status: 0,
      stdout: JSON.stringify({
        text: JSON.stringify(payload),
        stopReason: "end_turn",
        usage: { input_tokens: 11, output_tokens: 17 },
      }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  const recorded: typeof think = (request, deps) => {
    seen.push(request);
    return think(request, {
      ...deps,
      spawnImpl,
      projectDir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "" },
    });
  };
  const replayed: typeof think = (request, deps) =>
    think(request, {
      ...deps,
      spawnImpl: async () => {
        replaySpawns += 1;
        throw new Error("spawned during replay");
      },
      projectDir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "replay", PATH: "" },
    });

  try {
    mkdirSync(projectDir, { recursive: true });
    const first = await proposeCopy(pages, VOICE, { think: recorded });
    assert.equal(spawns, 1);
    assert.deepEqual(first, [
      { id: "towel", before: "Reserve a towel", after: "Hold a towel", why: "The line stays concrete." },
    ]);
    const request = seen[0];
    assert.ok(request);
    assert.equal(request.task, COPY_REFINE_TASK);
    assert.equal(request.task, "copy-refine");
    assert.equal(request.effort, "xhigh");
    assert.equal(request.schema, COPY_REFINE_SCHEMA);
    assert.equal(COPY_REFINE_SCHEMA.properties?.rewrites?.maxItems, 8);
    assert.equal(request.input.includes(VOICE), true);
    assert.equal(request.input.includes("Reserve a towel"), true);
    assert.equal(args.includes("--json-schema"), true);
    assert.equal(args.includes("--effort"), true);
    assert.equal(args.includes("xhigh"), true);
    assert.equal(
      args.some((arg) => arg.includes("\"rewrites\"")),
      true,
    );
    const saved = readdirSync(path.join(cassetteDir, "copy-refine")).filter((name) => name.endsWith(".json"));
    assert.equal(saved.length, 1);
    const second = await proposeCopy(pages, VOICE, { think: replayed });
    assert.equal(spawns, 1);
    assert.equal(replaySpawns, 0);
    assert.deepEqual(second, first);
    assert.equal(existsSync(path.join(repo, "packages", "qa", "test", "cassettes", "copy-refine")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hh elevate help is wired and a bare command names the project", async () => {
  const help = await runHh(["elevate", "--help"]);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /hh elevate --project/);
  assert.equal(help.stdout.includes("!"), false);
  const bare = await runHh(["elevate"]);
  assert.equal(bare.code, 2, bare.stderr);
  assert.match(bare.stdout, /--project/);
});
