/**
 * BUG-031: `hh brief --approve` and `hh next --run` share the site build runner.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  advanceDesignStages,
  chooseDirection,
  clearProjectBuildRunner,
  dealDirections,
  loadQueue,
  readBriefDesk,
  readBuildRun,
  saveDirectionDeal,
  setProjectBuildRunner,
  siteBuildSettled,
  startSiteBuild,
  type BuildSpawn,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { runBriefCommand } from "../src/commands/brief.ts";
import { runCli } from "../src/main.ts";
import { startLivePid } from "./live-pid.ts";
import { removeTempDir } from "./remove-temp.ts";

async function until(ready: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    if (ready()) return true;
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
  return ready();
}

const LINE = "The site helps a visitor book a visit.";

function sample(): Record<string, string> {
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
    coverage: LINE,
  };
}

test("Start build and hh next --run spawn through the injected runner once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-cli-build-"));
  let calls = 0;
  let release: (code: number) => void = () => undefined;
  const gate = new Promise<number>((resolve) => {
    release = resolve;
  });
  let noteStart: () => void = () => undefined;
  const sawStart = new Promise<void>((resolve) => {
    noteStart = resolve;
  });
  const live = startLivePid();
  const spawn: BuildSpawn = (request) => {
    calls += 1;
    noteStart();
    assert.ok(request.args.includes("grok-4.7-build-fast"));
    assert.ok(request.args.includes("xhigh"));
    if (request.promptId === "001") {
      return {
        pid: live.pid,
        done: gate.then((code) => ({ code, stdout: "", stderr: "", errorCode: null })),
      };
    }
    return { pid: 424242, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  setProjectBuildRunner(dir, spawn);
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task !== "brief-draft") throw new Error(req.task);
    return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    const approved = await runBriefCommand(["--approve", "--project", dir], process.cwd(), think as never);
    assert.equal(approved.exitCode, 0);
    assert.doesNotMatch(approved.stdout, /The build is started/);
    assert.equal(calls, 0);
    const brief = readBriefDesk(dir).markdown;
    advanceDesignStages(dir, { brief, approval: { stage: "sitemap", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "wireframe", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "style-guide", text: "Approved." } });
    const deal = dealDirections();
    saveDirectionDeal(dir, deal);
    const first = deal.directions[0];
    assert.ok(first);
    chooseDirection(dir, first.id, "It fits the visit.");
    advanceDesignStages(dir, { brief, approval: { stage: "style-guide", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "direction", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "prebuild", text: "Approved." } });
    assert.equal(calls, 0);
    const started = await startSiteBuild(dir);
    assert.equal(started.buildStarted, true);
    await sawStart;
    assert.equal(await until(() => readBuildRun(dir)?.status === "running"), true);
    assert.equal(calls, 1);
    const finished = await runCli(["next", "--run", "--project", dir]);
    assert.equal(calls, 1);
    release(0);
    assert.equal(finished.exitCode, 0);
    assert.match(finished.stdout, /The build is started/);
    await siteBuildSettled(dir);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    release(0);
    live.stop();
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});
