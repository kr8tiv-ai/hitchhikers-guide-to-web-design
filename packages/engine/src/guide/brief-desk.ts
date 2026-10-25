/**
 * One path from a finished interview to the Site Brief and the build.
 * The desk and `hh brief` both call this. The model work stays inside briefLoop.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GrokMissingError } from "../ai/grok-cli.ts";
import { BILLING_TOP_UP, isBillingFailure } from "../ai/grok-failure.ts";
import type { think } from "../ai/think.ts";
import { loadDecisions, syncAnswer } from "../context/index.ts";
import { writeRevisitId } from "../interview.ts";
import { loadState, saveState, type GuideState } from "../state.ts";
import {
  BRIEF_ANSWER_IDS,
  BRIEF_HEADINGS,
  briefLoop,
  isApproval,
  recordedField,
  renderSiteBrief,
  type BriefStep,
} from "./brief-loop.ts";
import { BRIEF_KEYS, BRIEF_OPTIONAL_KEYS, type BriefKey, type SiteBrief } from "./schemas.ts";
import { loadFacts } from "./suggest.ts";
import { dropInternalCopy, repoGuidanceLines } from "./guidance.ts";
import { advanceDesignStages, designReadyForBuild } from "../spec/design-stages.ts";
import { PlanCoverageError } from "../spec/plan-coverage.ts";
import {
  assertSiteBuildReady,
  BuildRunnerMissingError,
  draftBriefPlan,
  launchSiteBuild,
  prepareSiteBuild,
  recordStackDecision,
  setSiteBuildFailureSink,
} from "./site-build.ts";
import type { GuideSession } from "./live-turn.ts";

export const BRIEF_BUILD_ID = "guide-entry";
export const BRIEF_NEXT_PHASE = "Babel Fish";
export const BRIEF_PROGRESS_STAGE = "Drafting the Site Brief";
export const BRIEF_SAME_NOTE = "The draft is the same.";
export const BRIEF_REVISE_STAGES = ["Reading the change", "Rewriting the brief", "Saving the revision"] as const;

const QUESTION_ID = /^DP-\d+\.\d+$/;

export interface BriefSource {
  key: BriefKey;
  heading: string;
  questionId: string;
  answer: string;
  text: string;
}

export interface BriefDeskView {
  status: "idle" | "drafting" | "revising" | "pending" | "approved";
  draft: SiteBrief | null;
  markdown: string;
  sources: BriefSource[];
  buildStarted: boolean;
  /** True after Approve plan. The design stages are open. The build is not. */
  planApproved: boolean;
  phase: string;
  nextAction: string;
  /** Honest draft failure. Empty when the model returned a brief. */
  error: string;
  /** Set when a revision comes back identical to the pending draft. */
  note: string;
  /** True while the brief is the interview fallback, not a model draft. */
  fallback: boolean;
  revisit: string | null;
}

interface PendingFile {
  status: "idle" | "drafting" | "revising" | "pending" | "approved";
  draft: SiteBrief | null;
  buildStarted: boolean;
  planApproved?: boolean;
  error?: string;
  note?: string;
  fallback?: boolean;
}

const jobs = new Map<string, Promise<BriefDeskView>>();
const approving = new Map<string, Promise<BriefDeskView>>();
const planning = new Map<string, Promise<BriefDeskView>>();
const planApproving = new Map<string, Promise<BriefDeskView>>();
const starting = new Map<string, Promise<BriefDeskView>>();
const revisions = new Map<string, Promise<BriefDeskView>>();

/** True while approving the brief is writing the prompt files. */
export function planDraftInFlight(projectDir: string): boolean {
  return planning.has(path.resolve(projectDir));
}

function pendingPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "brief-pending.json");
}

function isBrief(value: unknown): value is SiteBrief {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of BRIEF_KEYS) {
    const field = record[key];
    if ((typeof field !== "string" || field.trim() === "") && BRIEF_OPTIONAL_KEYS.has(key)) {
      record[key] = "The field is not stated yet.";
      continue;
    }
    if (typeof record[key] !== "string" || String(record[key]).trim() === "") return false;
  }
  return true;
}

