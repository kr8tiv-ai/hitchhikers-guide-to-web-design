import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { QueueFile } from "@hitchhiker/engine";
import { applyBeautyRound } from "../src/beauty-gate.ts";
import {
  juryWithPatterns,
  patternPageFailures,
  scorePatterns,
  type PatternPage,
  type VisionScores,
} from "../src/pattern-score.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TENS: VisionScores = { design: 10, usability: 10, creativity: 10, content: 10 };

const IMPORT_ONLY = [
  'import gsap from "gsap";',
  'import * as THREE from "three";',
  "const renderer = new THREE.WebGLRenderer({ antialias: true });",
  'gsap.to(".title", { opacity: 1, duration: 0.4 });',
].join("\n");

const COMPOSED = [
  'import gsap from "gsap";',
  'import { ScrollTrigger } from "gsap/ScrollTrigger";',
  'import * as THREE from "three";',
  'import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";',
  'import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";',
  'import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";',
  "gsap.registerPlugin(ScrollTrigger);",
  "const renderer = new THREE.WebGLRenderer({ antialias: true });",
  "const composer = new EffectComposer(renderer);",
  "composer.addPass(new RenderPass(scene, camera));",
  "composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 0.85));",
  "const glass = new THREE.MeshPhysicalMaterial({",
  "  transmission: 0.95,",
  "  thickness: 1.2,",
  "  roughness: 0.08,",
  "  ior: 1.5,",
  "  clearcoat: 1,",
  "});",
  "const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);",
  "camera.position.set(0, 0.4, 3.2);",
  "camera.lookAt(0, 0, 0);",
  "gsap.timeline({",
  "  scrollTrigger: {",
  '    trigger: ".scene",',
  '    start: "top top",',
  '    end: "+=150%",',
  "    pin: true,",
  "    scrub: 1,",
  "    anticipatePin: 1,",
  "    invalidateOnRefresh: true,",
  "  },",
  "});",
  'gsap.from(".headline", {',
  "  yPercent: 100,",
  "  opacity: 0,",
  "  duration: 1.2,",
  '  ease: "expo.out",',
  "  stagger: 0.08,",
  "});",
  "document.fonts.ready.then(() => ScrollTrigger.refresh());",
  "for (const image of Array.from(document.images)) {",
  '  image.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });',
  "}",
  'if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {',
  '  gsap.set(".headline", { yPercent: 0, opacity: 1 });',
  "}",
].join("\n");

const CSS_SCENE = [
  "<style>",
  ".scene { position: sticky; top: 0; min-height: 200vh; animation-timeline: view(); }",
  "@media (prefers-reduced-motion: reduce) {",
  "  .scene { animation: none; opacity: 1; }",
  "}",
  ".headline { clip-path: inset(0 0 0 0); }",
  "</style>",
  '<section class="scene"><h1 class="headline">Kiln</h1></section>',
].join("\n");

const CSS_SCRIPT = [
  "const renderer = new WebGLRenderer({ antialias: true });",
  "const glass = new MeshPhysicalMaterial({",
  "  transmission: 0.94,",
  "  roughness: 0.1,",
  "  ior: 1.5,",
  "  clearcoat: 1,",
  "});",
  "const camera = new PerspectiveCamera(40, 1, 0.1, 40);",
  "camera.position.set(0, 0.2, 2.4);",
  "camera.lookAt(0, 0, 0);",
  "const composer = new EffectComposer(renderer);",
  "composer.addPass(new UnrealBloomPass());",
  'if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {',
  '  document.querySelector(".headline").style.opacity = "1";',
  "}",
].join("\n");

