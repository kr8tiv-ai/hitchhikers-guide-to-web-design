import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SITE_TYPES, loadTree } from "../src/index.ts";
import type { Question } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

const QUESTION = [
  "DP-2.1",
  "DP-2.2",
  "DP-2.3",
  "DP-2.4",
  "DP-2.5",
  "DP-2.6",
  "DP-2.7",
  "DP-2.8",
] as const;

const TOOLS = [
  "DP-3.1",
  "DP-3.2",
  "DP-3.3",
  "DP-3.4",
  "DP-3.5",
  "DP-3.6",
  "DP-3.7",
  "DP-3.8",
  "DP-3.9",
] as const;

const VOGON = ["DP-4.1", "DP-4.2", "DP-4.3", "DP-4.4", "DP-4.5"] as const;

const POV = ["DP-5.1", "DP-5.2", "DP-5.3", "DP-5.4", "DP-5.5", "DP-5.6"] as const;

const NAMED_TYPES = [
  "sales",
  "funnel",
  "calls",
  "reservations",
  "sign-ups",
  "portfolio",
  "content",
  "local",
  "event",
  "personal",
  "nonprofit",
  "recruiting",
  "investor",
  "app",
] as const;

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

test("modules 2 through 5 list every id once from the same tree file", () => {
  const all = loadTree(treeFile);
  const ids = {
    "the-question": all.filter((question) => question.module === "the-question").map((question) => question.id),
    tools: all.filter((question) => question.module === "tools").map((question) => question.id),
    "vogon-neighbors": all
      .filter((question) => question.module === "vogon-neighbors")
      .map((question) => question.id),
    "point-of-view-gun": all
      .filter((question) => question.module === "point-of-view-gun")
      .map((question) => question.id),
  };
  assert.deepEqual(ids["the-question"], [...QUESTION]);
  assert.deepEqual(ids.tools, [...TOOLS]);
  assert.deepEqual(ids["vogon-neighbors"], [...VOGON]);
  assert.deepEqual(ids["point-of-view-gun"], [...POV]);
  for (const id of [...QUESTION, ...TOOLS, ...VOGON, ...POV]) {
    assert.equal(all.filter((question) => question.id === id).length, 1, id);
    const question = byId(all, id);
    assert.ok(question.skipDefault.trim().length > 0, id);
    assert.ok(question.writes.length > 0, id);
    assert.equal(question.ask.includes("%"), false, id);
    assert.equal(question.why.includes("%"), false, id);
  }
  assert.equal(all.some((question) => question.id === "DP-3.2a"), false);
  assert.equal(all.some((question) => question.module === "towel-check"), true);
  assert.equal(all.some((question) => question.module === "ford-field-notes"), true);
  assert.equal(all[0]?.id, "DP-0.1");
});

test("SITE_TYPES matches the named list and carries no percent or digit", () => {
  // Prompt step 2 says thirteen. The named list and the v1 table have fourteen.
  assert.equal(SITE_TYPES.length, NAMED_TYPES.length);
  assert.equal(SITE_TYPES.length, 14);
  assert.deepEqual(
    SITE_TYPES.map((hint) => hint.id),
    [...NAMED_TYPES],
  );
  for (const hint of SITE_TYPES) {
    assert.equal(`${hint.id}${hint.kpi}${hint.pack}`.includes("%"), false, hint.id);
    assert.equal(/\d/.test(hint.kpi), false, hint.kpi);
    assert.equal(/\d/.test(hint.pack), false, hint.pack);
    assert.ok(hint.kpi.trim().length > 0, hint.id);
    assert.ok(hint.pack.trim().length > 0, hint.id);
    assert.doesNotMatch(hint.kpi, /volume|percent|conversion rate/i);
  }
});

test("DP-2.3 ask names every SITE_TYPES id and points suggest at that list", () => {
  const question = byId(loadTree(treeFile), "DP-2.3");
  assert.deepEqual(question.input, ["choice", "text"]);
  let cursor = 0;
  for (const hint of SITE_TYPES) {
    const at = question.ask.indexOf(hint.id, cursor);
    assert.ok(at >= cursor, hint.id);
    cursor = at + hint.id.length;
  }
  assert.match(question.suggest ?? "", /The engine will offer these types/);
  assert.match(question.why, /sales-psychology/);
  assert.match(question.why, /\bseo\b/);
  assert.match(question.why, /ux-conversion/);
  assert.match(question.why, /words/);
});

test("DP-2.1 writes SITE-BRIEF.md and DP-2.4 labels ranges as assumptions", () => {
  const all = loadTree(treeFile);
  assert.ok(byId(all, "DP-2.1").writes.some((target) => target.includes("SITE-BRIEF.md")));
  const kpis = byId(all, "DP-2.4");
  assert.ok(kpis.writes.includes("KPIS.md"));
  assert.match(kpis.why, /Ranges are assumptions/);
  assert.equal(/\d/.test(kpis.why), false);
  assert.equal(kpis.ask.includes("%"), false);
});

test("DP-3.2 escalates a full store and skips to contact or content", () => {
  const question = byId(loadTree(treeFile), "DP-3.2");
  assert.equal(question.skipDefault, "No store. Contact or content only.");
  assert.ok(question.pushbackIf?.includes("shopify store"));
  assert.ok(question.pushbackIf?.includes("full store"));
  assert.match(question.suggest ?? "", /Stripe Payment Links/);
  assert.match(question.suggest ?? "", /Shopify Buy Button/);
  assert.match(question.suggest ?? "", /full store escalates/i);
  assert.match(question.why, /escalat/i);
  assert.match(question.why, /full store/i);
  assert.match(question.why, /not the default build/);
});

test("DP-3.7 says discovery is approval-gated", () => {
  const why = byId(loadTree(treeFile), "DP-3.7").why;
  assert.match(why, /Discovery is approval-gated/);
});

test("DP-4.1 records COMPETITORS.md and DP-4.3 forbids invented volumes", () => {
  const all = loadTree(treeFile);
  assert.ok(byId(all, "DP-4.1").writes.some((target) => target.includes("COMPETITORS.md")));
  const keywords = byId(all, "DP-4.3");
  assert.ok(keywords.why.includes("Do not invent search volumes."));
  assert.equal(keywords.why.includes("%"), false);
  assert.equal(/\d/.test(keywords.why), false);
  assert.doesNotMatch(keywords.ask, /\d[\d,]*\s*(searches|volume)/i);
});

test("DP-4.5 does not promise answer-engine citations", () => {
  const question = byId(loadTree(treeFile), "DP-4.5");
  const blob = `${question.ask}\n${question.why}\n${question.suggest ?? ""}`;
  assert.match(question.why, /does not promise citations/);
  assert.doesNotMatch(blob, /will be cited|guaranteed citation|promise you a citation/i);
});

test("DP-5.1 asks for three to five, and the ten-site walk stays on DP-5.2", () => {
  const all = loadTree(treeFile);
  const loved = byId(all, "DP-5.1").ask;
  assert.match(loved, /three to five/);
  assert.doesNotMatch(loved, /\bten\b/i);
  assert.doesNotMatch(loved, /\b10\b/);
  const walk = byId(all, "DP-5.2");
  assert.match(walk.why, /ten-site walk is the gallery instruction, not the saved board/);
  assert.match(walk.why, /three to five/);
  const signature = byId(all, "DP-5.4");
  assert.match(signature.ask, /signature moment/);
  const last = signature.followUps?.[signature.followUps.length - 1];
  assert.equal(last?.ask.includes("signature moment"), true);
});
