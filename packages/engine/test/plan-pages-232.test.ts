/**
 * BUG-041: the plan keeps every brief page and every brief feature.
 * The Run 4 brief was cut at 300 characters, so Eco-Building and the rest never reached the generator.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deterministicBrief } from "../src/guide/brief-loop.ts";
import { prepareSiteBuild } from "../src/guide/site-build.ts";
import type { Facts } from "../src/guide/schemas.ts";
import { generateBriefPlan, planFromBrief } from "../src/spec/brief-plan.ts";
import { PlanCoverageError } from "../src/spec/plan-coverage.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

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

const FULL_PAGES =
  "Pages: Home; Farms (grid plus map, filters, a detail page per farm with gallery, specs, map and prefilled inquiry); Live on the Land (caretaker program with sign-up form); How Buying Works (steps with independent lawyers, glossary: folio real, plano catastrado, escritura, ZMT); Eco-Building and Food; About; Contact. Footer: legal disclaimer, privacy, EN/ES switch, newsletter.";

const CUT_PAGES = FULL_PAGES.slice(0, FULL_PAGES.indexOf("Eco-Building")).trim();

const FEATURES = [
  "general contact form",
  "footer newsletter signup",
  "WhatsApp link",
  "blog and monthly guide",
  "footer legal disclaimer",
  "llms.txt",
  "FAQ structured data",
] as const;

const PROJECT4 = `# Site Brief

## Pages

${CUT_PAGES}

## Features

Listing filters (price range, acres, region, ocean view, water source, caretaker available, road access) with a results count, clear filters, empty state, and filters kept in the URL. Sort by price low/high, acres, newest. A map on Farms and on each farm page. Favorites shortlist in local storage.

## Action

Send an inquiry about one farm they can see; the form is prefilled with that farm ID.

## Cadence

Yes, a small blog, written for me, one guide a month: buying with a lawyer, living off the land, caretaker farms.

## Languages

English first, Spanish second. Whole site in both. The caretaker sign-up opens in Spanish by default.

## Limits

Yes, privacy and terms pages. Never give legal advice. Disclaimer: Paradise Found does not give legal advice.

## Decisions

DP-2.8: ${FULL_PAGES}
DP-3.1: Yes. A general contact form plus the farm inquiry form. Also a WhatsApp link on Contact and in the footer.
DP-3.4: Yes, a footer newsletter: email field and a success message.
DP-4.5: Yes: write so AI assistants can recommend us, with an llms.txt and FAQ structured data.
`;

function routePrompt(prompts: readonly SitePromptSkeleton[], title: string): SitePromptSkeleton {
  const found = prompts.find((prompt) => prompt.title === `Add the ${title} route.`);
  assert.ok(found, title);
  return found;
}

test("the Run 4 brief shape keeps all 11 pages and the dropped features", () => {
  const { prompts, planned } = generateBriefPlan(PROJECT4);
  assert.equal(planned.pages.length, PAGES.length);
  for (const title of PAGES) {
    const route = routePrompt(prompts, title);
    assert.ok(route.route?.startsWith("/"), title);
    assert.ok(route.requirements[0]?.startsWith("REQ-PAGE-"), title);
    const layout = prompts.find((prompt) => prompt.title.startsWith("Build the ") && prompt.title.includes(`layout on ${title}`));
    const copy = prompts.find((prompt) => prompt.title.startsWith("Place real copy in the ") && layout !== undefined);
    assert.ok(layout, `layout ${title}`);
    assert.ok(copy, `copy ${title}`);
    const section = layout.title.slice("Build the ".length, layout.title.indexOf(" layout"));
    const image = prompts.find((prompt) => prompt.title === `Place the approved image for ${section}, or leave a TODO if none was supplied.`);
    assert.ok(image, `image ${title}`);
  }
  const detail = routePrompt(prompts, "Farm detail");
  assert.equal(detail.route, "/farms/[id]");
  const blob = prompts.map((prompt) => `${prompt.title}\n${(prompt.acceptance ?? []).join(" ")}\n${prompt.requirements.join(" ")}`).join("\n");
  for (const feature of FEATURES) {
    assert.match(blob, new RegExp(feature.replace(/[.]/g, "\\."), "i"), feature);
    assert.match(blob, /REQ-FEAT-/);
  }
});

test("twelve pages are planned with no cap", () => {
  const names = ["Home", "Willow", "Cedar", "Maple", "Birch", "Alder", "Aspen", "Rowan", "Holly", "Hazel", "Laurel", "Ivy"];
  const brief = `# Site Brief\n\n## Pages\n\nPages: ${names.join("; ")}.\n`;
  const { prompts, planned } = generateBriefPlan(brief);
  assert.equal(planned.pages.length, names.length);
  assert.ok(prompts.length <= 150, `count ${prompts.length}`);
  for (const title of names) routePrompt(prompts, title);
});

test("a feature that appears only in the Pages field or an SEO decision is still a prompt", () => {
  const brief = `# Site Brief

## Pages

Pages: Home. Footer: legal disclaimer.

## SEO

Publish llms.txt for assistants.
`;
  const { prompts } = generateBriefPlan(brief);
  const blob = prompts.map((prompt) => `${prompt.title} ${prompt.requirements.join(" ")}`).join("\n");
  assert.match(blob, /footer legal disclaimer/i);
  assert.match(blob, /llms\.txt/i);
  assert.match(blob, /REQ-FEAT-/);
  const pages = planFromBrief(brief).pages.map((page) => page.title);
  assert.ok(pages.includes("Home"));
});

test("the recorded page list is not cut after How Buying Works", () => {
  const fixture = JSON.parse(
    readFileSync(path.join(here, "fixtures", "paradise-run3-answers.json"), "utf8"),
  ) as Array<{ id: string; status: string; value: string }>;
  const facts: Facts = {
    answers: fixture.map((row) =>
      row.status === "ANSWERED" ? { id: row.id, value: row.value } : { id: row.id, value: row.value, status: row.status },
    ),
    uploads: [],
    crawlNotes: [],
  };
  const brief = deterministicBrief(facts, "en");
  assert.match(brief.pages, /Eco-Building and Food/);
  assert.match(brief.pages, /About/);
  assert.match(brief.pages, /Contact/);
  assert.match(brief.features, /Caretaker sign-up form/);
});

test("a no-blog answer does not add a blog page or a blog feature", () => {
  const brief = `# Site Brief

## Pages

Pages: Home; About.

## Cadence

No blog. Updates stay on the home page.
`;
  const { planned } = generateBriefPlan(brief);
  assert.equal(planned.pages.some((page) => page.title === "Blog"), false);
  assert.equal(planned.features.some((feature) => /blog/i.test(feature)), false);
});

test("an existing plan that misses pages is left on disk", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-plan-232-"));
  const hitch = path.join(dir, ".hitchhiker");
  const prompts = path.join(hitch, "prompts");
  mkdirSync(prompts, { recursive: true });
  const home = "---\nid: 001\ntitle: Add the Home route.\n---\n\nRequirements: REQ-PAGE-home\n";
  writeFileSync(path.join(prompts, "001.md"), home, "utf8");
  writeFileSync(
    path.join(hitch, "interview.json"),
    JSON.stringify([{ id: "DP-2.8", status: "ANSWERED", value: FULL_PAGES }]),
    "utf8",
  );
  try {
    await assert.rejects(
      () => prepareSiteBuild(dir, `# Site Brief\n\n## Pages\n\n${CUT_PAGES}\n`),
      (error: unknown) => {
        assert.ok(error instanceof PlanCoverageError);
        assert.match(error.message, /Eco-Building and Food/);
        assert.ok(error.uncovered.some((item) => item.id === "REQ-PAGE-blog" || item.label.includes("Eco-Building")));
        return true;
      },
    );
    assert.equal(readFileSync(path.join(prompts, "001.md"), "utf8"), home);
    assert.equal(readFileSync(path.join(prompts, "001.md"), "utf8").includes("REQ-PAGE-about"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
