// Fixture face: packages/assets/test/fixtures/fonts/VT323-Regular.ttf
// SIL Open Font License 1.1. Full text: fixtures/fonts/OFL.txt. Not MIT.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { traceRaster, traceSymbol } from "../src/symbol-trace.ts";
import {
  assertLogoSvg,
  buildWordmarkSvg,
  setViewBox,
  svgoOptimize,
  wordmarkSvg,
} from "../src/wordmark.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(here, "fixtures", "fonts", "VT323-Regular.ttf");
const TRIANGLE = "M0 0 L10 0 L10 10 Z";

function pathSvg(d: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#111111" d="${d}"/></svg>`;
}

test("imagine-raster wordmarks throw and say to set the wordmark in a font", () => {
  assert.throws(
    () =>
      buildWordmarkSvg({
        text: "T",
        source: "imagine-raster",
        glyphToPath: () => TRIANGLE,
      }),
    /set the wordmark in a font/i,
  );
  assert.throws(
    () =>
      wordmarkSvg({
        fontPath: path.join(here, "missing.ttf"),
        text: "T",
        fontSize: 16,
        source: "imagine-raster",
      }),
    /set the wordmark in a font/i,
  );
});

test("a glyph callback becomes path data and not a text fallback", () => {
  const svg = buildWordmarkSvg({
    text: "T",
    source: "font",
    glyphToPath: (ch) => {
      assert.equal(ch, "T");
      return TRIANGLE;
    },
  });
  assert.equal(svg.includes(TRIANGLE), true);
  assert.equal(svg.includes("<path"), true);
  assert.equal(svg.includes("<text"), false);
  assert.match(svg, /fill="#111111"/);
  assertLogoSvg(svg);
});

test("empty text throws", () => {
  assert.throws(
    () => buildWordmarkSvg({ text: "", source: "font", glyphToPath: () => TRIANGLE }),
    /empty/i,
  );
});

test("an empty glyph path names the character", () => {
  assert.throws(
    () =>
      buildWordmarkSvg({
        text: "TO",
        source: "font",
        glyphToPath: (ch) => (ch === "T" ? TRIANGLE : ""),
      }),
    /"O"/,
  );
});

test("assertLogoSvg rejects an embedded image, a foreignObject, and a data image", () => {
  assert.throws(
    () => assertLogoSvg(`<svg><image href="mark.png"/><path d="${TRIANGLE}"/></svg>`),
    /image/i,
  );
  assert.throws(
    () => assertLogoSvg(`<svg><foreignObject><span>T</span></foreignObject><path d="${TRIANGLE}"/></svg>`),
    /foreignObject/,
  );
  assert.throws(
    () => assertLogoSvg(`<svg><path d="${TRIANGLE}"/><image href="data:image/png;base64,aaaa"/></svg>`),
    /image/i,
  );
});

test("traceSymbol returns a path svg and rejects an image impl", () => {
  const png = Buffer.from([1, 2, 3]);
  const svg = traceSymbol(png, () => pathSvg(TRIANGLE));
  assert.equal(svg.includes(TRIANGLE), true);
  assert.equal(svg.includes("<path"), true);
  assert.throws(() => traceSymbol(png, () => `<svg><image href="data:image/png;base64,aaaa"/></svg>`), /image/i);
  const raster = traceRaster(png, (bytes) => {
    assert.equal(bytes.length, 3);
    return pathSvg(TRIANGLE);
  });
  assert.equal(raster.includes("<path"), true);
});

test("package.json does not depend on potrace or unscoped vtracer", () => {
  const manifestPath = path.join(here, "..", "package.json");
  const raw = readFileSync(manifestPath, "utf8");
  const manifest: unknown = JSON.parse(raw);
  assert.equal(typeof manifest, "object");
  assert.ok(manifest !== null);
  const record = manifest as Record<string, unknown>;
  const dependencies = record.dependencies;
  const devDependencies = record.devDependencies;
  const deps = {
    ...(typeof dependencies === "object" && dependencies !== null
      ? (dependencies as Record<string, unknown>)
      : {}),
    ...(typeof devDependencies === "object" && devDependencies !== null
      ? (devDependencies as Record<string, unknown>)
      : {}),
  };
  assert.equal(deps.potrace, undefined);
  assert.equal(deps.vtracer, undefined);
  assert.equal(/"potrace"\s*:/.test(raw), false);
  assert.equal(/"vtracer"\s*:/.test(raw), false);
  assert.equal(deps["@visioncortex/vtracer"], "1.0.0-alpha.4");
  assert.equal(deps["opentype.js"], "2.0.0");
  assert.equal(deps.svgo, "4.1.0");
});

