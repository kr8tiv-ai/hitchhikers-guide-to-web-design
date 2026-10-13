/**
 * BUG-007. The first-five-minutes tour must not take focus on load.
 * A short or narrow viewport focuses the question heading. A tall desktop focuses the answer box.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { questionFocusTarget } from "../src/client/desk.ts";
import { mountTour, type TourDocument, type TourNode } from "../src/client/tour.ts";

test("mountTour does not focus the tour", () => {
  let focused = 0;
  const tour: TourNode = {
    focus() {
      focused += 1;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const doc: TourDocument = {
    querySelector(selector: string) {
      return selector === "[data-tour]" ? tour : null;
    },
  };
  const stop = mountTour(doc);
  stop();
  assert.equal(focused, 0);
});

test("a short or narrow viewport focuses the question heading", () => {
  assert.equal(questionFocusTarget(1024, 640), "heading");
  assert.equal(questionFocusTarget(390, 800), "heading");
  assert.equal(questionFocusTarget(1280, 800), "draft");
});
