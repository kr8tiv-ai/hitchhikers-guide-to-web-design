/**
 * Desk Run 11 re-test. Pre-build checks, the style guide, and the brand
 * type record use the resolved family and weight. Colour lines name the
 * source they actually have. Filters sit before a grid or a map.
 * The model is not called.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseDirection, readDirectionDeal, saveDirectionDeal, type Direction } from "../src/brand/directions.ts";
import { writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";
import { renderDesignMd, resolveDesignType } from "../src/spec/design-outputs.ts";
import { designSectionBody } from "../src/spec/design-md-lint.ts";
import { runPrebuildChecks, type PrebuildCheck } from "../src/spec/prebuild-checks.ts";
import { removeTempDir } from "./remove-temp.ts";

const COLOURS =
  "Jungle green, sunset gold, and ocean blue, from the hero photo, plus soft sand and a near-black green. Sunset gold is the accent. Soft sand is the page.";
const TYPE_WISH =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const PAGES =
  "Pages: Home; Farms (grid plus map, filters, a detail page per farm with gallery, specs, map and prefilled inquiry); Live on the Land (caretaker program with sign-up form); How Buying Works (steps with independent lawyers, glossary: folio real, plano catastrado, escritura, ZMT); Eco-Building and Food; About; Contact. Footer: legal disclaimer, privacy, EN/ES switch, newsletter.";

const ANSWERS = [
  { id: "DP-1.1", value: "PARADISE FOUND in wide caps." },
  { id: "DP-1.2", value: COLOURS },
  { id: "DP-1.5", value: TYPE_WISH },
  { id: "DP-2.7", value: "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers." },
  { id: "DP-2.8", value: PAGES },
  { id: "DP-5.5", value: "Bright and airy, on soft sand." },
  { id: "DP-5.6", value: "Photography." },
  { id: "DP-6.2", value: "4." },
];

const BOSKA_PAIR = { display: "Boska", body: "General Sans", source: "picked direction" };
const HEADING =
  "Headings use General Sans at a light weight with wide tracking, from the owner's wish for light, wide, airy sans for headings like the logo.";

function project(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function run11Brief(): string {
  return [
    "# Site Brief",
    "",
    "## Offer",
    "",
    "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers.",
    "",
    "## Logo",
    "",
    "PARADISE FOUND in wide caps.",
    "",
    "## Colours",
    "",
    COLOURS,
    "",
    "## Pages",
    "",
    PAGES,
    "",
    "## Vibe",
    "",
    "Bright and airy, on soft sand. It should never be salesy.",
    "",
  ].join("\n");
}

function approve(dir: string, markdown: string, answers: readonly { id: string; value: string; status?: string }[]): void {
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(path.join(hitch, "SITE-BRIEF.md"), markdown, "utf8");
  writeFileSync(path.join(hitch, "interview.json"), `${JSON.stringify(answers)}\n`, "utf8");
}

function pageSections(sitemap: string, title: string): string[] {
  const lines = sitemap.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`- ${title} at `));
  assert.ok(start >= 0, title);
  const sections: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^- /.test(line) || /^## /.test(line)) break;
    if (/^\s+-\s+/.test(line)) sections.push(line.replace(/^\s+-\s+/, "").trim());
  }
  return sections;
}

function wireSections(wireframe: string, title: string): string[] {
  const chunk = wireframe.split(`## ${title}\n`)[1]?.split(/^## /m)[0] ?? "";
  return [...chunk.matchAll(/\| ([^|\n]+?)\s+\|/g)].map((match) => (match[1] ?? "").trim()).filter((label) => label !== "");
}

function pinBoska(dir: string): void {
  const dealt = readDirectionDeal(dir);
  assert.ok(dealt);
  const first = dealt.directions[0];
  assert.ok(first);
  saveDirectionDeal(dir, {
    pickedId: null,
    directions: dealt.directions.map((direction, index) =>
      index === 0 ? { ...direction, display: "Boska", body: "General Sans" } : direction,
    ),
  });
  chooseDirection(dir, first.id, "The direction's display is Boska.");
}

function byId(checks: readonly PrebuildCheck[]): Map<string, PrebuildCheck> {
  return new Map(checks.map((check) => [check.id, check]));
}

function checkText(check: PrebuildCheck | undefined): string {
  assert.ok(check);
  return `${check.detail}\n${check.findings.join("\n")}`;
}

function minimalDirection(display: string, body: string): Direction {
  return {
    id: "dir-sample",
    name: "A studied page",
    description: "One direction is enough for a check.",
    citationId: "sample",
    title: "A studied page",
    url: "https://example.com/",
    display,
    body,
    sectionOrder: ["hero"],
    hue: "#14241c",
  };
}

test("pre-build checks name the resolved General Sans weight while the direction still says Boska", () => {
  const dir = project("hh-243m-checks-");
  try {
    const markdown = run11Brief();
    approve(dir, markdown, ANSWERS);
    writeBrandKit(dir, ANSWERS);
    pinBoska(dir);
    const picked = readDirectionDeal(dir);
    const chosen = picked?.directions.find((direction) => direction.id === picked.pickedId);
    assert.equal(chosen?.display, "Boska");
    assert.equal(chosen?.body, "General Sans");

    const report = runPrebuildChecks(markdown, dir);
    const checks = byId(report.checks);
    const phone = checks.get("phone");
    const look = checks.get("ai-look");
    const type = checks.get("type");
    assert.ok(phone);
    assert.ok(look);
    assert.ok(type);
    assert.equal(phone.findings[0], "General Sans estimates 28000 bytes.");
    assert.equal(phone.findings[0]?.includes(" and "), false);
    assert.equal(look.findings.some((line) => line === "General Sans x-height 0.734. Readable at body size."), true);
    assert.deepEqual(type.findings, [
      "General Sans.",
      "Weights: General Sans wght 300.",
      "x-height 0.734.",
    ]);
    assert.equal(type.status, "pass");
    for (const check of [phone, look, type]) {
      assert.equal(checkText(check).includes("Boska"), false, check.id);
      assert.equal(checkText(check).includes("0.678"), false, check.id);
      assert.equal(checkText(check).includes("one weight"), false, check.id);
      assert.equal(checkText(check).includes("22000"), false, check.id);
    }
    assert.equal(JSON.stringify(report).includes("Boska"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the style guide, the brand type record, and a later check agree, and filters precede results", () => {
  const dir = project("hh-243m-guide-");
  try {
    const markdown = run11Brief();
    approve(dir, markdown, ANSWERS);
    writeBrandKit(dir, ANSWERS);
    pinBoska(dir);

    advanceDesignStages(dir, { brief: markdown, answers: ANSWERS });
    advanceDesignStages(dir, { brief: markdown, answers: ANSWERS, approval: { stage: "sitemap", text: "Approved." } });
    const sitemap = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    const wireframe = readFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "utf8");
    const farms = pageSections(sitemap, "Farms");
    const detail = pageSections(sitemap, "Farm detail");
    assert.ok(farms.indexOf("filters") >= 0 && farms.indexOf("filters") < farms.indexOf("grid"), farms.join(", "));
    assert.ok(farms.indexOf("filters") < farms.indexOf("map"), farms.join(", "));
    assert.deepEqual(wireSections(wireframe, "Farms"), farms);
    assert.equal(detail.includes("filters"), false, detail.join(", "));
    assert.ok(detail.indexOf("gallery") >= 0 && detail.indexOf("gallery") < detail.indexOf("map"), detail.join(", "));
    assert.deepEqual(wireSections(wireframe, "Farm detail"), detail);

    advanceDesignStages(dir, { brief: markdown, answers: ANSWERS, approval: { stage: "wireframe", text: "Approved." } });
    const design = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.equal(design.includes("Boska"), false);
    assert.equal(design.includes("!"), false);
    const typography = designSectionBody(design, "Typography") ?? "";
    assert.match(typography, /Headings use General Sans at a light weight with wide tracking/);
    assert.match(typography, /owner's wish for light, wide, airy sans for headings like the logo/);
    assert.equal(typography.includes(HEADING), true);
    assert.equal(typography.includes("win over"), false);
    assert.match(design, /fontWeight: "300"/);
    assert.match(design, /Families: General Sans\. Source: picked direction\./);

    const colors = designSectionBody(design, "Colors") ?? "";
    assert.equal(colors.includes("Source: brand kit"), false);
    assert.match(colors, /Paper #f3e6d0 carries ink #14241c\. Source: owner \(DP-1\.2\)\./);
    assert.match(colors, /Accent #8a6a12 is for large text and marks\. Source: owner \(DP-1\.2\)\./);
    assert.match(colors, /Muted #5c6570 is for secondary text\. Source: derived for contrast\./);
    assert.match(colors, /Soft sand #f3e6d0 is the page colour, mapped to paper\. Source: owner \(DP-1\.2\)\./);
    assert.match(colors, /Muted #5c6570 is not a colour the owner named/);
    const tokens = design.match(/Color tokens: (.+)/)?.[1] ?? "";
    for (const token of [
      "paper #f3e6d0 Source: owner (DP-1.2)",
      "ink #14241c Source: owner (DP-1.2)",
      "accent #8a6a12 Source: owner (DP-1.2)",
      "muted #5c6570 Source: derived for contrast",
      "soft-sand #f3e6d0 Source: owner (DP-1.2)",
      "near-black-green #14241c Source: owner (DP-1.2)",
      "sunset-gold #8a6a12 Source: owner (DP-1.2)",
      "jungle-green #1f6b4a Source: owner (DP-1.2)",
      "ocean-blue #1d4e89 Source: owner (DP-1.2)",
    ]) {
      assert.equal(tokens.includes(token), true, token);
    }
    assert.equal(tokens.includes("brand kit"), false);

    const brand = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    const recorded = /## Type\n\n([\s\S]*?)\n## /.exec(brand)?.[1] ?? "";
    assert.match(recorded, /Picked families: General Sans\./);
    assert.match(recorded, /Display weight: 300\./);
    assert.equal(recorded.includes("Boska"), false);
    assert.equal(recorded.includes("owner's words win"), false);

    const report = runPrebuildChecks(markdown, dir);
    const type = byId(report.checks).get("type");
    const phone = byId(report.checks).get("phone");
    assert.ok(type);
    assert.ok(phone);
    assert.deepEqual(type.findings, [
      "General Sans.",
      "Weights: General Sans wght 300.",
      "x-height 0.734.",
    ]);
    assert.equal(phone.findings[0], "General Sans estimates 28000 bytes.");
    assert.equal(JSON.stringify(report).includes("Boska"), false);
    const resolved = resolveDesignType(markdown, ANSWERS, BOSKA_PAIR);
    assert.equal(resolved.display, "General Sans");
    assert.equal(resolved.body, "General Sans");
    assert.equal(resolved.rhythm.fontWeight, "300");
    assert.equal(resolved.replaced, true);
  } finally {
    removeTempDir(dir);
  }
});

test("an owner override that is not a catalog pair still passes, and an unknown pair still fails", () => {
  const overridden = project("hh-243m-override-");
  const unknown = project("hh-243m-unknown-");
  const single = project("hh-243m-single-");
  try {
    const wish = "Light, wide, airy sans for headings like the logo.";
    const brief = "# Site Brief\n\n## Offer\n\nA quiet page.\n";
    const answers = [{ id: "DP-1.5", value: wish }];
    const resolved = resolveDesignType(brief, answers, { display: "Boska", body: "Sentient", source: "picked direction" });
    assert.equal(resolved.replaced, true);
    assert.notEqual(resolved.display, "Boska");
    assert.equal(resolved.body, "Sentient");
    approve(overridden, brief, answers);
    saveDirectionDeal(overridden, { pickedId: "dir-sample", directions: [minimalDirection("Boska", "Sentient")] });
    const report = runPrebuildChecks(brief, overridden);
    const type = byId(report.checks).get("type");
    const phone = byId(report.checks).get("phone");
    assert.ok(type);
    assert.ok(phone);
    assert.equal(type.status, "pass");
    assert.equal(type.detail.includes("not a library pair"), false);
    assert.equal(type.detail.includes("Boska"), false);
    assert.match(type.detail, new RegExp(resolved.display));
    assert.match(type.detail, /Sentient/);
    assert.match(type.detail, /Weights:/);
    assert.match(phone.detail, new RegExp(`${resolved.display} and Sentient estimate \\d+ and \\d+ bytes`));
    assert.equal(phone.detail.includes("Boska"), false);

    approve(unknown, brief, [{ id: "DP-1.5", value: "Keep it quiet." }]);
    saveDirectionDeal(unknown, { pickedId: "dir-sample", directions: [minimalDirection("Not A Font", "Also Missing")] });
    const missed = byId(runPrebuildChecks(brief, unknown).checks).get("type");
    assert.ok(missed);
    assert.equal(missed.status, "fail");
    assert.equal(missed.findings[0], "Not A Font and Also Missing are not a library pair.");

    saveDirectionDeal(single, { pickedId: "dir-sample", directions: [minimalDirection("Not A Font", "Not A Font")] });
    const alone = byId(runPrebuildChecks(brief, single).checks).get("type");
    assert.ok(alone);
    assert.equal(alone.status, "fail");
    assert.equal(alone.findings[0], "Not A Font is not a library pair.");
  } finally {
    removeTempDir(overridden);
    removeTempDir(unknown);
    removeTempDir(single);
  }
});

test("each colour states its real source, and an uploaded kit is the only brand-kit source", () => {
  const owner = renderDesignMd(run11Brief(), ANSWERS, BOSKA_PAIR);
  assert.equal(owner.includes("Boska"), false);
  const ownerColors = designSectionBody(owner, "Colors") ?? "";
  assert.equal(ownerColors.includes("Source: brand kit"), false);
  assert.match(ownerColors, /Source: owner \(DP-1\.2\)/);
  assert.match(ownerColors, /Muted #5c6570 is for secondary text\. Source: derived for contrast\./);

  const suggested = renderDesignMd(
    run11Brief(),
    ANSWERS.map((answer) => (answer.id === "DP-1.2" ? { ...answer, status: "SUGGESTED" } : answer)),
    BOSKA_PAIR,
  );
  const suggestedColors = designSectionBody(suggested, "Colors") ?? "";
  assert.match(suggestedColors, /Source: owner \(DP-1\.2\)/);
  assert.equal(suggestedColors.includes("Source: brand kit"), false);

  const imported = renderDesignMd(
    run11Brief(),
    ANSWERS.map((answer) => (answer.id === "DP-1.2" ? { ...answer, status: "IMPORTED" } : answer)),
    BOSKA_PAIR,
  );
  const importedColors = designSectionBody(imported, "Colors") ?? "";
  assert.match(importedColors, /Paper #f3e6d0 carries ink #14241c\. Source: brand kit\./);
  assert.match(importedColors, /Accent #8a6a12 is for large text and marks\. Source: brand kit\./);
  assert.match(importedColors, /Muted #5c6570 is for secondary text\. Source: derived for contrast\./);
  assert.match(importedColors, /Jungle green text #1f6b4a on #f3e6d0 at \d+(?:\.\d+)? to 1\. Source: brand kit\./);
  assert.equal(importedColors.includes("Source: owner (DP-1.2)"), false);
  const importedTokens = imported.match(/Color tokens: (.+)/)?.[1] ?? "";
  assert.match(importedTokens, /paper #f3e6d0 Source: brand kit/);
  assert.match(importedTokens, /muted #5c6570 Source: derived for contrast/);
  assert.equal(importedTokens.includes("Source: owner (DP-1.2)"), false);
  assert.equal(imported.includes("Boska"), false);
});
