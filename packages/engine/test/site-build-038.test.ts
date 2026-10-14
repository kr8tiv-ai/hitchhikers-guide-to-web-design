/**
 * BUG-038: a 402 usage-balance failure fails the prompt with a plain
 * top-up sentence, pauses the queue, and raises an escalation.
 * Retry is the only resume. Model and effort stay xhigh.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BILLING_TOP_UP,
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  continueSiteBuild,
  ensureSiteBuild,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  resetSiteBuildWatch,
  retrySiteBuild,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";

const DEAD_PID = 999_999;
const RUN3 = "API error (status 402 Payment Required): Grok Build usage balance exhausted";
const JSON_TAIL = '"costUsdTicks": 9514179200 } }, "numTurns": 33 } }';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-038-"));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

async function queueFour(dir: string): Promise<void> {
  await prepareSiteBuild(dir, "Brief.");
  await saveQueue(dir, {
    items: ["001", "002", "003", "004"].map((id) => ({ id, kind: "build" as const, status: "queued" as const })),
  });
}

async function cleanup(dir: string): Promise<void> {
  await siteBuildSettled(dir).catch(() => undefined);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  rmSync(dir, { recursive: true, force: true });
}

test("a 402 exit fails with the top-up sentence, pauses, and does not start the next prompt", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    assert.equal(BUILD_MODEL, "grok-4.7-build-fast");
    assert.equal(BUILD_EFFORT, "xhigh");
    if (request.promptId === "003") {
      request.onOutput?.(`${RUN3}\n`);
      request.onOutput?.(`${JSON_TAIL}\n`);
      return {
        pid: DEAD_PID,
        done: Promise.resolve({ code: 1, stdout: "", stderr: RUN3, errorCode: null }),
      };
    }
    return { pid: DEAD_PID, done: Promise.resolve(ok()) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001", "002", "003"]);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "passed");
    assert.equal(queue?.items[2]?.status, "failed");
    assert.equal(queue?.items[3]?.status, "paused");
    const run = readBuildRun(dir);
    assert.equal(run?.promptId, "003");
    assert.equal(run?.status, "failed");
    assert.equal(run?.paused, true);
    assert.equal(run?.reason, BILLING_TOP_UP);
    assert.equal(run?.escalation, BILLING_TOP_UP);
    assert.equal(run?.model, "grok-4.7-build-fast");
    assert.equal(run?.effort, "xhigh");
    const shown = `${run?.reason ?? ""}\n${(run?.lastLines ?? []).join("\n")}`;
    assert.equal(shown.includes("{"), false);
    assert.equal(shown.includes("}"), false);
    assert.equal(shown.includes("exited with code 1"), false);
    const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-003.log"), "utf8");
    assert.match(log, /usage balance exhausted/);
    assert.equal(await continueSiteBuild(dir), "idle");
    assert.deepEqual(seen, ["001", "002", "003"]);
    const held = await loadQueue(dir);
    assert.equal(held?.items[2]?.status, "failed");
    assert.equal(held?.items[3]?.status, "paused");
  } finally {
    await cleanup(dir);
  }
});

test("Retry re-runs the failed prompt and then the paused one", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    const prior = seen.filter((id) => id === request.promptId).length;
    seen.push(request.promptId);
    if (request.promptId === "003" && prior === 0) {
      request.onOutput?.(RUN3);
      return {
        pid: DEAD_PID,
        done: Promise.resolve({ code: 1, stdout: "", stderr: "", errorCode: null }),
      };
    }
    return { pid: DEAD_PID, done: Promise.resolve(ok()) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.equal(readBuildRun(dir)?.reason, BILLING_TOP_UP);
    await retrySiteBuild(dir, "003");
    await siteBuildSettled(dir);
    assert.deepEqual(seen, ["001", "002", "003", "003", "004"]);
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    const run = readBuildRun(dir);
    assert.equal(run?.paused, false);
    assert.equal(run?.escalation ?? "", "");
    assert.equal(run?.status, "passed");
    assert.equal(run?.promptId, "004");
  } finally {
    await cleanup(dir);
  }
});

test("a 402 that arrives only on stderr still pauses", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    if (request.promptId === "001") {
      return {
        pid: DEAD_PID,
        done: Promise.resolve({ code: 1, stdout: "", stderr: RUN3, errorCode: null }),
      };
    }
    return { pid: DEAD_PID, done: Promise.resolve(ok()) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001"]);
    assert.equal(readBuildRun(dir)?.reason, BILLING_TOP_UP);
    assert.equal(readBuildRun(dir)?.paused, true);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "paused");
  } finally {
    await cleanup(dir);
  }
});

test("a 429 stays a usage limit and does not pause the queue", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    if (request.promptId === "001") {
      return {
        pid: DEAD_PID,
        done: Promise.resolve({
          code: 1,
          stdout: "",
          stderr: "API error (status 429): too many requests",
          errorCode: null,
        }),
      };
    }
    return { pid: DEAD_PID, done: Promise.resolve(ok()) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001"]);
    const run = readBuildRun(dir);
    assert.match(run?.reason ?? "", /usage limit/);
    assert.equal(run?.paused ?? false, false);
    assert.equal(run?.escalation ?? "", "");
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
  } finally {
    await cleanup(dir);
  }
});

test("an ordinary exit whose tail is JSON does not show braces", async () => {
  const dir = tempDir();
  const spawn: BuildSpawn = (request) => {
    if (request.promptId === "001") {
      request.onOutput?.(`${JSON_TAIL}\n`);
      return {
        pid: DEAD_PID,
        done: Promise.resolve({ code: 1, stdout: JSON_TAIL, stderr: JSON_TAIL, errorCode: null }),
      };
    }
    return { pid: DEAD_PID, done: Promise.resolve(ok()) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const run = readBuildRun(dir);
    const shown = `${run?.reason ?? ""}\n${(run?.lastLines ?? []).join("\n")}`;
    assert.equal(shown.includes("{"), false);
    assert.equal(shown.includes("}"), false);
    assert.match(run?.reason ?? "", /exited with code 1/);
    assert.equal(run?.paused ?? false, false);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[1]?.status, "queued");
    const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-001.log"), "utf8");
    assert.match(log, /costUsdTicks/);
  } finally {
    await cleanup(dir);
  }
});
