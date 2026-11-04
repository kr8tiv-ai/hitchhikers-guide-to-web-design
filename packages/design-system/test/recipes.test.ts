/**
 * 245d. Motion recipes are plain modules and pass the recipe checker.
 * The checker is loaded by file URL. This package does not depend on qa,
 * because the engine depends on this package and qa depends on the engine.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const recipesDir = path.resolve(here, "..", "src", "recipes");
const TIMEOUT = 5_000;
const REQUIRED = [
  "lenis-setup.ts",
  "reveal.ts",
  "split-line.ts",
  "parallax.ts",
  "horizontal.ts",
  "marquee.ts",
  "hover-lift.ts",
] as const;

interface RecipeFinding {
  file: string;
  rule: string;
}

test("every recipe passes checkRecipes and Lenis stays the only scroll owner", { timeout: TIMEOUT }, async () => {
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
    const findings = loaded.checkRecipes(source, name);
    assert.deepEqual(
      findings.map((finding) => finding.rule),
      [],
      name,
    );
  }
  const lenis = readFileSync(path.join(recipesDir, "lenis-setup.ts"), "utf8");
  assert.match(lenis, /smoothTouch:\s*false/);
  assert.match(lenis, /prefers-reduced-motion/);
  assert.match(lenis, /lenis\.on\(\s*["']scroll["']\s*,\s*ScrollTrigger\.update\s*\)/);
  assert.match(lenis, /gsap\.ticker\.add\(/);
  assert.match(lenis, /lenis\.raf\(/);
  assert.match(lenis, /gsap\.ticker\.lagSmoothing\(\s*0\s*\)/);
  assert.match(lenis, /opacity:\s*1/);
  const reduceAt = lenis.indexOf("prefers-reduced-motion");
  const constructAt = lenis.indexOf("new Lenis");
  assert.ok(reduceAt >= 0 && constructAt > reduceAt);

  const index = readFileSync(path.resolve(here, "..", "src", "index.ts"), "utf8");
  assert.equal(/from\s+["']gsap["']/.test(index), false);
  assert.equal(/from\s+["']lenis["']/.test(index), false);
  assert.equal(/recipes\//.test(index), false);
});
