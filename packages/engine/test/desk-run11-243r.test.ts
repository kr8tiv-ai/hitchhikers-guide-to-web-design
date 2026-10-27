/**
 * Desk Run 11: Grok session logs are not outside access, a finished turn
 * settles when a background server holds grok open, framework caches stay
 * out of filesWritten, and truncated NDJSON does not become the run reason.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isRawJsonLine, sanitizeFailureReason } from "../src/ai/grok-failure.ts";
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

const FALLBACK = "The build exited with code 1.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-243r-"));
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

function seedRun(dir: string, filesWritten: string[]): void {
  writeFileSync(
    path.join(dir, ".hitchhiker", "build-run.json"),
    `${JSON.stringify({
      promptId: "001",
      status: "running",
      model: "grok-4.7-build-fast",
      effort: "xhigh",
      startedAt: "2026-10-27T00:00:00.000Z",
      elapsedMs: 1,
      lastLines: [],
      filesWritten,
      reason: "",
      pid: null,
      recovery: "",
      recoveryRerun: false,
    })}\n`,
    "utf8",
  );
}

test("grok session terminal logs are not outside reads or writes", () => {
  const windowsLog =
    "C:\\Users\\lucid\\.grok\\sessions\\C%3A%5CUsers%5Clucid%5Csite-c\\01a1\\terminal\\call-123.log";
  const posixLog = "/Users/annas/.grok/sessions/site/01a1/terminal/call-123.log";
  const homeLog = "/home/annas/.grok/sessions/site/01a1/terminal/call-123.log";
  const project = "C:\\work\\site-c";
  const stream = [
    toolCall("read_file", { target_file: windowsLog }),
    toolCall("read_file", { target_file: posixLog }),
    toolCall("read_file", { target_file: homeLog }),
    toolCall("search_replace", { file_path: windowsLog }),
    toolCall("read_file", { target_file: "C:\\Users\\lucid\\.grok\\config.json" }),
    toolCall("read_file", { target_file: "C:\\Users\\lucid\\Desktop\\other\\secret.txt" }),
    toolCall("search_replace", { file_path: "C:\\Users\\lucid\\Desktop\\other\\owned.ts" }),
    toolCall("read_file", { target_file: "/Users/annas/Documents/notes.txt" }),
  ].join("\n");
  const audit = auditOutsideAccess(stream, project);
  const paths = audit.hits.map((hit) => hit.path);
  assert.equal(paths.some((file) => file.includes("call-123.log")), false);
  assert.equal(audit.readPath.includes("call-123.log"), false);
  assert.equal(audit.writePath.includes("call-123.log"), false);
  assert.ok(paths.some((file) => file.includes("config.json")));
  assert.ok(paths.some((file) => file.includes("secret.txt")));
  assert.ok(paths.some((file) => file.includes("notes.txt")));
  assert.ok(audit.writePath.includes("owned.ts"));

  const posix = auditOutsideAccess(
    [
      toolCall("read_file", { target_file: posixLog }),
      toolCall("read_file", { target_file: windowsLog }),
      toolCall("write", { file_path: homeLog }),
      toolCall("read_file", { target_file: "/Users/annas/Documents/notes.txt" }),
    ].join("\n"),
    "/tmp/site-c",
  );
  assert.equal(posix.hits.some((hit) => hit.path.includes("call-123.log")), false);
  assert.equal(posix.writePath, "");
  assert.ok(posix.hits.some((hit) => hit.path.includes("notes.txt")));
});

test("a finished turn with no end event settles and stops the orphan child", { timeout: 20_000 }, async () => {
  const dir = tempDir();
  let stopped = 0;
  let armedAt = 0;
  let gates = 0;
  configureSiteBuildWatch(dir, { intervalMs: 60_000, idleMs: 60 * 60 * 1000, exitGraceMs: 30 });
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.(`${JSON.stringify({ type: "available_commands", commands: ["run_terminal_command"] })}\n`);
    request.onOutput?.(`${JSON.stringify({ type: "usage", inputTokens: 12, outputTokens: 4 })}\n`);
    armedAt = Date.now();
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
    assert.equal(stopped, 1);
    assert.equal(gates, 1);
    assert.ok(Date.now() - armedAt >= 4_500, `settled too soon: ${Date.now() - armedAt}ms`);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "passed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "passed");
    assert.equal(run?.reason ?? "", "");
  } finally {
    await cleanup(dir);
  }
});

test("a tool call after usage does not stop the child", async () => {
  const dir = tempDir();
  let stopped = 0;
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.(
      [
        JSON.stringify({ type: "available_commands", commands: ["read_file"] }),
        JSON.stringify({ type: "usage", inputTokens: 3, outputTokens: 1 }),
        JSON.stringify({ type: "tool_call", toolName: "read_file", rawInput: { target_file: "src/pages/index.astro" } }),
        JSON.stringify({ type: "text", text: "still working" }),
        JSON.stringify({ type: "thinking", text: "still working" }),
      ].join("\n") + "\n",
    );
    return {
      pid: process.pid,
      done: Promise.resolve(result(0)),
      stop: () => {
        stopped += 1;
      },
    };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    assert.equal(stopped, 0);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("framework cache files stay out of filesWritten and stale entries are pruned", async () => {
  const dir = tempDir();
  const stale = [
    ...Array.from({ length: 40 }, (_unused, index) => `.astro/gen-${String(index).padStart(2, "0")}.ts`),
    ".astro/content.d.ts",
    ".astro/dev.json",
    ".astro/preview.json",
    "dist/index.html",
    ".next/trace.json",
    ".svelte-kit/generated.d.ts",
    ".vercel/output.json",
    ".output/server.js",
    "src/pages/kept.astro",
  ];
  const spawn: BuildSpawn = () => {
    const astro = path.join(dir, ".astro");
    mkdirSync(astro, { recursive: true });
    for (let index = 0; index < 40; index += 1) {
      writeFileSync(path.join(astro, `gen-${String(index).padStart(2, "0")}.ts`), "export {}\n", "utf8");
    }
    writeFileSync(path.join(astro, "content.d.ts"), "export {}\n", "utf8");
    writeFileSync(path.join(astro, "dev.json"), "{}\n", "utf8");
    writeFileSync(path.join(astro, "preview.json"), "{}\n", "utf8");
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<html></html>\n", "utf8");
    mkdirSync(path.join(dir, ".next"), { recursive: true });
    writeFileSync(path.join(dir, ".next", "trace.json"), "{}\n", "utf8");
    mkdirSync(path.join(dir, ".svelte-kit"), { recursive: true });
    writeFileSync(path.join(dir, ".svelte-kit", "generated.d.ts"), "export {}\n", "utf8");
    mkdirSync(path.join(dir, ".vercel"), { recursive: true });
    writeFileSync(path.join(dir, ".vercel", "output.json"), "{}\n", "utf8");
    mkdirSync(path.join(dir, ".output"), { recursive: true });
    writeFileSync(path.join(dir, ".output", "server.js"), "export {}\n", "utf8");
    mkdirSync(path.join(dir, "src", "pages"), { recursive: true });
    writeFileSync(path.join(dir, "src", "pages", "index.astro"), "<html></html>\n", "utf8");
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    seedRun(dir, stale);
    await ensureSiteBuild(dir);
    const files = readBuildRun(dir)?.filesWritten ?? [];
    assert.ok(files.includes("src/pages/index.astro"));
    assert.ok(files.includes("src/pages/kept.astro"));
    for (const banned of [
      ".astro/content.d.ts",
      ".astro/dev.json",
      ".astro/preview.json",
      "dist/index.html",
      ".next/trace.json",
      ".svelte-kit/generated.d.ts",
      ".vercel/output.json",
      ".output/server.js",
    ]) {
      assert.equal(files.includes(banned), false, banned);
    }
    assert.equal(
      files.some((file) => /^\.(astro|next|svelte-kit|vercel|output)\//.test(file) || file.startsWith("dist/")),
      false,
    );
  } finally {
    await cleanup(dir);
  }
});

test("truncated NDJSON and boolean JSON lines do not become the failure reason", async () => {
  const body = "src/pages/index.astro export const prerender = true; ".repeat(400);
  const full = `{"type":"tool_call_update","toolName":"grep","rawOutput":"${body}","ok":true,"empty":null,"failed":false}`;
  const sliced = full.slice(-8_000);
  const withBool = '{"type":"tool_call","toolName":"grep","ok":true,"empty":null,"failed":false}';
  const keywords = "} }, true, false, null";
  assert.equal(sliced.startsWith('{"'), false);
  assert.ok(sliced.length >= 7_000);
  assert.equal(isRawJsonLine(sliced), true);
  assert.equal(isRawJsonLine(withBool), true);
  assert.equal(isRawJsonLine('[{"type":"tool_call_update","ok":false}]'), true);
  assert.equal(isRawJsonLine(keywords), true);
  assert.equal(isRawJsonLine("The type check failed."), false);
  assert.equal(isRawJsonLine("The value was null {see note}."), false);
  assert.equal(sanitizeFailureReason([sliced, withBool, keywords].join("\n"), FALLBACK), FALLBACK);
  assert.equal(sanitizeFailureReason(`${sliced}\nThe type check failed.`, FALLBACK), "The type check failed.");

  const dir = tempDir();
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.(`${full}\n${withBool}\n`);
    return { pid: 424242, done: Promise.resolve(result(1, "", `${keywords}\n`)) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.reason, FALLBACK);
    assert.equal((run?.reason ?? "").includes("prerender"), false);
    assert.equal((run?.reason ?? "").includes("tool_call"), false);
    assert.equal((run?.lastLines ?? []).some((line) => line.includes("prerender")), false);
  } finally {
    await cleanup(dir);
  }
});
