/**
 * Checks that can run before any billed build.
 * Plan critique, the phone budget when the brief asks for 3D, and type
 * pairs dealt from the library. No model call.
 */

import { dealFontSamples } from "../brand/tokens.ts";
import { TYPE_LIBRARY } from "../brand/type-library.ts";
import { critiquePlan, draftPlan } from "./plan-critique.ts";
import { assertPhoneBudgetBefore3d, briefAsksForWebglHero, PhoneBudgetError } from "./phone-budget.ts";

export interface PrebuildCheck {
  id: "critique" | "phone" | "type";
  label: string;
  pass: boolean;
  detail: string;
}

export interface PrebuildReport {
  pass: boolean;
  checks: readonly PrebuildCheck[];
}

const LIBRARY_DISPLAYS = new Set(TYPE_LIBRARY.map((pair) => pair.display.toLowerCase()));

/** The gates a person can pass before Grok or a media call starts. */
export function runPrebuildChecks(brief: string): PrebuildReport {
  const critique = critiquePlan(draftPlan(brief));
  const asks = briefAsksForWebglHero(brief);
  let phonePass = true;
  let phoneDetail = asks
    ? "The phone performance budget is in the brief."
    : "This brief does not ask for a 3D hero.";
  try {
    assertPhoneBudgetBefore3d(brief, asks);
  } catch (error) {
    phonePass = false;
    phoneDetail = error instanceof PhoneBudgetError ? error.message : "The phone budget check failed.";
  }
  const samples = dealFontSamples("");
  const typePass = samples.length > 0 && samples.every((sample) => LIBRARY_DISPLAYS.has(sample.display.toLowerCase()));
  const names = samples.map((sample) => sample.display).join(", ");
  const checks: PrebuildCheck[] = [
    {
      id: "critique",
      label: "Plan critique",
      pass: critique.pass,
      detail: critique.pass ? critique.differences.join("; ") : critique.failure,
    },
    {
      id: "phone",
      label: "Phone budget before 3D",
      pass: phonePass,
      detail: phoneDetail,
    },
    {
      id: "type",
      label: "Type picks from the library",
      pass: typePass,
      detail: typePass ? names : "A dealt pair is not from the library.",
    },
  ];
  return { pass: checks.every((check) => check.pass), checks };
}
