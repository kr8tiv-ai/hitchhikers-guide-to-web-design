/**
 * In-memory git for Elevate tests.
 * This is a copy of the helper in packages/qa/test. A test in this package
 * cannot import that file, because relative imports must stay inside the package.
 * The commands those tests and elevateRound actually issue are enough:
 * init, add -A, commit -m, rev-parse HEAD, status --porcelain,
 * reset --hard, and rev-list --count HEAD.
 * reset --hard writes the target snapshot back to disk and deletes
 * files the current commit tracked that the target does not.
 * Untracked files stay, matching git.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type MemoryGit = (dir: string, args: readonly string[]) => Promise<string>;

interface Commit {
  hash: string;
  parent: string | null;
  files: Map<string, Buffer>;
}

interface Repo {
  head: string | null;
  commits: Map<string, Commit>;
  staged: Map<string, Buffer> | null;
}

export function createMemoryGit(): MemoryGit {
  const repos = new Map<string, Repo>();

  return (dir, args) => {
    const root = path.resolve(dir);
    const command = args[0];
    if (command === "init") {
      repos.set(root, { head: null, commits: new Map(), staged: null });
      return Promise.resolve("");
    }
    const repo = repos.get(root);
    if (repo === undefined) {
      return Promise.reject(new Error(`fatal: not a git repository: ${root}`));
    }
    if (command === "add") {
      if (!args.includes("-A") && !args.includes(".")) {
        return Promise.reject(new Error(`git add ${args.slice(1).join(" ")} is not supported`));
      }
      repo.staged = snapshotWorktree(root);
      return Promise.resolve("");
    }
    if (command === "commit") {
      const messageAt = args.indexOf("-m");
      const message = messageAt === -1 ? undefined : args[messageAt + 1];
      if (message === undefined || repo.staged === null) {
        return Promise.reject(new Error("git commit needs -m and a staged tree"));
      }
      const parent = repo.head;
      const files = repo.staged;
      const hash = hashCommit(parent, message, files);
      repo.commits.set(hash, { hash, parent, files });
      repo.head = hash;
      repo.staged = null;
      return Promise.resolve(hash);
    }
    if (command === "rev-parse") {
      if (repo.head === null) return Promise.reject(new Error("fatal: Needed a single revision"));
      return Promise.resolve(repo.head);
    }
    if (command === "status") {
      return Promise.resolve(porcelain(root, headFiles(repo)));
    }
    if (command === "reset") {
      const hash = args[args.indexOf("--hard") + 1]?.toLowerCase();
      const commit = hash === undefined ? undefined : repo.commits.get(hash);
      if (commit === undefined) return Promise.reject(new Error(`fatal: unknown revision ${hash ?? ""}`));
      const current = headFiles(repo);
      for (const relative of current.keys()) {
        if (commit.files.has(relative)) continue;
        rmSync(fullPath(root, relative), { force: true });
      }
      for (const [relative, body] of commit.files) {
        const file = fullPath(root, relative);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, body);
      }
      repo.head = commit.hash;
      repo.staged = null;
      return Promise.resolve("");
    }
    if (command === "rev-list") {
      let count = 0;
      let cursor = repo.head;
      const seen = new Set<string>();
      while (cursor !== null && !seen.has(cursor)) {
        seen.add(cursor);
        count += 1;
        cursor = repo.commits.get(cursor)?.parent ?? null;
      }
      return Promise.resolve(String(count));
    }
    return Promise.reject(new Error(`git ${args.join(" ")} is not supported`));
  };
}

function headFiles(repo: Repo): Map<string, Buffer> {
  if (repo.head === null) return new Map();
  return repo.commits.get(repo.head)?.files ?? new Map();
}

function hashCommit(parent: string | null, message: string, files: Map<string, Buffer>): string {
  const hash = createHash("sha1");
  hash.update(parent ?? "");
  hash.update("\0");
  hash.update(message);
  hash.update("\0");
  for (const name of [...files.keys()].sort()) {
    hash.update(name);
    hash.update("\0");
    const body = files.get(name);
    if (body !== undefined) hash.update(body);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function snapshotWorktree(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  if (existsSync(root)) walk(root, root, files);
  return files;
}

function walk(dir: string, root: string, files: Map<string, Buffer>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, root, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = path.relative(root, full).replaceAll("\\", "/");
    files.set(relative, readFileSync(full));
  }
}

function porcelain(root: string, tracked: Map<string, Buffer>): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  if (existsSync(root)) {
    const disk = new Map<string, Buffer>();
    walk(root, root, disk);
    for (const [relative, body] of disk) {
      seen.add(relative);
      const before = tracked.get(relative);
      if (before === undefined) lines.push(`?? ${relative}`);
      else if (!before.equals(body)) lines.push(` M ${relative}`);
    }
  }
  for (const relative of tracked.keys()) {
    if (!seen.has(relative)) lines.push(` D ${relative}`);
  }
  return lines.join("\n");
}

function fullPath(root: string, relative: string): string {
  if (relative.split("/").includes("..")) {
    throw new Error(`Refusing to touch ${relative}`);
  }
  return path.join(root, ...relative.split("/"));
}
