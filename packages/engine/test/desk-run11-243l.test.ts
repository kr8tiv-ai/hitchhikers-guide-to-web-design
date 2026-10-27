/**
 * Desk Run 11 style-guide fidelity. The draft keeps the business name,
 * every owner colour, one of each section, airy display type, and real
 * section names. The model is not called.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseDirection, readDirectionDeal, saveDirectionDeal } from "../src/brand/directions.ts";
import { contrastRatio, writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { writeSectionStillPlan } from "../src/spec/section-stills.ts";
import { displayRhythm } from "../src/brand/type-conflict.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";
import { renderDesignMd, writeDesignMd } from "../src/spec/design-outputs.ts";
import { designSectionBody, lintDesignMd } from "../src/spec/design-md-lint.ts";
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
  { id: "DP-1.3", value: "Yes: \"Paradise Found. Find your calm.\"" },
  { id: "DP-1.5", value: TYPE_WISH },
  { id: "DP-2.8", value: PAGES },
  { id: "DP-5.5", value: "Bright and airy, on soft sand." },
];

const FONTS = { display: "General Sans", body: "General Sans", source: "picked direction" };

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
    "## Type",
    "",
    TYPE_WISH,
    "",
    "## Pages",
    "",
    PAGES,
    "",
    "## Cadence",
    "",
    "Yes, a small blog. One guide a month.",
    "",
    "## Limits",
    "",
    "Privacy and terms pages. Paradise Found does not give legal advice.",
    "",
    "## Tagline",
    "",
    "Yes: \"Paradise Found. Find your calm.\"",
    "",
  ].join("\n");
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

function statedPairs(markdown: string): { label: string; text: string; background: string; ratio: number }[] {
  const pairs: { label: string; text: string; background: string; ratio: number }[] = [];
  for (const match of markdown.matchAll(/([A-Za-z][\w -]*?) text (#[0-9a-fA-F]{6}) on (#[0-9a-fA-F]{6}) at ([0-9.]+) to 1/g)) {
    pairs.push({
      label: match[1] ?? "",
      text: (match[2] ?? "").toLowerCase(),
      background: (match[3] ?? "").toLowerCase(),
      ratio: Number(match[4]),
    });
  }
  return pairs;
}

test("display rhythm follows the type wish, and only the type wish", () => {
  const open = displayRhythm(TYPE_WISH, "General Sans");
  assert.deepEqual(open.words, ["light", "wide", "airy"]);
  assert.equal(open.letterSpacing, "0.06em");
  assert.equal(open.lineHeight, "1.15");
  assert.equal(open.fontWeight, "300");
  assert.equal(Number(open.headingLetterSpacing.replace("em", "")) >= 0, true);
  assert.ok(Number(open.headingLineHeight) > 1.05);

  const segment = displayRhythm(TYPE_WISH, "Segment");
  assert.equal(segment.letterSpacing, "0.06em");
  assert.equal(segment.fontWeight, null);

  const tight = displayRhythm("A plain grotesque for headings.", "General Sans");
  assert.deepEqual(tight.words, []);
  assert.equal(tight.letterSpacing, "-0.03em");
  assert.equal(tight.lineHeight, "0.95");
  assert.equal(tight.fontWeight, null);

  const wideOnly = displayRhythm("A wide sans for headings.", "General Sans");
  assert.equal(wideOnly.letterSpacing, "0.06em");
  assert.equal(wideOnly.lineHeight, "1.1");
  assert.equal(wideOnly.fontWeight, null);
});

test("a logo that says wide caps does not open the display when the type wish does not", () => {
  const design = renderDesignMd(
    "# Site\n\n## Logo\n\nPARADISE FOUND in wide caps.\n\n## Vibe\n\nBright and airy, on soft sand.\n",
    [{ id: "DP-1.5", value: "A plain grotesque for headings." }],
  );
  assert.match(design, /name: "Paradise Found"/);
  assert.match(design, /letterSpacing: "-0\.03em"/);
  assert.match(design, /lineHeight: "0\.95"/);
  assert.doesNotMatch(design, /fontWeight:/);
  assert.equal(design.includes("!"), false);
});

test("the project title is the style-guide name only when the brief names nobody", () => {
  const named = renderDesignMd("A quiet studio with a clear first frame.", [], null, "North Shore Studio");
  assert.match(named, /name: "North Shore Studio"/);
  const fallback = renderDesignMd("A quiet studio with a clear first frame.");
  assert.match(fallback, /name: "Site"/);
});

test("Run 11 draft names the business, keeps the five colours, and drops stub sections", () => {
  const brief = run11Brief();
  const design = renderDesignMd(brief, ANSWERS, FONTS, "Paradise Found Run Eleven C");
  assert.equal(lintDesignMd(design).ok, true);
  assert.match(design, /name: "Paradise Found"/);
  assert.doesNotMatch(design, /name: "Site"/);
  assert.doesNotMatch(design, /Run Eleven/);
  assert.equal(design.includes("!"), false);
  assert.equal(/\n## Color\n/.test(design), false);
  assert.equal(design.includes("## Type scale"), false);
  assert.equal(design.includes("See Colors."), false);
  assert.equal(design.includes("See Typography."), false);
  assert.equal(designSectionBody(design, "Color"), designSectionBody(design, "Colors"));
  assert.equal(designSectionBody(design, "Type scale"), designSectionBody(design, "Typography"));

  const doubled = design.replace("## Typography", "## Color\n\nSee Colors.\n\n## Typography");
  const report = lintDesignMd(doubled);
  assert.equal(report.ok, false);
  assert.equal(report.errors.some((error) => error.rule === "duplicate-section"), true);

  for (const name of ["jungle green", "sunset gold", "ocean blue", "soft sand", "near-black green"]) {
    assert.match(design.toLowerCase(), new RegExp(name));
  }
  for (const token of [
    'soft-sand: "#f3e6d0"',
    'near-black-green: "#14241c"',
    'sunset-gold: "#8a6a12"',
    'jungle-green: "#1f6b4a"',
    'ocean-blue: "#1d4e89"',
  ]) {
    assert.equal(design.includes(token), true, token);
  }
  assert.match(design, /Soft sand #f3e6d0 is the page colour, mapped to paper\./);
  assert.match(design, /not a colour the owner named/);
  const gold = contrastRatio("#8a6a12", "#f3e6d0");
  assert.ok(gold >= 3 && gold < 4.5);
  assert.match(design, new RegExp(`Sunset gold #8a6a12 is the accent\\. Contrast with the page #f3e6d0 is ${gold.toFixed(2)} to 1`));
  assert.match(design, /passes AA for large text/);
  assert.match(design, /does not pass AA for body text/);
  assert.doesNotMatch(design, /Sunset gold text #/);

  const pairs = statedPairs(design);
  assert.ok(pairs.length >= 3);
  const labels = pairs.map((pair) => pair.label.toLowerCase());
  assert.equal(labels.some((label) => label.includes("jungle green")), true);
  assert.equal(labels.some((label) => label.includes("ocean blue")), true);
  assert.equal(labels.some((label) => label.includes("sunset gold")), false);
  for (const pair of pairs) {
    const actual = contrastRatio(pair.text, pair.background);
    assert.ok(actual >= 4.5, `${pair.label} ${pair.text} on ${pair.background} is ${actual}`);
    assert.ok(Math.abs(pair.ratio - actual) <= 0.01, pair.label);
  }
  const button = pairs.find((pair) => pair.label === "Button");
  assert.ok(button);
  assert.ok(button.ratio >= 4.5);

  assert.match(design, /letterSpacing: "0\.06em"/);
  assert.match(design, /lineHeight: "1\.15"/);
  assert.match(design, /fontWeight: "300"/);
  assert.doesNotMatch(design, /-0\.03em/);
  assert.doesNotMatch(design, /lineHeight: "0\.95"/);
  const typography = designSectionBody(design, "Typography") ?? "";
  assert.match(typography, /light, wide, airy/);
  assert.match(typography, /owner's words/);

  const dir = mkdtempSync(path.join(tmpdir(), "hh-243l-"));
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(path.join(hitch, "project.json"), `${JSON.stringify({ name: "Paradise Found Run Eleven C" })}\n`, "utf8");
    writeDesignMd(dir, brief, ANSWERS, FONTS);
    const written = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.match(written, /name: "Paradise Found"/);
    assert.doesNotMatch(written, /Run Eleven/);

    advanceDesignStages(dir, { brief, answers: ANSWERS });
    const sitemap = readFileSync(path.join(hitch, "sitemap.md"), "utf8");
    assert.doesNotMatch(sitemap, /-main\b/);
    assert.deepEqual(pageSections(sitemap, "Live on the Land"), ["caretaker-program", "sign-up"]);
    assert.deepEqual(pageSections(sitemap, "Contact"), ["contact-form"]);
    assert.deepEqual(pageSections(sitemap, "Blog"), ["guide-list"]);
    assert.deepEqual(pageSections(sitemap, "Privacy"), ["policy"]);
    assert.deepEqual(pageSections(sitemap, "Terms"), ["policy"]);
    assert.deepEqual(pageSections(sitemap, "About"), ["story"]);
    assert.deepEqual(pageSections(sitemap, "Eco-Building and Food"), ["eco-building-and-food"]);
    for (const section of ["grid", "map", "filters"]) {
      assert.equal(pageSections(sitemap, "Farms").includes(section), true, section);
    }
    for (const section of ["gallery", "specs", "map", "inquiry"]) {
      assert.equal(pageSections(sitemap, "Farm detail").includes(section), true, section);
    }
    for (const section of ["steps", "glossary"]) {
      assert.equal(pageSections(sitemap, "How Buying Works").includes(section), true, section);
    }

    advanceDesignStages(dir, { brief, answers: ANSWERS, approval: { stage: "sitemap", text: "Approved." } });
    const wireframe = readFileSync(path.join(hitch, "wireframe.md"), "utf8");
    assert.doesNotMatch(wireframe, /-main\b/);
    for (const title of ["Live on the Land", "Contact", "Blog", "Privacy", "Terms", "About", "Eco-Building and Food"]) {
      assert.deepEqual(wireSections(wireframe, title), pageSections(sitemap, title), title);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("prepare steps keep a picked direction and write its families into still prompts", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-243q-direction-"));
  try {
    const brief = run11Brief();
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(path.join(hitch, "SITE-BRIEF.md"), brief, "utf8");
    writeFileSync(path.join(hitch, "project.json"), `${JSON.stringify({ name: "Paradise Found" })}\n`, "utf8");
    writeBrandKit(dir, ANSWERS);
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
    chooseDirection(dir, first.id, "The direction fits the farms.");
    writeSectionStillPlan(dir, brief, ANSWERS, [
      { id: "home", title: "Home", route: "/", sections: ["hero", "farms"], contentSources: ["src/data/home.ts"] },
    ]);
    writeBrandKit(dir, ANSWERS);
    writeDesignMd(dir, brief, ANSWERS);
    const kept = readDirectionDeal(dir);
    assert.equal(kept?.pickedId, first.id);
    const design = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.match(design, /Families: General Sans\. Source: picked direction\./);
    assert.equal(design.includes("Boska"), false);
    const brand = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    const type = /## Type\n\n([\s\S]*?)\n## /.exec(brand)?.[1] ?? "";
    assert.match(type, /Picked families: General Sans\./);
    assert.equal(type.includes("Boska"), false);
    const source = readFileSync(path.join(dir, "src", "data", "brand.ts"), "utf8");
    assert.match(source, /display: "General Sans"/);
    assert.match(source, /body: "General Sans"/);
    const slots = readFileSync(path.join(dir, ".hitchhiker", "assets", "slots.json"), "utf8");
    assert.match(slots, /Families: General Sans\./);
    assert.equal(slots.includes("Boska"), false);
  } finally {
    removeTempDir(dir);
  }
});
