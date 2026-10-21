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
export { MOBILE_LH_RUNS, PHONE_CATEGORY_FLOOR, evaluateDeviceLh, evaluateMedianPhone, webglLcpIsPoster } from "./lighthouse-gate.ts";
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
  MATRIX_DESKTOP_WIDTHS,
  MATRIX_PHONE_WIDTHS,
  MATRIX_TABLET_WIDTHS,
  MATRIX_WIDTH_ENGINES,
  OPTIONAL_DEVICE_LABS,
  OPTIONAL_ENGINES,
  PHONE_CLASS_WIDTHS,
  buildDeviceMatrix,
  missingDescriptorMessage,
  runDeviceMatrix,
  widthCoverage,
} from "./device-matrix.ts";
export type {
  DeviceDescriptor,
  DeviceMap,
  DeviceMatrixRun,
  DeviceProject,
  WidthCheck,
  WidthCoverage,
} from "./device-matrix.ts";
export { captureLiveDeviceMatrix } from "./device-run.ts";
export { stateSweepProjects } from "./device-matrix.ts";
export { UI_STATES, ZOOM_PERCENT, evaluateStateSweeps, stateFixture } from "./state-sweep.ts";
export type { StateFixture, SweepReport, UiState, ZoomSample } from "./state-sweep.ts";
export { TEXT_CHECK_WIDTHS, evaluateMobile, runMobileChecks } from "./mobile-checks.ts";
export { evaluateNavFooter } from "./craft-gate.ts";
export { PALETTE_TARGETS, PALETTE_TOLERANCE, checkPaletteProportion } from "./palette-proportion.ts";
export { readHeadings, scoreSelf, selfScoreVerdict } from "./self-score.ts";
export type { CriterionScore, SelfScoreInput, SelfScoreReport, SweepMeasurement } from "./self-score.ts";
export type { PaletteProportionInput, PaletteProportionResult, PaletteShare } from "./palette-proportion.ts";
export type { NavFooterInput, NavFooterResult, NavTarget } from "./craft-gate.ts";
export type { MenuScript, MobileDocument, MobileReport, MobileRun, TargetBox, TextSample } from "./mobile-checks.ts";
export { PRIMARY_TARGET_MIN, jurorMobileEvidence } from "./mobile-checks.ts";
export { jurorAxeEvidence } from "./a11y-gate.ts";
export { jurorHeadingEvidence } from "./detail-pass.ts";
export { JUROR_FLOOR_ROWS, measureJurorFloor } from "./juror-floor.ts";
export type { JurorFloorReport, JurorFloorRow, JurorRow, JurorSample } from "./juror-floor.ts";
export {
  OPACITY_KEEP_MS,
  OPACITY_KEEP_NOTE,
  PHONE_FRAME_MAX_MS,
  PHONE_LONG_TASK_MAX_MS,
  classifyMotion,
  evaluateReducedMotion,
  judgePhoneScene,
  posesMatch,
  runReducedMotion,
  stillIsArtDirected,
} from "./reduced-motion.ts";
export type {
  LenisMotion,
  MotionSection,
  PhoneSceneJudgement,
  PhoneSceneSample,
  ReducedReport,
  ReducedRun,
  ReducedSample,
  TierZeroStill,
} from "./reduced-motion.ts";
export { AI_CLUSTER_VISION_KEYS, judgeAiCluster, lintSlop } from "./antislop.ts";
export type { AiClusterHit, AiClusterInput, AiClusterResult, AiClusterVisionKey, SlopHit } from "./antislop.ts";
export { rankBeautyIssues } from "./beauty-gate.ts";
export type { RankedBeautyIssue } from "./beauty-gate.ts";
export {
  SCREENSHOT_FIX_MAX_ROUNDS,
  SCREENSHOT_FIX_TOP,
  judgeSectionLock,
  recordElevateDefectRetest,
  runElevateAfterJurorFloor,
  runScopedSectionEdit,
  runScreenshotFixLoop,
  screenshotFixWidths,
} from "./elevate-loop.ts";
export type {
  ScreenshotFixCapture,
  ScreenshotFixReport,
  SectionEditScope,
  SectionLockResult,
  SectionLockShot,
} from "./elevate-loop.ts";
export { REVIEW_WIDTHS, captureAll, sectionBuffersDiffer, shotPairGap } from "./screenshots.ts";
export { REDESIGN_STEPS, judgeRedesignOrder } from "./redesign-order.ts";
export type { RedesignOrderResult, RedesignStepId, RedesignStepShot, RedesignStoredShot } from "./redesign-order.ts";
export { PARALLEL_VARIANT_COUNT, combineSectionVariants } from "./variants.ts";
export type {
  ApprovedDirection,
  CombineArtifact,
  CombineRegion,
  CombineResult,
  SectionVariant,
  VariantPick,
} from "./variants.ts";
export { closeDefect, judgeDefectLog, retestAfterElevate } from "./defect-log.ts";
export {
  PRESERVE_FUNCTIONALITY,
  callModelIfPreserved,
  elevatePickPrompt,
  redesignPrompt,
  runRedesignPrompt,
  withPreservePrompt,
} from "./preserve-prompt.ts";
export type { DefectClose, DefectLogJudgement, DefectRecord, DefectRetest, DefectSeverity } from "./defect-log.ts";
export { renderDefectLog } from "./report.ts";
export { loadElevateReview } from "./review-project.ts";
export type { ElevateReviewGap, ElevateReviewLoad } from "./review-project.ts";
export { realQualityGates, runElevateReview, runJuryReview, runVerdictReview } from "./review-runners.ts";
export type { PhonePictureSignals, QualityGates, ReviewProject, ReviewRun } from "./review-runners.ts";
export { GRADE_AXIS_TOLERANCE, checkImageryGrade, imageryGradeName } from "./imagery-grade.ts";
export type { ImageryGradeResult, ImagerySample } from "./imagery-grade.ts";
export { auditImageCredits, auditSourcedMedia, imageUrlsIn, mediaRefsIn } from "./licenses.ts";
export type { ImageCreditAudit, MediaRef, SourcedMediaAudit } from "./licenses.ts";
export { GATE_IDS, GATE_REGISTRY, gatesJsonPath, runAllGates } from "./gates/registry.ts";
export type {
  ContrastReading,
  GateEntry,
  GateId,
  GateProject,
  GateReport,
  GateResult,
  GateRunners,
  GateStatus,
  LighthouseRunInput,
  MatrixRunInput,
  MedianPhoneInput,
  MotionRunInput,
} from "./gates/registry.ts";
export { decideReview } from "./verdict.ts";
