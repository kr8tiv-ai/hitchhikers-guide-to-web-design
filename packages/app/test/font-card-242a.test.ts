/**
 * BUG-047. Each sample names its face and shows a specimen until that face loads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderCard, type CardState } from "../src/card.ts";
import type { Question } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASK = "Do you have fonts you use? If not, pick a style from these examples.";

function question(): Question {
  return {
    id: "DP-1.5",
    module: "ford-field-notes",
    depth: ["deep"],
    ask: ASK,
    why: "Type is the look.",
    input: ["text"],
    skipDefault: "Pick one of the samples.",
    writes: ["BRAND.md#type"],
  };
}

test("font samples reference the named face or a specimen, and the fallback is labelled", () => {
  const state: CardState = { question: question(), draft: "", pushback: null, error: null, done: false, pending: false };
  const html = renderCard(state);
  assert.match(html, /data-display="Gambetta"/);
  assert.match(html, /data-body="Synonym"/);
  assert.match(html, /Gambetta \+ Synonym/);
  assert.match(html, /data-font-sample="brutalist poster"/);
  assert.match(html, /hh-type-sample__specimen/);
  assert.match(html, /data:image\/svg\+xml/);
  assert.match(html, /hh-type-sample__approx" hidden>approximate preview/);
  assert.equal(html.includes("Impact"), false);
  assert.equal(html.includes("Arial Narrow"), false);
  const css = readFileSync(path.join(here, "..", "src", "card.css"), "utf8");
  assert.match(css, /font-family:\s*"Gambetta"/);
  assert.match(css, /src:\s*local\("Gambetta"\)/);
  assert.match(css, /data-font-fallback="approx"/);
  assert.match(css, /approximate preview|hh-type-sample__approx/);
  assert.equal(css.includes("Impact"), false);
  assert.equal(css.includes("Arial Narrow"), false);
});
