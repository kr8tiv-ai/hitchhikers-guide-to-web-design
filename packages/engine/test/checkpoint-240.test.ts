import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { phonePerformanceBudget } from "../src/spec/phone-budget.ts";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const BAN = /must use gsap|only three\.js|do not use gsap|banned library|forbidden library/i;

function library(styleText: string): DesignLibrary {
  return {
    goldenDir: "golden",
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is the only place named.",
    styleText,
  };
}

function prompt(section: string): SitePromptSkeleton {
  return {
    id: "014",
    phase: "deep-thought",
    slice: "Infinite Monkeys",
    title: `Art-direct the ${section} section: home`,
    tier: "Heart of Gold",
    effort: "xhigh",
    model: "grok-4.7-build-fast",
    dependsOn: [],
    filesModified: ["src/pages/index.astro"],
    requirements: [`REQ-STRUCT-${section}`],
    protected: [],
    reviewAfter: false,
    maxTurns: 3,
    kind: "build",
    route: "/",
    acceptance: ["The section is readable."],
  };
}

test("language, skills, DESIGN.md, and motion.ts reach a prompt and ban no library", () => {
  const hero = designLanguageFor(
    prompt("hero"),
    "3D product hero with glass, a camera move, and bloom.",
    library("The motion score is 9. Bold technical product."),
  );
  assert.match(hero, /### High-end language/);
  assert.match(hero, /@skill:/);
  assert.match(hero, /CatmullRomCurve3/);
  assert.match(hero, /DESIGN\.md|motion\.ts|Starting vocabulary/);
  assert.deepEqual(libraryBanHits(hero), []);
  assert.equal(BAN.test(hero), false);

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
  const heroPrompt = prompts.find((item) => item.requirements.includes("REQ-ART-hero"));
  assert.ok(heroPrompt);
  const acceptance = (heroPrompt.acceptance ?? []).join("\n");
  assert.match(acceptance, /@skill:/);
  assert.match(acceptance, /DESIGN\.md/);
  assert.match(acceptance, /src\/scripts\/motion\.ts/);
  const joined = prompts.map((item) => (item.acceptance ?? []).join("\n")).join("\n");
  assert.deepEqual(libraryBanHits(joined), []);
  assert.equal(BAN.test(joined), false);
});
