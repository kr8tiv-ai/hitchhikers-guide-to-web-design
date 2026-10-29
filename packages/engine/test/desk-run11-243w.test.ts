/**
 * Desk Run 11: the visible-copy gate follows the prompt that is running,
 * and a retry refreshes stale engine rule text in prompts that have not passed.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  readBuildRun,
  resetSiteBuildWatch,
  retrySiteBuild,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  ensureSiteBuild,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { DESIGN_FRAMING, DESIGN_REMIX_LINE } from "../src/spec/design-language.ts";
import { MISSING_FACT_RULE, SITE_RULES } from "../src/spec/site-rules.ts";
import { countVisibleCopy, scanVisibleCopy } from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

const STALE_RULE = "If a fact is missing, mark it TODO.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function ok(): BuildSpawnResult {
  return { code: 0, stdout: "", stderr: "", errorCode: null };
}

function immediate(extra?: (dir: string) => void, dir?: string): BuildSpawn {
  return () => {
    if (extra !== undefined && dir !== undefined) extra(dir);
    return { pid: 243243, done: Promise.resolve(ok()) };
  };
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

function writeHtml(dir: string, files: Record<string, string>): void {
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(dir, "dist", rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, html, "utf8");
  }
}

function writeSources(dir: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
}

async function runBuild(
  dir: string,
  prompt: string,
  options: { html?: Record<string, string>; sources?: Record<string, string>; during?: (dir: string) => void; makeDist?: boolean } = {},
): Promise<{ reason: string; status: string; log: string }> {
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  if (options.makeDist !== false) mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), prompt, "utf8");
  if (options.html !== undefined) writeHtml(dir, options.html);
  if (options.sources !== undefined) writeSources(dir, options.sources);
  setProjectBuildRunner(dir, immediate(options.during, dir));
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  const logPath = path.join(dir, ".hitchhiker", "logs", "build-001.log");
  return {
    reason: readBuildRun(dir)?.reason ?? "",
    status: readBuildRun(dir)?.status ?? "",
    log: existsSync(logPath) ? readFileSync(logPath, "utf8") : "",
  };
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

const CLEAN_HERO = "---\nconst title = 'Ridge';\n---\n<h1>The valley is open.</h1>\n";

test("countVisibleCopy counts past the 40-hit scan cap", () => {
  const dir = tempDir("hh-243w-count-");
  try {
    const paragraphs = Array.from({ length: 45 }, (_, index) => `<p>TODO ${index}</p>`).join("");
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), `<body>${paragraphs}</body>`, "utf8");
    const counts = countVisibleCopy(path.join(dir, "dist"));
    const todo = counts.find((row) => row.file === "index.html" && row.patternId === "todo");
    assert.ok(todo);
    assert.ok(todo.count >= 45);
    assert.equal(scanVisibleCopy(path.join(dir, "dist")).length, 40);
  } finally {
    removeTempDir(dir);
  }
});

test("a copy prompt passes when another page still has a pre-existing TODO", async () => {
  const dir = tempDir("hh-243w-pass-");
  try {
    const result = await runBuild(dir, HERO, {
      html: { "about/index.html": "<p>TODO from a later prompt</p>\n", "index.html": "<p>The valley is open.</p>\n" },
      sources: { "src/components/SectionHero.astro": CLEAN_HERO },
    });
    assert.equal(result.status, "passed");
    assert.equal(result.reason, "");
  } finally {
    await cleanup(dir);
  }
});

test("a copy prompt fails when it adds a TODO, and the reason names that page", async () => {
  const dir = tempDir("hh-243w-new-");
  try {
    const result = await runBuild(dir, HERO, {
      html: { "about/index.html": "<p>TODO from a later prompt</p>\n" },
      sources: { "src/components/SectionHero.astro": CLEAN_HERO },
      during: (root) => {
        const abs = path.join(root, "dist", "visit", "index.html");
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, "<p>TODO added by this prompt</p>\n", "utf8");
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.reason, /New hits/);
    assert.match(result.reason, /dist\/visit\/index\.html/);
    assert.match(result.reason, /TODO/);
    assert.doesNotMatch(result.reason, /dist\/about\/index\.html/);
  } finally {
    await cleanup(dir);
  }
});

test("an owned astro file fails for a copy attribute or visible TODO, and passes when TODO is only in a comment or script", async () => {
  const attribute = tempDir("hh-243w-attr-");
  const visible = tempDir("hh-243w-visible-");
  const hidden = tempDir("hh-243w-hidden-");
  const hiddenSource = [
    "---",
    "const label = 'TODO';",
    "// TODO in frontmatter",
    "---",
    "<!-- TODO -->",
    "<script>const pending = 'TODO';</script>",
    "<style>/* TODO */</style>",
    "{/* TODO */}",
    "// TODO",
    "/* TODO */",
    "<p>The valley is open.</p>",
    "",
  ].join("\n");
  try {
    const attr = await runBuild(attribute, HERO, {
      html: { "index.html": "<p>The valley is open.</p>\n" },
      sources: { "src/components/SectionHero.astro": '<a data-copy-es="TODO">Hola</a>\n<p>The valley is open.</p>\n' },
    });
    assert.equal(attr.status, "failed");
    assert.match(attr.reason, /Owned source/);
    assert.match(attr.reason, /src\/components\/SectionHero\.astro/);
    assert.match(attr.reason, /data-copy-es="TODO"/);

    const shown = await runBuild(visible, HERO, {
      html: { "index.html": "<p>The valley is open.</p>\n" },
      sources: { "src/components/SectionHero.astro": "<h1>TODO on the hero</h1>\n" },
    });
    assert.equal(shown.status, "failed");
    assert.match(shown.reason, /src\/components\/SectionHero\.astro/);
    assert.match(shown.reason, /TODO on the hero/);

    const quiet = await runBuild(hidden, HERO, {
      html: { "index.html": "<p>The valley is open.</p>\n" },
      sources: { "src/components/SectionHero.astro": hiddenSource },
    });
    assert.equal(quiet.status, "passed");
    assert.equal(quiet.reason, "");
  } finally {
    await cleanup(attribute);
    await cleanup(visible);
    await cleanup(hidden);
  }
});

