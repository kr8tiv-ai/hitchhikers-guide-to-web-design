/**
 * 245f. checkVariantStructure compares report facts with a variant structure.
 * No browser, network, or model calls.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkVariantStructure, structureFor, structureForSection, type VariantStructureFacts } from "../src/index.ts";

const TIMEOUT = 5_000;

function facts(partial: Partial<VariantStructureFacts> & Pick<VariantStructureFacts, "variant" | "measures">): VariantStructureFacts {
  return {
    section: partial.section ?? "hero",
    variant: partial.variant,
    slots: partial.slots ?? ["media", "eyebrow", "title", "body", "actions"],
    measures: partial.measures,
  };
}

test("a cinematic hero whose media covers 60 percent at 1440 fails media-cover", { timeout: TIMEOUT }, () => {
  const structure = structureFor("cinematic");
  const failed = checkVariantStructure(
    facts({
      variant: "cinematic",
      measures: [
        { width: 375, mediaCover: 1 },
        { width: 1440, mediaCover: 0.6 },
      ],
    }),
    structure,
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.breaches.length, 1);
  const breach = failed.breaches[0];
  assert.ok(breach);
  assert.equal(breach.fact, "media-cover");
  assert.equal(breach.actual, "0.6");
  assert.equal(breach.expected, ">= 0.9");
  assert.match(breach.detail, /Media covers at least 90% of the viewport at 1440/);

  const passed = checkVariantStructure(
    facts({
      variant: "cinematic",
      slots: ["media", "title"],
      measures: [
        { width: 375, mediaCover: 0.6 },
        { width: 1440, mediaCover: 1 },
      ],
    }),
    structure,
  );
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.breaches, []);
});

test("a split-editorial hero with equal columns fails, and equal columns below 1024 do not", { timeout: TIMEOUT }, () => {
  const structure = structureFor("split-editorial");
  const failed = checkVariantStructure(
    facts({
      variant: "split-editorial",
      slots: ["media", "title", "body"],
      measures: [
        { width: 375, columnFractions: [0.5, 0.5] },
        { width: 1440, columnFractions: [0.5, 0.5] },
      ],
    }),
    structure,
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.breaches.length, 1);
  assert.equal(failed.breaches[0]?.fact, "unequal-columns");
  assert.equal(failed.breaches[0]?.actual, "0.5, 0.5");
  assert.match(failed.breaches[0]?.detail ?? "", /unequal widths at 1024/);

  const passed = checkVariantStructure(
    facts({
      variant: "split-editorial",
      slots: ["media", "title", "body"],
      measures: [
        { width: 375, columnFractions: [0.5, 0.5] },
        { width: 1440, columnFractions: [0.675, 0.325] },
      ],
    }),
    structure,
  );
  assert.equal(passed.ok, true);
});

test("structureForSection is only the hero, including layered-depth", { timeout: TIMEOUT }, () => {
  assert.equal(structureForSection("feature", "split-editorial"), null);
  assert.equal(structureForSection("Hero", "cinematic")?.variant, "cinematic");
  assert.equal(structureForSection("hero", "layered-depth")?.variant, "layered-depth");
  assert.equal(structureForSection("hero", "poster"), null);
});

test("missing required slots and a reversed order are named", { timeout: TIMEOUT }, () => {
  const structure = structureFor("cinematic");
  const missing = checkVariantStructure(
    facts({ variant: "cinematic", slots: ["title"], measures: [{ width: 1440, mediaCover: 1 }] }),
    structure,
  );
  assert.equal(missing.breaches.some((breach) => breach.fact === "slots"), true);
  assert.match(missing.breaches.find((breach) => breach.fact === "slots")?.detail ?? "", /media/);

  const reversed = checkVariantStructure(
    facts({
      variant: "cinematic",
      slots: ["title", "media"],
      measures: [{ width: 1440, mediaCover: 1 }],
    }),
    structure,
  );
  assert.equal(reversed.breaches.some((breach) => breach.fact === "order"), true);
  assert.match(reversed.breaches.find((breach) => breach.fact === "order")?.detail ?? "", /out of order/);
});