function readPending(projectDir: string): PendingFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(pendingPath(projectDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { status: "idle", draft: null, buildStarted: false, error: "", note: "", fallback: false };
    }
    const record = parsed as Record<string, unknown>;
    const status = record.status;
    const known =
      status === "idle" ||
      status === "drafting" ||
      status === "revising" ||
      status === "pending" ||
      status === "approved";
    const draft = isBrief(record.draft) ? record.draft : null;
    const error = typeof record.error === "string" ? record.error : "";
    return {
      status: known ? status : "idle",
      draft,
      buildStarted: record.buildStarted === true,
      planApproved: record.planApproved === true,
      error,
      note: typeof record.note === "string" ? record.note : "",
      fallback: fallbackFrom(record, error),
    };
  } catch {
    return { status: "idle", draft: null, buildStarted: false, error: "", note: "", fallback: false };
  }
}

function fallbackFrom(record: Record<string, unknown>, error: string): boolean {
  if (record.fallback === true) return true;
  if (record.fallback === false) return false;
  return (
    error.includes("stopped early") ||
    error.includes("failed again") ||
    error.includes("filled from the interview") ||
    error.includes("was not used")
  );
}

function writePending(projectDir: string, file: PendingFile): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(pendingPath(projectDir), `${JSON.stringify(file)}\n`, "utf8");
}

function sourcesFor(projectDir: string, draft: SiteBrief | null): BriefSource[] {
  const facts = loadFacts(projectDir);
  return BRIEF_KEYS.map((key) => {
    const recorded = recordedField(key, facts);
    return {
      key,
      heading: BRIEF_HEADINGS[key],
      questionId: recorded.sourceIds.join(", "),
      answer: recorded.text,
      text: draft === null ? "" : draft[key],
    };
  });
}

export function readBriefDesk(projectDir: string): BriefDeskView {
  const key = path.resolve(projectDir);
  const pending = readPending(projectDir);
  let status = pending.status;
  if (status === "drafting" && !jobs.has(key)) status = "idle";
  if (status === "revising" && !revisions.has(key)) status = pending.draft === null ? "idle" : "pending";
  if (jobs.has(key) && status !== "pending" && status !== "approved" && status !== "revising") status = "drafting";
  const state = loadState(projectDir);
  const hidden = repoGuidanceLines();
  const sources = sourcesFor(projectDir, pending.draft).map((source) => ({
    ...source,
    answer: dropInternalCopy(source.answer, hidden),
    text: dropInternalCopy(source.text, hidden),
  }));
  return {
    status,
    draft: pending.draft,
    markdown: pending.draft === null ? "" : dropInternalCopy(renderSiteBrief(pending.draft), hidden),
    sources,
    buildStarted: buildHasStarted(projectDir, state?.nextAction ?? ""),
    planApproved: pending.planApproved === true,
    phase: state?.phase ?? "Don't Panic",
    nextAction: state?.nextAction ?? "",
    error: pending.error ?? "",
    note: pending.note ?? "",
    fallback: pending.fallback === true,
    revisit: null,
  };
}

function guideSession(projectDir: string): GuideSession {
  return { projectDir, depth: "deep", language: "en", pushes: {} };
}

async function runDraft(projectDir: string, thinkFn: typeof think, priorError: string): Promise<BriefDeskView> {
  try {
    const loop = briefLoop(guideSession(projectDir), { think: thinkFn, priorError });
    const first = await loop.next();
    await loop.return(undefined);
    if (first.value === undefined) throw new Error("The brief did not draft.");
    writePending(projectDir, {
      status: "pending",
      draft: first.value.draft,
      buildStarted: false,
      error: first.value.error,
      fallback: first.value.fallback,
    });
    return readBriefDesk(projectDir);
  } catch (error) {
    writePending(projectDir, { status: "idle", draft: null, buildStarted: false, error: "", fallback: false });
    throw error;
  }
}

