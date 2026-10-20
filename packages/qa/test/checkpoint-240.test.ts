import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { defaultConfig, type QueueFile } from "@hitchhiker/engine";
import { lintSlop } from "../src/antislop.ts";
import { judgeAward, type AwardInput } from "../src/award-jury.ts";
import { applyBeautyRound } from "../src/beauty-gate.ts";
import type { PatternPage, VisionScores } from "../src/pattern-score.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const TENS: VisionScores = { design: 10, usability: 10, creativity: 10, content: 10 };
const BAN = /must use gsap|only three\.js|do not use gsap|banned library|forbidden library/i;

const COMPOSED = [
  'import gsap from "gsap";',
  'import { ScrollTrigger } from "gsap/ScrollTrigger";',
  'import * as THREE from "three";',
  'import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";',
  'import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";',
  "gsap.registerPlugin(ScrollTrigger);",
  "const renderer = new THREE.WebGLRenderer({ antialias: true });",
  "const composer = new EffectComposer(renderer);",
  "composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 0.85));",
  "const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.95, roughness: 0.08, ior: 1.5, clearcoat: 1 });",
  "const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);",
  "camera.position.set(0, 0.4, 3.2);",
  "camera.lookAt(0, 0, 0);",
  "gsap.timeline({ scrollTrigger: { trigger: \".scene\", start: \"top top\", end: \"+=150%\", pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true } });",
  'gsap.from(".headline", { yPercent: 100, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.08 });',
  "document.fonts.ready.then(() => ScrollTrigger.refresh());",
  "for (const image of Array.from(document.images)) {",
  '  image.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });',
  "}",
  'if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {',
  '  gsap.set(".headline", { yPercent: 0, opacity: 1 });',
  "}",
].join("\n");

function page(html: string, source: string): PatternPage {
  return {
    page: "home",
    section: "scene",
    html,
    scripts: source === "" ? [] : [{ file: "src/scripts/scene.ts", source }],
  };
}

function floors() {
  const gates = defaultConfig().gates;
  return {
    phonePerfMin: gates.phonePerfMin,
    a11yMin: gates.a11yMin,
    bestPracticesMin: gates.bestPracticesMin,
    seoMin: gates.seoMin,
  };
}

function lighthouse() {
  return {
    categories: {
      performance: { score: 0.95 },
      accessibility: { score: 0.96 },
      "best-practices": { score: 0.95 },
      seo: { score: 0.97 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 1800 },
      "interaction-to-next-paint": { numericValue: 80 },
      "cumulative-layout-shift": { numericValue: 0.02 },
    },
  };
}

function award(patch: Partial<AwardInput> = {}): AwardInput {
  return {
    appetite: 9,
    textLed: false,
    page: page('<section class="scene"><h1 class="headline">Atlas</h1></section>', COMPOSED),
    vision: TENS,
    performance: {
      lighthouse: lighthouse(),
      floors: floors(),
      heavy: true,
      webglContexts: 1,
      glbBytes: 2_000_000,
      videoBytes: 3_000_000,
      mobileStill: true,
      animates: true,
      reducedMotionComplete: true,
    },
    ...patch,
  };
}

function queue(): QueueFile {
  return {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "010", kind: "build", status: "queued" },
    ],
  };
}

test("a composed high-appetite page passes the award jury", () => {
  const result = judgeAward(award());
  assert.equal(result.jury.status, "PASS", result.failures.map((failure) => failure.reason).join(" "));
  assert.equal(result.jury.total, 100);
  assert.equal(result.recipes.length, 0);
  assert.deepEqual(result.failures, []);
  assert.equal(result.developer, result.pattern.dimensions.developer);
  assert.ok(result.developer >= 8);
});

