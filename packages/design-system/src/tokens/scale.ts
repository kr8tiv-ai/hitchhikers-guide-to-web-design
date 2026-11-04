/**
 * Fluid type scale. The utopia formula matches packages/engine/src/brand/type-scale.ts.
 * This copy stays here so the design-system package does not import the engine.
 */

const VIEWPORT_MIN = 360;
const VIEWPORT_MAX = 1440;
const ROOT_PX = 16;
const BODY_MIN_REM = 1;
const BODY_MAX_REM = 1.125;

export function fluidClamp(minRem: number, maxRem: number): string {
  const range = VIEWPORT_MAX - VIEWPORT_MIN;
  const slope = (100 * (maxRem - minRem) * ROOT_PX) / range;
  const intercept = minRem - (slope * VIEWPORT_MIN) / (100 * ROOT_PX);
  return `clamp(${trimNum(minRem)}rem, ${trimNum(intercept)}rem + ${trimNum(slope)}vw, ${trimNum(maxRem)}rem)`;
}

export function stepsFor(ratio: number, minDisplayOverBody: number): number {
  let steps = 1;
  while (ratio ** steps < minDisplayOverBody) steps += 1;
  return steps;
}

export function typeSteps(ratio: number, minDisplayOverBody: number): { name: string; clamp: string }[] {
  const count = stepsFor(ratio, minDisplayOverBody);
  const headingIndex = Math.max(1, count - 2);
  const entries: { step: number; name: string }[] = [
    { step: -1, name: "caption" },
    { step: 0, name: "body" },
    { step: 1, name: "title" },
  ];
  for (let step = 2; step < count; step += 1) {
    entries.push({ step, name: step === headingIndex ? "heading" : `step-${step}` });
  }
  if (headingIndex === 1) entries.push({ step: 1, name: "heading" });
  entries.push({ step: count, name: "display" });
  return entries.map((entry) => ({
    name: entry.name,
    clamp: fluidClamp(BODY_MIN_REM * ratio ** entry.step, BODY_MAX_REM * ratio ** entry.step),
  }));
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}
