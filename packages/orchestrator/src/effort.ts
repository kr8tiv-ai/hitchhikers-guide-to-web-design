/**
 * Map a site-prompt tier to a Grok `--effort` flag, and raise it one step on retry.
 *
 * `--effort` is the CLI flag from the xAI docs in the repo
 * (context/sources/xai/cli_reference.md), not a custom protocol.
 * The levels this module emits are medium, high, and xhigh.
 * There is no effort above xhigh.
 *
 * v2 section 5.3 lists Heart of Gold as high or xhigh. The start value is high.
 * A failed attempt is what reaches xhigh. Forty-Two starts at xhigh and stays there.
 */

import type { Effort } from "@hitchhiker/engine";

export class EffortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffortError";
  }
}

/** Exact tier names, including the spaces in `Cup of Tea` and `Heart of Gold`. */
const TIER_EFFORT: Readonly<Record<string, Effort>> = {
  Towel: "medium",
  "Cup of Tea": "medium",
  "Gargle Blaster": "high",
  "Heart of Gold": "high",
  "Forty-Two": "xhigh",
};

export function effortForTier(tier: string): Effort {
  if (typeof tier !== "string") {
    throw new EffortError("Tier is missing.");
  }
  const effort = TIER_EFFORT[tier];
  if (effort === undefined) {
    throw new EffortError(`Unknown tier "${tier}".`);
  }
  return effort;
}

/**
 * One retry, one step: medium to high, high to xhigh.
 * xhigh stays xhigh and reports capped, so a loop cannot invent another name.
 */
export function bumpEffort(effort: Effort): { effort: Effort; capped: boolean } {
  const value: string = effort;
  if (value === "medium") return { effort: "high", capped: false };
  if (value === "high") return { effort: "xhigh", capped: false };
  if (value === "xhigh") return { effort: "xhigh", capped: true };
  throw new EffortError("Effort must be medium, high, or xhigh.");
}
