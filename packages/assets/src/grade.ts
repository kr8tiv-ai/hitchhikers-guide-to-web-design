/**
 * Collateral grade from measurements.
 *
 * The score uses width, height, bytes, and a caller-supplied sharpness.
 * Those size fields are the ones readImageFacts returns on ImageFacts.
 * Brand fit, subject, and story do not move the number. A tiny frame
 * stays capped even when the brand is strong.
 *
 * Long side under 512 caps the score at 4. The reason string is the
 * contract phrase, including the words "short side".
 */

import type { ImageFacts } from "@hitchhiker/engine";

export interface GradeFacts {
  width: number;
  height: number;
  bytes: number;
  sharpness: number;
  subjectIsReal: boolean;
}

export interface GradeResult {
  score: number;
  reasons: string[];
}

/** ImageFacts from readImageFacts, plus sharpness and the real-subject flag. */
export type MeasuredGradeFacts = Pick<ImageFacts, "width" | "height" | "bytes"> &
  Pick<GradeFacts, "sharpness" | "subjectIsReal">;

export const TINY_SIDE_REASON = "short side or long side under 512";
export const SMALL_FILE_REASON = "file under 10kb";
export const SOFT_REASON = "sharpness under 0.3";

const SCORE_START = 10;
const SCORE_MIN = 1;
const SCORE_MAX = 10;
const TINY_LONG_SIDE = 512;
const TINY_CAP = 4;
const MIN_BYTES = 10 * 1024;
const SOFT_SHARPNESS = 0.3;

/** Subtracted when the long side is under 512, before the cap. */
const PENALTY_LONG_SIDE = 6;
/** Subtracted when the file is under 10 kibibytes. */
const PENALTY_BYTES = 3;
/** Subtracted when sharpness is under 0.3. */
const PENALTY_SHARPNESS = 3;

function assertFinite(name: string, value: number, min: number): void {
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be a finite number of at least ${min}.`);
  }
}

export function assertGradeFacts(facts: GradeFacts): void {
  assertFinite("width", facts.width, 0);
  assertFinite("height", facts.height, 0);
  assertFinite("bytes", facts.bytes, 0);
  if (typeof facts.subjectIsReal !== "boolean") {
    throw new Error("subjectIsReal must be a boolean.");
  }
  if (!Number.isFinite(facts.sharpness) || facts.sharpness < 0 || facts.sharpness > 1) {
    throw new Error("sharpness must be between 0 and 1.");
  }
}

function clampScore(score: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
}

/**
 * Score 1 to 10. Starts at 10, subtracts for a long side under 512, a file
 * under 10kb, and sharpness under 0.3, then clamps. A long side under
 * 512 cannot score above 4.
 */
export function grade(facts: GradeFacts): GradeResult {
  assertGradeFacts(facts);
  let score = SCORE_START;
  const reasons: string[] = [];
  const longSide = Math.max(facts.width, facts.height);

  if (longSide < TINY_LONG_SIDE) {
    score -= PENALTY_LONG_SIDE;
    reasons.push(TINY_SIDE_REASON);
  }
  if (facts.bytes < MIN_BYTES) {
    score -= PENALTY_BYTES;
    reasons.push(SMALL_FILE_REASON);
  }
  if (facts.sharpness < SOFT_SHARPNESS) {
    score -= PENALTY_SHARPNESS;
    reasons.push(SOFT_REASON);
  }

  score = clampScore(score);
  if (longSide < TINY_LONG_SIDE) score = Math.min(score, TINY_CAP);
  return { score, reasons };
}
