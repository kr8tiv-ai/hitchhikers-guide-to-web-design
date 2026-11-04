/**
 * Desk Run 11: a surface close failure gets one feedback rerun, the same
 * record as visible copy. A second failure halts. QA and launch do not rerun.
 * A repeated sentence names its count and the src files that contain it.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
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
import { scanRepeatedSentences } from "../src/spec/site-surface.ts";
import { formatFixBeforeFinish } from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

const LINE = "One legal line belongs in the footer and may be shown once.";
const TIMEOUT = 12_000;

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

function writeText(dir: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
}

function page(body: string): string {
  return `<!doctype html><html><head><title>Farm | Example Site</title><meta name="description" content="Ask about this farm."></head><body>${body}</body></html>`;
}

function copies(sentence: string, count: number): string {
  return Array.from({ length: count }, () => `<p>${sentence}</p>`).join("");
}

function promptFor(id: string, requirement: string, files: string, title: string): string {
  return [
    "## Task",
    "",
    `Prompt ${id}. ${title}`,
    `Files: ${files}`,
    `Requirements: ${requirement}`,
    "",
    "## Design language",
    "",
    "Example only.",
    "",
  ].join("\n");
}

function nameProject(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name: "Example Site" })}\n`, "utf8");
}

function queueStatus(dir: string, id: string): string {
  const parsed = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "queue.json"), "utf8")) as {
    items?: Array<{ id?: string; status?: string }>;
  };
  return parsed.items?.find((item) => item.id === id)?.status ?? "";
}

function sourceList(reason: string): string[] {
  const match = /appears 3 times; sources: ([^\n]+)/.exec(reason);
  assert.ok(match?.[1], reason);
  return match[1].split(", ").map((file) => file.trim()).filter((file) => file !== "");
}

test("a repeated-sentence hit keeps the 180 character clip on the sentence and names the count", { timeout: TIMEOUT }, () => {
  const dir = tempDir("hh-244k-clip-");
  const long = `${"extraordinarily ".repeat(20)}end.`;
  try {
    writeText(path.join(dir, "dist"), {
      "guide/index.html": page(copies(LINE, 3)),
      "long/index.html": page(copies(long, 3)),
    });
    const hits = scanRepeatedSentences(path.join(dir, "dist"));
    const guide = hits.find((hit) => hit.file === "guide/index.html");
    const stretched = hits.find((hit) => hit.file === "long/index.html");
    assert.ok(guide);
    assert.ok(stretched);
    assert.match(guide.detail, /^One legal line belongs in the footer and may be shown once\.\. appears 3 times$/);
    const sentence = stretched.detail.slice(0, stretched.detail.lastIndexOf(" appears "));
    assert.match(stretched.detail, / appears 3 times$/);
    assert.ok(sentence.length <= 180);
    assert.ok(sentence.length < long.length);
    assert.equal(stretched.detail.includes(long), false);
    assert.match(sentence, /^extraordinarily/);
  } finally {
    removeTempDir(dir);
  }
});

test("the recovery text for a repeated sentence names the reason and the owned-file fix", { timeout: TIMEOUT }, () => {
  const reason = [
    "Repeated sentence failed.",
    `dist/guide/index.html: ${LINE} appears 3 times; sources: src/components/SectionGuide.astro, src/components/FeatureNotes.astro`,
  ].join("\n");
  const text = formatFixBeforeFinish([], reason);
  assert.match(text, /Fix before you finish/);
  assert.match(text, /Repeated sentence failed/);
  assert.match(text, /appears 3 times/);
  assert.match(text, /src\/components\/SectionGuide\.astro/);
  assert.match(text, /reword copies in files you own/i);
  assert.match(text, /at most twice/i);
  assert.match(text, /never edit files owned by other prompts/i);
  assert.match(text, /never weaken a check/i);
  const combined = [
    "Visible copy failed.",
    "Owned page:",
    "dist/guide/index.html: TODO",
    "Repeated sentence failed.",
    `dist/guide/index.html: ${LINE} appears 3 times`,
  ].join(" ");
  const both = formatFixBeforeFinish([], combined);
  assert.match(both, /Visible copy failed/);
  assert.match(both, /Repeated sentence failed/);
  assert.match(both, /appears 3 times/);
  assert.match(both, /reword copies in files you own/i);
  assert.match(both, /never edit files owned by other prompts/i);
  assert.match(both, /never weaken a check/i);
});

test("a page prompt reruns once for a repeated sentence, and the reason names count and sources", { timeout: TIMEOUT }, async () => {
  const dir = tempDir("hh-244k-repeat-");
  const sessions: string[] = [];
  let sawQueued = false;
  const counts = new Map<string, number>();
  const spawn: BuildSpawn = (request) => {
    const seen = (counts.get(request.promptId) ?? 0) + 1;
    counts.set(request.promptId, seen);
    if (request.promptId === "002") {
      const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      sessions.push(readFileSync(file, "utf8"));
      if (seen === 2) {
        assert.equal(queueStatus(dir, "002"), "queued");
        const run = readBuildRun(dir);
        assert.equal(run?.promptId, "002");
        assert.equal(run?.recoveryRerun, true);
        assert.match(run?.recovery ?? "", /Repeated sentence failed/);
        const sources = sourceList(run?.recovery ?? "");
        assert.deepEqual(sources, [
          "src/components/FeatureNotes.astro",
          "src/components/SectionGuide.astro",
          "src/data/lines.ts",
        ]);
        assert.equal(sources.includes("src/components/LogicNote.astro"), false);
        sawQueued = true;
      }
    }
    return { pid: 244801, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("001", "REQ-PAGE-home", "src/pages/index.astro", "Build the home page."),
      ".hitchhiker/prompts/002.md": promptFor(
        "002",
        "REQ-PAGE-guide",
        "src/pages/guide.astro, src/components/SectionGuide.astro",
        "Build the guide page.",
      ),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "src/pages/guide.astro": "<p>The guide page introduces the visit.</p>\n",
      "src/components/SectionGuide.astro": ["---", 'const title = "Guide";', "---", `<p>${LINE}</p>`, ""].join("\n"),
      "src/components/FeatureNotes.astro": `<p data-note="${LINE}">Ask about the valley.</p>\n`,
      "src/components/LogicNote.astro": [
        "---",
        `if (line !== "${LINE}") {`,
        '  throw new Error("kept");',
        "}",
        "---",
        "<p>Ask about this farm before you walk the valley road.</p>",
        "",
      ].join("\n"),
      "src/data/lines.ts": `export const lines = { legal: "${LINE}" };\n`,
    });
    writeText(path.join(dir, "dist"), {
      "index.html": page("<p>Ask about this farm.</p>"),
      "guide/index.html": page(copies(LINE, 3)),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    assert.equal(sawQueued, true);
    assert.equal(counts.get("001"), 1);
    assert.equal(counts.get("002"), 2);
    assert.match(sessions[1] ?? "", /Repeated sentence failed/);
    assert.match(sessions[1] ?? "", /reword copies in files you own/i);
    assert.match(sessions[1] ?? "", /at most twice/i);
    assert.equal((sessions[0] ?? "").includes("Repeated sentence failed"), false);
    const queue = queueStatus(dir, "002");
    assert.equal(queue, "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.promptId, "002");
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Repeated sentence failed/);
    assert.match(run?.recovery ?? "", /Repeated sentence failed/);
    const sources = sourceList(run?.reason ?? "");
    assert.deepEqual(sources, [
      "src/components/FeatureNotes.astro",
      "src/components/SectionGuide.astro",
      "src/data/lines.ts",
    ]);
    assert.equal((run?.reason ?? "").includes("LogicNote.astro"), false);
  } finally {
    await cleanup(dir);
  }
});

test("a placeholder contact on an owned page reruns once and the second failure halts", { timeout: TIMEOUT }, async () => {
  const dir = tempDir("hh-244k-place-");
  let sawQueued = false;
  const counts = new Map<string, number>();
  const spawn: BuildSpawn = (request) => {
    const seen = (counts.get(request.promptId) ?? 0) + 1;
    counts.set(request.promptId, seen);
    if (request.promptId === "002" && seen === 2) {
      assert.equal(queueStatus(dir, "002"), "queued");
      const run = readBuildRun(dir);
      assert.equal(run?.recoveryRerun, true);
      assert.match(run?.recovery ?? "", /Placeholder contact failed/);
      sawQueued = true;
    }
    return { pid: 244802, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("001", "REQ-PAGE-home", "src/pages/index.astro", "Build the home page."),
      ".hitchhiker/prompts/002.md": promptFor("002", "REQ-PAGE-guide", "src/pages/guide.astro", "Build the guide page."),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "src/pages/guide.astro": "<p>The guide page introduces the visit.</p>\n",
    });
    writeText(path.join(dir, "dist"), {
      "index.html": page("<p>Ask about this farm.</p>"),
      "guide/index.html": page("<p>Messages go to hello@paradisefound.example</p>"),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    assert.equal(sawQueued, true);
    assert.equal(counts.get("002"), 2);
    assert.equal(queueStatus(dir, "001"), "passed");
    assert.equal(queueStatus(dir, "002"), "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Placeholder contact failed/);
    assert.match(run?.recovery ?? "", /Placeholder contact failed/);
  } finally {
    await cleanup(dir);
  }
});

test("visible copy plus a surface failure still reruns once", { timeout: TIMEOUT }, async () => {
  const dir = tempDir("hh-244k-both-");
  const sessions: string[] = [];
  let sawQueued = false;
  const counts = new Map<string, number>();
  const spawn: BuildSpawn = (request) => {
    const seen = (counts.get(request.promptId) ?? 0) + 1;
    counts.set(request.promptId, seen);
    if (request.promptId === "002") {
      const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      sessions.push(readFileSync(file, "utf8"));
      if (seen === 2) {
        assert.equal(queueStatus(dir, "002"), "queued");
        const run = readBuildRun(dir);
        assert.equal(run?.recoveryRerun, true);
        assert.match(run?.recovery ?? "", /Visible copy failed/);
        assert.match(run?.recovery ?? "", /Repeated sentence failed/);
        assert.match(run?.recovery ?? "", /appears 3 times/);
        sawQueued = true;
      }
    }
    return { pid: 244804, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("001", "REQ-PAGE-home", "src/pages/index.astro", "Build the home page."),
      ".hitchhiker/prompts/002.md": promptFor("002", "REQ-PAGE-guide", "src/pages/guide.astro", "Build the guide page."),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "src/pages/guide.astro": "<p>The guide page introduces the visit.</p>\n",
    });
    writeText(path.join(dir, "dist"), {
      "index.html": page("<p>Ask about this farm.</p>"),
      "guide/index.html": page(`${copies(LINE, 3)}<p>TODO</p>`),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    assert.equal(sawQueued, true);
    assert.equal(counts.get("001"), 1);
    assert.equal(counts.get("002"), 2);
    assert.match(sessions[1] ?? "", /Visible copy failed/);
    assert.match(sessions[1] ?? "", /Repeated sentence failed/);
    assert.match(sessions[1] ?? "", /reword copies in files you own/i);
    assert.match(sessions[1] ?? "", /at most twice/i);
    assert.match(sessions[1] ?? "", /never edit files owned by other prompts/i);
    assert.match(sessions[1] ?? "", /never weaken a check/i);
    assert.equal((sessions[0] ?? "").includes("Repeated sentence failed"), false);
    assert.equal(queueStatus(dir, "001"), "passed");
    assert.equal(queueStatus(dir, "002"), "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Visible copy failed/);
    assert.match(run?.reason ?? "", /Repeated sentence failed/);
    assert.match(run?.recovery ?? "", /Repeated sentence failed/);
  } finally {
    await cleanup(dir);
  }
});

test("a final QA prompt still fails a surface check without a rerun", { timeout: TIMEOUT }, async () => {
  const dir = tempDir("hh-244k-qa-");
  let spawns = 0;
  const spawn: BuildSpawn = () => {
    spawns += 1;
    return { pid: 244803, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("001", "REQ-LAUNCH", "src/styles/tokens.css", "Launch the site."),
      "src/styles/tokens.css": "html { color: #111; }\n",
    });
    writeText(path.join(dir, "dist"), {
      "guide/index.html": page(copies(LINE, 3)),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(spawns, 1);
    assert.equal(queueStatus(dir, "001"), "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, false);
    assert.match(run?.reason ?? "", /Repeated sentence failed/);
    assert.equal(run?.recovery ?? "", "");
  } finally {
    await cleanup(dir);
  }
});
