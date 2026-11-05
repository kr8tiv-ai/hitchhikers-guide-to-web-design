/**
 * 245e. Section primitives render from slots, hero variants publish a structure,
 * and rankVariants orders those variants for a style world.
 * The harness reads the Astro source. The package does not depend on Astro.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  HERO_VARIANTS,
  SECTIONS,
  rankVariants,
  structureFor,
  variantRecipe,
} from "../src/index.ts";
import { renderPrimitive, componentDir } from "../src/components/render.ts";
import { SLOT_NAMES } from "../src/components/slots.ts";

const TIMEOUT = 5_000;
const RECIPES = new Set(["", "reveal", "marquee", "parallax", "split-line", "horizontal", "hover-lift"]);
const SIX = ["cinematic", "split-editorial", "statement", "marquee", "monument", "object"] as const;
const SLOTS = {
  eyebrow: "Eyebrow copy",
  title: "Title copy",
  body: "Body copy",
  media: "Media copy",
  actions: "Action copy",
};
const NAMED_COLOR = /\b(?:black|white|red|blue|green|gray|grey|indigo|purple|transparent|currentcolor)\b/i;
const COLOR_DECL = /(?:^|[{;])\s*(?:color|background(?:-color)?|fill|stroke|border(?:-color)?|outline(?:-color)?|caret-color|column-rule(?:-color)?)\s*:\s*([^;}{]+)/gi;
const FONT_DECL = /(?:^|[{;])\s*font-family\s*:\s*([^;}{]+)/gi;

function markupOf(html: string): string {
  const cut = html.indexOf("<style>");
  return cut < 0 ? html : html.slice(0, cut);
}

function visibleText(html: string): string {
  return markupOf(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slotOrder(html: string): string[] {
  return [...markupOf(html).matchAll(/data-slot="([^"]+)"/g)].map((match) => match[1] ?? "");
}

test("every section variant renders slot content with token styling", { timeout: TIMEOUT }, () => {
  const dir = componentDir();
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith(".astro") || name === "sections.css")
    .map((name) => readFileSync(path.join(dir, name), "utf8"));
  for (const source of sources) {
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, source.slice(0, 40));
    assert.equal(/\b(?:rgb|hsl)a?\s*\(/.test(source), false);
    for (const match of source.matchAll(COLOR_DECL)) {
      const value = match[1] ?? "";
      assert.equal(NAMED_COLOR.test(value), false, value);
    }
    for (const match of source.matchAll(FONT_DECL)) {
      const value = (match[1] ?? "").trim();
      assert.ok(value === "var(--font-display)" || value === "var(--font-body)", value);
    }
  }

  for (const section of SECTIONS) {
    for (const variant of section.variants) {
      const html = renderPrimitive(section.kind, variant.id, SLOTS);
      const markup = markupOf(html);
      assert.match(markup, new RegExp(`<${section.root}\\b`));
      assert.match(markup, new RegExp(`data-section="${section.kind}"`));
      assert.match(markup, new RegExp(`data-variant="${variant.id}"`));
      assert.match(markup, new RegExp(`data-recipe="${variant.recipe}"`));
      assert.equal(markup.includes("{"), false, `${section.kind} ${variant.id}`);
      assert.equal(markup.includes("<slot"), false);
      assert.deepEqual(slotOrder(html), [...SLOT_NAMES]);
      assert.equal(visibleText(html), "Media copy Eyebrow copy Title copy Body copy Action copy");
      assert.ok(RECIPES.has(variantRecipe(section.kind, variant.id)));
    }
  }
});

test("six hero variants export a structure", { timeout: TIMEOUT }, () => {
  assert.deepEqual([...HERO_VARIANTS], [...SIX]);
  for (const id of SIX) {
    const structure = structureFor(id);
    assert.equal(structure.variant, id);
    assert.ok(structure.requiredSlots.length >= 1);
    assert.deepEqual([...structure.elementOrder], [...SLOT_NAMES]);
    assert.ok(structure.layout.length >= 1);
    assert.ok((structure.layout[0]?.detail ?? "").length > 0);
  }
  const cinematic = structureFor("cinematic").layout[0];
  assert.equal(cinematic?.kind, "media-cover");
  assert.equal(cinematic?.at, 1440);
  assert.equal(cinematic?.minFraction, 0.9);
  assert.equal(cinematic?.slot, "media");
  const split = structureFor("split-editorial").layout[0];
  assert.equal(split?.kind, "unequal-columns");
  assert.equal(split?.minWidth, 1024);
  assert.equal(split?.columns, 2);
  const statement = structureFor("statement").layout[0];
  assert.equal(statement?.kind, "centred-reveal");
  assert.equal(statement?.progressive, true);
  const object = structureFor("object").layout[0];
  assert.equal(object?.kind, "object");
  assert.equal(object?.fallback, "image");
  assert.equal(object?.webgl, "optional");
  assert.equal(structureFor("layered-depth").layout[0]?.kind, "layered-depth");
});

test("rankVariants prefers statement for editorial and object for a 3d world", { timeout: TIMEOUT }, () => {
  const editorial = rankVariants("editorial", "Quiet margins", "hero", "An editorial magazine.");
  const firstEditorial = editorial[0]?.id;
  assert.ok(firstEditorial === "statement" || firstEditorial === "split-editorial");
  assert.equal(firstEditorial, "statement");

  const world = rankVariants("3d-world", "Shader world", "hero", "WebGL and a shader.");
  const firstWorld = world[0]?.id;
  assert.ok(firstWorld === "object" || firstWorld === "cinematic");
  assert.equal(firstWorld, "object");

  const film = rankVariants("3d-world", "A cinematic film", "Hero", "Fullscreen media.");
  assert.equal(film[0]?.id, "cinematic");
  const spread = rankVariants("editorial", "Asymmetric split", "hero", "Unequal columns.");
  assert.equal(spread[0]?.id, "split-editorial");

  for (const ranked of [editorial, world, film]) {
    const ids = ranked.map((row) => row.id);
    for (const id of SIX) {
      assert.equal(ids.filter((item) => item === id).length, 1, id);
    }
    for (const row of ranked) {
      assert.ok(row.reason.length > 0);
      assert.equal(row.reason.includes("\n"), false);
    }
  }

  const feature = rankVariants("editorial", "Quiet margins", "story", "An editorial magazine.");
  assert.equal(feature[0]?.id, "split");
  assert.doesNotThrow(() => rankVariants("playful", "", "not-a-kind", ""));
});
