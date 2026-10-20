/**
 * BUG-046. New project creates the /hh-new layout outside the desk repo.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DESK_REPO_REFUSAL } from "../src/desk-repo.ts";
import { homeIndexPath } from "../src/home-index.ts";
import { createSiteProject, defaultProjectDir, slugProjectName } from "../src/new-project.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("a new site project is a folder, .hitchhiker, and a home row, never the desk repo", async () => {
  assert.equal(slugProjectName("  Visit Book!! "), "visit-book");
  assert.equal(slugProjectName("..."), "new-site");
  const home = mkdtempSync(path.join(tmpdir(), "hh-new-home-242a-"));
  const root = mkdtempSync(path.join(tmpdir(), "hh-new-root-242a-"));
  const nested = path.join(repo, "packages", "app", "hh-not-a-site-242a");
  try {
    await assert.rejects(() => createSiteProject({ name: "   ", dir: path.join(root, "empty"), homeDir: home }), /Name the project/);
    await assert.rejects(
      () => createSiteProject({ name: "Desk", dir: path.join(repo, "packages", "app"), homeDir: home }),
      new RegExp(DESK_REPO_REFUSAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.equal(existsSync(nested), false);
    const dir = defaultProjectDir("Visit Book", root);
    const created = await createSiteProject({ name: " Visit Book ", dir, homeDir: home, now: new Date("2026-10-20T12:00:00.000Z") });
    assert.equal(created.name, "Visit Book");
    assert.equal(created.dir, path.resolve(dir));
    assert.equal(existsSync(path.join(created.dir, ".hitchhiker")), true);
    const index = JSON.parse(readFileSync(homeIndexPath(home), "utf8")) as Array<{ name: string; path: string }>;
    assert.equal(index.some((row) => row.name === "Visit Book" && row.path === created.dir), true);
    assert.equal(isInside(created.dir, repo), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(nested, { recursive: true, force: true });
  }
});

function isInside(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
