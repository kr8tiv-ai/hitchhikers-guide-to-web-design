/**
 * Dogfood replay for the frozen Towel & Tea fixture.
 * Public compilers only. No model, no network, and no child process.
 * DP-2.7 is not in the fixture, so the story pack is built with
 * positioningLine, pickArchetype, and expandOnly. The offer words are
 * taken from the site why. The fixture file is not extended.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compileBrand } from "../src/brand/brain.ts";
import type { BrandParts } from "../src/brand/brain.ts";
import { buildImagery } from "../src/brand/imagery.ts";
import { expandOnly, pickArchetype, positioningLine } from "../src/brand/story.ts";
import type { StoryPack } from "../src/brand/story.ts";
import { buildTeardown } from "../src/brand/teardown.ts";
import { contrastRatio, passes } from "../src/brand/tokens.ts";
import { evidenceFromAnswers, lintClaims } from "../src/brand/truth.ts";
import { renderVoice } from "../src/brand/voice.ts";
import { compileWhy } from "../src/brand/why.ts";
import { renderBrief } from "../src/required.ts";
import type { AnswerRecord } from "../src/required.ts";
import { planMotion } from "../src/spec/motion.ts";
import type { MotionLib } from "../src/spec/motion.ts";
import { renderPrd } from "../src/spec/prd.ts";
import { decideStack } from "../src/spec/stack.ts";
import { loadTree } from "../src/tree.ts";

const HEAVY: readonly MotionLib[] = ["three", "theatre"];
const LIGHT: readonly MotionLib[] = ["css-scroll", "vanilla"];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureDir = path.join(repoRoot, "evals", "towel-and-tea");

export interface DogfoodResult {
  siteWhy: string;
  hosting: string;
  motionLibraries: string[];
  prdHasAssumptions: boolean;
}

export function summarizeDogfood(input: {
  answers: AnswerRecord[];
  prdMarkdown: string;
  libraries: string[];
}): DogfoodResult {
  return {
    siteWhy: latestValue(input.answers, "DP-2.1"),
    hosting: latestValue(input.answers, "DP-9.2"),
    motionLibraries: [...input.libraries],
    prdHasAssumptions: assumptionsListed(input.prdMarkdown),
  };
}

function latestValue(answers: readonly AnswerRecord[], id: string): string {
  let found = "";
  for (const answer of answers) {
    if (answer.id === id) found = answer.value.trim();
  }
  return found;
}

function assumptionsListed(markdown: string): boolean {
  const body = section(markdown, "## 14. Assumptions");
  if (body === "") return false;
  return /^- .+\((?:SKIPPED|SOFT)\)$/m.test(body);
}

function section(markdown: string, title: string): string {
  const start = markdown.indexOf(title);
  if (start < 0) return "";
  const rest = markdown.slice(start + title.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readObject(file: string): Record<string, unknown> {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw)) throw new Error(`${path.basename(file)} must be an object.`);
  return raw;
}

const STATUSES: readonly AnswerRecord["status"][] = [
  "ANSWERED",
  "SUGGESTED",
  "SKIPPED",
  "SOFT",
  "IMPORTED",
];

function isStatus(value: unknown): value is AnswerRecord["status"] {
  return typeof value === "string" && STATUSES.some((status) => status === value);
}

function answersFrom(raw: Record<string, unknown>): AnswerRecord[] {
  const turns = raw["turns"];
  if (!Array.isArray(turns)) throw new Error("transcript.json turns must be an array.");
  const answers: AnswerRecord[] = [];
  for (const turn of turns) {
    if (!isRecord(turn)) throw new Error("transcript.json turn must be an object.");
    const id = turn["id"];
    const status = turn["status"];
    const value = turn["value"];
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("transcript.json turn is missing an id.");
    }
    if (!isStatus(status)) throw new Error(`transcript.json turn ${id} has a bad status.`);
    if (typeof value !== "string") {
      throw new Error(`transcript.json turn ${id} value must be a string.`);
    }
    answers.push({ id, status, value });
  }
  return answers;
}

function briefFrom(raw: Record<string, unknown>): Record<string, string> {
  const brief: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new Error(`expected-brief.json ${key} must be a string.`);
    }
    brief[key] = value;
  }
  return brief;
}

function requiredString(raw: Record<string, unknown>, key: string, file: string): string {
  const value = raw[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path.basename(file)} ${key} must be a non-empty string.`);
  }
  return value;
}

function appetiteOf(skipDefault: string): number {
  const match = /^(\d+)\b/.exec(skipDefault.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error("Skip default has no appetite.");
  const value = Number(digits);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("Skip default appetite is out of range.");
  }
  return value;
}

function offerWords(siteWhy: string): string {
  const match = /\bloose leaf\b/.exec(siteWhy);
  const words = match?.[0];
  if (words === undefined) throw new Error("The site why no longer names loose leaf.");
  return words;
}

function splitVibe(value: string): { vibe: string; antiVibe: string } {
  const match = /^(.+?)\.\s*Anti-vibe is\s+(.+?)\.?$/.exec(value.trim());
  const vibe = match?.[1]?.trim() ?? "";
  const antiVibe = match?.[2]?.trim() ?? "";
  if (vibe === "" || antiVibe === "") {
    throw new Error("The vibe answer no longer splits into a vibe and an anti-vibe.");
  }
  return { vibe, antiVibe };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function storyFromFixture(input: {
  name: string;
  siteWhy: string;
  brandWhy: string;
  visitor: string;
  offer: string;
}): StoryPack {
  const positioning = positioningLine({
    visitor: input.visitor,
    name: input.name,
    offer: input.offer,
    siteWhy: input.siteWhy,
  });
  const facts = [input.name, input.visitor, input.offer, input.siteWhy];
  const pick = pickArchetype(facts.join(" "));
  const holes = pick.tie ? ["archetype tie"] : [];
  return {
    archetype: pick.label,
    archetypeStatus: "ASSUMED",
    positioning,
    words25: input.brandWhy,
    words100: expandOnly(facts, 100),
    words300: expandOnly(facts, 300),
    holes,
  };
}

test("replay Towel and Tea through the brief, brand, and motion compilers", () => {
  const transcriptPath = path.join(fixtureDir, "transcript.json");
  const briefPath = path.join(fixtureDir, "expected-brief.json");
  const brandPath = path.join(fixtureDir, "expected-brand.json");
  const transcript = readObject(transcriptPath);
  const brief = briefFrom(readObject(briefPath));
  const answers = answersFrom(transcript);
  for (const answer of answers) {
    assert.equal(brief[answer.id], answer.value, answer.id);
  }
  const brandFile = readObject(brandPath);
  const client = requiredString(transcript, "client", transcriptPath);
  const paper = requiredString(brandFile, "paper", brandPath);
  const ink = requiredString(brandFile, "ink", brandPath);
  assert.equal(client, "Towel & Tea");
  assert.equal(passes(contrastRatio(ink, paper), "body"), true);

  const tree = loadTree(path.join(repoRoot, "interview", "tree.yaml"));
  const motionQuestion = tree.find((question) => question.id === "DP-6.2");
  assert.ok(motionQuestion);
  const skipDefault = motionQuestion.skipDefault;
  assert.equal(brief["DP-6.2"], skipDefault);
  const appetite = appetiteOf(skipDefault);
  assert.equal(appetite, 3);

  const siteWhy = brief["DP-2.1"] ?? "";
  const visitor = brief["DP-2.6"] ?? "";
  const hosting = brief["DP-9.2"] ?? "";
  const vibeAnswer = brief["DP-5.3"] ?? "";
  assert.notEqual(siteWhy, "");
  assert.notEqual(visitor, "");
  assert.equal(hosting, "no idea");

  const why = compileWhy(answers);
  assert.equal(why.siteWhy, siteWhy);
  assert.equal(why.status, "ASSUMED");
  assert.equal(why.siteWhy.includes("!"), false);

  const offer = offerWords(why.siteWhy);
  const vibe = splitVibe(vibeAnswer);
  const story = storyFromFixture({
    name: client,
    siteWhy: why.siteWhy,
    brandWhy: why.brandWhy,
    visitor,
    offer,
  });
  const voice = renderVoice({
    vibe: vibe.vibe,
    antiVibe: vibe.antiVibe,
    positioning: story.positioning,
    offer,
  });
  assert.match(voice.markdown, new RegExp(`\\b${escapeRegExp(vibe.vibe)}\\b`, "i"));
  assert.match(voice.markdown, new RegExp(`\\b${escapeRegExp(vibe.antiVibe)}\\b`, "i"));
  assert.equal(voice.markdown.includes("!"), false);

  const teardown = buildTeardown({ reportMarkdown: "", envy: "", boredom: "" });
  const imagery = buildImagery({
    protectedNotes: "",
    vibe: vibe.vibe,
    paletteName: "paper and ink",
  });
  const evidence = evidenceFromAnswers(answers);
  const parts: BrandParts = {
    why,
    story,
    teardownMarkdown: teardown.markdown,
    voiceMarkdown: voice.markdown,
    cssVars: [":root {", `  --paper: ${paper};`, `  --ink: ${ink};`, "}"].join("\n"),
    imageryMarkdown: imagery.markdown,
    evidence,
  };
  const brand = compileBrand(parts);
  assert.match(brand.markdown, new RegExp(escapeRegExp(why.siteWhy)));
  assert.match(brand.markdown, new RegExp(escapeRegExp(paper)));
  assert.match(brand.markdown, new RegExp(escapeRegExp(ink)));

  const briefMarkdown = renderBrief(answers);
  assert.match(briefMarkdown, new RegExp(escapeRegExp(hosting)));
  assert.match(briefMarkdown, new RegExp(escapeRegExp(skipDefault)));

  const prd = renderPrd({ answers, brandMarkdown: brand.markdown, name: client });
  const assumptions = section(prd.markdown, "## 14. Assumptions");
  assert.match(assumptions, /SKIPPED means the value is the assumed text/);
  assert.match(
    assumptions,
    new RegExp(`^- DP-6\\.2: ${escapeRegExp(skipDefault)} \\(SKIPPED\\)$`, "m"),
  );
  const deploy = section(prd.markdown, "## 13. Deploy plan");
  assert.match(deploy, new RegExp(`Hosting: ${escapeRegExp(hosting)}\\.`));
  assert.match(prd.markdown, /A phone receives the phone path\./);

  const lint = lintClaims(prd.markdown, evidence);
  assert.equal(lint.ok, true);
  assert.deepEqual(lint.hits, []);

  const stack = decideStack({
    siteType: "",
    motionLevel: appetite,
    persistentCanvas: false,
  });
  assert.equal(stack.pick, "astro");

  const plan = planMotion({
    requests: [{ id: "reveal", kind: "light-reveal", element: "title", page: "home" }],
    appetite,
    stack: stack.pick,
  });
  const libraries = plan.assignments.map((item) => item.library);
  assert.ok(libraries.length > 0);
  for (const library of libraries) {
    assert.equal(HEAVY.includes(library), false, library);
    assert.equal(LIGHT.includes(library), true, library);
  }
  assert.equal(libraries.includes("three"), false);
  assert.equal(libraries.includes("theatre"), false);
  assert.equal(plan.scrollOwner.home, "native");
  assert.match(plan.markdown, /Effects at level 6 and above keep a calm phone path\./);
  for (const warning of plan.warnings) {
    assert.equal(/\bthree\b|\btheatre\b/i.test(warning), false);
  }

  const result = summarizeDogfood({
    answers,
    prdMarkdown: prd.markdown,
    libraries,
  });
  assert.equal(result.siteWhy, why.siteWhy);
  assert.equal(result.hosting, hosting);
  assert.equal(result.prdHasAssumptions, true);
  assert.deepEqual(result.motionLibraries, libraries);
  assert.equal(result.motionLibraries.includes("three"), false);
  assert.equal(result.motionLibraries.includes("theatre"), false);
});

test("summarizeDogfood reads the latest why and hosting and the assumptions list", () => {
  const answers: AnswerRecord[] = [
    { id: "DP-2.1", status: "ANSWERED", value: "first why" },
    { id: "DP-2.1", status: "ANSWERED", value: "The site exists so a visitor can buy a tin." },
    { id: "DP-9.2", status: "ANSWERED", value: "old host" },
    { id: "DP-9.2", status: "ANSWERED", value: "no idea" },
  ];
  const listed = summarizeDogfood({
    answers,
    prdMarkdown: [
      "## 14. Assumptions",
      "",
      "- DP-6.2: 3. ASSUMED. Polished, not a spectacle. (SKIPPED)",
      "",
      "## 15. Out of scope / Version 2 list",
      "",
    ].join("\n"),
    libraries: ["css-scroll"],
  });
  assert.equal(listed.siteWhy, "The site exists so a visitor can buy a tin.");
  assert.equal(listed.hosting, "no idea");
  assert.equal(listed.prdHasAssumptions, true);
  assert.deepEqual(listed.motionLibraries, ["css-scroll"]);

  const empty = summarizeDogfood({
    answers,
    prdMarkdown: "## 14. Assumptions\n\nNo skipped or soft fields are on record.\n",
    libraries: [],
  });
  assert.equal(empty.prdHasAssumptions, false);

  const missing = summarizeDogfood({
    answers,
    prdMarkdown: "# PRD\n\n## 1. Summary\n",
    libraries: ["vanilla"],
  });
  assert.equal(missing.prdHasAssumptions, false);
  assert.deepEqual(missing.motionLibraries, ["vanilla"]);
});
