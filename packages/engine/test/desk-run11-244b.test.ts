/**
 * Desk Run 11: a site-wide copy pass that is not QA or launch is judged
 * by the copy baseline. QA and launch keep the strict full-site scan.
 * An increased-count failure on that pass gets one feedback rerun.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import {
  judgeVisibleCopy,
  promptIsSiteWideCopy,
  promptRequiresFullVisibleCopy,
  shouldScanVisibleCopy,
  type VisibleCopyHit,
  type VisibleCopyJudgeInput,
  type VisibleCopyJudgement,
} from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

function judge(input: Partial<VisibleCopyJudgeInput> = {}): VisibleCopyJudgement {
  return judgeVisibleCopy({
    fullSite: false,
    baseline: { distExisted: true, counts: [] },
    counts: [],
    hits: [],
    ownedSourceHits: [],
    ownedDistFiles: [],
    ...input,
  });
}

function hit(file: string, snippet: string, patternId = "todo"): VisibleCopyHit {
  return { file, snippet, patternId };
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

function immediate(extra?: (dir: string) => void, dir?: string): BuildSpawn {
  return () => {
    if (extra !== undefined && dir !== undefined) extra(dir);
    return { pid: 244101, done: Promise.resolve(ok()) };
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

function promptFor(requirement: string, file: string): string {
  return [
    "## Task",
    "",
    `Prompt 001. ${requirement}`,
    `Files: ${file}`,
    `Requirements: ${requirement}`,
    "",
    "## Design language",
    "",
    "Example only.",
    "",
  ].join("\n");
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
  if (options.sources !== undefined) {
    for (const [rel, text] of Object.entries(options.sources)) {
      const abs = path.join(dir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, text, "utf8");
    }
  }
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

const ANTI_SLOP = [
  "## Task",
  "",
  "Prompt 102. Run the anti-slop pass on copy and layout.",
  "Files: tests/antislop.spec.ts",
  "Acceptance: Visible copy speaks to the visitor only. Plan metadata attributes (data-job, data-launch-check, data-component with source paths, and similar) are not rendered in production builds.",
  "Requirements: REQ-GATE-ANTISLOP",
  "",
  "## Rules",
  "",
  "Requirements: REQ-LAUNCH",
  "",
].join("\n");

const ELEVATE = [
  "## Task",
  "",
  "Prompt 116. Elevate pass for copy. Never show a missing fact as TODO, a placeholder, or brackets.",
  "Files: src/data/copy.ts, tests/elevate-copy.spec.ts",
  "Requirements: REQ-ELEVATE-COPY",
  "",
  "## Design language",
  "",
  "Example only.",
  "",
].join("\n");

test("anti-slop and elevate-copy are site-wide passes, and QA and launch stay on the strict scan", () => {
  assert.equal(promptIsSiteWideCopy(ANTI_SLOP), true);
  assert.equal(promptRequiresFullVisibleCopy(ANTI_SLOP), false);
  assert.equal(shouldScanVisibleCopy(ANTI_SLOP), true);
  assert.equal(promptIsSiteWideCopy(ELEVATE), true);
  assert.equal(promptRequiresFullVisibleCopy(ELEVATE), false);
  assert.equal(shouldScanVisibleCopy(ELEVATE), true);

  const launch = promptFor("REQ-LAUNCH", "src/styles/tokens.css");
  const playwright = promptFor("REQ-GATE-PLAYWRIGHT", "tests/qa.spec.ts");
  const page = promptFor("REQ-COPY-hero", "src/pages/index.astro");
  const both = ["## Task", "", "Requirements: REQ-GATE-ANTISLOP, REQ-LAUNCH", ""].join("\n");
  assert.equal(promptRequiresFullVisibleCopy(launch), true);
  assert.equal(promptIsSiteWideCopy(launch), false);
  assert.equal(promptRequiresFullVisibleCopy(playwright), true);
  assert.equal(promptIsSiteWideCopy(playwright), false);
  assert.equal(promptIsSiteWideCopy(page), false);
  assert.equal(promptRequiresFullVisibleCopy(page), false);
  assert.equal(shouldScanVisibleCopy(page), true);
  assert.equal(promptIsSiteWideCopy(both), false);
  assert.equal(promptRequiresFullVisibleCopy(both), true);
});

test("a site-wide pass passes when every file and pattern count is equal or lower, including leftover owned source", () => {
  const equal = judge({
    siteWide: true,
    baseline: {
      distExisted: true,
      counts: [
        { file: "index.html", patternId: "todo", count: 10 },
        { file: "about/index.html", patternId: "data-copy-es", count: 4 },
      ],
    },
    counts: [
      { file: "index.html", patternId: "todo", count: 10 },
      { file: "about/index.html", patternId: "data-copy-es", count: 4 },
    ],
    hits: [hit("index.html", "TODO shared"), hit("about/index.html", 'data-copy-es="TODO"', "data-copy-es")],
    ownedSourceHits: [{ file: "src/components/Footer.astro", patternId: "todo", snippet: 'data-copy-es="TODO"', line: 4 }],
    ownedDistFiles: ["index.html"],
  });
  assert.equal(equal.reason, "");
  assert.equal(equal.note, "");

  const lower = judge({
    siteWide: true,
    baseline: { distExisted: true, counts: [{ file: "index.html", patternId: "todo", count: 108 }] },
    counts: [{ file: "index.html", patternId: "todo", count: 10 }],
    hits: [hit("index.html", 'data-copy-es="TODO"'), hit("blog/index.html", "not written yet", "not-written-yet")],
    ownedSourceHits: [{ file: "src/components/Footer.astro", patternId: "todo", snippet: 'data-copy-es="TODO"', line: 4 }],
  });
  assert.equal(lower.reason, "");
  assert.equal(lower.note, "");
  assert.doesNotMatch(`${lower.reason}`, /Owned source:/);
});

test("a site-wide pass fails when one file and pattern count rose, and names that hit", () => {
  const result = judge({
    siteWide: true,
    baseline: {
      distExisted: true,
      counts: [
        { file: "about/index.html", patternId: "todo", count: 9 },
        { file: "index.html", patternId: "todo", count: 10 },
        { file: "index.html", patternId: "not-written-yet", count: 1 },
      ],
    },
    counts: [
      { file: "about/index.html", patternId: "todo", count: 10 },
      { file: "index.html", patternId: "todo", count: 4 },
      { file: "index.html", patternId: "not-written-yet", count: 1 },
    ],
    hits: [
      hit("about/index.html", 'data-copy-es="TODO"'),
      hit("index.html", "TODO still here"),
      hit("index.html", "not written yet", "not-written-yet"),
    ],
    ownedSourceHits: [{ file: "src/components/Footer.astro", patternId: "todo", snippet: 'data-copy-es="TODO"', line: 8 }],
    ownedDistFiles: ["index.html"],
  });
  assert.match(result.reason, /Visible copy failed/);
  assert.match(result.reason, /Increased counts:/);
  assert.match(result.reason, /dist\/about\/index\.html: data-copy-es="TODO"/);
  assert.doesNotMatch(result.reason, /TODO still here/);
  assert.doesNotMatch(result.reason, /not written yet/);
  assert.doesNotMatch(result.reason, /Owned source:/);
  assert.doesNotMatch(result.reason, /Owned page:/);
  assert.doesNotMatch(result.reason, /New hits:/);
  assert.equal(result.note, "");
});

test("a site-wide increased-count failure stays inside the existing hit cap", () => {
  const hits: VisibleCopyHit[] = [];
  for (let index = 0; index < 45; index += 1) {
    hits.push(hit("index.html", `TODO increased ${String(index).padStart(2, "0")}`));
  }
  const result = judge({
    siteWide: true,
    baseline: { distExisted: true, counts: [{ file: "index.html", patternId: "todo", count: 1 }] },
    counts: [{ file: "index.html", patternId: "todo", count: 45 }],
    hits,
  });
  const block = result.reason.split("Increased counts:")[1] ?? "";
  const listed = block.split("\n").filter((line) => line.startsWith("dist/"));
  assert.equal(listed.length, 40);
  assert.match(block, /\.\.\. and 5 more/);
});

test("a site-wide pass with no baseline fails only on hits in files it wrote", () => {
  const written = judge({
    siteWide: true,
    baseline: null,
    hits: [hit("blog/index.html", "TODO on the blog"), hit("about/index.html", "TODO on about")],
    ownedSourceHits: [
      { file: "src/pages/blog.astro", patternId: "todo", snippet: "TODO on the blog", line: 1 },
      { file: "src/components/Footer.astro", patternId: "todo", snippet: "TODO in the footer", line: 2 },
    ],
    writtenFiles: ["src/pages/blog.astro", "dist/blog/index.html"],
  });
  assert.match(written.reason, /Visible copy failed/);
  assert.match(written.reason, /Files written:/);
  assert.match(written.reason, /dist\/blog\/index\.html: TODO on the blog/);
  assert.match(written.reason, /src\/pages\/blog\.astro:1 TODO on the blog/);
  assert.doesNotMatch(written.reason, /about\/index\.html/);
  assert.doesNotMatch(written.reason, /Footer\.astro/);
  assert.match(written.note, /dist did not exist before this prompt/);
  assert.match(written.note, /files this prompt wrote/);
  assert.match(written.note, /did not fail hits in files it did not write/);

  const mapped = judge({
    siteWide: true,
    baseline: { distExisted: false, counts: [] },
    hits: [hit("blog/index.html", "TODO on the blog"), hit("about/index.html", "not written yet", "not-written-yet")],
    writtenFiles: ["src/pages/blog.astro"],
  });
  assert.match(mapped.reason, /dist\/blog\/index\.html: TODO on the blog/);
  assert.doesNotMatch(mapped.reason, /about\/index\.html/);
  assert.match(mapped.note, /files this prompt wrote/);

  const untouched = judge({
    siteWide: true,
    baseline: null,
    hits: [hit("about/index.html", "TODO on about"), hit("blog/index.html", "not written yet", "not-written-yet")],
    ownedSourceHits: [{ file: "src/components/Footer.astro", patternId: "todo", snippet: 'data-copy-es="TODO"', line: 3 }],
    writtenFiles: ["tests/antislop.spec.ts"],
  });
  assert.equal(untouched.reason, "");
  assert.match(untouched.note, /did not fail hits in files it did not write/);
});

test("a QA or launch prompt still fails on any hit, with or without a baseline", () => {
  const withBaseline = judge({
    fullSite: true,
    siteWide: true,
    baseline: { distExisted: true, counts: [{ file: "about/index.html", patternId: "todo", count: 9 }] },
    counts: [{ file: "about/index.html", patternId: "todo", count: 1 }],
    hits: [
      hit("about/index.html", "TODO left"),
      hit("about/index.html", 'data-copy-es="TODO"'),
      hit("about/index.html", "not written yet", "not-written-yet"),
      hit("about/index.html", "data-job=", "data-job"),
      hit("about/index.html", "data-launch-check=", "data-launch-check"),
      hit("about/index.html", "PUBLIC_FOO", "public-env"),
    ],
  });
  assert.match(withBaseline.reason, /Visible copy failed/);
  assert.match(withBaseline.reason, /dist\/about\/index\.html: TODO left/);
  assert.match(withBaseline.reason, /data-copy-es="TODO"/);
  assert.match(withBaseline.reason, /not written yet/);
  assert.match(withBaseline.reason, /data-job=/);
  assert.match(withBaseline.reason, /data-launch-check=/);
  assert.match(withBaseline.reason, /PUBLIC_FOO/);
  assert.equal(withBaseline.note, "");
  assert.doesNotMatch(withBaseline.reason, /Increased counts:/);
  assert.doesNotMatch(withBaseline.reason, /Files written:/);
  assert.doesNotMatch(withBaseline.reason, /Owned page:/);

  const without = judge({
    fullSite: true,
    baseline: null,
    hits: [hit("index.html", "not written yet", "not-written-yet")],
  });
  assert.match(without.reason, /dist\/index\.html: not written yet/);
  assert.equal(without.note, "");
});

test("anti-slop and elevate pass when dist counts do not rise, and an edited source can still hold TODO", async () => {
  const dirs: string[] = [];
  try {
    for (const requirement of [
      { id: "REQ-GATE-ANTISLOP", file: "tests/antislop.spec.ts" },
      { id: "REQ-ELEVATE-COPY", file: "src/data/copy.ts" },
    ]) {
      const dir = tempDir("hh-244b-pass-");
      dirs.push(dir);
      const result = await runBuild(dir, promptFor(requirement.id, requirement.file), {
        html: { "index.html": "<p>TODO one</p><p>TODO two</p>\n", "about/index.html": '<a data-copy-es="TODO">Inicio</a>\n' },
        sources: { "src/components/Footer.astro": '<a data-copy-es="TODO">Ask us</a>\n' },
        during: (root) => {
          writeFileSync(path.join(root, "dist", "index.html"), "<p>TODO one</p>\n", "utf8");
          writeFileSync(path.join(root, "src", "components", "Footer.astro"), '<a data-copy-es="TODO">Ask us</a>\n', "utf8");
        },
      });
      assert.equal(result.status, "passed", requirement.id);
      assert.equal(result.reason, "", requirement.id);
    }
  } finally {
    await Promise.all(dirs.map((dir) => cleanup(dir)));
  }
});

test("an anti-slop pass fails when one dist count rises and names that hit", async () => {
  const dir = tempDir("hh-244b-up-");
  try {
    const result = await runBuild(dir, promptFor("REQ-GATE-ANTISLOP", "tests/antislop.spec.ts"), {
      html: { "about/index.html": "<p>TODO already on the about page</p>\n" },
      during: (root) => {
        const visit = path.join(root, "dist", "visit", "index.html");
        mkdirSync(path.dirname(visit), { recursive: true });
        writeFileSync(visit, "<p>TODO added by this pass</p>\n", "utf8");
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.reason, /Increased counts:/);
    assert.match(result.reason, /dist\/visit\/index\.html/);
    assert.match(result.reason, /TODO added by this pass/);
    assert.doesNotMatch(result.reason, /already on the about page/);
  } finally {
    await cleanup(dir);
  }
});

test("a site-wide pass with no dist baseline fails only on hits in files it wrote", async () => {
  const missed = tempDir("hh-244b-miss-");
  const wrote = tempDir("hh-244b-wrote-");
  try {
    const quiet = await runBuild(missed, promptFor("REQ-ELEVATE-COPY", "src/data/copy.ts"), {
      makeDist: false,
      during: (root) => {
        const about = path.join(root, "dist", "about", "index.html");
        mkdirSync(path.dirname(about), { recursive: true });
        writeFileSync(about, "<p>TODO on about</p>\n", "utf8");
      },
    });
    assert.equal(quiet.status, "passed");
    assert.equal(quiet.reason, "");
    assert.match(quiet.log, /dist did not exist before this prompt/);
    assert.match(quiet.log, /files this prompt wrote/);
    assert.match(quiet.log, /did not fail hits in files it did not write/);

    const failed = await runBuild(wrote, promptFor("REQ-GATE-ANTISLOP", "tests/antislop.spec.ts"), {
      makeDist: false,
      during: (root) => {
        const page = path.join(root, "src", "pages", "blog.astro");
        mkdirSync(path.dirname(page), { recursive: true });
        writeFileSync(page, "<p>TODO on the blog</p>\n", "utf8");
        const blog = path.join(root, "dist", "blog", "index.html");
        const about = path.join(root, "dist", "about", "index.html");
        mkdirSync(path.dirname(blog), { recursive: true });
        mkdirSync(path.dirname(about), { recursive: true });
        writeFileSync(blog, "<p>TODO on the blog</p>\n", "utf8");
        writeFileSync(about, "<p>TODO on about</p>\n", "utf8");
      },
    });
    assert.equal(failed.status, "failed");
    assert.match(failed.reason, /Files written:/);
    assert.match(failed.reason, /blog/);
    assert.match(failed.reason, /TODO on the blog/);
    assert.doesNotMatch(failed.reason, /TODO on about/);
    assert.match(failed.log, /files this prompt wrote/);
  } finally {
    await cleanup(missed);
    await cleanup(wrote);
  }
});

test("QA and launch still fail on any pre-existing hit, with or without a baseline", async () => {
  const playwright = tempDir("hh-244b-pw-");
  const launch = tempDir("hh-244b-launch-");
  const rich = [
    "<p>TODO left from the scaffold</p>",
    '<a data-copy-es="TODO">Inicio</a>',
    "<p>This guide is not written yet.</p>",
    '<div data-job="hero"></div>',
    '<section data-launch-check="nav"></section>',
    "<p>Set PUBLIC_FOO before launch.</p>",
  ].join("");
  try {
    const gate = await runBuild(playwright, promptFor("REQ-GATE-PLAYWRIGHT", "tests/qa.spec.ts"), {
      html: { "about/index.html": rich },
    });
    assert.equal(gate.status, "failed");
    assert.match(gate.reason, /TODO left from the scaffold/);
    assert.match(gate.reason, /data-copy-es="TODO"/);
    assert.match(gate.reason, /not written yet/);
    assert.match(gate.reason, /data-job=/);
    assert.match(gate.reason, /data-launch-check=/);
    assert.match(gate.reason, /PUBLIC_FOO/);
    assert.doesNotMatch(gate.reason, /Increased counts:/);
    assert.doesNotMatch(gate.log, /files this prompt wrote/);

    const fresh = await runBuild(launch, promptFor("REQ-LAUNCH", "src/styles/tokens.css"), {
      makeDist: false,
      during: (root) => {
        mkdirSync(path.join(root, "dist"), { recursive: true });
        writeFileSync(path.join(root, "dist", "index.html"), "<p>TODO with no baseline</p>\n", "utf8");
      },
    });
    assert.equal(fresh.status, "failed");
    assert.match(fresh.reason, /TODO with no baseline/);
    assert.doesNotMatch(fresh.reason, /Files written:/);
    assert.doesNotMatch(fresh.log, /files this prompt wrote/);
  } finally {
    await cleanup(playwright);
    await cleanup(launch);
  }
});

test("a site-wide pass that started over the previous run record reruns once with the increased-count reason, then halts", async () => {
  const dir = tempDir("hh-244b-rerun-");
  const outside = path.dirname(dir);
  const sessions: string[] = [];
  let sawPrevious = false;
  const spawn: BuildSpawn = (request) => {
    if (request.promptId === "001") {
      const stdout = `${JSON.stringify({
        type: "tool_call",
        toolName: "list_dir",
        rawInput: { target_directory: outside },
      })}\n{"type":"end","stopReason":"end_turn"}\n`;
      return { pid: 244201, done: Promise.resolve({ code: 0, stdout, stderr: "", errorCode: null }) };
    }
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    sessions.push(readFileSync(file, "utf8"));
    if (!sawPrevious) {
      const prior = readBuildRun(request.cwd);
      assert.equal(prior?.promptId, "001");
      assert.match(prior?.reason ?? "", /The build looked outside its folder:/);
      sawPrevious = true;
      const visit = path.join(request.cwd, "dist", "visit", "index.html");
      mkdirSync(path.dirname(visit), { recursive: true });
      writeFileSync(visit, "<p>TODO added by this pass</p>\n", "utf8");
    }
    return { pid: 244202, done: Promise.resolve(ok()) };
  };
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<p>TODO already on the home page</p>\n", "utf8");
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), promptFor("REQ-TOKENS", "src/styles/tokens.css"), "utf8");
    writeFileSync(
      path.join(dir, ".hitchhiker", "prompts", "002.md"),
      [
        "## Task",
        "",
        "Prompt 002. Run the anti-slop pass on copy and layout.",
        "Files: tests/antislop.spec.ts",
        "Requirements: REQ-GATE-ANTISLOP",
        "",
        "## Design language",
        "",
        "Example only.",
        "",
      ].join("\n"),
      "utf8",
    );
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "queued" },
        { id: "002", kind: "build", status: "queued" },
      ],
    });
    await ensureSiteBuild(dir);
    assert.equal(sawPrevious, true);
    assert.equal(sessions.length, 2);
    assert.equal((sessions[0] ?? "").includes("Increased counts:"), false);
    assert.equal((sessions[0] ?? "").includes("Fix before you finish"), false);
    assert.match(sessions[1] ?? "", /Fix before you finish/);
    assert.match(sessions[1] ?? "", /Visible copy failed/);
    assert.match(sessions[1] ?? "", /Increased counts:/);
    assert.match(sessions[1] ?? "", /dist\/visit\/index\.html/);
    assert.match(sessions[1] ?? "", /TODO added by this pass/);
    assert.equal(readFileSync(path.join(dir, ".hitchhiker", "prompts", "002.md"), "utf8").includes("Fix before you finish"), false);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "002")?.status, "failed");
    const run = readBuildRun(dir);
    assert.equal(run?.promptId, "002");
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Increased counts:/);
    assert.match(run?.reason ?? "", /visit\/index\.html/);
    assert.match(run?.reason ?? "", /TODO added by this pass/);
    assert.doesNotMatch(run?.reason ?? "", /already on the home page/);
  } finally {
    await cleanup(dir);
  }
});
