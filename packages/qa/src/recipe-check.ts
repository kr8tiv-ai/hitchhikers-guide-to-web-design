/**
 * Static checks for the scroll and WebGL recipes.
 * The rules live in the engine motion lint so a generated site can fail
 * `pnpm build` without importing this package. This module keeps the
 * checkRecipes name the design-system tests load by file URL.
 */

import { inspectMotion, lintMotionFiles, type MotionFinding } from "@hitchhiker/engine";

export type { MotionFinding as RecipeFinding, MotionLintRule, RecipeRule } from "@hitchhiker/engine";

export function checkRecipes(source: string, file = "page.ts"): MotionFinding[] {
  return inspectMotion(source, file);
}

export function checkRecipeDir(root: string): MotionFinding[] {
  return lintMotionFiles(root);
}
