/**
 * Project context. Every answer, upload, approval, and note lands here,
 * then every Grok call reads the same packet back from disk.
 */

import type { think } from "../ai/think.ts";
import { patchCursor, recordAssetFile, recordFact, type FactInput } from "./disk.ts";
import { refreshSummary } from "./packet.ts";
import type { DecisionRecord } from "./types.ts";

export * from "./types.ts";
export {
  assetsFileExists,
  decisionsFileExists,
  displayAnswer,
  inferAssetRole,
  loadAssets,
  loadBuildSummary,
  loadDecisions,
  loadProjectSections,
  loadSummary,
  parseAssets,
  parseDecisions,
  readInterviewFacts,
  readLogoAsset,
  recordAssetFile,
  recordFact,
  recordFacts,
  sourceForInterview,
} from "./disk.ts";
export {
  applyContextFacts,
  bindPacket,
  buildContextPacket,
  emptyContextPacket,
  factsFromPacket,
  fallbackSummary,
  missingSummaryFacts,
  readAudit,
  refreshSummary,
  renderContextPacket,
  summaryAccepts,
  withContextPacket,
  wordCount,
} from "./packet.ts";
export {
  assertCanAdvance,
  auditContext,
  formatStatusLine,
  gateForSha,
  loadNotes,
  phaseNames,
  promoteDiscuss,
  promoteLookahead,
  readLedger,
  readPhaseStats,
  readStatus,
  recordDiscussNote,
  recordLookahead,
  recordVerification,
  renderContextText,
  repairAssets,
  repairCursor,
  repairDecisions,
  runGate,
  syncInterviewFacts,
  undoLast,
  writePhaseAdvisories,
} from "./ops.ts";

export async function syncAnswer(
  projectDir: string,
  input: FactInput & { moveCursor?: boolean; summarize?: boolean; think?: typeof think },
): Promise<DecisionRecord | null> {
  const created = await recordFact(projectDir, input);
  if (created !== null && input.moveCursor === true) await patchCursor(projectDir, input.questionId);
  if (created !== null && input.summarize === true && created.source !== "skip") {
    await refreshSummary(projectDir, input.think);
  }
  return created;
}

export async function recordAsset(
  projectDir: string,
  asset: { saved: string; original: string; role: string; questionId: string },
): Promise<DecisionRecord | null> {
  return recordAssetFile(projectDir, { ...asset, status: "live" });
}
