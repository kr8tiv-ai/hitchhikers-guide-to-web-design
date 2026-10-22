import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/deploy";

export { deployHostinger, prepareNodeArchive } from "./hostinger.ts";
export type {
  DeployFile,
  DeployHostingerInput,
  DeployPollState,
  DeployResult,
  HostingerClient,
} from "./hostinger.ts";
export { deployVercel } from "./vercel.ts";
export { deployNetlify } from "./netlify.ts";
export { deployCloudflare } from "./cloudflare.ts";
export { renderLaunchKit } from "./launch-kit.ts";
export type { LaunchKitInput } from "./launch-kit.ts";
export { PHONE_CATEGORY_FLOOR, postCheck } from "./post-check.ts";
export type { PostCheckInput, PostCheckPage, PostCheckResult } from "./post-check.ts";
export { closePreview, deploy, recommendHost } from "./dispatch.ts";
export type {
  DeployHost,
  DispatchClients,
  DispatchDeps,
  DispatchOutcome,
  DispatchRun,
  HostRecommendation,
  PreviewClient,
  PreviewHandoff,
  PublishHost,
} from "./dispatch.ts";
export { openPreview, previewZipPath } from "./preview.ts";
export type { PreviewRequest, PreviewSession } from "./preview.ts";
