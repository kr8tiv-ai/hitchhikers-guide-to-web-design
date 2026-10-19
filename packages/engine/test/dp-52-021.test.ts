/**
 * BUG-021 / BUG-022. DP-5.2 follows the recorded DP-5.1 answer.
 * A named site never keeps the "No favorites yet" sentence.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyGalleryWalk,
  galleryWalkAsk,
  gateQuestion,
  questionsToShow,
  type SessionState,
} from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const FALLBACK = "No favorites yet? Let's look at a few sites together. Say love, meh, or hate.";
const FOUR =
  "Patagonia: big quiet photography and plain type. Aesop: restraint, lots of empty space, small calm type. Kinfolk: slow editorial scroll and soft color. Airbnb Luxe: clean listing cards and gallery.";
const NAMED = "You named Patagonia, Aesop, Kinfolk and Airbnb Luxe. Let's look at a few more sites together. Say love, meh, or hate.";

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function state(text: string, assumed = false): SessionState {
  return {
    answers: text === "" ? [] : [{ id: "DP-5.1", text, assumed }],
    uploads: [],
    decided: [],
  };
}

test("gallery walk ask names up to four sites and keeps the empty wording", () => {
  assert.equal(galleryWalkAsk(FOUR, FALLBACK), NAMED);
  assert.equal(NAMED.includes("No favorites yet"), false);
  assert.equal(
    galleryWalkAsk("Patagonia: the quiet type.", FALLBACK),
    "You named Patagonia. Let's look at a few more sites together. Say love, meh, or hate.",
  );
  assert.equal(galleryWalkAsk("Patagonia", FALLBACK).includes("No favorites yet"), false);
  for (const empty of ["", "none", "None.", "No favorites", "No sites", "No loved sites named.", "skip"]) {
    assert.equal(galleryWalkAsk(empty, FALLBACK), FALLBACK, empty);
  }
  const messy = galleryWalkAsk("Loved: Patagonia and Aesop: calm type, and Kinfolk: slow scroll.", FALLBACK);
  assert.equal(
    messy,
    "You named Patagonia, Aesop and Kinfolk. Let's look at a few more sites together. Say love, meh, or hate.",
  );
  assert.equal(messy.includes("No favorites yet"), false);
  const five = galleryWalkAsk(
    "Patagonia: a. Aesop: b. Kinfolk: c. Airbnb Luxe: d. Cereal: e.",
    FALLBACK,
  );
  assert.match(five, /^You named Patagonia, Aesop, Kinfolk and Airbnb Luxe\./);
  assert.equal(five.includes("Cereal"), false);
});

test("DP-5.2 uses the recorded answer even when DP-5.1 is absent from the list", () => {
  const all = loadTree(treeFile);
  const walk = byId(all, "DP-5.2");
  const loved = byId(all, "DP-5.1");
  assert.match(walk.ask, /No favorites yet/);

  const named = gateQuestion(walk, state(FOUR), [walk]);
  assert.equal(named.action, "ask");
  assert.equal(named.ask, NAMED);

  const shown = questionsToShow([loved, walk], state(FOUR));
  const card = shown.find((question) => question.id === "DP-5.2");
  assert.ok(card);
  assert.equal(card.ask, NAMED);

  const skipped = gateQuestion(walk, state("No loved sites named.", true), [loved, walk]);
  assert.equal(skipped.action, "ask");
  assert.equal(skipped.ask, walk.ask);

  const untouched = gateQuestion(walk, state(""), [loved, walk]);
  assert.equal(untouched.ask, walk.ask);
});

test("a model line cannot put the stale sentence back once sites are named", () => {
  const stale = "No favorites yet? Let's look at a few sites together. Say love, meh, or hate.";
  const applied = applyGalleryWalk(stale, "No favorites yet? The walk can still help.", FOUR, FALLBACK);
  assert.equal(applied.ask, NAMED);
  assert.equal(applied.lead, "");
  assert.equal(applied.ask.includes("No favorites yet"), false);

  const open = applyGalleryWalk("Which real sites should we walk?", "A short lead.", "", FALLBACK);
  assert.equal(open.ask, "Which real sites should we walk?");
  assert.equal(open.lead, "A short lead.");
});
