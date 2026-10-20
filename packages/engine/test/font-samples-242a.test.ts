/**
 * BUG-047. Font samples are library pairs, dealt from mood, never the overused defaults.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OVERUSED_DEFAULTS, TYPE_LIBRARY, dealFontSamples, isOverusedFamily } from "../src/brand/tokens.ts";

test("dealt font samples name real library pairs and skip overused defaults", () => {
  const canned = dealFontSamples("");
  assert.equal(canned.length, 6);
  assert.equal(canned[0]?.display, "Gambetta");
  assert.equal(canned[0]?.body, "Synonym");
  assert.equal(canned[0]?.pair, "Gambetta + Synonym");
  assert.equal(canned[2]?.adjectives, "brutalist poster");
  for (const sample of canned) assertLibrary(sample.display, sample.body);
  const dealt = dealFontSamples("calm, warm, honest editorial publishing");
  assert.equal(dealt.length, 6);
  for (const sample of dealt) assertLibrary(sample.display, sample.body);
  for (const name of OVERUSED_DEFAULTS) {
    assert.equal(
      dealt.some((sample) => sample.display.toLowerCase() === name.toLowerCase() || sample.body.toLowerCase() === name.toLowerCase()),
      false,
      name,
    );
  }
});

function assertLibrary(display: string, body: string): void {
  assert.equal(isOverusedFamily(display), false, display);
  assert.equal(isOverusedFamily(body), false, body);
  assert.equal(
    TYPE_LIBRARY.some((pair) => pair.display === display && pair.body === body),
    true,
    `${display} + ${body}`,
  );
}
