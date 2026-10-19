/**
 * BUG-022. The DP-5.2 card links to the gallery in every wording.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function question(ask: string): Question {
  return {
    id: "DP-5.2",
    module: "point-of-view-gun",
    depth: ["express", "standard", "deep"],
    ask,
    why: "The ten-site walk is the gallery instruction, not the saved board.",
    input: ["choice", "text", "voice"],
    skipDefault: "No gallery walk.",
    writes: ["SITE-BRIEF.md#references"],
  };
}

function card(ask: string): CardState {
  return {
    question: question(ask),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
}

test("the DP-5.2 card links to the gallery for both wordings", () => {
  const css = readFileSync(path.resolve(here, "../src/card.css"), "utf8");
  assert.match(css, /\.hh-qcard__gallery:focus-visible/);
  for (const ask of [
    "No favorites yet? Let's look at a few sites together. Say love, meh, or hate.",
    "You named Patagonia, Aesop, Kinfolk and Airbnb Luxe. Let's look at a few more sites together. Say love, meh, or hate.",
  ]) {
    const html = renderCard(card(ask));
    assert.match(html, /href="\/gallery"/);
    assert.match(html, />Open the gallery</);
    assert.equal(html.includes('target="_blank"'), false);
    assert.match(html, ask.startsWith("You named") ? /You named Patagonia/ : /No favorites yet\?/);
  }
  const other = renderCard({
    ...card("Do you have a logo you love?"),
    question: { ...question("Do you have a logo you love?"), id: "DP-1.1" },
  });
  assert.equal(other.includes('href="/gallery"'), false);
});
