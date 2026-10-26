/**
 * 241k. prepareSiteBuild writes phase logs, the section library, and a
 * reference extract. The watchdog stops a quiet child. Stack packs do
 * not ban a library. Font licences are not checked.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { phonePerformanceBudget } from "../src/spec/phone-budget.ts";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import { auditPhaseReferences } from "../src/spec/skills.ts";
import {
  clearProjectBuildRunner,
  configureSiteBuildWatch,
  ensureSiteBuild,
  prepareSiteBuild,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setReferenceTransport,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
  type ReferenceTransport,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const designIndex = path.join(repoRoot, "packages", "knowledge", "design-library", "index.json");

const PAGE = `<!DOCTYPE html>
<html>
<head>
<style>
  body { background-color: #f4f1ea; color: #1c1917; font-family: Literata, serif; font-size: 18px; }
  h1 { font-family: Fraunces, serif; font-size: 64px; color: #1c1917; }
  a { color: #0f6b4a; }
</style>
</head>
<body>
  <header data-landmark="hero"><h1>Kiln</h1></header>
  <section data-landmark="story"><p>Short.</p></section>
  <footer data-landmark="footer"><a href="/visit">Visit</a></footer>
</body>
</html>`;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-sweep-241k-"));
}

function never(): Promise<BuildSpawnResult> {
  return new Promise(() => undefined);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BRIEF = [
  "## Vibe",
  "",
  "A towel shop. Paper, ink, and one green stitch.",
  "",
  "## Motion",
  "",
  "Motion score: 9. Pinned scroll stories.",
  "",
  "## Pages",
  "",
  "Home (hero, story)",
  "",
  phonePerformanceBudget(),
  "",
  "Reference URL: https://example.com/work",
  "",
  "@section:asymmetric-editorial-grid",
  "",
].join("\n");

test("prepareSiteBuild writes phase logs, the section landmark, and reference tokens", async () => {
  const dir = tempDir();
  const before = readFileSync(designIndex, "utf8");
  const transport: ReferenceTransport = {
    robots: () => Promise.resolve({ status: 404, body: "" }),
    page: () => Promise.resolve({ status: 200, body: PAGE }),
  };
  setReferenceTransport(transport);
  try {
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
    const webgl = readFileSync(path.join(dir, ".hitchhiker", "reference-phases", "webgl.md"), "utf8");
    assert.match(webgl, /@skill:three/);
    assert.equal(webgl.includes("@skill:gsap"), false);
    assert.equal(auditPhaseReferences("webgl", webgl).ok, true);
    const motion = readFileSync(path.join(dir, ".hitchhiker", "reference-phases", "motion.md"), "utf8");
    assert.match(motion, /@skill:gsap/);
    const library = readFileSync(path.join(dir, ".hitchhiker", "sections", "library.html"), "utf8");
    assert.match(library, /data-landmark="asymmetric-editorial-grid"/);
    const tokens = readFileSync(path.join(dir, ".hitchhiker", "references", "tokens", "ref-example-com-work.json"), "utf8");
    assert.match(tokens, /#f4f1ea/);
    assert.equal(readFileSync(designIndex, "utf8"), before);
    assert.equal(before.includes("ref-example-com-work"), false);
  } finally {
    setReferenceTransport(null);
    removeTempDir(dir);
  }
});

test("a plain brief does not fetch a reference", async () => {
  const dir = tempDir();
  let called = 0;
  setReferenceTransport({
    robots: () => {
      called += 1;
      return Promise.resolve({ status: 404, body: "" });
    },
    page: () => {
      called += 1;
      return Promise.resolve({ status: 200, body: PAGE });
    },
  });
  try {
    await prepareSiteBuild(dir, "Brief.");
    assert.equal(called, 0);
    assert.equal(
      readFileSync(path.join(dir, ".hitchhiker", "reference-phases", "webgl.md"), "utf8").includes("@skill:three"),
      true,
    );
  } finally {
    setReferenceTransport(null);
    removeTempDir(dir);
  }
});

test("the watchdog stops a quiet child before it settles the row", { timeout: 20_000 }, async () => {
  const dir = tempDir();
  let stopped = false;
  const spawn: BuildSpawn = () => ({
    pid: process.pid,
    done: never(),
    stop: () => {
      stopped = true;
    },
  });
  configureSiteBuildWatch(dir, { intervalMs: 40, idleMs: 0, exitGraceMs: 60_000 });
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await saveQueue(dir, {
      items: ["001", "002"].map((id) => ({ id, kind: "build" as const, status: "queued" as const })),
    });
    await ensureSiteBuild(dir);
    assert.equal(stopped, true);
  } finally {
    await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(300)]);
    resetSiteBuildWatch(dir);
    clearProjectBuildRunner(dir);
    setReferenceTransport(null);
    removeTempDir(dir);
  }
});

test("the three stack packs do not ban a library", () => {
  const packs = ["stack-astro", "stack-next", "stack-vite-react"];
  for (const name of packs) {
    const text = readFileSync(path.join(repoRoot, "packages", "knowledge", "packs", name, "SKILL.md"), "utf8");
    assert.deepEqual(libraryBanHits(text), [], name);
    assert.match(text, /Add another library when the shot needs a technique/);
  }
});
