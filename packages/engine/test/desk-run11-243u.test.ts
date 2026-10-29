/**
 * Desk Run 11: visitors never see TODO, the second language is written,
 * build narration and plan metadata fail the gate, and generated files are committed.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { commitGeneratedFiles, isIgnoredGeneratedPath } from "../src/spec/commit-generated.ts";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import { generateSkeleton, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import { MISSING_FACT_FALLBACK, SITE_RULES } from "../src/spec/site-rules.ts";
import {
  VISIBLE_COPY_PATTERNS,
  formatVisibleCopyFailure,
  scanVisibleCopy,
  shouldScanVisibleCopy,
} from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

const BANNED_RULE = /leave a TODO|leaving a TODO|stays a TODO|still a TODO/i;

const SPANISH_BRIEF = `# Site Brief

## Pages

Pages: Home; Farms; Live on the Land.

## Languages

English first, Spanish second. The whole site is in both. The caretaker sign-up opens in Spanish by default.

## Facts

The valley farms sit above the river road. Visitors ask about a named parcel before they visit. The inquiry form is the only way to ask for a price.
`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function source(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function ok(code = 0): BuildSpawnResult {
  return { code, stdout: "", stderr: "", errorCode: null };
}

function gitIn(cwd: string, args: string[]): string {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  return execFileSync("git", ["-c", "safe.directory=*", ...args], {
    cwd,
    encoding: "utf8",
    env,
    windowsHide: true,
  });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

async function runPrompt(dir: string, prompt: string, html: string): Promise<string> {
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  mkdirSync(path.join(dir, "dist"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), prompt, "utf8");
  writeFileSync(path.join(dir, "dist", "index.html"), html, "utf8");
  const spawn: BuildSpawn = () => ({ pid: 243243, done: Promise.resolve(ok()) });
  setProjectBuildRunner(dir, spawn);
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
  await ensureSiteBuild(dir);
  return readBuildRun(dir)?.reason ?? "";
}

function copyText(prompts: readonly SitePromptSkeleton[]): string {
  return prompts
    .filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-COPY-") || id === "REQ-ELEVATE-COPY"))
    .map((prompt) => `${prompt.title}\n${(prompt.acceptance ?? []).join(" ")}`)
    .join("\n");
}

test("missing-fact rules no longer tell the builder to leave a TODO", () => {
  for (const rel of [
    "../src/spec/site-rules.ts",
    "../src/spec/design-language.ts",
    "../src/guide/site-build.ts",
    "../src/spec/site-prompts.ts",
  ]) {
    assert.doesNotMatch(source(rel), BANNED_RULE, rel);
  }
  assert.match(source("../src/spec/design-language.ts"), /MISSING_FACT_FALLBACK/);
  assert.match(source("../src/guide/site-build.ts"), /MISSING_FACT_FALLBACK/);
  assert.match(SITE_RULES, /No invented facts, numbers, names, quotes, prices or testimonials/);
  assert.match(SITE_RULES, /A missing fact is never invented and never shown as TODO/);
  assert.match(SITE_RULES, /MISSING-FACTS\.md/);
  assert.match(SITE_RULES, /Ask us/);
  assert.match(SITE_RULES, /Price on request/);
  assert.match(SITE_RULES, /Visible copy speaks to the visitor only/);
  assert.match(SITE_RULES, /data-job/);
  assert.match(SITE_RULES, /A real person, place, product or listing is never generated/);
  assert.doesNotMatch(SITE_RULES, BANNED_RULE);

  const library: DesignLibrary = {
    goldenDir: path.join(tmpdir(), "hh-243u-missing-golden"),
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "",
    styleText: "",
  };
  const card = designLanguageFor(
    {
      id: "002",
      phase: "babel-fish",
      slice: "Sens-O-Matic",
      title: "Set color and type tokens from the approved brand.",
      tier: "Cup of Tea",
      effort: "medium",
      model: "grok-4.7",
      dependsOn: [],
      filesModified: ["src/styles/tokens.css"],
      requirements: ["REQ-TOKENS"],
      protected: [],
      reviewAfter: false,
      maxTurns: 100_000,
      kind: "build",
    },
    "",
    library,
  );
  assert.ok(card.includes(MISSING_FACT_FALLBACK));
  assert.match(card, /Facts allowed: Only facts written in the interview/);
  assert.doesNotMatch(card, /stays a TODO/);
});

test("a bilingual brief requires full Spanish copy and forbids TODO in the toggle", () => {
  const { prompts } = generateBriefPlan(SPANISH_BRIEF);
  const copies = prompts.filter((prompt) =>
    prompt.requirements.some((id) => id.startsWith("REQ-COPY-") || id === "REQ-ELEVATE-COPY"),
  );
  assert.ok(copies.length > 1);
  for (const prompt of copies) {
    const text = (prompt.acceptance ?? []).join(" ");
    assert.match(text, /Write the full Spanish copy/);
    assert.match(text, /Complete, natural Spanish/);
    assert.match(text, /never output TODO/);
    assert.match(text, /caretaker sign-up opens in Spanish/);
    assert.match(text, /MISSING-FACTS\.md/);
  }
  const elevate = prompts.find((prompt) => prompt.requirements.includes("REQ-ELEVATE-COPY"));
  assert.ok(elevate);
  assert.equal(elevate.title.includes("Leave a TODO"), false);
  assert.match(elevate.title, /Never show a missing fact as TODO/);
  const feature = prompts.find((prompt) => prompt.title === "Add the feature: EN-ES toggle.");
  assert.ok(feature);
  assert.match((feature.acceptance ?? []).join(" "), /never output TODO/);
  for (const id of ["REQ-GATE-ANTISLOP", "REQ-GATE-PLAYWRIGHT", "REQ-PRELAUNCH", "REQ-LAUNCH"]) {
    const gate = prompts.find((prompt) => prompt.requirements.includes(id));
    assert.ok(gate, id);
    assert.match((gate.acceptance ?? []).join(" "), /Visible copy speaks to the visitor only/);
  }

  const calm = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: ["contact form"],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "The ridge trail stays open in winter. Visitors book a dawn walk. The hut holds twelve people.",
  });
  assert.doesNotMatch(copyText(calm.prompts), /full Spanish copy/);
  assert.match(copyText(calm.prompts), /never shown as TODO/);

  const french = generateSkeleton({
    pages: [{ id: "home", title: "Home", sections: ["hero"] }],
    effects: [],
    features: [],
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
    brief: "French is the second language. The whole site is in both.",
  });
  const frenchCopy = copyText(french.prompts);
  assert.match(frenchCopy, /full second-language copy/);
  assert.match(frenchCopy, /never output TODO/);
  assert.doesNotMatch(frenchCopy, /full Spanish copy/);
});

test("the visible-copy gate flags placeholders and narration, and ignores comments and scripts", () => {
  const ids = VISIBLE_COPY_PATTERNS.map((pattern) => pattern.id);
  assert.ok(ids.includes("todo"));
  assert.ok(ids.includes("public-env"));
  assert.ok(ids.includes("not-written-yet"));
  assert.ok(ids.includes("data-job"));
  assert.ok(ids.includes("data-launch-check"));
  assert.equal(new Set(ids).size, ids.length);

  const dirty = tempDir("hh-243u-dirty-");
  const clean = tempDir("hh-243u-clean-");
  const hidden = tempDir("hh-243u-hidden-");
  try {
    mkdirSync(path.join(dirty, "dist"), { recursive: true });
    writeFileSync(
      path.join(dirty, "dist", "index.html"),
      [
        "<!doctype html><html><body>",
        "<p>TODO on the home page</p>",
        '<a data-copy-es="TODO">Inicio</a>',
        "<p>Set PUBLIC_FOO before launch.</p>",
        "<p>Spanish lines that are not written yet show as TODO</p>",
        '<div data-job="Show on every page"></div>',
        '<section data-launch-check="nav"></section>',
        "</body></html>",
      ].join(""),
      "utf8",
    );
    writeFileSync(path.join(dirty, "dist", "notes.ts"), "export const pending = 'TODO';\n", "utf8");
    const hits = scanVisibleCopy(path.join(dirty, "dist"));
    const snippets = hits.map((hit) => hit.snippet).join("\n");
    assert.match(snippets, /data-copy-es="TODO"/);
    assert.match(snippets, /TODO on the home page/);
    assert.match(snippets, /PUBLIC_FOO/);
    assert.match(snippets, /Spanish lines that are not written yet show as TODO/);
    assert.match(snippets, /data-job=/);
    assert.match(snippets, /data-launch-check=/);
    assert.equal(hits.some((hit) => hit.file.endsWith(".ts")), false);
    const reason = formatVisibleCopyFailure(hits, "dist");
    assert.match(reason, /Visible copy failed/);
    assert.match(reason, /dist\/index\.html/);

    mkdirSync(path.join(clean, "site"), { recursive: true });
    writeFileSync(
      path.join(clean, "site", "index.html"),
      '<!doctype html><html><head><title>Valley</title></head><body><p>Ask us about the ridge.</p><a data-copy-es="Preguntanos">Ask us</a></body></html>',
      "utf8",
    );
    assert.deepEqual(scanVisibleCopy(path.join(clean, "site")), []);
    assert.equal(formatVisibleCopyFailure([]), "");

    mkdirSync(path.join(hidden, "dist"), { recursive: true });
    writeFileSync(
      path.join(hidden, "dist", "index.html"),
      '<!doctype html><html><body><!-- TODO and PUBLIC_FOO --><script>const note = "TODO"; const env = "PUBLIC_FOO"; const job = "data-job=";</script><p>The valley is open.</p></body></html>',
      "utf8",
    );
    writeFileSync(path.join(hidden, "dist", "app.ts"), "export const todo = 'TODO';\n", "utf8");
    assert.deepEqual(scanVisibleCopy(path.join(hidden, "dist")), []);
    assert.deepEqual(scanVisibleCopy(path.join(hidden, "missing")), []);
  } finally {
    removeTempDir(dirty);
    removeTempDir(clean);
    removeTempDir(hidden);
  }

  const tokens = ["## Task", "", "Files: src/styles/tokens.css", "Requirements: REQ-TOKENS", "", "## Design language", "", "src/pages/index.astro data-job="].join("\n");
  assert.equal(shouldScanVisibleCopy(tokens, ["src/styles/tokens.css"]), false);
  assert.equal(shouldScanVisibleCopy(tokens, ["src/pages/index.astro"]), true);
  assert.equal(shouldScanVisibleCopy("## Task\nRequirements: REQ-ELEVATE-COPY\n", []), true);
  assert.equal(shouldScanVisibleCopy("## Task\nRequirements: REQ-COPY-hero\n", []), true);
  assert.equal(shouldScanVisibleCopy("## Task\nRequirements: REQ-LAUNCH\n", []), true);
});

test("a page prompt fails when dist shows TODO, and a comment-only page passes", async () => {
  const failed = tempDir("hh-243u-fail-");
  const passed = tempDir("hh-243u-pass-");
  const tokens = tempDir("hh-243u-tokens-");
  const pagePrompt = ["## Task", "", "Prompt 001. Place real copy.", "Files: src/pages/index.astro", "Requirements: REQ-COPY-hero", "", "## Design language", "", "Example only.", ""].join("\n");
  try {
    const reason = await runPrompt(failed, pagePrompt, "<p>TODO</p>\n");
    assert.match(reason, /dist\/index\.html/);
    assert.match(reason, /TODO/);
    assert.equal(readBuildRun(failed)?.status, "failed");

    const quiet = await runPrompt(
      passed,
      pagePrompt,
      "<!-- TODO --><script>const pending = 'TODO';</script><p>The valley is open.</p>\n",
    );
    assert.equal(quiet, "");
    assert.equal(readBuildRun(passed)?.status, "passed");

    const skipped = await runPrompt(
      tokens,
      ["## Task", "", "Files: src/styles/tokens.css", "Requirements: REQ-TOKENS", "", "## Design language", "", "src/pages/index.astro", ""].join("\n"),
      "<p>TODO</p>\n",
    );
    assert.equal(skipped, "");
    assert.equal(readBuildRun(tokens)?.status, "passed");
  } finally {
    await cleanup(failed);
    await cleanup(passed);
    await cleanup(tokens);
  }
});

test("commit generated files saves brand.ts and leaves tmp and dist untracked", () => {
  assert.equal(isIgnoredGeneratedPath("src/data/brand.ts"), false);
  assert.equal(isIgnoredGeneratedPath(".hitchhiker/tmp/note.txt"), true);
  assert.equal(isIgnoredGeneratedPath(".hitchhiker/logs/build-007.log"), true);
  assert.equal(isIgnoredGeneratedPath("dist/index.html"), true);
  assert.equal(isIgnoredGeneratedPath("node_modules/pkg/index.js"), true);
  assert.equal(isIgnoredGeneratedPath(".env"), true);
  assert.equal(isIgnoredGeneratedPath(".env.local"), true);

  const dir = tempDir("hh-243u-git-");
  try {
    gitIn(dir, ["init", "-b", "main"]);
    mkdirSync(path.join(dir, "src", "data"), { recursive: true });
    writeFileSync(path.join(dir, "src", "data", "brand.ts"), "export const brand = 'ridge';\n", "utf8");
    mkdirSync(path.join(dir, ".hitchhiker", "tmp"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "tmp", "note.txt"), "scratch\n", "utf8");
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<p>The valley is open.</p>\n", "utf8");
    const result = commitGeneratedFiles(dir, "007");
    assert.deepEqual(
      result.committed.map((file) => file.replaceAll("\\", "/")),
      ["src/data/brand.ts"],
    );
    assert.equal(result.message, "chore(site): commit generated files (007)");
    const tracked = gitIn(dir, ["ls-files"]).replaceAll("\\", "/");
    assert.match(tracked, /src\/data\/brand\.ts/);
    assert.equal(tracked.includes("dist/"), false);
    assert.equal(tracked.includes(".hitchhiker/tmp"), false);
    assert.equal(gitIn(dir, ["log", "-1", "--format=%s"]).trim(), "chore(site): commit generated files (007)");
    const recorded = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-007.log"), "utf8");
    assert.match(recorded, /Committed generated files for 007: src\/data\/brand\.ts/);
    const left = gitIn(dir, ["status", "--porcelain"]);
    assert.match(left, /dist/);
    assert.match(left, /\.hitchhiker/);
    assert.equal(left.includes("brand.ts"), false);
    assert.equal(gitIn(dir, ["ls-files", "dist", ".hitchhiker/tmp"]).trim(), "");
  } finally {
    removeTempDir(dir);
  }
});
