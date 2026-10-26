/**
 * BUG-034b: a dead running row is recovered from its log, and Resume
 * continues the queue once.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  continueSiteBuild,
  decideBuildRecovery,
  loadQueue,
  logHasCleanEnd,
  prepareSiteBuild,
  readBuildRun,
  recoverSiteBuild,
  resetSiteBuildWatch,
  resumeSiteBuild,
  runBuildWatchdog,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const DEAD_PID = 999_999;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-034b-"));
}

function result(code: number): { code: number; stdout: string; stderr: string; errorCode: null } {
  return { code, stdout: "", stderr: "", errorCode: null };
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(400)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  removeTempDir(dir);
}

async function queueFrom(dir: string, running: string): Promise<void> {
  await prepareSiteBuild(dir, "Brief.");
  const items = ["001", "002", "003", "004", "005", "006"].map((id) => ({
    id,
    kind: "build" as const,
    status: (id === running ? "running" : id < running ? "passed" : "queued") as "running" | "passed" | "queued",
  }));
  await saveQueue(dir, { items });
}

function promptIdWith(dir: string, needle: string): string {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  const names = readdirSync(folder).filter((name) => name.endsWith(".md")).sort();
  for (const name of names) {
    if (readFileSync(path.join(folder, name), "utf8").includes(needle)) return name.slice(0, -3);
  }
  throw new Error(`missing prompt containing ${needle}`);
}

async function queueLogo(dir: string): Promise<{ logo: string; next: string }> {
  await prepareSiteBuild(dir, "Brief.");
  const logo = promptIdWith(dir, "public/logo.svg");
  const next = String(Number(logo) + 1).padStart(3, "0");
  const items = ["001", "002", "003", "004", "005", "006", "007", "008"].map((id) => ({
    id,
    kind: "build" as const,
    status: (id === logo ? "running" : id < logo ? "passed" : "queued") as "running" | "passed" | "queued",
  }));
  await saveQueue(dir, { items });
  return { logo, next };
}

function writeRunning(dir: string, promptId: string, recoveryRerun = false): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "build-run.json"),
    `${JSON.stringify({
      promptId,
      status: "running",
      model: BUILD_MODEL,
      effort: BUILD_EFFORT,
      startedAt: "2026-10-13T00:00:00.000Z",
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid: null,
      recovery: "",
      recoveryRerun,
    })}\n`,
    "utf8",
  );
}

function writeEnd(dir: string, promptId: string): void {
  const logs = path.join(dir, ".hitchhiker", "logs");
  mkdirSync(logs, { recursive: true });
  writeFileSync(path.join(logs, `build-${promptId}.log`), '{"type":"end","stopReason":"end_turn"}\n', "utf8");
}

function writeLogo(dir: string): void {
  mkdirSync(path.join(dir, "public"), { recursive: true });
  mkdirSync(path.join(dir, "src", "components"), { recursive: true });
  writeFileSync(path.join(dir, "public", "logo.svg"), "<svg></svg>\n", "utf8");
  writeFileSync(path.join(dir, "src", "components", "Logo.astro"), "---\n---\n", "utf8");
}

function spawnCounting(seen: string[]): BuildSpawn {
  return (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    assert.ok(request.args.includes(BUILD_MODEL));
    assert.ok(request.args.includes(BUILD_EFFORT));
    return { pid: DEAD_PID, done: Promise.resolve(result(0)) };
  };
}

test("recovery decisions: clean end, missing end, missing outputs, and a prior rerun", () => {
  assert.equal(logHasCleanEnd('{"type":"end","stopReason":"end_turn"}\n'), true);
  assert.equal(logHasCleanEnd('{"type":"end","stopReason":"cancelled"}\n'), false);
  assert.equal(logHasCleanEnd("still writing\n"), false);
  assert.deepEqual(
    decideBuildRecovery({ promptId: "003", cleanEnd: true, outputsExist: true, rerunAlready: false }),
    { action: "verify" },
  );
  assert.deepEqual(
    decideBuildRecovery({ promptId: "003", cleanEnd: false, outputsExist: true, rerunAlready: false }),
    { action: "rerun", reason: "003 rerun after restart" },
  );
  assert.deepEqual(
    decideBuildRecovery({ promptId: "003", cleanEnd: true, outputsExist: false, rerunAlready: false }),
    { action: "rerun", reason: "003 rerun after restart" },
  );
  assert.deepEqual(
    decideBuildRecovery({ promptId: "003", cleanEnd: false, outputsExist: false, rerunAlready: true }),
    { action: "interrupt", reason: "003 rerun after restart" },
  );
});

test("clean end plus outputs runs the gate and marks the prompt passed", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  let gates = 0;
  setProjectBuildRunner(dir, spawnCounting(seen));
  try {
    const { logo, next } = await queueLogo(dir);
    setSiteBuildGate(dir, (info) => {
      if (info.promptId !== logo) return;
      gates += 1;
      assert.ok(info.files.includes("public/logo.svg"));
    });
    const prompt = readFileSync(path.join(dir, ".hitchhiker", "prompts", `${logo}.md`), "utf8");
    assert.match(prompt, /public\/logo\.svg/);
    assert.match(prompt, /src\/components\/Logo\.astro/);
    writeRunning(dir, logo);
    writeEnd(dir, logo);
    writeLogo(dir);
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === logo)?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === next)?.status, "passed");
    assert.equal(seen.includes(logo), false);
    assert.equal(seen[0], next);
    assert.equal(gates, 1);
    const run = readBuildRun(dir);
    assert.match(run?.recovery ?? "", new RegExp(`${logo} recovered: output verified, passed`));
    assert.equal(run?.model, BUILD_MODEL);
    assert.equal(run?.effort, BUILD_EFFORT);
  } finally {
    await cleanup(dir);
  }
});

test("no clean end reruns the prompt once in a fresh session", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  setProjectBuildRunner(dir, spawnCounting(seen));
  try {
    await queueFrom(dir, "003");
    writeRunning(dir, "003");
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.equal(seen[0], "003");
    assert.equal(seen.filter((id) => id === "003").length, 1);
    assert.equal(seen.includes("004"), true);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "003")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "004")?.status, "passed");
    assert.match(readBuildRun(dir)?.recovery ?? "", /003 rerun after restart/);
  } finally {
    await cleanup(dir);
  }
});

test("a clean end with missing outputs reruns instead of passing", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  setProjectBuildRunner(dir, spawnCounting(seen));
  try {
    await queueFrom(dir, "003");
    writeRunning(dir, "003");
    writeEnd(dir, "003");
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.equal(seen[0], "003");
    assert.match(readBuildRun(dir)?.recovery ?? "", /003 rerun after restart/);
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === "003")?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("a failing gate marks the recovered prompt failed and does not advance", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  setProjectBuildRunner(dir, spawnCounting(seen));
  setSiteBuildGate(dir, () => {
    throw new Error("gate broke");
  });
  try {
    const { logo, next } = await queueLogo(dir);
    writeRunning(dir, logo);
    writeEnd(dir, logo);
    writeLogo(dir);
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, []);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === logo)?.status, "failed");
    assert.equal(queue?.items.find((item) => item.id === next)?.status, "queued");
    assert.match(readBuildRun(dir)?.reason ?? "", /gate broke/);
    assert.notEqual(readBuildRun(dir)?.status, "running");
  } finally {
    await cleanup(dir);
  }
});

test("a second restart does not auto-rerun a prompt that already reran", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  setProjectBuildRunner(dir, spawnCounting(seen));
  try {
    await queueFrom(dir, "003");
    writeRunning(dir, "003", true);
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.deepEqual(seen, []);
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === "003")?.status, "interrupted");
    assert.match(readBuildRun(dir)?.reason ?? "", /003 rerun after restart/);
  } finally {
    await cleanup(dir);
  }
});

test("the watchdog recovers a dead running row that is not in this process", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  setProjectBuildRunner(dir, spawnCounting(seen));
  try {
    const { logo, next } = await queueLogo(dir);
    writeRunning(dir, logo);
    writeEnd(dir, logo);
    writeLogo(dir);
    runBuildWatchdog(dir);
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    assert.equal(seen.includes(logo), false);
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === logo)?.status, "passed");
    assert.equal((await loadQueue(dir))?.items.find((item) => item.id === next)?.status, "passed");
    assert.match(readBuildRun(dir)?.recovery ?? "", new RegExp(`${logo} recovered: output verified, passed`));
  } finally {
    await cleanup(dir);
  }
});

test("two Resume calls share one spawn and then the next prompt runs", { timeout: 15_000 }, async () => {
  const dir = tempDir();
  const seen: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    if (request.promptId === "003") {
      return { pid: DEAD_PID, done: gate.then(() => result(0)) };
    }
    return { pid: DEAD_PID, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "passed" },
        { id: "002", kind: "build", status: "passed" },
        { id: "003", kind: "build", status: "interrupted" },
        { id: "004", kind: "build", status: "queued" },
      ],
    });
    const first = resumeSiteBuild(dir, "003");
    const second = resumeSiteBuild(dir, "003");
    await first;
    await second;
    for (let attempt = 0; attempt < 40 && !seen.includes("003"); attempt += 1) await delay(25);
    assert.deepEqual(seen, ["003"]);
    await continueSiteBuild(dir);
    await delay(40);
    assert.deepEqual(seen, ["003"]);
    release();
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "003")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "004")?.status, "passed");
    assert.match(readBuildRun(dir)?.recovery ?? "", /003 rerun after restart/);
    assert.equal(seen.filter((id) => id === "003").length, 1);
  } finally {
    release();
    await cleanup(dir);
  }
});
