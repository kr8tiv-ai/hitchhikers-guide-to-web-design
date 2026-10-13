/**
 * BUG-006. No suggested option is selected until the person picks one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderChoiceGroup, type CardChoiceSet } from "../src/card.ts";

test("a choice group renders with nothing checked", () => {
  const set: CardChoiceSet = {
    forId: "DP-1.1",
    origin: "model",
    items: [
      { id: "A", label: "The logo is paradise-found-logo.png", why: "It is the file on hand.", source: "upload:paradise-found-logo.png" },
      { id: "B", label: "The mark is paradise-found-mark.png", why: "It is the other file.", source: "upload:paradise-found-mark.png" },
    ],
  };
  const html = renderChoiceGroup(set);
  assert.equal(html.includes('aria-checked="true"'), false);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /data-choice-id="A"/);
  assert.match(html, /aria-checked="false"/);
});
