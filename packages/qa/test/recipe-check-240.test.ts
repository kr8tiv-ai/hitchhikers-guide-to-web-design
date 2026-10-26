import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkRecipeDir, checkRecipes, type RecipeRule } from "../src/recipe-check.ts";
import { removeTempDir } from "./remove-temp.ts";

const PAGES: Record<RecipeRule, { pass: string; fail: string }> = {
  "two-scroll-owners": {
    pass: [
      'import Lenis from "lenis";',
      "const lenis = new Lenis({ autoRaf: false });",
      'lenis.on("scroll", ScrollTrigger.update);',
    ].join("\n"),
    fail: [
      'import Lenis from "lenis";',
      "const lenis = new Lenis({ autoRaf: false });",
      ".scene { animation-timeline: view(); }",
    ].join("\n"),
  },
  "lenis-ticker": {
    pass: [
      'import Lenis from "lenis";',
      "const lenis = new Lenis({ autoRaf: false });",
      'lenis.on("scroll", ScrollTrigger.update);',
      "gsap.ticker.add((time) => {",
      "  lenis.raf(time * 1000);",
      "});",
      "gsap.ticker.lagSmoothing(0);",
    ].join("\n"),
    fail: ['import Lenis from "lenis";', "const lenis = new Lenis({ autoRaf: true });", "lenis.raf(16);"].join("\n"),
  },
  "layout-properties": {
    pass: 'gsap.to(".bg", { scale: 1.15, opacity: 1, yPercent: 0 });',
    fail: 'gsap.to(".card", {\n  width: "100%",\n  height: 240,\n  top: 0,\n});',
  },
  "refresh-after-media": {
    pass: [
      'ScrollTrigger.create({ trigger: ".scene", start: "top top" });',
      "document.fonts.ready.then(() => ScrollTrigger.refresh());",
      "for (const image of Array.from(document.images)) {",
      '  image.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });',
      "}",
    ].join("\n"),
    fail: 'ScrollTrigger.create({ trigger: ".scene", start: "top top", pin: true });',
  },
  "horizontal-ease": {
    pass: [
      "gsap.to(panels, {",
      "  xPercent: -100 * (panels.length - 1),",
      '  ease: "none",',
      "});",
    ].join("\n"),
    fail: [
      "gsap.to(panels, {",
      "  xPercent: -100 * (panels.length - 1),",
      '  ease: "power2.out",',
      "});",
    ].join("\n"),
  },
  "scrollto-with-lenis": {
    pass: [
      "const lenis = new Lenis({ autoRaf: false });",
      'lenis.scrollTo("#about", { offset: -80, duration: 1.2 });',
    ].join("\n"),
    fail: [
      'import { ScrollToPlugin } from "gsap/ScrollToPlugin";',
      "const lenis = new Lenis({ autoRaf: false });",
      "gsap.registerPlugin(ScrollToPlugin);",
      'gsap.to(window, { scrollTo: { y: "#about", offsetY: 80 }, autoKill: true });',
    ].join("\n"),
  },
  "reduced-motion": {
    pass: [
      'gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {',
      '  gsap.set(".headline", { yPercent: 0, opacity: 1 });',
      "});",
      'gsap.from(".headline", { yPercent: 100, duration: 1.2 });',
    ].join("\n"),
    fail: 'gsap.from(".headline", { yPercent: 100, duration: 1.2, ease: "expo.out" });',
  },
  "webgl-context": {
    pass: "const renderer = new THREE.WebGLRenderer({ antialias: true });",
    fail: ['const a = new THREE.WebGLRenderer();', 'const b = canvas.getContext("webgl2");'].join("\n"),
  },
};

const RULES = Object.keys(PAGES) as RecipeRule[];

for (const rule of RULES) {
  test(`${rule}: a clean page passes and a broken page is flagged`, () => {
    const page = PAGES[rule];
    const clean = checkRecipes(page.pass, `pass-${rule}.ts`);
    assert.equal(
      clean.some((hit) => hit.rule === rule),
      false,
      clean.map((hit) => hit.detail).join("; "),
    );
    const broken = checkRecipes(page.fail, `fail-${rule}.ts`);
    const hit = broken.find((item) => item.rule === rule);
    assert.ok(hit, broken.map((item) => item.rule).join(", "));
    assert.equal(hit.file, `fail-${rule}.ts`);
    assert.ok(hit.line >= 1);
    assert.ok(hit.detail.trim().length > 0);
  });
}

test("a site directory reports the broken page and leaves the clean page alone", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-recipe-240-"));
  try {
    const src = path.join(dir, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(path.join(src, "clean.ts"), PAGES["horizontal-ease"].pass, "utf8");
    writeFileSync(path.join(src, "broken.ts"), PAGES["horizontal-ease"].fail, "utf8");
    writeFileSync(path.join(dir, "README.md"), "xPercent: -100\nease: power2", "utf8");
    const hits = checkRecipeDir(dir);
    assert.equal(
      hits.some((hit) => hit.file.endsWith("clean.ts") && hit.rule === "horizontal-ease"),
      false,
    );
    assert.equal(
      hits.some((hit) => hit.file.endsWith("broken.ts") && hit.rule === "horizontal-ease"),
      true,
    );
    assert.equal(
      hits.some((hit) => hit.file.endsWith("README.md")),
      false,
    );
  } finally {
    removeTempDir(dir);
  }
});
