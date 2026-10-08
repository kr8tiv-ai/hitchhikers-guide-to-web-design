/**
 * Frozen Towel & Tea eval. The loader lives here so the engine gains no
 * production API. Replay uses interview records and the why compiler.
 * Nothing in this file calls a model or the network.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compileWhy, missingRequired, renderBrief, requiredIds } from "../src/index.ts";
import type { AnswerRecord } from "../src/index.ts";
import { contrastRatio, passes } from "../src/brand/tokens.ts";
import { loadTree } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtureDir = path.join(repoRoot, "evals", "towel-and-tea");

const STATUSES: readonly AnswerRecord["status"][] = [
  "ANSWERED",
  "SUGGESTED",
  "SKIPPED",
  "SOFT",
  "IMPORTED",
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is AnswerRecord["status"] {
  return typeof value === "string" && STATUSES.some((status) => status === value);
}

function readJson(dir: string, name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown;
}

function answersFrom(raw: unknown): AnswerRecord[] {
  if (!isRecord(raw)) throw new Error("transcript.json must be an object.");
  const turns = raw["turns"];
  if (!Array.isArray(turns)) throw new Error("transcript.json turns must be an array.");
  const answers: AnswerRecord[] = [];
  for (const turn of turns) {
    if (!isRecord(turn)) throw new Error("transcript.json turn must be an object.");
    const id = turn["id"];
    const status = turn["status"];
    const value = turn["value"];
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("transcript.json turn is missing an id.");
    }
    if (!isStatus(status)) throw new Error(`transcript.json turn ${id} has a bad status.`);
    if (typeof value !== "string") {
      throw new Error(`transcript.json turn ${id} value must be a string.`);
    }
    answers.push({ id, status, value });
  }
  return answers;
}

function briefFrom(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) throw new Error("expected-brief.json must be an object.");
  const brief: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new Error(`expected-brief.json ${key} must be a string.`);
    }
    brief[key] = value;
  }
  return brief;
}

export function loadFixture(dir: string): { answers: AnswerRecord[]; brief: Record<string, string> } {
  return {
    answers: answersFrom(readJson(dir, "transcript.json")),
    brief: briefFrom(readJson(dir, "expected-brief.json")),
  };
}

function loadBrand(dir: string): { paper: string; ink: string } {
  const raw = readJson(dir, "expected-brand.json");
  if (!isRecord(raw)) throw new Error("expected-brand.json must be an object.");
  const paper = raw["paper"];
  const ink = raw["ink"];
  if (typeof paper !== "string" || paper.trim() === "") {
    throw new Error("expected-brand.json paper is empty.");
  }
  if (typeof ink !== "string" || ink.trim() === "") {
    throw new Error("expected-brand.json ink is empty.");
  }
  return { paper, ink };
}

test("the Towel and Tea fixture fills every required id", () => {
  const raw = readJson(fixtureDir, "transcript.json");
  assert.ok(isRecord(raw));
  assert.equal(raw["client"], "Towel & Tea");
  assert.equal(raw["kind"], "fictional loose-leaf shop");

  const { answers, brief } = loadFixture(fixtureDir);
  assert.deepEqual(
    answers.map((answer) => answer.id),
    [...requiredIds()],
  );
  assert.deepEqual(Object.keys(brief), [...requiredIds()]);
  assert.deepEqual(missingRequired(answers), []);

  for (const id of requiredIds()) {
    const expected = brief[id];
    assert.equal(typeof expected, "string");
    assert.notEqual(expected?.trim(), "");
    const answer = answers.find((item) => item.id === id);
    assert.ok(answer);
    assert.equal(answer.value, expected);
    assert.notEqual(answer.value.trim(), "");
    assert.equal(answer.status, id === "DP-6.2" ? "SKIPPED" : "ANSWERED");
  }

  const tree = loadTree(path.join(repoRoot, "interview", "tree.yaml"));
  const motion = tree.find((question) => question.id === "DP-6.2");
  assert.ok(motion);
  assert.equal(brief["DP-6.2"], motion.skipDefault);
  assert.equal(brief["DP-2.6"], "Visitor wants a tin.");
  assert.equal(brief["DP-2.2"], "buy");
  assert.match(brief["DP-5.3"] ?? "", /\bearthy\b/);
  assert.match(brief["DP-5.3"] ?? "", /\bneon\b/);
  assert.equal(brief["DP-9.2"], "no idea");
});

test("replay through the brief and why compilers matches the fixture", () => {
  const { answers, brief } = loadFixture(fixtureDir);
  const rendered = renderBrief(answers);
  for (const id of requiredIds()) {
    const value = brief[id];
    assert.equal(typeof value, "string");
    assert.ok(rendered.includes(value ?? ""));
  }
  assert.match(rendered, /ASSUMED/);
  assert.match(
    rendered,
    /Coverage: 5 answered, 0 suggested, 1 skipped, 0 soft, 0 imported\./,
  );

  const draft = compileWhy(answers);
  assert.equal(draft.siteWhy, brief["DP-2.1"]);
  assert.equal(draft.status, "ASSUMED");
  assert.equal(draft.siteWhy.includes("!"), false);
});

test("expected ink on paper clears body contrast", () => {
  const brand = loadBrand(fixtureDir);
  const ratio = contrastRatio(brand.ink, brand.paper);
  assert.equal(passes(ratio, "body"), true);
  assert.ok(ratio >= 4.5);
});

test("the fixture has no exclamation, no email, no Aura Homes, and no live call", () => {
  const names = ["transcript.json", "expected-brief.json", "expected-brand.json"] as const;
  const blob = names
    .map((name) => readFileSync(path.join(fixtureDir, name), "utf8"))
    .join("\n");
  assert.equal(blob.includes("!"), false);
  assert.equal(EMAIL.test(blob), false);
  assert.equal(blob.includes("Aura Homes"), false);
  assert.equal(blob.includes("Date.now"), false);
  assert.equal(blob.includes("fetch("), false);
  assert.equal(blob.includes("xai-"), false);
  assert.equal(blob.includes("Bearer "), false);
  assert.equal(blob.includes("sk-"), false);

  const transcript = readFileSync(path.join(fixtureDir, "transcript.json"), "utf8");
  assert.equal(transcript.includes("!"), false);
  assert.equal(EMAIL.test(transcript), false);
});
