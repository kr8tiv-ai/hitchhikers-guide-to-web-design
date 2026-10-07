import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

export const DESIGN_PACKS: readonly string[] = [
  "typography",
  "color",
  "ux-conversion",
  "a11y",
];

const PAIRINGS = [
  "Bebas Neue",
  "Barlow",
  "Space Grotesk",
  "Inter",
  "DM Serif Display",
  "DM Sans",
  "Fraunces",
  "Work Sans",
  "Archivo Black",
  "Archivo",
  "Clash Display",
  "Satoshi",
] as const;

const here = path.dirname(fileURLToPath(import.meta.url));

function packPath(name: string): string {
  return path.resolve(here, "..", "packs", name, "SKILL.md");
}

function readPack(name: string): string {
  return readFileSync(packPath(name), "utf8");
}

function bodyAfterFrontmatter(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  return lines.slice(close + 1).join("\n");
}

function nextNonEmpty(lines: readonly string[], start: number): string | undefined {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") return line;
  }
  return undefined;
}

function unsourcedNumbers(markdown: string): string[] {
  const lines = bodyAfterFrontmatter(markdown).split(/\r?\n/);
  const problems: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trimStart().startsWith("Source:")) continue;
    if (!/\d/.test(line)) continue;
    const next = nextNonEmpty(lines, i + 1);
    if (next === undefined || !next.trimStart().startsWith("Source:")) {
      problems.push(line.trim());
    }
  }
  return problems;
}

function withEffort(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  const next = lines.slice();
  next.splice(close, 0, "effort: high");
  return next.join("\n");
}

test("four design packs parse, lint, and source every number", () => {
  assert.deepEqual(DESIGN_PACKS, ["typography", "color", "ux-conversion", "a11y"]);
  for (const name of DESIGN_PACKS) {
    const markdown = readPack(name);
    assert.equal(markdown.includes("!"), false, name);
    assert.equal(markdown.includes("\u2014"), false, name);
    assert.equal(
      markdown.split(/\r?\n/).some((line) => /^effort\s*:/.test(line.trim())),
      false,
      name,
    );
    const meta = parsePack(markdown);
    assert.ok(meta.description.length > 0, name);
    assert.ok(meta.whenToUse.length > 0, name);
    assert.deepEqual(meta.paths, [`packages/knowledge/packs/${name}/SKILL.md`]);
    assert.deepEqual(lintPackClaims(bodyAfterFrontmatter(markdown)), [], name);
    assert.deepEqual(unsourcedNumbers(markdown), [], name);
  }
});

test("typography says two families and treats the six pairings as examples", () => {
  const markdown = readPack("typography");
  assert.match(markdown, /two families/);
  assert.match(markdown, /examples, not mandates/);
  assert.match(markdown, /clamp\(\)/);
  assert.match(markdown, /Do not download font files/);
  for (const name of PAIRINGS) {
    assert.ok(markdown.includes(name), name);
  }
});

test("color states the mixed-research caveat and does not assign one emotion", () => {
  const markdown = readPack("color");
  assert.match(markdown, /meaning is not universal/);
  assert.match(markdown, /the research is mixed/);
  assert.match(markdown, /does not carry one emotion/);
  assert.match(markdown, /red does not always mean danger/);
  assert.match(markdown, /60-30-10/);
  assert.match(markdown, /not a law of perception/);
  assert.match(markdown, /4\.5 to 1/);
  assert.match(markdown, /3 to 1/);
});

test("ux-conversion has no conversion percent", () => {
  const markdown = readPack("ux-conversion");
  assert.doesNotMatch(markdown, /\d+%/);
  assert.equal(markdown.includes("%"), false);
  assert.match(markdown, /one primary action/);
  assert.match(markdown, /No dark patterns/);
  assert.match(markdown, /No fake countdown/);
  assert.match(markdown, /inputmode/);
  assert.match(markdown, /autocomplete/);
  assert.match(markdown, /Do not invent a conversion rate/);
});

test("a11y names contrast, target size, and reduced motion", () => {
  const markdown = readPack("a11y");
  assert.ok(markdown.includes("44"));
  assert.ok(markdown.includes("prefers-reduced-motion"));
  assert.ok(markdown.includes("4.5"));
  assert.match(markdown, /3 to 1/);
  assert.match(markdown, /keyboard/i);
  assert.match(markdown, /Focus stays visible/);
  assert.match(markdown, /Every control has a name/);
  assert.match(markdown, /WCAG 2\.2/);
  assert.match(markdown, /target-size` is not that floor/);
});

test("a pack with effort frontmatter fails", () => {
  const markdown = withEffort(readPack("a11y"));
  assert.throws(() => parsePack(markdown), /Set effort on the prompt, not the skill/);
});
