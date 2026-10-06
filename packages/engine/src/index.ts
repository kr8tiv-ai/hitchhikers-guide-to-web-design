export {
  EXPECTED_PACKAGES,
  WorkspaceError,
  listWorkspacePackages,
} from "./workspace.ts";
export type { WorkspacePackage } from "./workspace.ts";
export { BOUNDARIES, findDeepImports, findEscapes } from "./boundaries.ts";
export type { PackageBoundary } from "./boundaries.ts";
export {
  ConfigError,
  IMAGINE_BUDGET_USD_MAX,
  TOKEN_BUDGET_MAX,
  defaultConfig,
  loadConfig,
  parseConfig,
} from "./config.ts";
export type {
  DeployTarget,
  Effort,
  GuideConfig,
  InterviewDepth,
  SessionIdMode,
  VoiceEngine,
} from "./config.ts";
export {
  LockHeld,
  STALE_LOCK_MS,
  STATE_LOCK_NAME,
  acquire,
  release,
  replaceViaTemp,
  withStateLock,
} from "./lock.ts";
export type { LockInfo } from "./lock.ts";
export { loadState, saveState } from "./state.ts";
export type { GuideState } from "./state.ts";
export { homeIndexPath, upsertHomeProject } from "./home-index.ts";
export type { HomeProject } from "./home-index.ts";
