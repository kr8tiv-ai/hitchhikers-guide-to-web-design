import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isUnsafeRepoPath, matchProtected } from "@hitchhiker/engine";

const SKIP = new Set(["node_modules", "dist", ".git", "vendor", "coverage"]);
const MAX_BYTES = 2_000_000;
const TEXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".html",
  ".svg",
  ".txt",
  ".astro",
]);

export interface HashedFile {
  path: string;
  body: string;
}

function inside(cwd: string, abs: string): string | null {
  const rel = path.relative(cwd, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const portable = rel.split(path.sep).join("/");
  if (isUnsafeRepoPath(portable)) return null;
  return portable;
}

/** Bytes of every file matching the evaluation globs, for the baseline hash. */
export function readEvaluationFiles(cwd: string, globs: readonly string[]): HashedFile[] {
  const out: HashedFile[] = [];
  walkHash(cwd, cwd, globs, out);
  return out;
}

function walkHash(cwd: string, dir: string, globs: readonly string[], out: HashedFile[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walkHash(cwd, abs, globs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = inside(cwd, abs);
    if (rel === null || !matchProtected(rel, globs)) continue;
    const buffer = readFileSync(abs);
    if (buffer.length > MAX_BYTES) throw new Error(`Evaluation file is too large: ${rel}`);
    out.push({ path: rel, body: buffer.toString("latin1") });
  }
}

export function readTargetText(cwd: string, targets: readonly string[]): HashedFile[] {
  const out: HashedFile[] = [];
  for (const target of targets) {
    if (isUnsafeRepoPath(target)) continue;
    const abs = path.resolve(cwd, target);
    const rel = inside(cwd, abs);
    if (rel === null) continue;
    let info;
    try {
      info = statSync(abs);
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) continue;
    if (info.isFile()) pushText(cwd, abs, out);
    else if (info.isDirectory()) walkText(cwd, abs, out);
  }
  return out;
}

function walkText(cwd: string, dir: string, out: HashedFile[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walkText(cwd, abs, out);
      continue;
    }
    if (entry.isFile()) pushText(cwd, abs, out);
  }
}

function pushText(cwd: string, abs: string, out: HashedFile[]): void {
  if (!TEXT.has(path.extname(abs).toLowerCase())) return;
  const rel = inside(cwd, abs);
  if (rel === null) return;
  const buffer = readFileSync(abs);
  if (buffer.length > MAX_BYTES) return;
  out.push({ path: rel, body: buffer.toString("utf8") });
}
