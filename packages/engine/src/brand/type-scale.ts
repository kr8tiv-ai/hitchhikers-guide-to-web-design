/**
 * Brief-derived type scale. Ratios match the 240r world table.
 * This module does not download font files.
 * A face the person named wins. Markdown headings are not faces.
 */

import {
  OVERUSED_DEFAULTS,
  TYPE_LIBRARY,
  pickType,
  type TypePair,
} from "./tokens.ts";

export const TYPE_SCALE = {
  editorial: { ratio: 1.333, minDisplayOverBody: 3.2, name: "perfect fourth" },
  "3d-world": { ratio: 1.414, minDisplayOverBody: 3.5, name: "augmented fourth" },
  playful: { ratio: 1.25, minDisplayOverBody: 2.6, name: "major third" },
  brutalist: { ratio: 1.5, minDisplayOverBody: 4, name: "perfect fifth" },
  product: { ratio: 1.2, minDisplayOverBody: 2.2, name: "minor third" },
  fashion: { ratio: 1.414, minDisplayOverBody: 3.5, name: "augmented fourth" },
  civic: { ratio: 1.25, minDisplayOverBody: 2.6, name: "major third" },
} as const;

export type TypeScaleWorld = keyof typeof TYPE_SCALE;

export const TYPE_SCALE_VIEWPORT = { min: 360, max: 1440 } as const;
const TYPE_ROOT_PX = 16;
export const TYPE_BODY_MIN_REM = 1;
export const TYPE_BODY_PREFERRED_REM = 1.125;
export const TYPE_BODY_LINE_HEIGHT = 1.5;

export interface TypeScaleDraft {
  world: TypeScaleWorld;
  ratio: number;
  ratioName: string;
  minimum: number;
  steps: number;
  familiesLine: string;
  display: string;
  heading: string;
  title: string;
  body: string;
  caption: string;
  bodyLineHeight: number;
  bodyMinRem: number;
  bodyMaxRem: number;
  displayMinRem: number;
  displayMaxRem: number;
}

export function stepsFor(world: TypeScaleWorld): number {
  const spec = TYPE_SCALE[world];
  let steps = 1;
  while (spec.ratio ** steps < spec.minDisplayOverBody) steps += 1;
  return steps;
}

export function displayClearsMinimum(world: TypeScaleWorld, displayPx: number, bodyPx: number): boolean {
  if (!Number.isFinite(displayPx) || !Number.isFinite(bodyPx) || bodyPx <= 0 || displayPx <= 0) return false;
  return displayPx / bodyPx >= TYPE_SCALE[world].minDisplayOverBody;
}

/** Brutalist outranks fashion. Shader and bold outrank a product tag. */
export function typeWorldFrom(text: string): TypeScaleWorld {
  const lower = withoutNegations(text).toLowerCase();
  if (/\bbrutal/.test(lower)) return "brutalist";
  if (/\b(?:3d(?:-|\s)?world|webgl|shader|bold)\b/.test(lower)) return "3d-world";
  if (/\bdark\b/.test(lower) && !/kinfolk|editorial|serif|aesop|patagonia/.test(lower)) return "3d-world";
  if (/\bfashion\b/.test(lower)) return "fashion";
  if (/\b(?:playful|sunny|loud|retail)\b/.test(lower)) return "playful";
  if (/\bcivic\b/.test(lower)) return "civic";
  if (/\b(?:product|interface|startup|saas|tech)\b/.test(lower)) return "product";
  return "editorial";
}

/**
 * Mood deal for a long brief. A one-line answer may name a face that is not in the library.
 * Catalog faces still win inside a brief, including Inter when the person typed it.
 */
export function typeChoiceFor(text: string): TypePair {
  const direct = pickType(text);
  if (direct.source === "list") return direct;
  if (direct.pairId !== null) return direct;
  if (direct.families.every((name) => catalogHas(name))) return direct;
  if (!text.includes("\n") && text.length <= 240) return direct;
  return pickType(text.toLowerCase());
}

export function familiesSentence(families: readonly string[]): string {
  const unique: string[] = [];
  for (const name of families) {
    if (!unique.includes(name)) unique.push(name);
  }
  const first = unique[0];
  const second = unique[1];
  if (first === undefined) return "Families: Switzer.";
  if (second === undefined) return `Families: ${first}.`;
  return `Families: ${first} and ${second}.`;
}

export function fluidClamp(minRem: number, maxRem: number): string {
  const minVp = TYPE_SCALE_VIEWPORT.min;
  const maxVp = TYPE_SCALE_VIEWPORT.max;
  const range = maxVp - minVp;
  // vw is a percent of the viewport in px. Multiply by the root so the
  // preferred size is the minimum at 360px and the maximum at 1440px.
  const slope = (100 * (maxRem - minRem) * TYPE_ROOT_PX) / range;
  const intercept = minRem - (slope * minVp) / (100 * TYPE_ROOT_PX);
  return `clamp(${trimNum(minRem)}rem, ${trimNum(intercept)}rem + ${trimNum(slope)}vw, ${trimNum(maxRem)}rem)`;
}

export function typeScaleFor(text: string): TypeScaleDraft {
  const world = typeWorldFrom(text);
  const spec = TYPE_SCALE[world];
  const steps = stepsFor(world);
  const headingStep = Math.max(1, steps - 2);
  const displayMinRem = spec.minDisplayOverBody * TYPE_BODY_MIN_REM;
  const displayMaxRem = TYPE_BODY_PREFERRED_REM * spec.ratio ** steps;
  return {
    world,
    ratio: spec.ratio,
    ratioName: spec.name,
    minimum: spec.minDisplayOverBody,
    steps,
    familiesLine: familiesSentence(typeChoiceFor(text).families),
    display: fluidClamp(displayMinRem, displayMaxRem),
    heading: fluidClamp(
      stepRem(TYPE_BODY_MIN_REM, spec.ratio, headingStep),
      stepRem(TYPE_BODY_PREFERRED_REM, spec.ratio, headingStep),
    ),
    title: fluidClamp(stepRem(TYPE_BODY_MIN_REM, spec.ratio, 1), stepRem(TYPE_BODY_PREFERRED_REM, spec.ratio, 1)),
    body: fluidClamp(TYPE_BODY_MIN_REM, TYPE_BODY_PREFERRED_REM),
    caption: fluidClamp(
      stepRem(TYPE_BODY_MIN_REM, spec.ratio, -1),
      stepRem(TYPE_BODY_PREFERRED_REM, spec.ratio, -1),
    ),
    bodyLineHeight: TYPE_BODY_LINE_HEIGHT,
    bodyMinRem: TYPE_BODY_MIN_REM,
    bodyMaxRem: TYPE_BODY_PREFERRED_REM,
    displayMinRem,
    displayMaxRem,
  };
}

function stepRem(bodyRem: number, ratio: number, step: number): number {
  return bodyRem * ratio ** step;
}

function trimNum(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function withoutNegations(text: string): string {
  return text.replace(/\b(?:never|not|no|without)\b[^.]{0,120}/gi, " ");
}

function catalogHas(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (OVERUSED_DEFAULTS.some((family) => family.toLowerCase() === key)) return true;
  return TYPE_LIBRARY.some((pairing) => pairing.display.toLowerCase() === key || pairing.body.toLowerCase() === key);
}
