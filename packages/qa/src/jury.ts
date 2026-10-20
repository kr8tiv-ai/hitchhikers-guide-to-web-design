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
export const AWWWARDS_WEIGHTS = {
  design: 40,
  usability: 30,
  creativity: 20,
  content: 10,
} as const;

/** A usability score under this fails the beauty gate even when the weighted total passes. */
export const AWWWARDS_USABILITY_FLOOR = 7;

export interface AwwwardsScores {
  design: number;
  usability: number;
  creativity: number;
  content: number;
}

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

function assertSameWeights(): void {
  if (WEIGHTS.brand !== AWWWARDS_WEIGHTS.design) throw new Error("Design weight drifted from 40.");
  if (WEIGHTS.craft !== AWWWARDS_WEIGHTS.usability) throw new Error("Usability weight drifted from 30.");
  if (WEIGHTS.clarity !== AWWWARDS_WEIGHTS.creativity) throw new Error("Creativity weight drifted from 20.");
  if (WEIGHTS.performance !== AWWWARDS_WEIGHTS.content) throw new Error("Content weight drifted from 10.");
}

function weightedTotal(scores: Pick<JuryInput, (typeof SCORE_FIELDS)[number]>): number {
  assertSameWeights();
  return (
    (scores.brand * WEIGHTS.brand +
      scores.craft * WEIGHTS.craft +
      scores.clarity * WEIGHTS.clarity +
      scores.performance * WEIGHTS.performance) /
    SCORE_SPAN
  );
}

/** The same 40/30/20/10 total the beauty gate and the jury both use. */
export function awwwardsTotal(scores: AwwwardsScores): number {
  return weightedTotal({
    brand: scores.design,
    craft: scores.usability,
    clarity: scores.creativity,
    performance: scores.content,
  });
}

export function jury(input: JuryInput): JuryResult {
  const scores = readInput(input);
  const total = weightedTotal(scores);
  const status: JuryResult["status"] = scores.blocked || total < PASS_AT ? "FAIL" : "PASS";
  return { total, status };
}

/** Vision and self-score rows enter the jury on the shared weights. */
export function juryFromRubric(scores: AwwwardsScores, blocked: boolean): JuryResult {
  return jury({
    brand: scores.design,
    craft: scores.usability,
    clarity: scores.creativity,
    performance: scores.content,
    blocked,
  });
}
