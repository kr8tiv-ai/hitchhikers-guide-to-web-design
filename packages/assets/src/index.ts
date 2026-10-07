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
  REALESRGAN_SCALE2_MODEL,
  UPSCALE_REVIEW_LINE,
  realesrganModelForScale,
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
export { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, MissingApiKeyError, readApiKey } from "./keychain.ts";
export type { KeychainGet, ReadKeyDeps } from "./keychain.ts";
export {
  IMAGINE_ORIGIN,
  IMAGE_GENERATIONS_PATH,
  ImagineHttpError,
  POLL_CAP_MS,
  POLL_MAX_INTERVAL_MS,
  POLL_START_MS,
  VIDEO_GENERATIONS_PATH,
  VideoJobError,
  VideoPollTimeout,
  createImagineClient,
  fetchBytes,
  generateImage,
  pollVideo,
  startVideo,
} from "./imagine-http.ts";
export type {
  GeneratedImage,
  HttpDeps,
  ImageRequest,
  ImagineClient,
  PollDeps,
  VideoRequest,
  VideoResolution,
} from "./imagine-http.ts";
export { RealSubjectError, planBatch, readSpend, recordSpend, runBatch, spendFile } from "./imagine-run.ts";
export type { RunBatchDeps, SpendEntry, SpendLedger } from "./imagine-run.ts";
export { DIY_SUFFIX, writeDiyPack } from "./diy-pack.ts";
export { importDiyFiles } from "./diy-import.ts";
export {
  WEAK_GRADE_BELOW,
  assetsFile,
  diyDir,
  generatedDir,
  loadSlots,
  proposeReplacement,
  readAssetTable,
  refusesRealReplacement,
  renderAssets,
  rowFromSlot,
  slotsFile,
  updateAssetRows,
} from "./slots.ts";
export type { AssetRow, AssetSlot, AssetSource, ReplacementInput, ReplacementProposal } from "./slots.ts";
