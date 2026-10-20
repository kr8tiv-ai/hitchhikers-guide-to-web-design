/**
 * Phone performance budget. A WebGL hero is refused until the brief records it.
 * The phone still gets the scene, after the poster, at a GPU tier it can hold.
 * The block avoids words that would flip the style world on their own.
 */

import { translateBrief } from "./art-direction.ts";
import { artAsksForWebglHero } from "./visual-motion.ts";

export class PhoneBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneBudgetError";
  }
}

const BANNED_BUDGET = [
  /no webgl on phones/i,
  /phones do not get the scene/i,
  /disable the scene on phones/i,
  /poster only on phones/i,
] as const;

export function phonePerformanceBudget(): string {
  return [
    "## Phone performance budget",
    "",
    "Performance at least 90 on the mobile preset. LCP at most 2.5 s. CLS at most 0.1. GLB at most 5 MiB. The poster is the LCP image. The phone keeps the scene after the poster, at a GPU tier the device can hold. A width cutoff does not replace the scene with a still.",
  ].join("\n");
}

export function briefHasPhoneBudget(brief: string): boolean {
  if (!/^## Phone performance budget\s*$/m.test(brief)) return false;
  return !BANNED_BUDGET.some((pattern) => pattern.test(brief));
}

/** True when the brief, before this block is added, already asks for a WebGL hero. */
export function briefAsksForWebglHero(brief: string): boolean {
  return artAsksForWebglHero(translateBrief(brief));
}

export function assertPhoneBudgetBefore3d(brief: string, asksFor3d: boolean): void {
  if (!asksFor3d) return;
  if (briefHasPhoneBudget(brief)) return;
  throw new PhoneBudgetError(
    "A WebGL hero needs the phone performance budget in the brief before any 3D prompt.",
  );
}
