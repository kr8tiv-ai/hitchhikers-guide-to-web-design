/**
 * Read a project file. A bad file is moved aside, then the backup, then the live folder.
 * A newer schema opens read-only and is never rewritten.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { captureProject } from "./capture.ts";
import { migrate } from "./migrate.ts";
import { renderResumeMd } from "./resume-md.ts";
import { renderResumePrompt } from "./resume-prompt.ts";
import {
  ANSWER_STATUSES,
  PROJECT_FILE_SCHEMA_VERSION,
  isRecord,
  type AnswerStatus,
  type ApprovalStamp,
  type ProjectFile,
  type ProjectGit,
  type QueueItemFile,
} from "./schema.ts";
import { quarantineProjectFile } from "./save.ts";

export interface LoadResult {
  file: ProjectFile | null;
  source: "file" | "backup" | "live" | "none";
  readOnly: boolean;
  message: string | null;
  filePath: string;
}

export interface LoadOptions {
  /** Used when the file and the backup cannot be read. */
  liveDir?: string | null;
}

const NEWER = "This project file was written by a newer app. It is open read-only.";
const USED_BACKUP = "The project file was unreadable. Using the previous save.";
const USED_LIVE = "The project file and its backup were unreadable. Using the project folder on disk.";

function isStatus(value: string): value is AnswerStatus {
  return (ANSWER_STATUSES as readonly string[]).includes(value);
}

function readStamp(value: unknown): ApprovalStamp | null {
  if (!isRecord(value) || typeof value.approved !== "boolean") return null;
  if (value.at !== null && typeof value.at !== "string") return null;
  return { approved: value.approved, at: value.at === null ? null : value.at };
}

function readGit(value: unknown): ProjectGit | null {
  if (!isRecord(value) || typeof value.present !== "boolean") return null;
  const optional = (item: unknown): string | null | undefined => {
    if (item === null) return null;
    if (typeof item === "string") return item;
    return undefined;
  };
  const branch = optional(value.branch);
  const head = optional(value.head);
  const lastGoodCommit = optional(value.lastGoodCommit);
  const remoteUrl = optional(value.remoteUrl);
  if (branch === undefined || head === undefined || lastGoodCommit === undefined || remoteUrl === undefined) {
    return null;
  }
  return { present: value.present, branch, head, lastGoodCommit, remoteUrl };
}

function readItems(value: unknown): QueueItemFile[] | null {
  if (!Array.isArray(value)) return null;
  const items: QueueItemFile[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.status !== "string") return null;
    if (item.kind !== "build" && item.kind !== "review") return null;
    items.push({ id: item.id, kind: item.kind, status: item.status });
  }
  return items;
}

/** Schema 1 object, or null when a required field is missing or the wrong type. */
export function parseProjectFile(value: unknown): ProjectFile | null {
  if (!isRecord(value) || value.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) return null;
  if (!isRecord(value.app) || typeof value.app.name !== "string" || typeof value.app.version !== "string") return null;
  const strings = ["createdAt", "savedAt", "projectId", "projectName", "sourceDir", "resumeMd", "resumePrompt"] as const;
  for (const key of strings) {
    if (typeof value[key] !== "string") return null;
  }
  if (!isRecord(value.interview) || !Array.isArray(value.interview.answers)) return null;
  for (const item of value.interview.answers) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") return null;
    if (typeof item.status !== "string" || !isStatus(item.status) || typeof item.assumption !== "boolean") return null;
  }
  const index = value.interview.index;
  const total = value.interview.total;
  const currentQuestionId = value.interview.currentQuestionId;
  if (index !== null && typeof index !== "number") return null;
  if (total !== null && typeof total !== "number") return null;
  if (currentQuestionId !== null && typeof currentQuestionId !== "string") return null;
  if (!isRecord(value.brief) || !isRecord(value.brand) || !isRecord(value.prd) || !isRecord(value.promptPackage)) {
    return null;
  }
  const briefApproval = readStamp(value.brief.approval);
  const brandApproval = readStamp(value.brand.approval);
  const prdApproval = readStamp(value.prd.approval);
  const promptApproval = readStamp(value.promptPackage.approval);
  const elevate = readStamp(value.elevate);
  const hostinger = readStamp(value.hostinger);
  if (
    briefApproval === null ||
    brandApproval === null ||
    prdApproval === null ||
    promptApproval === null ||
    elevate === null ||
    hostinger === null
  ) {
    return null;
  }
  if (!isRecord(value.queue)) return null;
  const items = readItems(value.queue.items);
  if (items === null || typeof value.queue.lastDone !== "string") return null;
  if (value.queue.currentPrompt !== null && typeof value.queue.currentPrompt !== "string") return null;
  if (!Array.isArray(value.queue.blockers) || value.queue.blockers.some((item) => typeof item !== "string")) return null;
  const git = readGit(value.git);
  if (git === null || !isRecord(value.settings)) return null;
  if (value.voice !== null && typeof value.voice !== "string") return null;
  if (!Array.isArray(value.uploads) || !Array.isArray(value.references) || !Array.isArray(value.snapshot)) return null;
  return value as unknown as ProjectFile;
}

