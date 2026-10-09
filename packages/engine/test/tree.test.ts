import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { TreeError, loadTree, questionsForDepth } from "../src/index.ts";
import type { Question } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

const TOWEL = [
  "DP-0.1",
  "DP-0.2",
  "DP-0.2a",
  "DP-0.3",
  "DP-0.4",
  "DP-0.5",
  "DP-0.6",
  "DP-0.7",
] as const;

const FORD = [
  "DP-1.1",
  "DP-1.2",
  "DP-1.3",
  "DP-1.4",
  "DP-1.5",
  "DP-1.6",
  "DP-1.7",
  "DP-1.8",
  "DP-1.9",
] as const;

const PAIRINGS = [
  "Bebas Neue + Barlow",
  "Space Grotesk + Inter",
  "DM Serif Display + DM Sans",
  "Fraunces + Work Sans",
  "Archivo Black + Archivo",
  "Clash Display + Satoshi",
] as const;

const EM_DASH = "\u2014";

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function expectTreeError(body: string, field: string, pattern: RegExp): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-tree-"));
  const file = path.join(dir, "tree.yaml");
  try {
    writeFileSync(file, body, "utf8");
    assert.throws(
      () => loadTree(file),
      (error: unknown) => {
        assert.ok(error instanceof TreeError);
        assert.equal(error.field, field);
        assert.match(error.message, pattern);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function questionBlock(id: string): string {
  return `  - id: ${id}
    module: towel-check
    depth: [deep]
    ask: "Ask."
    why: "Why."
    input: [text]
    skip_default: "Default."
    writes:
      - "NOTES.md#field"`;
}

test("modules towel-check and ford-field-notes list every module 0 and 1 id once", () => {
  const all = loadTree(treeFile);
  const towel = all.filter((question) => question.module === "towel-check").map((question) => question.id);
  const ford = all
    .filter((question) => question.module === "ford-field-notes")
    .map((question) => question.id);
  assert.deepEqual(towel, [...TOWEL]);
  assert.deepEqual(ford, [...FORD]);
  for (const id of [...TOWEL, ...FORD]) {
    assert.equal(all.filter((question) => question.id === id).length, 1, id);
    const question = byId(all, id);
    assert.ok(question.skipDefault.trim().length > 0, id);
    assert.ok(question.writes.length > 0, id);
  }
  assert.equal(all.some((question) => question.id === "DP-1.7b"), false);
});

test("depth is a filter and express drops DP-0.5 without dropping the id", () => {
  const all = loadTree(treeFile);
  const express = questionsForDepth(all, "express");
  const positions = express.map((question) => all.findIndex((item) => item.id === question.id));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.equal(new Set(positions).size, positions.length);
  assert.equal(express.some((question) => question.id === "DP-0.5"), false);
  assert.equal(questionsForDepth(all, "standard").some((question) => question.id === "DP-0.5"), true);
  assert.equal(questionsForDepth(all, "deep").some((question) => question.id === "DP-0.5"), true);
  assert.equal(byId(all, "DP-0.5").skipDefault, "No X connection.");
  assert.deepEqual(byId(all, "DP-0.5").depth, ["standard", "deep"]);
  for (const id of [...TOWEL, ...FORD]) {
    if (id === "DP-0.5") continue;
    assert.deepEqual(byId(all, id).depth, ["express", "standard", "deep"], id);
  }
});

test("DP-0.7 offers Deep, then Standard, then Express, and skips to Deep", () => {
  const question = byId(loadTree(treeFile), "DP-0.7");
  const deepAt = question.ask.indexOf("Deep (the full Guide, recommended)");
  const standardAt = question.ask.indexOf("Standard");
  const expressAt = question.ask.indexOf("Express");
  assert.ok(deepAt >= 0);
  assert.ok(deepAt < standardAt);
  assert.ok(standardAt < expressAt);
  assert.equal(question.skipDefault, "Deep");
  assert.match(question.why, /Every mode keeps every id/);
  assert.match(question.why, /Express only writes ASSUMED defaults for what it does not ask/);
  assert.match(question.suggest ?? "", /Standard/);
});

test("DP-0.3 names four comfort rungs", () => {
  const ask = byId(loadTree(treeFile), "DP-0.3").ask;
  assert.match(ask, /new to it/i);
  assert.match(ask, /site builder/i);
  assert.match(ask, /design or build/i);
  assert.match(ask, /write code/i);
});

test("DP-1.5 suggest names the six font pairings", () => {
  const suggest = byId(loadTree(treeFile), "DP-1.5").suggest ?? "";
  for (const pairing of PAIRINGS) {
    assert.ok(suggest.includes(pairing), pairing);
  }
});

test("DP-1.2 why treats color psychology as mixed research", () => {
  const why = byId(loadTree(treeFile), "DP-1.2").why;
  assert.match(why, /color psychology/i);
  assert.match(why, /mixed/i);
  assert.match(why, /does not have one emotion for all cultures/i);
  assert.doesNotMatch(why, /\b(red|blue|green|yellow|purple|black|white|orange) means\b/i);
});

test("asks and follow-ups contain no exclamation mark or em dash", () => {
  const all = loadTree(treeFile);
  for (const question of all) {
    assert.equal(question.ask.includes("!"), false, question.id);
    assert.equal(question.ask.includes(EM_DASH), false, question.id);
    for (const follow of question.followUps ?? []) {
      assert.equal(follow.ask.includes("!"), false, follow.id);
      assert.equal(follow.ask.includes(EM_DASH), false, follow.id);
    }
  }
});

test("Miro follow-ups for logo, type, and voice are present", () => {
  const all = loadTree(treeFile);
  const logo = byId(all, "DP-1.1").followUps?.map((follow) => follow.ask) ?? [];
  const type = byId(all, "DP-1.5").followUps?.map((follow) => follow.ask) ?? [];
  const voice = byId(all, "DP-1.6").followUps?.map((follow) => follow.ask) ?? [];
  assert.ok(logo.includes("Are you happy with it?"));
  assert.ok(logo.includes("Want suggestions or an improved version?"));
  assert.ok(type.includes("Send screenshots of fonts you like, or I can show you pairings"));
  assert.ok(
    voice.includes(
      "Which brands' voices do you like? I can suggest 5 to 10 that speak to your customers",
    ),
  );
});

test("DP-1.7 is the brand why, with the Why Finder as follow-ups, not a second id", () => {
  const all = loadTree(treeFile);
  const question = byId(all, "DP-1.7");
  const follows = question.followUps?.map((follow) => follow.ask) ?? [];
  assert.equal(question.ask, "Why did you build this, and what is the origin story?");
  assert.match(question.why, /brand why/i);
  assert.ok(question.writes.some((target) => target.startsWith("BRAND.md")));
  assert.equal(question.writes.some((target) => target.startsWith("SITE-BRIEF.md")), false);
  assert.ok(follows.includes("Do you understand your why?"));
  assert.ok(follows.includes("Let's find it with the Golden Circle"));
  assert.equal(all.some((item) => item.id === "DP-1.7b"), false);
});

test("quoted colons, hashes, and nested fields survive the loader", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-tree-"));
  const file = path.join(dir, "tree.yaml");
  try {
    writeFileSync(
      file,
      `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express, standard, deep] # modes
    ask: "Time today: how long?"
    why: "A note: keep the colon."
    input: [text, voice]
    skip_default: "Generate logo concepts in Babel Fish."
    suggest: "Three directions: wordmark, symbol, or combination."
    pushback_if:
      - "it's fine"
    follow_ups:
      - id: DP-T.1a
        ask: "Are you happy with it?"
    levels:
      beginner: explain
      pro: terse
    required_for:
      - babel-fish.logo
    writes:
      - "BRAND.md#logo"
`,
      "utf8",
    );
    const question = loadTree(file)[0];
    assert.ok(question);
    assert.equal(question.ask, "Time today: how long?");
    assert.equal(question.why, "A note: keep the colon.");
    assert.equal(question.skipDefault, "Generate logo concepts in Babel Fish.");
    assert.equal(question.suggest, "Three directions: wordmark, symbol, or combination.");
    assert.deepEqual(question.writes, ["BRAND.md#logo"]);
    assert.deepEqual(question.pushbackIf, ["it's fine"]);
    assert.deepEqual(question.followUps, [{ id: "DP-T.1a", ask: "Are you happy with it?" }]);
    assert.deepEqual(question.levels, { beginner: "explain", pro: "terse" });
    assert.deepEqual(question.requiredFor, ["babel-fish.logo"]);
    assert.deepEqual(question.depth, ["express", "standard", "deep"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the real logo row keeps its hash anchor, pushback, and levels", () => {
  const logo = byId(loadTree(treeFile), "DP-1.1");
  assert.ok(logo.writes.includes("BRAND.md#logo"));
  assert.ok(logo.pushbackIf?.includes("it's fine"));
  assert.deepEqual(logo.levels, { beginner: "explain", pro: "terse" });
  assert.match(logo.suggest ?? "", /Three directions:/);
  assert.equal(logo.skipDefault, "Generate logo concepts in Babel Fish.");
});

test("DP-1.4 caps mood images at 5 and asks why for each", () => {
  const ask = byId(loadTree(treeFile), "DP-1.4").ask;
  assert.match(ask, /\b5\b/);
  assert.match(ask, /why/i);
});

test("duplicate ids throw TreeError", () => {
  expectTreeError(
    `questions:\n${questionBlock("DP-T.1")}\n${questionBlock("DP-T.1")}\n`,
    "id",
    /duplicate id DP-T\.1/,
  );
});

test("a question missing writes throws and does not return earlier rows", () => {
  expectTreeError(
    `questions:
${questionBlock("DP-T.1")}
  - id: DP-T.2
    module: towel-check
    depth: [express]
    ask: "Second."
    why: "Because."
    input: [text]
    skip_default: "Later."
`,
    "writes",
    /DP-T\.2: missing writes/,
  );
});

test("empty writes throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express]
    ask: "Ask."
    why: "Why."
    input: [text]
    skip_default: "Default."
    writes: []
`,
    "writes",
    /writes is empty/,
  );
});

test("empty skip_default throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express]
    ask: "Ask."
    why: "Why."
    input: [text]
    skip_default: ""
    writes:
      - "NOTES.md#field"
`,
    "skip_default",
    /skip_default is empty/,
  );
});

test("an unknown depth token throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express, galaxy]
    ask: "Ask."
    why: "Why."
    input: [text]
    skip_default: "Default."
    writes:
      - "NOTES.md#field"
`,
    "depth",
    /unknown depth token galaxy/,
  );
});

test("an unknown input token throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express]
    ask: "Ask."
    why: "Why."
    input: [telepathy]
    skip_default: "Default."
    writes:
      - "NOTES.md#field"
`,
    "input",
    /unknown input token telepathy/,
  );
});

test("a missing ask throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express]
    why: "Why."
    input: [text]
    skip_default: "Default."
    writes:
      - "NOTES.md#field"
`,
    "ask",
    /missing ask/,
  );
});

test("tabs in the tree throw", () => {
  expectTreeError("questions:\n\t- id: DP-T.1\n", "yaml", /tabs are not allowed/);
});

test("a non-https resource url throws", () => {
  expectTreeError(
    `questions:
  - id: DP-T.1
    module: towel-check
    depth: [express]
    ask: "Ask."
    why: "Why."
    input: [text]
    skip_default: "Default."
    resources:
      - label: Example
        url: "http://example.com"
        note: "Not a secure link."
    writes:
      - "NOTES.md#field"
`,
    "resources",
    /resource url must be https/,
  );
});
