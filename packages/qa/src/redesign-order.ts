/**
 * Idea 13. A redesign walks type, then color, then frame, then states,
 * then components. Each step keeps a before screenshot and an after
 * screenshot. The type list is the 241a overused-default list. A family
 * the person named is allowed to stay. The frame step is where idea 10's
 * frame check sits in the order. This module does not ban a library.
 */

import { isOverusedFamily } from "@hitchhiker/engine";
import { shotPairGap } from "./screenshots.ts";

export const REDESIGN_STEPS = ["type", "color", "frame", "states", "components"] as const;

export type RedesignStepId = (typeof REDESIGN_STEPS)[number];

export interface RedesignStepShot {
  step: string;
  before: Buffer;
  after: Buffer;
  displayFamily: string;
}

export interface RedesignStoredShot {
  step: string;
  beforeBytes: number;
  afterBytes: number;
}

export interface RedesignOrderResult {
  ok: boolean;
  problems: string[];
  stored: RedesignStoredShot[];
}

function isStepId(value: string): value is RedesignStepId {
  return (REDESIGN_STEPS as readonly string[]).includes(value);
}

function userNamed(family: string, namedFamilies: readonly string[]): boolean {
  const key = family.trim().toLowerCase();
  if (key === "") return false;
  return namedFamilies.some((item) => item.trim().toLowerCase() === key);
}

/**
 * Reject a run that reaches components before type, skips a step, or
 * keeps going while the display face is still an unnamed overused default.
 */
export function judgeRedesignOrder(input: {
  namedFamilies: readonly string[];
  steps: readonly RedesignStepShot[];
}): RedesignOrderResult {
  const problems: string[] = [];
  const stored: RedesignStoredShot[] = [];
  let cursor = 0;
  let sawType = false;
  let face = "";
  for (const step of input.steps) {
    if (!isStepId(step.step)) {
      problems.push(`${step.step} is not a redesign step.`);
      continue;
    }
    const index = REDESIGN_STEPS.indexOf(step.step);
    if (index < cursor) {
      problems.push(`${step.step} is out of order.`);
    } else if (index > cursor) {
      const skipped = REDESIGN_STEPS[cursor] ?? "a step";
      problems.push(`${step.step} skipped ${skipped}.`);
      cursor = index + 1;
    } else {
      cursor = index + 1;
    }
    const gap = shotPairGap(step.before, step.after);
    if (gap !== null) problems.push(`${step.step} is missing a ${gap} screenshot.`);
    else stored.push({ step: step.step, beforeBytes: step.before.length, afterBytes: step.after.length });

    if (step.step === "type") {
      sawType = true;
      face = step.displayFamily.trim();
      if (face === "") problems.push("type names no display family.");
    } else if (!sawType) {
      problems.push(`${step.step} ran before type.`);
    }
    if (
      sawType
      && step.step !== "type"
      && face !== ""
      && isOverusedFamily(face)
      && !userNamed(face, input.namedFamilies)
    ) {
      problems.push(
        `The display face is still ${face}, and it was not named. ${step.step} waits until type changes.`,
      );
    }
  }
  return { ok: problems.length === 0, problems, stored };
}
