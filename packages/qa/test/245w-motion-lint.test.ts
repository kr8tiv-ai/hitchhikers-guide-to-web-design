/**
 * 245w. Recipe re-export, runtime probe facts, and the choreography hook.
 * Fake page facts only. No browser, no network, no grok.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { motionLoopFindings, scoreChoreography, withinConstitution, type MotionConstitution } from "@hitchhiker/engine";
import { checkRecipes } from "../src/recipe-check.ts";
import { runMotionProbe } from "../src/motion-probe.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 8_000;

const EDITORIAL: MotionConstitution = {
  world: "editorial",
  appetite: "measured",
  easings: [
    { name: "brand-out", value: "power3.out" },
    { name: "brand-track", value: "none" },
  ],
  bands: [
    { name: "micro", min: 0.2, max: 0.35 },
    { name: "story", min: 0.8, max: 1.4 },
  ],
  scrollOwner: "lenis",
  ticker: [],
  recipes: ["batchReveal"],
};

test("245u recipes and motionSetup pass checkRecipes with zero findings", { timeout: TIMEOUT }, () => {
  const root = path.resolve(here, "..", "..", "design-system", "src");
  for (const folder of ["motion", "recipes"]) {
    for (const name of readdirSync(path.join(root, folder))) {
      if (!name.endsWith(".ts")) continue;
      const source = readFileSync(path.join(root, folder, name), "utf8");
      const findings = checkRecipes(source, name);
      assert.deepEqual(
        findings.map((finding) => `${finding.rule}: ${finding.detail}`),
        [],
        `${folder}/${name}`,
      );
    }
  }
});

test("a second lenis.raf loop fails and the ticker setup passes", { timeout: TIMEOUT }, () => {
  const broken = [
    'import Lenis from "lenis";',
    "const lenis = new Lenis({ autoRaf: false });",
    'lenis.on("scroll", ScrollTrigger.update);',
    "gsap.ticker.add((t) => { lenis.raf(t * 1000); });",
    "gsap.ticker.lagSmoothing(0);",
    "requestAnimationFrame((t) => { lenis.raf(t); });",
    "document.fonts.ready.then(() => ScrollTrigger.refresh());",
    'for (const image of document.images) image.addEventListener("load", () => ScrollTrigger.refresh());',
    "gsap.matchMedia();",
    "lenis.destroy();",
  ].join("\n");
  const bad = checkRecipes(broken, "second-raf.ts");
  const raf = bad.find((finding) => finding.rule === "lenis-raf-loop");
  assert.ok(raf);
  assert.equal(raf.file, "second-raf.ts");
  assert.ok(raf.line >= 1);
  assert.match(raf.fix, /ticker/);

  const good = broken.replace("requestAnimationFrame((t) => { lenis.raf(t); });\n", "");
  assert.equal(checkRecipes(good, "ticker.ts").some((finding) => finding.rule === "lenis-raf-loop"), false);
});

test("scrubbed width and filter fail, and transform with opacity passes", { timeout: TIMEOUT }, () => {
  const shell = (body: string): string =>
    [
      body,
      "gsap.matchMedia();",
      "document.fonts.ready.then(() => ScrollTrigger.refresh());",
      'for (const image of document.images) image.addEventListener("load", () => ScrollTrigger.refresh());',
      "tween.kill();",
    ].join("\n");
  const width = checkRecipes(shell('gsap.to(".box", { width: 200, scrollTrigger: { scrub: true } });'), "width.ts");
  const filter = checkRecipes(shell('gsap.to(".box", { filter: "blur(8px)", scrollTrigger: { scrub: true } });'), "filter.ts");
  const clean = checkRecipes(shell('gsap.to(".box", { x: 12, opacity: 1, scrollTrigger: { scrub: true } });'), "transform.ts");
  assert.ok(width.some((finding) => finding.rule === "scrub-layout" && finding.line >= 1));
  assert.ok(filter.some((finding) => finding.rule === "scrub-filter" && finding.line >= 1));
  assert.deepEqual(clean, []);
});

test("four card triggers fail and batchReveal passes", { timeout: TIMEOUT }, () => {
  const cards = [
    'gsap.to(".card-a", { y: 8, scrollTrigger: { trigger: ".card-a" } });',
    'gsap.to(".card-b", { y: 8, scrollTrigger: { trigger: ".card-b" } });',
    'gsap.to(".card-c", { y: 8, scrollTrigger: { trigger: ".card-c" } });',
    'gsap.to(".card-d", { y: 8, scrollTrigger: { trigger: ".card-d" } });',
    "gsap.matchMedia();",
    "document.fonts.ready.then(() => ScrollTrigger.refresh());",
    'for (const image of document.images) image.addEventListener("load", () => ScrollTrigger.refresh());',
    "tween.kill();",
  ].join("\n");
  const hit = checkRecipes(cards, "cards.ts").find((finding) => finding.rule === "batch-list");
  assert.ok(hit);
  assert.equal(hit.file, "cards.ts");
  assert.ok(hit.line >= 1);
  const batch = readFileSync(path.resolve(here, "..", "..", "design-system", "src", "motion", "batch-reveal.ts"), "utf8");
  assert.deepEqual(checkRecipes(batch, "batch-reveal.ts"), []);
});

test("the runtime probe flags two Lenis instances from fake page facts", { timeout: TIMEOUT }, async () => {
  await assert.rejects(runMotionProbe("http://127.0.0.1:4175/"), /4175/);
  const report = await runMotionProbe("http://127.0.0.1:4321/", {
    facts: {
      rafLoops: 2,
      scrollTriggers: 4,
      lenisInstances: 2,
      scrubbedProperties: ["width"],
      refreshedAfterFonts: false,
      refreshedAfterImages: false,
      triggersAfterUnmount: 3,
      timelineChildren: [
        { target: ".hero", ease: "power3.out", duration: 0.9, props: ["y"], scrub: true },
        { target: ".hero", ease: "elastic.out", duration: 0.3, props: ["y"], scrub: true },
      ],
    },
  });
  const text = report.problems.join(" ");
  assert.match(text, /2 Lenis/);
  assert.match(text, /requestAnimationFrame/);
  assert.match(text, /width/);
  assert.match(text, /fonts/);
  assert.match(text, /3 ScrollTrigger/);

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-245w-qa-"));
  try {
    writeFileSync(path.join(dir, "DESIGN.md"), "# Design\n", "utf8");
    const lines = motionLoopFindings(dir, report.facts);
    assert.match(lines.join(" "), /2 Lenis/);
    const score = scoreChoreography(dir, report.facts);
    assert.ok(score.score < 10);
    assert.match(score.findings.join(" "), /power3\.out/);
    assert.match(score.findings.join(" "), /elastic\.out/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withinConstitution refuses a new easing on an elevate change", { timeout: TIMEOUT }, () => {
  assert.equal(withinConstitution({ ease: "elastic.out" }, EDITORIAL), false);
  assert.equal(withinConstitution("Add easing elastic.out", EDITORIAL), false);
  assert.equal(withinConstitution({ ease: "power3.out" }, EDITORIAL), true);
});
