import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CostError, formatCost, priceTokens } from "../src/cost.ts";
import { formatCost as formatCostFromIndex } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../src/cost.ts");
const refused = "$" + "10-20";

test("subscription format is counts and has no dollar sign", () => {
  const line = formatCost({
    mode: "subscription",
    promptsRun: 2,
    promptsTotal: 5,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  assert.equal(line, "Prompts 2 of 5.");
  assert.equal(line.includes("$"), false);
  assert.equal(formatCostFromIndex({ mode: "subscription", promptsRun: 0, promptsTotal: 4 }), "Prompts 0 of 4.");
});

test("API mode without rates or tokens does not invent a price", () => {
  const noTokens = formatCost({ mode: "api", promptsRun: 1, promptsTotal: 4 });
  const noRates = formatCost({
    mode: "api",
    promptsRun: 1,
    promptsTotal: 4,
    inputTokens: 1_000_000,
    outputTokens: 0,
  });
  const ratesOnly = formatCost({
    mode: "api",
    promptsRun: 1,
    promptsTotal: 4,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  const halfMeasured = formatCost({
    mode: "api",
    promptsRun: 1,
    promptsTotal: 4,
    inputTokens: 1_000_000,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  for (const line of [noTokens, noRates, ratesOnly, halfMeasured]) {
    assert.equal(line, "API mode. No measured tokens yet.");
    assert.equal(line.includes("$"), false);
    assert.equal(line.includes("2.00"), false);
  }
});

test("API mode prices measured tokens from the caller card", () => {
  const line = formatCost({
    mode: "api",
    promptsRun: 1,
    promptsTotal: 4,
    inputTokens: 1_000_000,
    outputTokens: 0,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  assert.match(line, /2\.00/);
  assert.match(line, /2026-09-29/);
  assert.equal(line, "API mode. $2.00. Card 2026-09-29.");
  assert.equal(
    priceTokens(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPerMillion: 2, outputPerMillion: 6 },
    ),
    5,
  );
  const both = formatCost({
    mode: "api",
    promptsRun: 1,
    promptsTotal: 4,
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  assert.equal(both, "API mode. $5.00. Card 2026-09-29.");
});

test("zero tokens with a card are a measured zero, not a guess", () => {
  const line = formatCost({
    mode: "api",
    promptsRun: 0,
    promptsTotal: 1,
    inputTokens: 0,
    outputTokens: 0,
    rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
  });
  assert.equal(line, "API mode. $0.00. Card 2026-09-29.");
});

test("refuses an unsourced run price, a zero total, and a run past the total", () => {
  assert.throws(
    () =>
      formatCost({
        mode: "api",
        promptsRun: 1,
        promptsTotal: 4,
        rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: refused },
      }),
    (error: unknown) => error instanceof CostError && /Unsourced run price/.test(error.message),
  );
  assert.throws(
    () => formatCost({ mode: "subscription", promptsRun: 0, promptsTotal: 0 }),
    (error: unknown) => error instanceof CostError && /zero/.test(error.message),
  );
  assert.throws(
    () => formatCost({ mode: "subscription", promptsRun: 4, promptsTotal: 3 }),
    /cannot exceed the total/,
  );
});

test("negative tokens and rates without a card date throw", () => {
  assert.throws(
    () =>
      formatCost({
        mode: "api",
        promptsRun: 1,
        promptsTotal: 2,
        inputTokens: -1,
        outputTokens: 10,
        rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "2026-09-29" },
      }),
    (error: unknown) => error instanceof CostError && /Negative tokens/.test(error.message),
  );
  assert.throws(
    () =>
      formatCost({
        mode: "subscription",
        promptsRun: 1,
        promptsTotal: 2,
        inputTokens: -5,
      }),
    /Negative tokens/,
  );
  assert.throws(
    () =>
      formatCost({
        mode: "api",
        promptsRun: 1,
        promptsTotal: 2,
        inputTokens: 10,
        outputTokens: 10,
        rates: { inputPerMillion: 2, outputPerMillion: 6, cardDate: "" },
      }),
    /card date/i,
  );
  assert.throws(
    () =>
      formatCost({
        mode: "api",
        promptsRun: 1,
        promptsTotal: 2,
        inputTokens: 10,
        outputTokens: 10,
        rates: { inputPerMillion: 2, outputPerMillion: 6 } as {
          inputPerMillion: number;
          outputPerMillion: number;
          cardDate: string;
        },
      }),
    /card date/i,
  );
});

test("the meter does not bill and does not print the refused illustration", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /function priceTokens/);
  assert.match(source, /priceTokens\(/);
  assert.doesNotMatch(source, /\$10-20/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /api\.x\.ai|super\s*grok/i);
});
