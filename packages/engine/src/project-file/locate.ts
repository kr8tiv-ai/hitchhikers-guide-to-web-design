/**
 * Default location is the Desktop via node:os and node:path.
 * If Desktop is missing or not writable, the file goes in the home folder
 * and the caller tells the user where. A remembered path wins over the default.
 * OneDrive desktops are used when they are the only Desktop folder under home.
 */

import { access, mkdir, readFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquire, release, replaceViaTemp } from "../lock.ts";
import { sanitizeProjectName } from "./names.ts";
import { ProjectFileError, isRecord } from "./schema.ts";

export interface LocateResult {
  filePath: string;
  directory: string;
  note: string | null;
}

export interface RecentProject {
  projectId: string;
  name: string;
  filePath: string;
  sourceDir: string;
  savedAt: string;
  progress: string;
  ok: boolean;
  reason: string | null;
}

const INDEX_NAME = "recent-projects.json";
const NOTICE_NAME = "save-notices.json";

export function projectHome(projectDir?: string): string {
  const from = process.env.HH_PROJECT_HOME;
  if (typeof from === "string" && from.trim().length > 0) return path.resolve(from);
  const e2e = process.env.HH_E2E_PROJECT;
  if (typeof e2e === "string" && e2e.trim().length > 0) {
    return path.join(path.resolve(e2e), ".hh-save-home");
  }
  const underTest =
    process.execArgv.some((arg) => arg === "--test" || arg.startsWith("--test=")) ||
    (typeof process.env.NODE_TEST_CONTEXT === "string" && process.env.NODE_TEST_CONTEXT.length > 0);
  if (underTest && projectDir !== undefined && projectDir.length > 0) {
    return path.join(projectDir, ".hh-save-home");
  }
  return os.homedir();
}

export function recentIndexPath(homeDir: string): string {
  return path.join(homeDir, ".hitchhiker", INDEX_NAME);
}

export function saveNoticePath(homeDir: string): string {
  return path.join(homeDir, ".hitchhiker", NOTICE_NAME);
}

async function writableDir(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function desktopCandidates(homeDir: string): string[] {
  return [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "OneDrive", "Desktop"),
    path.join(homeDir, "OneDrive - Personal", "Desktop"),
  ];
}

/**
 * Pick the file path. `remembered` is a previous full path. `to` is an explicit choice.
 * An explicit directory receives `<name>.hhproject` inside it.
 */
export async function locateProjectFile(
  projectName: string,
  options: { homeDir?: string; remembered?: string | null; to?: string | null } = {},
): Promise<LocateResult> {
  const stem = sanitizeProjectName(projectName);
  const fileName = `${stem}.hhproject`;
  if (options.to !== undefined && options.to !== null && options.to.trim().length > 0) {
    const chosen = path.resolve(options.to);
    const asFile = chosen.toLowerCase().endsWith(".hhproject") ? chosen : path.join(chosen, fileName);
    const directory = path.dirname(asFile);
    await mkdir(directory, { recursive: true });
    return { filePath: asFile, directory, note: null };
  }
  if (options.remembered !== undefined && options.remembered !== null && options.remembered.length > 0) {
    const directory = path.dirname(options.remembered);
    if (await writableDir(directory)) {
      return { filePath: options.remembered, directory, note: null };
    }
  }
  const homeDir = options.homeDir ?? projectHome();
  await mkdir(homeDir, { recursive: true });
  for (const directory of desktopCandidates(homeDir)) {
    if (await writableDir(directory)) {
      return { filePath: path.join(directory, fileName), directory, note: null };
    }
  }
  if (!(await writableDir(homeDir))) {
    throw new ProjectFileError(`The home folder is not writable: ${homeDir}`);
  }
  return {
    filePath: path.join(homeDir, fileName),
    directory: homeDir,
    note: `Desktop is not available. The project file is in ${homeDir}.`,
  };
}

function parseRecent(value: unknown, index: number): RecentProject {
  if (!isRecord(value)) throw new ProjectFileError(`Recent project ${index} is not an object.`);
  const { projectId, name, filePath, sourceDir, savedAt, progress, ok, reason } = value;
  if (
    typeof projectId !== "string" ||
    typeof name !== "string" ||
    typeof filePath !== "string" ||
    typeof sourceDir !== "string" ||
    typeof savedAt !== "string" ||
    typeof progress !== "string" ||
    typeof ok !== "boolean"
  ) {
    throw new ProjectFileError(`Recent project ${index} is missing a field.`);
  }
  if (reason !== null && typeof reason !== "string") {
    throw new ProjectFileError(`Recent project ${index} has a bad reason.`);
  }
  return { projectId, name, filePath, sourceDir, savedAt, progress, ok, reason };
}

