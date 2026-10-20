/**
 * BUG-058 idea 32. A library section renders from props.
 * Two runs with the same props share markup bytes. The model is not called.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { landmarkSequence, sectionFixtureRoot } from "@hitchhiker/engine";
import {
  renderLibrarySection,
  renderReferencedSections,
  sectionMarkupBytes,
  type LibrarySectionProps,
} from "../src/section-render.ts";

const props: LibrarySectionProps = {
  words: "The plate is wide.",
  imageCredit: "Photo by A. Example.",
  display: "Fraunces",
  body: "Literata",
};

test("two runs with the same props produce the same markup bytes", () => {
  const first = renderLibrarySection("asymmetric-editorial-grid", props);
  const second = renderLibrarySection("asymmetric-editorial-grid", { ...props });
  assert.equal(first, second);
  assert.equal(sectionMarkupBytes("asymmetric-editorial-grid", props).equals(sectionMarkupBytes("asymmetric-editorial-grid", secondProps())), true);
  assert.deepEqual(landmarkSequence(first), ["asymmetric-editorial-grid", "image", "column"]);
  assert.deepEqual(landmarkSequence(renderLibrarySection("three-hero", props)), [
    "three-hero",
    "canvas-hero",
    "poster",
    "caption",
  ]);

  const fixture = readFileSync(path.join(sectionFixtureRoot(), "asymmetric-editorial-grid.html"), "utf8");
  assert.equal(first.includes("The narrow column sits beside the image."), false);
  assert.notEqual(first.trim(), fixture.trim());

  let calls = 0;
  const rendered = renderReferencedSections("@section:asymmetric-editorial-grid", { "asymmetric-editorial-grid": props }, () => {
    calls += 1;
    return "<div data-landmark=\"injected\">from the model</div>";
  });
  assert.equal(calls, 0);
  assert.equal(rendered, first);
  const again = renderReferencedSections("@section:asymmetric-editorial-grid", { "asymmetric-editorial-grid": props });
  assert.equal(again, rendered);
  assert.equal(Buffer.from(again, "utf8").equals(Buffer.from(rendered, "utf8")), true);

  const both = renderReferencedSections(
    "@section:three-hero\n@section:asymmetric-editorial-grid",
    { "three-hero": props, "asymmetric-editorial-grid": props },
  );
  const bothAgain = renderReferencedSections(
    "@section:three-hero\n@section:asymmetric-editorial-grid",
    { "three-hero": props, "asymmetric-editorial-grid": props },
  );
  assert.equal(both, bothAgain);
  assert.deepEqual(landmarkSequence(both), [
    "three-hero",
    "canvas-hero",
    "poster",
    "caption",
    "asymmetric-editorial-grid",
    "image",
    "column",
  ]);

  const plain = renderReferencedSections("Build the home page.", {});
  assert.equal(plain, '<main data-landmark="page"></main>');
  assert.equal(calls, 0);
});

test("props cannot rewrite the section markup", () => {
  const html = renderLibrarySection("three-hero", {
    ...props,
    words: '<div data-landmark="injected">x</div>',
    imageCredit: '" onload="nope',
  });
  assert.equal(html.includes('data-landmark="injected"'), false);
  assert.equal(html.includes("<div"), false);
  assert.deepEqual(landmarkSequence(html), ["three-hero", "canvas-hero", "poster", "caption"]);
});

function secondProps(): LibrarySectionProps {
  return {
    body: props.body,
    display: props.display,
    imageCredit: props.imageCredit,
    words: props.words,
  };
}
