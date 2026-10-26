/**
 * BUG-031: the site build moves queued -> running -> passed/failed/interrupted
 * only while a stub process is alive. Spawn args stay on grok-4.7-build-fast / xhigh.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildSpawnArgs,
  clearProjectBuildRunner,
  ensureSiteBuild,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  reconcileSiteBuild,
  resumeSiteBuild,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  BUILD_EFFORT,
  BUILD_MODEL,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { startLivePid } from "./live-pid.ts";
import { removeTempDir } from "./remove-temp.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-build-"));
}

function result(code: number | null, stderr = ""): BuildSpawnResult {
  return { code, stdout: "", stderr, errorCode: code === 127 ? "ENOENT" : null };
}

function hold(): { promise: Promise<BuildSpawnResult>; release: (result: BuildSpawnResult) => void } {
  let release: (value: BuildSpawnResult) => void = () => undefined;
  const promise = new Promise<BuildSpawnResult>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("spawn args name grok-4.7-build-fast and effort xhigh", () => {
  const args = buildSpawnArgs("C:\\work\\site", "C:\\work\\site\\.hitchhiker\\prompts\\001.md");
  const modelAt = args.indexOf("-m");
  const effortAt = args.indexOf("--effort");
  assert.equal(args[modelAt + 1], "grok-4.7-build-fast");
  assert.equal(args[effortAt + 1], "xhigh");
  assert.equal(BUILD_MODEL, "grok-4.7-build-fast");
  assert.equal(BUILD_EFFORT, "xhigh");
});

test("a stub run passes, records files, and a second ensure does not spawn again", async () => {
  const dir = tempDir();
  let calls = 0;
  // The promise exists before spawn. Cleanup can release it even when the
  // build has not reached the runner yet, so a live pid cannot sit until the
  // idle watchdog.
  const held = hold();
  let markRunning: () => void = () => undefined;
  const sawRunning = new Promise<void>((resolve) => {
    markRunning = resolve;
  });
  const live = startLivePid();
  const spawn: BuildSpawn = (request) => {
    calls += 1;
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    assert.ok(request.args.includes("-m"));
    assert.ok(request.args.includes("grok-4.7-build-fast"));
    assert.ok(request.args.includes("--effort"));
    assert.ok(request.args.includes("xhigh"));
    if (request.promptId === "001") {
      writeFileSync(path.join(request.cwd, "index.html"), "<p>Home</p>\n", "utf8");
    }
    request.onOutput?.("Writing the home page");
    if (request.promptId === "001") {
      markRunning();
      return { pid: live.pid, done: held.promise };
    }
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    const ids = await prepareSiteBuild(dir, "## Goal\n\nThe site helps a visitor book a visit.\n");
    assert.ok(ids.includes("001"));
    assert.equal(ids.includes("guide-entry"), false);
    const prompt = readFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "utf8");
    assert.match(prompt, /## Context packet/);
    assert.match(prompt, /model: grok-4.7-build-fast/);
    assert.match(prompt, /effort: xhigh/);
    assert.match(prompt, /book a visit/);
    const first = ensureSiteBuild(dir);
    const second = ensureSiteBuild(dir);
    assert.equal(first, second);
    const outcome = await Promise.race([
      sawRunning.then(() => "running" as const),
      first.then(() => "settled" as const),
    ]);
    assert.equal(outcome, "running");
    assert.equal(readBuildRun(dir)?.status, "running");
    assert.equal(calls, 1);
    const during = readBuildRun(dir);
    assert.equal(during?.model, "grok-4.7-build-fast");
    assert.equal(during?.effort, "xhigh");
    assert.match(during?.lastLines.join("\n") ?? "", /Writing the home page/);
    assert.ok((during?.filesWritten ?? []).includes("index.html"));
    held.release(result(0));
    await first;
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "passed");
    assert.equal(existsSync(path.join(dir, "index.html")), true);
    const after = calls;
    await ensureSiteBuild(dir);
    assert.equal(calls, after);
  } finally {
    held.release(result(0));
    live.stop();
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});

test("a non-zero exit fails the row, stops the queue, and names a usage limit", async () => {
  const dir = tempDir();
  let calls = 0;
  const spawn: BuildSpawn = () => {
    calls += 1;
    return { pid: 424242, done: Promise.resolve(result(1, "usage limit reached")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.equal(calls, 1);
    assert.match(readBuildRun(dir)?.reason ?? "", /usage limit/);
    assert.equal((readBuildRun(dir)?.reason ?? "").includes("!"), false);
  } finally {
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});

test("a missing grok command is a failed row, not a running one", async () => {
  const dir = tempDir();
  const spawn: BuildSpawn = () => ({
    pid: 0,
    done: Promise.resolve({ code: 127, stdout: "", stderr: "grok is not on PATH. Run hh doctor.", errorCode: "ENOENT" }),
  });
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.match(readBuildRun(dir)?.reason ?? "", /grok is not on PATH/);
  } finally {
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});

test("a stale running row is interrupted and other running rows stay", async () => {
  const dir = tempDir();
  try {
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "running" },
        { id: "002", kind: "build", status: "running" },
      ],
    });
    writeFileSync(
      path.join(dir, ".hitchhiker", "build-run.json"),
      `${JSON.stringify({
        promptId: "001",
        status: "running",
        model: "grok-4.7-build-fast",
        effort: "xhigh",
        startedAt: "2026-10-13T00:00:00.000Z",
        elapsedMs: 10,
        lastLines: [],
        filesWritten: [],
        reason: "",
        pid: null,
      })}\n`,
      "utf8",
    );
    assert.equal(await reconcileSiteBuild(dir), true);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "interrupted");
    assert.equal(queue?.items[1]?.status, "running");
    assert.match(readBuildRun(dir)?.reason ?? "", /stopped before it finished/);
    await saveQueue(dir, { items: [{ id: "009", kind: "build", status: "running" }] });
    writeFileSync(path.join(dir, ".hitchhiker", "build-run.json"), "", "utf8");
    assert.equal(await reconcileSiteBuild(dir), false);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "running");
  } finally {
    removeTempDir(dir);
  }
});

test("resume runs an interrupted prompt through the same stub", async () => {
  const dir = tempDir();
  let calls = 0;
  const spawn: BuildSpawn = (request) => {
    calls += 1;
    if (request.promptId !== "001") return { pid: 424242, done: Promise.resolve(result(0)) };
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "interrupted" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await resumeSiteBuild(dir, "001");
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "passed");
    assert.ok(calls >= 1);
  } finally {
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});
