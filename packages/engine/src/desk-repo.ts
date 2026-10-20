/**
 * The desk's own source tree is not a site project.
 * A worktree of the same git repo counts, and so does any folder inside one.
 * A parent of the repo does not.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const DESK_REPO_REFUSAL =
  "This folder is the Hitchhiker desk's own source repo, or a folder inside it. A site project has to live outside that repo, for example in your Hitchhiker Sites folder. Name a new folder and start there.";

let packageRoot: string | null | undefined;

function readPackageName(file: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const name = (parsed as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

function looksLikeDeskRoot(dir: string): boolean {
  const appPkg = path.join(dir, "packages", "app", "package.json");
  const enginePkg = path.join(dir, "packages", "engine", "package.json");
  return readPackageName(appPkg) === "@hitchhiker/app" && existsSync(enginePkg);
}

/** The checkout that contains this desk package. Null when the files are not there. */
export function deskPackageRoot(): string | null {
  if (packageRoot !== undefined) return packageRoot;
  let dir = import.meta.dirname;
  for (let hop = 0; hop < 8; hop += 1) {
    if (looksLikeDeskRoot(dir)) {
      packageRoot = path.resolve(dir);
      return packageRoot;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  packageRoot = null;
  return null;
}

function gitPointer(start: string): { gitDir: string; worktree: string } | null {
  let dir = start;
  for (let hop = 0; hop < 12; hop += 1) {
    const git = path.join(dir, ".git");
    if (existsSync(git)) {
      try {
        const info = statSync(git);
        if (info.isDirectory()) return { gitDir: git, worktree: path.resolve(dir) };
        if (info.isFile()) {
          const text = readFileSync(git, "utf8");
          const match = /^gitdir:\s*(.+)$/im.exec(text);
          if (match?.[1] === undefined) return null;
          const gitDir = path.resolve(dir, match[1].trim());
          return { gitDir, worktree: path.resolve(dir) };
        }
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function commonGitDir(gitDir: string): string {
  const commonFile = path.join(gitDir, "commondir");
  if (!existsSync(commonFile)) return gitDir;
  try {
    const rel = readFileSync(commonFile, "utf8").trim();
    if (rel === "") return gitDir;
    return path.resolve(gitDir, rel);
  } catch {
    return gitDir;
  }
}

function worktreeRoots(commonGit: string): string[] {
  const roots = [path.resolve(path.dirname(commonGit))];
  const listed = path.join(commonGit, "worktrees");
  if (!existsSync(listed)) return roots;
  let names: string[] = [];
  try {
    names = readdirSync(listed);
  } catch {
    return roots;
  }
  for (const name of names) {
    const pointer = path.join(listed, name, "gitdir");
    if (!existsSync(pointer)) continue;
    try {
      const target = readFileSync(pointer, "utf8").trim();
      if (target === "") continue;
      roots.push(path.resolve(path.dirname(target)));
    } catch {
      // A half-written worktree entry is not a project root.
    }
  }
  return roots;
}

/** This checkout, the main worktree, and every linked worktree of the same repo. */
export function deskRepoRoots(): string[] {
  const root = deskPackageRoot();
  if (root === null) return [];
  const found = new Set<string>([path.resolve(root)]);
  const pointer = gitPointer(root);
  if (pointer !== null) {
    for (const candidate of worktreeRoots(commonGitDir(pointer.gitDir))) {
      found.add(path.resolve(candidate));
    }
  }
  return [...found];
}

/**
 * True for a desk repo root and for any folder inside it.
 * `path.relative` on Windows ignores case, so `C:\Repo` and `c:\repo\pkg` match.
 */
export function isInsideDeskRepo(target: string): boolean {
  const resolved = path.resolve(target);
  for (const root of deskRepoRoots()) {
    const rel = path.relative(root, resolved);
    if (rel === "") return true;
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    return true;
  }
  return false;
}

/** Tests that move the package root call this. Production does not. */
export function resetDeskRepoCache(): void {
  packageRoot = undefined;
}
