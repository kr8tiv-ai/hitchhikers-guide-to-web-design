/**
 * BUG-045 item 8. One supplied hero and five sections over two pages
 * still produce a visual-first plan: art direction first, generated
 * stills for every other section, motion, no library bans, and a beauty gate.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { translateBrief } from "../src/spec/art-direction.ts";
import { generateBriefPlan, planFromBrief } from "../src/spec/brief-plan.ts";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import { planSectionStills } from "../src/spec/section-stills.ts";
import { SITE_RULES, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const BRIEF = `# Site Brief

## Vibe

The site should feel calm, warm, and honest, like a slow editorial journal.

## References

Kinfolk: quiet type and generous space. Aesop: restraint. Patagonia: big quiet photography.

## Motion

The motion score is 4. Gentle parallax on the hero. Farm cards fade in one after another at about 400 ms.

## Imagery

Use my own hero. Other sections are concept stills, never a real listing.

## Colours

Sand, moss, and a warm film grade.

## Logo

A thin crescent. Keep it.

## Pages

Pages: Home; Visit.

## Sections

Home: hero, story, farms
Visit: stay, field
`;

const PLAIN = `# Site Brief

## Pages

Pages: Home; Visit.
`;

const SECTIONS = ["hero", "story", "farms", "stay", "field"] as const;

function reqIndex(prompts: readonly SitePromptSkeleton[], id: string): number {
  return prompts.findIndex((prompt) => prompt.requirements.includes(id));
}

function byReq(prompts: readonly SitePromptSkeleton[], id: string): SitePromptSkeleton {
  const prompt = prompts.find((item) => item.requirements.includes(id));
  assert.ok(prompt, id);
  return prompt;
}

test("a supplied hero and five sections stay visual-first", () => {
  const { prompts, planned } = generateBriefPlan(BRIEF);
  assert.deepEqual(
    planned.pages.map((page) => page.sections),
    [
      ["hero", "story", "farms"],
      ["stay", "field"],
    ],
  );
  assert.ok(prompts.length <= 150, `count ${prompts.length}`);

  const direction = reqIndex(prompts, "REQ-ART-DIRECTION");
  assert.ok(direction >= 0, "art direction prompt");
  for (const sectionId of SECTIONS) {
    const art = reqIndex(prompts, `REQ-ART-${sectionId}`);
    const layout = reqIndex(prompts, `REQ-STRUCT-${sectionId}`);
    assert.ok(art >= 0, `art ${sectionId}`);
    assert.ok(layout >= 0, `layout ${sectionId}`);
    assert.ok(direction < layout, `direction before ${sectionId}`);
    assert.ok(art < layout, `section art before ${sectionId}`);
  }

  const art = translateBrief(
    BRIEF,
    [],
    planned.pages.flatMap((page) => page.sections),
  );
  const stills = planSectionStills({
    sections: planned.pages.flatMap((page) => page.sections),
    art,
    supplied: [{ sectionId: "hero", file: "public/hero.jpg" }],
  });
  assert.deepEqual(
    stills.kept.map((item) => item.file),
    ["public/hero.jpg"],
  );
  assert.equal(
    stills.slots.some((slot) => slot.id === "hero"),
    false,
  );
  assert.deepEqual(
    stills.slots.map((slot) => slot.id),
    ["story", "farms", "stay", "field"],
  );

  for (const sectionId of ["story", "farms", "stay", "field"]) {
    const image = byReq(prompts, `REQ-IMAGE-${sectionId}`);
    assert.match(image.title, new RegExp(`image set for ${sectionId}`, "i"));
    assert.match((image.acceptance ?? []).join("\n"), new RegExp(`src/assets/generated/${sectionId}\\.webp`));
  }

  const motion = prompts.filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-FX-")));
  const hero = motion.find((prompt) => /hero signature/i.test(`${prompt.title}\n${(prompt.acceptance ?? []).join("\n")}`));
  const scroll = motion.find((prompt) => prompt.library === "lenis" && /scroll owner/i.test(prompt.title));
  const reveal = motion.find((prompt) => /farm cards/i.test(`${prompt.title}\n${(prompt.acceptance ?? []).join("\n")}`));
  const transition = motion.find((prompt) => /section transition/i.test(`${prompt.title}\n${(prompt.acceptance ?? []).join("\n")}`));
  for (const prompt of [hero, scroll, reveal, transition]) {
    assert.ok(prompt, motion.map((item) => item.title).join(" | "));
    assert.ok(prompt.library !== undefined && prompt.library.length > 0);
  }
  assert.equal(
    prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))),
    false,
  );

  const scanned = [SITE_RULES];
  for (const prompt of prompts) {
    scanned.push(prompt.title, ...(prompt.acceptance ?? []));
  }
  for (const text of scanned) {
    assert.deepEqual(libraryBanHits(text), [], text.slice(0, 160));
  }

  for (const id of ["REQ-GATE-BRAND", "REQ-JURY"]) {
    const gate = byReq(prompts, id);
    const body = `${gate.title}\n${(gate.acceptance ?? []).join("\n")}`;
    assert.match(body, /beauty gate/i);
    assert.match(body, /remediation/i);
  }
});

test("a brief with no section list keeps the default section ids", () => {
  const planned = planFromBrief(PLAIN);
  assert.deepEqual(
    planned.pages.map((page) => ({ id: page.id, sections: page.sections })),
    [
      { id: "home", sections: ["hero"] },
      { id: "visit", sections: ["visit-main"] },
    ],
  );
});
