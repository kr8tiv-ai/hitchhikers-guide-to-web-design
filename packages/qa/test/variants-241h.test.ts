/**
 * Idea 19. One approved direction produces four variants of a section.
 * A combine record names which variant each region came from, and writes
 * a new artifact. It does not overwrite the approved direction.
 * One variant fails even when the section is filled in.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PARALLEL_VARIANT_COUNT, combineSectionVariants } from "../src/elevate-loop.ts";

const approved = {
  id: "direction-approved",
  sectionId: "hero",
  regions: { header: "approved-header", layout: "approved-layout" },
};

function variants() {
  return [1, 2, 3, 4].map((number) => ({
    id: `v${number}`,
    sectionId: "hero",
    regions: { header: `header-${number}`, layout: `layout-${number}` },
  }));
}

test("one variant fails even when the section is filled in", () => {
  assert.equal(PARALLEL_VARIANT_COUNT, 4);
  const frozen = structuredClone(approved);
  const only = variants()[0];
  assert.ok(only);
  const report = combineSectionVariants({
    approved: frozen,
    variants: [only],
    picks: [
      { region: "header", variantId: "v1" },
      { region: "layout", variantId: "v1" },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.artifact, null);
  assert.match(report.problems.join("\n"), /four/);
  assert.deepEqual(frozen, approved);
});

test("four variants combine header from one and layout from another", () => {
  const frozen = structuredClone(approved);
  const report = combineSectionVariants({
    approved: frozen,
    variants: variants(),
    picks: [
      { region: "header", variantId: "v1" },
      { region: "layout", variantId: "v3" },
    ],
  });
  assert.equal(report.ok, true, report.problems.join("\n"));
  assert.ok(report.artifact);
  assert.deepEqual(report.artifact.variantIds, ["v1", "v2", "v3", "v4"]);
  assert.deepEqual(report.artifact.regions, [
    { region: "header", variantId: "v1", value: "header-1" },
    { region: "layout", variantId: "v3", value: "layout-3" },
  ]);
  assert.notEqual(report.artifact.id, approved.id);
  assert.equal(report.artifact.approvedDirectionId, approved.id);
  assert.equal(report.artifact.sectionId, "hero");
  assert.deepEqual(frozen, approved);
});
