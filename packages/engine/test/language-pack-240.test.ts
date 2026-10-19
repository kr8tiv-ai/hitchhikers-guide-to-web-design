import assert from "node:assert/strict";
import { test } from "node:test";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import { formatLanguagePack, loadLanguagePack, selectLanguageEntries } from "../src/spec/language-pack.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";

const BAN = /only use|do not use\s+\S+/i;
const WEBGL = /CatmullRomCurve3|MeshPhysicalMaterial|EffectComposer|UnrealBloomPass|WebGL|iridescence|caustic|fbm/i;

function library(styleText: string): DesignLibrary {
  return {
    goldenDir: "golden",
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is the only place named.",
    styleText,
  };
}

function prompt(section: string): SitePromptSkeleton {
  return {
    id: "014",
    phase: "deep-thought",
    slice: "Infinite Monkeys",
    title: `Art-direct the ${section} section: home`,
    tier: "Heart of Gold",
    effort: "high",
    model: "grok-4.7-build-fast",
    dependsOn: [],
    filesModified: ["src/pages/index.astro"],
    requirements: [`REQ-STRUCT-${section}`],
    protected: [],
    reviewAfter: false,
    maxTurns: 3,
    kind: "build",
    route: "/",
    acceptance: ["The section is readable."],
  };
}

test("the language pack seeds the transcript ranges", () => {
  const entries = loadLanguagePack();
  const names = entries.map((entry) => entry.name);
  for (const name of ["camera-path", "glass-material", "post-chain", "scroll-pin", "horizontal-track", "split-reveal", "typography", "iridescence", "grain", "caustics", "shader-hero"]) {
    assert.ok(names.includes(name), name);
  }
  for (const entry of entries) {
    assert.notEqual(entry.whenToUse, "");
    assert.notEqual(entry.ranges, "");
    assert.notEqual(entry.snippet, "");
    assert.notEqual(entry.performance, "");
    assert.notEqual(entry.reducedMotion, "");
    assert.equal(BAN.test(`${entry.whenToUse}\n${entry.ranges}\n${entry.snippet}`), false, entry.name);
  }
  const blob = entries.map((entry) => entry.ranges).join("\n");
  assert.match(blob, /0\.12-0\.18/);
  assert.match(blob, /0\.3-0\.5/);
  assert.match(blob, /35-45/);
  assert.match(blob, /0\.92-0\.98/);
  assert.match(blob, /0\.5-2/);
  assert.match(blob, /0\.05-0\.15/);
  assert.match(blob, /ior 1\.5/);
  assert.match(blob, /clearcoat 1/);
  assert.match(blob, /0\.3-0\.8/);
  assert.match(blob, /radius 0\.4/);
  assert.match(blob, /threshold 0\.85/);
  assert.match(blob, /exposure 1\.1/);
  assert.match(blob, /scrub: 1/);
  assert.match(blob, /anticipatePin: 1/);
  assert.match(blob, /invalidateOnRefresh: true/);
  assert.match(blob, /ease: "none"/);
  assert.match(blob, /expo\.out/);
});

test("a high-appetite 3D hero gets camera, material, and post ranges", () => {
  const text = designLanguageFor(
    prompt("hero"),
    "3D product hero with glass, a camera move, and bloom.",
    library("The motion score is 9. Bold technical product."),
  );
  assert.match(text, /### High-end language/);
  assert.match(text, /Starting vocabulary/);
  assert.match(text, /CatmullRomCurve3/);
  assert.match(text, /0\.12-0\.18/);
  assert.match(text, /maath/);
  assert.match(text, /0\.3-0\.5/);
  assert.match(text, /35-45/);
  assert.match(text, /MeshPhysicalMaterial/);
  assert.match(text, /0\.92-0\.98/);
  assert.match(text, /thickness 0\.5-2/);
  assert.match(text, /0\.05-0\.15/);
  assert.match(text, /ior 1\.5/);
  assert.match(text, /clearcoat 1/);
  assert.match(text, /UnrealBloomPass/);
  assert.match(text, /0\.3-0\.8/);
  assert.match(text, /radius 0\.4/);
  assert.match(text, /threshold 0\.85/);
  assert.match(text, /FilmGrain/);
  assert.match(text, /Vignette/);
  assert.match(text, /ACES/);
  assert.match(text, /exposure 1\.1/);
  assert.equal(BAN.test(text), false);
});

test("a text-led section gets typography and reveal terms, not WebGL", () => {
  const entries = loadLanguagePack();
  const picked = selectLanguageEntries(
    { appetite: 8, sectionKind: "story", artDirection: "Text-led editorial column. Typography and a line reveal." },
    entries,
  );
  const text = formatLanguagePack(picked);
  assert.match(text, /typograph/i);
  assert.match(text, /SplitText/);
  assert.match(text, /expo\.out/);
  assert.equal(WEBGL.test(text), false);
  assert.equal(BAN.test(text), false);
  const promptText = designLanguageFor(
    prompt("story"),
    "Text-led editorial column. Typography and a line reveal.",
    library("The motion score is 8. Editorial brand."),
  );
  assert.match(promptText, /typograph/i);
  assert.match(promptText, /SplitText/);
  assert.equal(WEBGL.test(promptText), false);
});

test("a low-appetite brief gets no 3D terms", () => {
  const entries = loadLanguagePack();
  const picked = selectLanguageEntries(
    {
      appetite: 2,
      sectionKind: "hero",
      artDirection: "3D product hero with glass, a camera move, bloom, shader, caustics, and iridescence.",
    },
    entries,
  );
  const packed = formatLanguagePack(picked);
  assert.equal(packed, "");
  assert.equal(WEBGL.test(packed), false);
  const text = designLanguageFor(
    prompt("hero"),
    "3D product hero with glass, a camera move, bloom, shader, caustics, and iridescence.",
    library("The motion score is 2. Quiet brochure."),
  );
  assert.equal(text.includes("### High-end language"), false);
  assert.equal(text.includes("CatmullRomCurve3"), false);
  assert.equal(text.includes("MeshPhysicalMaterial"), false);
  assert.equal(text.includes("UnrealBloomPass"), false);
  assert.equal(text.includes("EffectComposer"), false);
  assert.equal(BAN.test(text), false);
});
