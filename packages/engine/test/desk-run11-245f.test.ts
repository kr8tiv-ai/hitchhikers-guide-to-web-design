/**
 * Desk Run 11: the built hero must match its declared variant structure.
 * A surface failure reruns once. Signature mode is only the DESIGN.md exception.
 * No network, browser, or grok calls.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  ensureSiteBuild,
  judgeVariantStructure,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  signatureStructures,
  siteBuildSettled,
  variantStructureClose,
  VARIANTS_REL,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { formatFixBeforeFinish, isSurfaceCloseReason } from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

const UNIT = 5_000;
const BUILD = 12_000;

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

function promptFor(files: string, title = "Build the home page."): string {
  return ["## Task", "", `Prompt 001. ${title}`, `Files: ${files}`, "Requirements: REQ-PAGE-home", "", "## Design language", "", "Example only.", ""].join("\n");
}

function nameProject(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name: "Example Site" })}\n`, "utf8");
}

function ranking(rows: { page?: string; section: string; variant: string }[]): string {
  return `${JSON.stringify(
    rows.map((row) => ({
      page: row.page ?? "home",
      section: row.section,
      variant: row.variant,
      alternatives: [],
      reason: "Ranked first for this page.",
    })),
    null,
    2,
  )}\n`;
}

function techniques(lines: readonly string[]): string {
  return ["---", "name: Example", "---", "", "## Signature moments", "", "None locked yet.", "", "## Signature techniques", "", ...lines, ""].join("\n");
}

const TITLE = `<h1 data-slot="title">North field at first light</h1>`;
const MEDIA = `<div data-slot="media"></div>`;
const BODY = `<p data-slot="body">The valley holds the morning fog.</p>`;

function cinematic(extra = ""): string {
  return `<section data-section="hero" data-variant="cinematic" class="hh-hero hh-hero--cinematic" ${extra}>${MEDIA}${TITLE}</section>`;
}

function closeOn(dir: string, html: string, design = "", rows: { section: string; variant: string }[] = [{ section: "hero", variant: "cinematic" }], files = "src/pages/index.astro"): { reason: string; log: string } {
  writeText(dir, {
    "src/pages/index.astro": html,
    "dist/index.html": page(html),
    ...(design === "" ? {} : { "DESIGN.md": design }),
    [VARIANTS_REL]: ranking(rows),
  });
  return variantStructureClose(dir, promptFor(files), []);
}

test("signature structures are read from Signature techniques only", { timeout: UNIT }, () => {
  const designed = techniques(["A designed hero with a clear first frame."]);
  assert.deepEqual(signatureStructures(designed), []);
  const elsewhere = [
    "---",
    "name: Example",
    "---",
    "",
    "## Overview",
    "",
    "Signature structure for the hero. Media covers at least 90% of the viewport at 1440.",
    "",
    "## Signature techniques",
    "",
    "A designed hero with a clear first frame.",
    "",
  ].join("\n");
  assert.deepEqual(signatureStructures(elsewhere), []);
  const named = signatureStructures(techniques(["Signature structure for the hero. Media covers at least 90% of the viewport at 1440."]));
  assert.equal(named.length, 1);
  assert.equal(named[0]?.section, "hero");
  assert.equal(named[0]?.structure?.layout[0]?.kind, "media-cover");
  assert.equal(named[0]?.structure?.layout[0]?.at, 1440);
  assert.equal(named[0]?.structure?.layout[0]?.minFraction, 0.9);
});

test("a cinematic hero at 60 percent fails media-cover and a class hero passes", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-cine-");
  try {
    const narrow = `<section data-section="hero" data-variant="cinematic" class="hh-hero hh-hero--cinematic">${MEDIA.replace(">", ' style="height:60vh;width:100%">')}${TITLE}</section>`;
    const failed = closeOn(dir, narrow);
    assert.match(failed.reason, /^Variant structure failed\./);
    assert.match(failed.reason, /hero media-cover/);
    assert.match(failed.reason, /Media covers at least 90% of the viewport at 1440/);
    assert.match(failed.reason, /Actual 0\.6/);
    assert.match(failed.reason, /Expected >= 0\.9/);
    assert.equal(failed.log, "");
    assert.equal(isSurfaceCloseReason(failed.reason), true);
    const recovery = formatFixBeforeFinish([], failed.reason);
    assert.match(recovery, /Fix before you finish/);
    assert.match(recovery, /media-cover/);
    assert.match(recovery, /Actual 0\.6/);

    const passed = closeOn(dir, cinematic());
    assert.equal(passed.reason, "");
    assert.equal(passed.log, "");
  } finally {
    removeTempDir(dir);
  }
});

test("a declared split-editorial hero with equal columns fails", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-split-");
  try {
    const equal = `<section data-section="hero" data-variant="split-editorial" style="grid-template-columns: 1fr 1fr">${MEDIA}${TITLE}${BODY}</section>`;
    const failed = closeOn(dir, equal, "", [{ section: "hero", variant: "split-editorial" }]);
    assert.match(failed.reason, /hero unequal-columns/);
    assert.match(failed.reason, /Actual 0\.5, 0\.5/);
    assert.match(failed.reason, /unequal widths at 1024/);
    assert.equal(failed.reason.includes("data-variant"), false);

    const uneven = `<section data-section="hero" data-variant="split-editorial" style="grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr)">${MEDIA}${TITLE}${BODY}</section>`;
    assert.equal(closeOn(dir, uneven, "", [{ section: "hero", variant: "split-editorial" }]).reason, "");
    const byClass = `<section data-section="hero" data-variant="split-editorial" class="hh-hero hh-hero--split-editorial">${MEDIA}${TITLE}${BODY}</section>`;
    assert.equal(closeOn(dir, byClass, "", [{ section: "hero", variant: "split-editorial" }]).reason, "");
  } finally {
    removeTempDir(dir);
  }
});

test("a hero whose data-variant differs from variants.json fails before layout", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-mismatch-");
  try {
    const html = `<section data-section="hero" data-variant="split-editorial" style="grid-template-columns: 1fr 1fr">${MEDIA}${TITLE}${BODY}</section>`;
    const failed = closeOn(dir, html, "", [{ section: "hero", variant: "cinematic" }]);
    assert.match(failed.reason, /hero data-variant/);
    assert.match(failed.reason, /variants\.json/);
    assert.match(failed.reason, /split-editorial/);
    assert.match(failed.reason, /cinematic/);
    assert.equal(failed.reason.includes("unequal-columns"), false);
    assert.equal(failed.log, "");
  } finally {
    removeTempDir(dir);
  }
});

test("signature mode is used only when Signature techniques names that section", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-sign-");
  const bare = `<section data-section="hero" data-media-cover="0.6">${MEDIA}${TITLE}</section>`;
  try {
    const designed = closeOn(dir, bare, techniques(["A designed hero with a clear first frame."]));
    assert.match(designed.reason, /The hero has no data-variant/);
    assert.equal(designed.log, "");
    assert.equal(designed.reason.includes("signature mode"), false);

    const other = closeOn(dir, bare, techniques(["Signature structure for the feature. Two columns with unequal widths at 1024."]));
    assert.match(other.reason, /The hero has no data-variant/);
    assert.equal(other.log, "");

    const named = closeOn(dir, bare, techniques(["Signature structure for the hero. Media covers at least 90% of the viewport at 1440."]));
    assert.equal(named.log, "Variant structure gate ran in signature mode for hero.");
    assert.match(named.reason, /hero media-cover/);
    assert.match(named.reason, /Actual 0\.6/);

    const quiet = closeOn(dir, cinematic(), techniques(["Signature structure for the hero."]));
    assert.equal(quiet.reason, "");
    assert.equal(quiet.log, "");

    const open = closeOn(dir, `<section data-section="hero">${MEDIA}${TITLE}</section>`, techniques(["Signature structure for the hero."]));
    assert.equal(open.reason, "");
    assert.equal(open.log, "Variant structure gate ran in signature mode for hero.");
  } finally {
    removeTempDir(dir);
  }
});

test("a feature is checked only when it has a declared structure", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-feature-");
  const feature = `<section data-section="feature" style="grid-template-columns: 1fr 1fr">${MEDIA}${TITLE}</section>`;
  try {
    const ignored = closeOn(dir, feature, "", [{ section: "feature", variant: "split-editorial" }]);
    assert.equal(ignored.reason, "");
    assert.equal(ignored.log, "");

    const declared = closeOn(
      dir,
      feature,
      techniques(["Signature structure for the feature. Two columns with unequal widths at 1024."]),
      [],
    );
    assert.match(declared.reason, /feature unequal-columns/);
    assert.equal(declared.log, "Variant structure gate ran in signature mode for feature.");
    assert.equal(declared.reason.includes("hero"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the gate stays quiet unless this prompt owns the page", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-owner-");
  const bad = cinematic(`data-media-cover="0.6"`);
  try {
    writeText(dir, {
      "src/styles/tokens.css": "html { color: #111; }\n",
      "src/pages/guide.astro": "<p>The guide introduces the valley.</p>\n",
      "dist/index.html": page(bad),
      [VARIANTS_REL]: ranking([{ section: "hero", variant: "cinematic" }]),
    });
    assert.equal(variantStructureClose(dir, promptFor("src/styles/tokens.css"), []).reason, "");
    assert.equal(variantStructureClose(dir, promptFor("src/pages/guide.astro"), []).reason, "");
    const heroFile = variantStructureClose(dir, promptFor("src/components/Hero.astro"), []);
    assert.match(heroFile.reason, /media-cover/);

    writeText(dir, { "src/pages/index.astro": "<p>Ask about this farm.</p>\n" });
    assert.equal(variantStructureClose(dir, promptFor("src/pages/index.astro"), []).reason.includes("media-cover"), true);
  } finally {
    removeTempDir(dir);
  }
});

test("a missing declared hero fails, and an unknown data-variant fails", { timeout: UNIT }, () => {
  const dir = tempDir("hh-245f-missing-");
  try {
    const missing = closeOn(dir, "<p>Ask about this farm.</p>");
    assert.match(missing.reason, /hero hero:/);
    assert.match(missing.reason, /No \[data-section=hero\]/);

    const unknown = closeOn(
      dir,
      `<section data-section="hero" data-variant="poster">${MEDIA}${TITLE}</section>`,
      "",
      [{ section: "hero", variant: "poster" }],
    );
    assert.match(unknown.reason, /which has no structure/);
    assert.match(unknown.reason, /poster/);
  } finally {
    removeTempDir(dir);
  }
});

test("judge names the broken fact and does not compare variants.json inside the checker", { timeout: UNIT }, () => {
  const judgement = judgeVariantStructure({
    designMd: "",
    ranking: [{ page: "home", section: "hero", variant: "cinematic", alternatives: [], reason: "Ranked first." }],
    built: [
      {
        page: "home",
        facts: {
          section: "hero",
          variant: "statement",
          slots: ["title", "body"],
          measures: [{ width: 1440, centred: true, progressive: true }],
        },
      },
    ],
  });
  assert.equal(judgement.ok, false);
  assert.equal(judgement.mode, "variant");
  assert.equal(judgement.breaches[0]?.fact, "data-variant");
  assert.equal(judgement.breaches.length, 1);
});

test("a home prompt reruns once when the hero misses its structure, then halts", { timeout: BUILD }, async () => {
  const dir = tempDir("hh-245f-rerun-");
  const sessions: string[] = [];
  let sawQueued = false;
  const counts = new Map<string, number>();
  const spawn: BuildSpawn = (request) => {
    const seen = (counts.get(request.promptId) ?? 0) + 1;
    counts.set(request.promptId, seen);
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    sessions.push(readFileSync(file, "utf8"));
    if (seen === 2) {
      const parsed = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "queue.json"), "utf8")) as {
        items?: Array<{ id?: string; status?: string }>;
      };
      assert.equal(parsed.items?.find((item) => item.id === "001")?.status, "queued");
      const run = readBuildRun(dir);
      assert.equal(run?.recoveryRerun, true);
      assert.match(run?.recovery ?? "", /Variant structure failed/);
      assert.match(run?.recovery ?? "", /media-cover/);
      sawQueued = true;
    }
    return { pid: 245601, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    const hero = `<section data-section="hero" data-variant="cinematic" class="hh-hero hh-hero--cinematic"><div data-slot="media" style="height:60vh;width:100%"></div>${TITLE}</section>`;
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("src/pages/index.astro"),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "dist/index.html": page(hero),
      [VARIANTS_REL]: ranking([{ section: "hero", variant: "cinematic" }]),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(sawQueued, true);
    assert.equal(counts.get("001"), 2);
    assert.match(sessions[1] ?? "", /Variant structure failed/);
    assert.match(sessions[1] ?? "", /media-cover/);
    assert.match(sessions[1] ?? "", /Actual 0\.6/);
    assert.equal((sessions[0] ?? "").includes("Variant structure failed"), false);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.recoveryRerun, true);
    assert.match(run?.reason ?? "", /Variant structure failed/);
    assert.match(run?.reason ?? "", /hero media-cover/);
    const logPath = path.join(dir, ".hitchhiker", "logs", "build-001.log");
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    assert.equal(log.includes("signature mode"), false);
  } finally {
    await cleanup(dir);
  }
});

test("a correct cinematic hero passes the close without signature mode", { timeout: BUILD }, async () => {
  const dir = tempDir("hh-245f-pass-");
  let spawns = 0;
  const spawn: BuildSpawn = () => {
    spawns += 1;
    return { pid: 245602, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("src/pages/index.astro"),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "dist/index.html": page(cinematic()),
      "DESIGN.md": techniques(["Signature structure for the hero."]),
      [VARIANTS_REL]: ranking([{ section: "hero", variant: "cinematic" }]),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(spawns, 1);
    const parsed = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "queue.json"), "utf8")) as {
      items?: Array<{ id?: string; status?: string }>;
    };
    assert.equal(parsed.items?.find((item) => item.id === "001")?.status, "passed");
    const run = readBuildRun(dir);
    assert.equal(run?.status, "passed");
    assert.notEqual(run?.recoveryRerun, true);
    const logPath = path.join(dir, ".hitchhiker", "logs", "build-001.log");
    const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    assert.equal(log.includes("signature mode"), false);
  } finally {
    await cleanup(dir);
  }
});

test("signature mode writes the build log when the hero has no data-variant", { timeout: BUILD }, async () => {
  const dir = tempDir("hh-245f-log-");
  let spawns = 0;
  const spawn: BuildSpawn = () => {
    spawns += 1;
    return { pid: 245603, done: Promise.resolve(ok()) };
  };
  try {
    nameProject(dir);
    const hero = `<section data-section="hero">${MEDIA}${TITLE}</section>`;
    writeText(dir, {
      ".hitchhiker/prompts/001.md": promptFor("src/pages/index.astro"),
      "src/pages/index.astro": "<p>Ask about this farm.</p>\n",
      "dist/index.html": page(hero),
      "DESIGN.md": techniques(["Signature structure for the hero."]),
    });
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal(spawns, 1);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "passed");
    const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-001.log"), "utf8");
    assert.match(log, /Variant structure gate ran in signature mode for hero\./);
  } finally {
    await cleanup(dir);
  }
});
