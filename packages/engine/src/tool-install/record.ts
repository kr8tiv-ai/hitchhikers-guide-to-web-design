/**
 * Install results saved beside the other desk settings.
 * Strings are scrubbed before they are stored. The allow-list is the same
 * six fields the project file keeps.
 */

import path from "node:path";
import { scrubText } from "../project-file/scrub.ts";
import { INSTALL_TOOLS, type InstallTool } from "./types.ts";

const MAX_RECORDS = 20;
const RECIPE_ID = /^[a-z0-9-]{1,64}$/;
const INSTALL_KEYS = ["tool", "version", "installPath", "installedAt", "recipeId", "source"] as const;

export interface ToolInstallRecord {
  tool: InstallTool;
  version: string | null;
  installPath: string;
  installedAt: string;
  recipeId: string;
  source: string;
}

export class ToolInstallRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInstallRecordError";
  }
}

export function readToolInstalls(value: unknown): ToolInstallRecord[] {
  if (!Array.isArray(value)) throw new ToolInstallRecordError("expected an array.");
  if (value.length > MAX_RECORDS) throw new ToolInstallRecordError("too many install records.");
  return value.map((item, index) => readOne(item, index));
}

export function mergeInstall(
  existing: readonly ToolInstallRecord[],
  next: ToolInstallRecord,
): ToolInstallRecord[] {
  const kept = existing.filter((item) => item.tool !== next.tool);
  const merged = [...kept, next];
  return merged.length > MAX_RECORDS ? merged.slice(merged.length - MAX_RECORDS) : merged;
}

/** Scrub every string field. A planted token becomes `[redacted]`. */
export function publicInstallRecord(record: ToolInstallRecord): ToolInstallRecord {
  return {
    tool: record.tool,
    version: record.version === null ? null : scrubText(record.version).slice(0, 200),
    installPath: scrubText(record.installPath).slice(0, 500),
    installedAt: record.installedAt,
    recipeId: record.recipeId,
    source: scrubText(record.source).slice(0, 300),
  };
}

/**
 * Prepend the install directory to this process only.
 * The user profile and the global PATH are left alone.
 */
export function rememberInstallPath(env: NodeJS.ProcessEnv, installPath: string): void {
  if (!path.isAbsolute(installPath)) return;
  const dir = path.extname(installPath).length > 0 ? path.dirname(installPath) : installPath;
  if (dir.length === 0) return;
  const key = process.platform === "win32" && env.Path !== undefined ? "Path" : "PATH";
  const current = env[key] ?? env.PATH ?? "";
  const parts = current.split(path.delimiter).filter((part) => part.length > 0);
  if (parts.includes(dir)) return;
  const next = `${dir}${path.delimiter}${current}`;
  env[key] = next;
  if (key !== "PATH") env.PATH = next;
}

function readOne(value: unknown, index: number): ToolInstallRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ToolInstallRecordError(`toolInstalls[${index}] expected an object.`);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(INSTALL_KEYS as readonly string[]).includes(key)) {
      throw new ToolInstallRecordError(`toolInstalls[${index}].${key} is not allowed.`);
    }
  }
  const tool = record.tool;
  if (typeof tool !== "string" || !(INSTALL_TOOLS as readonly string[]).includes(tool)) {
    throw new ToolInstallRecordError(`toolInstalls[${index}].tool is not a known tool.`);
  }
  const version = record.version === null ? null : bounded(record.version, `toolInstalls[${index}].version`, 200);
  const installPath = bounded(record.installPath, `toolInstalls[${index}].installPath`, 500);
  const installedAt = bounded(record.installedAt, `toolInstalls[${index}].installedAt`, 40);
  const recipeId = bounded(record.recipeId, `toolInstalls[${index}].recipeId`, 64);
  if (!RECIPE_ID.test(recipeId)) {
    throw new ToolInstallRecordError(`toolInstalls[${index}].recipeId is not a recipe id.`);
  }
  const source = bounded(record.source, `toolInstalls[${index}].source`, 300);
  return {
    tool: tool as InstallTool,
    version,
    installPath: scrubText(installPath),
    installedAt,
    recipeId,
    source: scrubText(source),
  };
}

function bounded(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new ToolInstallRecordError(`${field} expected a string.`);
  const text = scrubText(value);
  if (text.length === 0 || text.length > max) {
    throw new ToolInstallRecordError(`${field} length is out of range.`);
  }
  return text;
}
