import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TYPE_BYTE_BUDGET,
  TYPE_LINE_HEIGHT,
  TYPE_MEASURE_CH,
  TYPE_MIN_BODY_PX,
  TYPE_WIDTHS,
  TYPE_WORLD_MINIMUMS,
  auditBuiltType,
} from "../src/type-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fonts = path.resolve(here, "..", "..", "app", "public", "fonts");
const headline = "BricolageGrotesque-opsz96-wght800.woff2";
const body = "Literata-opsz16-wght400.woff2";

function page(cssExtra: string, headExtra = ""): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${headExtra}
<style>
@font-face {
  font-family: "Bricolage Grotesque";
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("/fonts/${headline}") format("woff2");
}
@font-face {
  font-family: "Bricolage Grotesque Fallback";
  src: local("Arial");
  size-adjust: 100%;
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "Literata";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/${body}") format("woff2");
}
@font-face {
  font-family: "Literata Fallback";
  src: local("Georgia");
  size-adjust: 100%;
  ascent-override: 92%;
  descent-override: 22%;
  line-gap-override: 0%;
}
html { font-size: 100%; }
body { margin: 0; font-family: Literata, "Literata Fallback", serif; font-size: 1rem; font-weight: 400; line-height: 1.5; }
h1 {
  font-family: "Bricolage Grotesque", "Bricolage Grotesque Fallback", sans-serif;
  font-weight: 800;
  font-size: clamp(3.2rem, 1rem + 4vw, 4.75rem);
  line-height: 0.95;
  margin: 0;
}
main { width: 60ch; }
${cssExtra}
</style>
</head>
<body>
<main data-type-role="body">
  <h1 data-type-role="display">Find your calm</h1>
  <p>A quiet editorial sentence for the body column, long enough to wrap on a phone and on a desk.</p>
</main>
</body>
</html>`;
}

function writeSite(html: string, files: { name: string; from?: string; bytes?: Buffer }[] = []): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-type-gate-"));
  mkdirSync(path.join(dir, "fonts"), { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html, "utf8");
  const shipped = files.length === 0 ? [{ name: headline, from: headline }, { name: body, from: body }] : files;
  for (const file of shipped) {
    const target = path.join(dir, "fonts", file.name);
    if (file.bytes !== undefined) writeFileSync(target, file.bytes);
    else copyFileSync(path.join(fonts, file.from ?? file.name), target);
  }
  return dir;
}

test("an editorial page clears the type gate at 375 and 1440", { timeout: 120_000 }, async () => {
  assert.deepEqual(TYPE_WIDTHS, [375, 1440]);
  assert.equal(TYPE_MIN_BODY_PX, 16);
  assert.deepEqual(TYPE_LINE_HEIGHT, { min: 1.45, max: 1.6 });
  assert.deepEqual(TYPE_MEASURE_CH, { min: 45, max: 75 });
  assert.equal(TYPE_BYTE_BUDGET.headlineWoff2Max, 40_960);
  assert.equal(TYPE_BYTE_BUDGET.bodyWoff2Max, 46_080);
  assert.equal(TYPE_BYTE_BUDGET.allFontFilesMax, 122_880);
  assert.equal(TYPE_WORLD_MINIMUMS.editorial.minDisplayOverBody, 3.2);
  assert.equal(TYPE_WORLD_MINIMUMS.brutalist.minDisplayOverBody, 4);
  const dir = writeSite(
    page("", `<link rel="preload" href="/fonts/${headline}" as="font" type="font/woff2" crossorigin>`),
  );
  const result = await auditBuiltType(dir, "editorial");
  assert.deepEqual(result.problems, [], result.problems.join("\n"));
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.samples.map((sample) => sample.width),
    [375, 1440],
  );
  for (const sample of result.samples) {
    assert.ok(sample.bodyPx >= 16);
    assert.ok(sample.ratio >= 3.2);
    assert.ok(sample.lineHeight >= 1.45 && sample.lineHeight <= 1.6);
    assert.ok(sample.measureCh >= 45 && sample.measureCh <= 75);
    assert.ok(sample.families.length <= 2);
    assert.equal(sample.families.includes("Inter"), false);
    assert.equal(sample.families.includes("Bebas Neue"), false);
    assert.deepEqual(sample.loaded, sample.families);
  }
});

test("a brutalist page whose display is under 4 times the body fails at both widths", { timeout: 120_000 }, async () => {
  const dir = writeSite(
    page(
      "h1 { font-size: 2rem; }",
      `<link rel="preload" href="/fonts/${headline}" as="font" type="font/woff2" crossorigin>`,
    ),
  );
  const result = await auditBuiltType(dir, "brutalist");
  assert.equal(result.ok, false);
  for (const width of TYPE_WIDTHS) {
    assert.ok(
      result.problems.some((line) => line.includes(`at ${width}`) && line.includes("minimum is 4")),
      result.problems.join("\n"),
    );
  }
  const phone = result.samples.find((sample) => sample.width === 375);
  const desk = result.samples.find((sample) => sample.width === 1440);
  assert.ok(phone && phone.ratio < 4);
  assert.ok(desk && desk.ratio < 4);
});

test("a hotlink, a missing license face, a fat body file, and a missing preload fail", { timeout: 120_000 }, async () => {
  const fat = Buffer.alloc(50_000, 1);
  const html = page(
    `@font-face {
      font-family: "Literata";
      font-weight: 400;
      font-display: swap;
      src: url("https://cdn.fontshare.com/wf/not-a-file.woff2") format("woff2");
    }`,
  ).replace(
    /@font-face \{\s*font-family: "Literata Fallback";[\s\S]*?\}/,
    "",
  );
  const dir = writeSite(html, [
    { name: headline, from: headline },
    { name: body, bytes: fat },
  ]);
  const result = await auditBuiltType(dir, "editorial");
  assert.equal(result.ok, false);
  const text = result.problems.join("\n");
  assert.match(text, /hotlink/i);
  assert.match(text, /Literata is missing a fallback/);
  assert.match(text, /Headline preload is missing/);
  assert.match(text, new RegExp(`Body font is \\d+ bytes. Maximum is ${TYPE_BYTE_BUDGET.bodyWoff2Max}`));
});
