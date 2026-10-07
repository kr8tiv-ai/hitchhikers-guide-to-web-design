import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildStory, buildTeardown, compileWhy } from "../src/index.ts";
import type { AnswerRecord } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const teardownSource = path.resolve(here, "..", "src", "brand", "teardown.ts");
const barrelSource = path.resolve(here, "..", "src", "brand", "index.ts");
const packageSource = path.resolve(here, "..", "src", "index.ts");

const SHARED_REPORT = [
  "# Competitors",
  "",
  "A shared title pattern: home remodeling.",
  "",
  "## https://a.example",
  "",
  "- URL: https://a.example",
  "- Title: Our shared studio",
  "- H1: No h1 found",
  "- Stack: webflow",
  "- Loved for: _",
  "",
  "Search volumes are not estimated.",
  "",
].join("\n");

const NO_PATTERN_REPORT = [
  "# Competitors",
  "",
  "No shared title pattern in this set.",
  "",
  "## https://b.example",
  "",
  "- URL: https://b.example",
  "- Title: Night stall",
  "",
].join("\n");

const UNSCORED_REPORT = ["# Competitors", "", "- Title: Night stall", "- URL: https://c.example", ""].join("\n");

function section(markdown: string, title: string): string {
  const marker = `## ${title}\n`;
  const start = markdown.indexOf(marker);
  assert.ok(start >= 0, title);
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.trim();
}

function answer(id: string, value: string): AnswerRecord {
  return { id, status: "ANSWERED", value };
}

test("two Wish lines produce two white spaces and the third section does not say none", () => {
  const result = buildTeardown({
    reportMarkdown: SHARED_REPORT,
    envy: "Their grid is quiet.\nWish: a night menu on the door",
    boredom: "Wish: hours beside the map",
  });
  assert.deepEqual(result.whiteSpaces, ["a night menu on the door", "hours beside the map"]);
  assert.deepEqual(result.parked, []);
  const white = section(result.markdown, "White space");
  assert.equal(white, "- a night menu on the door\n- hours beside the map");
  assert.equal(white.includes("none"), false);
  assert.equal(white.includes("No white space recorded yet."), false);
  assert.equal(result.markdown.includes("## Parked"), false);
  assert.equal(section(result.markdown, "Sameness"), "A shared title pattern: home remodeling.");
  assert.equal(section(result.markdown, "Envy"), "Their grid is quiet.\nWish: a night menu on the door");
  assert.equal(section(result.markdown, "Boredom"), "Wish: hours beside the map");
  assert.equal(result.markdown.includes("https://a.example"), false);
  assert.equal(result.markdown.includes("Search volumes"), false);
  assert.equal(result.markdown.includes("Our shared studio"), false);
});

test("no Wish lines produce the empty sentence and zero white spaces", () => {
  const result = buildTeardown({
    reportMarkdown: NO_PATTERN_REPORT,
    envy: "Their grid is quiet.",
    boredom: "Stock smiles on the homepage.",
  });
  assert.deepEqual(result.whiteSpaces, []);
  assert.deepEqual(result.parked, []);
  assert.equal(section(result.markdown, "White space"), "No white space recorded yet.");
  assert.equal(section(result.markdown, "Sameness"), "No shared title pattern in this set.");
  assert.equal(result.markdown.includes("## Parked"), false);
  assert.equal(result.markdown.toLowerCase().includes("premium"), false);
  assert.equal(result.markdown.toLowerCase().includes("authentic"), false);
});

test("five Wish lines produce three plus two parked", () => {
  const envy = ["one", "two", "three"].map((name) => `Wish: space ${name}`).join("\n");
  const boredom = ["four", "five"].map((name) => `Wish: space ${name}`).join("\n");
  const result = buildTeardown({ reportMarkdown: UNSCORED_REPORT, envy, boredom });
  assert.deepEqual(result.whiteSpaces, ["space one", "space two", "space three"]);
  assert.deepEqual(result.parked, ["space four", "space five"]);
  assert.equal(section(result.markdown, "White space"), "- space one\n- space two\n- space three");
  assert.equal(section(result.markdown, "Parked"), "- space four\n- space five");
  assert.equal(section(result.markdown, "White space").includes("space four"), false);
  assert.equal(section(result.markdown, "Sameness"), "Sameness was not computed.");
});

