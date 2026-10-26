/**
 * BUG-042: Pause holds the whole queue. The running prompt may finish.
 * The next prompt stays put until Resume, including after a restart.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  ensureSiteBuild,
  loadQueue,
  pauseQueue,
  recoverSiteBuild,
  resumePausedQueue,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const WHEN = "2026-10-15T12:00:00.000Z";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-pause-237-"));
}

function result(code: number): BuildSpawnResult {
  return { code, stdout: "", stderr: "", errorCode: null };
}

function seed(dir: string): void {
  const prompts = path.join(dir, ".hitchhiker", "prompts");
  mkdirSync(prompts, { recursive: true });
  writeFileSync(path.join(prompts, "001.md"), "Prompt 001\n", "utf8");
  writeFileSync(path.join(prompts, "002.md"), "Prompt 002\n", "utf8");
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(300)]);
  clearProjectBuildRunner(dir);
  removeTempDir(dir);
}

test("pause during a running item lets it finish and holds the next item", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  let release: (value: BuildSpawnResult) => void = () => undefined;
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    if (request.promptId === "001") {
      let settle: (value: BuildSpawnResult) => void = () => undefined;
      const done = new Promise<BuildSpawnResult>((resolve) => {
        settle = resolve;
      });
      release = settle;
      return { pid: 999_999, done };
    }
    return { pid: 999_999, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    seed(dir);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    const job = ensureSiteBuild(dir);
    let running = false;
    for (let attempt = 0; attempt < 50 && !running; attempt += 1) {
      running = (await loadQueue(dir))?.items.find((item) => item.id === "001")?.status === "running";
      if (!running) await delay(20);
    }
    assert.equal(running, true);
    const paused = pauseQueue((await loadQueue(dir)) ?? { items: [] }, new Date(WHEN));
    await saveQueue(dir, paused);
    assert.equal(paused.pause?.at, WHEN);
    assert.equal(paused.pause?.after, "");
    release(result(0));
    await job;
    const finished = await loadQueue(dir);
    assert.equal(finished?.items.find((item) => item.id === "001")?.status, "passed");
    assert.equal(finished?.items.find((item) => item.id === "002")?.status, "queued");
    assert.deepEqual(seen, ["001"]);
    assert.equal(finished?.pause?.at, WHEN);
    assert.equal(finished?.pause?.after, "001");

    const onDisk = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "queue.json"), "utf8")) as {
      pause?: { at?: string; after?: string };
    };
    const reread = await loadQueue(dir);
    assert.equal(onDisk.pause?.at, WHEN);
    assert.equal(onDisk.pause?.after, "001");
    assert.deepEqual(reread?.pause, { at: WHEN, after: "001" });

    await recoverSiteBuild(dir);
    await ensureSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, ["001"]);
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === "002")?.status, "queued");

    await resumePausedQueue(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, ["001", "002"]);
    const resumed = await loadQueue(dir);
    assert.equal(resumed?.pause, undefined);
    assert.equal(resumed?.items.find((item) => item.id === "002")?.status, "passed");
  } finally {
    release(result(0));
    await cleanup(dir);
  }
});
