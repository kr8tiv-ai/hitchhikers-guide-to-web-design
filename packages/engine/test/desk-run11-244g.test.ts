/**
 * Desk Run 11: empty gallery and home listings fail the prompt that owns
 * that feature. A hero section prompt that only shares the home page does
 * not. Concept captions and repeated blocks on that page still fail it.
 * QA and launch still read the whole site.
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
  return () => ({ pid: 244701, done: Promise.resolve(ok()) });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
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

function writeHtml(dir: string, files: Record<string, string>): void {
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, html, "utf8");
  }
}

function nameProject(dir: string, name: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name })}\n`, "utf8");
}

async function runBuild(dir: string, prompt: string, html: Record<string, string>): Promise<{ reason: string; status: string }> {
  nameProject(dir, "Example Site");
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), prompt, "utf8");
  writeHtml(path.join(dir, "dist"), html);
  setProjectBuildRunner(dir, immediate());
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  return { reason: readBuildRun(dir)?.reason ?? "", status: readBuildRun(dir)?.status ?? "" };
}

function doc(title: string, description: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body>${body}</body></html>`;
}

const HERO = promptFor("REQ-STRUCT-hero, REQ-ART-hero", "src/components/SectionHero.astro, src/pages/index.astro");
const NAMES = "<p>PF-001, PF-002, PF-003, PF-004, and PF-005.</p>";
const PHOTOS =
  '<img alt="Field one" src="/a.jpg"><img alt="Field two" src="/b.jpg"><img alt="Field three" src="/c.jpg">';
const CARD = '<article class="farm-card"><a href="/farms/pf-001/">PF-001</a></article>';

function home(inner: string): string {
  return doc(
    "Home | Example Site",
    "Ask about the north parcel.",
    `<section id="home-gallery"><h2>Farms</h2>${inner}</section>`,
  );
}

function listing(): string {
  return doc("Farm | Example Site", "The north parcel is open for questions.", "<p>The north parcel is open.</p>");
}

test("feature close checks follow the prompt that owns the gallery or the listings", async () => {
  const dirs: string[] = [];
  const make = (prefix: string): string => {
    const dir = tempDir(prefix);
    dirs.push(dir);
    return dir;
  };
  const bare = {
    "index.html": home(NAMES),
    "farms/pf-001/index.html": listing(),
  };
  const threeImages = {
    "index.html": home(`${NAMES}${PHOTOS}`),
    "farms/pf-001/index.html": listing(),
  };
  // The page job owns both checks, so the passing home page also has three images.
  const withCard = {
    "index.html": home(`${NAMES}${PHOTOS}${CARD}`),
    "farms/pf-001/index.html": listing(),
  };
  const ownedPage = {
    "index.html": doc(
      "Home | Example Site",
      "Ask about the north parcel.",
      [
        '<article class="card"><img alt="Shore" src="/hero.jpg"><figcaption>This picture is a concept, not a real listing</figcaption></article>',
        "<h2>What we can say</h2><h2>What we can say</h2>",
      ].join(""),
    ),
  };
  try {
    const hero = await runBuild(make("hh-244g-hero-"), HERO, bare);
    assert.equal(hero.status, "passed", hero.reason);
    assert.equal(hero.reason.includes("Empty gallery"), false);
    assert.equal(hero.reason.includes("Home listings"), false);

    const section = await runBuild(
      make("hh-244g-section-"),
      promptFor("REQ-STRUCT-gallery, REQ-ART-gallery", "src/pages/index.astro"),
      bare,
    );
    assert.equal(section.status, "passed", section.reason);
    assert.equal(section.reason.includes("Empty gallery"), false);
    assert.equal(section.reason.includes("Home listings"), false);

    const concept = await runBuild(make("hh-244g-concept-"), HERO, ownedPage);
    assert.equal(concept.status, "failed");
    assert.match(concept.reason, /Concept image failed/);
    assert.match(concept.reason, /concept, not a real listing/);
    assert.match(concept.reason, /Duplicate block failed/);
    assert.match(concept.reason, /appears 2 times/);
    assert.equal(concept.reason.includes("Empty gallery"), false);
    assert.equal(concept.reason.includes("Home listings"), false);

    const gallery = await runBuild(make("hh-244g-gallery-"), promptFor("REQ-FEAT-gallery", "src/pages/index.astro"), bare);
    assert.equal(gallery.status, "failed");
    assert.match(gallery.reason, /Empty gallery failed/);
    assert.match(gallery.reason, /dist\/index\.html/);
    assert.match(gallery.reason, /gallery has no image/);
    assert.equal(gallery.reason.includes("Home listings"), false);

    const galleryPass = await runBuild(
      make("hh-244g-gallery-ok-"),
      promptFor("REQ-FEAT-gallery", "src/pages/index.astro"),
      threeImages,
    );
    assert.equal(galleryPass.status, "passed", galleryPass.reason);
    assert.equal(galleryPass.reason.includes("Empty gallery"), false);
    assert.equal(galleryPass.reason.includes("Home listings"), false);

    const carousel = await runBuild(
      make("hh-244g-carousel-"),
      promptFor("REQ-FEAT-photo-carousel", "src/pages/index.astro"),
      bare,
    );
    assert.equal(carousel.status, "failed");
    assert.match(carousel.reason, /Empty gallery failed/);
    assert.equal(carousel.reason.includes("Home listings"), false);

    const page = await runBuild(make("hh-244g-page-"), promptFor("REQ-PAGE-home", "src/pages/index.astro"), bare);
    assert.equal(page.status, "failed");
    assert.match(page.reason, /Home listings failed/);
    assert.match(page.reason, /dist\/index\.html/);
    assert.match(page.reason, /no card links to a listing page/);
    assert.match(page.reason, /Empty gallery failed/);

    const pagePass = await runBuild(make("hh-244g-page-ok-"), promptFor("REQ-PAGE-home", "src/pages/index.astro"), withCard);
    assert.equal(pagePass.status, "passed", pagePass.reason);
    assert.equal(pagePass.reason.includes("Home listings"), false);
    assert.equal(pagePass.reason.includes("Empty gallery"), false);

    const card = await runBuild(make("hh-244g-card-"), promptFor("REQ-STRUCT-card", "src/pages/index.astro"), bare);
    assert.equal(card.status, "failed");
    assert.match(card.reason, /Home listings failed/);
    assert.equal(card.reason.includes("Empty gallery"), false);

    const image = await runBuild(make("hh-244g-image-"), promptFor("REQ-IMAGE-main", "src/pages/index.astro"), bare);
    assert.equal(image.status, "failed");
    assert.match(image.reason, /Empty gallery failed/);
    assert.match(image.reason, /Home listings failed/);

    const launch = await runBuild(make("hh-244g-launch-"), promptFor("REQ-LAUNCH", "src/styles/tokens.css"), bare);
    assert.equal(launch.status, "failed");
    assert.match(launch.reason, /Empty gallery failed/);
    assert.match(launch.reason, /Home listings failed/);
  } finally {
    for (const dir of dirs) await cleanup(dir);
  }
});
