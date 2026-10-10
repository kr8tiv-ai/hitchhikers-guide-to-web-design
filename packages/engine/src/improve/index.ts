export { visibleCopy } from "./copy.ts";
export { decide } from "./decide.ts";
export { countOpenFindings, parseFindings } from "./findings.ts";
export type { Finding } from "./findings.ts";
export { hashFiles } from "./hash.ts";
export {
  GIT_HOOKS,
  appendHookLog,
  commandFailed,
  commandUsesNoVerify,
  formatHookLogHeader,
  formatHookLogRow,
  hookFailed,
  isGitHook,
  logUsesNoVerify,
  parseSessionCommands,
  scanHookFailures,
} from "./hooklog.ts";
export type { GitHookName, HookLogRow, ParsedCommand } from "./hooklog.ts";
export {
  DEFAULT_MAX_EXPERIMENTS,
  MAX_EXPERIMENTS_CEILING,
  MINUTE_CEILING,
  TURN_CEILING,
  DEFAULT_CONSECUTIVE_FAILURES,
  CONSECUTIVE_FAILURE_CEILING,
  DEFAULT_WALL_MINUTES,
  WALL_MINUTE_CEILING,
  assertGitAllowed,
  assertImproveBranch,
  assertResetAllowed,
  assertSupervisorBranch,
  assertSupervisorReset,
  dirtyPaths,
  improveBranchName,
  isImproveBranchName,
  isMainBranch,
  isSupervisorArtifact,
  resolveBudget,
  resolveConsecutiveFailures,
  resolveMaxExperiments,
  resolveWallMinutes,
  wallClockExceeded,
} from "./policy.ts";
export { parseAgentBriefs, parseProgram } from "./program.ts";
export type { AgentBrief, ImproveProgram } from "./program.ts";
export {
  DEFAULT_EFFORT,
  DEFAULT_MINUTES,
  DEFAULT_MODEL,
  DEFAULT_TAG,
  DEFAULT_TARGETS,
  DEFAULT_TURNS,
} from "./program.ts";
export {
  globMatch,
  isUnsafeRepoPath,
  matchProtected,
  normalizeRepoPath,
  parseProtected,
  pathOutsideTargets,
} from "./protected.ts";
export type { ProtectedList } from "./protected.ts";
export {
  NORMAL_PUSH_ARGS,
  assertNormalPush,
  assertSupervisorGit,
  decidePushVerify,
  forceMarker,
  usesNoVerify,
} from "./push.ts";
export type { PushVerifyInput } from "./push.ts";
export {
  RESULTS_COLUMNS,
  RESULT_STATUSES,
  SUPERVISE_EXTRA_COLUMNS,
  SUPERVISE_RESULTS_COLUMNS,
  appendResults,
  appendSuperviseResults,
  cleanNote,
  formatResultsHeader,
  formatResultsRow,
  formatSuperviseHeader,
  formatSuperviseRow,
  nextResultIndex,
} from "./results.ts";
export type { ResultRow, ResultStatus, SuperviseResultRow, YesNo } from "./results.ts";
export {
  BUG_SCORE_UNIT,
  UX_SCORE_UNIT,
  evalFromParts,
  isRed,
  parsePlaywrightPasses,
  parseTestCounts,
  score,
  uxPassCount,
} from "./score.ts";
export type { EvalResult, TestCounts } from "./score.ts";
