import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/assets";

export { logoDirections, pickFour, quoteTopFour, renderFour } from "./logo-concepts.ts";
export type { LogoDirection, LogoKind, LogoRenderDeps } from "./logo-concepts.ts";
export { grade, TINY_SIDE_REASON } from "./grade.ts";
export type { GradeFacts, GradeResult, MeasuredGradeFacts } from "./grade.ts";
export {
  ALREADY_LARGE_REASON,
  DEFAULT_TARGET_LONG_SIDE,
  REALESRGAN_PHOTO_MODEL,
  UPSCALE_REVIEW_LINE,
  runUpscale,
  upscalePlan,
} from "./upscale.ts";
export type { UpscalePlan, UpscaleSpawn } from "./upscale.ts";
export {
  UPSCALER_LICENCE,
  UPSCALER_MANIFEST,
  UpscalerChecksumError,
  UpscalerOfflineError,
  ensureUpscaler,
  realesrganCacheRoot,
} from "./model-fetch.ts";
export type { EnsureUpscalerDeps, EnsureUpscalerResult, UpscalerManifestEntry } from "./model-fetch.ts";
