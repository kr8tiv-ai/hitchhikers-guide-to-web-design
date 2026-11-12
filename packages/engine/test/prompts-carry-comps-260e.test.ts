/**
 * 260e: page and section build prompts name the approved comps.
 * Setup prompts do not. VISUAL-TRUTH.md records the same paths.
 * No network and no real Grok call.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prepareSiteBuild, renderBuildPrompt } from "../src/guide/site-build.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { estimateTokens } from "../src/spec/context-doc.ts";
import {
  approveComp,
  approveMotionRef,
  compCandidateRel,
  listComps,
  motionClipRel,
  sectionCropRel,
  type CompView,
} from "../src/spec/comps.ts";
import { DESIGN_GATE_TOKEN_CAP, DESIGN_PATTERN_TOKEN_CAP, type DesignLibrary } from "../src/spec/design-language.ts";
import { sha256File } from "../src/spec/reference-shots.ts";
import { visualTargetOf } from "../src/spec/site-prompts.ts";
import { VISUAL_TRUTH_REL } from "../src/spec/visual-truth.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = `# Site Brief

## Vibe

Calm, warm, honest, like Kinfolk.

## Pages

Pages: Home.

## Facts

The valley is the only place named in the interview.
`;

const SITEMAP = `# Sitemap

## Primary

- Home at /
  - hero
`;

const VIEWS: readonly CompView[] = ["desktop", "mobile", "desktop-long"];

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-260e-"));
}

function writeSitemap(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), SITEMAP, "utf8");
}

function plant(dir: string, rel: string, bytes: string): void {
  const abs = path.join(dir, ...rel.split("/"));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(bytes));
}

function approveViews(dir: string, stamp: string): void {
  for (const view of VIEWS) {
    const rel = compCandidateRel("/", view, 1);
    plant(dir, rel, `${stamp}-${view}`);
    approveComp(dir, "/", view, rel);
  }
}

function promptFiles(dir: string): string[] {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  return readdirSync(folder)
    .filter((name) => /^\d{3}\.md$/.test(name))
    .sort()
    .map((name) => readFileSync(path.join(folder, name), "utf8"));
}

function promptFor(dir: string, requirement: string): string {
  const found = promptFiles(dir).find((text) => new RegExp(`Requirements:[^\\n]*\\b${requirement}\\b`).test(text));
  assert.ok(found, `missing prompt ${requirement}`);
  return found;
}

function snapshot(dir: string): string[] {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  return readdirSync(folder)
    .filter((name) => /^\d{3}\.md$/.test(name))
    .sort()
    .map((name) => readFileSync(path.join(folder, name), "utf8"));
}

function taskOf(text: string): { title: string; requirements: string[]; route?: string } {
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? "";
  const task = /^## Task[ \t]*\n([\s\S]*?)(?=^## )/m.exec(text)?.[1] ?? "";
  const line = /^Requirements:[ \t]*(.+)$/m.exec(task)?.[1] ?? "";
  const requirements = line.split(",").map((item) => item.trim()).filter((item) => item !== "");
  const route = /^Route:[ \t]*(\S+)[ \t]*$/m.exec(task)?.[1];
  return route === undefined ? { title, requirements } : { title, requirements, route };
}

test("visualTargetOf names a page or a section and skips setup", () => {
  assert.deepEqual(
    visualTargetOf({ title: "Add the Home route.", requirements: ["REQ-PAGE-home"], route: "/" }),
    { route: "/" },
  );
  assert.deepEqual(
    visualTargetOf({ title: "Build the hero layout on Home.", requirements: ["REQ-STRUCT-hero"] }),
    { sectionId: "hero" },
  );
  assert.deepEqual(
    visualTargetOf({
      title: "Bind gsap on the hero section. Do not also bind this element with another library.",
      requirements: ["REQ-FX-reveal"],
    }),
    { sectionId: "hero" },
  );
  assert.equal(
    visualTargetOf({ title: "Scaffold the strict TypeScript project.", requirements: ["REQ-SCAFFOLD"] }),
    null,
  );
  assert.equal(visualTargetOf({ title: "Record the color and type tokens.", requirements: ["REQ-TOKENS"] }), null);
  assert.equal(visualTargetOf({ title: "Deploy the site.", requirements: ["REQ-DEPLOY"] }), null);
  assert.equal(visualTargetOf({ title: "Write the page title and description.", requirements: ["REQ-SEO-home"] }), null);
});

test("home prompts name approved comps and setup prompts do not", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir);
    approveViews(dir, "sketch-v1");
    const truthPath = path.join(dir, VISUAL_TRUTH_REL);
    assert.equal(existsSync(truthPath), true);
    const early = readFileSync(truthPath, "utf8");
    const compsAt = early.indexOf("## 1. Approved comps and motion clips");
    const designAt = early.indexOf("## 2. DESIGN.md tokens and type");
    const briefAt = early.indexOf("## 3. Brief copy");
    assert.ok(compsAt >= 0 && designAt > compsAt && briefAt > designAt);
    assert.match(early, /Words are live HTML from the brief and the copy, never baked into images/);
    assert.match(early, /A comp is never used as a page image/);
    assert.match(early, /Owner photos fill the photo areas/);
    assert.match(early, /composition/);
    assert.match(early, /spacing/);
    assert.match(early, /scale/);
    assert.match(early, /palette/);
    assert.match(early, /photo treatment/);
    assert.ok(early.indexOf("reference/renders/home.png") > compsAt);
    assert.ok(early.indexOf("reference/renders/home.png") < designAt);
    assert.ok(early.indexOf("reference/renders/home.mobile.png") < designAt);
    assert.equal(early.includes(".mp4"), false);
    assert.equal(early.includes("!"), false);
    assert.equal(early.includes("\u2014"), false);

    await prepareSiteBuild(dir, BRIEF);
    const truth = readFileSync(truthPath, "utf8");
    const typeAt = truth.indexOf("## 2. DESIGN.md tokens and type");
    const copyAt = truth.indexOf("## 3. Brief copy");
    assert.match(truth.slice(typeAt, copyAt), /Ratio:/);
    assert.match(truth, /\.hitchhiker\/SITE-BRIEF\.md/);

    const desktopHash = sha256File(path.join(dir, "reference", "renders", "home.png"));
    const phoneHash = sha256File(path.join(dir, "reference", "renders", "home.mobile.png"));
    const longHash = sha256File(path.join(dir, "reference", "renders", "home.long.png"));
    const home = promptFor(dir, "REQ-PAGE-home");
    assert.match(home, /Open these approved comps before you write code\./);
    assert.match(home, /reference\/renders\/home\.png/);
    assert.match(home, /reference\/renders\/home\.mobile\.png/);
    assert.match(home, /reference\/renders\/home\.long\.png/);
    assert.match(home, new RegExp(`Match this:.*desktop reference/renders/home\\.png sha256:${desktopHash}`));
    assert.match(home, new RegExp(`phone reference/renders/home\\.mobile\\.png sha256:${phoneHash}`));
    assert.match(home, new RegExp(`long reference/renders/home\\.long\\.png sha256:${longHash}`));
    assert.equal(home.includes(".mp4"), false);
    assert.equal(home.includes("/home/"), false);

    const hero = promptFor(dir, "REQ-STRUCT-hero");
    assert.match(hero, /reference\/renders\/home\.png/);
    assert.match(hero, /reference\/renders\/home\.mobile\.png/);
    assert.match(hero, /Match this:/);
    assert.equal(hero.includes(".mp4"), false);

    for (const requirement of ["REQ-SCAFFOLD", "REQ-TOKENS", "REQ-DEPLOY"]) {
      const text = promptFor(dir, requirement);
      assert.equal(text.includes("reference/renders/"), false, requirement);
      assert.equal(text.includes("Match this:"), false, requirement);
    }
    for (const text of promptFiles(dir)) {
      const target = visualTargetOf(taskOf(text));
      if (target !== null) continue;
      assert.equal(text.includes("Match this:"), false);
      assert.equal(text.includes("reference/renders/"), false);
    }

    const first = snapshot(dir);
    await prepareSiteBuild(dir, BRIEF);
    assert.deepEqual(snapshot(dir), first);

    const crop = sectionCropRel("/", "hero");
    const clip = motionClipRel("/", "hero");
    plant(dir, crop, "hero-crop-v1");
    plant(dir, clip, "hero-motion-unapproved");
    const raw = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "comps.json"), "utf8")) as {
      pages: Array<{ sections: Array<{ id: string; crop?: string; motion?: string }> }>;
    };
    const section = raw.pages[0]?.sections.find((item) => item.id === "hero");
    assert.ok(section, "hero section missing from comps");
    section.crop = crop;
    section.motion = clip;
    writeFileSync(path.join(dir, ".hitchhiker", "comps.json"), `${JSON.stringify(raw, null, 2)}\n`);
    assert.equal(listComps(dir).pages[0]?.sections.find((item) => item.id === "hero")?.motionApproved, undefined);

    await prepareSiteBuild(dir, BRIEF);
    const withCrop = promptFor(dir, "REQ-PAGE-home");
    const heroCrop = promptFor(dir, "REQ-STRUCT-hero");
    assert.match(withCrop, /reference\/comps\/home\/sections\/hero\.png/);
    assert.match(heroCrop, /reference\/comps\/home\/sections\/hero\.png/);
    assert.equal(withCrop.includes(".mp4"), false);
    assert.equal(heroCrop.includes(".mp4"), false);
    assert.equal(promptFor(dir, "REQ-SCAFFOLD").includes("reference/comps/"), false);
    assert.equal(readFileSync(truthPath, "utf8").includes(".mp4"), false);

    const motion = approveMotionRef(dir, "/", "hero");
    const withMotion = promptFor(dir, "REQ-PAGE-home");
    const heroMotion = promptFor(dir, "REQ-STRUCT-hero");
    const truthMotion = readFileSync(truthPath, "utf8");
    assert.match(withMotion, new RegExp(`motion hero ${clip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} sha256:${motion.sha256}`));
    assert.match(heroMotion, new RegExp(`sha256:${motion.sha256}`));
    assert.match(truthMotion, new RegExp(clip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(truthMotion, new RegExp(motion.sha256));
    assert.equal(promptFor(dir, "REQ-SCAFFOLD").includes(".mp4"), false);

    const previous = desktopHash;
    const replacement = compCandidateRel("/", "desktop", 2);
    plant(dir, replacement, "desktop-fold-v2-different-bytes");
    approveComp(dir, "/", "desktop", replacement);
    const nextHash = sha256File(path.join(dir, "reference", "renders", "home.png"));
    assert.notEqual(nextHash, previous);
    const regenerated = promptFor(dir, "REQ-PAGE-home");
    assert.equal(regenerated.includes(nextHash), true);
    assert.equal(regenerated.includes(previous), false);
    assert.match(regenerated, /reference\/renders\/home\.png/);
    const afterHook = snapshot(dir);
    await prepareSiteBuild(dir, BRIEF);
    assert.deepEqual(snapshot(dir), afterHook);
    assert.equal(readFileSync(truthPath, "utf8").includes(nextHash), true);
    assert.equal(readFileSync(truthPath, "utf8").includes(previous), false);
  } finally {
    removeTempDir(dir);
  }
});

test("comp lines stay whole while the example is trimmed to the pattern cap", () => {
  const dir = tempDir();
  try {
    writeSitemap(dir);
    approveViews(dir, "budget-sketch");
    const home = generateBriefPlan(BRIEF).prompts.find((prompt) => prompt.requirements.includes("REQ-PAGE-home"));
    assert.ok(home);
    const goldenDir = path.join(dir, "fat-golden");
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(path.join(goldenDir, "structure.md"), "a ".repeat(5000), "utf8");
    const library: DesignLibrary = {
      goldenDir,
      recipes: "",
      gallery: [],
      assetsMarkdown: "",
      facts: "The valley is the only place named in the interview.",
      styleText: BRIEF,
    };
    const text = renderBuildPrompt(home, BRIEF, "Context packet.", dir, library);
    const hash = sha256File(path.join(dir, "reference", "renders", "home.png"));
    const design = text.split("## Design language")[1]?.split(/^## /m)[0] ?? "";
    const example = design.split("### Example")[1]?.split("### Technique notes")[0] ?? "";
    const notes = design.split("### Technique notes")[1]?.split("### Gates")[0] ?? "";
    const afterGates = design.split("### Gates")[1] ?? "";
    const gates = afterGates.split("### Visual truth")[0] ?? "";
    const truth = afterGates.split("### Visual truth")[1] ?? "";
    assert.match(example, /\[example trimmed\]/);
    assert.match(truth, /reference\/renders\/home\.png/);
    assert.match(truth, /reference\/renders\/home\.mobile\.png/);
    assert.equal(truth.includes(hash), true);
    assert.equal(truth.includes("[example trimmed]"), false);
    assert.equal(truth.includes("[technique notes trimmed]"), false);
    assert.equal(truth.includes("[trimmed]"), false);
    const patterns = estimateTokens(`${example}\n${notes}`);
    const withTruth = estimateTokens(`${example}\n${notes}\n${truth}`);
    assert.ok(patterns <= DESIGN_PATTERN_TOKEN_CAP, `patterns ${patterns}`);
    assert.ok(withTruth <= DESIGN_PATTERN_TOKEN_CAP, `with truth ${withTruth}`);
    assert.ok(estimateTokens(gates) <= DESIGN_GATE_TOKEN_CAP, `gates ${estimateTokens(gates)}`);
    assert.match(gates, /phone Lighthouse at least 90/);
  } finally {
    removeTempDir(dir);
  }
});
