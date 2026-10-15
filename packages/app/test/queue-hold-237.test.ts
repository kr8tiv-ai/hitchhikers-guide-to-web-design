/**
 * BUG-042: desk start holds a legacy paused queue and an interrupted running
 * row. Drive shows paused. Nothing starts until Resume.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  loadQueue,
  saveQueue,
  siteBuildSettled,
  type BuildSpawn,
  type QueueFile,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const WHEN = "2026-10-15T12:00:00.000Z";
const PAUSE_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seed(dir: string): void {
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    `questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  for (const id of ["008", "009"]) {
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", `${id}.md`), `Prompt ${id}\n`, "utf8");
  }
}

function legacyItems(eighth: "paused" | "running" | "queued"): QueueFile["items"] {
  const items: QueueFile["items"] = [];
  for (let index = 1; index <= 11; index += 1) {
    const id = String(index).padStart(3, "0");
    const status = index <= 7 ? "passed" : index === 8 ? eighth : "queued";
    items.push({ id, kind: "build", status });
  }
  return items;
}

function writeRunning(dir: string): void {
  writeFileSync(
    path.join(dir, ".hitchhiker", "build-run.json"),
    `${JSON.stringify({
      promptId: "008",
      status: "running",
      model: BUILD_MODEL,
      effort: BUILD_EFFORT,
      startedAt: WHEN,
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid: null,
      recovery: "",
      recoveryRerun: false,
    })}\n`,
    "utf8",
  );
}

function raw(port: number, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

function guideThink(): (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>> {
  return async () => {
    throw new Error("desk start must not ask the model");
  };
}

async function boot(queue: QueueFile): Promise<{ dir: string; seen: string[]; handle: ServerHandle }> {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-hold-237-"));
  seed(dir);
  await saveQueue(dir, queue);
  const seen: string[] = [];
  const buildSpawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    return { pid: 999_999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  const handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
  return { dir, seen, handle };
}

async function assertHeld(
  dir: string,
  handle: ServerHandle,
  seen: string[],
  eighth: string,
  after: string,
  at?: string,
): Promise<void> {
  await delay(200);
  assert.deepEqual(seen, []);
  const loaded = await loadQueue(dir);
  assert.equal(loaded?.items.find((item) => item.id === "007")?.status, "passed");
  assert.equal(loaded?.items.find((item) => item.id === "008")?.status, eighth);
  assert.equal(loaded?.items.find((item) => item.id === "009")?.status, "queued");
  assert.equal(loaded?.items.find((item) => item.id === "011")?.status, "queued");
  assert.equal(loaded?.pause?.after, after);
  if (at === undefined) assert.match(loaded?.pause?.at ?? "", PAUSE_AT);
  else assert.equal(loaded?.pause?.at, at);
  const page = await raw(handle.port, "/hh-dashboard");
  assert.equal(page.status, 200);
  assert.match(page.body, /id="queue"[^>]*data-queue-state="paused"/);
  const banner = /<p data-queue-state="paused">([^<]*)<\/p>/.exec(page.body)?.[1] ?? "";
  assert.equal(banner, "The queue is paused.");
  assert.equal(banner.includes("\u2014"), false);
  await delay(150);
  assert.deepEqual(seen, []);
  const again = await loadQueue(dir);
  assert.equal(again?.items.find((item) => item.id === "008")?.status, eighth);
  assert.equal(again?.pause?.after, after);
}

test("desk start holds a legacy paused queue and Drive shows paused", { timeout: 20_000 }, async () => {
  const started = await boot({ items: legacyItems("paused") });
  try {
    await assertHeld(started.dir, started.handle, started.seen, "paused", "007");
  } finally {
    await siteBuildSettled(started.dir);
    await started.handle.close();
    rmSync(started.dir, { recursive: true, force: true });
  }
});

test("desk start holds an interrupted running prompt without rewriting rows", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-hold-237-run-"));
  seed(dir);
  writeRunning(dir);
  await saveQueue(dir, { items: legacyItems("running") });
  const seen: string[] = [];
  const buildSpawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    return { pid: 999_999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  const handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
  try {
    await assertHeld(dir, handle, seen, "running", "007");
  } finally {
    await siteBuildSettled(dir);
    await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desk start leaves an existing pause flag in place and does not start", { timeout: 20_000 }, async () => {
  const started = await boot({
    items: legacyItems("queued"),
    pause: { at: WHEN, after: "007" },
  });
  try {
    await assertHeld(started.dir, started.handle, started.seen, "queued", "007", WHEN);
  } finally {
    await siteBuildSettled(started.dir);
    await started.handle.close();
    rmSync(started.dir, { recursive: true, force: true });
  }
});
