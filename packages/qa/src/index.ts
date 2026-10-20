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
  TBT_PROXY_MS,
  VIDEO_BUDGET_BYTES,
  WEBGL_CONTEXT_MAX,
  evaluateDevicePerformance,
  evaluatePerformance,
} from "./performance-gate.ts";
export type {
  DeviceLab,
  DevicePerformanceInput,
  DevicePerformanceResult,
  DeviceRunInput,
  PerformanceInput,
  PerformanceResult,
} from "./performance-gate.ts";
export { evaluateDeviceLh, webglLcpIsPoster } from "./lighthouse-gate.ts";
export type { DeviceLhResult, DeviceRecord, DeviceSlot, LhViewport } from "./lighthouse-gate.ts";
export {
  REAL_DEVICE_EMULATION,
  TABLET_VIEWPORT,
  installedTbtP10,
  loadInstalledPresets,
  printDesktopThrottling,
} from "./lighthouse-preset.ts";
export type { LhPreset, ScreenEmulation, ThrottlingProfile } from "./lighthouse-preset.ts";
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
export { stateSweepProjects } from "./device-matrix.ts";
export { UI_STATES, ZOOM_PERCENT, evaluateStateSweeps, stateFixture } from "./state-sweep.ts";
export type { StateFixture, SweepReport, UiState, ZoomSample } from "./state-sweep.ts";
export { TEXT_CHECK_WIDTHS, evaluateMobile, runMobileChecks } from "./mobile-checks.ts";
export { evaluateNavFooter } from "./craft-gate.ts";
export { PALETTE_TARGETS, PALETTE_TOLERANCE, checkPaletteProportion } from "./palette-proportion.ts";
export type { PaletteProportionInput, PaletteProportionResult, PaletteShare } from "./palette-proportion.ts";
export type { NavFooterInput, NavFooterResult, NavTarget } from "./craft-gate.ts";
export type { MenuScript, MobileDocument, MobileReport, MobileRun, TargetBox, TextSample } from "./mobile-checks.ts";
export {
  OPACITY_KEEP_MS,
  OPACITY_KEEP_NOTE,
  classifyMotion,
  evaluateReducedMotion,
  posesMatch,
  runReducedMotion,
  stillIsArtDirected,
} from "./reduced-motion.ts";
export type { LenisMotion, MotionSection, ReducedReport, ReducedRun, ReducedSample, TierZeroStill } from "./reduced-motion.ts";
