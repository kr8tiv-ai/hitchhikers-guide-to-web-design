import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { budgetBytes, evaluatePage, type PageWeightInput } from "../src/weight-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function page(overrides: Partial<PageWeightInput> = {}): PageWeightInput {
  return {
    title: overrides.title ?? "Field notes",
    h1Count: overrides.h1Count ?? 1,
    textLength: overrides.textLength ?? 40,
    brokenLinks: overrides.brokenLinks ?? [],
    bytes: overrides.bytes ?? 500_000,
    appetite: overrides.appetite ?? 2,
  };
}

test("budgets step at appetite boundaries 2, 3, 5, 6, 8, and 9", () => {
  assert.equal(budgetBytes(1), 500_000);
  assert.equal(budgetBytes(2), 500_000);
  assert.equal(budgetBytes(3), 1_500_000);
  assert.equal(budgetBytes(4), 1_500_000);
  assert.equal(budgetBytes(5), 1_500_000);
  assert.equal(budgetBytes(6), 4_000_000);
  assert.equal(budgetBytes(7), 4_000_000);
  assert.equal(budgetBytes(8), 4_000_000);
  assert.equal(budgetBytes(9), 8_000_000);
  assert.equal(budgetBytes(10), 8_000_000);
  assert.ok(budgetBytes(2) < 1_000_000);
  assert.ok(budgetBytes(2) < budgetBytes(10));
});

test("an empty title blocks, including whitespace only", () => {
  for (const title of ["", " ", "\t", "\n", " \t\n "]) {
    const result = evaluatePage(page({ title }));
    assert.equal(result.status, "BLOCKER");
    assert.deepEqual(result.reasons, ["Title is empty."]);
  }
});

test("zero h1 and two h1 both block", () => {
  const none = evaluatePage(page({ h1Count: 0 }));
  const two = evaluatePage(page({ h1Count: 2 }));
  assert.equal(none.status, "BLOCKER");
  assert.deepEqual(none.reasons, ["Heading count is 0. Expected one h1."]);
  assert.equal(two.status, "BLOCKER");
  assert.deepEqual(two.reasons, ["Heading count is 2. Expected one h1."]);
});

test("a broken link blocks and the reason includes the href", () => {
  const result = evaluatePage(page({ brokenLinks: ["/pricing", "/about"] }));
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, ["Broken link /pricing.", "Broken link /about."]);
  assert.ok(result.reasons[0]?.includes("/pricing"));
  assert.ok(result.reasons[1]?.includes("/about"));
});

test("bytes one over the budget block, and the budget itself passes", () => {
  const appetite = 2;
  const budget = budgetBytes(appetite);
  const over = evaluatePage(page({ appetite, bytes: budget + 1 }));
  const exact = evaluatePage(page({ appetite, bytes: budget }));
  assert.equal(budget, 500_000);
  assert.equal(over.status, "BLOCKER");
  assert.deepEqual(over.reasons, ["Page is 500001 bytes. Appetite 2 allows 500000."]);
  assert.equal(exact.status, "PASS");
  assert.deepEqual(exact.reasons, []);
});

test("a level 2 page cannot carry a level 9 payload", () => {
  const heavy = evaluatePage(page({ appetite: 2, bytes: budgetBytes(9) }));
  const allowed = evaluatePage(page({ appetite: 9, bytes: budgetBytes(9), textLength: 40 }));
  assert.equal(heavy.status, "BLOCKER");
  assert.deepEqual(heavy.reasons, ["Page is 8000000 bytes. Appetite 2 allows 500000."]);
  assert.equal(allowed.status, "PASS");
});

test("text length 40 passes and 39 blocks", () => {
  const passed = evaluatePage(page({ textLength: 40 }));
  const blocked = evaluatePage(page({ textLength: 39 }));
  assert.equal(passed.status, "PASS");
  assert.deepEqual(passed.reasons, []);
  assert.equal(blocked.status, "BLOCKER");
  assert.deepEqual(blocked.reasons, ["Crawlable text is 39 characters. Expected at least 40."]);
});

test("a passing fixture returns PASS", () => {
  const result = evaluatePage(
    page({
      title: "  Field notes  ",
      h1Count: 1,
      textLength: 40,
      brokenLinks: [],
      bytes: budgetBytes(5),
      appetite: 5,
    }),
  );
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reasons, []);
});

test("every failure is listed together", () => {
  const result = evaluatePage({
    title: " ",
    h1Count: 0,
    textLength: 39,
    brokenLinks: ["/gone"],
    bytes: 500_001,
    appetite: 2,
  });
  assert.equal(result.status, "BLOCKER");
  assert.deepEqual(result.reasons, [
    "Title is empty.",
    "Heading count is 0. Expected one h1.",
    "Crawlable text is 39 characters. Expected at least 40.",
    "Broken link /gone.",
    "Page is 500001 bytes. Appetite 2 allows 500000.",
  ]);
});

test("appetite outside 1 to 10 throws", () => {
  for (const appetite of [0, 11, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => budgetBytes(appetite), /integer from 1 to 10/);
    assert.throws(() => evaluatePage(page({ appetite })), /integer from 1 to 10/);
  }
});

test("the checker does not request urls", () => {
  const source = readFileSync(path.join(here, "..", "src", "weight-gate.ts"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /node:https?/);
  assert.doesNotMatch(source, /\bundici\b/);
  assert.doesNotMatch(source, /from\s+["']https?:/);
  const result = evaluatePage(page({ brokenLinks: ["https://example.test/missing"] }));
  assert.equal(result.status, "BLOCKER");
  assert.equal(result instanceof Promise, false);
  assert.ok(result.reasons[0]?.includes("https://example.test/missing"));
});