test("an empty Wish body is ignored", () => {
  const result = buildTeardown({
    reportMarkdown: "",
    envy: "Wish:\nWish:   \nWish:\t\nWish: a real door",
    boredom: "Wish:",
  });
  assert.deepEqual(result.whiteSpaces, ["a real door"]);
  assert.deepEqual(result.parked, []);
});

test("a 1000 character wish is clipped to 240 with three periods", () => {
  const body = "a".repeat(1000);
  const result = buildTeardown({
    reportMarkdown: "",
    envy: `Wish: ${body}`,
    boredom: "",
  });
  const wish = result.whiteSpaces[0] ?? "";
  assert.equal(result.whiteSpaces.length, 1);
  assert.equal(wish.length, 240);
  assert.equal(wish, `${"a".repeat(237)}...`);
  assert.equal(wish.includes("\u2026"), false);
  assert.equal(wish.endsWith("..."), true);
  const exact = buildTeardown({
    reportMarkdown: "",
    envy: `Wish: ${"b".repeat(240)}`,
    boredom: "",
  });
  assert.equal(exact.whiteSpaces[0], "b".repeat(240));
  assert.equal(exact.whiteSpaces[0]?.endsWith("..."), false);
});

test("envy and boredom quotes cap at 240 characters", () => {
  const result = buildTeardown({
    reportMarkdown: "",
    envy: "e".repeat(1000),
    boredom: `  ${"b".repeat(1000)}  `,
  });
  const envy = section(result.markdown, "Envy");
  const boredom = section(result.markdown, "Boredom");
  assert.equal(envy.length, 240);
  assert.equal(envy, `${"e".repeat(237)}...`);
  assert.equal(boredom.length, 240);
  assert.equal(boredom, `${"b".repeat(237)}...`);
  assert.equal(envy.includes("\u2026"), false);
});

test("a Wish line already in the report is a white space and envy comes first", () => {
  const result = buildTeardown({
    reportMarkdown: `${NO_PATTERN_REPORT}\nWish: from the report\n`,
    envy: "Wish: from envy",
    boredom: "Wish: from boredom",
  });
  assert.deepEqual(result.whiteSpaces, ["from envy", "from boredom", "from the report"]);
  assert.deepEqual(result.parked, []);
});

test("the same wish in envy, boredom, and the report is kept once", () => {
  const result = buildTeardown({
    reportMarkdown: "Wish: from envy",
    envy: "Wish: from envy",
    boredom: "Wish: from envy",
  });
  assert.deepEqual(result.whiteSpaces, ["from envy"]);
  assert.deepEqual(result.parked, []);
  assert.equal(section(result.markdown, "White space"), "- from envy");
});

test("a fourth wish is parked when four lines are present", () => {
  const lines = ["one", "two", "three", "four"].map((name) => `Wish: space ${name}`).join("\n");
  const result = buildTeardown({ reportMarkdown: "", envy: lines, boredom: "" });
  assert.deepEqual(result.whiteSpaces, ["space one", "space two", "space three"]);
  assert.deepEqual(result.parked, ["space four"]);
  assert.equal(section(result.markdown, "Parked"), "- space four");
});

test("a report line that contains shared is quoted when the pattern sentence is absent", () => {
  const result = buildTeardown({
    reportMarkdown: "- Title: Our shared studio\n- URL: https://d.example",
    envy: "",
    boredom: "",
  });
  assert.equal(section(result.markdown, "Sameness"), "- Title: Our shared studio");
  assert.equal(result.markdown.includes("https://d.example"), false);
});

