/**
 * Four-part jury total (prompt 127, v1 §12.1, v2 §12).
 *
 * Scores arrive from Grok vision (126) on a 0 to 10 scale. This function
 * only adds them. It does not call a model, read a screenshot, or open
 * the network.
 *
 * Weights are fixed. brand is Design at 40, craft is Usability at 30,
 * clarity is Creativity at 20, and performance is Content at 10.
 * The total is that weighted sum divided by 10, which is
 * brand*4 + craft*3 + clarity*2 + performance*1, on a 0 to 100 scale.
 * All tens is 100. The number is a jury total. It is not a phone-audit score.
 *
 * The pass line is 70. A total under 70 is FAIL.
 *
 * `blocked` is true when a pillar rollup or the phone gate says BLOCKER.
 * A blocker fails the jury even when the total is 100. The flag stays
 * outside the average, so the total is still the weighted sum.
 *
 * A score outside 0 to 10 throws. NaN throws. A fraction such as 7.5 is
 * valid. The same input always returns the same result.
 */

export interface JuryInput {
  brand: number;
  craft: number;
  clarity: number;
  performance: number;
  blocked: boolean;
}

export interface JuryResult {
  total: number;
  status: "PASS" | "FAIL";
}

/** Design 40, usability 30, creativity 20, content 10. Do not change these. */
const WEIGHTS = {
  brand: 40,
  craft: 30,
  clarity: 20,
  performance: 10,
} as const;

/** Scores are 0 to 10. Dividing the weighted sum by this yields 0 to 100. */
const SCORE_SPAN = 10;

/** A total under this is FAIL. 70 itself passes when nothing is blocked. */
const PASS_AT = 70;

const SCORE_FIELDS = ["brand", "craft", "clarity", "performance"] as const;

function label(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    return String(value);
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readScore(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > SCORE_SPAN) {
    throw new Error(`${name} is ${label(value)}. Expected a score from 0 to 10.`);
  }
  return value;
}

function readBlocked(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`blocked is ${label(value)}. Expected true or false.`);
  }
  return value;
}

function readInput(value: JuryInput): JuryInput {
  if (!isRecord(value)) {
    throw new Error(
      `jury input is ${label(value)}. Expected brand, craft, clarity, performance, and blocked.`,
    );
  }
  const scores = {
    brand: readScore("brand", value.brand),
    craft: readScore("craft", value.craft),
    clarity: readScore("clarity", value.clarity),
    performance: readScore("performance", value.performance),
  };
  return { ...scores, blocked: readBlocked(value.blocked) };
}

function weightedTotal(scores: Pick<JuryInput, (typeof SCORE_FIELDS)[number]>): number {
  return (
    (scores.brand * WEIGHTS.brand +
      scores.craft * WEIGHTS.craft +
      scores.clarity * WEIGHTS.clarity +
      scores.performance * WEIGHTS.performance) /
    SCORE_SPAN
  );
}

export function jury(input: JuryInput): JuryResult {
  const scores = readInput(input);
  const total = weightedTotal(scores);
  const status: JuryResult["status"] = scores.blocked || total < PASS_AT ? "FAIL" : "PASS";
  return { total, status };
}
