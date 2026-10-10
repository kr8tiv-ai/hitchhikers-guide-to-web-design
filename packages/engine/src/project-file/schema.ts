/**
 * Portable project file, schema 1.
 * One pretty-printed JSON file: `<name>.hhproject`.
 * A single file travels, a truncated file is detectable, and the resume text
 * sits in the same JSON so another agent can read it without a second format.
 */

export const PROJECT_FILE_SCHEMA_VERSION = 1;

export const APP_NAME = "The Hitchhiker's Guide to Web Design";

export const ANSWER_STATUSES = ["ANSWERED", "SUGGESTED", "SKIPPED", "SOFT", "IMPORTED"] as const;

export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export interface StoredAnswer {
  id: string;
  status: AnswerStatus;
  value: string;
  assumption: boolean;
}

export interface ApprovalStamp {
  approved: boolean;
  at: string | null;
}

export interface QueueItemFile {
  id: string;
  kind: "build" | "review";
  status: string;
}

export interface SnapshotFile {
  path: string;
  text: string;
}

export interface NamedHash {
  name: string;
  hash: string;
}

export interface ProjectState {
  phase: string;
  slice: string;
  promptId: string;
  lastGoodCommit: string;
  blockers: string[];
  nextAction: string;
  updatedAt: string;
}

export interface ProjectGit {
  present: boolean;
  branch: string | null;
  head: string | null;
  lastGoodCommit: string | null;
  remoteUrl: string | null;
}

export interface ProjectFile {
  schemaVersion: 1;
  createdAt: string;
  savedAt: string;
  app: { name: string; version: string };
  projectId: string;
  projectName: string;
  sourceDir: string;
  interview: {
    answers: StoredAnswer[];
    currentQuestionId: string | null;
    index: number | null;
    total: number | null;
  };
  brief: { body: string | null; approval: ApprovalStamp };
  brand: { body: string | null; sections: Record<string, boolean>; approval: ApprovalStamp };
  prd: { body: string | null; approval: ApprovalStamp };
  promptPackage: { body: string | null; approval: ApprovalStamp };
  elevate: ApprovalStamp;
  hostinger: ApprovalStamp;
  queue: {
    items: QueueItemFile[];
    lastDone: string;
    currentPrompt: string | null;
    blockers: string[];
  };
  state: ProjectState | null;
  git: ProjectGit;
  settings: Record<string, unknown>;
  voice: string | null;
  uploads: NamedHash[];
  references: NamedHash[];
  snapshot: SnapshotFile[];
  resumeMd: string;
  resumePrompt: string;
}

export type ProjectDraft = Omit<ProjectFile, "resumeMd" | "resumePrompt">;

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileError";
  }
}

export function emptyApproval(): ApprovalStamp {
  return { approved: false, at: null };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assumptionFor(status: AnswerStatus): boolean {
  return status === "SUGGESTED" || status === "SKIPPED";
}
