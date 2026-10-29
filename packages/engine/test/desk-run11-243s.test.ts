/**
 * Desk Run 11: orphan dev-server output still settles a finished turn,
 * each prompt prunes .hitchhiker/tmp, and Playwright browser binaries
 * are not outside reads.
 */
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { spawnLiveBuild, type BuildSpawnRequest } from "../src/guide/site-build.ts";
import {
  auditOutsideAccess,
  clearProjectBuildRunner,
  configureSiteBuildWatch,
  ensureSiteBuild,
  loadQueue,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const WIN_CHROME = "C:\\Users\\lucid\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe";
const LINUX_CHROME = "/home/user/.cache/ms-playwright/chromium-1248/chrome-linux/chrome";
const MAC_CHROME = "/Users/annas/Library/Caches/ms-playwright/chromium-1248/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
const SECRET = "C:\\Users\\lucid\\Secret\\keys.txt";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-243s-"));
}

function never(): Promise<BuildSpawnResult> {
  return new Promise(() => undefined);
}

function result(code: number, stdout = "", stderr = ""): BuildSpawnResult {
  return { code, stdout, stderr, errorCode: null };
}

function toolCall(tool: string, input: Record<string, string>): string {
  return JSON.stringify({ type: "tool_call", toolName: tool, rawInput: input });
}

function ndjson(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

async function queueOne(dir: string): Promise<void> {
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "Prompt 001.\n", "utf8");
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.kill = () => true;
  return child;
}

test("orphan tool_call_update after usage settles with code 0 and stops the child", { timeout: 20_000 }, async () => {
  const dir = tempDir();
  let stopped = 0;
  let armedAt = 0;
  let gates = 0;
  configureSiteBuildWatch(dir, { intervalMs: 60_000, idleMs: 60 * 60 * 1000, exitGraceMs: 30 });
  const available = ndjson({
    type: "available_commands",
    commands: ["run_terminal_command"],
    blob: "b".repeat(24_000),
  });
  const usage = ndjson({ type: "usage", inputTokens: 12, outputTokens: 4, signature: "s".repeat(40_000) });
  assert.ok(available.length + usage.length > 32_000);
  assert.ok(available.length + usage.length < 128_000);
  const update = (id: string): string =>
    ndjson({ type: "tool_call_update", toolCallId: id, status: null, stdout: "astro dev ready" });
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.(`${available}\n${usage}`);
    setTimeout(() => {
      request.onOutput?.(`\n${update("call-05d0208e-61")}\n`);
      armedAt = Date.now();
    }, 1_000);
    setTimeout(() => {
      request.onOutput?.(`${update("call-05d0208e-62")}\n\n`);
    }, 4_500);
    return {
      pid: process.pid,
      done: never(),
      stop: () => {
        stopped += 1;
      },
    };
  };
  setProjectBuildRunner(dir, spawn);
  setSiteBuildGate(dir, () => {
    gates += 1;
  });
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    const elapsed = Date.now() - armedAt;
    assert.equal(stopped, 1);
    assert.equal(gates, 1);
    assert.ok(elapsed >= 4_500, `settled too soon: ${elapsed}ms`);
    assert.ok(elapsed < 7_500, `turn timer reset on orphan output: ${elapsed}ms`);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "passed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "passed");
    assert.equal(run?.reason ?? "", "");
  } finally {
    await cleanup(dir);
  }
});

test("tool_call then tool_call_update does not settle the turn", { timeout: 20_000 }, async () => {
  const dir = tempDir();
  let stopped = 0;
  let release: (value: BuildSpawnResult) => void = () => undefined;
  const done = new Promise<BuildSpawnResult>((resolve) => {
    release = resolve;
  });
  configureSiteBuildWatch(dir, { intervalMs: 60_000, idleMs: 60 * 60 * 1000, exitGraceMs: 30 });
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.(
      [
        ndjson({ type: "available_commands", commands: ["run_terminal_command"] }),
        ndjson({ type: "usage", inputTokens: 3, outputTokens: 1 }),
        ndjson({ type: "text", text: "still working" }),
        ndjson({ type: "thought", text: "still working" }),
        ndjson({ type: "thinking", text: "still working" }),
        ndjson({ type: "tool_call", toolName: "run_terminal_command", rawInput: { command: "pnpm dev" } }),
        ndjson({ type: "tool_call_update", toolCallId: "call-dev", status: null, stdout: "ready" }),
        ndjson({ type: "tool_call_update", toolCallId: "call-dev", status: null, stdout: "still ready" }),
      ].join("\n") + "\n",
    );
    return {
      pid: process.pid,
      done,
      stop: () => {
        stopped += 1;
      },
    };
  };
  setProjectBuildRunner(dir, spawn);
  let pending: Promise<void> | undefined;
  try {
    await queueOne(dir);
    pending = ensureSiteBuild(dir);
    await delay(6_500);
    assert.equal(stopped, 0);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "running");
    release(result(0));
    await pending;
    assert.equal(stopped, 0);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    release(result(0));
    if (pending !== undefined) await Promise.race([pending.catch(() => undefined), delay(8_000)]);
    await cleanup(dir);
  }
});

