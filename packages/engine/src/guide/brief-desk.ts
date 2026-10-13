/**
 * One path from a finished interview to the Site Brief and the build.
 * The desk and `hh brief` both call this. The model work stays inside briefLoop.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ThinkRequest, ThinkResult } from "../ai/think.ts";
import type { think } from "../ai/think.ts";
import { loadDecisions, syncAnswer } from "../context/index.ts";
import { writeRevisitId } from "../interview.ts";
import { loadState, saveState, type GuideState } from "../state.ts";
import {
  BRIEF_ANSWER_IDS,
  BRIEF_HEADINGS,
  briefLoop,
  isApproval,
  renderSiteBrief,
} from "./brief-loop.ts";
import { BRIEF_DRAFT_TASK, BRIEF_KEYS, type BriefKey, type SiteBrief } from "./schemas.ts";
import { loadFacts } from "./suggest.ts";
import { ensureSiteBuild, prepareSiteBuild } from "./site-build.ts";
import type { GuideSession } from "./live-turn.ts";

export const BRIEF_BUILD_ID = "guide-entry";
export const BRIEF_NEXT_PHASE = "Babel Fish";
export const BRIEF_PROGRESS_STAGE = "Drafting the Site Brief";

const QUESTION_ID = /^DP-\d+\.\d+$/;

export interface BriefSource {
  key: BriefKey;
  heading: string;
  questionId: string;
  answer: string;
  text: string;
}

export interface BriefDeskView {
  status: "idle" | "drafting" | "pending" | "approved";
  draft: SiteBrief | null;
  markdown: string;
  sources: BriefSource[];
  buildStarted: boolean;
  phase: string;
  nextAction: string;
  /** Honest draft failure. Empty when the model returned a brief. */
  error: string;
  revisit: string | null;
}

interface PendingFile {
  status: "idle" | "drafting" | "pending" | "approved";
  draft: SiteBrief | null;
  buildStarted: boolean;
  error?: string;
}

const jobs = new Map<string, Promise<BriefDeskView>>();
const approving = new Map<string, Promise<BriefDeskView>>();

function pendingPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "brief-pending.json");
}

function isBrief(value: unknown): value is SiteBrief {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of BRIEF_KEYS) {
    if (typeof record[key] !== "string" || record[key].trim() === "") return false;
  }
  return true;
}

function readPending(projectDir: string): PendingFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(pendingPath(projectDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { status: "idle", draft: null, buildStarted: false, error: "" };
    }
    const record = parsed as Record<string, unknown>;
    const status = record.status;
    const known = status === "idle" || status === "drafting" || status === "pending" || status === "approved";
    const draft = isBrief(record.draft) ? record.draft : null;
    return {
      status: known ? status : "idle",
      draft,
      buildStarted: record.buildStarted === true,
      error: typeof record.error === "string" ? record.error : "",
    };
  } catch {
    return { status: "idle", draft: null, buildStarted: false, error: "" };
  }
}

function writePending(projectDir: string, file: PendingFile): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(pendingPath(projectDir), `${JSON.stringify(file)}\n`, "utf8");
}

function sourcesFor(projectDir: string, draft: SiteBrief | null): BriefSource[] {
  const answers = new Map<string, string>();
  for (const answer of loadFacts(projectDir).answers) answers.set(answer.id, answer.value);
  return BRIEF_KEYS.map((key) => {
    const questionId = BRIEF_ANSWER_IDS[key] ?? "";
    return {
      key,
      heading: BRIEF_HEADINGS[key],
      questionId,
      answer: questionId === "" ? "" : (answers.get(questionId) ?? ""),
      text: draft === null ? "" : draft[key],
    };
  });
}

export function readBriefDesk(projectDir: string): BriefDeskView {
  const key = path.resolve(projectDir);
  const pending = readPending(projectDir);
  let status = pending.status;
  if (status === "drafting" && !jobs.has(key)) status = "idle";
  if (jobs.has(key) && status !== "pending" && status !== "approved") status = "drafting";
  const state = loadState(projectDir);
  return {
    status,
    draft: pending.draft,
    markdown: pending.draft === null ? "" : renderSiteBrief(pending.draft),
    sources: sourcesFor(projectDir, pending.draft),
    buildStarted: pending.buildStarted,
    phase: state?.phase ?? "Don't Panic",
    nextAction: state?.nextAction ?? "",
    error: pending.error ?? "",
    revisit: null,
  };
}

function guideSession(projectDir: string): GuideSession {
  return { projectDir, depth: "deep", language: "en", pushes: {} };
}