test("setViewBox 16 still has a path and one stroke color is required", () => {
  const svg = pathSvg(TRIANGLE);
  const small = setViewBox(svg, 16);
  assert.match(small, /viewBox="0 0 16 16"/);
  assert.equal(small.includes("<path"), true);
  assert.equal(small.includes(TRIANGLE), true);
  const two = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path stroke="#111111" fill="#111111" d="${TRIANGLE}"/><path stroke="#ffffff" fill="#111111" d="M0 1 L1 1"/></svg>`;
  assert.throws(() => assertLogoSvg(two), /stroke/);
  assert.throws(() => setViewBox(two, 16), /stroke/);
  const one = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path stroke="#111111" fill="#111111" d="${TRIANGLE}"/></svg>`;
  assert.doesNotThrow(() => assertLogoSvg(one));
});

test("svgoOptimize keeps a path", () => {
  assert.equal(typeof svgoOptimize, "function");
  const optimized = svgoOptimize(pathSvg(TRIANGLE));
  assert.equal(optimized.includes("<path"), true);
  assert.equal(optimized.includes("<image"), false);
});

test("the fixture font shapes real glyphs and a space names the character", () => {
  const h = wordmarkSvg({ fontPath, text: "H", fontSize: 72 });
  const i = wordmarkSvg({ fontPath, text: "I", fontSize: 72 });
  const hh = wordmarkSvg({ fontPath, text: "HH", fontSize: 72 });
  assert.equal(h.includes("<path"), true);
  assert.equal(h.includes("<text"), false);
  assert.equal(h.includes("<image"), false);
  assert.equal(h.includes("<?xml"), false);
  assert.match(h, /fill="#111111"/);
  assert.notEqual(h, i);
  assert.equal(h.includes(TRIANGLE), false);
  const width = (svg: string): number => {
    const match = svg.match(/viewBox="0 0 ([0-9.]+) /);
    assert.ok(match?.[1]);
    return Number(match[1]);
  };
  const oneWidth = width(h);
  const twoWidth = width(hh);
  assert.ok(twoWidth > oneWidth * 1.5);
  assert.ok(twoWidth < oneWidth * 2.5);
  assert.throws(() => wordmarkSvg({ fontPath, text: " ", fontSize: 72 }), /" "/);
});

test("NOTICE and the fixture note record the pins and the OFL face", () => {
  const notice = readFileSync(path.join(here, "..", "..", "..", "NOTICE"), "utf8");
  assert.match(notice, /opentype\.js 2\.0\.0/);
  assert.match(notice, /@visioncortex\/vtracer/);
  assert.match(notice, /1\.0\.0-alpha\.4/);
  assert.match(notice, /MIT OR Apache-2\.0/);
  assert.match(notice, /svgo 4\.1\.0/);
  assert.match(notice, /VT323/);
  assert.match(notice, /SIL Open Font License 1\.1/);
  const readme = readFileSync(path.join(here, "fixtures", "README.md"), "utf8");
  assert.match(readme, /1\.0\.0-alpha\.4/);
  assert.match(readme, /symbol\.png/);
  assert.match(readme, /foreignObject/);
  const ofl = readFileSync(path.join(here, "fixtures", "fonts", "OFL.txt"), "utf8");
  assert.match(ofl, /SIL Open Font License, Version 1\.1/);
  const wordmarkSrc = readFileSync(path.join(here, "..", "src", "wordmark.ts"), "utf8");
  const symbolSrc = readFileSync(path.join(here, "..", "src", "symbol-trace.ts"), "utf8");
  assert.match(wordmarkSrc, /getKerningValue/);
  assert.match(wordmarkSrc, /parseBuffer\(buffer\)/);
  assert.doesNotMatch(wordmarkSrc, /vtracer|potrace/);
  assert.match(symbolSrc, /from "@visioncortex\/vtracer"/);
  assert.match(symbolSrc, /convertBuffer/);
  assert.match(symbolSrc, /assertLogoSvg/);
  assert.doesNotMatch(symbolSrc, /from ["']potrace["']/);
  assert.doesNotMatch(symbolSrc, /from ["']vtracer["']/);
});
