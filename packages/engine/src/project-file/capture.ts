/**
 * Read a live project folder into a schema-1 draft.
 * Does not take the state lock and does not write.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadState } from "../state.ts";
import { questionsForDepth, loadTree, type DepthName } from "../tree.ts";
import { readGitRefs } from "./git-refs.ts";
import {
  APP_NAME,
  assumptionFor,
  emptyApproval,
  isRecord,
  type AnswerStatus,
  type ApprovalStamp,
  type NamedHash,
  type ProjectDraft,
  type ProjectState,
  type QueueItemFile,
  type SnapshotFile,
  type StoredAnswer,
} from "./schema.ts";
import { ANSWER_STATUSES } from "./schema.ts";
import { allowSettings, scrubText } from "./scrub.ts";

const SNAPSHOTS = [
  "STATE.md",
  "interview.json",
  "SITE-BRIEF.md",
  "BRAND.md",
  "brand-approval.json",
  "brand/brand-kit.json",
  "queue.json",
  "gallery-walk.json",
  "facts.json",
  "config.json",
  "drive-approval.json",
  "PRD.md",
  "CONTEXT.md",
  "deploy/DEPLOYS.md",
  "brief-yes.json",
  "elevate-yes.json",
  "hostinger-yes.json",
  "site-prompts.json",
  "prompts.json",
];

const TEXT_LIMIT = 1_500_000;

const DEPTHS: readonly DepthName[] = ["express", "standard", "deep"];

export interface CaptureOptions {
  now?: Date;
  version?: string;
  projectId?: string;
  projectName?: string;
  createdAt?: string;
}

function isStatus(value: string): value is AnswerStatus {
  return (ANSWER_STATUSES as readonly string[]).includes(value);
}

async function readText(filePath: string): Promise<string | null> {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    return null;
  }
  if (!info.isFile() || info.size > TEXT_LIMIT) return null;
  const text = await readFile(filePath, "utf8");
  if (text.includes("\u0000")) return null;
  return text;
}

function projectIdFor(projectDir: string): string {
  return `p-${createHash("sha256").update(path.resolve(projectDir)).digest("hex").slice(0, 16)}`;
}

function treePath(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
}

function readDepth(settings: Record<string, unknown>): DepthName {
  const value = settings.interviewDepth;
  if (typeof value === "string" && (DEPTHS as readonly string[]).includes(value)) return value as DepthName;
  return "standard";
}

function parseAnswers(raw: string | null): StoredAnswer[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = isRecord(value) && Array.isArray(value.answers) ? value.answers : Array.isArray(value) ? value : [];
  const answers: StoredAnswer[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.value !== "string" || typeof item.status !== "string") continue;
    if (!isStatus(item.status)) continue;
    answers.push({
      id: item.id,
      status: item.status,
      value: item.value,
      assumption: assumptionFor(item.status),
    });
  }
  return answers;
}

function parseQueue(raw: string | null): QueueItemFile[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  const items: QueueItemFile[] = [];
  for (const item of value.items) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.status !== "string") continue;
    const kind = item.kind === "review" ? "review" : "build";
    items.push({ id: item.id, kind, status: item.status });
  }
  return items;
}

function lastDoneOf(items: readonly QueueItemFile[]): string {
  let best = "";
  let bestN = -1;
  let numeric = false;
  for (const item of items) {
    if (item.status !== "passed" && item.status !== "escalated") continue;
    const parsed = Number.parseInt(item.id, 10);
    if (Number.isFinite(parsed) && String(parsed) === item.id.replace(/^0+(?=\d)/, "")) {
      numeric = true;
      if (parsed >= bestN) {
        bestN = parsed;
        best = item.id;
      }
    } else if (!numeric) {
      best = item.id;
    }
  }
  return best;
}

function currentPrompt(items: readonly QueueItemFile[], state: ProjectState | null): string | null {
  if (state !== null && state.promptId.length > 0 && !state.promptId.startsWith("interview:")) {
    return state.promptId;
  }
  const running = items.find((item) => item.status === "running" || item.status === "queued");
  return running === undefined ? null : running.id;
}

async function yesStamp(projectDir: string, name: string): Promise<ApprovalStamp> {
  const raw = await readText(path.join(projectDir, ".hitchhiker", name));
  if (raw === null) return emptyApproval();
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.approved !== true) return emptyApproval();
    return { approved: true, at: typeof value.at === "string" ? value.at : null };
  } catch {
    return emptyApproval();
  }
}

async function brandStamp(projectDir: string, raw: string | null): Promise<{ sections: Record<string, boolean>; approval: ApprovalStamp }> {
  if (raw === null) return { sections: {}, approval: emptyApproval() };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { sections: {}, approval: emptyApproval() };
  }
  if (!isRecord(value)) return { sections: {}, approval: emptyApproval() };
  const sections: Record<string, boolean> = {};
  let all = true;
  let count = 0;
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag !== "boolean") continue;
    sections[key] = flag;
    count += 1;
    if (!flag) all = false;
  }
  if (!all || count === 0) return { sections, approval: emptyApproval() };
  let at: string | null = null;
  try {
    const info = await stat(path.join(projectDir, ".hitchhiker", "brand-approval.json"));
    at = info.mtime.toISOString();
  } catch {
    at = null;
  }
  return { sections, approval: { approved: true, at } };
}

function driveStamp(raw: string | null, key: "prd" | "promptPackage" | "context"): ApprovalStamp {
  if (raw === null) return emptyApproval();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyApproval();
  }
  if (!isRecord(value) || !isRecord(value[key])) return emptyApproval();
  const stamp = value[key];
  if (stamp.approved !== true) return emptyApproval();
  return { approved: true, at: typeof stamp.at === "string" ? stamp.at : null };
}

async function hashDir(dir: string): Promise<NamedHash[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const listed: NamedHash[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    const data = await readFile(filePath);
    listed.push({
      name: entry.name,
      hash: createHash("sha256").update(data).digest("hex"),
    });
  }
  listed.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return listed;
}

async function snapshotOf(hitch: string): Promise<SnapshotFile[]> {
  const files: SnapshotFile[] = [];
  for (const relative of SNAPSHOTS) {
    const text = await readText(path.join(hitch, relative));
    if (text === null) continue;
    files.push({ path: relative, text: scrubText(text) });
  }
  return files;
}

function questionPlace(
  projectDir: string,
  settings: Record<string, unknown>,
  promptId: string,
): { index: number | null; total: number | null; currentQuestionId: string | null } {
  const currentQuestionId = promptId.startsWith("interview:") ? promptId.slice("interview:".length) : null;
  try {
    const questions = questionsForDepth(loadTree(treePath(projectDir)), readDepth(settings));
    const total = questions.length;
    if (currentQuestionId === null) return { index: null, total, currentQuestionId: null };
    if (currentQuestionId === "done") return { index: total, total, currentQuestionId: "done" };
    const at = questions.findIndex((question) => question.id === currentQuestionId);
    return { index: at >= 0 ? at + 1 : null, total, currentQuestionId };
  } catch {
    return { index: null, total: null, currentQuestionId };
  }
}

export async function captureProject(projectDir: string, options: CaptureOptions = {}): Promise<ProjectDraft> {
  const resolved = path.resolve(projectDir);
  const hitch = path.join(resolved, ".hitchhiker");
  const now = (options.now ?? new Date()).toISOString();
  const stateLoaded = loadState(resolved);
  const state: ProjectState | null = stateLoaded === null ? null : { ...stateLoaded, blockers: [...stateLoaded.blockers] };
  const interviewRaw = await readText(path.join(hitch, "interview.json"));
  const queueRaw = await readText(path.join(hitch, "queue.json"));
  const configRaw = await readText(path.join(hitch, "config.json"));
  let configValue: unknown = {};
  if (configRaw !== null) {
    try {
      configValue = JSON.parse(configRaw);
    } catch {
      configValue = {};
    }
  }
  const settings = allowSettings(configValue);
  const voice = typeof settings.voiceEngine === "string" ? settings.voiceEngine : null;
  const answers = parseAnswers(interviewRaw);
  const items = parseQueue(queueRaw);
  const promptId = state?.promptId ?? "";
  const place = questionPlace(resolved, settings, promptId);
  const briefBody = await readText(path.join(hitch, "SITE-BRIEF.md"));
  const brandBody = await readText(path.join(hitch, "BRAND.md"));
  const prdBody = await readText(path.join(hitch, "PRD.md"));
  const promptBody =
    (await readText(path.join(hitch, "site-prompts.json"))) ??
    (await readText(path.join(hitch, "prompts.json")));
  const brand = await brandStamp(resolved, await readText(path.join(hitch, "brand-approval.json")));
  const driveRaw = await readText(path.join(hitch, "drive-approval.json"));
  const blockers = state?.blockers ?? [];
  const name = options.projectName ?? path.basename(resolved);
  return {
    schemaVersion: 1,
    createdAt: options.createdAt ?? now,
    savedAt: now,
    app: { name: APP_NAME, version: options.version ?? "0.0.0" },
    projectId: options.projectId ?? projectIdFor(resolved),
    projectName: name,
    sourceDir: resolved,
    interview: {
      answers,
      currentQuestionId: place.currentQuestionId,
      index: place.index,
      total: place.total,
    },
    brief: { body: briefBody, approval: await yesStamp(resolved, "brief-yes.json") },
    brand: { body: brandBody, sections: brand.sections, approval: brand.approval },
    prd: { body: prdBody, approval: driveStamp(driveRaw, "prd") },
    promptPackage: { body: promptBody, approval: driveStamp(driveRaw, "promptPackage") },
    elevate: await yesStamp(resolved, "elevate-yes.json"),
    hostinger: await yesStamp(resolved, "hostinger-yes.json"),
    queue: {
      items,
      lastDone: lastDoneOf(items),
      currentPrompt: currentPrompt(items, state),
      blockers: [...blockers],
    },
    state,
    git: await readGitRefs(resolved, state?.lastGoodCommit ?? null),
    settings,
    voice,
    uploads: await hashDir(path.join(hitch, "uploads")),
    references: await hashDir(path.join(hitch, "references")),
    snapshot: await snapshotOf(hitch),
  };
}
