import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { phonePerformanceBudget } from "../src/spec/phone-budget.ts";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import {
  expandSkillIncludes,
  loadSkillPacks,
  planSkillLines,
  selectSkillPacks,
} from "../src/spec/skills.ts";

function names(query: { siteType: string; motionAppetite: number; sectionKind: string; artDirection: string }): string[] {
  return selectSkillPacks(query, loadSkillPacks()).map((pack) => pack.name);
}

test("a high-appetite product hero selects showcase packs and leaves scroll out", () => {
  const picked = names({
    siteType: "product",
    motionAppetite: 9,
    sectionKind: "hero",
    artDirection: "3D product hero with glass, a camera move, and bloom.",
  });
  assert.ok(picked.includes("object-showcase"));
  assert.ok(picked.includes("shader-recipes"));
  assert.ok(picked.includes("post-processing"));
  assert.ok(picked.includes("locked-versions"));
  assert.equal(picked.includes("scroll-choreography"), false);
});

test("a text-led story selects scroll choreography and leaves spatial packs out", () => {
  const picked = names({
    siteType: "editorial",
    motionAppetite: 8,
    sectionKind: "story",
    artDirection: "Text-led editorial column. Typography and a line reveal.",
  });
  assert.deepEqual(picked, ["scroll-choreography"]);
});

test("a low appetite selects nothing", () => {
  const picked = names({
    siteType: "product",
    motionAppetite: 2,
    sectionKind: "hero",
    artDirection: "3D product hero with glass, a camera move, and bloom.",
  });
  assert.deepEqual(picked, []);
});

test("a pack over the budget becomes a path, and an unknown name is reported", () => {
  const packs = loadSkillPacks();
  const tight = expandSkillIncludes("@skill:scroll-choreography", packs, 30);
  assert.deepEqual(tight.inlined, []);
  assert.deepEqual(tight.referenced, ["scroll-choreography"]);
  assert.match(tight.text, /@skill:scroll-choreography/);
  assert.match(tight.text, /Read on demand: packages\/knowledge\/skills\/scroll-choreography\.md/);
  assert.equal(tight.text.includes("anticipatePin"), false);
  const open = expandSkillIncludes("@skill:scroll-choreography\n@skill:missing-pack", packs, 100_000);
  assert.deepEqual(open.unknown, ["missing-pack"]);
  assert.match(open.text, /Unknown skill: missing-pack/);
  assert.match(open.text, /anticipatePin: 1/);
  assert.ok(open.inlined.includes("scroll-choreography"));
});

test("the planner writes skill lines onto a high-appetite hero", () => {
  const brief = `# Site Brief

## Vibe

Bold technical product. A shader hero.

## Motion

The motion score is 9.

## Pages

Pages: Home.

${phonePerformanceBudget()}
`;
  const { prompts } = generateBriefPlan(brief);
  const hero = prompts.find((prompt) => prompt.requirements.includes("REQ-ART-hero"));
  assert.ok(hero);
  const acceptance = (hero.acceptance ?? []).join("\n");
  assert.match(acceptance, /@skill:object-showcase/);
  assert.equal(acceptance.includes("@skill:scroll-choreography"), false);
  const lines = planSkillLines({
    siteType: "editorial",
    motionAppetite: 8,
    sectionKind: "story",
    artDirection: "Text-led column with a line reveal.",
  });
  assert.equal(lines, "@skill:scroll-choreography");
});

test("a section prompt expands the triggered skill and keeps the budget", () => {
  const library: DesignLibrary = {
    goldenDir: "golden",
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is the only place named.",
    styleText: "The motion score is 8. Editorial brand.",
  };
  const prompt: SitePromptSkeleton = {
    id: "014",
    phase: "deep-thought",
    slice: "Infinite Monkeys",
    title: "Art-direct the story section: home",
    tier: "Heart of Gold",
    effort: "high",
    model: "grok-4.7-build-fast",
    dependsOn: [],
    filesModified: ["src/pages/index.astro"],
    requirements: ["REQ-STRUCT-story"],
    protected: [],
    reviewAfter: false,
    maxTurns: 3,
    kind: "build",
  };
  const text = designLanguageFor(prompt, "Text-led editorial column. Typography and a line reveal.", library);
  assert.match(text, /@skill:scroll-choreography/);
  assert.equal(text.includes("@skill:object-showcase"), false);
  assert.equal(text.includes("@skill:shader-recipes"), false);
  assert.equal(text.includes("@skill:missing"), false);
  assert.equal(/only use|do not use\s+\S+/i.test(text), false);
});