function resumeThink(inner: typeof think, saved: SiteBrief): typeof think {
  return async function resumed<T>(req: ThinkRequest<T>, deps?: Parameters<typeof think>[1]): Promise<ThinkResult<T>> {
    if (req.task === BRIEF_DRAFT_TASK) {
      return { value: saved as T, raw: JSON.stringify(saved), durationMs: 0, cassette: "live" };
    }
    return inner(req, deps ?? {});
  };
}

async function runDraft(projectDir: string, thinkFn: typeof think): Promise<BriefDeskView> {
  try {
    const loop = briefLoop(guideSession(projectDir), { think: thinkFn });
    const first = await loop.next();
    await loop.return(undefined);
    if (first.value === undefined) throw new Error("The brief did not draft.");
    writePending(projectDir, {
      status: "pending",
      draft: first.value.draft,
      buildStarted: false,
      error: first.value.error,
    });
    return readBriefDesk(projectDir);
  } catch (error) {
    writePending(projectDir, { status: "idle", draft: null, buildStarted: false, error: "" });
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
  if (current.buildStarted || current.status === "approved") return Promise.resolve(current);
  if (current.status === "pending" && current.error === "") return Promise.resolve(current);
  opts?.onProgress?.(BRIEF_PROGRESS_STAGE);
  writePending(projectDir, { status: "drafting", draft: current.draft, buildStarted: current.buildStarted, error: "" });
  const job = runDraft(projectDir, thinkFn);
  jobs.set(key, job);
  void job.finally(() => {
    if (jobs.get(key) === job) jobs.delete(key);
  });
  return job;
}

async function runLoopApprove(projectDir: string, thinkFn: typeof think, saved: SiteBrief): Promise<void> {
  const loop = briefLoop(guideSession(projectDir), { think: resumeThink(thinkFn, saved) });
  const opened = await loop.next();
  if (opened.done || opened.value === undefined) throw new Error("The brief did not resume.");
  const closed = await loop.next("approve");
  if (closed.value?.approved !== true) throw new Error("The brief was not approved.");
}

async function startBuild(projectDir: string): Promise<void> {
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
  void ensureSiteBuild(projectDir);
}

async function runApprove(projectDir: string, thinkFn: typeof think): Promise<BriefDeskView> {
  const current = readBriefDesk(projectDir);
  if (current.buildStarted) return current;
  if (current.status !== "approved") {
    let draft = current.draft;
    if (draft === null || current.status === "idle" || current.status === "drafting") {
      const drafted = await draftSiteBrief(projectDir, thinkFn);
      draft = drafted.draft;
    }
    if (draft === null) throw new Error("The brief is not ready to approve.");
    await runLoopApprove(projectDir, thinkFn, draft);
    writePending(projectDir, { status: "approved", draft, buildStarted: false, error: "" });
  }
  const file = readPending(projectDir);
  if (!file.buildStarted) {
    await startBuild(projectDir);
    writePending(projectDir, { status: "approved", draft: file.draft, buildStarted: true, error: "" });
  }
  return readBriefDesk(projectDir);
}

export function approveSiteBrief(projectDir: string, thinkFn: typeof think): Promise<BriefDeskView> {
  const key = path.resolve(projectDir);
  const existing = approving.get(key);
  if (existing) return existing;
  const job = runApprove(projectDir, thinkFn);
  approving.set(key, job);
  void job.finally(() => {
    if (approving.get(key) === job) approving.delete(key);
  });
  return job;
}

export async function reviseSiteBrief(
  projectDir: string,
  correction: string,
  thinkFn: typeof think,
): Promise<BriefDeskView> {
  const text = correction.trim();
  if (text === "") throw new Error("Write the change.");
  if (QUESTION_ID.test(text)) {
    await writeRevisitId(projectDir, text);
    return { ...readBriefDesk(projectDir), revisit: text };
  }
  if (isApproval(text)) throw new Error("Use Approve to accept the brief.");
  const current = readBriefDesk(projectDir);
  if (current.draft === null) throw new Error("The brief is not ready to change.");
  const loop = briefLoop(guideSession(projectDir), { think: resumeThink(thinkFn, current.draft) });
  const opened = await loop.next();
  if (opened.done || opened.value === undefined) throw new Error("The brief did not resume.");
  const revised = await loop.next(text);
  await loop.return(undefined);
  const draft = revised.value?.draft;
  if (draft === undefined) throw new Error("The brief did not change.");
  writePending(projectDir, { status: "pending", draft, buildStarted: false, error: "" });
  const questionId = text.match(/DP-\d+\.\d+/)?.[0] ?? "brief";
  const live = loadDecisions(projectDir).find((item) => item.questionId === questionId && item.supersededBy === "");
  await syncAnswer(projectDir, {
    questionId,
    text,
    source: "answer",
    moveCursor: false,
    summarize: false,
    think: thinkFn,
    ...(live === undefined ? {} : { supersedeId: live.id }),
  });
  return readBriefDesk(projectDir);
}
