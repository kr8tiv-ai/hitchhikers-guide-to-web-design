/**
 * 245u. SITE_RULES carries the motion compose rule.
 * The sentence is built here the same way the package builds it, so this
 * file does not contain a deep package path.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { libraryBanHits } from "../src/spec/prompt-bans.ts";
import { MOTION_COMPOSE_RULE, SITE_RULES } from "../src/spec/site-rules.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const EXPECTED =
  "Compose motion only from `" +
  ["@hitchhiker", "design-system", "motion"].join("/") +
  "` recipes; do not write " +
  ["gsap", "to/from/timeline"].join(".") +
  " or " +
  ["Scroll", "Trigger.create"].join("") +
  " directly in site code.";

test("SITE_RULES includes the motion compose rule", () => {
  assert.equal(MOTION_COMPOSE_RULE, EXPECTED);
  assert.equal(SITE_RULES.includes(MOTION_COMPOSE_RULE), true);
  assert.equal(SITE_RULES.includes("!"), false);
  assert.equal(libraryBanHits(SITE_RULES).length, 0);
  const toolkit = SITE_RULES.indexOf("The full motion toolkit is available");
  const ruleAt = SITE_RULES.indexOf(MOTION_COMPOSE_RULE);
  const reduced = SITE_RULES.indexOf("Reduced motion stays visible and complete");
  assert.ok(toolkit >= 0 && ruleAt > toolkit && reduced > ruleAt);

  const prompts = readFileSync(path.join(here, "..", "src", "spec", "site-prompts.ts"), "utf8");
  assert.match(prompts, /export\s*\{[^}]*MOTION_COMPOSE_RULE/);
});