test("two WebGL contexts block the jury without changing the total", () => {
  const result = judgeAward(award({
    page: page(
      '<section class="scene"><h1 class="headline">Atlas</h1></section>',
      `${COMPOSED}\nconst extra = new THREE.WebGLRenderer({ antialias: true });`,
    ),
  }));
  assert.equal(result.pattern.pass, true, result.pattern.reasons.join(" "));
  assert.equal(result.performance.status, "PASS");
  assert.ok(result.recipes.some((finding) => finding.rule === "webgl-context"));
  assert.equal(result.jury.total, 100);
  assert.equal(result.jury.status, "FAIL");
  assert.equal(result.developer, Math.max(0, result.pattern.dimensions.developer - result.recipes.length * 2));
  assert.ok(result.failures.length > 0);
  const round = applyBeautyRound({
    queue: queue(),
    gateIds: ["010"],
    round: 1,
    failures: result.failures,
    artDirection: "One WebGL context, glass, and bloom.",
    designLanguage: "This is direction and vocabulary, not a limit.",
    now: "2026-10-19T16:00:00.000Z",
  });
  assert.equal(round.prompts.length, result.failures.length);
  assert.match(round.prompts[0]?.body ?? "", /grok-4\.7-build-fast/);
  assert.match(round.prompts[0]?.body ?? "", /xhigh/);
  assert.match(round.prompts[0]?.body ?? "", /WebGL|context/i);
});

test("a text-led page with a passing mobile run is not penalised", () => {
  const result = judgeAward(award({
    appetite: 9,
    textLed: true,
    page: page("<article><h1>Field notes</h1><p>The kiln cools for a day before the glaze is named.</p></article>", ""),
    performance: {
      lighthouse: lighthouse(),
      floors: floors(),
      heavy: false,
      webglContexts: 0,
      glbBytes: 0,
      videoBytes: 0,
      mobileStill: false,
      animates: false,
      reducedMotionComplete: false,
    },
  }));
  assert.equal(result.jury.status, "PASS", result.failures.map((failure) => failure.reason).join(" "));
  assert.equal(result.jury.total, 100);
});

test("slop still fails, and the gates do not ban a library", () => {
  assert.ok(lintSlop("Unlock a seamless future", "site").length > 0);
  const slop = judgeAward(award({
    page: page('<section class="scene"><h1>Unlock a seamless future</h1></section>', COMPOSED),
  }));
  assert.equal(slop.jury.status, "FAIL");
  assert.equal(slop.jury.total, 100);
  assert.match(slop.failures.map((failure) => failure.reason).join(" "), /slop/i);

  for (const file of ["award-jury.ts", "pattern-score.ts", "performance-gate.ts"]) {
    const source = readFileSync(path.join(here, "..", "src", file), "utf8");
    assert.doesNotMatch(source, BAN);
  }
  const awardSource = readFileSync(path.join(here, "..", "src", "award-jury.ts"), "utf8");
  assert.match(awardSource, /checkRecipes/);
  assert.match(awardSource, /evaluatePerformance/);
  assert.match(awardSource, /scorePatterns/);
  assert.match(awardSource, /jury\(/);
});

test("the asset step wires the provider chain and the embedded browser", () => {
  const hook = readFileSync(path.join(root, "packages", "app", "src", "server", "section-stills-hook.ts"), "utf8");
  assert.match(hook, /resolveDeskProvider/);
  assert.match(hook, /generateSectionStills/);
  assert.match(hook, /embeddedImagineDriver/);
  assert.match(hook, /settings\.browser/);
  const providers = readFileSync(path.join(root, "packages", "assets", "src", "section-generate.ts"), "utf8");
  assert.match(providers, /browserHandsBackProvider/);
  assert.match(providers, /"grok-cli"/);
  assert.doesNotMatch(providers, BAN);
});

test("the language doc records the pattern gate, the performance gate, and the award jury", () => {
  const doc = readFileSync(path.join(root, "docs", "high-end-language.md"), "utf8");
  assert.match(doc, /scorePatterns/);
  assert.match(doc, /evaluatePerformance/);
  assert.match(doc, /judgeAward/);
  assert.match(doc, /2\.5/);
  assert.doesNotMatch(doc, BAN);
});
