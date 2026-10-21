/**
 * A site project, the same layout /hh-new creates: a folder, `.hitchhiker/`, and a home-index row.
 * The desk's own repo is refused before any directory is created.
 */
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DESK_REPO_REFUSAL, isInsideDeskRepo } from "./desk-repo.ts";
import { upsertHomeProject } from "./home-index.ts";
import { projectHome, readRecentProjects, upsertRecentProject } from "./project-file/locate.ts";
import { saveProjectFile } from "./project-file/save.ts";

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
  await writeFile(
    path.join(dir, ".hitchhiker", "project.json"),
    `${JSON.stringify({ name }, null, 2)}\n`,
    "utf8",
  );
  const saveHome = projectHome(dir);
  await saveProjectFile(dir, {
    projectName: name,
    homeDir: saveHome,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const fromEnv = process.env.HH_PROJECT_HOME;
  const home =
    input.homeDir ??
    (typeof fromEnv === "string" && fromEnv.trim().length > 0 ? path.resolve(fromEnv) : os.homedir());
  await upsertHomeProject(
    { name, path: dir, updatedAt: (input.now ?? new Date()).toISOString() },
    home,
  );
  if (path.resolve(home) !== path.resolve(saveHome)) {
    const rows = await readRecentProjects(saveHome);
    const row = rows.find((item) => item.sourceDir === dir);
    if (row !== undefined) await upsertRecentProject(row, home);
  }
  return { name, dir };
}
