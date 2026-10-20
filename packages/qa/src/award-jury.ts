/**
 * Award jury (240c).
 * Runs pattern usage, the performance gate, and the recipe checker, then the
 * existing four-part jury. A failure blocks that jury and becomes one
 * remediation record. The weighted total is unchanged.
 * Recipes lower the separate developer line. They do not ban a library.
 */

import type { BeautyFailure } from "./beauty-gate.ts";
import { jury, type JuryResult } from "./jury.ts";
import { scorePatterns, patternPageFailures, type PatternInput, type PatternPage, type PatternScore, type VisionScores } from "./pattern-score.ts";
import { evaluatePerformance, type PerformanceInput, type PerformanceResult } from "./performance-gate.ts";
import { checkRecipes, type RecipeFinding } from "./recipe-check.ts";

export interface AwardInput extends PatternInput {
  performance: PerformanceInput;
}

export interface AwardResult {
  jury: JuryResult;
  pattern: PatternScore;
  performance: PerformanceResult;
  recipes: RecipeFinding[];
  failures: BeautyFailure[];
  developer: number;
}

export function judgeAward(input: AwardInput): AwardResult {
  if (!isRecord(input)) throw new Error("Award input must be an object.");
  const pattern = scorePatterns(patternInput(input));
  const performance = evaluatePerformance(input.performance);
  const page = input.page;
  const recipes = recipeFindings(page);
  const failures = [
    ...patternPageFailures(pattern, page),
    ...performance.reasons.map((reason) => failure(page, reason)),
    ...recipes.map((finding) => failure(page, finding.detail)),
  ];
  const blocked = !pattern.pass || performance.status === "BLOCKER" || recipes.length > 0;
  return {
    jury: jury({
      brand: input.vision.design,
      craft: input.vision.usability,
      clarity: input.vision.creativity,
      performance: input.vision.content,
      blocked,
    }),
    pattern,
    performance,
    recipes,
    failures,
    developer: Math.max(0, pattern.dimensions.developer - recipes.length * 2),
  };
}

function patternInput(input: AwardInput): PatternInput {
  const base = {
    appetite: input.appetite,
    textLed: input.textLed,
    page: input.page,
    vision: input.vision,
  };
  if (input.templateSnippets === undefined) return base;
  return { ...base, templateSnippets: input.templateSnippets };
}

function recipeFindings(page: PatternPage): RecipeFinding[] {
  const findings = [...checkRecipes(page.html, `${page.page}.html`)];
  for (const script of page.scripts) findings.push(...checkRecipes(script.source, script.file));
  return findings;
}

function failure(page: PatternPage, reason: string): BeautyFailure {
  return {
    page: page.page.trim(),
    section: page.section.trim(),
    screenshot: `.hitchhiker/review/${slug(page.page)}-${slug(page.section)}.txt`,
    reason,
  };
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned === "" ? "section" : cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type { PatternPage, VisionScores };
