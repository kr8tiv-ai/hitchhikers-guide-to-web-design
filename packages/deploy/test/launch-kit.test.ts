import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Evidence } from "@hitchhiker/engine";
import * as kit from "../src/launch-kit.ts";
import { renderLaunchKit } from "../src/launch-kit.ts";

const DO_NOT_POST = "Do not post this until a human sends it.";

const empty: Evidence = { quotes: [], awards: [], numbers: [] };

const sourcePath = fileURLToPath(new URL("../src/launch-kit.ts", import.meta.url));

function render(overrides: Partial<Parameters<typeof renderLaunchKit>[0]> = {}): string {
  return renderLaunchKit({
    name: "North Glass",
    offer: "hand-cut glass",
    url: null,
    evidence: empty,
    ...overrides,
  });
}

function section(markdown: string, title: string): string {
  const marker = `## ${title}`;
  const start = markdown.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

test("a clean offer returns a draft with the do-not-post line", () => {
  const markdown = render();
  assert.match(markdown, /^# Launch kit\n/);
  const noteAt = markdown.indexOf("## Note");
  const captionAt = markdown.indexOf("## Caption");
  const listAt = markdown.indexOf("## Checklist");
  assert.ok(noteAt >= 0 && captionAt > noteAt && listAt > captionAt);
  assert.match(section(markdown, "Caption"), /North Glass/);
  assert.match(section(markdown, "Caption"), /hand-cut glass/);
  assert.doesNotMatch(section(markdown, "Caption"), /\bstars?\b/i);
  assert.equal(markdown.includes(DO_NOT_POST), true);
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.toLowerCase().includes("testimonial"), false);
});

test("a null url says the domain is not set and does not print null", () => {
  const markdown = render({ url: null });
  assert.match(markdown, /The domain is not set\./);
  assert.equal(markdown.includes("null"), false);
  assert.equal(markdown.includes("]("), false);
  assert.equal(markdown.includes("http://"), false);
  assert.equal(markdown.includes("https://"), false);
});

test("a url is included and the missing-domain line is omitted", () => {
  const markdown = render({ url: "https://north.example" });
  assert.match(section(markdown, "Note"), /https:\/\/north\.example/);
  assert.equal(markdown.includes("The domain is not set."), false);
  assert.equal(markdown.includes("null"), false);
  assert.equal(markdown.includes("!"), false);
  assert.equal(markdown.includes(DO_NOT_POST), true);
});

test("offer 5 stars with empty evidence throws", () => {
  assert.throws(
    () => render({ offer: "5 stars" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /stars/);
      return true;
    },
  );
});

test("award-winning copy and an unproven percent throw", () => {
  assert.throws(() => render({ offer: "award-winning glass" }), /award-winning/);
  assert.throws(() => render({ offer: "glass at 40% off the old rate" }), /percent/);
});

test("a quoted star phrase in evidence can be drafted", () => {
  const markdown = render({
    offer: "rated 5 stars by the night crew",
    evidence: {
      quotes: ["rated 5 stars by the night crew"],
      awards: [],
      numbers: [],
    },
  });
  assert.match(section(markdown, "Caption"), /5 stars/);
  assert.equal(markdown.includes(DO_NOT_POST), true);
});

test("a name longer than 60 characters throws and 60 is kept", () => {
  assert.throws(() => render({ name: "A".repeat(61) }), /longer than 60/);
  const markdown = render({ name: "A".repeat(60) });
  assert.match(markdown, new RegExp(`A{60}`));
  assert.equal(markdown.includes("!"), false);
});

test("an exclamation mark in an input is rejected", () => {
  assert.throws(() => render({ name: "North Glass!" }), /exclamation/);
  assert.throws(() => render({ offer: "cut slow!" }), /exclamation/);
  assert.throws(() => render({ url: "https://north.example/go!" }), /exclamation/);
});

test("empty name, empty offer, and a blank url throw", () => {
  assert.throws(() => render({ name: "  " }), /name is empty/);
  assert.throws(() => render({ offer: "\n" }), /offer is empty/);
  assert.throws(() => render({ url: "  " }), /url is empty/);
});

test("the module exports renderLaunchKit and does not post", () => {
  assert.equal(typeof kit.renderLaunchKit, "function");
  assert.equal(typeof renderLaunchKit, "function");
  assert.equal("post" in kit, false);
  assert.equal("tweet" in kit, false);
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.match(source, /lintClaims\(/);
  assert.match(source, /lintBrandClaims/);
  assert.equal(source.includes("x-oauth"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("writeFile"), false);
  assert.equal(/\bfunction\s+post\b/.test(source), false);
  assert.equal(/\bfunction\s+tweet\b/.test(source), false);
  assert.equal(/\btweet\s*\(/.test(source), false);
});
