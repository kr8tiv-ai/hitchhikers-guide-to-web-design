/**
 * Desk Run 11: the HTML walker finishes on a stray "<" and a lone "/".
 * Source scans read template markup only, so Astro frontmatter and scripts
 * are not headings, and a close check parses each src file once.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isMainThread, Worker } from "node:worker_threads";
import {
  clearProjectBuildRunner,
  ensureSiteBuild,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import {
  conceptSourceFiles,
  duplicateSourceCounts,
  formatConceptImageFailure,
  formatDuplicateBlockFailure,
  scanConceptImages,
  scanDuplicateBlocks,
} from "../src/spec/site-structure.ts";
import { removeTempDir } from "./remove-temp.ts";

const SCAN_MS = 3_000;
const HEADING = 'heading "Caretaker program" appears 2 times';
const CONCEPT = "This picture is a concept, not a real listing.";
const STRAY = ['<a b / c>', 'a < b; x.replace(/\\D/g, "")'].join("\n");

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
import(workerData.entry).then(async (mod) => {
  const started = Date.now();
  try {
    const value = await mod.runJob(workerData.job);
    parentPort.postMessage({ value, ms: Date.now() - started });
  } catch (error) {
    const text = error instanceof Error ? error.stack || error.message : String(error);
    parentPort.postMessage({ error: text });
  }
}).catch((error) => {
  const text = error instanceof Error ? error.stack || error.message : String(error);
  parentPort.postMessage({ error: text });
});
`;

type Job =
  | { kind: "duplicate-blocks" | "concept-images"; root: string }
  | { kind: "duplicate-sources" | "concept-sources"; root: string; detail: string }
  | { kind: "close"; root: string };

export async function runJob(job: Job): Promise<unknown> {
  if (job.kind === "duplicate-blocks") return scanDuplicateBlocks(job.root);
  if (job.kind === "concept-images") return scanConceptImages(job.root);
  if (job.kind === "duplicate-sources") return duplicateSourceCounts(job.root, job.detail);
  if (job.kind === "concept-sources") return conceptSourceFiles(job.root, job.detail);
  return closeCheck(job.root);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

function immediate(): BuildSpawn {
  return () => ({ pid: 244701, done: Promise.resolve(ok()) });
}

function writeText(dir: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
}

function promptFor(id: string, requirement: string, file: string, title: string): string {
  return [
    "## Task",
    "",
    `Prompt ${id}. ${title}`,
    `Files: ${file}`,
    `Requirements: ${requirement}`,
    "",
    "## Design language",
    "",
    "Example only.",
    "",
  ].join("\n");
}

function nameProject(dir: string, name: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name })}\n`, "utf8");
}

function doc(title: string, description: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body>${body}</body></html>`;
}

async function runBuild(dir: string, id: string, prompt: string, html: Record<string, string>, extra: Record<string, string>): Promise<{ reason: string; status: string }> {
  nameProject(dir, "Example Site");
  writeText(dir, {
    ...extra,
    [`.hitchhiker/prompts/${id}.md`]: prompt,
  });
  writeText(path.join(dir, "dist"), html);
  setProjectBuildRunner(dir, immediate());
  await saveQueue(dir, { items: [{ id, kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  return { reason: readBuildRun(dir)?.reason ?? "", status: readBuildRun(dir)?.status ?? "" };
}

async function closeCheck(dir: string): Promise<{ reason: string; status: string }> {
  const source = [
    "---",
    "interface Row<T> { value: T }",
    "const rows: Row<string>[] = [];",
    'const card = { body: "12" };',
    'if (rows.length < 2 && card.body.replace(/\\D/g, "").length !== 0) {',
    '  const label = "<h2>Caretaker program</h2>";',
    "}",
    "---",
    "<h2>Caretaker program</h2>",
    "<section><h2>Caretaker program</h2></section>",
    "",
  ].join("\n");
  try {
    return await runBuild(
      dir,
      "034",
      promptFor("034", "REQ-STRUCT-program-main", "src/pages/program.astro", "Build the program layout."),
      {
        "program/index.html": doc(
          "Program | Example Site",
          "The caretaker match is free.",
          "<h2>Caretaker program</h2><section><h2>Caretaker program</h2></section>",
        ),
      },
      { "src/pages/program.astro": source },
    );
  } finally {
    await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(2_000)]);
    resetSiteBuildWatch(dir);
    clearProjectBuildRunner(dir);
    setSiteBuildGate(dir, null);
  }
}

function readMessage(message: unknown): { value: unknown; ms: number; error?: string } {
  if (typeof message !== "object" || message === null) return { value: undefined, ms: -1, error: "empty worker message" };
  const row = message as { value?: unknown; ms?: unknown; error?: unknown };
  if (typeof row.error === "string") return { value: undefined, ms: -1, error: row.error };
  if (typeof row.ms !== "number") return { value: undefined, ms: -1, error: "scan worker returned no timing" };
  return { value: row.value, ms: row.ms };
}

function runJobInWorker(job: Job, limitMs = SCAN_MS): Promise<{ value: unknown; ms: number }> {
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    execArgv: ["--experimental-strip-types"],
    workerData: { entry: new URL(import.meta.url).href, job },
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | undefined, value?: { value: unknown; ms: number }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().finally(() => {
        if (error !== undefined) reject(error);
        else if (value !== undefined) resolve(value);
        else reject(new Error("scan returned nothing"));
      });
    };
    const timer = setTimeout(() => finish(new Error(`scan did not finish within ${limitMs}ms`)), limitMs);
    worker.on("message", (message: unknown) => {
      const row = readMessage(message);
      if (row.error !== undefined) {
        finish(new Error(row.error));
        return;
      }
      finish(undefined, { value: row.value, ms: row.ms });
    });
    worker.on("error", (error: Error) => finish(error));
  });
}

function asHits(value: unknown): Array<{ file: string; detail: string }> {
  if (!Array.isArray(value)) throw new Error("expected hits");
  return value.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("expected a hit");
    const row = item as { file?: unknown; detail?: unknown };
    if (typeof row.file !== "string" || typeof row.detail !== "string") throw new Error("expected a hit");
    return { file: row.file, detail: row.detail };
  });
}

function asCounts(value: unknown): Array<{ file: string; count: number }> {
  if (!Array.isArray(value)) throw new Error("expected heading sources");
  return value.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("expected a heading source");
    const row = item as { file?: unknown; count?: unknown };
    if (typeof row.file !== "string" || typeof row.count !== "number") throw new Error("expected a heading source");
    return { file: row.file, count: row.count };
  });
}

function asFiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("expected files");
  return value as string[];
}

function assertFast(ms: number): void {
  assert.ok(ms < 1_000, `scan took ${ms}ms`);
}

// The scan worker imports this module. Register tests on the main thread only.
if (isMainThread) {

test("a stray angle bracket and a lone slash do not stall the structure scans", { timeout: 8_000 }, async () => {
  const dist = tempDir("hh-244j-dist-");
  const project = tempDir("hh-244j-src-");
  try {
    writeText(dist, {
      "odd.html": ["<a b / c>", "<h2>Caretaker program</h2>", "<h2>Caretaker program</h2>", STRAY].join("\n"),
      "farms/shore.html": [
        `<figure><img alt="Shore" src="/shore.webp"><figcaption>${CONCEPT}</figcaption></figure>`,
        STRAY,
      ].join("\n"),
    });
    writeText(project, {
      "src/pages/odd.astro": ["<a b / c>", "<h2>Caretaker program</h2>", "<h2>Caretaker program</h2>", STRAY].join("\n"),
      "src/pages/farms/shore.astro": [
        `<figure><img alt="Shore" src="/shore.webp"><figcaption>${CONCEPT}</figcaption></figure>`,
        STRAY,
      ].join("\n"),
    });
    const duplicates = await runJobInWorker({ kind: "duplicate-blocks", root: dist });
    assertFast(duplicates.ms);
    assert.match(formatDuplicateBlockFailure(asHits(duplicates.value)), /odd\.html: heading "Caretaker program" appears 2 times/);
    const concepts = await runJobInWorker({ kind: "concept-images", root: dist });
    assertFast(concepts.ms);
    const conceptText = formatConceptImageFailure(asHits(concepts.value));
    assert.match(conceptText, /farms\/shore\.html/);
    assert.match(conceptText, /concept, not a real listing/i);
    const sources = await runJobInWorker({ kind: "duplicate-sources", root: project, detail: HEADING });
    assertFast(sources.ms);
    assert.deepEqual(asCounts(sources.value), [{ file: "src/pages/odd.astro", count: 2 }]);
    const conceptFiles = await runJobInWorker({ kind: "concept-sources", root: project, detail: CONCEPT });
    assertFast(conceptFiles.ms);
    assert.deepEqual(asFiles(conceptFiles.value), ["src/pages/farms/shore.astro"]);
  } finally {
    removeTempDir(dist);
    removeTempDir(project);
  }
});

test("astro frontmatter with a regex slash still counts the two template headings", { timeout: 5_000 }, async () => {
  const project = tempDir("hh-244j-astro-");
  try {
    writeText(project, {
      "src/pages/program.astro": [
        "---",
        "interface Row<T> { value: T }",
        "const rows: Row<string>[] = [];",
        'const card = { body: "12" };',
        'if (rows.length < 2 && card.body.replace(/\\D/g, "").length !== 0) {',
        '  const label = "<h2>Caretaker program</h2>";',
        "}",
        "---",
        '<h2 class="care/taker">Caretaker program</h2>',
        "<h2>Caretaker program</h2>",
        "",
      ].join("\n"),
    });
    const sources = await runJobInWorker({ kind: "duplicate-sources", root: project, detail: HEADING });
    assertFast(sources.ms);
    assert.deepEqual(asCounts(sources.value), [{ file: "src/pages/program.astro", count: 2 }]);
  } finally {
    removeTempDir(project);
  }
});

test("a heading written only in frontmatter or a script is not counted", { timeout: 5_000 }, async () => {
  const project = tempDir("hh-244j-copy-");
  try {
    writeText(project, {
      "src/pages/program.astro": [
        "---",
        'const label = "<h2>Caretaker program</h2>";',
        "---",
        "<script>",
        '  const label = "<h2>Caretaker program</h2>";',
        "</script>",
        "<h2>Caretaker program</h2>",
        "",
      ].join("\n"),
      "src/pages/notes.astro": [
        "---",
        'const label = "<h2>Caretaker program</h2>";',
        "---",
        "<script>",
        '  const copy = "<h2>Caretaker program</h2>";',
        "</script>",
        "<p>The match is free.</p>",
        "",
      ].join("\n"),
    });
    const sources = await runJobInWorker({ kind: "duplicate-sources", root: project, detail: HEADING });
    assertFast(sources.ms);
    assert.deepEqual(asCounts(sources.value), [{ file: "src/pages/program.astro", count: 1 }]);
  } finally {
    removeTempDir(project);
  }
});

test("the close check names template headings when frontmatter contains a stray slash", { timeout: 8_000 }, async () => {
  const dir = tempDir("hh-244j-close-");
  try {
    const result = await runJobInWorker({ kind: "close", root: dir }, 6_000);
    const outcome = result.value as { reason?: unknown; status?: unknown };
    assert.equal(typeof outcome.reason, "string");
    assert.equal(outcome.status, "failed");
    assert.match(String(outcome.reason), /Duplicate block failed/);
    assert.match(String(outcome.reason), /program\/index\.html/);
    assert.match(String(outcome.reason), /heading "Caretaker program" appears 2 times/);
    assert.match(String(outcome.reason), /src\/pages\/program\.astro/);
    assert.ok(result.ms < 6_000, `close check took ${result.ms}ms`);
  } finally {
    removeTempDir(dir);
  }
});

}
