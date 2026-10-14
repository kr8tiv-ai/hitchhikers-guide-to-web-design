/**
 * BUG-039: every approved page and brief feature gets its own build prompt.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { prepareSiteBuild } from "../src/guide/site-build.ts";
import { generateSkeleton, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const PAGES = [
  "Home",
  "Farms",
  "Farm detail",
  "Live on the Land",
  "How Buying Works",
  "Eco-Building and Food",
  "About",
  "Contact",
  "Blog",
  "Privacy",
  "Terms",
] as const;

const FEATURES = [
  "filters, sort, and URL state",
  "map",
  "favorites",
  "EN-ES toggle",
  "caretaker sign-up form",
  "farm inquiry prefilled with farm id",
  "newsletter",
  "WhatsApp link",
  "gallery",
  "llms.txt and FAQ JSON-LD",
] as const;

const BRIEF = `# Site Brief

## Pages

Pages: Home; Farms (grid plus map, filters, and a detail page per farm with gallery, specs, map, and prefilled inquiry); Live on the Land (caretaker program with sign-up form); How Buying Works (steps with independent lawyers; glossary: folio real, plano catastrado, escritura, ZMT); Eco-Building and Food; About; Contact; a small blog; privacy; terms. Footer: legal disclaimer, privacy, EN/ES switch, newsletter, and a WhatsApp link.

## Features

Listing filters for price range, acres, region, ocean view, water source, caretaker available, and road access, with a results count, clear filters, an empty state, and filters kept in the URL. Sort by price low or high, acres, or newest. A map on Farms and on each farm page. Favorites shortlist in local storage. EN/ES toggle that keeps the page. Caretaker sign-up form, Spanish by default. Photo gallery per farm. Footer newsletter. WhatsApp on Contact. llms.txt and FAQ structured data.

## Action

A general contact form plus the farm inquiry form. The form is prefilled with that farm ID.
`;

function byRequirement(prompts: readonly SitePromptSkeleton[], id: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.requirements.includes(id));
  assert.ok(found, id);
  return found;
}

test("Paradise Found brief shape yields one prompt per page and feature", () => {
  const { prompts, planned } = generateBriefPlan(BRIEF);
  assert.equal(planned.pages.length, PAGES.length);
  assert.ok(prompts.length <= 150, `count ${prompts.length}`);
  const routes = prompts.filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-PAGE-")));
  assert.equal(routes.length, PAGES.length);
  for (const title of PAGES) {
    const prompt = routes.find((entry) => entry.title === `Add the ${title} route.`);
    assert.ok(prompt, title);
    assert.ok(prompt.route?.startsWith("/"), title);
    assert.ok(prompt.filesModified.length > 0, title);
    assert.ok((prompt.contentSources ?? []).length > 0, title);
    assert.ok((prompt.acceptance ?? []).some((line) => /renders|passes/i.test(line)), title);
    assert.ok(prompt.requirements[0]?.startsWith("REQ-PAGE-"), title);
  }
  const detail = byRequirement(prompts, "REQ-PAGE-farm-detail");
  assert.equal(detail.route, "/farms/[id]");
  assert.ok(detail.filesModified.some((file) => file.includes("farms/[id]")));
  assert.ok((detail.contentSources ?? []).some((source) => /gallery/i.test(source)));

  for (const feature of FEATURES) {
    const prompt = prompts.find((entry) => entry.title === `Add the feature: ${feature}.`);
    assert.ok(prompt, feature);
    const requirement = prompt.requirements[0] ?? "";
    assert.match(requirement, /^REQ-FEAT-/);
    assert.match((prompt.acceptance ?? []).join(" "), new RegExp(requirement));
  }

  const titles = [...routes, ...prompts.filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-FEAT-")))].map(
    (prompt) => prompt.title,
  );
  assert.equal(new Set(titles).size, titles.length);

  const nav = byRequirement(prompts, "REQ-NAV");
  const scaffold = byRequirement(prompts, "REQ-SCAFFOLD");
  const layout = byRequirement(prompts, "REQ-LAYOUT");
  const home = byRequirement(prompts, "REQ-PAGE-home");
  const featureIds = prompts
    .filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-FEAT-")))
    .map((prompt) => Number(prompt.id));
  const pageIds = routes.map((prompt) => Number(prompt.id));
  assert.ok(Number(scaffold.id) < Number(layout.id));
  assert.ok(Number(layout.id) < Number(nav.id));
  assert.ok(Number(nav.id) < Number(home.id));
  assert.ok(Math.max(...pageIds) < Math.min(...featureIds));
  const qa = prompts.find((prompt) => prompt.phase === "mostly-harmless");
  const deploy = byRequirement(prompts, "REQ-DEPLOY");
  assert.ok(qa);
  assert.ok(Number(qa.id) > Math.max(...featureIds));
  assert.ok(Number(deploy.id) > Number(qa.id));
});

test("N pages and M features yield at least N plus M build prompts with unique titles", () => {
  const pageCount = 4;
  const featureCount = 3;
  const { prompts } = generateSkeleton({
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index}`,
      title: `Page ${index}`,
      sections: [`section-${index}`],
    })),
    effects: [],
    features: Array.from({ length: featureCount }, (_, index) => `feature ${index}`),
    integrations: [],
    seoItems: [],
    stack: "astro",
    protectedPaths: [],
  });
  const build = prompts.filter((prompt) =>
    prompt.requirements.some((id) => id.startsWith("REQ-PAGE-") || id.startsWith("REQ-FEAT-")),
  );
  assert.ok(build.length >= pageCount + featureCount);
  assert.equal(new Set(build.map((prompt) => prompt.title)).size, build.length);
});

test("prepareSiteBuild writes a prompt file for every Paradise Found page", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-plan-pages-"));
  try {
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length >= PAGES.length + FEATURES.length);
    const written = ids
      .map((id) => readFileSync(path.join(dir, ".hitchhiker", "prompts", `${id}.md`), "utf8"))
      .join("\n");
    for (const title of PAGES) {
      assert.match(written, new RegExp(`Add the ${title} route\\.`));
    }
    assert.match(written, /Route: \/farms\/\[id\]/);
    assert.match(written, /Content sources:/);
    assert.match(written, /Acceptance:/);
    for (const feature of FEATURES) {
      assert.match(written, new RegExp(`Add the feature: ${feature.replace(/[.]/g, "\\.")}\\.`));
      assert.match(written, /REQ-FEAT-/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffold prompt lists package.json, the lockfile, and an install command", () => {
  const stacks = ["astro", "next", "vite-react", "sveltekit"] as const;
  for (const stack of stacks) {
    const { prompts } = generateSkeleton({
      pages: [{ id: "home", title: "Home", sections: ["hero"] }],
      effects: [],
      features: [],
      integrations: [],
      seoItems: [],
      stack,
      protectedPaths: [],
    });
    const scaffold = prompts.find((prompt) => prompt.title === "Scaffold the strict TypeScript project.");
    assert.ok(scaffold, stack);
    assert.ok(scaffold.filesModified.includes("package.json"), stack);
    assert.ok(scaffold.filesModified.includes("pnpm-lock.yaml"), stack);
    const acceptance = (scaffold.acceptance ?? []).join(" ");
    assert.match(acceptance, /package\.json/);
    assert.match(acceptance, /private/);
    assert.match(acceptance, /type module/);
    assert.match(acceptance, /\bdev\b/);
    assert.match(acceptance, /\bbuild\b/);
    assert.match(acceptance, /\bpreview\b/);
    assert.match(acceptance, /\bcheck\b/);
    assert.match(acceptance, /\btest\b/);
    assert.match(acceptance, /pnpm install/);
    assert.match(acceptance, /pnpm-lock\.yaml/);
    assert.match(acceptance, /committed/);
  }
});
