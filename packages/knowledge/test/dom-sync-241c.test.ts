/**
 * BUG-052 harness idea 34. The DOM-synced WebGL recipe is a knowledge pack.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packDir = path.join(here, "..", "packs", "three");

function fenceLineCount(markdown: string): number {
  const match = /```[^\n]*\n([\s\S]*?)```/.exec(markdown);
  if (match?.[1] === undefined) return 0;
  return match[1].split("\n").filter((line) => line.length > 0).length;
}

test("the three pack ships a DOM-synced WebGL recipe", () => {
  const skill = readFileSync(path.join(packDir, "SKILL.md"), "utf8");
  const recipe = readFileSync(path.join(packDir, "dom-sync.md"), "utf8");
  const meta = parsePack(skill);
  assert.ok(meta.paths.includes("packages/knowledge/packs/three/dom-sync.md"));
  assert.deepEqual(lintPackClaims(recipe), []);
  assert.match(recipe, /position:\s*absolute/);
  assert.match(recipe, /inset:\s*0/);
  assert.match(recipe, /scroll/i);
  assert.match(recipe, /pointer/i);
  assert.match(recipe, /ScrollTrigger\.refresh/);
  assert.match(recipe, /document\.fonts\.ready/);
  assert.match(recipe, /teardown/);
  assert.match(recipe, /geometries/);
  assert.match(recipe, /materials/);
  assert.match(recipe, /textures/);
  assert.match(recipe, /tier/i);
  assert.match(recipe, /Width does not select the still/);
  assert.doesNotMatch(recipe, /no webgl on phones/i);
  assert.ok(fenceLineCount(recipe) < 40, `fence is ${fenceLineCount(recipe)} lines`);
  assert.match(skill, /Width does not select the still/);
});
