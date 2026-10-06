import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { CrawlResult } from "../src/crawl.ts";
import {
  REFERENCE_NOTE_MIN_LENGTH,
  buildCompetitorReport,
  referenceCard,
  sameness,
} from "../src/cards.ts";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function page(fields: {
  finalUrl: string;
  title: string;
  description?: string;
  h1?: string[];
  stackHint?: CrawlResult["stackHint"];
  excerpt?: string;
}): CrawlResult {
  return {
    finalUrl: fields.finalUrl,
    title: fields.title,
    description: fields.description ?? "",
    h1: fields.h1 ?? [],
    excerpt: fields.excerpt ?? "",
    stackHint: fields.stackHint ?? "unknown",
    screenshots: { desktop: Buffer.alloc(0), mobile: Buffer.alloc(0) },
  };
}

test("two identical titles name the shared words", () => {
  const left = page({ finalUrl: "https://a.example/", title: "Home Remodeling", h1: ["Kitchens"] });
  const right = page({ finalUrl: "https://b.example/", title: "Home Remodeling", h1: ["Baths"] });
  const line = sameness([left, right]);
  assert.equal(line, "A shared title pattern: home remodeling.");
  const report = buildCompetitorReport([left, right]);
  assert.match(report, /^# Competitors$/m);
  assert.ok(report.includes(line));
  assert.match(report, /Loved for: _/);
  assert.equal(report.includes("!"), false);
  assert.equal(report.includes("\u2014"), false);
});

test("short words drop so both titles reduce to home remodeling", () => {
  const line = sameness([
    page({ finalUrl: "https://a.example/", title: "The Home Remodeling Co" }),
    page({ finalUrl: "https://b.example/", title: "Our Home Remodeling" }),
  ]);
  assert.equal(line, "A shared title pattern: home remodeling.");
});

test("a kept four-letter word stops a partial overlap from matching", () => {
  const line = sameness([
    page({ finalUrl: "https://a.example/", title: "Best Home Remodeling" }),
    page({ finalUrl: "https://b.example/", title: "Home Remodeling" }),
  ]);
  assert.equal(line, "No shared title pattern in this set.");
});

test("three distinct titles have no shared title pattern", () => {
  const results = [
    page({ finalUrl: "https://pipes.example/", title: "Emergency plumbing dispatch" }),
    page({ finalUrl: "https://garden.example/", title: "Garden design studio" }),
    page({ finalUrl: "https://roof.example/", title: "Commercial roof repair" }),
  ];
  const line = sameness(results);
  assert.match(line, /No shared title pattern/);
  assert.equal(line, "No shared title pattern in this set.");
  const report = buildCompetitorReport(results);
  assert.ok(report.includes("No shared title pattern"));
  assert.equal(report.split("\n").filter((row) => row.startsWith("- URL:")).length, 3);
});

test("a fourth result throws and one result still renders", () => {
  const one = page({
    finalUrl: "https://solo.example/path",
    title: "Solo garden studio",
    stackHint: "webflow",
    h1: [],
  });
  const report = buildCompetitorReport([one]);
  assert.match(report, /^# Competitors$/m);
  assert.ok(report.includes("https://solo.example/path"));
  assert.ok(report.includes("Solo garden studio"));
  assert.ok(report.includes("Stack: webflow"));
  assert.ok(report.includes("H1: No h1 found"));
  assert.ok(report.includes("Loved for: _"));
  assert.ok(report.includes("Search volumes are not estimated."));
  assert.match(report, /No shared title pattern/);

  const four = [1, 2, 3, 4].map((n) =>
    page({ finalUrl: `https://c.example/${n}`, title: `Title number ${n} here` }),
  );
  assert.throws(() => buildCompetitorReport(four), /At most 3 competitor results/);
  assert.equal(buildCompetitorReport(four.slice(0, 3)).includes("https://c.example/4"), false);
});

test("seo section quotes the description and does not invent searches", () => {
  const report = buildCompetitorReport([
    page({
      finalUrl: "https://reddeer.example/emergency",
      title: "Night crew for pipes",
      description: "Emergency plumbing in Red Deer",
      h1: ["Burst pipe repair"],
      stackHint: "unknown",
      excerpt: "UNIQUE_EXCERPT_MARKER 5000 searches should not leak",
    }),
  ]);
  assert.ok(report.includes("Emergency plumbing in Red Deer"));
  assert.ok(report.includes("Burst pipe repair"));
  assert.ok(report.includes("Search volumes are not estimated."));
  assert.equal(/\d+\s+searches/.test(report), false);
  assert.equal(report.includes("UNIQUE_EXCERPT_MARKER"), false);
  assert.equal(report.includes("ranking"), false);
  assert.match(report.trimEnd(), /Search volumes are not estimated\.$/);
});

test("an empty h1 list renders No h1 found and keeps the page", () => {
  const url = "https://blank.example/page";
  const report = buildCompetitorReport([
    page({
      finalUrl: url,
      title: "Quiet page title",
      description: "",
      h1: [],
      stackHint: "next",
    }),
  ]);
  assert.ok(report.includes(url));
  assert.ok(report.includes("No h1 found"));
  assert.ok(report.includes("Stack: next"));
  assert.ok(report.includes("No meta description or h1 in this set."));
});

test("titles in another script use the same lowercase path", () => {
  const cyrillic = sameness([
    page({ finalUrl: "https://a.example/", title: "Ремонт квартир" }),
    page({ finalUrl: "https://b.example/", title: "ремонт квартир" }),
  ]);
  assert.equal(cyrillic, "A shared title pattern: ремонт квартир.");

  const cjk = sameness([
    page({ finalUrl: "https://a.example/", title: "東京配管工事" }),
    page({ finalUrl: "https://b.example/", title: "東京配管工事" }),
  ]);
  assert.equal(cjk, "A shared title pattern: 東京配管工事.");
});

test("urls are printed as given", () => {
  const url = "https://Example.com/Path?q=Keep";
  const report = buildCompetitorReport([
    page({ finalUrl: url, title: "Printed exactly once here", h1: ["Keep this heading"] }),
  ]);
  assert.ok(report.includes(url));
  assert.equal(report.includes("https://example.com/Path?q=Keep"), false);
});

test("referenceCard rejects a blank, filler, or short note", () => {
  const url = "https://loved.example/";
  assert.equal(REFERENCE_NOTE_MIN_LENGTH, 12);
  for (const note of ["", "   ", "nice", "cool", "love it", "Nice", "COOL", "Love It", "a".repeat(11)]) {
    assert.throws(() => referenceCard({ url, note }), /at least 12 characters/);
  }
});

test("referenceCard records the user's reason and does not invent one", () => {
  const url = "https://Loved.Example/grid";
  const note = "  The quiet grid and the type scale  ";
  const card = referenceCard({ url, note });
  assert.match(card, /^# Reference$/m);
  assert.ok(card.includes(`- URL: ${url}`));
  assert.ok(card.includes("- Loved for: The quiet grid and the type scale"));
  assert.equal(card.includes("!"), false);
  assert.equal(card.includes("\u2014"), false);
  assert.equal(/\d+\s+searches/.test(card), false);

  const exact = "a".repeat(REFERENCE_NOTE_MIN_LENGTH);
  assert.ok(referenceCard({ url, note: exact }).includes(exact));
});

test("the card module does not crawl or open the network", () => {
  const source = readFileSync(path.join(srcDir, "cards.ts"), "utf8");
  assert.equal(source.includes("crawl("), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
});
