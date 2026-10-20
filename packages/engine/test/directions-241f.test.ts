/**
 * BUG-055 idea 4. Three directions, each citing a studied library page.
 * The same type pair and the same section order fail, even when the hues differ.
 * A made-up Site of the Day id fails. No ingest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DENY_HEX } from "../src/brand/tokens.ts";
import { brandKitFromAnswers } from "../src/brand/kit-from-interview.ts";
import {
  checkDirectionDeal,
  dealDirections,
  loadStudiedPages,
  pickDirection,
  type DirectionDeal,
} from "../src/brand/directions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("a deal cites three studied pages and does not differ only by hue", () => {
  const deal = dealDirections();
  assert.equal(deal.directions.length, 3);
  assert.equal(deal.pickedId, null);
  const signatures = new Set<string>();
  for (const direction of deal.directions) {
    const file = path.join(root, "packages", "knowledge", "design-library", "entries", `${direction.citationId}.json`);
    const entry = JSON.parse(readFileSync(file, "utf8")) as {
      id: string;
      title: string;
      url: string;
      retired: boolean;
    };
    assert.equal(entry.retired, false);
    assert.equal(entry.id, direction.citationId);
    assert.equal(entry.title, direction.title);
    assert.equal(entry.url, direction.url);
    assert.equal((DENY_HEX as readonly string[]).includes(direction.hue), false);
    signatures.add(`${direction.display}|${direction.body}|${direction.sectionOrder.join(",")}`);
  }
  assert.equal(signatures.size, 3);
  const check = checkDirectionDeal(deal);
  assert.equal(check.pass, true);
  assert.equal(check.failure, "");
});

test("the same type pair and the same section order fail even with three hues", () => {
  const page = loadStudiedPages()[0];
  assert.ok(page);
  const hues = ["#1f6b4a", "#8c4a2f", "#1d4e89"];
  const deal: DirectionDeal = {
    pickedId: null,
    directions: hues.map((hue, index) => ({
      id: `hue-${index}`,
      name: `Wash ${index}`,
      citationId: page.id,
      title: page.title,
      url: page.url,
      display: "Boska",
      body: "General Sans",
      sectionOrder: page.sectionTypes,
      hue,
    })),
  };
  const check = checkDirectionDeal(deal);
  assert.equal(check.pass, false);
  assert.match(check.failure, /hue/i);
});

test("an invented site of the day citation fails", () => {
  const page = loadStudiedPages()[0];
  assert.ok(page);
  const deal: DirectionDeal = {
    pickedId: null,
    directions: [
      {
        id: "fake-0",
        name: "Imaginary",
        citationId: "sotd-imaginary-winner",
        title: "Imaginary winner",
        url: "https://example.invalid/sotd",
        display: "Boska",
        body: "General Sans",
        sectionOrder: ["hero"],
        hue: "#1f6b4a",
      },
      {
        id: "real-1",
        name: page.title,
        citationId: page.id,
        title: page.title,
        url: page.url,
        display: "Technor",
        body: "Excon",
        sectionOrder: ["story"],
        hue: "#8c4a2f",
      },
      {
        id: "real-2",
        name: page.title,
        citationId: page.id,
        title: page.title,
        url: page.url,
        display: "Syne",
        body: "Spline Sans",
        sectionOrder: ["cards"],
        hue: "#1d4e89",
      },
    ],
  };
  const check = checkDirectionDeal(deal);
  assert.equal(check.pass, false);
  assert.match(check.failure, /not studied/i);
});

test("the person picks one direction and an unknown id is rejected", () => {
  const deal = dealDirections();
  const first = deal.directions[0];
  assert.ok(first);
  const picked = pickDirection(deal, first.id);
  assert.equal(picked.pickedId, first.id);
  assert.equal(deal.pickedId, null);
  assert.throws(() => pickDirection(deal, "dir-missing"), /Unknown direction/);
});

test("the brand kit lists the directions and asks for a pick", () => {
  const kit = brandKitFromAnswers([]);
  assert.match(kit.markdown, /## Directions/);
  assert.match(kit.markdown, /Pick one\./);
  assert.match(kit.markdown, /Astro images/);
  assert.match(kit.markdown, /https:\/\/docs\.astro\.build\/en\/guides\/images\//);
  assert.equal(kit.markdown.includes("!"), false);
  assert.equal(kit.markdown.includes("\u2014"), false);
});
