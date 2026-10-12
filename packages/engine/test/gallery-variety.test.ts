import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRound, emptyWalk } from "../src/gallery-walk.ts";
import { type GalleryEntry } from "../src/guide/schemas.ts";
import { selectReferenceCards, type GalleryPick } from "../src/guide/gallery-model.ts";

function card(over: Partial<GalleryPick> & Pick<GalleryPick, "url" | "source" | "family">): GalleryPick {
  return {
    industry: "other",
    styleWorld: "editorial",
    verified: true,
    ...over,
  };
}

function entry(over: Partial<GalleryEntry> & Pick<GalleryEntry, "url" | "name">): GalleryEntry {
  return {
    source: "other",
    industry: "other",
    styleWorld: "editorial",
    motionLevel: 4,
    award: "none",
    noted: "Look at a fixture row.",
    ...over,
  };
}

test("verified false rows are never dealt", () => {
  const rows = [
    card({ url: "https://example.com/closed", source: "awwwards", family: "editorial", verified: false }),
    card({ url: "https://example.com/g1", source: "godly", family: "editorial" }),
    card({ url: "https://example.com/g2", source: "recent", family: "brutalist", styleWorld: "brutalist" }),
    card({ url: "https://example.com/a1", source: "awwwards", family: "playful", styleWorld: "playful" }),
    card({ url: "https://example.com/a2", source: "awwwards", family: "minimal", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/o1", source: "other", family: "photography" }),
  ];
  const picked = selectReferenceCards(rows, { limit: 4, seed: "hh", round: 1 });
  assert.equal(picked.length, 4);
  assert.equal(picked.some((row) => row.url === "https://example.com/closed"), false);
  assert.equal(picked.every((row) => row.verified !== false), true);
});

test("a family filter deals only that family", () => {
  const rows = [
    entry({ url: "https://example.com/e1", name: "Edit", family: "editorial", source: "godly" }),
    entry({ url: "https://example.com/e2", name: "Edit two", family: "editorial", source: "other" }),
    entry({
      url: "https://example.com/b1",
      name: "Slab",
      family: "brutalist",
      styleWorld: "brutalist",
      source: "awwwards",
    }),
  ];
  const round = nextRound(emptyWalk(), rows, { family: "editorial" });
  assert.ok(round.length >= 1);
  assert.equal(round.every((row) => row.family === "editorial"), true);
  assert.equal(round.some((row) => row.url === "https://example.com/b1"), false);
});

test("round two keeps a loved family and does not repeat its url", () => {
  const rows = [
    card({ url: "https://example.com/loved", source: "other", family: "ecommerce", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/shop", source: "other", family: "ecommerce", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/g1", source: "godly", family: "editorial" }),
    card({ url: "https://example.com/g2", source: "godly", family: "brutalist", styleWorld: "brutalist" }),
    card({ url: "https://example.com/a1", source: "awwwards", family: "playful", styleWorld: "playful" }),
    card({ url: "https://example.com/a2", source: "awwwards", family: "minimal", styleWorld: "minimal-luxury" }),
  ];
  const picked = selectReferenceCards(rows, {
    limit: 4,
    seed: "hh",
    round: 2,
    exclude: ["https://example.com/loved"],
    lovedUrls: ["https://example.com/loved"],
  });
  assert.equal(picked.length, 4);
  assert.equal(picked.some((row) => row.url === "https://example.com/loved"), false);
  assert.equal(picked.some((row) => row.family === "ecommerce"), true);
  assert.equal(picked.some((row) => row.family !== "ecommerce"), true);
  const families = new Set(picked.map((row) => row.family));
  assert.ok(families.size >= 3);
});
