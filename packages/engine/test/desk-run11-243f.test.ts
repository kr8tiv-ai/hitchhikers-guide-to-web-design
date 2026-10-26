/**
 * Desk Run 11 plan fixes. The picked direction reaches the kit and the
 * queued prompts. Style lines follow the approved brief. Owner text is
 * not cut mid-word. The Imagine stem is a picture, not a budget.
 * The model is not called.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseDirection, readDirectionDeal } from "../src/brand/directions.ts";
import { brandKitFromAnswers } from "../src/brand/kit-from-interview.ts";
import { draftBriefPlan, prepareSiteBuild } from "../src/guide/site-build.ts";
import { directionAcceptance, translateBrief } from "../src/spec/art-direction.ts";
import { removeTempDir } from "./remove-temp.ts";

const TYPE_ANSWER =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const LIGHT_ANSWER = "Bright and airy, on soft sand.";
const COLOURS =
  "Jungle green, sunset gold, and ocean blue, from the hero photo, plus soft sand and a near-black green. Sunset gold is the accent. Soft sand is the page.";
const REFERENCES =
  "Patagonia: love. Big quiet photography and plain type. Aesop: love. Restraint, lots of empty space, small calm type. Kinfolk: love. Slow editorial scroll and soft color. Airbnb Luxe: love. Cereal: meh, too cold.";
const IMAGERY =
  'Photography. A mix: my own hero; free open-license stock for the non-farm pages, captioned as not a listed farm; farm pages show only the hero crop labelled "Photos coming soon" until I photograph them; AI stills only to fill gaps. Up to 50 dollars total for AI stills; no video. No video at launch.';
const LOGO =
  "Logo file paradise-found-logo.png: a thin crescent arc over a horizon line, PARADISE FOUND in wide caps, and 'Find your calm.' under it. I'm happy with it. Maybe a white version for dark backgrounds.";
const OFFER =
  "Ocean-view farms in Costa Rica are sold direct, with free caretakers and independent lawyers.";

const RUN11_ANSWERS = [
  { id: "DP-2.7", value: OFFER },
  { id: "DP-1.5", value: TYPE_ANSWER },
  { id: "DP-1.2", value: COLOURS },
  { id: "DP-5.1", value: "Patagonia: big quiet photography and plain type." },
  { id: "DP-5.2", value: REFERENCES },
  { id: "DP-5.5", value: LIGHT_ANSWER },
  { id: "DP-5.6", value: "Photography." },
  { id: "DP-6.2", value: "4." },
];

const SOURCING = /open-license|50 dollars|No video|\bA mix:|\bmy own\b|fill gaps|\bstock\b/i;

function run11Brief(): string {
  return [
    "# Site Brief",
    "",
    "## Offer",
    "",
    OFFER,
    "",
    "## Vibe",
    "",
    "The feel is calm, warm, and honest. It should never be salesy, cluttered, or loud.",
    "",
    "## References",
    "",
    REFERENCES,
    "",
    "## Motion",
    "",
    "Motion appetite is 4 of 10. Gentle parallax plays on the hero photo only. Farm cards fade in one after another at about 400 ms.",
    "",
    "## Imagery",
    "",
    IMAGERY,
    "",
    "## Colours",
    "",
    COLOURS,
    "",
    "## Logo",
    "",
    LOGO,
    "",
    "## Pages",
    "",
    "Home. Farms: a grid and a detail page.",
    "",
    "## Hosting",
    "",
    "Cloudflare Pages.",
    "",
  ].join("\n");
}

function field(lines: readonly string[], label: string): string {
  const prefix = `${label}:`;
  const line = lines.find((item) => item.startsWith(prefix));
  assert.ok(line, label);
  return line.slice(prefix.length).trim();
}

function quoted(source: string, key: string): string {
  const match = new RegExp(`${key}: ("(?:\\\\.|[^"\\\\])*")`).exec(source);
  assert.ok(match?.[1], key);
  return JSON.parse(match[1]) as string;
}

function project(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function approve(dir: string, markdown: string): void {
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(path.join(hitch, "SITE-BRIEF.md"), markdown, "utf8");
  writeFileSync(
    path.join(hitch, "brief-yes.json"),
    `${JSON.stringify({ approved: true, at: "2026-10-26T16:07:13.039Z" })}\n`,
    "utf8",
  );
  writeFileSync(path.join(hitch, "interview.json"), `${JSON.stringify(RUN11_ANSWERS)}\n`, "utf8");
}

function promptFiles(dir: string): string[] {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  return readdirSync(folder)
    .filter((name) => /^\d{3}\.md$/.test(name))
    .sort()
    .map((name) => path.join(folder, name));
}

function artPromptFile(dir: string): string {
  const found = promptFiles(dir).find((file) => readFileSync(file, "utf8").includes("REQ-ART-DIRECTION"));
  assert.ok(found, "art prompt");
  return found;
}

test("Run 11 style lines come from the approved brief and are not cut mid-word", () => {
  const art = translateBrief(run11Brief(), RUN11_ANSWERS, ["hero"]);
  const lines = directionAcceptance(art);
  const typeVoice = field(lines, "Type voice");
  const light = field(lines, "Light");
  const grade = field(lines, "Color grade");
  const world = field(lines, "Style world");
  const imagery = field(lines, "Imagery");
  const logo = field(lines, "Logo");
  assert.match(typeVoice, /Light, wide, airy sans for headings/);
  assert.match(typeVoice, /Syne/);
  assert.match(typeVoice, /Spline Sans/);
  assert.doesNotMatch(typeVoice, /\bserif\b/i);
  assert.equal(light, "Bright and airy, on soft sand.");
  assert.match(grade, /soft sand/i);
  assert.match(grade, /sunset gold/i);
  assert.doesNotMatch(grade, /A warm film grade/);
  assert.match(world, /Big quiet photography/);
  assert.match(world, /plain type/);
  assert.doesNotMatch(world, /^editorial\.?$/i);
  assert.match(imagery, /Photography/);
  assert.match(imagery, /not a listed farm/);
  assert.doesNotMatch(imagery, /un Generated/);
  assert.doesNotMatch(imagery, /soon" un/);
  assert.match(logo, /I'm happy with it/);
  assert.doesNotMatch(logo, /white version fo/);
  assert.doesNotMatch(logo, /fo Motion/);
  const hero = art.sections.find((section) => section.sectionId === "hero");
  assert.ok(hero);
  assert.doesNotMatch(hero.layout, /serif/i);
  assert.doesNotMatch(hero.media, /warm film grade/i);
  for (const line of lines) assert.match(line, /[.?!]$/);
  const joined = lines.join(" ");
  assert.doesNotMatch(joined, /un Generated/);
  assert.doesNotMatch(joined, /white version fo/);
  assert.doesNotMatch(joined, /fo Motion/);
});

test("a silent brief uses the picked direction for style, grade, and families", () => {
  const art = translateBrief("# Site Brief\n\n## Pages\n\nPages: Home.\n", [], ["hero"], {
    display: "Boska",
    body: "General Sans",
    hue: "#1f6b4a",
    name: "Big quiet photography",
  });
  const lines = directionAcceptance(art);
  assert.match(field(lines, "Style world"), /Big quiet photography/);
  assert.match(field(lines, "Color grade"), /#1f6b4a/);
  const typeVoice = field(lines, "Type voice");
  assert.match(typeVoice, /Boska/);
  assert.match(typeVoice, /General Sans/);
});

test("the Imagine stem keeps the picture and leaves sourcing and budget in Imagery", () => {
  const kit = brandKitFromAnswers(
    [
      { id: "DP-5.5", value: LIGHT_ANSWER },
      { id: "DP-5.6", value: "Photography." },
      { id: "DP-1.2", value: COLOURS },
    ],
    undefined,
    ["# Site Brief", "", "## Imagery", "", IMAGERY, "", "## Colours", "", COLOURS, ""].join("\n"),
  );
  const stem = /Imagine prompt stem: (.+)/.exec(kit.markdown)?.[1] ?? "";
  assert.match(kit.markdown, /open-license/);
  assert.match(kit.markdown, /50 dollars/);
  assert.match(kit.markdown, /No video/);
  assert.match(stem, /Photography/);
  assert.match(stem, /Light: Bright and airy, on soft sand/);
  assert.match(stem, /Grade:/);
  assert.match(stem, /Never show:/);
  assert.doesNotMatch(stem, SOURCING);
  assert.equal(quoted(kit.moduleSource, "imagineStem"), stem);
  assert.doesNotMatch(quoted(kit.moduleSource, "imagineStem"), SOURCING);
  assert.equal(kit.markdown.includes(".."), false);
});

test("with no pick the dealt pair stays, and a serif display yields to a sans wish", () => {
  const quiet = brandKitFromAnswers([{ id: "DP-1.5", value: TYPE_ANSWER }]);
  assert.match(quiet.markdown, /Dealt families: Syne and Spline Sans\./);
  assert.equal(quiet.markdown.includes("owner's words win"), false);
  assert.equal(quoted(quiet.moduleSource, "display"), "Syne");
  assert.equal(quoted(quiet.moduleSource, "body"), "Spline Sans");
  const conflict = brandKitFromAnswers([
    { id: "DP-1.5", value: "boska for the display, but headings should be a light sans." },
  ]);
  const type = /## Type\n\n([\s\S]*?)\n## /.exec(conflict.markdown)?.[1] ?? "";
  assert.match(type, /Dealt families: Boska and General Sans\./);
  assert.match(type, /The owner's words win over Boska/);
  assert.match(type, /light, wide, airy sans|light sans/);
  assert.match(type, /the direction supplies General Sans/);
  assert.doesNotMatch(type, /\bserif\b/i);
});

test("picking and changing a direction rewrites the kit and unbuilt prompts only", async () => {
  const dir = project("hh-plan-243f-");
  try {
    const markdown = run11Brief();
    approve(dir, markdown);
    await draftBriefPlan(dir, markdown);
    const brandFile = path.join(dir, ".hitchhiker", "brand", "BRAND.md");
    const before = readFileSync(brandFile, "utf8");
    assert.match(before, /Dealt families: Syne and Spline Sans\./);
    assert.equal(before.includes("owner's words win"), false);
    const deal = readDirectionDeal(dir);
    assert.ok(deal);
    assert.equal(deal.pickedId, null);
    const patagonia = deal.directions.find((item) => item.id === "dir-patagonia");
    assert.ok(patagonia);
    assert.equal(patagonia.display, "Boska");
    assert.equal(patagonia.body, "General Sans");
    assert.equal(patagonia.hue, "#1f6b4a");
    const draftedArt = readFileSync(artPromptFile(dir), "utf8");
    const acceptance = draftedArt.split("\n").find((item) => item.startsWith("Acceptance:")) ?? "";
    assert.match(acceptance, /Families: Syne and Spline Sans\./);
    assert.match(acceptance, /Style world: Big quiet photography and plain type\./);
    assert.match(acceptance, /Light: Bright and airy, on soft sand\./);
    assert.match(acceptance, /Type voice: Light, wide, airy sans for headings/);
    assert.match(acceptance, /sunset gold/);
    assert.doesNotMatch(acceptance, /A warm film grade/);
    assert.doesNotMatch(acceptance, /\bserif\b/i);
    assert.doesNotMatch(acceptance, /un Generated|white version fo|fo Motion/);
    const stem = /Imagine prompt stem: (.+)/.exec(before)?.[1] ?? "";
    assert.doesNotMatch(stem, SOURCING);
    assert.match(before, /open-license/);

    chooseDirection(dir, "dir-patagonia", "The owner loves Patagonia's big quiet photography.");
    const picked = readFileSync(brandFile, "utf8");
    const pickedSource = readFileSync(path.join(dir, "src", "data", "brand.ts"), "utf8");
    assert.match(picked, /Picked families: Boska and General Sans\./);
    assert.match(picked, /The owner's words win over Boska/);
    assert.match(picked, /the direction supplies General Sans/);
    assert.equal(picked.includes("Syne"), false);
    assert.equal(picked.includes("Spline Sans"), false);
    assert.equal(quoted(pickedSource, "display"), "Boska");
    assert.equal(quoted(pickedSource, "body"), "General Sans");
    for (const file of promptFiles(dir)) {
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes("Syne"), false, file);
      assert.equal(text.includes("Spline Sans"), false, file);
      if (text.includes("Families:")) {
        assert.match(text, /Families: Boska and General Sans\./);
        assert.match(text, /The owner's words win over Boska/);
        const voice = /Type voice: (.*?) Motion character:/.exec(text)?.[1] ?? "";
        assert.doesNotMatch(voice, /\bserif\b/i);
      }
    }

    chooseDirection(dir, "dir-aesop", "Restraint fits the empty sand.");
    const aesop = readFileSync(brandFile, "utf8");
    assert.match(aesop, /Picked families: Sentient and Switzer\./);
    assert.match(aesop, /The owner's words win over Sentient/);
    assert.match(aesop, /the direction supplies Switzer/);
    const artFile = artPromptFile(dir);
    const sentientArt = readFileSync(artFile, "utf8");
    assert.match(sentientArt, /Families: Sentient and Switzer\./);
    assert.equal(sentientArt.includes("Boska"), false);

    const artId = path.basename(artFile, ".md");
    writeFileSync(
      path.join(dir, ".hitchhiker", "queue.json"),
      `${JSON.stringify({ items: [{ id: artId, kind: "build", status: "passed" }] }, null, 2)}\n`,
      "utf8",
    );
    const extra = path.join(dir, ".hitchhiker", "prompts", "099.md");
    writeFileSync(
      extra,
      "Acceptance: Type voice: Light, wide, airy sans for headings. The owner's words win over Sentient: light, wide, airy sans for headings like the logo, and the direction supplies Switzer. Families: Sentient and Switzer.\n",
      "utf8",
    );
    chooseDirection(dir, "dir-kinfolk", "Margins can do the hierarchy.");
    assert.equal(readFileSync(artFile, "utf8"), sentientArt);
    const rewritten = readFileSync(extra, "utf8");
    assert.match(rewritten, /Families: Gambetta and Synonym\./);
    assert.equal(rewritten.includes("owner's words win"), false);
    assert.equal(rewritten.includes("Sentient"), false);
    const kinfolk = readFileSync(brandFile, "utf8");
    assert.match(kinfolk, /Picked families: Gambetta and Synonym\./);
    assert.equal(/## Type\n\n([\s\S]*?)\n## /.exec(kinfolk)?.[1]?.includes("owner's words win") ?? false, false);

    const snapshot = promptFiles(dir).map((file) => readFileSync(file, "utf8"));
    await draftBriefPlan(dir, markdown);
    await prepareSiteBuild(dir, markdown);
    const after = promptFiles(dir).map((file) => readFileSync(file, "utf8"));
    assert.deepEqual(after, snapshot);
    assert.match(readFileSync(brandFile, "utf8"), /Picked families: Gambetta and Synonym\./);
  } finally {
    removeTempDir(dir);
  }
});
