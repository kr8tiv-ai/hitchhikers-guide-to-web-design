/**
 * 245w. Motion constitution, static lint, choreography score, and the
 * elevate boundary. Runtime probe facts are covered in the qa suite.
 * No network, no browser, no grok.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintDesignMd } from "../src/spec/design-md-lint.ts";
import { renderDesignMd, writeDesignMd } from "../src/spec/design-outputs.ts";
import {
  deriveMotionConstitution,
  parseMotionConstitution,
  withinConstitution,
  writeMotionTokens,
  type MotionConstitution,
} from "../src/spec/motion-constitution.ts";
import { inspectMotion, lintMotion, motionLintReason } from "../src/spec/motion-lint.ts";
import { lintMotionSource } from "../src/spec/motion.ts";
import { scoreChoreography } from "../src/spec/motion-score.ts";
import { isSurfaceCloseReason } from "../src/spec/visible-copy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT = 8_000;

const EDITORIAL: MotionConstitution = {
  world: "editorial",
  appetite: "measured",
  easings: [
    { name: "brand-out", value: "power3.out" },
    { name: "brand-hover", value: "power2.out" },
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

const CONSTITUTION_MD = [
  "## Motion constitution",
  "",
  "Scroll owner: Lenis via motionSetup. One ticker only.",
  "- new Lenis({ autoRaf: false })",
  "- lenis.on('scroll', ScrollTrigger.update)",
  "- gsap.ticker.add(t => lenis.raf(t * 1000))",
  "- gsap.ticker.lagSmoothing(0)",
  "",
  "Easings: brand-out: power3.out, brand-hover: power2.out, brand-track: none.",
  "Duration bands: micro 0.2-0.35s, story 0.8-1.4s.",
  "Recipes: batchReveal.",
  "Stagger is a delay, not a duration band.",
  "",
].join("\n");

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-245w-"));
}

function remove(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function write(dir: string, rel: string, source: string): void {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source, "utf8");
}

function shell(body: string): string {
  return [
    body,
    'gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => {});',
    "document.fonts.ready.then(() => ScrollTrigger.refresh());",
    'for (const image of document.images) image.addEventListener("load", () => ScrollTrigger.refresh());',
    "tween.kill();",
  ].join("\n");
}

function hit(dir: string, rule: string): { file: string; line: number; detail: string; fix: string } {
  const found = lintMotion(dir).find((finding) => finding.rule === rule);
  assert.ok(found, lintMotion(dir).map((finding) => finding.rule).join(", "));
  assert.match(found.file, /\S/);
  assert.ok(found.line >= 1);
  assert.ok(found.fix.trim().length > 0);
  return found;
}

test("DESIGN.md carries a lock-covered motion constitution from the world tokens", { timeout: TIMEOUT }, () => {
  const markdown = renderDesignMd(["A calm editorial studio.", "", "## Motion", "", "Motion score: 2.", ""].join("\n"));
  assert.match(markdown, /## Signature moments\n\nNone locked yet\./);
  assert.match(markdown, /## Motion constitution\n/);
  assert.match(markdown, /autoRaf: false/);
  assert.match(markdown, /lagSmoothing\(0\)/);
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes("\u2014"), false);
  const lint = lintDesignMd(markdown);
  assert.equal(lint.ok, true, lint.errors.map((error) => error.message).join(" "));
  const parsed = parseMotionConstitution(markdown);
  assert.ok(parsed);
  assert.ok(parsed.easings.length > 0 && parsed.easings.length <= 3);
  assert.ok(parsed.bands.length > 0 && parsed.bands.length <= 2);
  const calm = deriveMotionConstitution({ world: "editorial", score: 2, text: "calm" });
  const kinetic = deriveMotionConstitution({ world: "editorial", score: 9, text: "kinetic" });
  assert.ok(calm.easings.length < kinetic.easings.length);
  assert.ok(kinetic.easings.some((ease) => ease.value === "power3.out"));
  assert.ok(deriveMotionConstitution({ world: "brutalist", score: 5, text: "" }).easings.every((ease) => ease.value === "none"));

  const dir = tempProject();
  try {
    writeDesignMd(dir, "A calm editorial studio.");
    const tokens = readFileSync(path.join(dir, "src", "styles", "motion-tokens.ts"), "utf8");
    assert.match(tokens, /export const motionEasings/);
    assert.match(tokens, /export const motionDurationBands/);
    assert.match(tokens, /export const motionScrollOwner = "lenis"/);
    writeMotionTokens(dir, markdown);
    assert.match(readFileSync(path.join(dir, "src", "styles", "motion-tokens.ts"), "utf8"), /motionRecipes/);
  } finally {
    remove(dir);
  }
});

test("withinConstitution refuses an elevate change that adds an easing", { timeout: TIMEOUT }, () => {
  assert.equal(withinConstitution({ ease: "elastic.out" }, EDITORIAL), false);
  assert.equal(withinConstitution("Add easing elastic.out", EDITORIAL), false);
  assert.equal(withinConstitution({ ease: "power3.out", duration: 0.9, recipe: "batchReveal", scrollOwner: "lenis" }, EDITORIAL), true);
  assert.equal(withinConstitution({ ease: "elastic.out" }, null), true);
  assert.equal(withinConstitution("A softer eased hover", EDITORIAL), true);
  assert.equal(withinConstitution({ scrollOwner: "locomotive" }, EDITORIAL), false);
});

test("static motion rules fail with file and line, and a clean ticker passes", { timeout: TIMEOUT }, () => {
  const cases: { rule: string; rel: string; source: string; design?: string }[] = [
    {
      rule: "two-scroll-owners",
      rel: "src/pages/owners.ts",
      source: shell(["const a = new Lenis({ autoRaf: false });", "const b = new Lenis({ autoRaf: false });"].join("\n")),
    },
    {
      rule: "lenis-ticker",
      rel: "ticker-gap.ts",
      source: ['import Lenis from "lenis";', "const lenis = new Lenis({ autoRaf: false });", "lenis.raf(16);"].join("\n"),
    },
    {
      rule: "lenis-raf-loop",
      rel: "second-raf.ts",
      source: [
        'import Lenis from "lenis";',
        "const lenis = new Lenis({ autoRaf: false });",
        'lenis.on("scroll", ScrollTrigger.update);',
        "gsap.ticker.add((t) => { lenis.raf(t * 1000); });",
        "gsap.ticker.lagSmoothing(0);",
        "requestAnimationFrame((t) => { lenis.raf(t); });",
      ].join("\n"),
    },
    {
      rule: "layout-properties",
      rel: "layout.ts",
      source: shell('gsap.to(".card", { width: "100%" });'),
    },
    {
      rule: "scrub-layout",
      rel: "scrub-width.ts",
      source: shell('gsap.to(".box", { width: 240, scrollTrigger: { scrub: true } });'),
    },
    {
      rule: "scrub-filter",
      rel: "scrub-filter.ts",
      source: shell('gsap.to(".box", { filter: "blur(8px)", scrollTrigger: { scrub: true } });'),
    },
    {
      rule: "refresh-after-media",
      rel: "refresh.ts",
      source: 'ScrollTrigger.create({ trigger: ".scene" });\ngsap.matchMedia();',
    },
    {
      rule: "horizontal-ease",
      rel: "track.ts",
      source: shell('gsap.to(panels, { xPercent: -100, ease: "power2.out" });'),
    },
    {
      rule: "scrollto-with-lenis",
      rel: "scrollto.ts",
      source: shell(['const lenis = new Lenis({ autoRaf: false });', 'gsap.to(window, { scrollTo: "#about" });'].join("\n")),
    },
    {
      rule: "reduced-motion",
      rel: "reduced.ts",
      source: 'gsap.from(".headline", { yPercent: 20, duration: 0.3 });',
    },
    {
      rule: "webgl-context",
      rel: "webgl.ts",
      source: 'const a = new THREE.WebGLRenderer();\nconst b = canvas.getContext("webgl2");',
    },
    {
      rule: "nested-scroll-trigger",
      rel: "nested.ts",
      source: shell('const timeline = gsap.timeline();\ntimeline.to(".a", { y: 12, scrollTrigger: { scrub: true } });'),
    },
    {
      rule: "duplicate-tween",
      rel: "duplicate.ts",
      source: shell('gsap.to(".card", { y: 8 });\ngsap.to(".card", { y: 0 });'),
    },
    {
      rule: "batch-list",
      rel: "cards.ts",
      source: shell(
        [
          'gsap.to(".card-a", { y: 8, scrollTrigger: { trigger: ".card-a" } });',
          'gsap.to(".card-b", { y: 8, scrollTrigger: { trigger: ".card-b" } });',
          'gsap.to(".card-c", { y: 8, scrollTrigger: { trigger: ".card-c" } });',
          'gsap.to(".card-d", { y: 8, scrollTrigger: { trigger: ".card-d" } });',
        ].join("\n"),
      ),
    },
    {
      rule: "cleanup",
      rel: "cleanup.ts",
      source: 'gsap.to(".card", { y: 8 });\ngsap.matchMedia();',
    },
    {
      rule: "direct-motion",
      rel: "src/pages/hero.ts",
      source: shell('gsap.to(".hero", { y: 12, duration: 0.9, ease: "power3.out" });'),
      design: CONSTITUTION_MD,
    },
    {
      rule: "constitution-ease",
      rel: "src/pages/ease.ts",
      source: shell('gsap.to(".hero", { y: 12, duration: 0.9, ease: "elastic.out" });'),
      design: CONSTITUTION_MD,
    },
    {
      rule: "constitution-duration",
      rel: "src/pages/long.ts",
      source: shell('gsap.to(".hero", { y: 12, duration: 2.4, ease: "power3.out" });'),
      design: CONSTITUTION_MD,
    },
  ];

  for (const item of cases) {
    const dir = tempProject();
    try {
      if (item.design !== undefined) write(dir, "DESIGN.md", item.design);
      write(dir, item.rel, item.source);
      const found = hit(dir, item.rule);
      assert.equal(found.file.replaceAll("\\", "/"), item.rel.replaceAll("\\", "/"));
    } finally {
      remove(dir);
    }
  }

  const clean = tempProject();
  try {
    write(
      clean,
      "ticker.ts",
      [
        'import Lenis from "lenis";',
        "const lenis = new Lenis({ autoRaf: false });",
        'lenis.on("scroll", ScrollTrigger.update);',
        "gsap.ticker.add((t) => { lenis.raf(t * 1000); });",
        "gsap.ticker.lagSmoothing(0);",
        "document.fonts.ready.then(() => ScrollTrigger.refresh());",
        'for (const image of document.images) image.addEventListener("load", () => ScrollTrigger.refresh());',
        "gsap.matchMedia();",
        "lenis.destroy();",
      ].join("\n"),
    );
    write(clean, "transform.ts", shell('gsap.to(".box", { x: 12, opacity: 1, scrollTrigger: { scrub: true } });'));
    assert.deepEqual(lintMotion(clean), []);
  } finally {
    remove(clean);
  }
});

test("a fourth easing and a third duration band fail the constitution", { timeout: TIMEOUT }, () => {
  const dir = tempProject();
  try {
    write(
      dir,
      "DESIGN.md",
      [
        "## Motion constitution",
        "",
        "Easings: brand-out: power3.out, brand-hover: power2.out, brand-track: none, brand-extra: elastic.out.",
        "Duration bands: micro 0.2-0.35s, story 0.8-1.4s, hold 2-2.4s.",
        "Recipes: batchReveal.",
        "",
      ].join("\n"),
    );
    const rules = lintMotion(dir).filter((finding) => finding.rule === "constitution-count");
    assert.equal(rules.length, 2);
    assert.ok(rules.every((finding) => finding.file === "DESIGN.md" && finding.line >= 1 && finding.fix.trim() !== ""));
  } finally {
    remove(dir);
  }
});

test("recipe sources and motionSetup pass with zero findings", { timeout: TIMEOUT }, () => {
  const root = path.resolve(here, "..", "..", "design-system", "src");
  for (const folder of ["motion", "recipes"]) {
    for (const name of readdirSync(path.join(root, folder))) {
      if (!name.endsWith(".ts")) continue;
      const source = readFileSync(path.join(root, folder, name), "utf8");
      const findings = inspectMotion(source, name);
      assert.deepEqual(
        findings.map((finding) => `${finding.rule}: ${finding.detail}`),
        [],
        `${folder}/${name}`,
      );
    }
  }
});

test("choreography score names competing easings and drops", { timeout: TIMEOUT }, () => {
  const dir = tempProject();
  try {
    write(
      dir,
      "src/hero.ts",
      ['gsap.to(".a", { y: 10, duration: 0.3, ease: "power3.out" });', 'gsap.to(".b", { y: 10, duration: 0.9, ease: "elastic.out" });'].join("\n"),
    );
    const score = scoreChoreography(dir, {
      rafLoops: 1,
      scrollTriggers: 1,
      lenisInstances: 2,
      scrubbedProperties: [],
      refreshedAfterFonts: true,
      refreshedAfterImages: true,
      triggersAfterUnmount: 0,
    });
    assert.ok(score.score < 10);
    const text = score.findings.join(" ");
    assert.match(text, /power3\.out/);
    assert.match(text, /elastic\.out/);
    assert.match(text, /scroll owner/i);
    const saved = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "qa", "motion", "choreography.json"), "utf8")) as { score: number };
    assert.equal(saved.score, score.score);
  } finally {
    remove(dir);
  }
});

test("motion lint close is a surface failure and lintMotionSource still accepts one bold thing", { timeout: TIMEOUT }, () => {
  const dir = tempProject();
  try {
    write(dir, "DESIGN.md", CONSTITUTION_MD);
    write(dir, "src/pages/hero.ts", 'gsap.to(".hero", { y: 8, duration: 2.4, ease: "elastic.out" });');
    const reason = motionLintReason(dir, ["src/pages/hero.ts"]);
    assert.match(reason, /^Motion lint failed\./);
    assert.match(reason, /src\/pages\/hero\.ts:\d+/);
    assert.match(reason, /Fix:/);
    assert.equal(isSurfaceCloseReason(reason), true);
    assert.equal(motionLintReason(dir, ["DESIGN.md"]), "");
  } finally {
    remove(dir);
  }

  const named = [
    'export const boldThing = "Soft parallax on the hero." as const;',
    'export const orchestratedMoment = { id: "hero", kind: "timeline" } as const;',
    "export const motionReduced = { opacity: 1, yPercent: 0, duration: 0 } as const;",
    'gsap.to(".keep", { opacity: 0, duration: 0.15 });',
  ].join("\n");
  const report = lintMotionSource(named);
  assert.equal(report.ok, true, report.reasons.join(" | "));
});