export async function readRecentProjects(homeDir: string = projectHome()): Promise<RecentProject[]> {
  let raw: string;
  try {
    raw = await readFile(recentIndexPath(homeDir), "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProjectFileError("The recent-projects index is not valid JSON.");
  }
  if (!Array.isArray(value)) throw new ProjectFileError("The recent-projects index is not a list.");
  return value.map((row, index) => parseRecent(row, index));
}

export async function upsertRecentProject(entry: RecentProject, homeDir: string = projectHome()): Promise<void> {
  const dir = path.join(homeDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, `${INDEX_NAME}.lock`);
  const info = await acquire(lockPath);
  try {
    const indexPath = recentIndexPath(homeDir);
    let rows: RecentProject[] = [];
    try {
      rows = await readRecentProjects(homeDir);
    } catch {
      rows = [];
    }
    const at = rows.findIndex((row) => row.sourceDir === entry.sourceDir || row.filePath === entry.filePath);
    if (at >= 0) rows[at] = entry;
    else rows.unshift(entry);
    await replaceViaTemp(indexPath, `${JSON.stringify(rows, null, 2)}\n`);
  } finally {
    await release(lockPath, info.pid);
  }
}

/** Drop the index row. The project file stays on disk. */
export async function removeRecentProject(filePath: string, homeDir: string = projectHome()): Promise<boolean> {
  const dir = path.join(homeDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, `${INDEX_NAME}.lock`);
  const info = await acquire(lockPath);
  try {
    const rows = await readRecentProjects(homeDir);
    const next = rows.filter((row) => row.filePath !== filePath);
    if (next.length === rows.length) return false;
    await replaceViaTemp(recentIndexPath(homeDir), `${JSON.stringify(next, null, 2)}\n`);
    return true;
  } finally {
    await release(lockPath, info.pid);
  }
}

export function findRecent(
  rows: readonly RecentProject[],
  query: string,
): RecentProject | "many" | null {
  const needle = query.trim();
  if (needle.length === 0) return null;
  const resolved = path.resolve(needle);
  const byPath = rows.filter((row) => row.filePath === needle || path.resolve(row.filePath) === resolved);
  if (byPath.length === 1) return byPath[0] ?? null;
  const lower = needle.toLowerCase();
  const byName = rows.filter((row) => row.name.toLowerCase() === lower || row.projectId.toLowerCase() === lower);
  if (byName.length === 1) return byName[0] ?? null;
  if (byName.length > 1) return "many";
  return null;
}

export interface SaveNotice {
  projectDir: string;
  ok: boolean;
  savedAt: string | null;
  filePath: string | null;
  reason: string | null;
}

export async function readSaveNotice(projectDir: string, homeDir: string = projectHome(projectDir)): Promise<SaveNotice | null> {
  let raw: string;
  try {
    raw = await readFile(saveNoticePath(homeDir), "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const row = value[path.resolve(projectDir)];
  if (!isRecord(row)) return null;
  if (typeof row.ok !== "boolean") return null;
  return {
    projectDir: path.resolve(projectDir),
    ok: row.ok,
    savedAt: typeof row.savedAt === "string" ? row.savedAt : null,
    filePath: typeof row.filePath === "string" ? row.filePath : null,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

export async function writeSaveNotice(notice: SaveNotice, homeDir: string = projectHome(notice.projectDir)): Promise<void> {
  const dir = path.join(homeDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, `${NOTICE_NAME}.lock`);
  const info = await acquire(lockPath);
  try {
    let map: Record<string, unknown> = {};
    try {
      const raw = await readFile(saveNoticePath(homeDir), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) map = parsed;
    } catch {
      map = {};
    }
    map[path.resolve(notice.projectDir)] = {
      ok: notice.ok,
      savedAt: notice.savedAt,
      filePath: notice.filePath,
      reason: notice.reason,
    };
    await replaceViaTemp(saveNoticePath(homeDir), `${JSON.stringify(map, null, 2)}\n`);
  } finally {
    await release(lockPath, info.pid);
  }
}

export function locationLabel(filePath: string): string {
  const parent = path.basename(path.dirname(filePath));
  if (parent.length === 0) return filePath;
  return parent;
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
