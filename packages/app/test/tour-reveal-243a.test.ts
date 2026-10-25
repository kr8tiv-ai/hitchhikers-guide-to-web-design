/**
 * BUG-067. Opening the tour scrolls it to the start of the viewport and focuses its heading.
 * Reduced motion uses an instant scroll. Mounting the tour still does not steal focus.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { revealTour, type TourDocument, type TourNode } from "../src/client/tour.ts";

test("revealTour scrolls to the start and focuses the heading", () => {
  const seen: { block?: string; behavior?: string }[] = [];
  let focused = "";
  const heading: TourNode = {
    focus(options) {
      focused = options?.preventScroll === true ? "heading" : "heading-scroll";
    },
  };
  const tour: TourNode = {
    scrollIntoView(options) {
      seen.push({ block: options?.block, behavior: options?.behavior });
    },
    querySelector(selector: string) {
      return selector === "#hh-tour-heading" ? heading : null;
    },
    focus() {
      focused = "tour";
    },
  };
  const doc: TourDocument = {
    querySelector(selector: string) {
      return selector === "[data-tour]" ? tour : null;
    },
  };
  const prior = globalThis.matchMedia;
  globalThis.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as typeof matchMedia;
  try {
    revealTour(doc, undefined, true);
    assert.equal(seen[0]?.block, "start");
    assert.equal(seen[0]?.behavior, "auto");
    assert.equal(focused, "heading");
    focused = "";
    seen.length = 0;
    globalThis.matchMedia = (() => ({ matches: false, media: "" })) as typeof matchMedia;
    revealTour(doc, undefined, true);
    assert.equal(seen[0]?.behavior, "smooth");
    assert.equal(focused, "heading");
  } finally {
    if (prior === undefined) delete (globalThis as { matchMedia?: unknown }).matchMedia;
    else globalThis.matchMedia = prior;
  }
});
