/**
 * BUG-046. The desk's own checkout, and every worktree of it, is not a site project.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DESK_REPO_REFUSAL, deskRepoRoots, isInsideDeskRepo } from "../src/desk-repo.ts";
import { removeTempDir } from "./remove-temp.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("the desk repo and folders inside it are refused, and a parent is not", () => {
  assert.equal(DESK_REPO_REFUSAL.includes("!"), false);
  assert.equal(DESK_REPO_REFUSAL.includes("\u2014"), false);
  assert.match(DESK_REPO_REFUSAL, /own source repo/);
  assert.match(DESK_REPO_REFUSAL, /Hitchhiker Sites/);
  assert.equal(isInsideDeskRepo(repo), true);
  assert.equal(isInsideDeskRepo(path.join(repo, "packages", "app")), true);
  assert.equal(isInsideDeskRepo(path.join(repo, "packages", "engine", "src")), true);
  const parent = path.dirname(repo);
  if (!deskRepoRoots().some((root) => root === parent)) {
    assert.equal(isInsideDeskRepo(parent), false);
  }
  const outside = mkdtempSync(path.join(tmpdir(), "hh-outside-242a-"));
  try {
    assert.equal(isInsideDeskRepo(outside), false);
    assert.equal(isInsideDeskRepo(path.join(outside, "site")), false);
  } finally {
    removeTempDir(outside);
  }
  const roots = deskRepoRoots();
  assert.equal(roots.some((root) => path.resolve(root) === path.resolve(repo)), true);
  for (const root of roots) assert.equal(isInsideDeskRepo(root), true);
});