test("two shared title patterns are both copied", () => {
  const report = ["A shared title pattern: home remodeling.", "A shared title pattern: pipe fitting."].join("\n");
  const result = buildTeardown({ reportMarkdown: report, envy: "", boredom: "" });
  assert.equal(
    section(result.markdown, "Sameness"),
    "A shared title pattern: home remodeling.\nA shared title pattern: pipe fitting.",
  );
});

test("markdown is not html escaped and script openers are stripped", () => {
  const result = buildTeardown({
    reportMarkdown: "A shared title pattern: home <script>remodeling.",
    envy: "Tom & Jerry <em>tea</em> <SCRIPT>alert(1)</script>",
    boredom: "Wish: a <script>door\nWish: <script",
  });
  assert.equal(result.markdown.includes("<script"), false);
  assert.equal(result.markdown.includes("<SCRIPT"), false);
  assert.equal(result.markdown.includes("&amp;"), false);
  assert.equal(result.markdown.includes("&lt;"), false);
  assert.ok(result.markdown.includes("Tom & Jerry <em>tea</em>"));
  assert.ok(result.markdown.includes(">alert(1)</script>"));
  assert.deepEqual(result.whiteSpaces, ["a >door"]);
  assert.equal(section(result.markdown, "Sameness"), "A shared title pattern: home >remodeling.");
});

test("a wish keeps premium when the user wrote it", () => {
  const result = buildTeardown({
    reportMarkdown: "",
    envy: "Wish: a premium night menu",
    boredom: "The authentic line stays only because the user wrote authentic.",
  });
  assert.deepEqual(result.whiteSpaces, ["a premium night menu"]);
  assert.ok(section(result.markdown, "Boredom").includes("authentic"));
});

test("carriage returns still split Wish lines", () => {
  const result = buildTeardown({
    reportMarkdown: "",
    envy: "Wish: first door\r\nWish: second door",
    boredom: "Wish: third door\rfourth stays prose",
  });
  assert.deepEqual(result.whiteSpaces, ["first door", "second door", "third door"]);
  assert.equal(section(result.markdown, "Boredom").includes("fourth stays prose"), true);
});

test("a mid-line wish is not a white space", () => {
  const result = buildTeardown({
    reportMarkdown: "",
    envy: "I wrote Wish: inside a sentence",
    boredom: "- Wish: bullet form",
  });
  assert.deepEqual(result.whiteSpaces, []);
  assert.equal(section(result.markdown, "White space"), "No white space recorded yet.");
});

test("buildTeardown does not modify story output and does not import a network client", () => {
  const answers = [
    answer("DP-2.1", "The stall exists so regulars can find the tea."),
    answer("DP-2.6", "a night regular"),
    answer("DP-2.7", "a tin of tea"),
  ];
  const draft = compileWhy(answers);
  const before = buildStory({ answers, why: draft, name: "Night Stall" });
  const first = buildTeardown({
    reportMarkdown: SHARED_REPORT,
    envy: "Wish: a night menu",
    boredom: "Stock smiles.",
  });
  const second = buildTeardown({
    reportMarkdown: SHARED_REPORT,
    envy: "Wish: a night menu",
    boredom: "Stock smiles.",
  });
  const after = buildStory({ answers, why: draft, name: "Night Stall" });
  assert.deepEqual(before, after);
  assert.deepEqual(first, second);
  const source = readFileSync(teardownSource, "utf8");
  const barrel = readFileSync(barrelSource, "utf8");
  const entry = readFileSync(packageSource, "utf8");
  assert.match(barrel, /buildTeardown/);
  assert.match(entry, /buildTeardown/);
  assert.equal(source.includes("from \""), false);
  assert.equal(source.includes("from '"), false);
  assert.equal(/require\s*\(/.test(source), false);
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("playwright"), false);
  assert.equal(source.includes("@hitchhiker/crawler"), false);
  assert.equal(source.includes("story.ts"), false);
  assert.equal(/\bany\b/.test(source), false);
  assert.equal(source.includes("\u2026"), false);
});
