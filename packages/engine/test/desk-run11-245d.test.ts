/**
 * 245d. DESIGN.md Tokens is rendered from the design-system package.
 * Style worlds keep a real display/body contrast. Recipes pass the checker.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  renderTokensSection,
  tokensFor,
  type BrandFill,
  type StyleWorld,
} from "@hitchhiker/design-system";
import { designTokenModel, renderDesignMd } from "../src/spec/design-outputs.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const recipesDir = path.resolve(here, "..", "..", "design-system", "src", "recipes");
const TIMEOUT = 5_000;
const WORLDS: readonly StyleWorld[] = ["editorial", "3d-world", "playful", "brutalist"];
const CLAMP = /^clamp\(([0-9.]+)rem,\s*(-?[0-9.]+)rem\s*\+\s*([0-9.]+)vw,\s*([0-9.]+)rem\)$/;
const REQUIRED = [
  "lenis-setup.ts",
  "reveal.ts",
  "split-line.ts",
  "parallax.ts",
  "horizontal.ts",
  "marquee.ts",
  "hover-lift.ts",
] as const;

const BRAND: BrandFill = {
  paper: "#f3e6d0",
  ink: "#14241c",
  accent: "#8a6a12",
  muted: "#5c6570",
  display: "Fraunces",
  body: "Satoshi",
  sources: {
    paper: "owner (DP-1.2)",
    ink: "owner (DP-1.2)",
    accent: "owner (DP-1.2)",
    muted: "derived for contrast",
  },
  swatches: [{ name: "Sunset gold", hex: "#8a6a12", source: "owner (DP-1.2)" }],
};

interface RecipeFinding {
  file: string;
  rule: string;
}

function clampPx(value: string, viewport: number): number {
  const match = CLAMP.exec(value);
  assert.ok(match, value);
  const min = Number(match[1]);
  const intercept = Number(match[2]);
  const slope = Number(match[3]);
  const max = Number(match[4]);
  const preferred = intercept * 16 + slope * (viewport / 100);
  return Math.min(max * 16, Math.max(min * 16, preferred));
}

function namedClamp(world: StyleWorld, name: string): string {
  const step = tokensFor(world, BRAND).type.steps.find((item) => item.name === name);
  assert.ok(step, `${world} ${name}`);
  return step.clamp;
}

function tokensSection(markdown: string): string {
  const match = /^## Tokens\s*$/m.exec(markdown);
  assert.ok(match);
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  const body = next === null ? rest : rest.slice(0, next.index);
  return body.trim();
}

test("tokensFor keeps display at least 2.5 times body at 1440", { timeout: TIMEOUT }, () => {
  const displays = new Set<string>();
  for (const world of WORLDS) {
    const tokens = tokensFor(world, BRAND);
    for (const step of tokens.type.steps) {
      assert.match(step.clamp, CLAMP, `${world} ${step.name}`);
    }
    const display = clampPx(namedClamp(world, "display"), 1440);
    const body = clampPx(namedClamp(world, "body"), 1440);
    assert.ok(display / body >= 2.5, `${world} ${display} / ${body}`);
    displays.add(namedClamp(world, "display"));
    assert.equal(tokens.color.paper, BRAND.paper);
    assert.equal(tokens.color.ink, BRAND.ink);
    assert.equal(tokens.color.accent, BRAND.accent);
    assert.equal(tokens.color.muted, BRAND.muted);
    assert.equal(tokens.color.surface, BRAND.paper);
    assert.equal(tokens.font.display, "Fraunces");
    assert.equal(tokens.font.body, "Satoshi");
    assert.match(tokens.colorLine, /sunset-gold #8a6a12 Source: owner \(DP-1\.2\)/);
  }
  assert.equal(displays.size, WORLDS.length);
});

test("DESIGN.md Tokens equals the package output for a fixture", { timeout: TIMEOUT }, () => {
  const brief = "Calm editorial tea.";
  const fonts = { display: "Fraunces", body: "Satoshi", source: "picked direction" };
  const model = designTokenModel(brief, [], fonts);
  assert.equal(model.world, "editorial");
  assert.equal(model.fill.display, "Fraunces");
  assert.equal(model.fill.body, "Satoshi");
  const brutal = designTokenModel("A brutal concrete studio.", [], fonts);
  assert.equal(brutal.world, "brutalist");
  const markdown = renderDesignMd(brief, [], fonts);
  const section = tokensSection(markdown);
  assert.equal(section, renderTokensSection(tokensFor(model.world, model.fill)));
  assert.match(section, /Color tokens: paper #f4f1ea Source: default tokens/);
  assert.match(section, /Display family: Fraunces\. Body family: Satoshi\./);
  assert.match(section, /Motion tokens live in src\/scripts\/motion\.ts\./);
  assert.equal(section.includes("!"), false);
});

test("recipe files pass checkRecipes with a reduced-motion Lenis setup", { timeout: TIMEOUT }, async () => {
  const names = readdirSync(recipesDir).filter((name) => name.endsWith(".ts")).sort();
  for (const required of REQUIRED) {
    assert.equal(names.includes(required), true, required);
  }
  const href = pathToFileURL(path.resolve(here, "..", "..", "qa", "src", "recipe-check.ts")).href;
  const loaded = (await import(href)) as {
    checkRecipes: (source: string, file?: string) => RecipeFinding[];
  };
  for (const name of names) {
    const source = readFileSync(path.join(recipesDir, name), "utf8");
    assert.deepEqual(
      loaded.checkRecipes(source, name).map((finding) => finding.rule),
      [],
      name,
    );
  }
  const lenis = readFileSync(path.join(recipesDir, "lenis-setup.ts"), "utf8");
  assert.match(lenis, /smoothTouch:\s*false/);
  assert.match(lenis, /prefers-reduced-motion/);
  const reduceAt = lenis.indexOf("prefers-reduced-motion");
  const constructAt = lenis.indexOf("new Lenis");
  assert.ok(reduceAt >= 0 && constructAt > reduceAt);
});
