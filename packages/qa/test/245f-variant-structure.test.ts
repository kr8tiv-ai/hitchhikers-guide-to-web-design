/**
 * 245f. The structure probe measures 375 and 1440 and judges the hero.
 * readDom and documents stand in for CDP. No browser and no network.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { VARIANTS_REL } from "@hitchhiker/engine";
import { probeVariantStructure, structureProbeExpression } from "../src/variant-structure-probe.ts";

const TIMEOUT = 5_000;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-245f-qa-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function writeRanking(dir: string, variant: string): void {
  const file = path.join(dir, VARIANTS_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      [
        {
          page: "home",
          section: "hero",
          variant,
          alternatives: [],
          reason: "Ranked first for this page.",
        },
      ],
      null,
      2,
    )}\n`,
  );
}

function hero(cover: string, variant = "cinematic"): string {
  return `<section data-section="hero" data-variant="${variant}" data-media-cover="${cover}"><div data-slot="media"></div><h1 data-slot="title">North field at first light</h1></section>`;
}

test("the probe expression finds the hero selector and does not open a browser", { timeout: TIMEOUT }, () => {
  const expression = structureProbeExpression();
  assert.match(expression, /\[data-section="hero"\]/);
  assert.match(expression, /data-variant/);
  assert.equal(expression.includes("4175"), false);
});

test("a cinematic document at 60 percent fails media-cover and a full cover passes", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    writeRanking(dir, "cinematic");
    const failed = await probeVariantStructure({
      projectDir: dir,
      documents: { 375: hero("1"), 1440: hero("0.6") },
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.mode, "variant");
    assert.equal(failed.log, "");
    assert.equal(failed.breaches[0]?.fact, "media-cover");
    assert.match(failed.reason, /Variant structure failed\./);
    assert.match(failed.reason, /hero media-cover/);
    assert.match(failed.reason, /Actual 0\.6/);
    assert.match(failed.reason, /Expected >= 0\.9/);

    const passed = await probeVariantStructure({
      projectDir: dir,
      documents: { 375: hero("1"), 1440: hero("1") },
    });
    assert.equal(passed.ok, true);
    assert.equal(passed.reason, "");
  } finally {
    cleanup(dir);
  }
});

test("readDom is asked at 375 and 1440 and a variant mismatch skips layout", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  const widths: number[] = [];
  try {
    writeRanking(dir, "cinematic");
    const failed = await probeVariantStructure({
      projectDir: dir,
      readDom: ({ width }) => {
        widths.push(width);
        return [
          {
            section: "hero",
            variant: "marquee",
            slots: ["media", "title"],
            mediaCover: 0.6,
            horizontal: false,
          },
        ];
      },
    });
    assert.deepEqual(widths, [375, 1440]);
    assert.equal(failed.ok, false);
    assert.equal(failed.breaches.length, 1);
    assert.equal(failed.breaches[0]?.fact, "data-variant");
    assert.match(failed.reason, /variants\.json/);
    assert.match(failed.reason, /marquee/);
    assert.match(failed.reason, /cinematic/);
    assert.equal(failed.reason.includes("media-cover"), false);
    assert.equal(failed.reason.includes("horizontal"), false);
  } finally {
    cleanup(dir);
  }
});

test("signature mode runs only when Signature techniques names one", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    writeFileSync(
      path.join(dir, "DESIGN.md"),
      ["## Signature moments", "", "None locked yet.", "", "## Signature techniques", "", "A designed hero with a clear first frame.", ""].join("\n"),
    );
    const plain = await probeVariantStructure({
      projectDir: dir,
      documents: {
        375: `<section data-section="hero"><div data-slot="media"></div><h1 data-slot="title">North field</h1></section>`,
        1440: `<section data-section="hero"><div data-slot="media"></div><h1 data-slot="title">North field</h1></section>`,
      },
    });
    assert.equal(plain.mode, "variant");
    assert.equal(plain.log, "");
    assert.equal(plain.breaches[0]?.fact, "data-variant");

    writeFileSync(
      path.join(dir, "DESIGN.md"),
      [
        "## Overview",
        "",
        "Signature structure for the hero. Media covers at least 90% of the viewport at 1440.",
        "",
        "## Signature techniques",
        "",
        "Signature structure for the hero. Media covers at least 90% of the viewport at 1440.",
        "",
      ].join("\n"),
    );
    const named = await probeVariantStructure({
      projectDir: dir,
      documents: {
        375: `<section data-section="hero" data-media-cover="0.6"><div data-slot="media"></div></section>`,
        1440: `<section data-section="hero" data-media-cover="0.6"><div data-slot="media"></div></section>`,
      },
    });
    assert.equal(named.mode, "signature");
    assert.equal(named.log, "Variant structure gate ran in signature mode for hero.");
    assert.equal(named.breaches[0]?.fact, "media-cover");
  } finally {
    cleanup(dir);
  }
});

test("a missing hero fails and the desk port is refused before a browser starts", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    const missing = await probeVariantStructure({
      projectDir: dir,
      documents: { 375: "<p>Ask about this farm.</p>", 1440: "<p>Ask about this farm.</p>" },
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.breaches[0]?.fact, "hero");
    await assert.rejects(
      () => probeVariantStructure({ projectDir: dir, url: "http://127.0.0.1:4175/" }),
      /Refusing the desk port 4175/,
    );
  } finally {
    cleanup(dir);
  }
});
