import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyHandsOn, type SkillLevel } from "../src/guide/skill-level.ts";
import { loadTree, type Question } from "../src/tree.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const skillPath = path.resolve(here, "..", "..", "grok-plugin", "skills", "guide-persona", "SKILL.md");
const cassetteDir = path.join(here, "cassettes", "guide");

const RUNG = /\brung\b/i;

const OPTION_LEVEL: ReadonlyArray<{ label: string; text: string; level: SkillLevel }> = [
  { label: "(a)", text: "I design how it looks, but someone else builds it.", level: "pro" },
  {
    label: "(b)",
    text: "I build pages myself in a site builder like Wix, Squarespace or Webflow.",
    level: "intermediate",
  },
  { label: "(c)", text: "I write the code myself (HTML, CSS, JavaScript).", level: "developer" },
  { label: "(d)", text: "I'm brand new to all of this.", level: "beginner" },
];

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

test("each hands-on option classifies to its level, and brand new is the lowest", () => {
  const question = byId(loadTree(treeFile), "DP-0.3");
  const order: readonly SkillLevel[] = ["beginner", "intermediate", "pro", "developer"];
  for (const option of OPTION_LEVEL) {
    assert.equal(classifyHandsOn(option.text), option.level, option.label);
    assert.equal(classifyHandsOn(`${option.label} ${option.text}`), option.level, option.label);
  }
  assert.equal(classifyHandsOn("I'm brand new to all of this."), "beginner");
  assert.equal(classifyHandsOn(question.skipDefault), "beginner");
  assert.equal(question.levels?.beginner, "explain");
  assert.equal(order[0], "beginner");
  for (const option of OPTION_LEVEL) {
    if (option.level === "beginner") continue;
    assert.ok(order.indexOf(option.level) > 0, option.level);
  }
  assert.equal(classifyHandsOn("new to it"), "beginner");
  assert.equal(classifyHandsOn("New to it."), "beginner");
  assert.equal(classifyHandsOn("used a site builder"), "intermediate");
  assert.equal(classifyHandsOn("design or build sites"), "pro");
  assert.equal(classifyHandsOn("write code"), "developer");
});

test("the guide cassette asks the same hands-on question", () => {
  const product = byId(loadTree(treeFile), "DP-0.3");
  const cassette = byId(loadTree(path.join(cassetteDir, "tree.yaml")), "DP-0.3");
  assert.equal(cassette.ask, product.ask);
  assert.equal(cassette.why, product.why);
  assert.equal(cassette.suggest, product.suggest);
  assert.equal(cassette.skipDefault, product.skipDefault);
});

test("user-facing tree, persona, and guide cassettes do not say rung", () => {
  const files = [
    treeFile,
    skillPath,
    ...readdirSync(cassetteDir).map((name) => path.join(cassetteDir, name)),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(RUNG.test(text), false, file);
  }
});
