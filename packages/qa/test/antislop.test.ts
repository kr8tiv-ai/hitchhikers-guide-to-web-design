import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BANNED_PHRASES, BANNED_WORDS } from "@hitchhiker/engine";
import { lintSlop } from "../src/antislop.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packPath = path.join(here, "..", "..", "knowledge", "packs", "anti-slop", "SKILL.md");

const CLEAN = "Where is the maple floor?";

test("empty text returns no hits", () => {
  assert.deepEqual(lintSlop("", "site"), []);
  assert.deepEqual(lintSlop("", "guide"), []);
});

test("lorem fails in both modes", () => {
  const site = lintSlop("Lorem ipsum sits in the hero.", "site");
  const guide = lintSlop("The caption still says lorem.", "guide");
  assert.deepEqual(site, [{ line: 1, rule: "lorem" }]);
  assert.deepEqual(guide, [{ line: 1, rule: "lorem" }]);
});

test("an exclamation mark fails", () => {
  assert.deepEqual(lintSlop("Ready!", "site"), [{ line: 1, rule: "exclamation" }]);
  assert.deepEqual(lintSlop("Ready!", "guide"), [{ line: 1, rule: "exclamation" }]);
});

test("guide mode allows the command and the product title", () => {
  assert.deepEqual(lintSlop("Run /hh-elevate when the draft is quiet.", "guide"), []);
  assert.deepEqual(lintSlop("The Hitchhiker's Guide keeps Elevate as a name.", "guide"), []);
  assert.deepEqual(
    lintSlop("The Hitchhiker\u2019s Guide keeps Elevate as a name.", "guide"),
    [],
  );
});

test("other guide lines still flag elevate", () => {
  assert.deepEqual(lintSlop("Please elevate your brand.", "guide"), [
    { line: 1, rule: "elevate" },
  ]);
  assert.deepEqual(lintSlop("We will Elevate the type on Tuesday.", "guide"), [
    { line: 1, rule: "elevate" },
  ]);
});

test("site mode flags elevate your brand and the command line", () => {
  assert.deepEqual(lintSlop("Please elevate your brand.", "site"), [
    { line: 1, rule: "elevate" },
  ]);
  assert.deepEqual(lintSlop("Run /hh-elevate when the draft is quiet.", "site"), [
    { line: 1, rule: "elevate" },
  ]);
  assert.deepEqual(lintSlop("The Hitchhiker's Guide keeps Elevate as a name.", "site"), [
    { line: 1, rule: "elevate" },
  ]);
  assert.deepEqual(lintSlop("ELEVATE the headline.", "site"), [{ line: 1, rule: "elevate" }]);
});

test("a guide exemption does not hide lorem", () => {
  assert.deepEqual(lintSlop("The Hitchhiker's Guide still refuses lorem.", "guide"), [
    { line: 1, rule: "lorem" },
  ]);
  assert.deepEqual(lintSlop("Run /hh-elevate.\nLorem stays banned.", "guide"), [
    { line: 2, rule: "lorem" },
  ]);
});

test("a purple gradient in the banned palette fails", () => {
  assert.deepEqual(lintSlop("linear-gradient(#4f46e5, #7c3aed)", "site"), [
    { line: 1, rule: "purple-gradient" },
  ]);
  assert.deepEqual(lintSlop("linear-gradient(#4f46e5, #7c3aed)", "guide"), [
    { line: 1, rule: "purple-gradient" },
  ]);
  const wrapped = ["background:", "  linear-gradient(", "    #4f46e5,", "    #7c3aed", "  );"].join(
    "\n",
  );
  assert.deepEqual(lintSlop(wrapped, "site"), [{ line: 2, rule: "purple-gradient" }]);
});

test("a warm gradient and a blue-to-white gradient pass", () => {
  assert.deepEqual(lintSlop("linear-gradient(#8e2f1a, #e6a15c)", "site"), []);
  assert.deepEqual(lintSlop("linear-gradient(#2563eb, #ffffff)", "guide"), []);
});

test("a normal sentence without bans returns an empty list", () => {
  assert.deepEqual(lintSlop(CLEAN, "site"), []);
  assert.deepEqual(lintSlop(CLEAN, "guide"), []);
});

test("line numbers are 1-based", () => {
  const hits = lintSlop("Clean line.\nStill clean.\nLorem in the third line.", "guide");
  assert.deepEqual(hits, [{ line: 3, rule: "lorem" }]);
  assert.deepEqual(lintSlop("\nLorem", "site"), [{ line: 2, rule: "lorem" }]);
});

