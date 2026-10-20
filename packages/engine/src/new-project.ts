/**
 * A site project, the same layout /hh-new creates: a folder, `.hitchhiker/`, and a home-index row.
 * The desk's own repo is refused before any directory is created.
 */
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DESK_REPO_REFUSAL, isInsideDeskRepo } from "./desk-repo.ts";
import { upsertHomeProject } from "./home-index.ts";

export function slugProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "new-site";
}

/** `~/Hitchhiker Sites/<slug>` unless the caller passes a different home. */
export function defaultProjectDir(name: string, home: string = os.homedir()): string {
  return path.join(home, "Hitchhiker Sites", slugProjectName(name));
}

export async function createSiteProject(input: {
  name: string;
  dir: string;
  homeDir?: string;
  now?: Date;
}): Promise<{ name: string; dir: string }> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("Name the project.");
  const dir = path.resolve(input.dir);
  if (isInsideDeskRepo(dir)) throw new Error(DESK_REPO_REFUSAL);
  await mkdir(path.join(dir, ".hitchhiker"), { recursive: true });
  const fromEnv = process.env.HH_PROJECT_HOME;
  const home =
    input.homeDir ??
    (typeof fromEnv === "string" && fromEnv.trim().length > 0 ? path.resolve(fromEnv) : os.homedir());
  await upsertHomeProject(
    { name, path: dir, updatedAt: (input.now ?? new Date()).toISOString() },
    home,
  );
  return { name, dir };
}
