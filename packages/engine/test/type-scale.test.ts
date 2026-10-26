/**
 * BUG-050 audit 4. The type scale comes from the brief.
 * Families and the world ratio are written into DESIGN.md.
 * A brutalist display under 4× the body fails.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { translateBrief } from "../src/spec/art-direction.ts";
import { DESIGN_MD_PATH, renderDesignMd, writeDesignMd } from "../src/spec/design-outputs.ts";
import {
  TYPE_SCALE,
  displayClearsMinimum,
  stepsFor,
  typeChoiceFor,
  typeScaleFor,
  typeWorldFrom,
} from "../src/brand/type-scale.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRUTALIST = ["## Vibe", "", "A brutalist poster.", ""].join("\n");
const PRODUCT = ["## Vibe", "", "product, one family", ""].join("\n");
const EDITORIAL = ["## Vibe", "", "editorial", ""].join("\n");
const CINEMATIC = [
  "## Vibe",
  "",
  "Bold tech shader world.",
  "",
  "## Motion",
  "",
  "Motion score: 9. Pinned scroll stories.",
  "",
  "## Pages",
  "",
  "Home (hero, story)",
  "",
].join("\n");
const QUIET = [
  "## Vibe",
  "",
  "Calm editorial, warm and specific.",
  "",
  "## Motion",
  "",
  "Motion score: 2. Polished, not a spectacle.",
  "",
].join("\n");

test("each world ratio and the steps that clear its display minimum are the appendix table", () => {
  assert.equal(TYPE_SCALE.editorial.ratio, 1.333);
  assert.equal(TYPE_SCALE.editorial.minDisplayOverBody, 3.2);
  assert.equal(TYPE_SCALE["3d-world"].ratio, 1.414);
  assert.equal(TYPE_SCALE["3d-world"].minDisplayOverBody, 3.5);
  assert.equal(TYPE_SCALE.playful.ratio, 1.25);
  assert.equal(TYPE_SCALE.playful.minDisplayOverBody, 2.6);
  assert.equal(TYPE_SCALE.brutalist.ratio, 1.5);
  assert.equal(TYPE_SCALE.brutalist.minDisplayOverBody, 4);
  assert.equal(TYPE_SCALE.product.ratio, 1.2);
  assert.equal(TYPE_SCALE.product.minDisplayOverBody, 2.2);
  assert.equal(TYPE_SCALE.fashion.ratio, 1.414);
  assert.equal(TYPE_SCALE.fashion.minDisplayOverBody, 3.5);
  assert.equal(TYPE_SCALE.civic.ratio, 1.25);
  assert.equal(TYPE_SCALE.civic.minDisplayOverBody, 2.6);
  for (const world of Object.keys(TYPE_SCALE) as (keyof typeof TYPE_SCALE)[]) {
    const spec = TYPE_SCALE[world];
    const steps = stepsFor(world);
    assert.ok(spec.ratio ** steps >= spec.minDisplayOverBody, world);
    assert.ok(steps === 1 || spec.ratio ** (steps - 1) < spec.minDisplayOverBody, world);
  }
  assert.equal(stepsFor("editorial"), 5);
  assert.equal(stepsFor("brutalist"), 4);
  assert.equal(stepsFor("product"), 5);
});

test("type world reads product, fashion, and civic, and brutalist wins over fashion", () => {
  assert.equal(typeWorldFrom("brutalist fashion poster"), "brutalist");
  assert.equal(typeWorldFrom("fashion, sharp"), "fashion");
  assert.equal(typeWorldFrom("Bold tech shader world"), "3d-world");
  assert.equal(typeWorldFrom("tech startup"), "product");
  assert.equal(typeWorldFrom("product, one family"), "product");
  assert.equal(typeWorldFrom("civic public notice"), "civic");
  assert.equal(typeWorldFrom("playful food"), "playful");
  assert.equal(typeWorldFrom("Calm editorial, warm and specific."), "editorial");
});

test("a brutalist fixture whose display is under 4× the body fails", () => {
  assert.equal(displayClearsMinimum("brutalist", 63, 16), false);
  assert.equal(displayClearsMinimum("brutalist", 64, 16), true);
  assert.equal(displayClearsMinimum("brutalist", 32, 16), false);
  assert.equal(displayClearsMinimum("editorial", 51, 16), false);
  assert.equal(displayClearsMinimum("editorial", 52, 16), true);
  assert.equal(displayClearsMinimum("brutalist", 0, 16), false);
});

test("a named face wins, and a markdown brief does not treat headings as families", () => {
  const garamond = typeChoiceFor("Use Garamond");
  assert.deepEqual(garamond.families, ["Garamond"]);
  assert.equal(garamond.source, "user");
  const inter = typeChoiceFor("Use Inter");
  assert.deepEqual(inter.families, ["Inter"]);
  assert.equal(inter.source, "user");
  const brutalist = typeChoiceFor(BRUTALIST);
  assert.deepEqual(brutalist.families, ["Tanker", "Cabinet Grotesk"]);
  assert.equal(brutalist.pairId, 32);
  const one = typeChoiceFor(PRODUCT);
  assert.deepEqual(one.families, ["Switzer"]);
  assert.equal(one.pairId, 22);
});

test("DESIGN.md names the dealt families and the world ratio, with fluid clamps", () => {
  const brutal = renderDesignMd(BRUTALIST);
  assert.match(brutal, /## Type scale/);
  assert.match(brutal, /Families: Tanker and Cabinet Grotesk\./);
  assert.match(brutal, /Ratio: 1\.5/);
  assert.match(brutal, /World: brutalist/);
  assert.match(brutal, /Display over body minimum: 4/);
  assert.match(brutal, /clamp\(4rem,/);
  assert.match(brutal, /line-height 1\.5/);
  assert.equal(brutal.includes("Switzer and Switzer"), false);
  assert.equal(brutal.includes("!"), false);

  const product = renderDesignMd(PRODUCT);
  assert.match(product, /Families: Switzer\./);
  assert.equal(product.includes("Switzer and Switzer"), false);
  assert.match(product, /Ratio: 1\.2/);
  assert.match(product, /World: product/);

  const editorial = renderDesignMd(EDITORIAL);
  assert.match(editorial, /Families: Boska and General Sans\./);
  assert.match(editorial, /Ratio: 1\.333/);

  const cinematic = renderDesignMd(CINEMATIC);
  assert.match(cinematic, /Families: Technor and Excon\./);
  assert.match(cinematic, /Ratio: 1\.414/);
  assert.match(cinematic, /World: 3d-world/);
  assert.match(cinematic, /Reveal duration: 1\.2s/);
  assert.match(cinematic, /Any appropriate library/);

  const quiet = renderDesignMd(QUIET);
  assert.match(quiet, /Families: Gambarino and Author\./);
  assert.match(quiet, /Ratio: 1\.333/);
  assert.match(quiet, /Reveal duration: 0\.6s/);

  const scale = typeScaleFor(BRUTALIST);
  assert.equal(scale.steps, 4);
  assert.equal(scale.bodyMinRem, 1);
  assert.equal(scale.bodyMaxRem, 1.125);
  assert.equal(scale.displayMinRem, 4);
  assert.ok(Math.abs(scale.displayMaxRem - 1.125 * 1.5 ** 4) < 1e-9);
  assert.match(brutal, new RegExp(escapeRegExp(scale.display)));
  assert.match(brutal, new RegExp(escapeRegExp(scale.body)));
});

test("type voice keeps its sentence and gains the family names", () => {
  const brutal = translateBrief(BRUTALIST);
  assert.match(brutal.typeVoice, /raw grotesque display/);
  assert.match(brutal.typeVoice, /Tanker/);
  assert.match(brutal.typeVoice, /Cabinet Grotesk/);
  const bold = translateBrief(["## Vibe", "", "Bold, tech, dark.", ""].join("\n"));
  assert.match(bold.typeVoice, /geometric sans/);
  assert.match(bold.typeVoice, /Instrument Serif/);
  assert.match(bold.typeVoice, /Instrument Sans/);
  assert.doesNotMatch(bold.typeVoice, /large serif/);
  assert.doesNotMatch(JSON.stringify(bold), /large serif/);
  const named = translateBrief("Use Fraunces for the headlines.");
  assert.match(named.typeVoice, /Fraunces/);
  assert.match(named.typeVoice, /Instrument Sans/);
});

test("writeDesignMd persists the brief-derived scale", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-type-scale-"));
  try {
    writeDesignMd(dir, BRUTALIST);
    const design = readFileSync(path.join(dir, DESIGN_MD_PATH), "utf8");
    assert.match(design, /Families: Tanker and Cabinet Grotesk\./);
    assert.match(design, /Ratio: 1\.5/);
  } finally {
    removeTempDir(dir);
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
