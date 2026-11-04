/**
 * Desk Run 11: an honest concept caption is allowed off a listing. A listing
 * page and a listing card still fail. Hidden, dictionary, and screen-reader
 * copies of a heading do not count. Two visible copies still fail and name
 * the page. A second card render owned by a later feature fails that feature
 * and a launch prompt, not an earlier layout prompt.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
import { formatConceptImageFailure, formatDuplicateBlockFailure, scanConceptImages, scanDuplicateBlocks } from "../src/spec/site-structure.ts";
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

function immediate(): BuildSpawn {
  return () => ({ pid: 244901, done: Promise.resolve(ok()) });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
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

function writeText(dir: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text, "utf8");
  }
}

function nameProject(dir: string, name: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name })}\n`, "utf8");
}

function doc(title: string, description: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body>${body}</body></html>`;
}

async function runBuild(
  dir: string,
  id: string,
  prompt: string,
  html: Record<string, string>,
  extra: Record<string, string> = {},
): Promise<{ reason: string; status: string }> {
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

function scanRoot(files: Record<string, string>): string {
  const dir = tempDir("hh-244i-scan-");
  writeText(dir, files);
  return dir;
}

const HONEST = "This picture is a concept, not a listed farm.";

test("an honest concept caption passes off a listing and still fails on a listing", async () => {
  const page = scanRoot({
    "live-on-the-land/index.html": `<figure class="still-card" data-card="still"><img alt="A bench and greens" src="/still.webp"><figcaption>${HONEST}</figcaption></figure>`,
  });
  const farm = scanRoot({
    "farms/pf-001/index.html": `<figure><img alt="Shore" src="/hero.jpg"><figcaption>${HONEST}</figcaption></figure>`,
  });
  const card = scanRoot({
    "index.html": `<article class="farm-card"><img alt="${HONEST}" src="/hero.jpg"></article>`,
  });
  const layoutDir = tempDir("hh-244i-layout-");
  try {
    assert.equal(formatConceptImageFailure(scanConceptImages(page)), "");
    const farmReason = formatConceptImageFailure(scanConceptImages(farm));
    assert.match(farmReason, /Concept image failed/);
    assert.match(farmReason, /dist\/farms\/pf-001\/index\.html/);
    assert.match(farmReason, /not a listed farm/);
    const cardReason = formatConceptImageFailure(scanConceptImages(card));
    assert.match(cardReason, /Concept image failed/);
    assert.match(cardReason, /dist\/index\.html/);

    const layout = await runBuild(
      layoutDir,
      "034",
      promptFor(
        "034",
        "REQ-STRUCT-live-on-the-land-main",
        "src/pages/live-on-the-land.astro",
        "Build the layout on Live on the Land.",
      ),
      {
        "live-on-the-land/index.html": doc(
          "Live on the Land | Example Site",
          "The caretaker match is free.",
          [
            `<figure class="still-card" data-card="still"><img alt="A bench and greens" src="/still.webp"><figcaption>${HONEST}</figcaption></figure>`,
            "<h2>Caretaker program</h2>",
          ].join(""),
        ),
      },
    );
    assert.equal(layout.status, "passed", layout.reason);
    assert.equal(layout.reason.includes("Concept image"), false);
  } finally {
    removeTempDir(page);
    removeTempDir(farm);
    removeTempDir(card);
    await cleanup(layoutDir);
  }
});

test("hidden and dictionary copies of a heading do not count, and two visible copies name the page", async () => {
  const quiet = scanRoot({
    "live-on-the-land/index.html": [
      "<h2>Caretaker program</h2>",
      '<script>const dict = {"Caretaker program": "Programa de cuidadores"};</script>',
      '<p data-copy-es="Caretaker program">The match is free.</p>',
      '<span class="sr-only">Caretaker program</span>',
      '<h2 class="sr-only">Caretaker program</h2>',
      "<template><h2>Caretaker program</h2></template>",
      "<noscript><h2>Caretaker program</h2></noscript>",
    ].join(""),
  });
  const doubled = tempDir("hh-244i-double-");
  try {
    assert.equal(formatDuplicateBlockFailure(scanDuplicateBlocks(quiet)), "");
    const reason = await runBuild(
      doubled,
      "034",
      promptFor(
        "034",
        "REQ-STRUCT-live-on-the-land-main",
        "src/pages/live-on-the-land.astro, src/components/SectionLiveOnTheLandMain.astro",
        "Build the layout on Live on the Land.",
      ),
      {
        "live-on-the-land/index.html": doc(
          "Live on the Land | Example Site",
          "The caretaker match is free.",
          "<h2>Caretaker program</h2><section><h2>Caretaker program</h2></section>",
        ),
      },
      {
        "src/pages/live-on-the-land.astro": "<section><h2>Caretaker program</h2><p>The match is free.</p></section>\n",
        "src/components/SectionLiveOnTheLandMain.astro": "<article class=\"program\"><h2>Caretaker program</h2><p>Buyers pay the seller.</p></article>\n",
      },
    );
    assert.equal(reason.status, "failed");
    assert.match(reason.reason, /Duplicate block failed/);
    assert.match(reason.reason, /dist\/live-on-the-land\/index\.html/);
    assert.match(reason.reason, /heading "Caretaker program" appears 2 times/);
    assert.match(reason.reason, /src\/pages\/live-on-the-land\.astro/);
    assert.match(reason.reason, /src\/components\/SectionLiveOnTheLandMain\.astro/);
  } finally {
    removeTempDir(quiet);
    await cleanup(doubled);
  }
});

test("a later feature's second listing cards fail that feature and launch, not an earlier layout", async () => {
  const dirs: string[] = [];
  const make = (prefix: string): string => {
    const dir = tempDir(prefix);
    dirs.push(dir);
    return dir;
  };
  const html = {
    "farms/index.html": doc(
      "Farms | Example Site",
      "Ocean-view farms are open for questions.",
      '<article class="card"><h2>PF-001</h2></article><article class="card"><h2>PF-001</h2></article>',
    ),
    "visit/index.html": doc("Visit | Example Site", "The valley is open for a walk.", "<h1>Visit</h1><p>The valley is open.</p>"),
  };
  const sources = {
    "src/pages/visit.astro": "<h1>Visit</h1>\n",
    "src/pages/farms.astro": "<SectionFarmsMain />\n<FeatureFavorites />\n",
    "src/components/SectionFarmsMain.astro": '<article class="card"><h2>PF-001</h2></article>\n',
    "src/components/FeatureFavorites.astro": '<article class="card"><h2>PF-001</h2></article>\n',
  };
  const prompts = {
    ".hitchhiker/prompts/020.md": promptFor("020", "REQ-STRUCT-visit", "src/pages/visit.astro", "Build the visit layout."),
    ".hitchhiker/prompts/028.md": promptFor(
      "028",
      "REQ-STRUCT-farms-main",
      "src/components/SectionFarmsMain.astro, src/pages/farms.astro",
      "Build the farms layout.",
    ),
    ".hitchhiker/prompts/080.md": promptFor(
      "080",
      "REQ-FEAT-favorites",
      "src/components/FeatureFavorites.astro",
      "Add the feature: favorites.",
    ),
  };
  try {
    const layout = await runBuild(
      make("hh-244i-unrelated-"),
      "020",
      prompts[".hitchhiker/prompts/020.md"] ?? "",
      html,
      { ...sources, ...prompts },
    );
    assert.equal(layout.status, "passed", layout.reason);
    assert.equal(layout.reason.includes("Duplicate block"), false);

    const farms = await runBuild(
      make("hh-244i-farms-"),
      "028",
      prompts[".hitchhiker/prompts/028.md"] ?? "",
      html,
      { ...sources, ...prompts },
    );
    assert.equal(farms.status, "passed", farms.reason);
    assert.equal(farms.reason.includes("Duplicate block"), false);

    const feature = await runBuild(
      make("hh-244i-feature-"),
      "080",
      prompts[".hitchhiker/prompts/080.md"] ?? "",
      html,
      { ...sources, ...prompts },
    );
    assert.equal(feature.status, "failed");
    assert.match(feature.reason, /Duplicate block failed/);
    assert.match(feature.reason, /dist\/farms\/index\.html/);
    assert.match(feature.reason, /heading "PF-001" appears 2 times/);
    assert.match(feature.reason, /src\/components\/FeatureFavorites\.astro/);

    const launch = await runBuild(
      make("hh-244i-launch-"),
      "099",
      promptFor("099", "REQ-LAUNCH", "src/styles/tokens.css", "Launch the site."),
      html,
      sources,
    );
    assert.equal(launch.status, "failed");
    assert.match(launch.reason, /Duplicate block failed/);
    assert.match(launch.reason, /dist\/farms\/index\.html/);
    assert.match(launch.reason, /heading "PF-001" appears 2 times/);
  } finally {
    for (const dir of dirs) await cleanup(dir);
  }
});
