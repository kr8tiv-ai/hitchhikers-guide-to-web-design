export {
  EXPECTED_PACKAGES,
  WorkspaceError,
  listWorkspacePackages,
} from "./workspace.ts";
export type { WorkspacePackage } from "./workspace.ts";
export { BOUNDARIES, findDeepImports, findEscapes } from "./boundaries.ts";
export type { PackageBoundary } from "./boundaries.ts";
export { hiddenChildOptions } from "./hidden-child.ts";
export {
  bundleRuntime,
  interviewTreeFile,
  packagedModule,
  packagedPackage,
  packagedPath,
  shippedRepoFile,
} from "./packaged-dir.ts";
export {
  ConfigError,
  IMAGINE_BUDGET_USD_MAX,
  TOKEN_BUDGET_MAX,
  defaultConfig,
  loadConfig,
  parseConfig,
  saveConfig,
} from "./config.ts";
export type {
  AiConfig,
  AiEffort,
  DeployTarget,
  DesignGateConfig,
  Effort,
  GuideConfig,
  InterviewDepth,
  MediaConfig,
  OpticalConfig,
  SessionIdMode,
  VoiceEngine,
} from "./config.ts";
export {
  AI_TIMEOUT_MAX_MS,
  AI_TIMEOUT_MIN_MS,
  AI_TIMEOUT_MS,
} from "./config.ts";
export {
  CassetteError,
  CassetteMissError,
  CassetteModeError,
  GrokMissingError,
  GrokUnavailableError,
  PROMPT_FILE_BYTES,
  READ_ONLY_TOOLS,
  ThinkInputError,
  BILLING_TOP_UP,
  GrokBillingError,
  ThinkRunError,
  ThinkSchemaError,
  ThinkTimeoutError,
  buildGrokArgv,
  classifyGrokFailure,
  isBillingFailure,
  isRawJsonLine,
  sanitizeFailureReason,
  cassetteKey,
  cassetteMode,
  writeCassette,
  flagsFromHelp,
  promptOffCmdLine,
  redact,
  grokExeBeside,
  resolveGrokCommand,
  spawnGrok,
  think,
  validateJson,
} from "./ai/index.ts";
export type {
  CassetteMode,
  CassetteRecord,
  JsonSchema,
  SpawnLike,
  SpawnOutput,
  ThinkDeps,
  ThinkRequest,
  ThinkResult,
} from "./ai/index.ts";
export {
  renameReplacing,
  withExclusiveFile,
} from "./atomic-rename.ts";
export type { RenameReplacingOptions } from "./atomic-rename.ts";
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
export {
  answersForGate,
  assertCanAdvance,
  auditContext,
  awaitPendingSummary,
  bindPacket,
  buildContextPacket,
  emptyContextPacket,
  factsFromPacket,
  formatStatusLine,
  gateForSha,
  inferAssetRole,
  loadAssets,
  loadDecisions,
  loadNotes,
  loadSummary,
  promoteDiscuss,
  promoteLookahead,
  readAudit,
  readLedger,
  readPhaseStats,
  readStatus,
  shownPhase,
  recordAsset,
  recordDiscussNote,
  recordLookahead,
  recordVerification,
  refreshSummary,
  renderContextText,
  repairAssets,
  repairCursor,
  repairDecisions,
  runGate,
  summaryAccepts,
  syncAnswer,
  syncInterviewFacts,
  undoLast,
  withContextPacket,
  writePhaseAdvisories,
} from "./context/index.ts";
export type {
  AssetRecord,
  ContextAudit,
  ContextPacket,
  DecisionRecord,
  DoctorFinding,
  RouterStatus,
} from "./context/index.ts";
export { DESK_REPO_REFUSAL, deskPackageRoot, deskRepoRoots, isInsideDeskRepo } from "./desk-repo.ts";
export { createSiteProject, defaultProjectDir, slugProjectName } from "./new-project.ts";
export { homeIndexPath, upsertHomeProject } from "./home-index.ts";
export type { HomeProject } from "./home-index.ts";
export { TreeError, loadTree, questionsForDepth, questionsToAsk } from "./tree.ts";
export type { Question, QuestionResource } from "./tree.ts";
export { SITE_TYPES } from "./site-types.ts";
export type { SiteTypeHint } from "./site-types.ts";
export { missingRequired, renderBrief, requiredIds } from "./required.ts";
export type { AnswerRecord } from "./required.ts";
export { InterviewError, emitDesignStages, openInterview, readRevisitId, writeRevisitId } from "./interview.ts";
export { advanceDesignStages, designGateReason, designReadyForBuild } from "./spec/design-stages.ts";
export { writeDesignLock } from "./spec/design-lock.ts";
export { VISUAL_CONSTITUTION_REL, constitutionBlock, renderVisualConstitution } from "./spec/visual-constitution.ts";
export type { DesignBuildGate, DesignStageName } from "./spec/design-stages.ts";
export { runPrebuildChecks } from "./spec/prebuild-checks.ts";
export type { PrebuildCheck, PrebuildReport } from "./spec/prebuild-checks.ts";
export type { DesignStageRequest, DesignStageResult, InterviewCommand, InterviewErrorCode, InterviewSession } from "./interview.ts";
export { coverageReport, pushbackFor } from "./pushback.ts";
export {
  BRAND_GUIDE_SCHEMA,
  BRAND_GUIDE_TASK,
  BRAND_VOICE_IDS,
  HAPPY_CARD,
  IngestError,
  MAX_INGEST_BYTES,
  TEXT_CAP,
  brandGuideInput,
  brandGuideRequest,
  extractPdfText,
  importBrandGuide,
  readImageFacts,
  suggestAnswerPatches,
} from "./ingest.ts";
export type {
  BrandGuideAdapter,
  BrandGuideModel,
  ImageFacts,
  ImportedGuideCard,
  IngestErrorCode,
  IngestFileStat,
  IngestOptions,
  PdfExtract,
} from "./ingest.ts";
export {
  briefLoop,
  deterministicBrief,
  isApproval,
  readSiteBrief,
  renderSiteBrief,
  BRIEF_ANSWER_IDS,
  BRIEF_DRAFT_ERROR,
  BRIEF_DRAFT_MAX_TURNS,
  BRIEF_HEADINGS,
  BRIEF_SOURCES,
} from "./guide/brief-loop.ts";
export { briefHostingText, namedHostFromBrief } from "./guide/named-host.ts";
export type { NamedHost } from "./guide/named-host.ts";
export {
  BRIEF_BUILD_ID,
  BRIEF_PROGRESS_STAGE,
  approveSiteBrief,
  approveSitePlan,
  draftSiteBrief,
  startSiteBuild,
  planDraftInFlight,
  inflightBriefDraft,
  inflightBriefRevision,
  readBriefDesk,
  reviseSiteBrief,
} from "./guide/brief-desk.ts";
export type { BriefDeskView, BriefSource } from "./guide/brief-desk.ts";
export { generateBriefPlan, planFromBrief } from "./spec/brief-plan.ts";
export {
  PHONE_FRAME_MAX_MS,
  PHONE_LONG_TASK_MAX_MS,
  PhoneBudgetError,
  assertPhoneBudgetBefore3d,
  briefAsksForWebglHero,
  briefHasPhoneBudget,
  phonePerformanceBudget,
} from "./spec/phone-budget.ts";
export {
  DESIGN_FILE_LINES,
  DESIGN_MD_PATH,
  MOTION_TS_PATH,
  flagIgnoredMotionTokens,
  designTokenModel,
  commitDesignMarkdown,
  renderDesignMd,
  renderMotionModule,
  writeDesignMd,
  writeMotionModule,
} from "./spec/design-outputs.ts";
export {
  MOTION_CONSTITUTION_HEADING,
  MOTION_TOKENS_PATH,
  TICKER_RULES,
  appetiteOf,
  deriveMotionConstitution,
  durationAllowed,
  parseMotionConstitution,
  renderMotionConstitution,
  renderMotionTokensModule,
  withinConstitution,
  writeMotionTokens,
} from "./spec/motion-constitution.ts";
export type {
  DurationBand,
  MotionAppetite,
  MotionChange,
  MotionConstitution,
  NamedEase,
} from "./spec/motion-constitution.ts";
export {
  formatMotionFinding,
  inspectMotion,
  isSiteMotionFile,
  lintMotion,
  lintMotionFiles,
  motionLintReason,
} from "./spec/motion-lint.ts";
export type { InspectOptions, MotionFinding, MotionLintRule, RecipeRule } from "./spec/motion-lint.ts";
export {
  motionLoopFindings,
  motionProbeProblems,
  scoreChoreography,
} from "./spec/motion-score.ts";
export type { ChoreographyScore, MotionProbeFacts, MotionTimelineChild } from "./spec/motion-score.ts";
export {
  DESIGN_SECTION_ORDER,
  designSectionBody,
  designTokenTree,
  isSignatureRecipeName,
  lintDesignMd,
  parseSignatureMoments,
} from "./spec/design-md-lint.ts";
export type {
  DesignLintError,
  DesignLintReport,
  DesignTokenNode,
  ParsedSignatureMoment,
  SignatureBudget,
} from "./spec/design-md-lint.ts";
export { DESIGN_THEME_CSS, DESIGN_TOKENS_JSON, exportDesignMd, writeDesignExports } from "./spec/design-export.ts";
export type { DesignExport } from "./spec/design-export.ts";
export { readVariantRanking, variantRankingHtml, VARIANTS_REL, writeVariantRanking } from "./spec/variant-rank.ts";
export type { VariantAlternative, VariantDirection, VariantRecord } from "./spec/variant-rank.ts";
export {
  STRUCTURE_WIDTHS,
  judgeProjectStructure,
  judgeVariantStructure,
  mergeStructureFacts,
  readStructureDocument,
  signatureStructures,
  variantStructureClose,
} from "./spec/variant-structure-gate.ts";
export type {
  BuiltPageSection,
  NamedSignature,
  VariantStructureCloseResult,
  VariantStructureJudgement,
} from "./spec/variant-structure-gate.ts";
export { checkVariantStructure, structureForSection } from "@hitchhiker/design-system";
export type {
  StructureBreach,
  StructureCheck,
  StructureMeasure,
  VariantStructureFacts,
} from "@hitchhiker/design-system";
export type { MotionTokenHit } from "./spec/design-outputs.ts";
export {
  PlanCritiqueError,
  critiquePlan,
  draftPlan,
  planSwapKey,
  plansSwapWithoutEdit,
} from "./spec/plan-critique.ts";
export type { PlanCritique, PlanDraft, PlanTokens } from "./spec/plan-critique.ts";
export { translateBrief } from "./spec/art-direction.ts";
export { NO_ART_DIRECTION_NOTE } from "./spec/design-language.ts";
export {
  formatLanguagePack,
  languageBlockFor,
  languageQueryFrom,
  loadLanguagePack,
  selectLanguageEntries,
} from "./spec/language-pack.ts";
export type { LanguageEntry, LanguageQuery } from "./spec/language-pack.ts";
export {
  MOTION_REFERENCE_PACKS,
  REFERENCE_PHASES,
  SKILL_INCLUDE_TOKEN_BUDGET,
  WEBGL_REFERENCE_PACKS,
  auditPhaseReferences,
  expandSkillIncludes,
  loadSkillPacks,
  mentionedReferences,
  parseSkillPack,
  phaseReferenceText,
  planSkillLines,
  recordPhasePrompt,
  selectSkillPacks,
  siteTypeForWorld,
  skillVersionMentions,
} from "./spec/skills.ts";
export type {
  PhasePromptLog,
  PhaseReferenceAudit,
  ReferencePhase,
  SkillExpansion,
  SkillPack,
  SkillQuery,
} from "./spec/skills.ts";
export {
  buildMarkupFromReferences,
  expandIngredientIncludes,
  landmarkSequence,
  sectionFixtureRoot,
} from "./spec/section-refs.ts";
export type { IngredientExpansion, MarkupBuild } from "./spec/section-refs.ts";
export {
  SECTION_STILL_MODEL,
  planSectionStills,
  stillPath,
  writeSectionStillPlan,
} from "./spec/section-stills.ts";
export type { SectionStillPlan, SectionStillSlot, SuppliedStill } from "./spec/section-stills.ts";
export type { BriefAnswer, BriefPlan, PlanRequirement, PlannedPage } from "./spec/brief-plan.ts";
export { featureRequirementId, pageRequirementId } from "./spec/site-prompts.ts";
export { PlanCoverageError, checkPlanCoverage, planCoverageMessage, planCoverageRows } from "./spec/plan-coverage.ts";
export type { CoverageGap, CoverageRequirement, CoverageRow, CoverageTask, PlanCoverage } from "./spec/plan-coverage.ts";
export {
  clearReferenceCaptureRunner,
  collectReferenceShots,
  countDesignReferenceImages,
  listReferenceImages,
  needLine,
  ownerPhotoFiles,
  readReferenceAsks,
  recordReferenceCaptureFailure,
  refreshReferenceReadme,
  saveReferenceUpload,
  scheduleReferenceCapture,
  setReferenceCaptureRunner,
  slugify,
} from "./spec/reference-shots.ts";
export type {
  CapturedReferenceShot,
  CollectReferenceDeps,
  CollectReferenceResult,
  CollectedReference,
  ReferenceCaptureOptions,
  ReferenceNeed,
} from "./spec/reference-shots.ts";
export {
  DESIGN_LOCK_REL,
  RENDERS_REL,
  RenderApprovalError,
  approveRender,
  buildRenderPrompt,
  clearPageRenderRunner,
  designLockMatches,
  draftKeyPageRenders,
  isRenderApproved,
  listPrimaryPages,
  onDesignLocked,
  pagesWaitingForRender,
  renderApprovalMessage,
  renderRelForRoute,
  saveRenderUpload,
  schedulePageRenders,
  setPageRenderRunner,
  syncRenderApprovals,
} from "./spec/page-renders.ts";
export type { DraftRenderDeps, PrimaryPage, RenderApproval, WaitingPage } from "./spec/page-renders.ts";
export {
  BUILD_EFFORT,
  BUILD_EXIT_GRACE_MS,
  BUILD_IDLE_MS,
  BUILD_MODEL,
  BUILD_WATCHDOG_INTERVAL_MS,
  assertSiteBuildReady,
  BuildRunnerMissingError,
  buildSpawnArgs,
  clearProjectBuildRunner,
  configureSiteBuildWatch,
  ensureSiteBuild,
  getBuildRunner,
  hasProjectBuildRunner,
  holdInterruptedQueue,
  installLiveBuildRunner,
  continueSiteBuild,
  decideBuildRecovery,
  logHasCleanEnd,
  designLibraryArtDirection,
  draftBriefPlan,
  prepareSiteBuild,
  readDesignLibraryError,
  projectPlanCoverage,
  readBuildRun,
  readPromptTasks,
  reconcileSiteBuild,
  recoverSiteBuild,
  resetSiteBuildWatch,
  resumePausedQueue,
  resumeSiteBuild,
  retrySiteBuild,
  runBuildWatchdog,
  setBuildRunner,
  setProjectBuildRunner,
  setSectionStillRunner,
  setBeautyRunner,
  setSiteBuildGate,
  setSignatureClose,
  renderBuildPrompt,
  siteBuildSettled,
  siteBuildWatchConfig,
} from "./guide/site-build.ts";
export type { SignatureClose } from "./guide/site-build.ts";
export { auditSignature } from "./spec/signature-audit.ts";
export type {
  SignatureAudit,
  SignatureAuditFailure,
  SignatureBuilt,
  SignatureMeasure,
  SignatureReducedSample,
  SignatureRuntimeReading,
} from "./spec/signature-audit.ts";
export {
  SIGNATURE_CANDIDATES_REL,
  SIGNATURE_PICK_LOG_REL,
  SIGNATURE_TASK,
  SignatureMomentError,
  inventSignatureMoments,
  pickSignatureMoments,
  readSignatureCandidates,
  readSignatureMoments,
  renderSignatureBlocks,
  sectionHostsMoment,
  signatureDeskHtml,
  signaturePromptBlock,
} from "./spec/signature-moments.ts";
export type { InventSignatureDeps, SignatureThink } from "./spec/signature-moments.ts";
export { SIGNATURE_RULE } from "./spec/site-rules.ts";
export {
  auditOutsideAccess,
  buildConfinementArgs,
  confinementRuleMatches,
  outsideWarning,
  outsideWriteReason,
} from "./guide/site-confine.ts";
export type { ConfinementOptions, OutsideAccess, OutsideAudit } from "./guide/site-confine.ts";
export type {
  BuildContinueOutcome,
  BuildRecoveryDecision,
  BuildRecoveryInput,
  BuildRunView,
  BuildSpawn,
  BuildSpawnHandle,
  BuildSpawnRequest,
  BuildSpawnResult,
  ProjectPlanCoverage,
  SiteBuildGate,
  SiteBuildWatch,
} from "./guide/site-build.ts";
export { judgeTurnCap, turnLimitReason } from "./guide/site-turn.ts";
export type { TurnCap, TurnCapInput } from "./guide/site-turn.ts";
export { CALM_MESSAGE, guideThinkFromScript, readPendingClose, runTurn, seedExpressAssumptions } from "./guide/live-turn.ts";
export type { PendingClose } from "./guide/live-turn.ts";
export {
  GUIDANCE_MARKERS,
  INTERNAL_LINES,
  dropInternalCopy,
  guidanceCorpus,
  guidanceMarkerHits,
  isModelInstruction,
  repoGuidanceLines,
} from "./guide/guidance.ts";
export { judgePushback, followUpChoices } from "./guide/pushback-judge.ts";
export { STATIC_ANSWER_ERROR, bannedAnswer } from "./guide/answer-guard.ts";
export { INTERVIEW_MODEL, planInterview, interviewEffort, callCwd, isInterviewTask } from "./guide/interview-call.ts";
export {
  loadSessionState,
  gateQuestion,
  galleryWalkAsk,
  applyGalleryWalk,
  sessionBlock,
  filterGuideText,
  questionsToShow,
  prefetchStillValid,
  jargonHits,
  userFacingText,
  assetDisplayName,
  assetNamedIn,
  offersForeignImageAsLogo,
  guardLogoText,
  reletterChoices,
} from "./guide/session-state.ts";
export {
  usualRange,
  usualRangeLine,
  READING_LINE,
  GUIDE_FAIL_LINE,
  GUIDE_TIMEOUT_LINE,
  GUIDE_CALL_TIMEOUT_MS,
  guideCallTimeoutMs,
  ANSWER_PROGRESS,
  isAnswerProgressStage,
} from "./guide/guide-progress.ts";
export type { AnswerProgressStage } from "./guide/guide-progress.ts";
export { mirrorCue, requestMirror } from "./guide/mirror.ts";
export { FAMILIES, FAMILY_STYLE, familyOf, selectReferenceCards, styleWorldForFamily } from "./guide/gallery-model.ts";
export type { GalleryFamily } from "./guide/gallery-model.ts";
export { choiceSetFrom, isTasteId, loadFacts, loadGallery, referenceCards, suggest, suggestOffer } from "./guide/suggest.ts";
export { classifyHandsOn, SKILL_LEVELS } from "./guide/skill-level.ts";
export type { SkillLevel } from "./guide/skill-level.ts";
export { detectLanguage, guideTextIssues, lintClaims, questionCount, validateGuideMessage } from "./guide/validators.ts";
export type { GuideAcp, GuideSession, GuideTurn, GuideTurnDeps, GuideTurnInput } from "./guide/live-turn.ts";
export type { MirrorCue } from "./guide/mirror.ts";
export type { PushJudgement } from "./guide/pushback-judge.ts";
export type {
  BriefKey,
  ChoiceId,
  ChoiceOrigin,
  Facts,
  GalleryEntry,
  GuideMessage,
  MirrorVerdict,
  PushbackVerdict,
  SiteBrief,
  SuggestChoice,
  SuggestOption,
} from "./guide/schemas.ts";
export {
  BRIEF_LIST_MAX,
  BRIEF_LIST_TARGET,
  BRIEF_OPTIONAL_KEYS,
  BRIEF_PROSE_MAX,
  BRIEF_PROSE_TARGET,
  briefFieldDescription,
  briefFieldTarget,
} from "./guide/schemas.ts";
export {
  LOVE_TARGET,
  MISSING_PROMPT,
  ROUND_CAP,
  ROUND_SIZE,
  WHY_NUDGE,
  chooseShortlist,
  dealRound,
  defaultGalleryCacheDir,
  draftThread,
  emptyWalk,
  galleryCachePaths,
  loveCount,
  nextRound,
  parseWalkState,
  recordVerdict,
  shortlistBounds,
  writeReferences,
} from "./gallery-walk.ts";
export type { Deal, Verdict, VerdictInput, WalkQuery, WalkState } from "./gallery-walk.ts";
export {
  X_AUTHORIZE_HOST,
  X_AUTHORIZE_PATH,
  X_SCOPES,
  XOAuthError,
  buildAuthorizeUrl,
  createPkce,
} from "./x-oauth.ts";
export type { PkcePair, XOAuthField } from "./x-oauth.ts";
export { WhyError, compileWhy } from "./brand/index.ts";
export type { WhyDraft } from "./brand/index.ts";
export {
  ARCHETYPES,
  StoryError,
  buildStory,
  countWords,
  expandOnly,
  pickArchetype,
  positioningLine,
} from "./brand/index.ts";
export type { ArchetypePick, StoryPack } from "./brand/index.ts";
export { buildTeardown } from "./brand/index.ts";
export type { TeardownInput } from "./brand/index.ts";
export { lintClaims as lintBrandClaims } from "./brand/truth.ts";
export type { Evidence } from "./brand/truth.ts";
export {
  BRAND_SECTIONS,
  BrandApprovalError,
  applyStatus,
  redoSection,
} from "./brand/approve.ts";
export { BANNED_PHRASES, BANNED_WORDS } from "./brand/voice.ts";
export {
  DENY_HEX,
  DO_NOT_SHIP,
  MOOD_TYPE_SAMPLES,
  OVERUSED_DEFAULTS,
  TRIAL_FACES,
  TYPE_LIBRARY,
  TYPE_LICENSE,
  TYPE_PAIRINGS,
  UNMATCHED_PAIR_ID,
  dealFontSamples,
  isOverusedFamily,
  pickType,
} from "./brand/tokens.ts";
export type { FontSampleDeal, TypePair, TypePairing } from "./brand/tokens.ts";
export {
  checkDirectionDeal,
  chooseDirection,
  dealDirections,
  designLibraryRoot,
  directionDealPath,
  isDocsOrPackUrl,
  catalogReferences,
  loadDesignReferences,
  loadStudiedPages,
  pickDirection,
  readDirectionDeal,
  renderDirectionBlock,
  saveDirectionDeal,
} from "./brand/directions.ts";
export type { CatalogReference } from "./brand/directions.ts";
export type { Direction, DirectionCheck, DirectionDeal, StudiedPage } from "./brand/directions.ts";
export {
  DecisionLogError,
  decisionLogPath,
  notePhaseFinished,
  readDecisionLog,
  recordDirectionChoice,
  rejectedDirectionNames,
} from "./brand/decision-canvas.ts";
export type { DecisionEntry } from "./brand/decision-canvas.ts";
export {
  brandKitFromAnswers,
  contrastRatio,
  defaultPalette,
  passesBodyContrast,
  passesLargeContrast,
  writeBrandKit,
} from "./brand/kit-from-interview.ts";
export type { BrandAnswer, BrandPalette } from "./brand/kit-from-interview.ts";
export {
  REFERENCE_USER_AGENT,
  ReferenceExtractError,
  SHORT_QUOTE_WORDS,
  extractReferenceDesign,
  fetchReferenceTransport,
  longCopyLeak,
  resolveReferenceTransport,
  setReferenceTransport,
  tokensFromPublicHtml,
} from "./brand/reference-system.ts";
export type {
  ReferenceColor,
  ReferenceExtractRequest,
  ReferenceExtractResult,
  ReferenceTokens,
  ReferenceTransport,
  ReferenceTypeRole,
} from "./brand/reference-system.ts";
export {
  FILM_CREDIT,
  ambientSoundMarkup,
  artCallsForFilm,
  briefOptsIntoSound,
  filmVideoMarkup,
  filmVideoSlot,
} from "./spec/film-media.ts";
export { formatCost } from "./cost.ts";
export {
  QueueFileError,
  lastFinishedPrompt,
  loadQueue,
  pauseQueue,
  resumeQueue,
  saveQueue,
} from "./queue-file.ts";
export type { QueueFile, QueuePause, QueueStatus } from "./queue-file.ts";
export { onPhaseStart, savePartial } from "./phases/before-jump-hook.ts";
export type { BeforeJumpAnswer, BeforeJumpCard, BeforeJumpPhase } from "./phases/before-jump-hook.ts";
export {
  ALLOWED_LICENSES,
  assertMediaLicense,
  creditLine,
  isPublicDomain,
  parseCredits,
  parseCreditsValue,
} from "./credits-file.ts";
export type {
  AllowedLicense,
  CreditPageEntry,
  CreditsOrigin,
  CreditsPageModel,
} from "./credits-file.ts";
export {
  BUG_SCORE_UNIT,
  CONSECUTIVE_FAILURE_CEILING,
  DEFAULT_CONSECUTIVE_FAILURES,
  DEFAULT_EFFORT,
  DEFAULT_MAX_EXPERIMENTS,
  DEFAULT_MINUTES,
  DEFAULT_MODEL,
  DEFAULT_TAG,
  DEFAULT_TARGETS,
  DEFAULT_TURNS,
  DEFAULT_WALL_MINUTES,
  GIT_HOOKS,
  MAX_EXPERIMENTS_CEILING,
  MINUTE_CEILING,
  NORMAL_PUSH_ARGS,
  WORKTREE_PUSH_ARGS,
  RESULT_STATUSES,
  RESULTS_COLUMNS,
  SUPERVISE_EXTRA_COLUMNS,
  SUPERVISE_RESULTS_COLUMNS,
  TURN_CEILING,
  UX_SCORE_UNIT,
  WALL_MINUTE_CEILING,
  appendHookLog,
  appendResults,
  appendSuperviseResults,
  assertGitAllowed,
  assertImproveBranch,
  assertNormalPush,
  assertResetAllowed,
  assertSupervisorBranch,
  assertSupervisorGit,
  assertSupervisorReset,
  cleanNote,
  commandFailed,
  commandUsesNoVerify,
  countOpenFindings,
  decide,
  decidePushVerify,
  dirtyPaths,
  evalFromParts,
  forceMarker,
  formatHookLogHeader,
  formatHookLogRow,
  formatResultsHeader,
  formatResultsRow,
  formatSuperviseHeader,
  formatSuperviseRow,
  globMatch,
  hashFiles,
  hookFailed,
  improveBranchName,
  isGitHook,
  isImproveBranchName,
  isMainBranch,
  isRed,
  isSupervisorArtifact,
  isUnsafeRepoPath,
  logUsesNoVerify,
  matchProtected,
  nextResultIndex,
  normalizeRepoPath,
  parseAgentBriefs,
  parseFindings,
  parsePlaywrightPasses,
  parseProgram,
  parseProtected,
  parseSessionCommands,
  parseTestCounts,
  pathOutsideTargets,
  resolveBudget,
  resolveConsecutiveFailures,
  resolveMaxExperiments,
  resolveWallMinutes,
  scanHookFailures,
  score,
  usesNoVerify,
  uxPassCount,
  visibleCopy,
  wallClockExceeded,
} from "./improve/index.ts";
export type {
  AgentBrief,
  EvalResult,
  Finding,
  GitHookName,
  HookLogRow,
  ImproveProgram,
  ParsedCommand,
  ProtectedList,
  PushVerifyInput,
  ResultRow,
  ResultStatus,
  SuperviseResultRow,
  TestCounts,
  YesNo,
} from "./improve/index.ts";
export {
  APP_NAME,
  PROJECT_FILE_SCHEMA_VERSION,
  ProjectFileError,
  autosaveProject,
  fileExists,
  findRecent,
  loadProjectFile,
  locateProjectFile,
  locationLabel,
  migrate,
  nextPromptId,
  parseProjectFile,
  progressLabel,
  projectHome,
  readProjectDisplayName,
  interviewProgressLabel,
  readRecentProjects,
  readSaveNotice,
  readSaveNoticeSync,
  recordApprovalYes,
  removeRecentProject,
  renderResumeMd,
  renderResumePrompt,
  SECRET_PATTERN,
  restoreProject,
  sanitizeProjectName,
  saveProjectFile,
  upsertRecentProject,
  type LoadResult,
  type ProjectFile,
  type RecentProject,
  type RestorePrefer,
  type RestoreResult,
  type SaveNotice,
  type SaveResult,
} from "./project-file/index.ts";
export {
  AUDIT_ENTRIES,
  DEFAULT_WHISPER_MODEL,
  GROK_DOCS,
  INSTALL_TOOLS,
  PATH_PROBE_NAMES,
  PLAYWRIGHT_DOCS,
  POPPLER_HOME,
  POPPLER_RECIPES,
  PlanError,
  SOURCE_POLICIES,
  ToolInstallRecordError,
  WHISPER_ARCHIVES,
  WHISPER_MODELS,
  WHISPER_RELEASE,
  WHISPER_REPO,
  allowedHostsForTool,
  assertRecipeUrl,
  assertRedirectUrl,
  auditIdsFor,
  buildInstallPlan,
  checksumMessage,
  describeVerification,
  diskSpaceMessage,
  downloadVerifiedFile,
  commandOnPath,
  commitHashedFile,
  createConfirmStore,
  deskPreflight,
  displayArgv,
  displayCommand,
  executePlan,
  formatMegabytes,
  DOCTOR_DOC,
  explainDoctor,
  explainRuntime,
  explainTool,
  expandWindowsEnv,
  formatProbeNotes,
  hostAllowed,
  insecureHopMessage,
  installHints,
  isInstallTool,
  killProcessTree,
  launchSpec,
  managersOnPath,
  mergeInstall,
  mergePathEntries,
  offlineMessage,
  parseRegPath,
  planFingerprint,
  playwrightBrowsersCache,
  policyForHost,
  probePathTools,
  publicInstallRecord,
  quoteCmdArg,
  readToolInstalls,
  recipeUrls,
  refreshWindowsPath,
  rememberInstallPath,
  resolveOnPath,
  restoreInstallEnv,
  sha256File,
  sizeMessage,
  spawnProbe,
  stepIsBlocked,
  toolDataDir,
  unrecognizedHostMessage,
  whisperAssetUrl,
  whisperModelUrl,
  type AuditEntry,
  type AuditState,
  type CommandResult,
  type CommandRunner,
  type ConfirmReject,
  type ConfirmStore,
  type DeskPreflightReport,
  type DownloadContext,
  type DownloadOptions,
  type DownloadRequester,
  type ExecuteOptions,
  type HintContext,
  type HostPattern,
  type InstallEvent,
  type InstallModel,
  type InstallPlan,
  type InstallTool,
  type IssuedConfirm,
  type LaunchSpec,
  type ManagerRecipe,
  type PathProbe,
  type PathProbeName,
  type PlanContext,
  type PlanStep,
  type RunResult,
  type SourcePolicy,
  type ToolInstallRecord,
  type VerifiedDownload,
  type WhisperArchive,
  type WhisperModelPin,
} from "./tool-install/index.ts";
export { InstallCancelled } from "./tool-install/index.ts";
export {
  OPACITY_KEEP_MS,
  OPACITY_KEEP_NOTE,
  classifyMotion,
  posesMatch,
  stillIsArtDirected,
} from "./tier-zero-still.ts";
export type { MotionClass, TierZeroCamera, TierZeroGrade, TierZeroLighting, TierZeroStill } from "./tier-zero-still.ts";
