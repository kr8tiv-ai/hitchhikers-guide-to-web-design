/**
 * Glob list from improve/protected.json. The runner keeps this list in
 * memory for the whole loop so a rewritten file cannot shrink the set.
 */

export interface ProtectedList {
  paths: readonly string[];
  evaluation: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`protected.json ${label} must be a non-empty list.`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`protected.json ${label} must be strings.`);
    }
    items.push(normalizeRepoPath(item));
  }
  return items;
}

/** Parse the shipped protected list. Both arrays are required. */
export function parseProtected(json: string): ProtectedList {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error("protected.json is not JSON.");
  }
  if (!isRecord(value)) throw new Error("protected.json must be an object.");
  return {
    paths: stringList(value.paths, "paths"),
    evaluation: stringList(value.evaluation, "evaluation"),
  };
}

export function isUnsafeRepoPath(input: string): boolean {
  const slash = input.replace(/\\/g, "/");
  if (slash.startsWith("/") || /^[A-Za-z]:/.test(slash)) return true;
  return slash.split("/").some((part) => part === "..");
}

export function normalizeRepoPath(input: string): string {
  return input
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentMatch(file: string, glob: string): boolean {
  if (!glob.includes("*")) return file === glob;
  const source = glob.split("*").map((part) => escapeRegExp(part)).join("[^/]*");
  return new RegExp(`^${source}$`).test(file);
}

function matchParts(
  file: readonly string[],
  fileIndex: number,
  glob: readonly string[],
  globIndex: number,
): boolean {
  if (globIndex === glob.length) return fileIndex === file.length;
  const part = glob[globIndex];
  if (part === undefined) return false;
  if (part === "**") {
    if (globIndex === glob.length - 1) return true;
    for (let cursor = fileIndex; cursor <= file.length; cursor += 1) {
      if (matchParts(file, cursor, glob, globIndex + 1)) return true;
    }
    return false;
  }
  const current = file[fileIndex];
  if (current === undefined || !segmentMatch(current, part)) return false;
  return matchParts(file, fileIndex + 1, glob, globIndex + 1);
}

/** True when a repo-relative path matches one glob. `**` crosses directories. */
export function globMatch(file: string, glob: string): boolean {
  if (isUnsafeRepoPath(file) || isUnsafeRepoPath(glob)) return false;
  const fileParts = normalizeRepoPath(file).split("/").filter((part) => part.length > 0);
  const globParts = normalizeRepoPath(glob).split("/").filter((part) => part.length > 0);
  if (fileParts.length === 0 || globParts.length === 0) return false;
  return matchParts(fileParts, 0, globParts, 0);
}

export function matchProtected(file: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globMatch(file, glob));
}

/** A target of `dir` covers `dir` and `dir/...`, not `dir-extra`. */
export function pathOutsideTargets(file: string, targets: readonly string[]): boolean {
  const normalized = normalizeRepoPath(file);
  for (const target of targets) {
    const root = normalizeRepoPath(target);
    if (normalized === root || normalized.startsWith(`${root}/`)) return false;
  }
  return true;
}