function page(html: string, source: string, name = "home"): PatternPage {
  return {
    page: name,
    section: "scene",
    html,
    scripts: source === "" ? [] : [{ file: "src/scripts/scene.ts", source }],
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

test("a high-appetite page that only imports GSAP and Three fails the pattern gate", () => {
  const scene = page("<section class=\"scene\"><h1 class=\"title\">Atlas</h1></section>", IMPORT_ONLY);
  const scored = scorePatterns({ appetite: 8, textLed: false, page: scene, vision: TENS });
  assert.equal(scored.pass, false);
  const reason = scored.reasons.join(" ");
  assert.match(reason, /pin/i);
  assert.match(reason, /scrub/i);
  assert.match(reason, /material/i);
  assert.match(reason, /post/i);
  assert.ok(scored.imported.includes("gsap"));
  assert.ok(scored.imported.includes("three"));
  assert.equal(scored.used.pin, false);
  assert.equal(scored.used.scrub, false);
  assert.equal(scored.used.material, false);
  assert.equal(scored.used.post, false);
  const judged = juryWithPatterns(TENS, scored);
  assert.equal(judged.total, 100);
  assert.equal(judged.status, "FAIL");
  const failures = patternPageFailures(scored, scene);
  assert.ok(failures.length > 0);
  const round = applyBeautyRound({
    queue: queue(),
    gateIds: ["010"],
    round: 1,
    failures,
    artDirection: "A pinned product story with glass and bloom.",
    designLanguage: "This is direction and vocabulary, not a limit.",
    now: "2026-10-19T16:00:00.000Z",
  });
  assert.equal(round.jury, "FAIL");
  assert.equal(round.prompts.length, failures.length);
  assert.match(round.prompts[0]?.body ?? "", /pin|scrub|material|post/i);
  assert.match(round.prompts[0]?.body ?? "", /grok-4\.7-build-fast/);
  assert.match(round.prompts[0]?.body ?? "", /xhigh/);
});

test("a high-appetite page that composes pin, scrub, material, and post passes", () => {
  const scene = page('<section class="scene"><h1 class="headline">Atlas</h1></section>', COMPOSED);
  const scored = scorePatterns({ appetite: 9, textLed: false, page: scene, vision: TENS });
  assert.equal(scored.pass, true, scored.reasons.join(" "));
  assert.equal(scored.used.pin, true);
  assert.equal(scored.used.scrub, true);
  assert.equal(scored.used.material, true);
  assert.equal(scored.used.post, true);
  assert.equal(scored.used.textReveal, true);
  assert.equal(scored.used.camera, true);
  assert.equal(scored.used.reducedMotion, true);
  assert.ok(scored.dimensions.developer >= 8);
  assert.equal(juryWithPatterns(TENS, scored).status, "PASS");
  assert.deepEqual(patternPageFailures(scored, scene), []);
});

test("a high-appetite page can compose the same patterns without GSAP or Three imports", () => {
  const scene = page(CSS_SCENE, CSS_SCRIPT);
  const scored = scorePatterns({ appetite: 8, textLed: false, page: scene, vision: TENS });
  assert.equal(scored.pass, true, scored.reasons.join(" "));
  assert.equal(scored.imported.includes("gsap"), false);
  assert.equal(scored.imported.includes("three"), false);
  assert.equal(juryWithPatterns(TENS, scored).status, "PASS");
});

test("a low-appetite text-led page is not penalised for missing pin, scrub, material, or post", () => {
  const scene = page(
    "<article><h1>Field notes</h1><p>The kiln cools for a day before the glaze is named.</p></article>",
    "",
  );
  const calm = scorePatterns({ appetite: 3, textLed: true, page: scene, vision: TENS });
  assert.equal(calm.pass, true, calm.reasons.join(" "));
  assert.equal(juryWithPatterns(TENS, calm).status, "PASS");
  const essay = scorePatterns({ appetite: 9, textLed: true, page: scene, vision: TENS });
  assert.equal(essay.pass, true, essay.reasons.join(" "));
  const imported = scorePatterns({
    appetite: 4,
    textLed: true,
    page: page("<article><h1>Notes</h1><p>A column of type.</p></article>", IMPORT_ONLY),
    vision: TENS,
  });
  assert.equal(imported.pass, true, imported.reasons.join(" "));
});

test("slop and a template clone still fail a page that composes the patterns", () => {
  const html = '<section class="scene"><h1 class="headline">Unlock a seamless future</h1></section>';
  const slop = scorePatterns({
    appetite: 9,
    textLed: false,
    page: page(html, COMPOSED),
    vision: TENS,
  });
  assert.equal(slop.pass, false);
  assert.match(slop.reasons.join(" "), /slop/i);
  assert.equal(juryWithPatterns(TENS, slop).status, "FAIL");

  const cloneText = "atlas ridge copper kettle morning light over the valley floor and the kiln door";
  const cloned = scorePatterns({
    appetite: 9,
    textLed: false,
    page: page(`<p>${cloneText}</p>`, COMPOSED),
    vision: TENS,
    templateSnippets: [cloneText],
  });
  assert.equal(cloned.pass, false);
  assert.match(cloned.reasons.join(" "), /clone/i);
});

test("the pattern scorer measures usage and does not ban a library", () => {
  const source = readFileSync(path.join(here, "..", "src", "pattern-score.ts"), "utf8");
  assert.match(source, /export function scorePatterns/);
  assert.doesNotMatch(source, /must use gsap|only three\.js|do not use gsap|banned library|forbidden library/i);
  assert.doesNotMatch(source, /child_process|node:http|node:https|grok-4|think\(/);
});
