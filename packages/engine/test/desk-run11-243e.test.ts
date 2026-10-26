/**
 * Desk Run 11. The brand kit follows the approved Site Brief, keeps type
 * adjectives, and does not double a period in the Imagine stem.
 * The model is not called.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chooseDirection, pickDirection, readDirectionDeal } from "../src/brand/directions.ts";
import { brandKitFromAnswers, writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { removeTempDir } from "./remove-temp.ts";

const TYPE_ANSWER =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const LIGHT_ANSWER = "Bright and airy, on soft sand.";
const CONTACT_FORM =
  "Yes. A general contact form plus the farm inquiry form. Messages go to hello@paradisefound.example for now. Also a WhatsApp link on Contact and in the footer.";
const BRIEF_ACTION =
  "The visitor sends an inquiry about one farm they can see. The form is prefilled with that farm ID.";
const BRIEF_OFFER =
  "Ocean-view farms are sold direct, with free caretakers and independent lawyers. No middlemen, no surprises. Buyers pay the seller and their own lawyer. The caretaker match is free.";
const BRIEF_MOTION =
  "Motion appetite is medium, 4 of 10. Gentle parallax plays on the hero photo only, and there is no video file. Farm cards fade in one after another at about 400 ms. Everything is still when reduced motion is on. Home opens calmly, then visitors pick Farms, Live on the Land, or How Buying Works.";
const ANSWER_OFFER =
  "Ocean-view farms sold direct, with free caretakers and independent lawyers. No middlemen, no surprises. Buyers pay the seller and their own lawyer; the caretaker match is free.";

const RUN11_ANSWERS = [
  { id: "DP-2.7", value: ANSWER_OFFER },
  { id: "DP-3.1", value: CONTACT_FORM },
  { id: "DP-2.2", value: "Send an inquiry about one farm they can see; the form is prefilled with that farm ID." },
  { id: "DP-1.6", value: "A calm friend who already moved here. A heron at sunrise." },
  { id: "DP-5.3", value: "Feel: calm, warm, honest. Never: salesy, cluttered, loud." },
  { id: "DP-5.1", value: "Patagonia: big quiet photography and plain type." },
  { id: "DP-1.5", value: TYPE_ANSWER },
  { id: "DP-1.2", value: "Jungle green, sunset gold, ocean blue, from the hero photo. Plus soft sand and a near-black green. Sunset gold is the accent; soft sand is the page." },
  { id: "DP-5.6", value: "Photography." },
  { id: "DP-5.5", value: LIGHT_ANSWER },
  { id: "DP-6.2", value: "4." },
];

function run11Brief(motion = BRIEF_MOTION): string {
  return [
    "# Site Brief",
    "",
    "## Action",
    "",
    BRIEF_ACTION,
    "",
    "## Offer",
    "",
    BRIEF_OFFER,
    "",
    "## Vibe",
    "",
    "The feel is calm, warm, and honest. It should never be salesy, cluttered, or loud.",
    "",
    "## References",
    "",
    "Patagonia: love. Big quiet photography and plain type. Cereal: meh, too cold.",
    "",
    "## Motion",
    "",
    motion,
    "",
    "## Imagery",
    "",
    'Photography. Farm pages show only the hero crop labelled "Photos coming soon" until I photograph them.',
    "",
    "## Colours",
    "",
    "Jungle green, sunset gold, and ocean blue, from the hero photo, plus soft sand and a near-black green. Sunset gold is the accent. Soft sand is the page.",
    "",
  ].join("\n");
}

function project(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-brand-243e-"));
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
}

function quoted(source: string, key: string): string {
  const match = new RegExp(`${key}: ("(?:\\\\.|[^"\\\\])*")`).exec(source);
  assert.ok(match?.[1], key);
  return JSON.parse(match[1]) as string;
}

test("an approved brief like Run 11 fills motion, action, and the kit files", () => {
  const dir = project();
  try {
    approve(dir, run11Brief());
    const markdown = writeBrandKit(dir, RUN11_ANSWERS);
    const motion = /## Motion\n\n([\s\S]*?)\n## /.exec(markdown)?.[1] ?? "";
    assert.match(motion, /parallax/);
    assert.match(motion, /400 ms/);
    assert.match(motion, /reduced motion/);
    assert.equal(motion.includes("4. Sound stays off"), false);
    assert.match(markdown, /Action: The visitor sends an inquiry about one farm they can see/);
    assert.equal(markdown.includes("Yes. A general contact form"), false);
    assert.match(markdown, /farms are sold direct/);
    assert.match(markdown, /Cereal: meh, too cold/);
    assert.match(markdown, /Colour feeling: Jungle green, sunset gold, and ocean blue/);
    assert.match(markdown, /Sunset gold is the accent\. Soft sand is the page\./);
    assert.match(markdown, /Photos coming soon/);
    assert.match(markdown, /A calm friend who already moved here/);
    assert.match(markdown, /The feel is calm, warm, and honest/);
    const brandTs = readFileSync(path.join(dir, "src", "data", "brand.ts"), "utf8");
    const offer = quoted(brandTs, "offer");
    const action = quoted(brandTs, "action");
    assert.equal(offer, BRIEF_OFFER);
    assert.equal(action, BRIEF_ACTION);
    assert.match(markdown, new RegExp(offer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(markdown, new RegExp(`Action: ${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.equal(brandTs.includes("Yes. A general contact form"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a brief edit to Motion shows up in the kit", () => {
  const dir = project();
  try {
    approve(dir, run11Brief());
    writeBrandKit(dir, RUN11_ANSWERS);
    const edited = "Edited motion: the hero stays still, and the cards do not drift.";
    approve(dir, run11Brief(edited));
    const markdown = writeBrandKit(dir, RUN11_ANSWERS);
    assert.match(markdown, /the hero stays still, and the cards do not drift/);
    assert.equal(markdown.includes("400 ms"), false);
    assert.equal(markdown.includes("4. Sound stays off"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("without an approved brief the answer kit stays, and a bare score is an appetite", () => {
  const dir = project();
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(path.join(hitch, "SITE-BRIEF.md"), run11Brief(), "utf8");
    const markdown = writeBrandKit(dir, RUN11_ANSWERS);
    assert.match(markdown, /Yes\. A general contact form/);
    assert.match(markdown, /Motion appetite 4 of 10\./);
    assert.equal(markdown.includes("parallax"), false);
    assert.equal(markdown.includes("farms are sold direct"), false);
    assert.match(markdown, /Buyers pay the seller and their own lawyer;/);
    const scoreOnly = brandKitFromAnswers([{ id: "DP-6.2", value: "4." }]);
    assert.match(scoreOnly.markdown, /Motion appetite 4 of 10\./);
    assert.equal(scoreOnly.markdown.includes("4. Sound stays off"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("type adjectives come from light, wide, airy when no font is named", () => {
  const kit = brandKitFromAnswers([{ id: "DP-1.5", value: TYPE_ANSWER }]);
  assert.match(kit.markdown, /Adjectives: light, wide, airy\./);
  assert.match(kit.markdown, /Dealt families: Syne and Spline Sans\./);
  assert.equal(kit.markdown.includes("Adjectives: none."), false);
});

test("the Imagine stem and the Light line do not double a terminal period", () => {
  const kit = brandKitFromAnswers([
    { id: "DP-5.5", value: LIGHT_ANSWER },
    { id: "DP-5.6", value: "Photography." },
  ]);
  assert.match(kit.markdown, /Light: Bright and airy, on soft sand\./);
  assert.match(kit.markdown, /sand\. Grade:/);
  assert.equal(kit.markdown.includes(".."), false);
  assert.equal(kit.moduleSource.includes(".."), false);
  const open = brandKitFromAnswers([
    { id: "DP-5.5", value: "Soft daylight" },
    { id: "DP-5.6", value: "Fields at dusk" },
  ]);
  assert.match(open.markdown, /Light: Soft daylight\./);
  assert.match(open.markdown, /Fields at dusk\. Light: Soft daylight\. Grade:/);
  assert.equal(open.markdown.includes(".."), false);
});

test("a picked direction is named in the brand kit", () => {
  const dir = project();
  try {
    const markdown = writeBrandKit(dir, []);
    assert.match(markdown, /## Directions\n\nPick one\./);
    const deal = readDirectionDeal(dir);
    assert.ok(deal);
    const first = deal.directions[0];
    assert.ok(first);
    const named = brandKitFromAnswers([], pickDirection(deal, first.id));
    assert.match(named.markdown, new RegExp(`## Directions\\n\\nPicked ${first.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
    chooseDirection(dir, first.id, "The quieter page fits the brief.");
    const written = readFileSync(path.join(dir, ".hitchhiker", "brand", "BRAND.md"), "utf8");
    assert.match(written, new RegExp(`Picked ${first.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
  } finally {
    removeTempDir(dir);
  }
});
