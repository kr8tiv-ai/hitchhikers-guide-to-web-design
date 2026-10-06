import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree, questionsForDepth } from "../src/index.ts";
import type { Question } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

/**
 * Question ids from CONTEXT-PACKAGE.v2.md section 8.3, modules 0 through 9.
 * Follow-up ids inside a question are not rows. Guide Entry is not an id.
 */
const EXPECTED_IDS = [
  "DP-0.1",
  "DP-0.2",
  "DP-0.2a",
  "DP-0.3",
  "DP-0.4",
  "DP-0.5",
  "DP-0.6",
  "DP-0.7",
  "DP-1.1",
  "DP-1.2",
  "DP-1.3",
  "DP-1.4",
  "DP-1.5",
  "DP-1.6",
  "DP-1.7",
  "DP-1.8",
  "DP-1.9",
  "DP-2.1",
  "DP-2.2",
  "DP-2.3",
  "DP-2.4",
  "DP-2.5",
  "DP-2.6",
  "DP-2.7",
  "DP-2.8",
  "DP-3.1",
  "DP-3.2",
  "DP-3.3",
  "DP-3.4",
  "DP-3.5",
  "DP-3.6",
  "DP-3.7",
  "DP-3.8",
  "DP-3.9",
  "DP-4.1",
  "DP-4.2",
  "DP-4.3",
  "DP-4.4",
  "DP-4.5",
  "DP-5.1",
  "DP-5.2",
  "DP-5.3",
  "DP-5.4",
  "DP-5.5",
  "DP-5.6",
  "DP-6.1",
  "DP-6.2",
  "DP-6.3",
  "DP-6.4",
  "DP-6.5",
  "DP-6.6",
  "DP-7.1",
  "DP-7.2",
  "DP-7.3",
  "DP-8.1",
  "DP-8.2",
  "DP-8.3",
  "DP-8.4",
  "DP-9.1",
  "DP-9.2",
  "DP-9.3",
  "DP-9.4",
  "DP-9.5",
] as const;

const PAN_GALACTIC = ["DP-6.1", "DP-6.2", "DP-6.3", "DP-6.4", "DP-6.5", "DP-6.6"] as const;
const BISTROMATHICS = ["DP-7.1", "DP-7.2", "DP-7.3"] as const;
const CONTENT = ["DP-8.1", "DP-8.2", "DP-8.3", "DP-8.4"] as const;
const LIMITS = ["DP-9.1", "DP-9.2", "DP-9.3", "DP-9.4", "DP-9.5"] as const;

const TOOLS = ["CSS", "GSAP", "Three", "OGL", "Theatre", "Motion", "anime.js", "vanilla"] as const;

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

test("the tree lists every v2 id from DP-0.1 through DP-9.5 once, including DP-0.2a", () => {
  const all = loadTree(treeFile);
  assert.deepEqual(
    all.map((question) => question.id),
    [...EXPECTED_IDS],
  );
  assert.equal(all.some((question) => question.id === "DP-0.2a"), true);
  assert.equal(all.some((question) => question.id === "DP-GE"), false);
  assert.equal(all.some((question) => question.id === "DP-3.2a"), false);
  assert.equal(all.some((question) => question.id === "DP-1.7b"), false);
  const modules = {
    "pan-galactic": all.filter((question) => question.module === "pan-galactic").map((question) => question.id),
    bistromathics: all
      .filter((question) => question.module === "bistromathics")
      .map((question) => question.id),
    content: all.filter((question) => question.module === "content").map((question) => question.id),
    limits: all.filter((question) => question.module === "limits").map((question) => question.id),
  };
  assert.deepEqual(modules["pan-galactic"], [...PAN_GALACTIC]);
  assert.deepEqual(modules.bistromathics, [...BISTROMATHICS]);
  assert.deepEqual(modules.content, [...CONTENT]);
  assert.deepEqual(modules.limits, [...LIMITS]);
});

