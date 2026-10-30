/**
 * Desk Run 11: taking the next prompt's visible-copy baseline must leave the
 * previous prompt's run record in place until that next record is written.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

const TOKENS = [
  "## Task",
  "",
  "Prompt 001. Record the tokens.",
  "Files: src/styles/tokens.css",
  "Requirements: REQ-TOKENS",
  "",
].join("\n");

const HERO = [
  "## Task",
  "",
  "Prompt 002. Write the hero.",
  "Files: src/components/SectionHero.astro",
  "Requirements: REQ-COPY-hero",
  "",
  "## Design language",
  "",
  "Example only.",
  "",
].join("\n");

const CLEAN_HERO = "---\nconst title = 'Ridge';\n---\n<h1>The valley is open.</h1>\n";

test("a second prompt's spawn still sees the first run record, and its close uses its own baseline", async () => {
  const dir = tempDir("hh-243x-keep-");
  let warned = "";
  let hits: { tool: string; path: string }[] = [];
  const outside = path.dirname(dir);
  const spawn: BuildSpawn = (request) => {
    if (request.promptId === "001") {
      // After 001's baseline, so this TODO is pre-existing for 002 and new for 001.
      const about = path.join(request.cwd, "dist", "about", "index.html");
      mkdirSync(path.dirname(about), { recursive: true });
      writeFileSync(about, "<p>TODO from a later prompt</p>\n", "utf8");
      const stdout = `${JSON.stringify({
        type: "tool_call",
        toolName: "list_dir",
        rawInput: { target_directory: outside },
      })}\n{"type":"end","stopReason":"end_turn"}\n`;
      return { pid: 243001, done: Promise.resolve({ code: 0, stdout, stderr: "", errorCode: null }) };
    }
    const prior = readBuildRun(request.cwd);
    assert.equal(prior?.promptId, "001");
    warned = prior?.reason ?? "";
    hits = prior?.outsideAccess ?? [];
    const visit = path.join(request.cwd, "dist", "visit", "index.html");
    mkdirSync(path.dirname(visit), { recursive: true });
    writeFileSync(visit, "<p>TODO added by this prompt</p>\n", "utf8");
    return { pid: 243002, done: Promise.resolve(ok()) };
  };
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    mkdirSync(path.join(dir, "src", "components"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<p>The valley is open.</p>\n", "utf8");
    writeFileSync(path.join(dir, "src", "components", "SectionHero.astro"), CLEAN_HERO, "utf8");
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), TOKENS, "utf8");
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "002.md"), HERO, "utf8");
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "002")?.status, "failed");
    assert.match(warned, /The build looked outside its folder:/);
    assert.match(warned, /The deny rules should stop that/);
    assert.ok(hits.some((hit) => hit.tool === "list_dir"));
    const reason = readBuildRun(dir)?.reason ?? "";
    assert.match(reason, /New hits/);
    assert.match(reason, /dist\/visit\/index\.html/);
    assert.match(reason, /TODO/);
    assert.doesNotMatch(reason, /dist\/about\/index\.html/);
  } finally {
    await cleanup(dir);
  }
});