test("a prompt removes stale and in-prompt hitchhiker tmp entries", async () => {
  const dir = tempDir();
  const tmp = path.join(dir, ".hitchhiker", "tmp");
  mkdirSync(path.join(tmp, "stale-dir"), { recursive: true });
  writeFileSync(path.join(tmp, "stale-dir", "old.txt"), "old\n", "utf8");
  writeFileSync(path.join(tmp, "stale.txt"), "old\n", "utf8");
  const spawn: BuildSpawn = () => {
    assert.equal(existsSync(path.join(tmp, "stale.txt")), false);
    assert.equal(existsSync(path.join(tmp, "stale-dir")), false);
    mkdirSync(path.join(tmp, "during"), { recursive: true });
    writeFileSync(path.join(tmp, "during", "live.txt"), "live\n", "utf8");
    writeFileSync(path.join(tmp, "during.txt"), "live\n", "utf8");
    return { pid: process.pid, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    assert.equal(existsSync(tmp), true);
    assert.equal(statSync(tmp).isDirectory(), true);
    assert.deepEqual(readdirSync(tmp), []);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("spawnLiveBuild clears hitchhiker tmp before the child starts", () => {
  const root = tempDir();
  const project = path.join(root, "site-c");
  const tmp = path.join(project, ".hitchhiker", "tmp");
  mkdirSync(path.join(tmp, "nested"), { recursive: true });
  writeFileSync(path.join(tmp, "nested", "junk.txt"), "junk\n", "utf8");
  writeFileSync(path.join(tmp, "junk.txt"), "junk\n", "utf8");
  const child = fakeChild();
  const spawnImpl = (() => {
    assert.equal(existsSync(path.join(tmp, "junk.txt")), false);
    assert.equal(existsSync(path.join(tmp, "nested")), false);
    assert.deepEqual(readdirSync(tmp), []);
    return child;
  }) as typeof import("node:child_process").spawn;
  const request: BuildSpawnRequest = {
    command: "grok",
    args: ["--sandbox", "workspace"],
    cwd: project,
    promptId: "103",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
  };
  try {
    spawnLiveBuild("grok", request, { PATH: "C:\\Tools" }, { spawnImpl });
    assert.equal(existsSync(tmp), true);
    assert.equal(statSync(tmp).isDirectory(), true);
    assert.deepEqual(readdirSync(tmp), []);
    assert.equal(child.pid, 4242);
  } finally {
    child.stdout?.destroy();
    child.stderr?.destroy();
    removeTempDir(root);
  }
});

test("ms-playwright browser binaries are reads, and unrelated paths stay outside", () => {
  const project = "C:\\work\\site-c";
  const stream = [
    toolCall("read_file", { target_file: WIN_CHROME }),
    toolCall("run_terminal_command", { command: `& "${WIN_CHROME}" --headless --disable-gpu about:blank` }),
    toolCall("read_file", { target_file: LINUX_CHROME }),
    toolCall("run_terminal_command", { command: `${LINUX_CHROME} --headless --disable-gpu about:blank` }),
    toolCall("read_file", { target_file: MAC_CHROME }),
    toolCall("read_file", { target_file: SECRET }),
  ].join("\n");
  const audit = auditOutsideAccess(stream, project);
  const paths = audit.hits.map((hit) => hit.path.replace(/\\/g, "/").toLowerCase());
  assert.equal(paths.some((file) => file.includes("ms-playwright")), false);
  assert.equal(paths.some((file) => file.includes("chrome.exe")), false);
  assert.equal(audit.readPath.toLowerCase().includes("ms-playwright"), false);
  assert.equal(audit.writePath.toLowerCase().includes("ms-playwright"), false);
  assert.ok(paths.some((file) => file.includes("keys.txt")));
  assert.ok(audit.readPath.includes("keys.txt"));

  const redirected = auditOutsideAccess(
    toolCall("run_terminal_command", {
      command: `& "${WIN_CHROME}" --headless about:blank > C:\\work\\site-c\\shot.png`,
    }),
    project,
  );
  assert.equal(redirected.hits.some((hit) => hit.path.toLowerCase().includes("chrome.exe")), false);
  assert.equal(redirected.hits.some((hit) => hit.path.toLowerCase().includes("ms-playwright")), false);
  assert.equal(redirected.writePath, "");

  const wrote = auditOutsideAccess(
    [
      toolCall("search_replace", { file_path: WIN_CHROME }),
      toolCall("run_terminal_command", { command: `Set-Content -Path '${WIN_CHROME}' -Value x` }),
      toolCall("read_file", { target_file: LINUX_CHROME }),
    ].join("\n"),
    project,
  );
  assert.ok(wrote.writePath.toLowerCase().includes("ms-playwright"));
  assert.ok(wrote.hits.some((hit) => hit.tool === "search_replace" && hit.path.toLowerCase().includes("chrome.exe")));
  assert.equal(wrote.hits.some((hit) => hit.tool === "read_file" && hit.path.includes("chrome-linux")), false);

  const posix = auditOutsideAccess(
    [
      toolCall("read_file", { target_file: LINUX_CHROME }),
      toolCall("run_terminal_command", { command: `${LINUX_CHROME} --headless` }),
      toolCall("read_file", { target_file: WIN_CHROME }),
      toolCall("read_file", { target_file: "/home/user/Secret/keys.txt" }),
    ].join("\n"),
    "/tmp/site-c",
  );
  assert.equal(posix.hits.some((hit) => hit.path.includes("ms-playwright")), false);
  assert.equal(posix.hits.some((hit) => hit.path.includes("chrome.exe")), false);
  assert.ok(posix.hits.some((hit) => hit.path.includes("keys.txt")));
  assert.equal(posix.writePath, "");
});
