import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { phonePerformanceBudget } from "../src/spec/phone-budget.ts";
import {
  DESIGN_MD_PATH,
  MOTION_TS_PATH,
  flagIgnoredMotionTokens,
  writeDesignMd,
  writeMotionModule,
} from "../src/spec/design-outputs.ts";
import { prepareSiteBuild } from "../src/guide/site-build.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const QUIET = [
  "## Vibe",
  "",
  "Calm editorial, warm and specific.",
  "",
  "## Motion",
  "",
  "Motion score: 2. Polished, not a spectacle.",
  "",
].join("\n");

const CINEMATIC = [
  "## Vibe",
  "",
  "Bold tech shader world.",
  "",
  "## Motion",
  "",
  "Motion score: 9. Pinned scroll stories.",
  "",
  "## Pages",
  "",
  "Home (hero, story)",
  "",
  phonePerformanceBudget(),
  "",
].join("\n");

function typeErrors(file: string): string[] {
  const ts = createRequire(path.join(repoRoot, "package.json"))("typescript") as typeof import("typescript");
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
    },
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === file)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

test("a fixture brief writes a typed DESIGN.md and motion.ts, and every build prompt names both", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-240-"));
  try {
    const designPath = writeDesignMd(dir, CINEMATIC);
    const motionPath = writeMotionModule(dir, CINEMATIC, [], ["hero", "story"]);
    assert.equal(designPath, path.join(dir, DESIGN_MD_PATH));
    assert.equal(motionPath, path.join(dir, MOTION_TS_PATH));
    const design = readFileSync(designPath, "utf8");
    for (const heading of [
      "## Tokens",
      "## Type scale",
      "## Color",
      "## Spacing",
      "## Components",
      "## Motion principles",
      "## Signature techniques",
    ]) {
      assert.match(design, new RegExp(heading));
    }
    assert.match(design, /Reveal duration: 1\.2s/);
    assert.match(design, /expo\.out/);
    assert.match(design, /Line stagger: 0\.08/);
    assert.match(design, /yPercent: 100/);
    assert.match(design, /\+=150%/);
    assert.match(design, /Lenis lerp: 0\.08/);
    assert.match(design, /Damping: 0\.12/);
    assert.match(design, /FOV: 35/);
    assert.match(design, /Bloom strength: 0\.6/);
    assert.match(design, /radius 0\.4/);
    assert.match(design, /threshold 0\.85/);
    assert.match(design, /Any appropriate library/);
    assert.equal(/only use|do not use\s+\S+/i.test(design), false);
    assert.equal(design.includes("!"), false);

    const motion = readFileSync(motionPath, "utf8");
    assert.equal(motion.includes("!"), false);
    assert.deepEqual(typeErrors(motionPath), []);
    const loaded = (await import(pathToFileURL(motionPath).href)) as {
      motionScrub: number;
      motionDurations: { reveal: number; snapMin: number; snapMax: number; snapDelay: number };
      motionEasings: { reveal: string; track: string };
      motionStaggers: { lines: number };
      motionDistances: { revealYPercent: number; pinEnd: string; cameraEnd: string };
      motionLenis: { lerp: number; anchorOffset: number; anchorDuration: number; reducedMotion: string };
      motionDamping: number;
      motionFov: number;
      motionBloom: { strength: number; radius: number; threshold: number; exposure: number };
      motionScenes: readonly { id: string; start: string; pin: boolean; scrub: number }[];
      motionReduced: { immediate: boolean; duration: number; scrub: boolean; pin: boolean };
    };
    assert.equal(loaded.motionScrub, 1);
    assert.equal(loaded.motionDurations.reveal, 1.2);
    assert.equal(loaded.motionDurations.snapMin, 0.2);
    assert.equal(loaded.motionDurations.snapMax, 0.8);
    assert.equal(loaded.motionDurations.snapDelay, 0.1);
    assert.equal(loaded.motionEasings.reveal, "expo.out");
    assert.equal(loaded.motionEasings.track, "none");
    assert.equal(loaded.motionStaggers.lines, 0.08);
    assert.equal(loaded.motionDistances.revealYPercent, 100);
    assert.equal(loaded.motionDistances.pinEnd, "+=150%");
    assert.equal(loaded.motionDistances.cameraEnd, "+=200%");
    assert.equal(loaded.motionLenis.lerp, 0.08);
    assert.equal(loaded.motionLenis.anchorOffset, -80);
    assert.equal(loaded.motionLenis.anchorDuration, 1.2);
    assert.equal(loaded.motionLenis.reducedMotion, "instant");
    assert.equal(loaded.motionDamping, 0.12);
    assert.equal(loaded.motionFov, 35);
    assert.equal(loaded.motionBloom.strength, 0.6);
    assert.equal(loaded.motionBloom.radius, 0.4);
    assert.equal(loaded.motionBloom.threshold, 0.85);
    assert.equal(loaded.motionBloom.exposure, 1.1);
    assert.equal(loaded.motionReduced.immediate, true);
    assert.equal(loaded.motionReduced.duration, 0);
    assert.equal(loaded.motionReduced.scrub, false);
    assert.equal(loaded.motionReduced.pin, false);
    assert.deepEqual(
      loaded.motionScenes.map((scene) => scene.id),
      ["hero", "story"],
    );
    assert.equal(loaded.motionScenes[0]?.pin, true);
    assert.equal(loaded.motionScenes[0]?.scrub, 1);

    const { prompts } = generateBriefPlan(CINEMATIC);
    assert.ok(prompts.length > 1);
    for (const prompt of prompts) {
      const text = `${prompt.title}\n${(prompt.acceptance ?? []).join("\n")}`;
      assert.match(text, /DESIGN\.md/);
      assert.match(text, /src\/scripts\/motion\.ts/);
      assert.equal(/only use|do not use\s+\S+/i.test(text), false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a quiet brief still writes exact tokens, with the calmer band", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-240-quiet-"));
  try {
    writeDesignMd(dir, QUIET);
    const motionPath = writeMotionModule(dir, QUIET);
    const design = readFileSync(path.join(dir, DESIGN_MD_PATH), "utf8");
    assert.match(design, /Reveal duration: 0\.6s/);
    assert.match(design, /Lenis lerp: 0\.12/);
    assert.match(design, /Damping: 0\.18/);
    assert.match(design, /FOV: 45/);
    assert.match(design, /Bloom strength: 0\.3/);
    const loaded = (await import(pathToFileURL(motionPath).href)) as {
      motionDurations: { reveal: number };
      motionLenis: { lerp: number };
      motionDamping: number;
      motionFov: number;
      motionBloom: { strength: number };
    };
    assert.equal(loaded.motionDurations.reveal, 0.6);
    assert.equal(loaded.motionLenis.lerp, 0.12);
    assert.equal(loaded.motionDamping, 0.18);
    assert.equal(loaded.motionFov, 45);
    assert.equal(loaded.motionBloom.strength, 0.3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fixture site that ignores the motion.ts tokens is flagged", () => {
  const using = flagIgnoredMotionTokens([
    {
      path: "src/scripts/hero.ts",
      source: [
        'import { motionDurations, motionEasings, motionScrub } from "../scripts/motion.ts";',
        "gsap.from('.headline', {",
        "  yPercent: 100,",
        "  duration: motionDurations.reveal,",
        "  ease: motionEasings.reveal,",
        "  scrollTrigger: { scrub: motionScrub },",
        "});",
      ].join("\n"),
    },
  ]);
  assert.deepEqual(using, []);
  const ignored = flagIgnoredMotionTokens([
    {
      path: "src/scripts/hero.ts",
      source: "gsap.from('.headline', { duration: 1.2, ease: 'expo.out', scrollTrigger: { scrub: 1 } });",
    },
  ]);
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0]?.rule, "ignores-motion-tokens");
  assert.equal(ignored[0]?.file, "src/scripts/hero.ts");
  const idle = flagIgnoredMotionTokens([{ path: "src/data/copy.ts", source: "export const title = 'Home';" }]);
  assert.deepEqual(idle, []);
});

test("prepareSiteBuild writes both files and the rendered prompts name them", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-240-build-"));
  try {
    await prepareSiteBuild(dir, CINEMATIC);
    const design = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    const motion = readFileSync(path.join(dir, "src", "scripts", "motion.ts"), "utf8");
    assert.match(design, /## Motion principles/);
    assert.match(motion, /export const motionScenes/);
    const prompt = readFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "utf8");
    assert.match(prompt, /DESIGN\.md/);
    assert.match(prompt, /src\/scripts\/motion\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
