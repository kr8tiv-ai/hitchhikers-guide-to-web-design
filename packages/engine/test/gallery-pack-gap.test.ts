import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { dealRound, emptyWalk, loadGallery, nextRound, recordVerdict } from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const packFile = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "knowledge",
  "galleries",
  "curated.json",
);

/**
 * These assertions describe the gallery after prompt 202.
 * On the pre-202 pack they fail: the walk deals fewer than four cards,
 * `recent` is not a source, and ten cards cannot span three families.
 */

test("the shipped pack deals four cards for an empty query", () => {
  const pack = loadGallery(packFile);
  const round = nextRound(emptyWalk(), pack, {});
  assert.ok(round.length >= 4, `dealt ${round.length}, expected at least 4`);
});

test("the loader accepts source recent", async () => {
  // Recent's listing HTML had no outbound site links, so the shipped pack
  // cannot honestly add a recent row. The loader still accepts the source.
  const dir = await mkdtemp(path.join(tmpdir(), "hh-recent-"));
  try {
    const file = path.join(dir, "one.json");
    await writeFile(
      file,
      JSON.stringify([
        {
          id: "recent-probe",
          name: "Recent probe",
          url: "https://example.com/recent-probe",
          source: "recent",
          industry: "saas",
          styleWorld: "editorial",
          motionLevel: 3,
          award: "none",
          noted: "Look at a lead source the loader used to refuse.",
        },
      ]),
    );
    const loaded = loadGallery(file);
    assert.equal(loaded[0]?.source, "recent");
    assert.equal(loaded[0]?.id, "recent-probe");
  } finally {
    await removeTempDir(dir);
  }
});

test("the first ten dealt cards of the shipped pack span at least three families", () => {
  const pack = loadGallery(packFile);
  let state = emptyWalk();
  const dealt: string[] = [];
  while (dealt.length < 10 && state.phase === "walking") {
    const deal = dealRound(state, pack, {});
    if (deal.cards.length === 0) break;
    for (const card of deal.cards) {
      const family = card.family ?? card.styleWorld;
      dealt.push(family);
    }
    state = deal.state;
    for (const card of deal.cards) {
      if (state.phase !== "walking") break;
      state = recordVerdict(state, { url: card.url, verdict: "meh", why: "" });
    }
  }
  const families = new Set(dealt.slice(0, 10));
  assert.ok(dealt.length >= 10, `only dealt ${dealt.length} cards`);
  assert.ok(families.size >= 3, `families in the first ten: ${[...families].join(", ")}`);
});

test("the shipped pack has at least 120 rows and the loader names the row index and id", async () => {
  const pack = loadGallery(packFile);
  assert.ok(pack.length >= 120, `pack length ${pack.length}`);
  const dir = await mkdtemp(path.join(tmpdir(), "hh-bad-row-"));
  try {
    const file = path.join(dir, "bad.json");
    await writeFile(
      file,
      JSON.stringify([
        {
          id: "bad-row",
          name: "Bad row",
          url: "https://example.com/bad-row",
          source: "not-a-source",
          industry: "saas",
          styleWorld: "editorial",
          motionLevel: 3,
          award: "none",
          noted: "Look at a row the loader must name.",
        },
      ]),
    );
    assert.throws(() => loadGallery(file), /Gallery entry 0 \(bad-row\)/);
  } finally {
    await removeTempDir(dir);
  }
});

test("twenty seeds deal four cards and the first ten span at least three families", () => {
  const pack = loadGallery(packFile);
  for (let index = 0; index < 20; index += 1) {
    const seed = `walk-${index}`;
    let state = emptyWalk(seed);
    const opening = nextRound(state, pack, {});
    assert.equal(opening.length, 4, seed);
    const openingFamilies = new Set(opening.map((card) => card.family).filter((family) => family !== undefined && family !== ""));
    assert.ok(openingFamilies.size >= 3, `${seed} opening ${[...openingFamilies].join(", ")}`);
    const dealt: string[] = [];
    while (dealt.length < 10 && state.phase === "walking") {
      const deal = dealRound(state, pack, {});
      assert.equal(deal.cards.length, 4, `${seed} dealt ${deal.cards.length}`);
      for (const card of deal.cards) {
        assert.equal(typeof card.family, "string");
        assert.notEqual(card.family, "");
        dealt.push(card.family ?? "");
      }
      state = deal.state;
      for (const card of deal.cards) {
        if (state.phase !== "walking") break;
        state = recordVerdict(state, { url: card.url, verdict: "meh", why: "" });
      }
    }
    const families = new Set(dealt.slice(0, 10));
    assert.ok(dealt.length >= 10, `${seed} only dealt ${dealt.length}`);
    assert.ok(families.size >= 3, `${seed} families ${[...families].join(", ")}`);
  }
});
