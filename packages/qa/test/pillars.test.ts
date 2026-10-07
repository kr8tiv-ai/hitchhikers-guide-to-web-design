import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { summarizePillars, type PillarName, type PillarStatus } from "../src/pillars.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const EIGHT: readonly PillarName[] = [
  "copy",
  "visuals",
  "color",
  "type",
  "spacing",
  "experience",
  "motion",
  "brand",
];

interface PillarRow {
  name: PillarName;
  status: PillarStatus;
  note: string;
}

function full(
  overrides: Partial<Record<PillarName, { status: PillarStatus; note: string }>> = {},
): PillarRow[] {
  return EIGHT.map((name) => {
    const override = overrides[name];
    if (override) return { name, status: override.status, note: override.note };
    return { name, status: "PASS", note: `${name} holds.` };
  });
}

test("eight passing pillars summarize to PASS with nothing missing", () => {
  const result = summarizePillars(full());
  assert.equal(result.worst, "PASS");
  assert.deepEqual(result.missing, []);
});

test("an empty row list names all eight and is a BLOCKER", () => {
  const result = summarizePillars([]);
  assert.equal(result.worst, "BLOCKER");
  assert.deepEqual(result.missing, [...EIGHT]);
  assert.equal(result.missing.length, 8);
});

test("six visual pillars without motion and brand are a BLOCKER", () => {
  const six = full().filter((row) => row.name !== "motion" && row.name !== "brand");
  assert.equal(six.length, 6);
  const result = summarizePillars(six);
  assert.deepEqual(result.missing, ["motion", "brand"]);
  assert.equal(result.worst, "BLOCKER");
});

test("missing names are listed in pillar order and outrank FIX", () => {
  const rows = full({
    copy: { status: "FIX", note: "The headline hedges." },
  }).filter((row) => row.name !== "brand" && row.name !== "copy" && row.name !== "type");
  const result = summarizePillars(rows);
  assert.deepEqual(result.missing, ["copy", "type", "brand"]);
  assert.equal(result.worst, "BLOCKER");
});

test("BLOCKER beats FIX and FIX beats PASS", () => {
  assert.equal(summarizePillars(full()).worst, "PASS");
  assert.equal(
    summarizePillars(full({ type: { status: "FIX", note: "The scale has no contrast." } })).worst,
    "FIX",
  );
  assert.equal(
    summarizePillars(
      full({
        type: { status: "FIX", note: "The scale has no contrast." },
        spacing: { status: "PASS", note: "The gaps are deliberate." },
        motion: { status: "BLOCKER", note: "The report says two scroll owners." },
      }),
    ).worst,
    "BLOCKER",
  );
});

test("a motion BLOCKER blocks a review that otherwise passes", () => {
  const result = summarizePillars(
    full({
      motion: { status: "BLOCKER", note: "The report says two scroll owners." },
    }),
  );
  assert.equal(result.worst, "BLOCKER");
  assert.deepEqual(result.missing, []);
});

test("a brand BLOCKER blocks a review that otherwise passes", () => {
  const result = summarizePillars(
    full({
      brand: { status: "BLOCKER", note: "A testimonial was invented." },
    }),
  );
  assert.equal(result.worst, "BLOCKER");
  assert.deepEqual(result.missing, []);
});

test("worst does not depend on row order", () => {
  const forward = full({
    copy: { status: "FIX", note: "The headline hedges." },
    brand: { status: "BLOCKER", note: "A testimonial was invented." },
  });
  const reverse = [...forward].reverse();
  assert.equal(summarizePillars(forward).worst, "BLOCKER");
  assert.equal(summarizePillars(reverse).worst, "BLOCKER");
  assert.deepEqual(summarizePillars(forward).missing, summarizePillars(reverse).missing);
});

test("an empty note throws", () => {
  const rows = full();
  const typeRow = rows.find((row) => row.name === "type");
  assert.ok(typeRow);
  typeRow.note = "";
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Empty note/);
      assert.match(err.message, /type/);
      return true;
    },
  );
});

test("a whitespace-only note throws", () => {
  const rows = full();
  const colorRow = rows.find((row) => row.name === "color");
  assert.ok(colorRow);
  colorRow.note = " \n\t ";
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Empty note/);
      assert.match(err.message, /color/);
      return true;
    },
  );
});

test("a duplicate name throws", () => {
  const rows = full();
  rows.push({ name: "motion", status: "PASS", note: "Second motion row." });
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Duplicate pillar name: motion/);
      return true;
    },
  );
});

test("a duplicate throws even when other pillars are missing", () => {
  const rows = full()
    .filter((row) => row.name !== "brand")
    .concat([{ name: "copy", status: "FIX", note: "Repeated copy row." }]);
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Duplicate pillar name: copy/);
      return true;
    },
  );
});

test("an unknown pillar name throws", () => {
  const rows = full();
  const first = rows[0];
  assert.ok(first);
  rows[0] = { name: "layout" as PillarName, status: "PASS", note: first.note };
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unknown pillar name/);
      assert.match(err.message, /layout/);
      return true;
    },
  );
});

test("a status outside the union throws", () => {
  const rows = full();
  const first = rows[0];
  assert.ok(first);
  rows[0] = { name: first.name, status: "MAYBE" as PillarStatus, note: first.note };
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unknown pillar status/);
      assert.match(err.message, /MAYBE/);
      return true;
    },
  );
});

test("a note that says replace GSAP throws", () => {
  for (const note of ["Fix this: replace GSAP.", "Please Replace GSAP in the hero."]) {
    const rows = full({ motion: { status: "FIX", note } });
    assert.throws(
      () => summarizePillars(rows),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /replace GSAP/);
        assert.match(err.message, /not an allowed fix/);
        return true;
      },
    );
  }
});

test("a GSAP note that does not ask to replace it is allowed", () => {
  const result = summarizePillars(
    full({
      motion: {
        status: "PASS",
        note: "Lenis drives ScrollTrigger on gsap.ticker. One scroll owner.",
      },
    }),
  );
  assert.equal(result.worst, "PASS");
  assert.deepEqual(result.missing, []);
});

test("replace GSAP throws before a missing pillar is reported", () => {
  const rows = full({
    motion: { status: "BLOCKER", note: "replace GSAP and hope." },
  }).filter((row) => row.name !== "brand");
  assert.throws(
    () => summarizePillars(rows),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /replace GSAP/);
      return true;
    },
  );
});

test("the scorer does not read a screenshot or launch a browser", () => {
  const source = readFileSync(path.join(here, "..", "src", "pillars.ts"), "utf8");
  assert.equal(source.includes("summarizePillars"), true);
  for (const name of EIGHT) {
    assert.equal(source.includes(`"${name}"`), true);
  }
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /node:fs|node:http|node:https|node:net/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /readFile|playwright|puppeteer|\.png/i);
  assert.doesNotMatch(source, /fallback/i);
});
