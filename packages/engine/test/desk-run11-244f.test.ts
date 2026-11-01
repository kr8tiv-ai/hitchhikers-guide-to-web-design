/**
 * Desk Run 11: a listing with no photos uses the owner's hero crop, the home
 * page shows listing cards and path cards, and a listing page has one spec
 * card and one inquiry form. The close check fails a concept caption, an
 * empty gallery, a repeated block, and a home page that only names listings.
 * A prompt that does not own the file is left alone. QA and launch read the
 * whole site.
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
import { generateSkeleton, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import {
  formatConceptImageFailure,
  formatDuplicateBlockFailure,
  formatEmptyGalleryFailure,
  formatHomeListingsFailure,
  scanConceptImages,
  scanDuplicateBlocks,
  scanEmptyGalleries,
  scanHomeListings,
} from "../src/spec/site-structure.ts";
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
  return () => ({ pid: 244601, done: Promise.resolve(ok()) });
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

function taskText(prompt: SitePromptSkeleton): string {
  return [prompt.title, ...(prompt.acceptance ?? [])].join(" ");
}

function byRequirement(prompts: readonly SitePromptSkeleton[], id: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.requirements.includes(id));
  assert.ok(found, id);
  return found;
}

function byTitle(prompts: readonly SitePromptSkeleton[], title: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.title === title);
  assert.ok(found, title);
  return found;
}

function doc(title: string, description: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body>${body}</body></html>`;
}

function dist(files: Record<string, string>): string {
  const dir = tempDir("hh-244f-scan-");
  writeHtml(dir, files);
  return dir;
}

const PHOTO = [
  /owner's supplied hero image/,
  /Photos coming soon/,
  /stock, generated, or concept image/,
  /never caption one concept/,
  /fewer than two real photos/,
];

const HOME = [
  /shared card component/,
  /brief's fade-in/,
  /prefers-reduced-motion/,
  /calm cards/,
  /not a bare link list/,
  /Brief direction lines/,
  /Motion, Layout, Tone, Voice/,
  /never visible headings or copy/,
];

const SPEC = [
  /Exactly one spec card/,
  /exactly one inquiry form/,
  /Ask us/,
  /in its own row once/,
  /not as a link repeated for every row/,
  /do not re-render a block/,
];

function listingPrompts(): SitePromptSkeleton[] {
  return generateSkeleton({
    pages: [
      { id: "home", title: "Home", sections: ["hero", "farms", "paths"], route: "/" },
      { id: "farms", title: "Farms", sections: ["grid"], route: "/farms" },
      { id: "farm-detail", title: "Farm detail", sections: ["gallery", "specs", "inquiry"], route: "/farms/[id]" },
    ],
    effects: [{ id: "farm-reveal", library: "gsap", sectionId: "farms", page: "home" }],
    features: ["gallery", "farm inquiry prefilled with farm id"],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "Paradise Found lists private farms.",
  }).prompts;
}

test("listing card, page, gallery, and image prompts use the owner hero crop", () => {
  const prompts = listingPrompts();
  const jobs = [
    byTitle(prompts, "Add the Home route."),
    byTitle(prompts, "Build the farms layout on Home."),
    byTitle(prompts, "Place real copy in the farms section."),
    byTitle(prompts, "Add the Farms route."),
    byTitle(prompts, "Build the grid layout on Farms."),
    byTitle(prompts, "Add the Farm detail route."),
    byTitle(prompts, "Build the gallery layout on Farm detail."),
    byTitle(
      prompts,
      "Art-direct and place the image set for gallery: use the supplied image if it fits, otherwise the generated set.",
    ),
    byTitle(
      prompts,
      "Art-direct and place the image set for farms: use the supplied image if it fits, otherwise the generated set.",
    ),
    byTitle(prompts, "Add the feature: gallery."),
    byRequirement(prompts, "REQ-FX-farm-reveal"),
    byRequirement(prompts, "REQ-ELEVATE-IMAGERY"),
  ];
  for (const prompt of jobs) {
    const text = taskText(prompt);
    for (const rule of PHOTO) assert.match(text, rule, prompt.title);
  }
  const tokens = taskText(byTitle(prompts, "Set color and type tokens from the approved brand."));
  assert.equal(tokens.includes("Photos coming soon"), false);
  assert.equal(tokens.includes("Exactly one spec card"), false);
});

test("the home page prompt shows listing cards and path cards, and keeps brief lines off the page", () => {
  const prompts = listingPrompts();
  const jobs = [
    byTitle(prompts, "Add the Home route."),
    byTitle(prompts, "Build the farms layout on Home."),
    byTitle(prompts, "Build the paths layout on Home."),
    byTitle(prompts, "Place real copy in the hero section."),
    byTitle(prompts, "Place real copy in the paths section."),
  ];
  for (const prompt of jobs) {
    const text = taskText(prompt);
    for (const rule of HOME) assert.match(text, rule, prompt.title);
    assert.equal(text.includes("once per page"), false, prompt.title);
  }
  const paths = taskText(byTitle(prompts, "Build the paths layout on Home."));
  assert.equal(paths.includes("Photos coming soon"), false);
  assert.equal(paths.includes("Exactly one spec card"), false);

  const towel = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"], route: "/" }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "Mostly Towels sells towels.",
  }).prompts;
  const home = taskText(byTitle(towel, "Add the Home route."));
  for (const rule of HOME) assert.match(home, rule);
  assert.equal(home.includes("Photos coming soon"), false);
  assert.equal(home.includes("Exactly one spec card"), false);
});

test("listing page prompts allow one spec card, one inquiry form, and Ask us once per row", () => {
  const prompts = listingPrompts();
  const jobs = [
    byTitle(prompts, "Add the Farm detail route."),
    byTitle(prompts, "Build the specs layout on Farm detail."),
    byTitle(prompts, "Build the inquiry layout on Farm detail."),
    byTitle(prompts, "Place real copy in the specs section."),
    byTitle(prompts, "Place real copy in the inquiry section."),
    byTitle(prompts, "Add the feature: farm inquiry prefilled with farm id."),
    byTitle(
      prompts,
      "Art-direct and place the image set for specs: use the supplied image if it fits, otherwise the generated set.",
    ),
  ];
  for (const prompt of jobs) {
    const text = taskText(prompt);
    for (const rule of SPEC) assert.match(text, rule, prompt.title);
  }
  const index = taskText(byTitle(prompts, "Add the Farms route."));
  assert.equal(index.includes("Exactly one spec card"), false);
  assert.match(index, /Photos coming soon/);
  const gallery = taskText(byTitle(prompts, "Add the feature: gallery."));
  assert.equal(gallery.includes("Exactly one spec card"), false);
});

test("a concept caption on a listing card fails and the hero crop passes", () => {
  const bad = dist({
    "farms/pf-001/index.html":
      '<article class="card"><figure><img alt="Shore" src="/hero.jpg"><figcaption>This picture is a concept, not a real listing</figcaption></figure></article>',
  });
  const hero = dist({
    "farms/pf-001/index.html":
      '<article class="farm-card"><img alt="The owner hero crop" src="/hero.jpg"><p>Photos coming soon</p></article>',
  });
  const figure = dist({
    "farms/pf-001/index.html": "<figure><img alt=\"Shore\" src=\"/hero.jpg\"><figcaption>A concept</figcaption></figure>",
  });
  const about = dist({
    "about/index.html":
      "<p>This picture is a concept, not a real listing</p><figure><figcaption>A concept</figcaption></figure>",
  });
  const noted = dist({
    "farms/pf-001/index.html":
      "<!-- This picture is a concept, not a real listing --><p>Photos coming soon</p><p>The concept of this coast is a long sentence about how the buyer should walk the land before asking for a visit and what the owner can share.</p>",
  });
  try {
    const failed = formatConceptImageFailure(scanConceptImages(bad));
    assert.match(failed, /Concept image failed/);
    assert.match(failed, /dist\/farms\/pf-001\/index\.html/);
    assert.match(failed, /concept, not a real listing/);
    assert.equal(formatConceptImageFailure(scanConceptImages(hero)), "");
    const caption = formatConceptImageFailure(scanConceptImages(figure));
    assert.match(caption, /Concept image failed/);
    assert.match(caption, /A concept/);
    assert.equal(formatConceptImageFailure(scanConceptImages(about)), "");
    assert.equal(formatConceptImageFailure(scanConceptImages(noted)), "");
    const card = dist({
      "index.html":
        '<article><figcaption>This picture is a concept, not a real listing</figcaption></article>',
    });
    try {
      const homeCard = formatConceptImageFailure(scanConceptImages(card));
      assert.match(homeCard, /dist\/index\.html/);
      assert.match(homeCard, /concept, not a real listing/);
    } finally {
      removeTempDir(card);
    }
  } finally {
    for (const dir of [bad, hero, figure, about, noted]) removeTempDir(dir);
  }
});

test("a gallery with fewer than two images fails and a gallery of three passes", () => {
  const one = dist({
    "visit/index.html":
      '<div class="gallery" aria-roledescription="carousel"><img alt="Field" src="/a.jpg"><button>Previous</button><button>Next</button><p>1 of 1</p></div>',
  });
  const empty = dist({
    "visit/index.html": '<div class="gallery"><p>Photographs of PF-001 are not here yet</p></div>',
  });
  const three = dist({
    "visit/index.html":
      '<div class="gallery"><img alt="One" src="/a.jpg"><img alt="Two" src="/b.jpg"><img alt="Three" src="/c.jpg"><div class="gallery-controls"><button>Previous</button><button>Next</button></div><p>3 of 9</p><script>const label = "1 of 1";</script></div>',
  });
  const picture = dist({
    "visit/index.html": '<section class="gallery"><picture><img alt="One" src="/a.jpg"></picture></section>',
  });
  try {
    const single = formatEmptyGalleryFailure(scanEmptyGalleries(one));
    assert.match(single, /Empty gallery failed/);
    assert.match(single, /dist\/visit\/index\.html/);
    assert.match(single, /gallery has 1 image/);
    assert.match(single, /carousel controls say 1 of 1/);
    const bare = formatEmptyGalleryFailure(scanEmptyGalleries(empty));
    assert.match(bare, /gallery has no image/);
    assert.equal(formatEmptyGalleryFailure(scanEmptyGalleries(three)), "");
    const framed = formatEmptyGalleryFailure(scanEmptyGalleries(picture));
    assert.match(framed, /gallery has 1 image/);
    assert.equal(framed.includes("1 of 1"), false);
  } finally {
    for (const dir of [one, empty, three, picture]) removeTempDir(dir);
  }
});

test("a repeated spec heading or a second inquiry form fails, and one of each passes", () => {
  const doubled = dist({
    "farms/pf-001/index.html":
      "<h2>What we can say</h2><h3>What we can say</h3><form></form><form></form>",
  });
  const once = dist({
    "farms/pf-001/index.html":
      '<header><h2>Farms</h2></header><main><h2>What we can say</h2><h2>Ask about this farm</h2><form></form></main><footer><nav><h3>Farms</h3></nav></footer>',
  });
  const utility = dist({
    "farms/pf-001/index.html": '<form class="newsletter"></form><form aria-label="Search"></form><form></form>',
  });
  const about = dist({
    "about/index.html": "<h2>Visit</h2><form></form><form></form>",
  });
  const singular = dist({
    "farm/index.html": "<h2>What we can say</h2><form></form><form></form>",
  });
  const index = dist({
    "farms/index.html": "<form></form><form></form>",
  });
  try {
    const reason = formatDuplicateBlockFailure(scanDuplicateBlocks(doubled));
    assert.match(reason, /Duplicate block failed/);
    assert.match(reason, /dist\/farms\/pf-001\/index\.html/);
    assert.match(reason, /heading "What we can say" appears 2 times/);
    assert.match(reason, /2 inquiry forms/);
    assert.equal(formatDuplicateBlockFailure(scanDuplicateBlocks(once)), "");
    assert.equal(formatDuplicateBlockFailure(scanDuplicateBlocks(utility)), "");
    assert.equal(formatDuplicateBlockFailure(scanDuplicateBlocks(about)), "");
    const farm = formatDuplicateBlockFailure(scanDuplicateBlocks(singular));
    assert.match(farm, /dist\/farm\/index\.html/);
    assert.match(farm, /2 inquiry forms/);
    assert.equal(formatDuplicateBlockFailure(scanDuplicateBlocks(index)), "");
  } finally {
    for (const dir of [doubled, once, utility, about, singular, index]) removeTempDir(dir);
  }
});

test("the home page needs a listing card when the site has listing pages", () => {
  const named = dist({
    "index.html": "<h2>Farms</h2><p>You can ask about PF-001 and PF-005. Photos coming soon.</p>",
    "farms/pf-001/index.html": "<p>Photos coming soon</p>",
  });
  const cards = dist({
    "index.html":
      '<article class="card"><a href="/farms/pf-001/">PF-001</a><p>Photos coming soon</p></article>',
    "farms/pf-001/index.html": "<p>Photos coming soon</p>",
  });
  const plain = dist({
    "index.html": "<p>You can ask about PF-001 and PF-005. Photos coming soon.</p>",
  });
  const linked = dist({
    "index.html": '<div class="farm-card"><a href="/farms/pf-001">PF-001</a></div>',
    "farms/pf-001/index.html": "<p>Photos coming soon</p>",
  });
  const discard = dist({
    "index.html": '<div class="discard"><a href="/farms/pf-001/">PF-001</a></div>',
    "farms/pf-001/index.html": "<p>Photos coming soon</p>",
  });
  const missingHome = dist({
    "farms/pf-001/index.html": "<p>Photos coming soon</p>",
  });
  try {
    const textOnly = formatHomeListingsFailure(scanHomeListings(named));
    assert.match(textOnly, /Home listings failed/);
    assert.match(textOnly, /dist\/index\.html/);
    assert.match(textOnly, /no card links to a listing page/);
    assert.equal(formatHomeListingsFailure(scanHomeListings(cards)), "");
    assert.equal(formatHomeListingsFailure(scanHomeListings(plain)), "");
    assert.equal(formatHomeListingsFailure(scanHomeListings(linked)), "");
    const notACard = formatHomeListingsFailure(scanHomeListings(discard));
    assert.match(notACard, /no card links to a listing page/);
    assert.equal(formatHomeListingsFailure(scanHomeListings(missingHome)), "");
  } finally {
    for (const dir of [named, cards, plain, linked, discard, missingHome]) removeTempDir(dir);
  }
});

test("a prompt that does not own the file is not failed, and a QA prompt is", async () => {
  const homeDir = tempDir("hh-244f-home-");
  const farmDir = tempDir("hh-244f-farm-");
  const otherDir = tempDir("hh-244f-other-");
  const componentDir = tempDir("hh-244f-comp-");
  const launchDir = tempDir("hh-244f-qa-");
  const cleanDir = tempDir("hh-244f-clean-");
  const cleanLaunch = tempDir("hh-244f-clean-qa-");
  const bad = {
    "index.html": doc(
      "Home | Example Site",
      "Ask about the north parcel.",
      "<h2>Farms</h2><p>You can ask about PF-001 and PF-005. Photos coming soon.</p>",
    ),
    "farms/pf-001/index.html": doc(
      "Farm | Example Site",
      "The north parcel is open for questions.",
      [
        '<article class="card"><img alt="Shore" src="/hero.jpg"><figcaption>This picture is a concept, not a real listing</figcaption></article>',
        '<div class="gallery"><img alt="Field" src="/a.jpg"><button>Previous</button><button>Next</button><p>1 of 1</p></div>',
        "<h2>What we can say</h2><h2>What we can say</h2>",
        "<h2>Ask about this farm</h2><h2>Ask about this farm</h2>",
        "<form></form><form></form>",
      ].join(""),
    ),
  };
  const clean = {
    "index.html": doc(
      "Home | Example Site",
      "Ask about the north parcel.",
      '<article class="farm-card"><a href="/farms/pf-001/">PF-001</a><p>Photos coming soon</p></article>',
    ),
    "farms/pf-001/index.html": doc(
      "Farm | Example Site",
      "The north parcel is open for questions.",
      [
        "<!-- This picture is a concept, not a real listing -->",
        '<article class="farm-card"><img alt="The owner hero crop" src="/hero.jpg"><p>Photos coming soon</p></article>',
        '<div class="gallery"><img alt="One" src="/a.jpg"><img alt="Two" src="/b.jpg"><img alt="Three" src="/c.jpg"><p>3 of 9</p></div>',
        "<script>const label = \"1 of 1\";</script>",
        "<h2>What we can say</h2><h2>Ask about this farm</h2><form></form>",
      ].join(""),
    ),
  };
  try {
    const home = await runBuild(homeDir, promptFor("REQ-PAGE-home", "src/pages/index.astro"), bad);
    assert.equal(home.status, "failed");
    assert.match(home.reason, /Home listings failed/);
    assert.match(home.reason, /dist\/index\.html/);
    assert.equal(home.reason.includes("Concept image"), false);
    assert.equal(home.reason.includes("Empty gallery"), false);
    assert.equal(home.reason.includes("Duplicate block"), false);

    const farm = await runBuild(farmDir, promptFor("REQ-PAGE-farm", "src/pages/farms/pf-001.astro"), bad);
    assert.equal(farm.status, "failed");
    assert.match(farm.reason, /Concept image failed/);
    assert.match(farm.reason, /dist\/farms\/pf-001\/index\.html/);
    assert.match(farm.reason, /concept, not a real listing/);
    assert.match(farm.reason, /Empty gallery failed/);
    assert.match(farm.reason, /gallery has 1 image/);
    assert.match(farm.reason, /Duplicate block failed/);
    assert.match(farm.reason, /2 inquiry forms/);
    assert.equal(farm.reason.includes("Home listings"), false);

    const other = await runBuild(otherDir, promptFor("REQ-PAGE-about", "src/pages/about.astro"), bad);
    assert.equal(other.status, "passed");
    assert.equal(other.reason, "");

    const component = await runBuild(componentDir, promptFor("REQ-STRUCT-card", "src/components/FarmCard.astro"), bad);
    assert.equal(component.status, "passed");
    assert.equal(component.reason, "");

    const qa = await runBuild(launchDir, promptFor("REQ-LAUNCH", "src/styles/tokens.css"), bad);
    assert.equal(qa.status, "failed");
    assert.match(qa.reason, /Concept image failed/);
    assert.match(qa.reason, /Empty gallery failed/);
    assert.match(qa.reason, /Duplicate block failed/);
    assert.match(qa.reason, /Home listings failed/);

    const ownedClean = await runBuild(cleanDir, promptFor("REQ-PAGE-farm", "src/pages/farms/pf-001.astro"), clean);
    assert.equal(ownedClean.status, "passed", ownedClean.reason);
    assert.equal(ownedClean.reason, "");

    const qaClean = await runBuild(cleanLaunch, promptFor("REQ-LAUNCH", "src/styles/tokens.css"), clean);
    assert.equal(qaClean.status, "passed", qaClean.reason);
    assert.equal(qaClean.reason, "");
  } finally {
    await cleanup(homeDir);
    await cleanup(farmDir);
    await cleanup(otherDir);
    await cleanup(componentDir);
    await cleanup(launchDir);
    await cleanup(cleanDir);
    await cleanup(cleanLaunch);
  }
});