test("an em dash fails and a hyphen does not", () => {
  assert.deepEqual(lintSlop("The tea is cold \u2014 pour another.", "site"), [
    { line: 1, rule: "em-dash" },
  ]);
  assert.deepEqual(lintSlop("The tea is cold - pour another.", "site"), []);
  assert.deepEqual(lintSlop("A well-known kiln.", "guide"), []);
  assert.deepEqual(lintSlop("The tea is cold \u2013 pour another.", "site"), []);
  assert.deepEqual(lintSlop("Pages 4-12 are the menu.", "site"), []);
  assert.deepEqual(lintSlop("The tea is cold &mdash; pour another.", "guide"), [
    { line: 1, rule: "em-dash" },
  ]);
});

test("elevation, elevated, and a longer word do not match elevate", () => {
  assert.deepEqual(lintSlop("The elevation is 700 metres.", "site"), []);
  assert.deepEqual(lintSlop("The elevation is 700 metres.", "guide"), []);
  assert.deepEqual(lintSlop("An elevated kiln.", "site"), []);
  assert.deepEqual(lintSlop("He unlocks the door.", "site"), []);
  assert.deepEqual(lintSlop("Landscapes of the valley.", "guide"), []);
});

test("hype words and phrases match the voice list", () => {
  for (const word of BANNED_WORDS) {
    if (word === "elevate") continue;
    const hits = lintSlop(`The ${word} line.`, "site");
    assert.ok(
      hits.some((hit) => hit.rule === `word:${word}` && hit.line === 1),
      word,
    );
  }
  for (const phrase of BANNED_PHRASES) {
    const hits = lintSlop(phrase, "guide");
    assert.ok(
      hits.some((hit) => hit.rule === `phrase:${phrase}`),
      phrase,
    );
  }
  const curly = lintSlop("In today\u2019s fast-paced world the kiln is booked.", "site");
  assert.ok(curly.some((hit) => hit.rule === "phrase:in today's fast-paced world"));
});

test("indigo utilities, gray-50, and the centered container fail", () => {
  assert.deepEqual(lintSlop('<button class="bg-indigo-600">Book a tasting</button>', "site"), [
    { line: 1, rule: "indigo" },
  ]);
  assert.deepEqual(lintSlop("hover:text-indigo-400", "guide"), [{ line: 1, rule: "indigo" }]);
  assert.deepEqual(lintSlop("bg-gray-50", "site"), [{ line: 1, rule: "gray-50" }]);
  assert.deepEqual(lintSlop("bg-gray-500", "site"), []);
  assert.deepEqual(
    lintSlop('<main class="max-w-7xl mx-auto text-center">', "guide"),
    [{ line: 1, rule: "centered-container" }],
  );
});

test("magnetic and pointer in one file fail, either word alone does not", () => {
  const text = ["cursor: pointer;", "pull the magnetic control"].join("\n");
  assert.deepEqual(lintSlop(text, "site"), [{ line: 2, rule: "magnetic" }]);
  assert.deepEqual(lintSlop(text, "guide"), [{ line: 2, rule: "magnetic" }]);
  assert.deepEqual(lintSlop("const magnetic = true;", "site"), []);
  assert.deepEqual(lintSlop("cursor: pointer;", "guide"), []);
  assert.deepEqual(
    lintSlop("button.addEventListener('pointermove', moveMagnetic);", "site"),
    [{ line: 1, rule: "magnetic" }],
  );
});

test("guide mode does not flag the anti-slop pack discussion", () => {
  const pack = readFileSync(packPath, "utf8");
  assert.deepEqual(lintSlop(pack, "guide"), []);
  const site = lintSlop(pack, "site");
  assert.ok(site.some((hit) => hit.rule === "lorem"));
  assert.ok(site.some((hit) => hit.rule === "elevate"));
  assert.ok(site.some((hit) => hit.rule === "magnetic"));
});

test("naming the pack does not grant an exemption", () => {
  assert.deepEqual(lintSlop("The anti-slop note still rejects lorem.", "guide"), [
    { line: 1, rule: "lorem" },
  ]);
});

test("an unknown mode throws", () => {
  assert.throws(
    () => lintSlop(CLEAN, "review" as "site"),
    /lintSlop mode must be "site" or "guide"/,
  );
});
