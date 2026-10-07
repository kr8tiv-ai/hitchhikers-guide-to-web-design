/**
 * Zaphod review verdict (prompt 113, v1 §11.3, v2 §11.3).
 *
 * Callers pass statuses from checkTruths, worst from summarizePillars, and
 * slopHits as the length of a lintSlop result. This function reads those
 * fields and returns a verdict. It does not write a fix or edit source.
 *
 * PASS: every truth FOUND, worst pillar PASS, slopHits 0, boots true.
 * FIX: a FIX pillar, a MISSING truth, or slopHits above 0, when fixRound is
 * 0 or 1, boots is true, and the pillar is not BLOCKER.
 * PASS_WITH_KNOWN_ISSUES: those same failures at fixRound 2, when boots is
 * true and the pillar is not BLOCKER. The reasons are the Known issues list.
 * ESCALATE: worst pillar BLOCKER, or boots false, at any round.
 *
 * A clean review is PASS at fixRound 0, 1, or 2. Any other fixRound throws.
 * The caller should have stopped. Prompt step 3 says a MISSING truth at
 * round 2 is ESCALATE. The goal, the decision table in that prompt, and v1
 * §11.3 call that third failure a known issue when the site still boots.
 * This file follows that table.
 */

import type { TruthCheck } from "./goal-backward.ts";
import type { PillarStatus } from "./pillars.ts";

const TRUTH_FOUND = "FOUND";
const TRUTH_MISSING = "MISSING";

function label(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    return String(value);
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function readTruthStatuses(value: unknown): Array<TruthCheck["status"]> {
  if (!Array.isArray(value)) {
    throw new Error(`truthStatuses is ${label(value)}. Expected a non-empty list.`);
  }
  if (value.length === 0) {
    throw new Error("truthStatuses is empty. A prompt without must_haves is already invalid.");
  }
  const statuses: Array<TruthCheck["status"]> = [];
  for (const status of value) {
    if (status !== TRUTH_FOUND && status !== TRUTH_MISSING) {
      throw new Error(`truthStatuses include ${label(status)}. Expected FOUND or MISSING.`);
    }
    statuses.push(status);
  }
  return statuses;
}

function readWorstPillar(value: unknown): PillarStatus {
  if (value !== "PASS" && value !== "FIX" && value !== "BLOCKER") {
    throw new Error(`worstPillar is ${label(value)}. Expected PASS, FIX, or BLOCKER.`);
  }
  return value;
}

function readSlopHits(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`slopHits is ${label(value)}. Expected a non-negative integer.`);
  }
  return value;
}

function readFixRound(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(`fixRound is ${label(value)}. The caller should have stopped.`);
  }
  return value;
}

function readBoots(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`boots is ${label(value)}. Expected true or false.`);
  }
  return value;
}

export function decideReview(input: {
  truthStatuses: Array<"FOUND" | "MISSING">;
  worstPillar: "PASS" | "FIX" | "BLOCKER";
  slopHits: number;
  fixRound: number;
  boots: boolean;
}): { verdict: "PASS" | "PASS_WITH_KNOWN_ISSUES" | "FIX" | "ESCALATE"; reasons: string[] } {
  const truthStatuses = readTruthStatuses(input.truthStatuses);
  const worstPillar = readWorstPillar(input.worstPillar);
  const slopHits = readSlopHits(input.slopHits);
  const fixRound = readFixRound(input.fixRound);
  const boots = readBoots(input.boots);

  const reasons: string[] = [];
  for (let index = 0; index < truthStatuses.length; index += 1) {
    if (truthStatuses[index] === TRUTH_MISSING) {
      reasons.push(`truthStatuses[${index}] is MISSING.`);
    }
  }
  if (worstPillar === "FIX" || worstPillar === "BLOCKER") {
    reasons.push(`worstPillar is ${worstPillar}.`);
  }
  if (slopHits > 0) {
    reasons.push(`slopHits is ${slopHits}.`);
  }
  if (!boots) {
    reasons.push("boots is false.");
  }

  if (worstPillar === "BLOCKER" || !boots) {
    return { verdict: "ESCALATE", reasons };
  }
  if (reasons.length === 0) {
    return { verdict: "PASS", reasons };
  }
  if (fixRound < 2) {
    return { verdict: "FIX", reasons };
  }
  return { verdict: "PASS_WITH_KNOWN_ISSUES", reasons };
}
