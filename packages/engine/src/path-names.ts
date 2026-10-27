/**
 * Directory names for PATH lookup.
 * A miss on Windows checks the candidate file and does not list the directory.
 * Listing System32 (and the rest of PATH) on every probe was stalling `hh app`
 * and `hh doctor` inside the full suite. A hit lists that one directory so the
 * returned path keeps the on-disk spelling.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

interface Listed {
  mtimeNs: bigint;
  names: readonly string[];
}

const listed = new Map<string, Listed>();

export function listDirCached(dir: string): readonly string[] | undefined {
  let mtimeNs = 0n;
  try {
    const info = statSync(dir, { bigint: true });
    if (!info.isDirectory()) return undefined;
    mtimeNs = info.mtimeNs;
  } catch {
    listed.delete(dir);
    return undefined;
  }
  const hit = listed.get(dir);
  if (hit !== undefined && hit.mtimeNs === mtimeNs) return hit.names;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  listed.set(dir, { mtimeNs, names });
  return names;
}

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * The path of `fileName` in `dir`, using the name on disk.
 * Comparison is case-insensitive. A directory with that name is not a file.
 */
export function findNamedFile(dir: string, fileName: string): string | null {
  const win = process.platform === "win32";
  if (win && !existsSync(path.join(dir, fileName))) return null;
  let names = listDirCached(dir);
  if (names === undefined) {
    if (!win) return null;
    const candidate = path.join(dir, fileName);
    return isFile(candidate) ? candidate : null;
  }
  const needle = fileName.toLowerCase();
  let found = names.find((entry) => entry.toLowerCase() === needle);
  // A file can land after the listing was cached and before the directory stamp moves.
  if (found === undefined && (win || existsSync(path.join(dir, fileName)) || existsSync(path.join(dir, needle)))) {
    listed.delete(dir);
    names = listDirCached(dir);
    found = names?.find((entry) => entry.toLowerCase() === needle);
  }
  if (found === undefined) return null;
  const candidate = path.join(dir, found);
  return isFile(candidate) ? candidate : null;
}
