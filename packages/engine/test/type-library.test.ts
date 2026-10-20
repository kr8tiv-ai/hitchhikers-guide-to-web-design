import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DO_NOT_SHIP,
  OVERUSED_DEFAULTS,
  TRIAL_FACES,
  TYPE_LIBRARY,
  UNMATCHED_PAIR_ID,
  isOverusedFamily,
  pickType,
} from "../src/brand/tokens.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fontsNote = path.resolve(here, "..", "..", "..", "hh-build-plan", "research", "240r-fonts.md");
const note = readFileSync(fontsNote, "utf8");

interface AppendixPair {
  id: number;
  display: string;
  body: string;
  foundry: string;
  source: string;
  license: string;
  license_url: string;
  ship: string;
  woff2: string;
  axes: string[];
  x_cap_display: number | null;
  x_cap_body: number | null;
  worlds: string[];
  deal: string;
}

interface AppendixFace {
  id: string;
  display: string;
  body: string;
  foundry: string;
  license: string;
  ship: string;
}

interface Appendix {
  pairs: AppendixPair[];
  do_not_ship: AppendixFace[];
  overused_defaults: string[];
}

function appendix(): Appendix {
  const start = note.indexOf("```json");
  const end = note.indexOf("```", start + 7);
  assert.ok(start >= 0 && end > start, "JSON appendix fence is missing");
  return JSON.parse(note.slice(start + 7, end)) as Appendix;
}

function proseHeadings(): Map<number, { display: string; body: string }> {
  const headings = new Map<number, { display: string; body: string }>();
  for (const match of note.matchAll(/\*\*(\d+)\. ([^*]+)\*\*/g)) {
    const id = Number(match[1]);
    const title = match[2] ?? "";
    const clean = title.replace(/\.$/, "");
    const parts = clean.split(" / ").map((part) => part.trim());
    const display = parts[0];
    const body = parts[1];
    if (display && body) {
      headings.set(id, { display, body });
      continue;
    }
    const solo = clean.split(",")[0]?.trim();
    if (solo && /one family/i.test(clean)) headings.set(id, { display: solo, body: solo });
  }
  return headings;
}

test("the shipped library count equals the JSON appendix and excludes the notes", () => {
  const doc = appendix();
  assert.equal(doc.pairs.length, 48);
  assert.equal(TYPE_LIBRARY.length, doc.pairs.length);
  assert.deepEqual(
    TYPE_LIBRARY.map((pairing) => pairing.id),
    doc.pairs.map((pairing) => pairing.id),
  );

  const headings = proseHeadings();
  for (let id = 1; id <= 48; id += 1) {
    const heading = headings.get(id);
    const row = doc.pairs.find((pairing) => pairing.id === id);
    assert.ok(heading, `prose pair ${id} is missing`);
    assert.ok(row, `appendix pair ${id} is missing`);
    assert.equal(heading.display, row.display);
    assert.equal(heading.body, row.body);
  }
  assert.equal(headings.has(51), false);
  assert.match(note, /There is no item 51/);
  assert.deepEqual(headings.get(49), { display: "Red Hat Display", body: "Public Sans" });
  assert.deepEqual(headings.get(50), { display: "Boxing", body: "Switzer" });
  assert.match(note, /left out of the JSON on purpose/);
  assert.match(note, /52\. Outfit is not given a pair/);
  assert.equal(
    TYPE_LIBRARY.some((pairing) => pairing.display === "Red Hat Display" || pairing.display === "Boxing" || pairing.display === "Outfit"),
    false,
  );

  for (const row of doc.pairs) {
    const shipped = TYPE_LIBRARY.find((pairing) => pairing.id === row.id);
    assert.ok(shipped);
    assert.equal(shipped.display, row.display);
    assert.equal(shipped.body, row.body);
    assert.equal(shipped.foundry, row.foundry);
    assert.equal(shipped.source, row.source);
    assert.equal(shipped.license, row.license);
    assert.equal(shipped.licenseUrl, row.license_url);
    assert.equal(shipped.ship, row.ship);
    assert.equal(shipped.woff2, row.woff2);
    assert.deepEqual(shipped.axes, row.axes);
    assert.equal(shipped.xCapDisplay, row.x_cap_display);
    assert.equal(shipped.xCapBody, row.x_cap_body);
    assert.deepEqual(shipped.worlds, row.worlds);
    assert.ok(shipped.rationale.length > 0);
    assert.ok(Array.isArray(shipped.era) && Array.isArray(shipped.tone) && Array.isArray(shipped.industry));
    if (row.id === 31) {
      assert.equal(row.deal, "default");
      assert.equal(shipped.deal, "unverified");
    } else {
      assert.equal(shipped.deal, row.deal);
    }
    if (row.id === 19) {
      assert.deepEqual(shipped.axes, []);
      assert.deepEqual(shipped.bodyAxes, ["wdth", "wght"]);
    }
  }
});

