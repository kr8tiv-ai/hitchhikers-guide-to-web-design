/**
 * BUG-045 item 5. The plan's visual phase comes from the art direction.
 * A motion score sets intensity. It does not delete the hero, the scroll
 * owner, the reveals, or the transitions.
 */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeBack } from "../src/phases/write-back.ts";
import { generateBriefPlan } from "../src/spec/brief-plan.ts";
import { phonePerformanceBudget } from "../src/spec/phone-budget.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import { removeTempDir } from "./remove-temp.ts";

const PARADISE = `# Site Brief

## Vibe

The site should feel calm, warm, and honest. It should never feel salesy, cluttered, or loud.

## References

Kinfolk: love. Slow editorial scroll and soft color. Aesop: restraint and empty space. Patagonia: big quiet photography.

## Motion

The motion score is 4, with a medium appetite. Use gentle parallax on the hero only. Farm cards fade in one after another at about 400 ms. Everything stays still when reduced motion is on.

## Imagery

Photography, as a mix. Use my own hero. Free open-license stock fills the non-farm pages and is captioned as not a listed farm.

## Colours

Jungle green, sunset gold, and ocean blue, plus soft sand and a near-black green. Sunset gold is the accent.

## Logo

A thin crescent over a horizon line. Keep it.

## Pages

Pages: Home; Farms (grid plus map); About.
`;

const BOLD = `# Site Brief

## Vibe

Bold, tech, dark. The motion score is 8.

## Pages

Pages: Home.

${phonePerformanceBudget()}
`;

const QUIET = `# Site Brief

## Vibe

Calm and plain.

## Motion

The motion score is 2.

## Pages

Pages: Home; Visit.
`;

function blob(prompt: SitePromptSkeleton): string {
  return `${prompt.title}\n${(prompt.acceptance ?? []).join("\n")}`;
}

function effects(prompts: readonly SitePromptSkeleton[]): SitePromptSkeleton[] {
  return prompts.filter((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-FX-")));
}

test("Paradise Found plans a hero, Lenis, farm-card reveals, a transition, and layered parallax", () => {
  const { prompts } = generateBriefPlan(PARADISE);
  const motion = effects(prompts);
  assert.ok(motion.length >= 5, `effects ${motion.length}`);

  const hero = motion.find((prompt) => /hero signature/i.test(blob(prompt)));
  const scroll = motion.find((prompt) => prompt.library === "lenis");
  const reveal = motion.find((prompt) => /farm cards/i.test(blob(prompt)));
  const transition = motion.find((prompt) => /section transition/i.test(blob(prompt)));
  const parallax = motion.find((prompt) => /layered media/i.test(blob(prompt)) && /parallax/i.test(blob(prompt)));
  for (const prompt of [hero, scroll, reveal, transition, parallax]) {
    assert.ok(prompt, blob(motion[0] ?? prompts[0]!));
    assert.ok(prompt.library !== undefined, prompt.title);
    assert.match(prompt.title, new RegExp(prompt.library, "i"));
    assert.match(blob(prompt), /reduced motion stays visible and complete/i);
    assert.match(blob(prompt), /Lighthouse stays at 90/);
    assert.match(blob(prompt), /2\.5 seconds/);
    assert.match(blob(prompt), /CLS stays at most 0\.1/);
    assert.match(blob(prompt), /REQ-PERF/);
  }
  assert.equal(scroll?.library, "lenis");
  assert.match(reveal?.title ?? "", /gsap/i);
  assert.equal(
    prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))),
    false,
  );
  const layout = prompts.find((prompt) => prompt.title.startsWith("Build the hero layout"));
  assert.match((layout?.acceptance ?? []).join(" "), /asymmetric grid/i);
  assert.match((layout?.acceptance ?? []).join(" "), /type scale/i);

  const pages = new Set(motion.filter((prompt) => prompt.library === "lenis").map((prompt) => prompt.requirements.join(" ")));
  assert.ok(pages.size >= 3, `scroll owners ${pages.size}`);
});

test("a WebGL hero adds the desktop 3D gate, and a quiet score stays on CSS scroll", () => {
  const bold = generateBriefPlan(BOLD);
  const webgl = effects(bold.prompts).filter((prompt) =>
    prompt.library === "three" || prompt.library === "ogl" || prompt.library === "theatre",
  );
  assert.ok(webgl.length >= 1);
  const gates = bold.prompts.filter((prompt) =>
    prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D")),
  );
  assert.equal(gates.length, webgl.length);
  assert.match(blob(webgl[0]!), /The phone keeps the scene after the poster at a GPU tier/);
  assert.match(blob(webgl[0]!), /One WebGL context on the page/);
  assert.doesNotMatch(blob(webgl[0]!), /no webgl on phones/i);

  const quiet = generateBriefPlan(QUIET);
  const quietFx = effects(quiet.prompts);
  assert.ok(quietFx.some((prompt) => prompt.library === "css-scroll"));
  assert.equal(quietFx.some((prompt) => prompt.library === "lenis"), false);
  assert.equal(
    quiet.prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))),
    false,
  );
  assert.ok(quietFx.length <= 150);
});

test("the twelve-page plan stays inside the 150 prompt cap", () => {
  const names = ["Home", "Willow", "Cedar", "Maple", "Birch", "Alder", "Aspen", "Rowan", "Holly", "Hazel", "Laurel", "Ivy"];
  const brief = `# Site Brief\n\n## Pages\n\nPages: ${names.join("; ")}.\n`;
  const { prompts, planned } = generateBriefPlan(brief);
  assert.equal(planned.pages.length, names.length);
  assert.ok(prompts.length <= 150, `count ${prompts.length}`);
  assert.ok(effects(prompts).some((prompt) => prompt.library === "lenis"));
  assert.equal(
    prompts.some((prompt) => prompt.requirements.some((id) => id.startsWith("REQ-GATE-DESKTOP-3D"))),
    false,
  );
});

test("writeMotion uses the art-direction requests", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-motion-239-"));
  try {
    const written = await writeBack(dir, {
      id: "DP-6.2",
      action: "answer",
      text: "Keep it at 7.",
      target: "motion",
      field: "appetite",
      answerId: "DP-6.2",
    });
    assert.equal(path.basename(written), "MOTION.md");
    const { readFile } = await import("node:fs/promises");
    const motion = await readFile(written, "utf8");
    assert.match(motion, /Appetite: 7 of 10/);
    assert.match(motion, /: lenis\./);
    assert.equal(motion.includes("hero-fade"), false);
  } finally {
    await removeTempDir(dir);
  }
});
