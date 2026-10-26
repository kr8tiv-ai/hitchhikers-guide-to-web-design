/**
 * BUG-034: a prompt settles once when the child exits or the stream ends,
 * even if stdio `close` never arrives, and a dead child cannot stay running.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_EXIT_GRACE_MS,
  BUILD_MODEL,
  BUILD_WATCHDOG_INTERVAL_MS,
  clearProjectBuildRunner,
  configureSiteBuildWatch,
  ensureSiteBuild,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  siteBuildWatchConfig,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const DEAD_PID = 999_999;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-034-"));
}

function never(): Promise<BuildSpawnResult> {
  return new Promise(() => undefined);
}

function result(code: number | null, stderr = ""): BuildSpawnResult {
  return { code, stdout: "", stderr, errorCode: code === 127 ? "ENOENT" : null };
}

async function queueFour(dir: string): Promise<void> {
  await prepareSiteBuild(dir, "Brief.");
  await saveQueue(dir, {
    items: ["001", "002", "003", "004"].map((id) => ({ id, kind: "build" as const, status: "queued" as const })),
  });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(300)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  removeTempDir(dir);
}

test("watch defaults stay at 30s and the build model stays xhigh", () => {
  const config = siteBuildWatchConfig();
  assert.equal(BUILD_WATCHDOG_INTERVAL_MS, 30_000);
  assert.equal(config.intervalMs, 30_000);
  assert.equal(BUILD_EXIT_GRACE_MS >= 1_000, true);
  assert.equal(config.exitGraceMs, BUILD_EXIT_GRACE_MS);
  assert.equal(BUILD_MODEL, "grok-4.7-build-fast");
  assert.equal(BUILD_EFFORT, "xhigh");
});

test("end before exit settles once and advances when close never arrives", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  let gates = 0;
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    request.onOutput?.('{"type":"en');
    request.onOutput?.('d","stopReason":"end_turn"}\n');
    if (request.promptId === "003") writeFileSync(path.join(dir, "logo.svg"), "<svg></svg>\n", "utf8");
    let resolveExit: (code: number | null) => void = () => undefined;
    const exited = new Promise<number | null>((resolve) => {
      resolveExit = resolve;
    });
    setTimeout(() => resolveExit(0), request.promptId === "003" ? 40 : 0);
    return { pid: DEAD_PID, done: never(), exited };
  };
  setProjectBuildRunner(dir, spawn);
  setSiteBuildGate(dir, () => {
    gates += 1;
  });
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    assert.deepEqual(seen, ["001", "002", "003", "004"]);
    assert.equal(gates, 4);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "passed");
    assert.equal(run?.model, "grok-4.7-build-fast");
    assert.equal(run?.effort, "xhigh");
    assert.equal(run?.promptId, "004");
    assert.ok((run?.filesWritten ?? []).includes("logo.svg"));
    const frozen = run?.elapsedMs;
    await delay(30);
    assert.equal(readBuildRun(dir)?.elapsedMs, frozen);
    assert.equal(readBuildRun(dir)?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("exit before the stream end settles once and starts the next prompt", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  let endSent = false;
  let releaseEnd: () => void = () => undefined;
  const endGate = new Promise<void>((resolve) => {
    releaseEnd = resolve;
  });
  const spawn: BuildSpawn = (request) => {
    if (request.promptId === "002") {
      assert.equal(endSent, false);
      releaseEnd();
    }
    if (request.promptId !== "001") {
      return { pid: DEAD_PID, done: never(), exited: Promise.resolve(0) };
    }
    let resolveExit: (code: number | null) => void = () => undefined;
    const exited = new Promise<number | null>((resolve) => {
      resolveExit = resolve;
    });
    setTimeout(() => resolveExit(0), 10);
    void endGate.then(() => {
      endSent = true;
      request.onOutput?.('{"type":"end","stopReason":"end_turn"}\n');
    });
    return { pid: DEAD_PID, done: never(), exited };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    assert.equal(endSent, true);
    assert.equal(readBuildRun(dir)?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("a stream end with no exit settles after the grace and advances", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  configureSiteBuildWatch(dir, { intervalMs: 60_000, idleMs: 60 * 60 * 1000, exitGraceMs: 30 });
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    request.onOutput?.('{"type":"end","stopReason":"end_turn"}\n');
    return { pid: DEAD_PID, done: never() };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001", "002", "003", "004"]);
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    assert.equal(readBuildRun(dir)?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("exit with no end event still settles and advances", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    return { pid: DEAD_PID, done: never(), exited: Promise.resolve(0) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001", "002", "003", "004"]);
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("a non-zero exit with no close fails the row and does not advance", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    return { pid: DEAD_PID, done: never(), exited: Promise.resolve(1) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001"]);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /exited with code 1/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("a rejected settlement marks the prompt failed", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const spawn: BuildSpawn = () => ({
    pid: DEAD_PID,
    done: Promise.reject(new Error("settle exploded")),
  });
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /settle exploded/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("a throwing gate marks the prompt failed and does not advance", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  let gates = 0;
  const spawn: BuildSpawn = () => ({ pid: DEAD_PID, done: Promise.resolve(result(0)) });
  setProjectBuildRunner(dir, spawn);
  setSiteBuildGate(dir, () => {
    gates += 1;
    throw new Error("gate broke");
  });
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    assert.equal(gates, 1);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /gate broke/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("a throw while spawning the next prompt fails that prompt", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const spawn: BuildSpawn = (request) => {
    if (request.promptId === "002") throw new Error("spawn broke");
    return { pid: DEAD_PID, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "failed");
    assert.equal(queue?.items[2]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /spawn broke/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("the watchdog fails a running row whose pid is already dead", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    return { pid: DEAD_PID, done: never() };
  };
  configureSiteBuildWatch(dir, { intervalMs: 40, idleMs: 60 * 60 * 1000, exitGraceMs: 60_000 });
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    const job = ensureSiteBuild(dir);
    let failed = false;
    for (let attempt = 0; attempt < 40 && !failed; attempt += 1) {
      failed = readBuildRun(dir)?.status === "failed";
      if (!failed) await delay(25);
    }
    await job;
    assert.equal(failed, true);
    assert.deepEqual(seen, ["001"]);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /ended without reporting/);
    const frozen = readBuildRun(dir)?.elapsedMs;
    await delay(40);
    assert.equal(readBuildRun(dir)?.elapsedMs, frozen);
    assert.equal(readBuildRun(dir)?.model, "grok-4.7-build-fast");
    assert.equal(readBuildRun(dir)?.effort, "xhigh");
  } finally {
    await cleanup(dir);
  }
});

test("the watchdog fails a live pid that has gone quiet", { timeout: 10_000 }, async () => {
  const dir = tempDir();
  const spawn: BuildSpawn = () => ({ pid: process.pid, done: never() });
  configureSiteBuildWatch(dir, { intervalMs: 40, idleMs: 0, exitGraceMs: 60_000 });
  setProjectBuildRunner(dir, spawn);
  try {
    await queueFour(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /ended without reporting/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});
