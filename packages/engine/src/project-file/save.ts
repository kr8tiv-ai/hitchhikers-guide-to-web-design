/**
 * Write one pretty-printed `<name>.hhproject` JSON file.
 * Temp file, flush, backup rotation, then rename. A second window waits, then stays read-only.
 */

import { copyFile, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { acquire, LockHeld, release, replaceViaTemp } from "../lock.ts";
import { captureProject } from "./capture.ts";
import {
  locateProjectFile,
  projectHome,
  readRecentProjects,
  upsertRecentProject,
  writeSaveNotice,
  type RecentProject,
} from "./locate.ts";
import { renderResumeMd, progressLabel } from "./resume-md.ts";
import { renderResumePrompt } from "./resume-prompt.ts";
import {
  PROJECT_FILE_SCHEMA_VERSION,
  ProjectFileError,
  isRecord,
  type ProjectDraft,
  type ProjectFile,
} from "./schema.ts";
import { scrubText, scrubValue } from "./scrub.ts";

const LOCK_TRIES = 3;
const LOCK_WAIT_MS = 120;

export interface SaveOptions {
  to?: string | null;
  now?: Date;
  projectName?: string;
  homeDir?: string;
  version?: string;
  /** After the temp file is flushed and before it replaces the target. Tests use this to kill a write. */
  holdBeforeRename?: () => Promise<void>;
}

export interface SaveResult {
  filePath: string;
  savedAt: string;
  lastDone: string;
  note: string | null;
  projectName: string;
  progress: string;
  projectId: string;
  sourceDir: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function scrubDraft(draft: ProjectDraft): ProjectDraft {
  const cleaned = scrubValue(draft);
  if (!isRecord(cleaned) || cleaned.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) {
    throw new ProjectFileError("The project file could not be scrubbed.");
  }
  return cleaned as ProjectDraft;
}

/** Final pass so a planted key cannot survive inside any string. */
export function sealProjectFile(file: ProjectFile): string {
  const scrubbed = scrubText(`${JSON.stringify(file, null, 2)}\n`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(scrubbed);
  } catch {
    throw new ProjectFileError("The project file could not be written after the secret pass.");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== PROJECT_FILE_SCHEMA_VERSION) {
    throw new ProjectFileError("The project file could not be written after the secret pass.");
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

async function peek(filePath: string): Promise<
  | { kind: "missing" }
  | { kind: "corrupt" }
  | { kind: "newer" }
  | { kind: "ok"; createdAt?: string; projectId?: string }
> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return { kind: "missing" };
    return { kind: "corrupt" };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "corrupt" };
  }
  if (!isRecord(value) || typeof value.schemaVersion !== "number") return { kind: "corrupt" };
  if (value.schemaVersion > PROJECT_FILE_SCHEMA_VERSION) return { kind: "newer" };
  return {
    kind: "ok",
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
    ...(typeof value.projectId === "string" ? { projectId: value.projectId } : {}),
  };
}

export function corruptDestination(filePath: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${filePath}.corrupt-${stamp}`;
}

export async function quarantineProjectFile(filePath: string, now?: Date): Promise<string> {
  const dest = corruptDestination(filePath, now);
  await rename(filePath, dest);
  return dest;
}

async function rotateBak(filePath: string): Promise<void> {
  try {
    await readFile(filePath);
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
  const bak = `${filePath}.bak`;
  const older = `${filePath}.bak.1`;
  await unlink(older).catch(() => undefined);
  await rename(bak, older).catch(() => undefined);
  await copyFile(filePath, bak);
}

async function takeFileLock(lockPath: string): Promise<{ pid: number } | { readOnly: string }> {
  let held: LockHeld | null = null;
  for (let attempt = 0; attempt < LOCK_TRIES; attempt += 1) {
    try {
      const info = await acquire(lockPath);
      return { pid: info.pid };
    } catch (error: unknown) {
      if (!(error instanceof LockHeld)) throw error;
      held = error;
      if (attempt < LOCK_TRIES - 1) await delay(LOCK_WAIT_MS);
    }
  }
  const pid = held === null ? 0 : held.pid;
  return {
    readOnly: `Another window has this project file (pid ${pid}). Opened read-only.`,
  };
}

/**
 * The same write used by autosave, `hh save`, and the desk Save button.
 * Throws on a hard failure. Autosave catches that and records a notice.
 */
export async function saveProjectFile(projectDir: string, options: SaveOptions = {}): Promise<SaveResult> {
  const resolved = path.resolve(projectDir);
  const homeDir = options.homeDir ?? projectHome(resolved);
  let remembered: string | null = null;
  let priorName: string | null = null;
  try {
    const rows = await readRecentProjects(homeDir);
    const prior = rows.find((row) => row.sourceDir === resolved);
    if (prior !== undefined) {
      remembered = prior.filePath;
      priorName = prior.name;
    }
  } catch {
    remembered = null;
  }
  const projectName = options.projectName ?? priorName ?? path.basename(resolved);
  const located = await locateProjectFile(projectName, {
    homeDir,
    remembered,
    to: options.to ?? null,
  });
  const existing = await peek(located.filePath);
  if (existing.kind === "newer") {
    throw new ProjectFileError("This project file was written by a newer app. It is open read-only.");
  }
  if (existing.kind === "corrupt") await quarantineProjectFile(located.filePath);
  const draft = await captureProject(resolved, {
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.version === undefined ? {} : { version: options.version }),
    ...(existing.kind === "ok" && existing.projectId !== undefined ? { projectId: existing.projectId } : {}),
    ...(existing.kind === "ok" && existing.createdAt !== undefined ? { createdAt: existing.createdAt } : {}),
    projectName,
  });
  const scrubbed = scrubDraft(draft);
  const file: ProjectFile = {
    ...scrubbed,
    resumeMd: renderResumeMd(scrubbed, located.filePath),
    resumePrompt: renderResumePrompt(scrubbed, located.filePath),
  };
  const body = sealProjectFile(file);
  const sealed = JSON.parse(body) as ProjectFile;
  const lockPath = `${located.filePath}.lock`;
  const taken = await takeFileLock(lockPath);
  if ("readOnly" in taken) throw new ProjectFileError(taken.readOnly);
  try {
    if (existing.kind === "ok") await rotateBak(located.filePath);
    await replaceViaTemp(located.filePath, body, {
      ...(options.holdBeforeRename === undefined ? {} : { beforeRename: options.holdBeforeRename }),
    });
    const entry: RecentProject = {
      projectId: sealed.projectId,
      name: sealed.projectName,
      filePath: located.filePath,
      sourceDir: resolved,
      savedAt: sealed.savedAt,
      progress: progressLabel(sealed),
      ok: true,
      reason: null,
    };
    await upsertRecentProject(entry, homeDir);
    await writeSaveNotice(
      {
        projectDir: resolved,
        ok: true,
        savedAt: sealed.savedAt,
        filePath: located.filePath,
        reason: located.note,
      },
      homeDir,
    );
    return {
      filePath: located.filePath,
      savedAt: sealed.savedAt,
      lastDone: sealed.queue.lastDone,
      note: located.note,
      projectName: sealed.projectName,
      progress: entry.progress,
      projectId: sealed.projectId,
      sourceDir: resolved,
    };
  } finally {
    await release(lockPath, taken.pid);
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
