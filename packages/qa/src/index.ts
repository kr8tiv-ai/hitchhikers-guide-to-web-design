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
export { juryWithPatterns, patternPageFailures, scorePatterns } from "./pattern-score.ts";
export {
  CLS_MAX,
  GLB_BUDGET_BYTES,
  INP_MAX_MS,
  LCP_MAX_MS,
  VIDEO_BUDGET_BYTES,
  WEBGL_CONTEXT_MAX,
  evaluatePerformance,
} from "./performance-gate.ts";
export type { PerformanceInput, PerformanceResult } from "./performance-gate.ts";
export { judgeAward } from "./award-jury.ts";
export type { AwardInput, AwardResult } from "./award-jury.ts";
export type {
  PatternDimensions,
  PatternInput,
  PatternPage,
  PatternScore,
  PatternUsage,
  VisionScores,
} from "./pattern-score.ts";
export {
  EMULATION_LIMITS,
  OPTIONAL_DEVICE_LABS,
  OPTIONAL_ENGINES,
  PHONE_CLASS_WIDTHS,
  buildDeviceMatrix,
  missingDescriptorMessage,
  runDeviceMatrix,
} from "./device-matrix.ts";
export type { DeviceDescriptor, DeviceMap, DeviceMatrixRun, DeviceProject } from "./device-matrix.ts";
export { captureLiveDeviceMatrix } from "./device-run.ts";
