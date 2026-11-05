/**
 * 245v. Signature moments are invented once, locked in DESIGN.md, and copied
 * into page prompts. The harness picks. No network and no grok process.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { saveDirectionDeal, type Direction } from "../src/brand/directions.ts";
import { renderBuildPrompt } from "../src/guide/site-build.ts";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { designLockMatches, writeDesignLock } from "../src/spec/design-lock.ts";
import { lintDesignMd } from "../src/spec/design-md-lint.ts";
import { renderDesignMd } from "../src/spec/design-outputs.ts";
import type { DesignLibrary } from "../src/spec/design-language.ts";
import {
  SIGNATURE_CANDIDATES_REL,
  SIGNATURE_PICK_LOG_REL,
  SIGNATURE_TASK,
  SignatureMomentError,
  inventSignatureMoments,
  pickSignatureMoments,
  signatureDeskHtml,
  type SignatureThink,
} from "../src/spec/signature-moments.ts";
import { SIGNATURE_RULE } from "../src/spec/site-rules.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import { renderVisualConstitution } from "../src/spec/visual-constitution.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a quiet visit. Motion score: 6.";
const TIMEOUT = 10_000;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("invention yields 3 candidates and a recipe outside the style world is refused", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    let calls = 0;
    let input = "";
    const think = fakeThink((request) => {
      calls += 1;
      input = request.input;
      assert.equal(request.task, SIGNATURE_TASK);
      return { candidates: [moment("dusk-turn", "pinnedTimeline", "home/hero"), moment("path-line", "horizontalTrack", "visit/path"), moment("quiet-labels", "snapToLabels", "about/labels")] };
    });
    prepare(dir);
    const candidates = await inventSignatureMoments(dir, { think });
    assert.equal(calls, 1);
    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map((item) => item.recipe), ["pinnedTimeline", "horizontalTrack", "snapToLabels"]);
    assert.match(input, /reference\/refs\/still\.png/);
    assert.match(input, /Allowed recipes: pinnedTimeline, horizontalTrack, snapToLabels/);
    assert.match(input, /Brand idea:/);
    const open = signatureDeskHtml(dir, "token");
    assert.match(open, /data-signature-pick/);
    assert.equal(open.includes("data-signature-id="), false);

    const refused = tempDir();
    try {
      prepare(refused);
      let refusedCalls = 0;
      const bad = fakeThink(() => {
        refusedCalls += 1;
        return {
          candidates: [
            moment("dusk-turn", "pinnedTimeline", "home/hero"),
            moment("path-line", "horizontalTrack", "visit/path"),
            moment("camera-dive", "scrollCamera", "home/hero"),
          ],
        };
      });
      await assert.rejects(
        () => inventSignatureMoments(refused, { think: bad }),
        (error: unknown) => {
          assert.ok(error instanceof SignatureMomentError);
          assert.match(error.message, /scrollCamera is outside the editorial style world map/);
          return true;
        },
      );
      assert.equal(refusedCalls, 1);
      assert.equal(existsSync(path.join(refused, SIGNATURE_CANDIDATES_REL)), false);
    } finally {
      removeTempDir(refused);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("lint requires a fallback and a budget, and a later edit un-locks DESIGN.md", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    prepare(dir);
    const base = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    const missingFallback = swapMoments(base, contract("dusk-turn", "pinnedTimeline", "home/hero", { fallback: false }));
    const fallbackLint = lintDesignMd(missingFallback);
    assert.equal(fallbackLint.ok, false);
    assert.equal(fallbackLint.errors.some((error) => error.rule === "signature-moment" && /fallback/i.test(error.message)), true);

    const missingBudget = swapMoments(base, contract("dusk-turn", "pinnedTimeline", "home/hero", { budget: false }));
    const budgetLint = lintDesignMd(missingBudget);
    assert.equal(budgetLint.ok, false);
    assert.equal(budgetLint.errors.some((error) => error.rule === "signature-moment" && /budget/i.test(error.message)), true);
    assert.equal(lintDesignMd(base).ok, true);

    const think = fakeThink(() => ({
      candidates: [
        moment("dusk-turn", "pinnedTimeline", "home/hero", "The still frame stays fully visible at opacity 1."),
        moment("path-line", "horizontalTrack", "visit/path", "The path stays a still line at opacity 1."),
        moment("quiet-labels", "snapToLabels", "about/labels"),
      ],
    }));
    await inventSignatureMoments(dir, { think });
    const picked = pickSignatureMoments(dir, ["dusk-turn", "path-line"]);
    assert.deepEqual(picked.map((item) => item.id), ["dusk-turn", "path-line"]);
    const log = readFileSync(path.join(dir, SIGNATURE_PICK_LOG_REL), "utf8");
    assert.match(log, /picked dusk-turn, path-line/);
    const lockedHtml = signatureDeskHtml(dir, "token");
    assert.match(lockedHtml, /data-signature-id="dusk-turn"/);
    assert.match(lockedHtml, /data-signature-id="path-line"/);

    writeDesignLock(dir, "dir-quiet");
    assert.equal(designLockMatches(dir), true);
    const constitution = readFileSync(path.join(dir, "VISUAL-CONSTITUTION.md"), "utf8");
    assert.ok(constitution.startsWith("# Visual constitution"));
    assert.match(constitution, /^Signature moments:\n- dusk-turn, /m);
    assert.match(constitution, /^Brand idea: /m);
    assert.match(constitution, /^Signature:\n/m);
    assert.equal(constitution.includes("!"), false);
    assert.ok(Buffer.byteLength(constitution, "utf8") <= 1_200);
    assert.match(renderVisualConstitution(readFileSync(path.join(dir, "DESIGN.md"), "utf8")), /dusk-turn/);

    const designPath = path.join(dir, "DESIGN.md");
    const before = readFileSync(designPath, "utf8");
    writeFileSync(designPath, before.replace("The still frame stays fully visible at opacity 1.", "The still frame is covered."), "utf8");
    assert.equal(designLockMatches(dir), false);
  } finally {
    removeTempDir(dir);
  }
});

test("every page prompt carries the signature rule and only the host gets the contract", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    prepare(dir);
    const think = fakeThink(() => ({
      candidates: [
        moment("dusk-turn", "pinnedTimeline", "home/hero", "The still frame stays fully visible at opacity 1.", ["about/story"]),
        moment("path-line", "horizontalTrack", "visit/path", "The path stays a still line at opacity 1."),
        moment("quiet-labels", "snapToLabels", "about/labels"),
      ],
    }));
    await inventSignatureMoments(dir, { think });
    pickSignatureMoments(dir, ["dusk-turn", "path-line"]);
    const rule = SIGNATURE_RULE(["dusk-turn", "path-line"]);
    const library = emptyLibrary(dir);
    const hero = renderBuildPrompt(skeleton("hero", "REQ-STRUCT-hero"), BRIEF, "Packet.", dir, library);
    const pathPrompt = renderBuildPrompt(skeleton("path", "REQ-STRUCT-path"), BRIEF, "Packet.", dir, library);
    const story = renderBuildPrompt(skeleton("story", "REQ-STRUCT-story"), BRIEF, "Packet.", dir, library);
    for (const prompt of [hero, pathPrompt, story]) {
      assert.ok(prompt.includes(rule));
      assert.match(prompt, /Do not edit the Signature moments section in DESIGN\.md/);
    }
    assert.match(hero, /Signature host: home\/hero/);
    assert.match(hero, /The still frame stays fully visible at opacity 1/);
    assert.match(hero, /maxJsKb 24/);
    assert.equal(hero.includes("The path stays a still line at opacity 1."), false);
    assert.match(pathPrompt, /Signature host: visit\/path/);
    assert.match(pathPrompt, /The path stays a still line at opacity 1/);
    assert.equal(pathPrompt.includes("The still frame stays fully visible at opacity 1."), false);
    assert.equal(story.includes("Signature host:"), false);
    assert.equal(story.includes("maxJsKb"), false);
    assert.equal(story.includes("The still frame stays fully visible"), false);
    assert.equal(story.includes("The path stays a still line"), false);
    assert.match(story, /Echoes: dusk-turn: about\/story/);
  } finally {
    removeTempDir(dir);
  }
});

function prepare(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  mkdirSync(path.join(dir, "reference", "refs"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), `${BRIEF}\n`, "utf8");
  writeFileSync(path.join(dir, "reference", "refs", "still.png"), PNG);
  writeFileSync(path.join(dir, "DESIGN.md"), renderDesignMd(BRIEF), "utf8");
  saveDirectionDeal(dir, { pickedId: "dir-quiet", directions: [direction()] });
}

function direction(): Direction {
  return {
    id: "dir-quiet",
    name: "Quiet window",
    description: "A still window that turns with the day.",
    citationId: "cite-quiet",
    title: "Quiet window",
    url: "https://example.com/quiet",
    display: "Fraunces",
    body: "Instrument Sans",
    sectionOrder: ["hero", "story"],
    hue: "#1f6b4a",
  };
}

function moment(
  id: string,
  recipe: string,
  section: string,
  fallback = "The still frame stays fully visible at opacity 1.",
  echoes: string[] = [],
): Record<string, unknown> {
  const name = id === "path-line" ? "The path line" : id === "quiet-labels" ? "The quiet labels" : "The window turns";
  return {
    id,
    name,
    description: "The window turns with the day. The brand idea stays in that turn.",
    section,
    recipe,
    approach: `Use ${recipe} on ${section}. Asset: reference/refs/still.png.`,
    fallback,
    budget: { maxJsKb: 24, maxFrameMs: 8, lcp: 2.5, cls: 0.05 },
    echoes,
  };
}

function contract(id: string, recipe: string, section: string, options: { fallback?: boolean; budget?: boolean }): string {
  const lines = [
    `### ${id}`,
    "",
    `- id: ${id}`,
    "- name: The window turns",
    "- description: The window turns with the day. The brand idea stays in that turn.",
    `- section: ${section}`,
    `- recipe: ${recipe}`,
    `- approach: Use ${recipe} on ${section}. Asset: reference/refs/still.png.`,
  ];
  if (options.fallback !== false) lines.push("- fallback: The still frame stays fully visible at opacity 1.");
  if (options.budget !== false) lines.push("- budget: maxJsKb 24, maxFrameMs 8, lcp 2.5, cls 0.05");
  lines.push("- echoes: none", "");
  return lines.join("\n");
}

function swapMoments(markdown: string, body: string): string {
  return markdown.replace("## Signature moments\n\nNone locked yet.", `## Signature moments\n\n${body.trim()}`);
}

function skeleton(id: string, requirement: string): SitePromptSkeleton {
  return {
    id,
    phase: "improbability-drive",
    slice: "Vogon Constructor Fleet",
    title: `Art-direct the ${id} section`,
    tier: "Towel",
    effort: "medium",
    model: "grok-4.7",
    dependsOn: [],
    filesModified: [`src/sections/${id}.ts`],
    requirements: [requirement],
    protected: [],
    reviewAfter: false,
    maxTurns: 4,
    kind: "build",
  };
}

function emptyLibrary(dir: string): DesignLibrary {
  return {
    goldenDir: dir,
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is the only place named.",
    styleText: "",
  };
}

function fakeThink(valueFor: (request: ThinkRequest<unknown>) => unknown): SignatureThink {
  return (request) => {
    const result: ThinkResult<unknown> = {
      value: valueFor(request),
      raw: "{}",
      durationMs: 1,
      cassette: "live",
    };
    return Promise.resolve(result);
  };
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-245v-"));
}
