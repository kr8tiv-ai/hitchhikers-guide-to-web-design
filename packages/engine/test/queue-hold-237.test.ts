/**
 * BUG-042: desk start holds a legacy paused queue and an interrupted running
 * row. It does not rewrite the other rows and it does not start a prompt.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  ensureSiteBuild,
  holdInterruptedQueue,
  loadQueue,
  recoverSiteBuild,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
  type QueueFile,
} from "../src/index.ts";

const WHEN = "2026-10-15T12:00:00.000Z";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-hold-237-"));
}

function legacyItems(): QueueFile["items"] {
  const items: QueueFile["items"] = [];
  for (let index = 1; index <= 11; index += 1) {
    const id = String(index).padStart(3, "0");
    const status = index <= 7 ? "passed" : index === 8 ? "paused" : "queued";
    items.push({ id, kind: "build", status });
  }
  return items;
}

function writePrompts(dir: string, ids: readonly string[]): void {
  const prompts = path.join(dir, ".hitchhiker", "prompts");
  mkdirSync(prompts, { recursive: true });
  for (const id of ids) writeFileSync(path.join(prompts, `${id}.md`), `Prompt ${id}\n`, "utf8");
}

function writeRunning(dir: string, promptId: string, pid: number | null = null): void {
  const folder = path.join(dir, ".hitchhiker");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "build-run.json"),
    `${JSON.stringify({
      promptId,
      status: "running",
      model: BUILD_MODEL,
      effort: BUILD_EFFORT,
      startedAt: WHEN,
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid,
      recovery: "",
      recoveryRerun: false,
    })}\n`,
    "utf8",
  );
}

async function park(dir: string, queue: QueueFile): Promise<string[]> {
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    return { pid: 999_999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  setProjectBuildRunner(dir, spawn);
  await saveQueue(dir, queue);
  return seen;
}

test("a legacy paused queue is held after the last finished prompt", async () => {
  const dir = tempDir();
  try {
    writePrompts(dir, ["008", "009"]);
    const seen = await park(dir, { items: legacyItems() });
    const before = (await loadQueue(dir))?.items.map((item) => ({ id: item.id, status: item.status }));
    assert.equal(await holdInterruptedQueue(dir, new Date(WHEN)), true);
    const loaded = await loadQueue(dir);
    assert.deepEqual(
      loaded?.items.map((item) => ({ id: item.id, status: item.status })),
      before,
    );
    assert.deepEqual(loaded?.pause, { at: WHEN, after: "007" });
    await recoverSiteBuild(dir);
    await ensureSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, []);
  } finally {
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an interrupted running item is held and the other rows stay", async () => {
  const dir = tempDir();
  try {
    const items = legacyItems().map((item) => (item.id === "008" ? { ...item, status: "running" as const } : item));
    writePrompts(dir, ["008", "009"]);
    writeRunning(dir, "008");
    const seen = await park(dir, { items });
    const before = items.map((item) => ({ id: item.id, status: item.status }));
    assert.equal(await holdInterruptedQueue(dir, new Date(WHEN)), true);
    const loaded = await loadQueue(dir);
    assert.deepEqual(
      loaded?.items.map((item) => ({ id: item.id, status: item.status })),
      before,
    );
    assert.equal(loaded?.items.find((item) => item.id === "008")?.status, "running");
    assert.deepEqual(loaded?.pause, { at: WHEN, after: "007" });
    await recoverSiteBuild(dir);
    await ensureSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, []);
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === "008")?.status, "running");
  } finally {
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a live running prompt is left alone", async () => {
  const dir = tempDir();
  try {
    const items = legacyItems().map((item) => (item.id === "008" ? { ...item, status: "running" as const } : item));
    writePrompts(dir, ["008"]);
    writeRunning(dir, "008", process.pid);
    const seen = await park(dir, { items });
    assert.equal(await holdInterruptedQueue(dir, new Date(WHEN)), false);
    const loaded = await loadQueue(dir);
    assert.equal(loaded?.pause, undefined);
    assert.equal(loaded?.items.find((item) => item.id === "008")?.status, "running");
    await recoverSiteBuild(dir);
    await ensureSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, []);
  } finally {
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});
