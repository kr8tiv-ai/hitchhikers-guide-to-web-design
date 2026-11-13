/**
 * 250b: a build must not report as started when no runner is installed,
 * or when the live runner cannot resolve grok.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { dealDirections, saveDirectionDeal, chooseDirection, readDirectionDeal } from "../src/brand/directions.ts";
import {
  approveSiteBrief,
  approveSitePlan,
  readBriefDesk,
  startSiteBuild,
} from "../src/guide/brief-desk.ts";
import { approveRequiredSketches } from "../src/spec/comps.ts";
import { writeDesignLock } from "../src/spec/design-lock.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";
import type { SiteBrief } from "../src/guide/schemas.ts";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  ensureSiteBuild,
  getBuildRunner,
  installLiveBuildRunner,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  setBuildRunner,
  siteBuildSettled,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const NO_RUNNER = "The build could not start: no build runner is installed. Run hh doctor.";
const GROK_MISSING = "grok is not on PATH. Run hh doctor.";
const LINE = "The site helps a visitor book a visit.";

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

function think(req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> {
  if (req.task !== "brief-draft") return Promise.reject(new Error(req.task));
  const brief = sampleBrief();
  return Promise.resolve({ value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" });
}

function passStages(dir: string, brief: string): void {
  advanceDesignStages(dir, { brief, approval: { stage: "sitemap", text: "Approved." } });
  advanceDesignStages(dir, { brief, approval: { stage: "wireframe", text: "Approved." } });
  let deal = readDirectionDeal(dir);
  if (deal === null || deal.pickedId === null) {
    if (deal === null) {
      deal = dealDirections();
      saveDirectionDeal(dir, deal);
    }
    const first = deal.directions[0];
    if (first === undefined) throw new Error("No direction was dealt.");
    chooseDirection(dir, first.id, "It fits the visit.");
    deal = readDirectionDeal(dir) ?? deal;
  }
  if (deal.pickedId === null) throw new Error("No direction was dealt.");
  const refs = path.join(dir, "reference", "refs");
  mkdirSync(refs, { recursive: true });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  for (let index = 0; index < 6; index += 1) {
    const file = path.join(refs, `shot-${index}.png`);
    if (!existsSync(file)) writeFileSync(file, png);
  }
  advanceDesignStages(dir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  writeDesignLock(dir, deal.pickedId);
  advanceDesignStages(dir, { brief, approval: { stage: "direction", text: "Approved." } });
  advanceDesignStages(dir, { brief, approval: { stage: "prebuild", text: "Approved." } });
  approveRequiredSketches(dir, png);
}

async function readyToBuild(dir: string): Promise<void> {
  await approveSiteBrief(dir, think as never);
  await approveSitePlan(dir);
  passStages(dir, readBriefDesk(dir).markdown);
}

test("no build runner records a desk error and does not mark the build started", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-250b-norunner-"));
  const previous = getBuildRunner();
  setBuildRunner(null);
  clearProjectBuildRunner(dir);
  try {
    await readyToBuild(dir);
    const started = await startSiteBuild(dir);
    assert.equal(started.buildStarted, false);
    assert.equal(started.error, NO_RUNNER);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "build-run.json")), false);
    await assert.rejects(() => ensureSiteBuild(dir), new RegExp(NO_RUNNER.replace(/[.]/g, "\\.")));
    const again = readBriefDesk(dir);
    assert.equal(again.buildStarted, false);
    assert.equal(again.error, NO_RUNNER);
  } finally {
    setBuildRunner(previous);
    clearProjectBuildRunner(dir);
    await siteBuildSettled(dir);
    removeTempDir(dir);
  }
});

test("missing grok fails the desk before the build is marked started", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-250b-nogrok-"));
  const previous = getBuildRunner();
  clearProjectBuildRunner(dir);
  installLiveBuildRunner({ PATH: "", Path: "" });
  try {
    await readyToBuild(dir);
    const started = await startSiteBuild(dir);
    assert.equal(started.buildStarted, false);
    assert.match(started.error, /grok is not on PATH/);
    assert.match(started.error, /Run hh doctor\./);
    assert.equal(started.error, GROK_MISSING);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), false);
    assert.notEqual(started.nextAction, "The build is started.");
    const desk = readBriefDesk(dir);
    assert.equal(desk.buildStarted, false);
    assert.equal(desk.error, GROK_MISSING);
  } finally {
    setBuildRunner(previous);
    clearProjectBuildRunner(dir);
    await siteBuildSettled(dir);
    removeTempDir(dir);
  }
});

test("the live runner still returns code 127 when grok is missing and the queue records it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-250b-live127-"));
  const previous = getBuildRunner();
  clearProjectBuildRunner(dir);
  installLiveBuildRunner({ PATH: "", Path: "" });
  try {
    const spawn = getBuildRunner();
    assert.ok(spawn);
    const handle = spawn({
      command: "grok",
      args: [],
      cwd: dir,
      promptId: "001",
      model: BUILD_MODEL,
      effort: BUILD_EFFORT,
    });
    const result = await handle.done;
    assert.equal(result.code, 127);
    assert.match(result.stderr, /grok is not on PATH\. Run hh doctor\./);
    await prepareSiteBuild(dir, LINE);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[0]?.id, "001");
    assert.match(readBuildRun(dir)?.reason ?? "", /grok is not on PATH\. Run hh doctor\./);
  } finally {
    setBuildRunner(previous);
    clearProjectBuildRunner(dir);
    await siteBuildSettled(dir);
    removeTempDir(dir);
  }
});
