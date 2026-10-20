/**
 * BUG-055 idea 5. `@section` and `@template` point at library fixtures.
 * Landmarks follow the fixture. A prompt with no reference still builds.
 * `@skill` still inlines. No ingest and no model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import {
  buildMarkupFromReferences,
  expandIngredientIncludes,
  landmarkSequence,
  sectionFixtureRoot,
} from "../src/spec/section-refs.ts";

const GRID = "asymmetric-editorial-grid";
const HERO = "three-hero";

function fixture(name: string): string {
  return readFileSync(path.join(sectionFixtureRoot(), `${name}.html`), "utf8");
}

function storyPrompt(acceptance: string[] = []): SitePromptSkeleton {
  return {
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
    acceptance,
  };
}

const library: DesignLibrary = {
  goldenDir: "golden",
  recipes: "",
  gallery: [],
  assetsMarkdown: "",
  facts: "The valley is the only place named.",
  styleText: "The motion score is 8. Editorial brand.",
};

test("a named library section copies that fixture's landmarks", () => {
  const built = buildMarkupFromReferences(`Compose @section:${GRID} for the home page.`);
  assert.deepEqual(built.unknown, []);
  assert.deepEqual(landmarkSequence(built.html), landmarkSequence(fixture(GRID)));
  assert.deepEqual(landmarkSequence(built.html), ["asymmetric-editorial-grid", "image", "column"]);
  const hero = buildMarkupFromReferences(
    "@template:packages/knowledge/design-library/sections/three-hero.html",
  );
  assert.deepEqual(hero.unknown, []);
  assert.deepEqual(landmarkSequence(hero.html), landmarkSequence(fixture(HERO)));
  assert.deepEqual(landmarkSequence(hero.html), ["three-hero", "canvas-hero", "poster", "caption"]);
  assert.notDeepEqual(landmarkSequence(built.html), landmarkSequence(hero.html));
});

test("a prompt with no reference still builds, and an unknown section is reported", () => {
  const plain = buildMarkupFromReferences("Build the home page.");
  assert.deepEqual(plain.unknown, []);
  assert.equal(plain.html, '<main data-landmark="page"></main>');
  const missing = buildMarkupFromReferences("@section:not-a-real-section");
  assert.deepEqual(missing.unknown, ["not-a-real-section"]);
  assert.equal(missing.html, '<main data-landmark="page"></main>');
  const escaped = buildMarkupFromReferences("@template:../secrets.txt");
  assert.deepEqual(escaped.unknown, ["../secrets.txt"]);
  assert.equal(escaped.html, '<main data-landmark="page"></main>');
});

test("a section reference keeps the skill inline and stays out of prompts that do not name one", () => {
  const expanded = expandIngredientIncludes(`@skill:scroll-choreography\n@section:${GRID}`);
  assert.ok(expanded.inlinedSkills.includes("scroll-choreography"));
  assert.match(expanded.text, /anticipatePin: 1/);
  assert.deepEqual(landmarkSequence(expanded.html), landmarkSequence(fixture(GRID)));
  const withRef = designLanguageFor(
    storyPrompt([`@section:${GRID}`]),
    "Text-led editorial column. Typography and a line reveal.",
    library,
  );
  assert.match(withRef, /@skill:scroll-choreography/);
  assert.match(withRef, /data-landmark="column"/);
  const without = designLanguageFor(storyPrompt(), "Text-led editorial column. Typography and a line reveal.", library);
  assert.match(without, /@skill:scroll-choreography/);
  assert.equal(without.includes("### Ingredients"), false);
  assert.equal(without.includes('data-landmark="column"'), false);
});
