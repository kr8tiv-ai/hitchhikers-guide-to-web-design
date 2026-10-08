import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { jury, type JuryInput, type JuryResult } from "../src/jury.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const FIELDS = ["brand", "craft", "clarity", "performance"] as const;

function score(overrides: Partial<JuryInput> = {}): JuryInput {
  return {
    brand: overrides.brand ?? 0,
    craft: overrides.craft ?? 0,
    clarity: overrides.clarity ?? 0,
    performance: overrides.performance ?? 0,
    blocked: overrides.blocked ?? false,
  };
}

function assertNoAuditWord(result: JuryResult): void {
  const encoded = JSON.stringify(result).toLowerCase();
  assert.equal(encoded.includes("lighthouse"), false);
  assert.deepEqual(Object.keys(result).sort(), ["status", "total"]);
}

test("all tens total 100 and pass", () => {
  const result = jury(score({ brand: 10, craft: 10, clarity: 10, performance: 10 }));
  assert.equal(result.total, 100);
  assert.equal(result.status, "PASS");
  assertNoAuditWord(result);
});

test("weights are 40, 30, 20, and 10", () => {
  const brand = jury(score({ brand: 10 }));
  const craft = jury(score({ craft: 10 }));
  const clarity = jury(score({ clarity: 10 }));
  const performance = jury(score({ performance: 10 }));
  assert.equal(brand.total, 40);
  assert.equal(craft.total, 30);
  assert.equal(clarity.total, 20);
  assert.equal(performance.total, 10);
  assert.equal(brand.status, "FAIL");
  assert.equal(craft.status, "FAIL");
  assert.equal(clarity.status, "FAIL");
  assert.equal(performance.status, "FAIL");
  assert.equal(brand.total + craft.total + clarity.total + performance.total, 100);
});

test("a blocker fails a perfect score without changing the total", () => {
  const open = jury(score({ brand: 10, craft: 10, clarity: 10, performance: 10, blocked: false }));
  const shut = jury(score({ brand: 10, craft: 10, clarity: 10, performance: 10, blocked: true }));
  assert.equal(open.total, 100);
  assert.equal(open.status, "PASS");
  assert.equal(shut.total, 100);
  assert.equal(shut.total, open.total);
  assert.equal(shut.status, "FAIL");
  assertNoAuditWord(shut);
});

test("a blocker fails a total of 70", () => {
  const result = jury(score({ brand: 7, craft: 7, clarity: 7, performance: 7, blocked: true }));
  assert.equal(result.total, 70);
  assert.equal(result.status, "FAIL");
});

test("69 fails and 70 passes when nothing is blocked", () => {
  const under = jury(score({ brand: 7, craft: 7, clarity: 7, performance: 6 }));
  const line = jury(score({ brand: 7, craft: 7, clarity: 7, performance: 7 }));
  const fraction = jury(score({ brand: 6.5, craft: 8, clarity: 5, performance: 10 }));
  assert.equal(under.total, 69);
  assert.equal(under.status, "FAIL");
  assert.equal(line.total, 70);
  assert.equal(line.status, "PASS");
  assert.equal(fraction.total, 70);
  assert.equal(fraction.status, "PASS");
  assertNoAuditWord(under);
  assertNoAuditWord(line);
});

test("zero is a valid score and fails the line", () => {
  const result = jury(score());
  assert.equal(result.total, 0);
  assert.equal(result.status, "FAIL");
});

test("fractional scores such as 7.5 are valid", () => {
  const result = jury(score({ brand: 7.5, craft: 7.5, clarity: 7.5, performance: 7.5 }));
  assert.equal(result.total, 75);
  assert.equal(result.status, "PASS");
});

test("scores outside 0 to 10 throw", () => {
  const outside = [-0.01, -1, 10.01, 11, 100];
  for (const name of FIELDS) {
    for (const bad of outside) {
      assert.throws(
        () => jury(score({ [name]: bad })),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, new RegExp(`${name} is`));
          assert.match(err.message, /0 to 10/);
          return true;
        },
      );
    }
    assert.doesNotThrow(() => jury(score({ [name]: 0 })));
    assert.doesNotThrow(() => jury(score({ [name]: 10 })));
  }
});

test("NaN and other non-finite scores throw", () => {
  for (const name of FIELDS) {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () => jury(score({ [name]: bad })),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, new RegExp(`${name} is`));
          assert.match(err.message, /NaN|Infinity/);
          return true;
        },
      );
    }
  }
});

test("a non-number score or a missing blocked flag throws", () => {
  assert.throws(
    () => jury(score({ brand: "10" as unknown as number })),
    /brand is "10"/,
  );
  assert.throws(
    () => jury({ brand: 8, craft: 8, clarity: 8, performance: 8, blocked: "yes" as unknown as boolean }),
    /blocked is "yes"/,
  );
  assert.throws(() => jury(null as unknown as JuryInput), /jury input is null/);
});

test("the same input returns the same result and the input is left alone", () => {
  const input = score({ brand: 8.5, craft: 7.5, clarity: 6.5, performance: 9, blocked: false });
  const snapshot = { ...input };
  const first = jury(input);
  const second = jury(input);
  assert.deepEqual(first, second);
  assert.equal(first.total, 78.5);
  assert.equal(first.status, "PASS");
  assert.deepEqual(input, snapshot);
});

test("weights 40, 30, 20, and 10 and the line at 70 are fixed in the source", () => {
  const source = readFileSync(path.join(here, "..", "src", "jury.ts"), "utf8");
  assert.match(source, /export function jury/);
  assert.match(source, /brand:\s*40\b/);
  assert.match(source, /craft:\s*30\b/);
  assert.match(source, /clarity:\s*20\b/);
  assert.match(source, /performance:\s*10\b/);
  assert.match(source, /const PASS_AT = 70/);
  assert.match(source, /brand\*4 \+ craft\*3 \+ clarity\*2 \+ performance\*1/);
  assert.doesNotMatch(source, /Math\.random|crypto\.random|Date\.now/);
  assert.doesNotMatch(source, /child_process|node:fs|node:http|node:https|node:net/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /lighthouse/i);
});
