/**
 * hh brief, hh elevate, hh so-long, and hh build ask the one transition table.
 * Imports stay inside this package. The table itself is loaded by file URL,
 * the same way the commands reach it.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { saveState, type GuideState } from "@hitchhiker/engine";
import { runBriefCommand } from "../src/commands/brief.ts";
import { runBuildCommand } from "../src/commands/context.ts";
import { runElevateCommand } from "../src/commands/elevate.ts";
import { runSoLongCommand } from "../src/commands/so-long.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const phaseLockHref = pathToFileURL(
  fileURLToPath(new URL("../../orchestrator/src/phase-lock.ts", import.meta.url)),
).href;
const loaded: unknown = await import(phaseLockHref);
assert.ok(loaded !== null && typeof loaded === "object" && "flowFilePath" in loaded);
const flowFilePath = (loaded as { flowFilePath: unknown }).flowFilePath;
assert.equal(typeof flowFilePath, "function");
const savedFlowPath = flowFilePath as (projectDir: string) => string;

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-phase-lock-"));
}

function guide(phase: GuideState["phase"]): GuideState {
  return {
    phase,
    slice: "The Guide",
    promptId: "interview:DP-1.1",
    lastGoodCommit: "abc1234",
    blockers: ["hold the towel"],
    nextAction: "answer",
    updatedAt: "2026-10-22T12:00:00.000Z",
  };
}

function savedPhase(projectDir: string): string {
  const raw: unknown = JSON.parse(readFileSync(savedFlowPath(projectDir), "utf8"));
  assert.ok(raw !== null && typeof raw === "object" && "phase" in raw);
  return String((raw as { phase: unknown }).phase);
}

test("hh brief, hh elevate, hh so-long, and hh build call the table", async () => {
  const brief = readFileSync(path.join(here, "../src/commands/brief.ts"), "utf8");
  const elevate = readFileSync(path.join(here, "../src/commands/elevate.ts"), "utf8");
  const soLong = readFileSync(path.join(here, "../src/commands/so-long.ts"), "utf8");
  const context = readFileSync(path.join(here, "../src/commands/context.ts"), "utf8");
  const flowEntry = readFileSync(path.join(here, "../src/commands/flow-entry.ts"), "utf8");

  for (const source of [brief, elevate, soLong, context]) assert.match(source, /enterCliFlow\(/);
  assert.match(flowEntry, /phase-lock\.ts/);
  assert.match(flowEntry, /enterFlow/);

  const dir = tempProject();
  try {
    await saveState(dir, guide("Don't Panic"));
    writeFileSync(savedFlowPath(dir), `${JSON.stringify({ phase: "so-long" }, null, 2)}\n`, "utf8");
    const shown = await runBriefCommand(["--project", dir], dir, (async () => {
      throw new Error("think should not run");
    }) as never);
    assert.equal(shown.exitCode, 1);
    assert.match(shown.stdout, /Go back one step at a time/);
    assert.equal(savedPhase(dir), "so-long");

    const usage = await runBriefCommand(["--nope"], dir);
    assert.equal(usage.exitCode, 2);
    assert.doesNotMatch(usage.stdout, /Finish the/);

    await saveState(dir, guide("Don't Panic"));
    removeTempDir(savedFlowPath(dir));
    const approved = await runBriefCommand(["--approve", "--project", dir], dir, (async () => {
      throw new Error("think should not run");
    }) as never);
    assert.equal(approved.exitCode, 1);
    assert.equal(approved.stdout, "Finish the brief before the design.\n");
    assert.equal(existsSync(savedFlowPath(dir)), false);

    const elevated = await runElevateCommand(["--project", dir], { cwd: dir });
    assert.equal(elevated.exitCode, 1);
    assert.equal(elevated.stdout, "Finish the brief before Elevate.\n");
    const help = await runElevateCommand(["--help"], { cwd: dir });
    assert.equal(help.exitCode, 0);
    assert.match(help.stdout, /Usage: hh elevate/);

    const publish = await runSoLongCommand(["--project", dir], { cwd: dir });
    assert.equal(publish.exitCode, 1);
    assert.equal(publish.stdout, "Finish the brief before publishing.\n");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md")), false);
    const soLongHelp = await runSoLongCommand(["--help"], { cwd: dir });
    assert.equal(soLongHelp.exitCode, 0);
    assert.match(soLongHelp.stdout, /hh so-long/);

    const buildUsage = await runBuildCommand(["--project", dir], dir);
    assert.equal(buildUsage.exitCode, 2);
    assert.doesNotMatch(buildUsage.stdout, /Finish the/);
    const build = await runBuildCommand(["--resume", "--project", dir], dir);
    assert.equal(build.exitCode, 1);
    assert.equal(build.stdout, "Finish the brief before building.\n");
  } finally {
    removeTempDir(dir);
  }

  const fresh = tempProject();
  try {
    const resumed = await runBuildCommand(["--resume", "--project", fresh], fresh);
    assert.equal(resumed.exitCode, 1);
    assert.equal(resumed.stdout, "No site build is queued.\n");
    assert.equal(savedPhase(fresh), "build");
  } finally {
    removeTempDir(fresh);
  }
});
