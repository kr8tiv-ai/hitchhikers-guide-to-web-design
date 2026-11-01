/**
 * Desk Run 11: titles carry the derived site name, meta descriptions are real
 * sentences, and the header bar keeps the mark, the wordmark, and desktop links.
 * The close check fails the layout, SEO, and QA prompts that own the head.
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
import { derivedSiteName } from "../src/spec/design-outputs.ts";
import { formatDocumentHeadFailure, promptChecksDocumentHead, scanDocumentHead } from "../src/spec/site-head.ts";
import { generateSkeleton, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import { scanVisibleCopy, VISIBLE_COPY_PATTERNS } from "../src/spec/visible-copy.ts";
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
  return () => ({ pid: 244301, done: Promise.resolve(ok()) });
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

function page(title: string, description: string | null): string {
  const meta = description === null ? "" : `<meta name="description" content="${description}">`;
  return `<!doctype html><html><head><title>${title}</title>${meta}</head><body><p>The ridge stays open through winter.</p></body></html>`;
}

const REAL = "The ridge stays open through winter.";
const NOT_WRITTEN = "The method is not written yet.";
const WRITTEN_HERE = "What is known about this farm is written here.";

function writeHtml(dir: string, files: Record<string, string>): void {
  for (const [rel, html] of Object.entries(files)) {
    const abs = path.join(dir, "dist", rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, html, "utf8");
  }
}

function nameProject(dir: string, name: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "project.json"), `${JSON.stringify({ name })}\n`, "utf8");
}

async function runBuild(
  dir: string,
  prompt: string,
  html: Record<string, string>,
  siteName = "Example Site",
): Promise<{ reason: string; status: string }> {
  nameProject(dir, siteName);
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), prompt, "utf8");
  writeHtml(dir, html);
  setProjectBuildRunner(dir, immediate());
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  return { reason: readBuildRun(dir)?.reason ?? "", status: readBuildRun(dir)?.status ?? "" };
}

function skeleton(): SitePromptSkeleton[] {
  return generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: ["sitemap"],
    stack: "astro",
    protectedPaths: [],
    brief: "Example Site does not invent a price.",
  }).prompts;
}

function byRequirement(prompts: readonly SitePromptSkeleton[], id: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.requirements.includes(id));
  assert.ok(found, id);
  return found;
}

function taskText(prompt: SitePromptSkeleton): string {
  return [prompt.title, ...(prompt.acceptance ?? [])].join(" ");
}

test("nav and layout prompts require a bar-sized mark and inline desktop links", () => {
  const prompts = skeleton();
  const nav = byRequirement(prompts, "REQ-NAV");
  const layout = byRequirement(prompts, "REQ-LAYOUT");
  for (const prompt of [nav, layout]) {
    const text = taskText(prompt);
    assert.match(text, /logo mark/);
    assert.match(text, /wordmark/);
    assert.match(text, /sized for the bar and not the full lockup section/);
    assert.match(text, /at every width/);
    assert.match(text, /From 1024px up every nav route shows inline/);
    assert.match(text, /nothing is hidden behind a Menu button/);
    assert.match(text, /Below 1024px the bar keeps the logo and a Menu button/);
    assert.match(text, /No link or action may be clipped or overflow the bar at 1280, 1024, 820 and 390px/);
  }
});

test("layout and SEO prompts require a branded title and a real description, using the derived site name", () => {
  assert.equal(derivedSiteName("Example Site does not invent a price."), "Example Site");
  assert.equal(derivedSiteName("Ridge Trail does not invent a price."), "Ridge Trail");
  const prompts = skeleton();
  const layout = byRequirement(prompts, "REQ-LAYOUT");
  const gate = byRequirement(prompts, "REQ-GATE-SEO");
  const item = prompts.find((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-SEO-")));
  assert.ok(item);
  for (const prompt of [layout, gate, item]) {
    const text = taskText(prompt);
    assert.match(text, /<page title> \| Example Site/);
    assert.match(text, /Example Site \| <short promise>/);
    assert.match(text, /unique per path/);
    assert.match(text, /real, calm sentence/);
    assert.match(text, /is written here/);
    assert.match(text, /this page/);
    assert.match(text, /is not here yet/);
    assert.match(text, /not written yet/);
    assert.match(text, /never empty/);
  }
  const coast = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "Coast Line does not invent a price.",
  }).prompts;
  assert.match(taskText(byRequirement(coast, "REQ-LAYOUT")), /<page title> \| Coast Line/);
});

test("the brand gate asks for a header visibility test at 1280px and 390px", () => {
  const prompts = skeleton();
  const brand = byRequirement(prompts, "REQ-GATE-BRAND");
  const visual = byRequirement(prompts, "REQ-GATE-VISUAL");
  const text = taskText(brand);
  assert.match(text, /Add a test that, at 1280px, the logo mark and the wordmark are visible inside the header/);
  assert.match(text, /every nav link is visible and not clipped/);
  assert.match(text, /at 390px the Menu button is visible/);
  assert.equal(prompts.filter((prompt) => prompt.requirements.includes("REQ-GATE-BRAND")).length, 1);
  assert.equal(taskText(visual).includes("1280px"), false);
  assert.equal(prompts.some((prompt) => prompt.requirements.some((id) => /HEADER/.test(id))), false);
});

test("a bare title, a duplicate title, and a narration or missing-fact description fail the head check", () => {
  const written = VISIBLE_COPY_PATTERNS.find((pattern) => pattern.id === "written-here");
  const missing = VISIBLE_COPY_PATTERNS.find((pattern) => pattern.id === "not-written-yet");
  assert.ok(written);
  assert.ok(missing);
  assert.equal(new Set(VISIBLE_COPY_PATTERNS.map((pattern) => pattern.id)).size, VISIBLE_COPY_PATTERNS.length);

  const narrated = tempDir("hh-244c-narr-");
  const head = tempDir("hh-244c-head-");
  try {
    mkdirSync(path.join(narrated, "dist"), { recursive: true });
    writeFileSync(
      path.join(narrated, "dist", "index.html"),
      `<p>${WRITTEN_HERE}</p>`,
      "utf8",
    );
    const hits = scanVisibleCopy(path.join(narrated, "dist"));
    assert.equal(hits.some((hit) => hit.patternId === "written-here"), true);
    assert.match(hits.map((hit) => hit.snippet).join("\n"), /is written here/);

    writeHtml(head, {
      "index.html": page("Home", REAL),
      "about/index.html": page("Home | Example Site", REAL),
      "visit/index.html": page("Visit | Example Site", REAL),
      "same/index.html": page("Visit | Example Site", REAL),
      "eco/index.html": page("Eco | Example Site", NOT_WRITTEN),
      "farm/index.html": page("Farm | Example Site", WRITTEN_HERE),
      "blank/index.html": page("Blank | Example Site", ""),
      "missing/index.html": page("Missing | Example Site", null),
      "good/index.html": page("Good | Example Site", REAL),
    });
    const root = path.join(head, "dist");
    const issues = scanDocumentHead(root, "Example Site");
    const reason = formatDocumentHeadFailure(issues);
    assert.match(reason, /Head check failed/);
    assert.match(reason, /dist\/index\.html: title "Home" does not include the site name "Example Site"/);
    assert.equal(issues.some((issue) => issue.file === "good/index.html"), false);
    assert.equal(issues.some((issue) => issue.file === "about/index.html"), false);

    const duplicates = issues.filter((issue) => issue.kind === "duplicate-title");
    assert.deepEqual(
      duplicates.map((issue) => issue.file).sort(),
      ["same/index.html", "visit/index.html"],
    );
    assert.match(reason, /dist\/visit\/index\.html: duplicate title "Visit \| Example Site"/);
    assert.match(reason, /dist\/same\/index\.html: duplicate title "Visit \| Example Site"/);

    const eco = issues.find((issue) => issue.file === "eco/index.html");
    assert.equal(eco?.kind, "bad-description");
    assert.equal(eco?.patternId, "not-written-yet");
    assert.match(eco?.detail ?? "", /The method is not written yet\./);

    const farm = issues.find((issue) => issue.file === "farm/index.html");
    assert.equal(farm?.kind, "bad-description");
    assert.equal(farm?.patternId, "written-here");
    assert.match(farm?.detail ?? "", /What is known about this farm is written here\./);

    assert.equal(issues.find((issue) => issue.file === "blank/index.html")?.kind, "empty-description");
    assert.equal(issues.find((issue) => issue.file === "missing/index.html")?.kind, "empty-description");
    assert.equal(formatDocumentHeadFailure([]), "");

    const branded = scanDocumentHead(root, "Example Site").filter((issue) => issue.file === "good/index.html");
    assert.deepEqual(branded, []);
  } finally {
    removeTempDir(narrated);
    removeTempDir(head);
  }
});

test("the head reason names at most 40 pages", () => {
  const dir = tempDir("hh-244c-cap-");
  try {
    const files: Record<string, string> = {};
    for (let index = 0; index < 41; index += 1) {
      files[`page-${String(index).padStart(2, "0")}/index.html`] = page(`Page ${String(index).padStart(2, "0")}`, REAL);
    }
    writeHtml(dir, files);
    const issues = scanDocumentHead(path.join(dir, "dist"), "Example Site");
    assert.equal(issues.length, 41);
    const reason = formatDocumentHeadFailure(issues);
    const listed = reason.split("\n").filter((line) => line.startsWith("dist/"));
    assert.equal(listed.length, 40);
    assert.match(reason, /\.\.\. and 1 more/);
    assert.match(listed[0] ?? "", /page-00\/index\.html/);
  } finally {
    removeTempDir(dir);
  }
});

test("only a layout, SEO, or QA prompt owns the head", () => {
  const pagePrompt = promptFor("REQ-PAGE-home", "src/pages/index.astro");
  const layout = promptFor("REQ-LAYOUT", "src/layouts/Base.astro");
  const seo = promptFor("REQ-SEO-sitemap", "src/data/seo.ts");
  const nested = promptFor("REQ-SEO-blog", "src/data/seo/blog.ts");
  const launch = promptFor("REQ-LAUNCH", "src/styles/tokens.css");
  const gate = promptFor("REQ-GATE-PLAYWRIGHT", "tests/qa.spec.ts");
  const anti = promptFor("REQ-GATE-ANTISLOP", "tests/antislop.spec.ts");
  const navOnly = promptFor("REQ-NAV", "src/components/Nav.astro");
  assert.equal(promptChecksDocumentHead(pagePrompt, ["src/pages/index.astro"]), false);
  assert.equal(promptChecksDocumentHead(navOnly, ["src/components/Nav.astro"]), false);
  assert.equal(promptChecksDocumentHead(anti, ["tests/antislop.spec.ts"]), false);
  assert.equal(promptChecksDocumentHead(layout, ["src/layouts/Base.astro"]), true);
  assert.equal(promptChecksDocumentHead(seo, ["src/data/seo.ts"]), true);
  assert.equal(promptChecksDocumentHead(nested, ["src/data/seo/blog.ts"]), true);
  assert.equal(promptChecksDocumentHead(launch, ["src/styles/tokens.css"]), true);
  assert.equal(promptChecksDocumentHead(gate, ["tests/qa.spec.ts"]), true);
  assert.equal(
    promptChecksDocumentHead(pagePrompt, ["src/pages/index.astro", "src/layouts/Base.astro"]),
    true,
  );
});

test("the close check fails a bare title for the layout and for QA, and leaves a page prompt alone", async () => {
  const layout = tempDir("hh-244c-layout-");
  const passed = tempDir("hh-244c-pass-");
  const otherName = tempDir("hh-244c-name-");
  const pageDir = tempDir("hh-244c-page-");
  const launch = tempDir("hh-244c-qa-");
  const good = page("Home | Example Site", REAL);
  try {
    const bare = await runBuild(layout, promptFor("REQ-LAYOUT", "src/layouts/Base.astro"), {
      "index.html": page("Home", REAL),
    });
    assert.equal(bare.status, "failed");
    assert.match(bare.reason, /Head check failed/);
    assert.match(bare.reason, /dist\/index\.html/);
    assert.match(bare.reason, /title "Home"/);
    assert.equal(bare.reason.includes("Visible copy failed"), false);

    const okHead = await runBuild(passed, promptFor("REQ-LAYOUT", "src/layouts/Base.astro"), {
      "index.html": good,
    });
    assert.equal(okHead.status, "passed");
    assert.equal(okHead.reason, "");

    const wrongName = await runBuild(
      otherName,
      promptFor("REQ-LAYOUT", "src/layouts/Base.astro"),
      { "index.html": good },
      "Ridge Trail",
    );
    assert.equal(wrongName.status, "failed");
    assert.match(wrongName.reason, /does not include the site name "Ridge Trail"/);

    const ignored = await runBuild(pageDir, promptFor("REQ-PAGE-home", "src/pages/index.astro"), {
      "index.html": page("Home", REAL),
    });
    assert.equal(ignored.status, "passed");
    assert.equal(ignored.reason, "");

    const qa = await runBuild(launch, promptFor("REQ-LAUNCH", "src/styles/tokens.css"), {
      "index.html": page("Home", REAL),
    });
    assert.equal(qa.status, "failed");
    assert.match(qa.reason, /Head check failed/);
    assert.match(qa.reason, /dist\/index\.html/);
    assert.match(qa.reason, /title "Home"/);
  } finally {
    await cleanup(layout);
    await cleanup(passed);
    await cleanup(otherName);
    await cleanup(pageDir);
    await cleanup(launch);
  }
});

test("the close check fails duplicate titles and narration descriptions on an SEO prompt", async () => {
  const dup = tempDir("hh-244c-dup-");
  const method = tempDir("hh-244c-method-");
  const farm = tempDir("hh-244c-farm-");
  const clean = tempDir("hh-244c-real-");
  const seo = promptFor("REQ-SEO-sitemap", "src/data/seo.ts");
  try {
    const duplicates = await runBuild(dup, promptFor("REQ-LAYOUT", "src/layouts/Base.astro"), {
      "index.html": page("Home | Example Site", REAL),
      "about/index.html": page("Home | Example Site", REAL),
    });
    assert.equal(duplicates.status, "failed");
    assert.match(duplicates.reason, /Head check failed/);
    assert.match(duplicates.reason, /dist\/index\.html: duplicate title "Home \| Example Site"/);
    assert.match(duplicates.reason, /dist\/about\/index\.html: duplicate title "Home \| Example Site"/);

    const missingFact = await runBuild(method, seo, {
      "eco/index.html": page("Eco | Example Site", NOT_WRITTEN),
    });
    assert.equal(missingFact.status, "failed");
    assert.match(missingFact.reason, /Head check failed/);
    assert.match(missingFact.reason, /dist\/eco\/index\.html/);
    assert.match(missingFact.reason, /The method is not written yet\./);
    assert.equal(missingFact.reason.includes("Visible copy failed"), false);

    const narration = await runBuild(farm, seo, {
      "farm/index.html": page("Farm | Example Site", WRITTEN_HERE),
    });
    assert.equal(narration.status, "failed");
    assert.match(narration.reason, /Head check failed/);
    assert.match(narration.reason, /dist\/farm\/index\.html/);
    assert.match(narration.reason, /What is known about this farm is written here\./);

    const real = await runBuild(clean, seo, {
      "index.html": page("Home | Example Site", REAL),
    });
    assert.equal(real.status, "passed");
    assert.equal(real.reason, "");
  } finally {
    await cleanup(dup);
    await cleanup(method);
    await cleanup(farm);
    await cleanup(clean);
  }
});
