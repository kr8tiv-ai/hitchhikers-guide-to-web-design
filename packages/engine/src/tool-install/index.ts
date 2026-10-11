export { commitHashedFile, sha256File } from "./checksum.ts";
export { createConfirmStore, planFingerprint, type ConfirmReject, type ConfirmStore, type IssuedConfirm } from "./confirm.ts";
export {
  checksumMessage,
  diskSpaceMessage,
  downloadVerifiedFile,
  freeBytesAt,
  InstallCancelled,
  offlineMessage,
  sizeMessage,
  type DownloadOptions,
  type DownloadRequester,
  type VerifiedDownload,
} from "./download.ts";
export {
  allowedHostsForTool,
  assertRecipeUrl,
  assertRedirectUrl,
  hostAllowed,
  insecureHopMessage,
  policyForHost,
  SOURCE_POLICIES,
  unrecognizedHostMessage,
  type HostPattern,
  type SourcePolicy,
} from "./hosts.ts";
export { installHints, type HintContext } from "./hints.ts";
export {
  DOCTOR_DOC,
  explainDoctor,
  explainRuntime,
  explainTool,
  formatProbeNotes,
  type DoctorNoteInput,
  type ProbeNote,
} from "./explain.ts";
export {
  buildInstallPlan,
  commandOnPath,
  displayArgv,
  displayCommand,
  formatMegabytes,
  managersOnPath,
  playwrightBrowsersCache,
  toolDataDir,
} from "./plan.ts";
export {
  PATH_PROBE_NAMES,
  deskPreflight,
  probePathTools,
  spawnProbe,
  type CommandResult,
  type CommandRunner,
  type DeskPreflightReport,
  type PathProbe,
  type PathProbeName,
} from "./probes.ts";
export {
  DEFAULT_WHISPER_MODEL,
  GROK_DOCS,
  PLAYWRIGHT_DOCS,
  POPPLER_HOME,
  POPPLER_RECIPES,
  WHISPER_ARCHIVES,
  WHISPER_MODELS,
  WHISPER_RELEASE,
  WHISPER_REPO,
  recipeUrls,
  whisperAssetUrl,
  whisperModelUrl,
  type ManagerRecipe,
  type WhisperArchive,
  type WhisperModelPin,
} from "./recipes.ts";
export {
  expandWindowsEnv,
  mergePathEntries,
  parseRegPath,
  refreshWindowsPath,
  restoreInstallEnv,
} from "./path-env.ts";
export {
  mergeInstall,
  publicInstallRecord,
  readToolInstalls,
  rememberInstallPath,
  ToolInstallRecordError,
  type ToolInstallRecord,
} from "./record.ts";
export { launchSpec, quoteCmdArg, resolveOnPath, type LaunchSpec } from "./win-spawn.ts";
export { AUDIT_ENTRIES, auditIdsFor, describeVerification, type AuditEntry, type AuditState } from "./audit.ts";
export {
  executePlan,
  killProcessTree,
  stepIsBlocked,
  type DownloadContext,
  type ExecuteOptions,
} from "./runner.ts";
export {
  INSTALL_TOOLS,
  PlanError,
  isInstallTool,
  type InstallEvent,
  type InstallModel,
  type InstallPlan,
  type InstallTool,
  type PlanContext,
  type PlanStep,
  type RunResult,
} from "./types.ts";