export function draftSiteBrief(
  projectDir: string,
  thinkFn: typeof think,
  opts?: { onProgress?: (stage: string) => void },
): Promise<BriefDeskView> {
  const key = path.resolve(projectDir);
  const existing = jobs.get(key);
  if (existing) return existing;
  const current = readBriefDesk(projectDir);
  if (current.buildStarted || current.status === "approved" || current.status === "revising") return Promise.resolve(current);
  if (current.status === "pending" && current.error === "" && current.fallback !== true) return Promise.resolve(current);
  const priorError = current.error;
  opts?.onProgress?.(BRIEF_PROGRESS_STAGE);
  writePending(projectDir, {
    status: "drafting",
    draft: current.draft,
    buildStarted: current.buildStarted,
    error: "",
    fallback: current.fallback,
  });
  const job = runDraft(projectDir, thinkFn, priorError);
  jobs.set(key, job);
  dropJob(jobs, key, job);
  return job;
}

async function runLoopApprove(projectDir: string, thinkFn: typeof think, saved: SiteBrief, held: BriefStep): Promise<void> {
  const loop = briefLoop(guideSession(projectDir), { think: thinkFn, held });
  const opened = await loop.next();
  if (opened.done || opened.value === undefined) throw new Error("The brief did not resume.");
  const closed = await loop.next("approve");
  if (closed.value?.approved !== true) throw new Error("The brief was not approved.");
}

function buildHasStarted(projectDir: string, nextAction: string): boolean {
  const hitch = path.join(projectDir, ".hitchhiker");
  if (existsSync(path.join(hitch, "queue.json"))) return true;
  if (existsSync(path.join(hitch, "build-run.json"))) return true;
  return nextAction.trim() === "The build is started.";
}

function deskFailureMessage(error: unknown): string {
  const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "The build could not start.";
  return message.includes("Run hh doctor.") ? message : `${message} Run hh doctor.`;
}

function isStartRefusal(error: unknown): boolean {
  return error instanceof BuildRunnerMissingError || error instanceof GrokMissingError;
}

function recordDeskBuildError(projectDir: string, error: unknown): void {
  const file = readPending(projectDir);
  writePending(projectDir, {
    status: file.status,
    draft: file.draft,
    buildStarted: file.buildStarted === true,
    planApproved: file.planApproved === true,
    error: deskFailureMessage(error),
    note: file.note ?? "",
    fallback: file.fallback === true,
  });
}

setSiteBuildFailureSink((projectDir, error) => {
  recordDeskBuildError(projectDir, error);
});

async function startBuild(projectDir: string): Promise<void> {
  assertSiteBuildReady(projectDir);
  const saved = loadState(projectDir);
  const next: GuideState = {
    phase: BRIEF_NEXT_PHASE,
    slice: "Guide Entry",
    promptId: BRIEF_BUILD_ID,
    lastGoodCommit: saved?.lastGoodCommit ?? "",
    blockers: saved?.blockers ?? [],
    nextAction: "The build is started.",
    updatedAt: new Date().toISOString(),
  };
  await saveState(projectDir, next);
  const pending = readPending(projectDir);
  const markdown = pending.draft === null ? "" : renderSiteBrief(pending.draft);
  await prepareSiteBuild(projectDir, markdown);
  launchSiteBuild(projectDir);
}

async function runApprove(projectDir: string, thinkFn: typeof think, confirmFallback: boolean): Promise<BriefDeskView> {
  const current = readBriefDesk(projectDir);
  if (current.buildStarted) return current;
  if (current.fallback && !confirmFallback && current.status !== "approved") {
    throw new Error("Confirm the interview fallback before approving.");
  }
  if (current.status !== "approved") {
    let draft = current.draft;
    let fallback = current.fallback;
    let error = current.error;
    if (draft === null || current.status === "idle" || current.status === "drafting") {
      const drafted = await draftSiteBrief(projectDir, thinkFn);
      draft = drafted.draft;
      fallback = drafted.fallback;
      error = drafted.error;
      if (fallback && !confirmFallback) throw new Error("Confirm the interview fallback before approving.");
    }
    if (draft === null) throw new Error("The brief is not ready to approve.");
    await runLoopApprove(projectDir, thinkFn, draft, { draft, approved: false, error, fallback });
    writePending(projectDir, { status: "approved", draft, buildStarted: false, error: "", fallback });
  }
  const file = readPending(projectDir);
  if (file.draft !== null) {
    const key = path.resolve(projectDir);
    const markdown = renderSiteBrief(file.draft);
    const drafting = draftBriefPlan(projectDir, markdown).then(() => readBriefDesk(projectDir));
    planning.set(key, drafting);
    try {
      await drafting;
    } catch (error) {
      const message = error instanceof Error && error.message.trim() !== "" ? error.message : "The plan did not draft.";
      writePending(projectDir, {
        status: "pending",
        draft: file.draft,
        buildStarted: false,
        error: message,
        fallback: file.fallback === true,
      });
      throw error;
    } finally {
      if (planning.get(key) === drafting) planning.delete(key);
    }
  }
  return readBriefDesk(projectDir);
}