test("a QA prompt fails on a pre-existing hit anywhere in dist", async () => {
  const dir = tempDir("hh-243w-qa-");
  const prompt = ["## Task", "", "Files: src/styles/tokens.css", "Requirements: REQ-LAUNCH", "", "## Design language", "", "Example only.", ""].join("\n");
  try {
    const result = await runBuild(dir, prompt, {
      html: { "about/index.html": "<p>TODO left from the scaffold</p>\n" },
    });
    assert.equal(result.status, "failed");
    assert.match(result.reason, /dist\/about\/index\.html/);
    assert.match(result.reason, /TODO/);
  } finally {
    await cleanup(dir);
  }
});

test("with no dist baseline, a non-QA prompt ignores pages it does not own and says so", async () => {
  const ignored = tempDir("hh-243w-nobase-");
  const owned = tempDir("hh-243w-nobase-owned-");
  const pagePrompt = ["## Task", "", "Files: src/pages/index.astro", "Requirements: REQ-COPY-hero", "", "## Design language", "", "Example only.", ""].join("\n");
  try {
    const quiet = await runBuild(ignored, HERO, {
      makeDist: false,
      sources: { "src/components/SectionHero.astro": CLEAN_HERO },
      during: (root) => {
        const abs = path.join(root, "dist", "about", "index.html");
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, "<p>TODO on a later page</p>\n", "utf8");
      },
    });
    assert.equal(quiet.status, "passed");
    assert.equal(quiet.reason, "");
    assert.match(quiet.log, /dist did not exist before this prompt/);
    assert.match(quiet.log, /owned files/);

    const failed = await runBuild(owned, pagePrompt, {
      makeDist: false,
      during: (root) => {
        mkdirSync(path.join(root, "dist"), { recursive: true });
        writeFileSync(path.join(root, "dist", "index.html"), "<p>TODO on the owned page</p>\n", "utf8");
      },
    });
    assert.equal(failed.status, "failed");
    assert.match(failed.reason, /dist\/index\.html/);
    assert.match(failed.reason, /TODO/);
    assert.match(failed.log, /dist did not exist before this prompt/);
  } finally {
    await cleanup(ignored);
    await cleanup(owned);
  }
});

test("a retried prompt takes a fresh baseline, so a TODO that appeared between runs is not new", async () => {
  const dir = tempDir("hh-243w-fresh-");
  try {
    const first = await runBuild(dir, HERO, {
      html: { "about/index.html": "<p>The valley is open.</p>\n" },
      sources: { "src/components/SectionHero.astro": CLEAN_HERO },
    });
    assert.equal(first.status, "passed");
    writeHtml(dir, { "about/index.html": "<p>TODO arrived after the first run</p>\n" });
    setProjectBuildRunner(dir, immediate());
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(readBuildRun(dir)?.status, "passed");
    assert.equal(readBuildRun(dir)?.reason ?? "", "");
  } finally {
    await cleanup(dir);
  }
});