function withResume(file: ProjectFile, filePath: string): ProjectFile {
  if (file.resumeMd.trim().length > 0 && file.resumePrompt.trim().length > 0) return file;
  const { resumeMd: _md, resumePrompt: _prompt, ...draft } = file;
  return {
    ...file,
    resumeMd: file.resumeMd.trim().length > 0 ? file.resumeMd : renderResumeMd(draft, filePath),
    resumePrompt: file.resumePrompt.trim().length > 0 ? file.resumePrompt : renderResumePrompt(draft, filePath),
  };
}

async function readRaw(filePath: string): Promise<{ missing: boolean; value: unknown | null }> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    return { missing: code === "ENOENT", value: null };
  }
  try {
    return { missing: false, value: JSON.parse(raw) as unknown };
  } catch {
    return { missing: false, value: null };
  }
}

function fromValue(value: unknown, filePath: string): { file: ProjectFile | null; readOnly: boolean; message: string | null } {
  if (!isRecord(value) || typeof value.schemaVersion !== "number" || !Number.isInteger(value.schemaVersion)) {
    return { file: null, readOnly: false, message: null };
  }
  if (value.schemaVersion > PROJECT_FILE_SCHEMA_VERSION) {
    const migrated = migrate(value, value.schemaVersion);
    const view = parseProjectFile(value);
    return {
      file: view,
      readOnly: true,
      message: migrated.message ?? NEWER,
    };
  }
  if (value.schemaVersion < PROJECT_FILE_SCHEMA_VERSION) {
    const migrated = migrate(value, value.schemaVersion);
    if (migrated.file === null || migrated.readOnly) {
      return { file: null, readOnly: migrated.readOnly, message: migrated.message };
    }
    return { file: withResume(migrated.file, filePath), readOnly: false, message: null };
  }
  const parsed = parseProjectFile(value);
  if (parsed === null) return { file: null, readOnly: false, message: null };
  return { file: parsed, readOnly: false, message: null };
}

async function fromLive(liveDir: string, filePath: string): Promise<ProjectFile | null> {
  try {
    const draft = await captureProject(liveDir);
    return {
      ...draft,
      resumeMd: renderResumeMd(draft, filePath),
      resumePrompt: renderResumePrompt(draft, filePath),
    };
  } catch {
    return null;
  }
}

/**
 * Validate `filePath`. On failure, move it to `<name>.corrupt-<timestamp>`, then try `.bak`, then the live folder.
 * Never deletes the bad file. Never rewrites a newer schema.
 */
export async function loadProjectFile(filePath: string, options: LoadOptions = {}): Promise<LoadResult> {
  const resolved = path.resolve(filePath);
  const primary = await readRaw(resolved);
  if (primary.value !== null) {
    const read = fromValue(primary.value, resolved);
    if (read.file !== null || read.readOnly) {
      return {
        file: read.file,
        source: "file",
        readOnly: read.readOnly,
        message: read.message,
        filePath: resolved,
      };
    }
  }
  if (!primary.missing) {
    await quarantineProjectFile(resolved).catch(() => undefined);
  }
  const bakPath = `${resolved}.bak`;
  const backup = await readRaw(bakPath);
  if (backup.value !== null) {
    const read = fromValue(backup.value, resolved);
    if (read.file !== null && !read.readOnly) {
      return {
        file: read.file,
        source: "backup",
        readOnly: false,
        message: USED_BACKUP,
        filePath: resolved,
      };
    }
  }
  const liveDir = options.liveDir ?? null;
  if (liveDir !== null && liveDir.length > 0) {
    const live = await fromLive(liveDir, resolved);
    if (live !== null) {
      return {
        file: live,
        source: "live",
        readOnly: false,
        message: USED_LIVE,
        filePath: resolved,
      };
    }
  }
  return {
    file: null,
    source: "none",
    readOnly: false,
    message: primary.missing ? "The project file is missing." : USED_LIVE,
    filePath: resolved,
  };
}

export function projectFileBackup(filePath: string): string {
  return `${path.resolve(filePath)}.bak`;
}
