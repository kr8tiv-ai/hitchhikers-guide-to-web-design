import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

export const CORE_PACKS: readonly ["anti-slop", "brand-frameworks", "copywriting"] = [
  "anti-slop",
  "brand-frameworks",
  "copywriting",
];

const HYPE_WORDS = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "game-changer",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "cutting-edge",
  "journey",
  "tapestry",
  "landscape",
  "innovative",
  "passionate",
] as const;

const HYPE_PHRASES = [
  "in today's fast-paced world",
  "it's not just",
  "in a world where",
] as const;

const here = path.dirname(fileURLToPath(import.meta.url));

function packPath(name: (typeof CORE_PACKS)[number]): string {
  return path.resolve(here, "..", "packs", name, "SKILL.md");
}

function readPack(name: (typeof CORE_PACKS)[number]): string {
  return readFileSync(packPath(name), "utf8");
}

function bodyAfterFrontmatter(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  return lines.slice(close + 1).join("\n");
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function problemsOf(markdown: string): string[] {
  const problems: string[] = [];
  if (wordCount(markdown) >= 700) problems.push("over 700 words");
  if (markdown.includes("!")) problems.push("exclamation mark");
  if (markdown.includes("You are an award-winning")) problems.push("award starter");
  if (markdown.split(/\r?\n/).some((line) => /^effort\s*:/.test(line.trim()))) {
    problems.push("effort is set");
  }
  return problems;
}

function fence(markdown: string, label: string): string[] {
  const match = new RegExp("```" + label + "\\r?\\n([\\s\\S]*?)\\r?\\n```").exec(markdown);
  assert.ok(match, label);
  return (match[1] ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function withEffort(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  const next = lines.slice();
  next.splice(close, 0, "effort: high");
  return next.join("\n");
}

test("three core packs parse and make no claim errors", () => {
  for (const name of CORE_PACKS) {
    const markdown = readPack(name);
    assert.deepEqual(problemsOf(markdown), [], name);
    assert.equal(markdown.includes("%"), false, name);
    assert.equal(/\b(?:19|20)\d{2}\b/.test(markdown), false, name);
    assert.equal(markdown.includes("\u2014"), false, name);
    const meta = parsePack(markdown);
    assert.ok(meta.description.length > 0, name);
    assert.ok(meta.whenToUse.length > 0, name);
    assert.deepEqual(meta.paths, [`packages/knowledge/packs/${name}/SKILL.md`]);
    assert.deepEqual(lintPackClaims(bodyAfterFrontmatter(markdown)), [], name);
  }
});

test("anti-slop names the bans and refuses Elevate in a hero", () => {
  const markdown = readPack("anti-slop");
  const flat = markdown.replace(/\s+/g, " ");
  assert.ok(markdown.includes("magnetic"));
  assert.ok(markdown.includes("Elevate"));
  assert.ok(markdown.includes("/hh-elevate"));
  assert.match(flat, /banned in generated site body copy, including the hero/);
  assert.match(flat, /not permission to use the word in a hero/);
  assert.doesNotMatch(flat, /(?<!not )permission to use the word in a hero/);
  assert.ok(fence(markdown, "patterns").includes("magnetic buttons"));
  assert.ok(fence(markdown, "patterns").includes("three identical icon cards"));
  assert.ok(fence(markdown, "patterns").includes("lorem"));
  assert.ok(fence(markdown, "patterns").includes("invented testimonials"));
  assert.ok(fence(markdown, "patterns").includes("default Tailwind indigo look"));
  assert.ok(fence(markdown, "patterns").includes("purple-to-blue gradient"));
  assert.deepEqual(fence(markdown, "words"), [...HYPE_WORDS]);
  assert.deepEqual(fence(markdown, "phrases"), [...HYPE_PHRASES]);
});

test("brand and copy packs point at the brand files and do not invent proof", () => {
  const brand = readPack("brand-frameworks");
  const copy = readPack("copywriting");
  assert.match(brand, /BRAND\.md/);
  assert.match(brand, /VOICE\.md/);
  assert.match(brand, /purpose/i);
  assert.match(brand, /positioning/i);
  assert.match(brand, /proof/i);
  assert.match(brand, /voice/i);
  assert.match(brand, /Do not invent awards/);
  assert.match(copy, /one idea/);
  assert.match(copy, /Buttons are verbs/);
  assert.match(copy, /404/);
  assert.match(copy, /No exclamation marks/);
  assert.match(copy, /BRAND\.md/);
  assert.match(copy, /VOICE\.md/);
});

test("a pack that sets effort fails", () => {
  const markdown = withEffort(readPack("anti-slop"));
  assert.ok(problemsOf(markdown).includes("effort is set"));
  assert.throws(() => parsePack(markdown), /Set effort on the prompt, not the skill/);
});

test("word count over 700 fails", () => {
  const markdown = readPack("copywriting");
  assert.ok(wordCount(markdown) < 700);
  const padded = `${markdown}\n${Array.from({ length: 700 }, () => "word").join(" ")}\n`;
  assert.ok(problemsOf(padded).includes("over 700 words"));
});
