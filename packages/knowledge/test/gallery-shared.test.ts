import assert from "node:assert/strict";
import { test } from "node:test";
import {
  galleryFamilies,
  galleryFamilyOf,
  galleryFamilyStyle,
  gallerySelectReferenceCards,
  suggestReferences,
  type GalleryPickShape,
} from "@hitchhiker/crawler";
import {
  FAMILIES,
  FAMILY_STYLE,
  familyOf,
  referenceCards,
  selectReferenceCards,
  type GalleryEntry,
} from "@hitchhiker/engine";

function card(over: Partial<GalleryPickShape> & Pick<GalleryPickShape, "url" | "source" | "family">): GalleryPickShape {
  return {
    industry: "other",
    styleWorld: "editorial",
    verified: true,
    ...over,
  };
}

function cases(): Array<{ name: string; entries: GalleryPickShape[]; query: Parameters<typeof selectReferenceCards>[1] }> {
  const mixed = [
    card({ url: "https://example.com/g1", source: "godly", family: "editorial" }),
    card({ url: "https://example.com/g2", source: "recent", family: "brutalist", styleWorld: "brutalist" }),
    card({ url: "https://example.com/g3", source: "godly", family: "playful", styleWorld: "playful" }),
    card({ url: "https://example.com/a1", source: "awwwards", family: "minimal", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/a2", source: "awwwards", family: "saas", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/a3", source: "awwwards", family: "editorial" }),
    card({ url: "https://example.com/s1", source: "gsap-showcase", family: "scroll-gsap", styleWorld: "scroll-film" }),
    card({ url: "https://example.com/u1", source: "aura", family: "saas", styleWorld: "minimal-luxury" }),
    card({ url: "https://example.com/o1", source: "other", family: "photography", styleWorld: "editorial" }),
    card({ url: "https://example.com/closed", source: "other", family: "editorial", verified: false }),
  ];
  return [
    { name: "open round", entries: mixed, query: { limit: 4, seed: "hh", round: 1 } },
    { name: "second seed", entries: mixed, query: { limit: 4, seed: "other-seed", round: 1 } },
    { name: "family filter", entries: mixed, query: { limit: 4, seed: "hh", family: "editorial" } },
    { name: "style filter", entries: mixed, query: { limit: 4, seed: "hh", styleWorld: "minimal-luxury" } },
    {
      name: "taste",
      entries: mixed,
      query: {
        limit: 4,
        seed: "hh",
        round: 2,
        exclude: ["https://example.com/g1"],
        lovedUrls: ["https://example.com/g1"],
      },
    },
    {
      name: "legacy order",
      entries: [
        card({ url: "https://example.com/lead-1", source: "godly", family: "" }),
        card({ url: "https://example.com/award-1", source: "awwwards", family: "" }),
        card({ url: "https://example.com/lead-2", source: "godly", family: "" }),
        card({ url: "https://example.com/award-2", source: "awwwards", family: "" }),
        card({ url: "https://example.com/plain", source: "other", family: "" }),
      ],
      query: { limit: 4, seed: "hh" },
    },
  ];
}

test("the engine and crawler family lists and pickers agree", () => {
  assert.deepEqual(galleryFamilies, FAMILIES);
  assert.deepEqual(galleryFamilyStyle, FAMILY_STYLE);
  assert.equal(familyOf({ family: "saas" }), galleryFamilyOf({ family: "saas" }));
  assert.equal(familyOf({}), galleryFamilyOf({}));
  assert.equal(familyOf({ family: "not-a-family" }), "");

  for (const sample of cases()) {
    const engine = selectReferenceCards(sample.entries, sample.query).map((entry) => entry.url);
    const crawler = gallerySelectReferenceCards(sample.entries, sample.query).map((entry) => entry.url);
    assert.deepEqual(crawler, engine, sample.name);
    const asEntries = sample.entries as unknown as GalleryEntry[];
    const wrapped = referenceCards(asEntries, sample.query).map((entry) => entry.url);
    const suggested = suggestReferences(asEntries, sample.query).map((entry) => entry.url);
    assert.deepEqual(wrapped, engine, `${sample.name} referenceCards`);
    assert.deepEqual(suggested, engine, `${sample.name} suggestReferences`);
  }
});
