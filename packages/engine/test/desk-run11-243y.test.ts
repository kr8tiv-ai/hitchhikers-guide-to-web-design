/**
 * Desk Run 11: a dev-only plan-metadata guard is not an owned-source hit,
 * a copy prompt is told about hits in files it owns, and one visible-copy
 * close failure comes back with the reason.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { scanVisibleCopy, scanVisibleCopyText } from "../src/spec/visible-copy.ts";
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

function lineOf(source: string, needle: string): number {
  const index = source.indexOf(needle);
  assert.ok(index >= 0, needle);
  return source.slice(0, index).split("\n").length;
}

const HERO = [
  "## Task",
  "",
  "Prompt 001. Write the hero.",
  "Files: src/components/SectionHero.astro",
  "Requirements: REQ-COPY-hero",
  "",
  "## Design language",
  "",
  "Example only.",
  "",
].join("\n");

const OPEN_JOB = [
  "---",
  "const job = 'hero';",
  "const component = 'SectionHero';",
  "const sitemapId = 'home';",
  "---",
  "<section",
  "  class=\"hero\"",
  "  data-sitemap={sitemapId}",
  "  data-component={component}",
  "  data-job={job}",
  ">",
  "  <h1>The valley is open.</h1>",
  "</section>",
  "",
].join("\n");

const GUARDED_JOB = [
  "---",
  "const job = 'hero';",
  "---",
  "<section data-job={import.meta.env.DEV ? job : undefined}>",
  "  <h1>The valley is open.</h1>",
  "</section>",
  "",
].join("\n");

const CLEAN_HERO = "---\nconst title = 'Ridge';\n---\n<h1>The valley is open.</h1>\n";

function writeProject(dir: string, source: string): string {
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  mkdirSync(path.join(dir, "src", "components"), { recursive: true });
  const promptPath = path.join(dir, ".hitchhiker", "prompts", "001.md");
  writeFileSync(promptPath, HERO, "utf8");
  writeFileSync(path.join(dir, "dist", "index.html"), "<p>The valley is open.</p>\n", "utf8");
  writeFileSync(path.join(dir, "src", "components", "SectionHero.astro"), source, "utf8");
  return promptPath;
}

test("a dev-only metadata guard is not an owned-source hit, and production HTML still is", () => {
  const open = scanVisibleCopyText("src/components/SectionHero.astro", OPEN_JOB);
  assert.equal(open.length, 1);
  assert.equal(open[0]?.patternId, "data-job");
  assert.equal(open[0]?.line, lineOf(OPEN_JOB, "data-job={job}"));
  assert.match(open[0]?.snippet ?? "", /data-job=\{job\}/);
  assert.doesNotMatch(open[0]?.snippet ?? "", /data-job= job/);

  assert.deepEqual(scanVisibleCopyText("src/components/SectionHero.astro", GUARDED_JOB), []);
  assert.deepEqual(
    scanVisibleCopyText(
      "src/components/SectionHero.astro",
      "<section {...(import.meta.env.DEV ? { \"data-job\": job } : {})}>\n  <h1>The valley is open.</h1>\n</section>\n",
    ),
    [],
  );
  assert.deepEqual(
    scanVisibleCopyText(
      "src/components/SectionHero.astro",
      "{import.meta.env.DEV ? <section data-job={job}></section> : null}\n",
    ),
    [],
  );

  const shipped = scanVisibleCopyText(
    "src/components/SectionHero.astro",
    "{import.meta.env.DEV ? null : <section data-job={job}></section>}\n",
  );
  assert.equal(shipped.length, 1);
  assert.match(shipped[0]?.snippet ?? "", /data-job=\{job\}/);

  const quoted = scanVisibleCopyText("src/components/SectionHero.astro", "<section data-job=\"hero\"></section>\n");
  assert.equal(quoted.length, 1);
  assert.match(quoted[0]?.snippet ?? "", /data-job="hero"/);

  const prod = scanVisibleCopyText(
    "src/components/SectionHero.astro",
    "<section data-job={import.meta.env.PROD ? job : undefined}></section>\n",
  );
  assert.equal(prod.length, 1);

  const afterGuard = scanVisibleCopyText(
    "src/components/SectionHero.astro",
    "{import.meta.env.DEV ? <span>Open</span> : null}\n<section data-job={job}></section>\n",
  );
  assert.equal(afterGuard.length, 1);
  assert.equal(afterGuard[0]?.line, 2);

  const launch = scanVisibleCopyText(
    "src/components/SectionHero.astro",
    "<section data-launch-check={import.meta.env.DEV ? 'ready' : undefined}></section>\n",
  );
  assert.deepEqual(launch, []);
  const launchPlain = scanVisibleCopyText("src/components/SectionHero.astro", "<section data-launch-check=\"ready\"></section>\n");
  assert.equal(launchPlain.length, 1);
  assert.equal(launchPlain[0]?.line, 1);
  assert.match(launchPlain[0]?.snippet ?? "", /data-launch-check="ready"/);

  const component = scanVisibleCopyText(
    "src/components/SectionHero.astro",
    "<section data-component=\"src/components/SectionHero.astro\"></section>\n",
  );
  assert.equal(component.length, 1);
  assert.match(component[0]?.snippet ?? "", /data-component="src\/components\/SectionHero\.astro"/);
  assert.deepEqual(
    scanVisibleCopyText(
      "src/components/SectionHero.astro",
      "<section data-component={import.meta.env.DEV ? \"src/components/SectionHero.astro\" : undefined}></section>\n",
    ),
    [],
  );

  const dir = tempDir("hh-243y-dist-");
  try {
    const dist = path.join(dir, "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, "index.html"), "<section data-job=\"hero\">The valley is open.</section>\n", "utf8");
    const hits = scanVisibleCopy(dist);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.file, "index.html");
    assert.equal(hits[0]?.line, undefined);
    assert.match(hits[0]?.snippet ?? "", /data-job=/);
  } finally {
    removeTempDir(dir);
  }
});

test("a copy prompt hears about a hit in a file it owns, and a clean file adds no block", async () => {
  const dirty = tempDir("hh-243y-notice-");
  const clean = tempDir("hh-243y-clean-");
  const dirtySessions: string[] = [];
  const cleanSessions: string[] = [];
  const dirtySpawn: BuildSpawn = (request) => {
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    assert.match(file, /session-001\.md$/);
    dirtySessions.push(readFileSync(file, "utf8"));
    return { pid: 243001, done: Promise.resolve(ok()) };
  };
  const cleanSpawn: BuildSpawn = (request) => {
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    assert.match(file, /prompts[\\/]001\.md$/);
    cleanSessions.push(readFileSync(file, "utf8"));
    return { pid: 243002, done: Promise.resolve(ok()) };
  };
  try {
    const dirtyPrompt = writeProject(dirty, OPEN_JOB);
    setProjectBuildRunner(dirty, dirtySpawn);
    await saveQueue(dirty, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dirty);
    assert.equal(dirtySessions.length, 2);
    assert.match(dirtySessions[0] ?? "", /Fix before you finish/);
    assert.match(dirtySessions[0] ?? "", /src\/components\/SectionHero\.astro:\d+ data-job=\{job\}/);
    assert.match(dirtySessions[0] ?? "", /guard it with `import\.meta\.env\.DEV`/);
    assert.match(dirtySessions[0] ?? "", /Replace TODO and build narration with visitor copy/);
    assert.equal((dirtySessions[0] ?? "").includes("Visible copy failed."), false);
    assert.equal(readFileSync(dirtyPrompt, "utf8").includes("Fix before you finish"), false);

    const cleanPrompt = writeProject(clean, CLEAN_HERO);
    setProjectBuildRunner(clean, cleanSpawn);
    await saveQueue(clean, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(clean);
    assert.equal(cleanSessions.length, 1);
    assert.equal((cleanSessions[0] ?? "").includes("Fix before you finish"), false);
    assert.equal(readFileSync(cleanPrompt, "utf8"), HERO);
    assert.equal(readBuildRun(clean)?.status, "passed");
  } finally {
    await cleanup(dirty);
    await cleanup(clean);
  }
});

test("the first owned-source close failure reruns once with the reason, and the second fails", async () => {
  const dir = tempDir("hh-243y-rerun-");
  const sessions: string[] = [];
  const spawn: BuildSpawn = (request) => {
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    sessions.push(readFileSync(file, "utf8"));
    return { pid: 243003, done: Promise.resolve(ok()) };
  };
  try {
    const promptPath = writeProject(dir, OPEN_JOB);
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(sessions.length, 2);
    assert.match(sessions[1] ?? "", /Fix before you finish/);
    assert.match(sessions[1] ?? "", /Visible copy failed\./);
    assert.match(sessions[1] ?? "", /src\/components\/SectionHero\.astro:\d+ data-job=\{job\}/);
    assert.equal(readFileSync(promptPath, "utf8").includes("Fix before you finish"), false);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Visible copy failed/);
    assert.match(run?.reason ?? "", /Owned source/);
    assert.match(run?.reason ?? "", /src\/components\/SectionHero\.astro:\d+ data-job=\{job\}/);
  } finally {
    await cleanup(dir);
  }
});

test("a gate failure still halts on the first spawn", async () => {
  const dir = tempDir("hh-243y-gate-");
  let spawns = 0;
  const spawn: BuildSpawn = () => {
    spawns += 1;
    return { pid: 243004, done: Promise.resolve(ok()) };
  };
  try {
    writeProject(dir, OPEN_JOB);
    setProjectBuildRunner(dir, spawn);
    setSiteBuildGate(dir, () => {
      throw new Error("gate broke");
    });
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(spawns, 1);
    assert.equal(readBuildRun(dir)?.status, "failed");
    assert.match(readBuildRun(dir)?.reason ?? "", /gate broke/);
    assert.equal(readBuildRun(dir)?.recoveryRerun, false);
  } finally {
    await cleanup(dir);
  }
});
