import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquire, release, replaceViaTemp } from "./lock.ts";

export interface HomeProject {
  name: string;
  path: string;
  updatedAt: string;
}

const INDEX_LOCK_NAME = "index.lock";
const INDEX_NAME = "index.json";

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** `os.homedir()` joined with `.hitchhiker/index.json`, unless `homeDir` is passed. */
export function homeIndexPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".hitchhiker", INDEX_NAME);
}

function parseRow(value: unknown, index: number): HomeProject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Home index row ${index} is not an object.`);
  }
  const record = value as Record<string, unknown>;
  const { name, path: projectPath, updatedAt } = record;
  if (
    typeof name !== "string" ||
    typeof projectPath !== "string" ||
    typeof updatedAt !== "string"
  ) {
    throw new Error(
      `Home index row ${index} is missing name, path, or updatedAt.`,
    );
  }
  return { name, path: projectPath, updatedAt };
}

async function readIndex(filePath: string): Promise<HomeProject[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Home index is not valid JSON.");
  }
  if (!Array.isArray(value)) throw new Error("Home index is not an array.");
  return value.map((row, index) => parseRow(row, index));
}

/**
 * Insert or replace one home-index row, keyed by the exact project path string.
 * Callers mkdir the project first (/hh-new does). This function does not create
 * the project directory. A missing path throws before index.lock is taken, so a
 * typo cannot insert a ghost row. `homeDir` defaults to os.homedir().
 */
export async function upsertHomeProject(
  entry: HomeProject,
  homeDir: string = os.homedir(),
): Promise<void> {
  if (!existsSync(entry.path)) {
    throw new Error(
      `Project path does not exist: ${entry.path}. Callers mkdir the project before registering it.`,
    );
  }
  const dir = path.join(homeDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, INDEX_LOCK_NAME);
  const info = await acquire(lockPath);
  try {
    const indexPath = path.join(dir, INDEX_NAME);
    const rows = await readIndex(indexPath);
    const existing = rows.findIndex((row) => row.path === entry.path);
    if (existing >= 0) {
      rows[existing] = entry;
    } else {
      rows.push(entry);
    }
    await replaceViaTemp(indexPath, `${JSON.stringify(rows, null, 2)}\n`);
  } finally {
    await release(lockPath, info.pid);
  }
}