async function runPlanApprove(projectDir: string): Promise<BriefDeskView> {
  const current = readBriefDesk(projectDir);
  if (current.buildStarted || current.planApproved) return current;
  const file = readPending(projectDir);
  if (file.draft === null) throw new Error("The brief is not ready to approve.");
  const markdown = renderSiteBrief(file.draft);
  recordStackDecision(projectDir, markdown);
  advanceDesignStages(projectDir, { brief: markdown });
  writePending(projectDir, {
    status: "approved",
    draft: file.draft,
    buildStarted: false,
    planApproved: true,
    error: "",
    fallback: file.fallback === true,
  });
  return readBriefDesk(projectDir);
}

async function runStartBuild(projectDir: string): Promise<BriefDeskView> {
  const current = readBriefDesk(projectDir);
  if (current.buildStarted) return current;
  const file = readPending(projectDir);
  if (file.draft === null || file.planApproved !== true) {
    throw new Error("Approve the plan before the build.");
  }
  const markdown = renderSiteBrief(file.draft);
  const gate = designReadyForBuild(projectDir, markdown);
  if (!gate.ok) throw new Error(gate.reason);
  try {
    await startBuild(projectDir);
  } catch (error) {
    if (error instanceof PlanCoverageError || isStartRefusal(error)) {
      writePending(projectDir, {
        status: "approved",
        draft: file.draft,
        buildStarted: false,
        planApproved: true,
        error: error instanceof PlanCoverageError ? error.message : deskFailureMessage(error),
        fallback: file.fallback === true,
      });
      if (isStartRefusal(error)) return readBriefDesk(projectDir);
    }
    throw error;
  }
  writePending(projectDir, {
    status: "approved",
    draft: file.draft,
    buildStarted: true,
    planApproved: true,
    error: "",
    fallback: file.fallback === true,
  });
  return readBriefDesk(projectDir);
}

/** The only desk path that starts billed work. Design stages and checks must already pass. */
export function startSiteBuild(projectDir: string): Promise<BriefDeskView> {
  const key = path.resolve(projectDir);
  const existing = starting.get(key);
  if (existing) return existing;
  const job = runStartBuild(projectDir);
  starting.set(key, job);
  dropJob(starting, key, job);
  return job;
}

export function approveSitePlan(projectDir: string): Promise<BriefDeskView> {
  const key = path.resolve(projectDir);
  const existing = planApproving.get(key);
  if (existing) return existing;
  const job = runPlanApprove(projectDir);
  planApproving.set(key, job);
  dropJob(planApproving, key, job);
  return job;
}

export function approveSiteBrief(
  projectDir: string,
  thinkFn: typeof think,
  opts?: { confirmFallback?: boolean },
): Promise<BriefDeskView> {
  const key = path.resolve(projectDir);
  const existing = approving.get(key);
  if (existing) return existing;
  const job = runApprove(projectDir, thinkFn, opts?.confirmFallback === true);
  approving.set(key, job);
  dropJob(approving, key, job);
  return job;
}

/** Draft still running for this project. Null once that job has left the map. */
export function inflightBriefDraft(projectDir: string): Promise<BriefDeskView> | null {
  return jobs.get(path.resolve(projectDir)) ?? null;
}

/** Revise still running for this project. Null once that job has left the map. */
export function inflightBriefRevision(projectDir: string): Promise<BriefDeskView> | null {
  return revisions.get(path.resolve(projectDir)) ?? null;
}

