import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import { SITE_RULES } from "../src/spec/site-rules.ts";
import type { SitePrompt } from "../src/spec/site-prompts.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, "..", "..", "knowledge", "golden");

const FIXTURE_BRIEF = `# Site Brief

## Vibe

Calm, warm, honest. Like Kinfolk. Slow editorial scroll.

## Pages

Pages: Home; Visit.

## Motion

Motion score 4. Gentle hero parallax. Farm cards fade in one after another.

## Imagery

One supplied hero still. Other sections need pictures.
`;

test("a generated plan and every golden template contain no library or imagery ban", () => {
  const { prompts } = generateBriefPlan(FIXTURE_BRIEF);
  assert.ok(prompts.length > 0);
  const sealed: SitePrompt[] = prompts.map((prompt) => ({
    ...prompt,
    rules: SITE_RULES,
    body: [`Prompt ${prompt.id}. ${prompt.title}`, ...(prompt.acceptance ?? [])].join("\n"),
  }));
  for (const prompt of sealed) {
    for (const part of [prompt.title, prompt.body, prompt.rules]) {
      const hits = libraryBanHits(part);
      assert.deepEqual(hits, [], `${prompt.id} ${prompt.title} :: ${hits.join(", ")} :: ${part.slice(0, 180)}`);
    }
  }
  const names = readdirSync(goldenDir).filter((name) => name.endsWith(".md")).sort();
  assert.ok(names.length >= 40);
  for (const name of names) {
    const text = readFileSync(path.join(goldenDir, name), "utf8");
    const hits = libraryBanHits(text);
    assert.deepEqual(hits, [], `${name} :: ${hits.join(", ")}`);
  }
});

test("SITE_RULES stays the one shared string and keeps honesty, motion, and performance", () => {
  const { prompts } = generateBriefPlan(FIXTURE_BRIEF);
  const sealed: SitePrompt[] = prompts.map((prompt) => ({
    ...prompt,
    rules: SITE_RULES,
    body: "<objective>Check rules.</objective>",
  }));
  for (const prompt of sealed) assert.equal(prompt.rules, SITE_RULES);
  assert.match(SITE_RULES, /The full motion toolkit is available/);
  assert.match(SITE_RULES, /Any appropriate library may be used/);
  assert.match(SITE_RULES, /GSAP, Three\.js or React Three Fiber, Motion, Lenis, Astro, vanilla JS, Howler and others/);
  assert.match(SITE_RULES, /One scroll owner, one ticker and one WebGL context per page/);
  assert.match(SITE_RULES, /Reduced motion stays visible and complete/);
  assert.match(SITE_RULES, /at least 90/);
  assert.match(SITE_RULES, /Anti-slop/);
  assert.match(SITE_RULES, /no invented facts, numbers, names, quotes, prices or testimonials/i);
  assert.match(SITE_RULES, /A missing fact is never invented and never shown as TODO/);
  assert.doesNotMatch(SITE_RULES, /still a TODO in copy/);
  assert.doesNotMatch(SITE_RULES, /stays a TODO in copy/);
  assert.match(SITE_RULES, /A real person, place, product or listing is never generated/);
  assert.equal(SITE_RULES.includes("!"), false);
  assert.equal(libraryBanHits(SITE_RULES).length, 0);
});
