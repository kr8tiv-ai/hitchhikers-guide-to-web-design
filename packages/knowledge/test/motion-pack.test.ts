import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

export const REQUIRED_RECIPES: readonly string[] = [
  "GSAP and Lenis on gsap.ticker",
  "GSAP SplitText",
  "CSS scroll-driven animations",
  "Motion in a React island",
  "anime.js stagger",
  "OGL shader",
  "Three.js lazy hero",
  "Theatre core on the ticker",
  "Vanilla IntersectionObserver fade",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(here, "..", "packs", "motion", "SKILL.md");
const recipesPath = path.resolve(here, "..", "packs", "motion", "recipes.md");

function bodyAfterFrontmatter(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  return lines.slice(close + 1).join("\n");
}

function sectionsOf(markdown: string): { title: string; body: string; whole: string }[] {
  const found: { title: string; body: string; whole: string }[] = [];
  for (const chunk of markdown.split(/\n(?=## )/)) {
    const lines = chunk.split(/\r?\n/);
    const match = /^## (.+)$/.exec((lines[0] ?? "").trim());
    const title = match?.[1];
    if (title === undefined) continue;
    found.push({ title, body: lines.slice(1).join("\n"), whole: chunk });
  }
  return found;
}

function fenceLineCount(section: string): number {
  const match = /```[^\n]*\r?\n([\s\S]*?)```/.exec(section);
  assert.ok(match, "recipe is missing a snippet");
  return (match[1] ?? "").replace(/\n$/, "").split("\n").length;
}

function section(title: string, sections: ReturnType<typeof sectionsOf>): string {
  const found = sections.find((item) => item.title === title);
  assert.ok(found, title);
  return found.whole;
}

test("SKILL.md parses, omits effort, and makes no unsourced claims", () => {
  const markdown = readFileSync(skillPath, "utf8");
  assert.equal(
    markdown.split(/\r?\n/).some((line) => /^effort\s*:/.test(line.trim())),
    false,
  );
  const meta = parsePack(markdown);
  assert.ok(meta.description.length > 0);
  assert.ok(meta.whenToUse.length > 0);
  assert.deepEqual(meta.paths, [
    "packages/knowledge/packs/motion/SKILL.md",
    "packages/knowledge/packs/motion/recipes.md",
  ]);
  assert.deepEqual(lintPackClaims(bodyAfterFrontmatter(markdown)), []);
  assert.equal(markdown.toLowerCase().includes("gsap fallback"), false);
  assert.equal(markdown.includes("@theatre/studio"), false);
  assert.match(markdown, /imports one recipe/);
  assert.match(markdown, /0\.7\.2/);
  assert.match(markdown, /Source: hh-build-plan\/RESEARCH-ADDENDUM\.md/);
});

test("the nine recipes are present, short, and split by owner", () => {
  const recipes = readFileSync(recipesPath, "utf8");
  const sections = sectionsOf(recipes);
  assert.deepEqual(
    sections.map((item) => item.title),
    [...REQUIRED_RECIPES, "Reduced motion"],
  );
  assert.equal(REQUIRED_RECIPES.includes("Reduced motion"), false);
  assert.equal(recipes.toLowerCase().includes("gsap fallback"), false);
  assert.equal(recipes.includes("@theatre/studio"), false);
  assert.match(recipes, /@theatre\/core/);
  assert.match(recipes, /gsap\.ticker/);
  assert.match(recipes, /anime\.js/);
  assert.match(recipes, /Motion in a React island/);
  assert.match(recipes, /imports one recipe/);
  assert.deepEqual(lintPackClaims(recipes), []);

  for (const chunk of recipes.split(/\n(?=## )/)) {
    const hasTimeline = chunk.includes("animation-timeline");
    const hasLenis = chunk.toLowerCase().includes("lenis");
    assert.equal(hasTimeline && hasLenis, false, chunk.slice(0, 80));
  }

  for (const title of REQUIRED_RECIPES) {
    const lines = fenceLineCount(section(title, sections));
    assert.ok(lines < 40, `${title} snippet is ${lines} lines`);
  }
  assert.ok(fenceLineCount(section("Reduced motion", sections)) < 40);
});

test("each recipe stays on the library planMotion can assign", () => {
  const sections = sectionsOf(readFileSync(recipesPath, "utf8"));
  const lenis = section("GSAP and Lenis on gsap.ticker", sections);
  assert.match(lenis, /ScrollTrigger/);
  assert.match(lenis, /gsap\.ticker/);
  assert.match(lenis, /from "lenis"/);
  assert.equal(lenis.includes("animation-timeline"), false);

  const split = section("GSAP SplitText", sections);
  assert.match(split, /GSAP plugin/);
  assert.match(split, /not a separate page-wide library/);
  assert.match(split, /Owner: `gsap`/);
  assert.match(split, /SplitText/);

  const css = section("CSS scroll-driven animations", sections);
  assert.match(css, /@supports \(animation-timeline: view\(\)\)/);
  assert.match(css, /native scroller/);
  assert.equal(css.toLowerCase().includes("lenis"), false);

  const motion = section("Motion in a React island", sections);
  assert.match(motion, /whileInView/);
  assert.match(motion, /from "motion\/react"/);
  assert.match(motion, /Owner: `motion`/);

  const anime = section("anime.js stagger", sections);
  assert.match(anime, /from "animejs"/);
  assert.match(anime, /stagger/);
  assert.match(anime, /createScope/);
  assert.match(anime, /Owner: `anime`/);

  const ogl = section("OGL shader", sections);
  const three = section("Three.js lazy hero", sections);
  assert.notEqual(ogl, three);
  assert.match(ogl, /from "ogl"/);
  assert.match(ogl, /WebGL2/);
  assert.match(ogl, /webgl: 2/);
  assert.equal(ogl.includes('import("three")'), false);
  assert.match(three, /import\("three"\)/);
  assert.equal(three.includes('from "ogl"'), false);

  const theatre = section("Theatre core on the ticker", sections);
  assert.match(theatre, /from "@theatre\/core"/);
  assert.match(theatre, /createRafDriver/);
  assert.match(theatre, /gsap\.ticker/);
  assert.match(theatre, /0\.7\.2/);
  assert.match(theatre, /Source: hh-build-plan\/RESEARCH-ADDENDUM\.md/);
  assert.equal(theatre.includes("@theatre/studio"), false);

  const vanilla = section("Vanilla IntersectionObserver fade", sections);
  assert.match(vanilla, /IntersectionObserver/);
  assert.match(vanilla, /Owner: `vanilla`/);
  assert.equal(/gsap/i.test(vanilla), false);
  assert.equal(vanilla.includes("import "), false);
});
