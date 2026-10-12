import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_PACK, validateGallery } from "../scripts/validate-gallery.ts";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, "..", "..", "..", "hh-build-plan", "prompts", "202-gallery-seed.json");

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sample-row",
    title: "A quiet column of type",
    name: "Sample",
    sourceName: "Direct pick",
    source: "other",
    sourcePage: null,
    url: "https://example.com/sample",
    family: "editorial",
    styleWorld: "editorial",
    styleTags: ["editorial-layout", "serif"],
    why: "A narrow measure and a wide margin let the writing stay the main event on the page.",
    palette: { note: "A light ground carries a darker mark.", hex: ["#111111"] },
    typography: "Quiet headlines sit over a readable body.",
    borrow: "Borrow the idea of a narrow column.",
    attribution: "Direct pick, no gallery listing.",
    award: "none",
    motionLevel: 4,
    verified: true,
    checked: "2026-10-12",
    noted: "Look at the structure and leave the assets alone.",
    industry: "other",
    ...over,
  };
}

function issuesOf(rows: unknown[], totals = false): string[] {
  return validateGallery(rows, { totals, now: NOW });
}

function named(issues: string[], id: string, field: string): void {
  assert.ok(
    issues.some((issue) => issue.startsWith(`${id} ${field}:`)),
    `expected ${id} ${field} in ${issues.join(" | ")}`,
  );
}

test("a valid entry passes the field rules", () => {
  assert.deepEqual(issuesOf([entry()]), []);
});

test("the shipped pack passes", () => {
  const pack: unknown = JSON.parse(readFileSync(DEFAULT_PACK, "utf8"));
  const seedText = readFileSync(seedPath, "utf8");
  const issues = validateGallery(pack, { seedText, now: NOW });
  assert.deepEqual(issues, []);
});

test("id must be a unique kebab slug", () => {
  named(issuesOf([entry({ id: "Bad Row" })]), "Bad Row", "id");
  named(issuesOf([entry(), entry({ url: "https://example.com/other" })]), "sample-row", "id");
  named(issuesOf([entry({ id: "" })]), "(missing id)", "id");
});

test("title must be 3 to 9 words", () => {
  named(issuesOf([entry({ title: "Too short" })]), "sample-row", "title");
  named(issuesOf([entry({ title: "one two three four five six seven eight nine ten" })]), "sample-row", "title");
});

test("name is required", () => {
  named(issuesOf([entry({ name: "" })]), "sample-row", "name");
});

test("sourceName must be a known gallery", () => {
  named(issuesOf([entry({ sourceName: "Godly" })]), "sample-row", "sourceName");
});

test("source must be a machine source and godly is not shipped", () => {
  named(issuesOf([entry({ source: "godly" })]), "sample-row", "source");
});

test("sourcePage is required for a listing and must be an allow-listed https url", () => {
  named(
    issuesOf([entry({ sourceName: "Awwwards", attribution: "Listed on Awwwards.", sourcePage: null })]),
    "sample-row",
    "sourcePage",
  );
  named(
    issuesOf([
      entry({
        sourceName: "Awwwards",
        attribution: "Listed on Awwwards.",
        sourcePage: "https://example.com/not-awwwards",
      }),
    ]),
    "sample-row",
    "sourcePage",
  );
  named(issuesOf([entry({ sourcePage: "https://example.com/extra" })]), "sample-row", "sourcePage");
  named(
    issuesOf([
      entry({
        sourceName: "Awwwards",
        attribution: "Listed on Awwwards.",
        sourcePage: "https://www.awwwards.com/sites/sample?ref=1",
      }),
    ]),
    "sample-row",
    "sourcePage",
  );
});

test("url must be unique https without tracking, a fragment, or a media file", () => {
  named(issuesOf([entry({ url: "https://example.com/sample?utm_source=x" })]), "sample-row", "url");
  named(issuesOf([entry({ url: "https://example.com/sample#part" })]), "sample-row", "url");
  named(issuesOf([entry({ url: "https://example.com/shot.png" })]), "sample-row", "url");
  named(
    issuesOf([
      entry(),
      entry({ id: "other-row", url: "https://www.example.com/sample/" }),
    ]),
    "other-row",
    "url",
  );
});

test("family and styleWorld must match the table", () => {
  named(issuesOf([entry({ family: "not-a-family" })]), "sample-row", "family");
  named(issuesOf([entry({ styleWorld: "brutalist" })]), "sample-row", "styleWorld");
});

test("styleTags must be 2 to 5 known tags without repeats", () => {
  named(issuesOf([entry({ styleTags: ["serif"] })]), "sample-row", "styleTags");
  named(issuesOf([entry({ styleTags: ["serif", "nope"] })]), "sample-row", "styleTags");
  named(issuesOf([entry({ styleTags: ["serif", "serif"] })]), "sample-row", "styleTags");
});

test("why must be one sentence of 12 to 28 words", () => {
  named(issuesOf([entry({ why: "Too short a line for the rule." })]), "sample-row", "why");
  named(issuesOf([entry({ why: "This has two sentences. That breaks the rule for a why line here today." })]), "sample-row", "why");
});

test("prose rejects an exclamation mark, an em dash, lorem, a banned word, and http", () => {
  named(issuesOf([entry({ title: "A loud title here" })].map((row) => ({ ...row, why: "A narrow measure and a wide margin let the writing stay the main event now please!" }))), "sample-row", "why");
  const dash = "A narrow measure and a wide margin let the writing stay the main event \u2014 quietly.";
  named(issuesOf([entry({ why: dash })]), "sample-row", "why");
  named(issuesOf([entry({ borrow: "lorem ipsum sits in this borrow line" })]), "sample-row", "borrow");
  named(issuesOf([entry({ typography: "A seamless grotesk does the headline." })]), "sample-row", "typography");
  named(issuesOf([entry({ noted: "Look at http://example.com in the note." })]), "sample-row", "noted");
});