test("no Pangram trial face or unverified license ships as a default", () => {
  const doc = appendix();
  assert.equal(DO_NOT_SHIP.length, doc.do_not_ship.length);
  for (const face of doc.do_not_ship) {
    assert.equal(face.ship, "trial-only");
    assert.equal(face.license, "personal-trial");
    assert.equal(face.foundry, "Pangram Pangram");
    const blocked = DO_NOT_SHIP.find((item) => item.id === face.id);
    assert.ok(blocked);
    assert.equal(blocked.display, face.display);
    assert.equal(blocked.ship, "trial-only");
  }
  const banned = new Set<string>([
    ...TRIAL_FACES.map((name) => name.toLowerCase()),
    ...DO_NOT_SHIP.flatMap((face) => [face.display, face.body]).filter((name) => name !== "client-licensed grotesque"),
  ]);
  assert.equal(banned.has("neue montreal"), true);
  for (const pairing of TYPE_LIBRARY) {
    assert.notEqual(pairing.ship, "trial-only");
    assert.notEqual(pairing.license, "personal-trial");
    assert.equal(banned.has(pairing.display.toLowerCase()), false);
    assert.equal(banned.has(pairing.body.toLowerCase()), false);
    if (pairing.deal === "default") {
      assert.equal(isOverusedFamily(pairing.display), false);
      assert.equal(isOverusedFamily(pairing.body), false);
    }
  }
  const climate = TYPE_LIBRARY.find((pairing) => pairing.display === "Climate Crisis");
  assert.ok(climate);
  assert.equal(climate.deal, "unverified");
  assert.notEqual(climate.deal, "default");
  assert.deepEqual(doc.overused_defaults, OVERUSED_DEFAULTS.slice(0, doc.overused_defaults.length));
  assert.deepEqual(OVERUSED_DEFAULTS.slice(-3), ["Arial", "Helvetica", "system-ui"]);
  assert.notEqual(TYPE_LIBRARY[0]?.id, UNMATCHED_PAIR_ID);
});

test("a mood with no match never falls to index 0", () => {
  for (const answer of [null, "", "zzzz", "climate only"]) {
    const choice = pickType(answer);
    assert.equal(choice.source, "list");
    assert.equal(choice.pairId, UNMATCHED_PAIR_ID);
    assert.deepEqual(choice.families, ["Switzer"]);
    assert.notEqual(choice.pairId, TYPE_LIBRARY[0]?.id);
    assert.equal(choice.families.includes("Inter"), false);
    assert.equal(choice.families.includes("Bebas Neue"), false);
    assert.equal(choice.families.includes("Climate Crisis"), false);
  }
  const editorial = pickType("editorial");
  assert.equal(editorial.pairId, TYPE_LIBRARY[0]?.id);
  assert.deepEqual(editorial.families, ["Boska", "General Sans"]);
});
