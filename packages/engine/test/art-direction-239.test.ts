/**
 * BUG-045 item 3. Art direction is a Babel Fish / Deep Thought phase
 * before any layout prompt. translateBrief maps owner words to a
 * starting vocabulary. The same brief always yields the same draft.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { translateBrief } from "../src/spec/art-direction.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const PARADISE = `# Site Brief

## Vibe

The site should feel calm, warm, and honest. It should never feel salesy, cluttered, or loud.

## References

Kinfolk: love. Slow editorial scroll and soft color. Aesop: restraint and empty space. Patagonia: big quiet photography.

## Motion

The motion score is 4, with a medium appetite. Use gentle parallax on the hero only. Farm cards fade in one after another at about 400 ms. Everything stays still when reduced motion is on.

## Imagery

Photography, as a mix. Use my own hero. Free open-license stock fills the non-farm pages and is captioned as not a listed farm.

## Colours

Jungle green, sunset gold, and ocean blue, plus soft sand and a near-black green. Sunset gold is the accent.

## Logo

A thin crescent over a horizon line. Keep it.

## Pages

Pages: Home; Farms (grid plus map); About.
`;

const BOLD = `# Site Brief

## Vibe

Bold, tech, dark.

## Pages

Pages: Home.
`;

function layoutIndex(prompts: readonly SitePromptSkeleton[]): number {
  return prompts.findIndex((prompt) => /^Build the .+ layout on /.test(prompt.title));
}

test("Paradise Found maps to an editorial world with Lenis, hero parallax, and staggered card reveals", () => {
  const art = translateBrief(PARADISE, []);
  const again = translateBrief(PARADISE, []);
  assert.deepEqual(again, art);
  assert.equal(art.styleWorld, "editorial");
  const text = JSON.stringify(art);
  assert.match(text, /Lenis/);
  assert.match(text, /parallax on the hero/);
  assert.match(text, /staggered card reveals/i);
  assert.match(text, /starting point/i);
  assert.match(text, /creative idea/i);
  assert.equal(art.motion.score, 4);
  assert.ok(art.motion.score >= 4 && art.motion.score <= 6);
  assert.equal(art.motion.intensity, "measured");
});

test("a bold tech dark brief is a different world and the same input stays stable", () => {
  const bold = translateBrief(BOLD, []);
  const calm = translateBrief(PARADISE, []);
  assert.equal(bold.styleWorld, "3d-world");
  assert.notEqual(bold.styleWorld, calm.styleWorld);
  assert.equal(bold.motion.score >= 7, true);
  assert.deepEqual(translateBrief(BOLD, []), bold);
  const text = JSON.stringify(bold);
  assert.doesNotMatch(text, /large serif/);
  assert.match(text, /Three\.js|shader/);
});

test("art direction prompts precede every layout prompt", () => {
  const { prompts } = generateBriefPlan(PARADISE);
  const layoutAt = layoutIndex(prompts);
  assert.ok(layoutAt > 0);
  const global = prompts.find((prompt) => prompt.requirements.includes("REQ-ART-DIRECTION"));
  assert.ok(global);
  assert.equal(global.phase, "babel-fish");
  assert.equal(global.slice, "The Brand Brain");
  assert.equal(
    global.title,
    "Write the art direction: one visual concept, mood, light and color grade, type voice, motion character and a signature hero moment, from the brand inputs.",
  );
  assert.ok(global.filesModified.includes("src/data/art-direction.ts"));
  assert.ok(global.filesModified.includes(".hitchhiker/ART-DIRECTION.md"));
  assert.ok(prompts.indexOf(global) < layoutAt);
  const acceptance = (global.acceptance ?? []).join(" ");
  assert.match(acceptance, /editorial/);
  assert.match(acceptance, /Lenis/);
  assert.match(acceptance, /parallax on the hero/);
  assert.match(acceptance, /staggered card reveals/i);
  assert.match(acceptance, /Choose a better technique if it serves the brand/);
  assert.match(acceptance, /island boundaries/);
  assert.match(acceptance, /creative idea of your own/);
  assert.match(acceptance, /never means the absence of motion/);

  const sections = prompts
    .flatMap((prompt) => prompt.requirements)
    .filter((id) => id.startsWith("REQ-STRUCT-"))
    .map((id) => id.slice("REQ-STRUCT-".length));
  assert.ok(sections.length >= 3);
  for (const section of sections) {
    const art = prompts.find((prompt) => prompt.requirements.includes(`REQ-ART-${section}`));
    assert.ok(art, section);
    assert.equal(art.phase, "deep-thought");
    assert.equal(
      art.title,
      `Art-direct the ${section} section: layout idea, media, motion, transition in and out.`,
    );
    assert.ok(prompts.indexOf(art) < layoutAt);
    const lines = (art.acceptance ?? []).join(" ");
    assert.match(lines, /Layout:/);
    assert.match(lines, /Media:/);
    assert.match(lines, /Motion:/);
    assert.match(lines, /Transition in:/);
    assert.match(lines, /Transition out:/);
  }
});
