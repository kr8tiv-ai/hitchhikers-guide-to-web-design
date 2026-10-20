import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/qa";
export {
  benchMayStart,
  compareBrief,
  compareCampaign,
  deskPagesDiffer,
  isTemplateClone,
  richnessIndex,
} from "./visual-bench.ts";
export type { BriefComparison, PageScore, PairVote } from "./visual-bench.ts";
export { checkRecipeDir, checkRecipes } from "./recipe-check.ts";
export type { RecipeFinding, RecipeRule } from "./recipe-check.ts";