export function reviseSiteBrief(
  projectDir: string,
  correction: string,
  thinkFn: typeof think,
  opts?: { onProgress?: (stage: string) => void },
): Promise<BriefDeskView> {
  const text = correction.trim();
  if (text === "") return Promise.reject(new Error("Write the change."));
  if (QUESTION_ID.test(text)) return reviseQuestion(projectDir, text);
  if (isApproval(text)) return Promise.reject(new Error("Use Approve to accept the brief."));
  const key = path.resolve(projectDir);
  const existing = revisions.get(key);
  if (existing) return existing;
  const current = readBriefDesk(projectDir);
  if (current.draft === null) return Promise.reject(new Error("The brief is not ready to change."));
  opts?.onProgress?.(BRIEF_REVISE_STAGES[0]);
  writePending(projectDir, {
    status: "revising",
    draft: current.draft,
    buildStarted: current.buildStarted,
    error: current.error,
    note: "",
    fallback: current.fallback,
  });
  const job = runRevise(projectDir, text, current, thinkFn, opts?.onProgress);
  revisions.set(key, job);
  dropJob(revisions, key, job);
  return job;
}

async function reviseQuestion(projectDir: string, text: string): Promise<BriefDeskView> {
  await writeRevisitId(projectDir, text);
  return { ...readBriefDesk(projectDir), revisit: text };
}

async function runRevise(
  projectDir: string,
  text: string,
  before: BriefDeskView,
  thinkFn: typeof think,
  onProgress?: (stage: string) => void,
): Promise<BriefDeskView> {
  const saved = before.draft;
  if (saved === null) throw new Error("The brief is not ready to change.");
  try {
    onProgress?.(BRIEF_REVISE_STAGES[1]);
    const held: BriefStep = { draft: saved, approved: false, error: before.error, fallback: before.fallback };
    const loop = briefLoop(guideSession(projectDir), { think: thinkFn, held });
    const opened = await loop.next();
    if (opened.done || opened.value === undefined) throw new Error("The brief did not resume.");
    const revised = await loop.next(text);
    await loop.return(undefined);
    const draft = revised.value?.draft;
    if (draft === undefined) throw new Error("The brief did not change.");
    const note = sameBrief(saved, draft) ? BRIEF_SAME_NOTE : "";
    onProgress?.(BRIEF_REVISE_STAGES[2]);
    writePending(projectDir, {
      status: "pending",
      draft,
      buildStarted: false,
      error: revised.value?.error ?? before.error,
      note,
      fallback: revised.value?.fallback ?? before.fallback,
    });
    await recordRevision(projectDir, text, saved, draft, thinkFn);
    return readBriefDesk(projectDir);
  } catch (error) {
    const message = isBillingFailure(error) ? BILLING_TOP_UP : before.error;
    writePending(projectDir, {
      status: "pending",
      draft: saved,
      buildStarted: false,
      error: message,
      note: "",
      fallback: before.fallback,
    });
    throw error;
  }
}

/** Drop the cached job when it settles. The shadow promise must not reject twice. */
function dropJob<T>(map: Map<string, Promise<T>>, key: string, job: Promise<T>): void {
  void job.finally(() => {
    if (map.get(key) === job) map.delete(key);
  }).catch(() => undefined);
}

function sameBrief(left: SiteBrief, right: SiteBrief): boolean {
  for (const key of BRIEF_KEYS) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

async function recordRevision(
  projectDir: string,
  text: string,
  before: SiteBrief,
  after: SiteBrief,
  thinkFn: typeof think,
): Promise<void> {
  await syncAnswer(projectDir, {
    questionId: "brief",
    text,
    source: "brief-correction",
    moveCursor: false,
    summarize: false,
    think: thinkFn,
  });
  for (const key of BRIEF_KEYS) {
    if (before[key] === after[key]) continue;
    const questionId = BRIEF_ANSWER_IDS[key];
    if (questionId === undefined || questionId === "") continue;
    const live = loadDecisions(projectDir).find((item) => item.questionId === questionId && item.supersededBy === "");
    await syncAnswer(projectDir, {
      questionId,
      text: after[key],
      source: "brief-correction",
      moveCursor: false,
      summarize: false,
      think: thinkFn,
      ...(live === undefined ? {} : { supersedeId: live.id }),
    });
  }
}
