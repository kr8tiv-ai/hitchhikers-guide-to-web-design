import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

export const MARKET_PACKS: readonly string[] = ["seo", "sales-psychology", "award-sites"];

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

function lineWith(markdown: string, needle: string): string {
  const line = markdown.split(/\r?\n/).find((item) => item.includes(needle));
  assert.ok(line, needle);
  return line;
}

test("three market packs parse, lint, and source every number", () => {
  assert.deepEqual(MARKET_PACKS, ["seo", "sales-psychology", "award-sites"]);
  for (const name of MARKET_PACKS) {
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

test("award-sites names the sourced awards and keeps SOTD off SOTY", () => {
  const markdown = readPack("award-sites");
  assert.ok(markdown.includes("Lando Norris"));
  assert.ok(markdown.includes("SOTY 2025"));
  assert.ok(markdown.includes("CoMinVi"));
  assert.ok(markdown.includes("SOTD"));
  assert.equal(markdown.includes("SOTY 2026 winner"), false);

  const lando = lineWith(markdown, "Lando Norris");
  assert.ok(lando.includes("SOTY 2025"));
  assert.equal(lando.includes("SOTD"), false);

  const cominvi = lineWith(markdown, "CoMinVi");
  assert.ok(cominvi.includes("SOTD"));
  assert.ok(cominvi.includes("2026-09-30"));
  assert.ok(cominvi.includes("not Site of the Year"));
  assert.equal(cominvi.includes("SOTY"), false);

  const lines = markdown.split(/\r?\n/).filter((line) => line.includes("2026"));
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    const dateLine =
      line.includes("CoMinVi") && line.includes("2026-09-30") && line.includes("SOTD");
    const noWinner =
      line.includes("There is no 2026 Site of the Year yet") &&
      line.includes("SOTY 2026 was not announced as of the addendum date");
    assert.ok(dateLine || noWinner, line);
  }

  for (const claim of [lando, cominvi, lineWith(markdown, "There is no 2026 Site of the Year yet")]) {
    const body = bodyAfterFrontmatter(markdown).split(/\r?\n/);
    const index = body.findIndex((line) => line === claim);
    assert.ok(index >= 0, claim);
    const source = nextNonEmpty(body, index + 1);
    assert.ok(source?.startsWith("Source:"), claim);
    assert.match(source ?? "", /RESEARCH-ADDENDUM\.md/);
  }

  assert.ok(markdown.includes("packages/knowledge/galleries/curated.json"));
  assert.match(markdown, /Godly has no assumed API/);
  assert.match(markdown, /Do not crawl/);
  assert.doesNotMatch(markdown, /godly\.website/i);
  assert.doesNotMatch(markdown, /api\.godly/i);
  assert.doesNotMatch(markdown, /https?:\/\/[^\s)]*godly/i);
});

test("seo does not invent search volumes", () => {
  const markdown = readPack("seo");
  assert.doesNotMatch(markdown, /\d+\s+searches/);
  assert.equal(markdown.includes("%"), false);
  assert.match(markdown, /one h1/);
  assert.match(markdown, /description/);
  assert.match(markdown, /crawlable text/);
  assert.match(markdown, /Search volumes are not estimated/);
  assert.match(markdown, /does not promise that an answer engine will cite the page/);
});

test("sales does not invent persuasion percents", () => {
  const markdown = readPack("sales-psychology");
  assert.doesNotMatch(markdown, /\d+%/);
  assert.equal(markdown.includes("%"), false);
  assert.match(markdown, /offer/);
  assert.match(markdown, /Proof comes only from the user/);
  assert.match(markdown, /No dark patterns/);
  assert.match(markdown, /If a source has no number, this pack has no number/);
});
