/**
 * BUG-055. Approve plan opens the design stages.
 * Start build is the only call that spawns the billed runner.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { dealDirections, saveDirectionDeal, chooseDirection } from "../src/brand/directions.ts";
import {
  approveSiteBrief,
  approveSitePlan,
  readBriefDesk,
  startSiteBuild,
} from "../src/guide/brief-desk.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";
import { clearProjectBuildRunner, setProjectBuildRunner, siteBuildSettled, type BuildSpawn } from "../src/guide/site-build.ts";
import { loadQueue } from "../src/queue-file.ts";
import { loadState } from "../src/state.ts";
import type { SiteBrief } from "../src/guide/schemas.ts";

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
  advanceDesignStages(dir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  const deal = dealDirections();
  saveDirectionDeal(dir, deal);
  const first = deal.directions[0];
  if (first === undefined) throw new Error("No direction was dealt.");
  chooseDirection(dir, first.id, "It fits the visit.");
  advanceDesignStages(dir, { brief, approval: { stage: "direction", text: "Approved." } });
  advanceDesignStages(dir, { brief, approval: { stage: "prebuild", text: "Approved." } });
}

test("plan approval and every design stage spawn nothing, and Start build spawns once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-gate-242b-"));
  let calls = 0;
  let release: (code: number) => void = () => undefined;
  const gate = new Promise<number>((resolve) => {
    release = resolve;
  });
  const spawn: BuildSpawn = (request) => {
    calls += 1;
    if (request.promptId === "001") {
      return { pid: 242055, done: gate.then((code) => ({ code, stdout: "", stderr: "", errorCode: null })) };
    }
    return { pid: 242055, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await approveSiteBrief(dir, think as never);
    const planned = await approveSitePlan(dir);
    assert.equal(planned.planApproved, true);
    assert.equal(planned.buildStarted, false);
    assert.equal(calls, 0);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "build-run.json")), false);
    assert.notEqual(loadState(dir)?.phase, "Babel Fish");
    const brief = readBriefDesk(dir).markdown;
    passStages(dir, brief);
    assert.equal(calls, 0);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), false);
    const started = await startSiteBuild(dir);
    for (let attempt = 0; attempt < 40 && calls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(calls, 1);
    assert.equal(started.buildStarted, true);
    assert.equal(started.nextAction, "The build is started.");
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.id, "001");
    assert.equal(queue?.items[0]?.kind, "build");
    const again = await startSiteBuild(dir);
    assert.equal(again.buildStarted, true);
    assert.equal(calls, 1);
    release(0);
    await siteBuildSettled(dir);
  } finally {
    release(0);
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});