test("retry rewrites stale engine rules on a prompt that has not passed and leaves a passed prompt alone", async () => {
  const dir = tempDir("hh-243w-refresh-");
  const stale = (id: string, title: string): string =>
    [
      "---",
      `id: ${id}`,
      `title: ${title}`,
      "---",
      "",
      `# ${title}`,
      "",
      "## Site Brief",
      "",
      "The ridge stays open.",
      "",
      "## Rules",
      "",
      STALE_RULE,
      "Keep the old workspace sentence.",
      "",
      "## Task",
      "",
      `Prompt ${id}. Write the hero copy for the ridge.`,
      "Files: src/components/SectionHero.astro",
      `Acceptance: The hero states the place. ${STALE_RULE}`,
      "Requirements: REQ-COPY-hero",
      "Owner note: keep the cedar caption.",
      "",
      "## Design language",
      "",
      "This is direction and vocabulary, not a limit. Use the old limit.",
      "Take the thinking, not the pixels.",
      "",
      "### Art direction",
      "",
      "Cedar and mist.",
      "",
    ].join("\n");
  const originalFailed = stale("026", "Hero copy");
  const originalPassed = stale("027", "Visit copy");
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "026.md"), originalFailed, "utf8");
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "027.md"), originalPassed, "utf8");
    writeSources(dir, { "src/components/SectionHero.astro": CLEAN_HERO });
    setProjectBuildRunner(dir, immediate());
    await saveQueue(dir, {
      items: [
        { id: "026", kind: "build", status: "failed" },
        { id: "027", kind: "build", status: "passed" },
      ],
    });
    await retrySiteBuild(dir, "026");
    await siteBuildSettled(dir);
    const refreshed = readFileSync(path.join(dir, ".hitchhiker", "prompts", "026.md"), "utf8");
    const previous = readFileSync(path.join(dir, ".hitchhiker", "prompts", ".prev", "026.md"), "utf8");
    const passed = readFileSync(path.join(dir, ".hitchhiker", "prompts", "027.md"), "utf8");
    const refreshLog = readFileSync(path.join(dir, ".hitchhiker", "prompt-refresh.log"), "utf8");
    assert.equal(previous, originalFailed);
    assert.equal(passed, originalPassed);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts", ".prev", "027.md")), false);
    assert.equal(refreshed.includes(STALE_RULE), false);
    assert.equal(refreshed.includes("not the pixels"), false);
    assert.ok(refreshed.includes(SITE_RULES));
    assert.ok(refreshed.includes(MISSING_FACT_RULE));
    assert.ok(refreshed.includes(DESIGN_FRAMING));
    assert.ok(refreshed.includes(DESIGN_REMIX_LINE));
    assert.match(refreshed, /Prompt 026\. Write the hero copy for the ridge\./);
    assert.match(refreshed, /Files: src\/components\/SectionHero\.astro/);
    assert.match(refreshed, /Requirements: REQ-COPY-hero/);
    assert.match(refreshed, /The hero states the place\./);
    assert.match(refreshed, /Owner note: keep the cedar caption\./);
    assert.match(refreshed, /The ridge stays open\./);
    assert.match(refreshed, /Cedar and mist\./);
    assert.match(refreshLog, /Refreshed 026\.md engine-owned blocks\./);
    assert.doesNotMatch(refreshLog, /027\.md/);
  } finally {
    await cleanup(dir);
  }
});

test("a prompt whose Rules block cannot be bounded is left unchanged and the reason is logged", async () => {
  const dir = tempDir("hh-243w-unbounded-");
  const original = `## Rules\n\n${STALE_RULE}\n`;
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "004.md"), original, "utf8");
    setProjectBuildRunner(dir, immediate());
    await saveQueue(dir, { items: [{ id: "004", kind: "build", status: "failed" }] });
    await retrySiteBuild(dir, "004");
    await siteBuildSettled(dir);
    assert.equal(readFileSync(path.join(dir, ".hitchhiker", "prompts", "004.md"), "utf8"), original);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts", ".prev", "004.md")), false);
    const refreshLog = readFileSync(path.join(dir, ".hitchhiker", "prompt-refresh.log"), "utf8");
    assert.match(refreshLog, /004\.md left unchanged: The Rules block has no following heading\./);
  } finally {
    await cleanup(dir);
  }
});