test("DP-6.1 names the eight tools and says magnetic buttons are banned", () => {
  const question = byId(loadTree(treeFile), "DP-6.1");
  const suggest = question.suggest ?? "";
  for (const tool of TOOLS) {
    assert.ok(suggest.includes(tool), tool);
  }
  assert.ok(suggest.includes("Magnetic buttons are banned."));
  assert.match(question.why, /Magnetic buttons are banned, not offered/);
  assert.match(question.why, /A1 through H3/);
  const blob = `${question.ask}\n${question.why}\n${suggest}`;
  assert.doesNotMatch(blob, /MIT fallback|fallback motion|instead of GSAP|instead of Theatre/i);
  assert.equal(question.ask.includes("!"), false);
});

test("DP-6.2 stores appetite as a weight ceiling in every depth", () => {
  const question = byId(loadTree(treeFile), "DP-6.2");
  assert.deepEqual(question.depth, ["express", "standard", "deep"]);
  assert.equal(question.skipDefault, "3. ASSUMED. Polished, not a spectacle.");
  assert.match(question.ask, /1 to 10/);
  assert.doesNotMatch(question.skipDefault, /\b11\b/);
  assert.match(question.why, /The number caps weight and does not remove libraries from the Guide/);
});

test("DP-6.3 names the film costs and DP-6.4 names every 3D source", () => {
  const all = loadTree(treeFile);
  const film = byId(all, "DP-6.3");
  assert.match(film.why, /build length/);
  assert.match(film.why, /weight/);
  assert.match(film.why, /phone fallback/);
  assert.match(film.why, /crawlable text layer/);
  const source = byId(all, "DP-6.4").ask;
  for (const name of ["none", "pre-rendered", "CC0", "Tripo", "Meshy", "upload", "human"]) {
    assert.ok(source.includes(name), name);
  }
});

test("DP-6.5 defaults to calm and DP-6.6 always implements reduced motion", () => {
  const all = loadTree(treeFile);
  const phone = byId(all, "DP-6.5");
  assert.equal(phone.skipDefault, "Calm.");
  assert.match(phone.ask, /lighter/);
  assert.match(phone.ask, /calm/);
  assert.match(byId(all, "DP-6.6").why, /Reduced motion is always implemented/);
});

test("DP-7.1 points at the cost meter and does not invent a price table", () => {
  const question = byId(loadTree(treeFile), "DP-7.1");
  assert.equal(question.skipDefault, "$0 DIY. Prompts only.");
  assert.match(question.why, /model/);
  assert.match(question.why, /resolution/);
  assert.match(question.why, /Do not promise 1080p inside a small cap/);
  assert.match(question.why, /cost meter/);
  const prose = `${question.ask}\n${question.why}\n${question.suggest ?? ""}`;
  assert.doesNotMatch(prose, /\$\s*[1-9]/);
});

test("DP-7.2 is absent from express and is not a required stand-in", () => {
  const all = loadTree(treeFile);
  const question = byId(all, "DP-7.2");
  assert.deepEqual(question.depth, ["standard", "deep"]);
  assert.equal(questionsForDepth(all, "express").some((item) => item.id === "DP-7.2"), false);
  assert.equal(questionsForDepth(all, "standard").some((item) => item.id === "DP-7.2"), true);
  assert.equal(questionsForDepth(all, "deep").some((item) => item.id === "DP-7.2"), true);
});

test("DP-9.2 recommends Hostinger, names the other hosts, and skips to no idea", () => {
  const question = byId(loadTree(treeFile), "DP-9.2");
  assert.equal(question.skipDefault, "no idea");
  assert.match(question.ask, /Hostinger is recommended/);
  assert.match(question.ask, /Vercel/);
  assert.match(question.ask, /Netlify/);
  assert.match(question.ask, /Cloudflare/);
  assert.match(question.why, /not a forced value/);
  assert.equal(question.ask.includes("!"), false);
});
