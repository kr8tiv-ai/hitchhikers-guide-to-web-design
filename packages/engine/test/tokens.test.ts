import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DENY_HEX,
  TYPE_LIBRARY,
  TYPE_LICENSE,
  TYPE_PAIRINGS,
  TokenError,
  contrastRatio,
  passes,
  pickType,
  proposePalettes,
  renderCssVars,
} from "../src/brand/tokens.ts";
import type { Palette } from "../src/brand/tokens.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "tokens.ts");
const libraryPath = path.resolve(here, "..", "src", "brand", "type-library.ts");
const source = readFileSync(sourcePath, "utf8");
const librarySource = readFileSync(libraryPath, "utf8");

const SEEDS = [
  "#777777",
  "#808080",
  "#c4512c",
  "#f5d90a",
  "#1f6f5b",
  "#000000",
  "#ffffff",
  "#4f46e5",
  "#7c3aed",
  "#abc",
  null,
] as const;

function usesHex(palettes: readonly Palette[], hex: string): boolean {
  return palettes.some(
    (palette) => palette.paper === hex || palette.ink === hex || palette.signal === hex,
  );
}

function assertSafe(palettes: readonly Palette[]): void {
  assert.ok(palettes.length >= 1 && palettes.length <= 3);
  const keys = palettes.map((palette) => `${palette.paper}|${palette.ink}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const palette of palettes) {
    assert.match(palette.paper, /^#[0-9a-f]{6}$/);
    assert.match(palette.ink, /^#[0-9a-f]{6}$/);
    assert.match(palette.signal, /^#[0-9a-f]{6}$/);
    assert.equal(palette.ratioBody, contrastRatio(palette.ink, palette.paper));
    assert.equal(passes(palette.ratioBody, "body"), true);
    assert.ok(palette.ratioBody >= 4.5);
    for (const hex of DENY_HEX) {
      assert.notEqual(palette.paper, hex);
      assert.notEqual(palette.ink, hex);
      assert.notEqual(palette.signal, hex);
    }
  }
}

test("black on white is 21 and the ratio is symmetric", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.001);
  assert.equal(contrastRatio("#000", "#fff"), contrastRatio("#ffffff", "#000000"));
  assert.equal(contrastRatio("000", "fff"), 21);
});

test("#777777 on white is below 4.5 for body text", () => {
  const ratio = contrastRatio("#777777", "#ffffff");
  assert.ok(ratio < 4.5);
  assert.equal(passes(ratio, "body"), false);
  assert.equal(passes(contrastRatio("#777", "#fff"), "body"), false);
});

test("passes uses 4.5 for body and 3 for large text", () => {
  assert.equal(passes(4.5, "body"), true);
  assert.equal(passes(4.499, "body"), false);
  assert.equal(passes(3, "large"), true);
  assert.equal(passes(2.99, "large"), false);
  assert.equal(passes(contrastRatio("#000000", "#ffffff"), "large"), true);
  assert.equal(passes(Number.NaN, "body"), false);
});

test("3-digit hex expands and invalid hex throws", () => {
  assert.equal(contrastRatio("#abc", "#fff"), contrastRatio("#aabbcc", "#ffffff"));
  assert.equal(contrastRatio(" #0a0 ", "#ffffff"), contrastRatio("#00aa00", "#ffffff"));
  assert.throws(() => contrastRatio("red", "#ffffff"), TokenError);
  assert.throws(() => contrastRatio("#gg0000", "#ffffff"), TokenError);
  assert.throws(() => contrastRatio("#abcd", "#ffffff"), TokenError);
  assert.throws(() => contrastRatio("#aabbccdd", "#ffffff"), TokenError);
  assert.throws(() => proposePalettes({ seedHex: "nope", vibe: "calm" }), TokenError);
});

test("every proposed palette clears 4.5 and skips the indigo violet denylist", () => {
  assert.deepEqual(DENY_HEX, ["#4f46e5", "#7c3aed"]);
  for (const seedHex of SEEDS) {
    const palettes = proposePalettes({ seedHex, vibe: "warm craft" });
    assertSafe(palettes);
  }
  const indigo = proposePalettes({ seedHex: "#4f46e5", vibe: "bold violet" });
  const violet = proposePalettes({ seedHex: "#7C3AED", vibe: "indigo" });
  assert.equal(usesHex(indigo, "#4f46e5"), false);
  assert.equal(usesHex(indigo, "#7c3aed"), false);
  assert.equal(usesHex(violet, "#4f46e5"), false);
  assert.equal(usesHex(violet, "#7c3aed"), false);
  const css = indigo.map((palette) => renderCssVars(palette)).join("\n");
  assert.equal(css.includes("#4f46e5"), false);
  assert.equal(css.includes("#7c3aed"), false);
  assert.equal(/gradient\s*\(/i.test(css), false);
  for (const palette of indigo) {
    assert.equal(passes(contrastRatio(palette.signal, palette.paper), "large"), true);
    assert.notEqual(palette.signal, palette.ink);
  }
});

test("a mid-gray seed cannot be body ink, so the high-contrast fallback is included", () => {
  const palettes = proposePalettes({ seedHex: "#777777", vibe: "quiet" });
  assertSafe(palettes);
  const fallback = palettes.find(
    (palette) => palette.paper === "#f4f0e6" && palette.ink === "#1c1915",
  );
  assert.ok(fallback);
  assert.equal(fallback.signal, "#777777");
  assert.ok(contrastRatio(fallback.signal, fallback.paper) < 4.5);
  assert.ok(passes(fallback.ratioBody, "body"));
  for (const palette of palettes) {
    assert.notEqual(palette.ink, "#777777");
  }
  assert.equal(usesHex(palettes, "#777777"), true);
  if (palettes.length === 3) {
    assert.deepEqual(
      palettes.map((palette) => palette.name),
      ["paper", "ink", "signal"],
    );
  }
});

test("a passing seed is kept, and a failing seed is the signal rather than the ink", () => {
  const terra = proposePalettes({ seedHex: "#c4512c", vibe: "warm craft" });
  assertSafe(terra);
  assert.equal(usesHex(terra, "#c4512c"), true);
  for (const palette of terra) {
    if (palette.signal === "#c4512c") {
      assert.notEqual(palette.ink, "#c4512c");
    }
  }
  const teal = proposePalettes({ seedHex: "#1f6f5b", vibe: "cool forest" });
  assert.equal(usesHex(teal, "#1f6f5b"), true);
  const fromVibe = proposePalettes({ seedHex: null, vibe: "cool forest night" });
  assertSafe(fromVibe);
  assert.equal(usesHex(fromVibe, "#1f6f5b"), true);
  const short = proposePalettes({ seedHex: "#c42", vibe: "loud" });
  assert.equal(usesHex(short, "#cc4422"), true);
});

test("renderCssVars emits paper, ink, and signal with no gradient", () => {
  const palette = proposePalettes({ seedHex: "#1c1915", vibe: "editorial" })[0];
  assert.ok(palette);
  const css = renderCssVars(palette);
  assert.match(css, /^:root \{\n/);
  assert.match(css, new RegExp(`--paper: ${palette.paper};`));
  assert.match(css, new RegExp(`--ink: ${palette.ink};`));
  assert.match(css, new RegExp(`--signal: ${palette.signal};`));
  assert.equal(css.includes("/* 60 */"), true);
  assert.equal(css.includes("/* 30 */"), true);
  assert.equal(css.includes("/* 10 */"), true);
  assert.equal(/gradient/i.test(css), false);
  assert.throws(() => renderCssVars({ ...palette, paper: "linear-gradient(#000, #fff)" }), TokenError);
});

test("pickType keeps at most two families and warns when a third is named", () => {
  const three = pickType("Bebas Neue, Barlow, and Inter");
  assert.equal(three.families.length, 2);
  assert.deepEqual(three.families, ["Bebas Neue", "Barlow"]);
  assert.deepEqual(three.warnings, ["dropped extra family"]);
  assert.equal(three.source, "user");
  assert.equal(three.license, TYPE_LICENSE);
  assert.equal(three.pairId, null);

  const shouted = pickType("bebas neue, BARLOW, and inter");
  assert.deepEqual(shouted.families, ["Bebas Neue", "BARLOW"]);
  assert.deepEqual(shouted.warnings, ["dropped extra family"]);

  const custom = pickType("Helvetica, Garamond, and Futura");
  assert.equal(custom.families.length, 2);
  assert.deepEqual(custom.families, ["Helvetica", "Garamond"]);
  assert.deepEqual(custom.warnings, ["dropped extra family"]);

  const one = pickType("Use Helvetica");
  assert.deepEqual(one.families, ["Helvetica"]);
  assert.equal(one.source, "user");
  assert.deepEqual(one.warnings, []);

  const listed = pickType("I want Fraunces headlines");
  assert.deepEqual(listed.families, ["Fraunces", "Instrument Sans"]);
  assert.equal(listed.source, "user");
  assert.equal(listed.pairId, 11);
  assert.equal(listed.license, "ofl-bundle");

  const archivo = pickType("Archivo Black");
  assert.deepEqual(archivo.families, ["Archivo Black"]);
  assert.equal(archivo.families.length, 1);
  assert.equal(archivo.pairId, null);
  assert.equal(archivo.source, "user");

  const named = pickType("Use Inter");
  assert.deepEqual(named.families, ["Inter"]);
  assert.equal(named.source, "user");

  const space = pickType("Space Grotesk");
  assert.deepEqual(space.families, ["Space Grotesk", "Archivo"]);
  assert.equal(space.source, "user");
  assert.equal(space.pairId, 26);
  assert.equal(space.license, "ofl-bundle");
});

test("an unnamed answer chooses a library pair for the mood and does not fetch fonts", () => {
  const empty = pickType(null);
  assert.equal(empty.source, "list");
  assert.deepEqual(empty.families, ["Switzer"]);
  assert.equal(empty.pairId, 22);
  assert.deepEqual(empty.warnings, []);
  assert.equal(empty.license, "ffl-owner-download");
  assert.notEqual(empty.pairId, TYPE_LIBRARY[0]?.id);

  const warm = pickType("something warm and craft");
  assert.equal(warm.source, "list");
  assert.deepEqual(warm.families, ["Gambarino", "Author"]);
  assert.equal(warm.pairId, 5);

  const publishing = pickType("editorial, quiet, publishing");
  assert.deepEqual(publishing.families, ["Gambetta", "Synonym"]);
  assert.equal(publishing.pairId, 3);
  assert.equal(publishing.families.includes("Inter"), false);

  const food = pickType("playful food");
  assert.deepEqual(food.families, ["Erode", "Ranade"]);
  const poster = pickType("brutalist poster");
  assert.deepEqual(poster.families, ["Tanker", "Cabinet Grotesk"]);
  assert.equal(poster.families.includes("Climate Crisis"), false);
  const fashion = pickType("fashion, sharp");
  assert.deepEqual(fashion.families, ["Clash Display", "Satoshi"]);
  const product = pickType("product, one family");
  assert.deepEqual(product.families, ["Switzer"]);
  const world = pickType("3d-world poster");
  assert.deepEqual(world.families, ["Unbounded", "Instrument Sans"]);
  const startup = pickType("tech startup");
  assert.deepEqual(startup.families, ["Instrument Serif", "Instrument Sans"]);
  assert.equal(startup.pairId, 19);
  const prose = pickType("an interesting editorial serif");
  assert.equal(prose.source, "list");
  assert.deepEqual(prose.families, ["Boska", "General Sans"]);
  assert.equal(prose.families.includes("Inter"), false);

  for (const answer of [null, "", "tech startup", "one family", "fashion"]) {
    const choice = pickType(answer);
    assert.ok(choice.families.length === 1 || choice.families.length === 2);
    assert.notEqual(choice.license, "Google Fonts or Fontshare. Confirm the license at install.");
    if (choice.source === "list") {
      assert.ok(
        TYPE_PAIRINGS.some((pair) => {
          const first = choice.families[0];
          const second = choice.families[1] ?? first;
          return pair[0] === first && pair[1] === second;
        }),
      );
      assert.equal(choice.families.includes("Inter"), false);
    }
  }

  const both = `${source}\n${librarySource}`;
  assert.equal(source.includes("fetch("), false);
  assert.equal(librarySource.includes("fetch("), false);
  assert.equal(/fonts\.googleapis|fonts\.gstatic|cdn\.fontshare/.test(both), false);
  assert.equal(/\.(?:woff2?|ttf|otf)\b/.test(both), false);
  assert.equal(/https?:\/\//.test(source), false);
  assert.match(librarySource, /https:\/\/www\.fontshare\.com\/licenses\//);
  assert.equal(source.includes(TYPE_LICENSE), true);
});