test("palette needs one sentence and 1 to 5 uppercase hex values", () => {
  named(issuesOf([entry({ palette: { note: "", hex: ["#111111"] } })]), "sample-row", "palette");
  named(issuesOf([entry({ palette: { note: "A light ground carries a darker mark.", hex: ["#abc"] } })]), "sample-row", "palette");
  named(issuesOf([entry({ palette: { note: "A light ground carries a darker mark.", hex: [] } })]), "sample-row", "palette");
});

test("typography and borrow are required and stay under 220 characters", () => {
  named(issuesOf([entry({ typography: "" })]), "sample-row", "typography");
  named(issuesOf([entry({ borrow: "" })]), "sample-row", "borrow");
  named(issuesOf([entry({ borrow: "x".repeat(221) })]), "sample-row", "borrow");
});

test("attribution must match the source name", () => {
  named(issuesOf([entry({ attribution: "Listed on Awwwards." })]), "sample-row", "attribution");
  named(
    issuesOf([
      entry({
        sourceName: "Awwwards",
        source: "awwwards",
        sourcePage: "https://www.awwwards.com/sites/sample",
        attribution: "Direct pick, no gallery listing.",
      }),
    ]),
    "sample-row",
    "attribution",
  );
});

test("SOTY is only Lando Norris and a Site of the Day row cannot contain Year", () => {
  named(issuesOf([entry({ award: "SOTY 2025", name: "Someone Else" })]), "sample-row", "award");
  named(issuesOf([entry({ award: "SOTD", noted: "Look at Site of the Year by mistake." })]), "sample-row", "noted");
  named(
    issuesOf([
      entry({
        award: "SOTD",
        palette: { note: "A Year of colour in this note.", hex: ["#111111"] },
      }),
    ]),
    "sample-row",
    "palette.note",
  );
  const lando = entry({
    id: "lando-norris",
    name: "Lando Norris",
    award: "SOTY 2025",
    url: "https://example.com/lando",
  });
  assert.deepEqual(issuesOf([lando]), []);
});

test("motionLevel must be an integer from 1 to 10", () => {
  named(issuesOf([entry({ motionLevel: 0 })]), "sample-row", "motionLevel");
  named(issuesOf([entry({ motionLevel: 3.5 })]), "sample-row", "motionLevel");
});

test("verified false requires a note and checked cannot be in the future", () => {
  named(issuesOf([entry({ verified: false })]), "sample-row", "verificationNote");
  named(issuesOf([entry({ verified: "yes" })]), "sample-row", "verified");
  named(issuesOf([entry({ checked: "2026-10-13" })]), "sample-row", "checked");
  assert.deepEqual(issuesOf([entry({ verified: false, verificationNote: "The page did not open." })]), []);
});

test("noted must start with Look at", () => {
  named(issuesOf([entry({ noted: "See the structure." })]), "sample-row", "noted");
});

test("a field must not repeat a long seed string", () => {
  const stolen = "A narrow measure and a wide margin let the writing stay the main event on the page.";
  const issues = validateGallery([entry()], { totals: false, now: NOW, seedText: stolen });
  named(issues, "sample-row", "why");
});

test("pack totals require 120 rows, 12 families, and the verified cap", () => {
  const families = [
    "editorial",
    "brutalist",
    "3d-webgl",
    "scroll-gsap",
    "dark-luxury",
    "playful",
    "minimal",
    "saas",
    "architecture-real-estate",
    "portfolio",
    "ecommerce",
    "photography",
  ];
  const worlds: Record<string, string> = {
    editorial: "editorial",
    photography: "editorial",
    portfolio: "editorial",
    brutalist: "brutalist",
    "3d-webgl": "3d-world",
    "scroll-gsap": "scroll-film",
    "dark-luxury": "minimal-luxury",
    minimal: "minimal-luxury",
    saas: "minimal-luxury",
    "architecture-real-estate": "minimal-luxury",
    ecommerce: "minimal-luxury",
    playful: "playful",
  };
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 120; index += 1) {
    const family = families[index % families.length] ?? "editorial";
    rows.push(
      entry({
        id: `row-${index}`,
        url: `https://example.com/row-${index}`,
        family,
        styleWorld: worlds[family],
        verified: index < 108,
        verificationNote: index < 108 ? undefined : "The page did not open.",
      }),
    );
  }
  assert.deepEqual(validateGallery(rows, { now: NOW }), []);
  const short = rows.slice(0, 119);
  assert.ok(validateGallery(short, { now: NOW }).some((issue) => issue.startsWith("pack:")));
  let brutalist = 0;
  const starved = rows.map((row) => {
    if (row.family !== "brutalist") return row;
    brutalist += 1;
    if (brutalist <= 5) return row;
    return { ...row, family: "editorial", styleWorld: "editorial" };
  });
  assert.ok(validateGallery(starved, { now: NOW }).some((issue) => issue.includes("brutalist")));
  const heavy = rows.map((row, index) =>
    index < 40 ? { ...row, family: "editorial", styleWorld: "editorial" } : row,
  );
  assert.ok(validateGallery(heavy, { now: NOW }).some((issue) => issue.includes("25 percent")));
  const closed = rows.map((row, index) =>
    index < 20
      ? { ...row, verified: false, verificationNote: "The page did not open." }
      : row,
  );
  assert.ok(validateGallery(closed, { now: NOW }).some((issue) => issue.includes("10 percent")));
});
