/**
 * `hh save` and `hh resume <project>`.
 * `hh resume --project <dir>` stays on the legacy path in main.ts.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  findRecent,
  loadProjectFile,
  nextPromptId,
  projectHome,
  readRecentProjects,
  restoreProject,
  saveProjectFile,
  type RestorePrefer,
} from "@hitchhiker/engine";

const SAVE_USAGE = "Usage: hh save [--project <dir>] [--to <path>]";
const RESUME_USAGE = "Usage: hh resume <project> [--project <dir>] [--prefer file|live|newer]";

function fail(message: string): { exitCode: number; stdout: string } {
  return { exitCode: 1, stdout: `${message}\n` };
}

function isPrefer(value: string): value is RestorePrefer {
  return value === "file" || value === "live" || value === "newer";
}

export function isPortableResume(argv: readonly string[]): boolean {
  if (argv[0] !== "resume") return false;
  const valued = new Set(["--project", "--prefer", "--to", "--message"]);
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (valued.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return true;
  }
  return false;
}

function oneProjectFile(directory: string): { file: string } | { error: string } {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return { error: `Could not read ${directory}.` };
  }
  const files = names.filter((name) => name.toLowerCase().endsWith(".hhproject") && !name.toLowerCase().endsWith(".hhproject.bak"));
  if (files.length === 1) {
    const only = files[0];
    if (only === undefined) return { error: `No project file in ${directory}.` };
    return { file: path.join(directory, only) };
  }
  if (files.length === 0) return { error: `No project file in ${directory}.` };
  return { error: `More than one project file in ${directory}: ${files.join(", ")}. Pass one path.` };
}

async function resolveProject(query: string): Promise<{ file: string } | { error: string }> {
  const resolved = path.resolve(query);
  if (existsSync(resolved)) {
    const lower = resolved.toLowerCase();
    if (lower.endsWith(".hhproject")) return { file: resolved };
    try {
      if (readdirSync(resolved).length >= 0) {
        const stat = oneProjectFile(resolved);
        return stat;
      }
    } catch {
      return { file: resolved };
    }
  }
  const rows = await readRecentProjects(projectHome());
  const found = findRecent(rows, query);
  if (found === "many") {
    return { error: "More than one saved project uses that name. Pass the project file path." };
  }
  if (found !== null) return { file: found.filePath };
  return { error: `No saved project matches ${query}.` };
}

export async function runSave(argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> {
  let project = process.cwd();
  let to: string | null = null;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project" || arg === "--to") {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return fail(`Missing ${arg}. ${SAVE_USAGE}`);
      }
      if (arg === "--project") project = value;
      else to = value;
      index += 1;
      continue;
    }
    return fail(`Unexpected argument. ${SAVE_USAGE}`);
  }
  try {
    const saved = await saveProjectFile(path.resolve(project), { to });
    const lines = [`Wrote ${saved.filePath}`];
    if (saved.note !== null) lines.push(saved.note);
    lines.push(`Restart at prompt ${nextPromptId(saved.lastDone)}.`);
    return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The project file did not save.";
    return fail(message);
  }
}

export async function runResumeFile(argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> {
  let query: string | undefined;
  let project: string | null = null;
  let prefer: RestorePrefer = "newer";
  const valued = new Set(["--project", "--prefer"]);
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (valued.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return fail(`Missing ${arg}. ${RESUME_USAGE}`);
      }
      if (arg === "--project") project = value;
      else if (!isPrefer(value)) return fail(`--prefer must be file, live, or newer. ${RESUME_USAGE}`);
      else prefer = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) return fail(`Unexpected argument. ${RESUME_USAGE}`);
    if (query !== undefined) return fail(`Unexpected argument. ${RESUME_USAGE}`);
    query = arg;
  }
  if (query === undefined) return fail(`Missing project. ${RESUME_USAGE}`);
  const target = await resolveProject(query);
  if ("error" in target) return fail(target.error);
  try {
    const restored = await restoreProject(target.file, {
      ...(project === null ? {} : { projectDir: project }),
      prefer,
    });
    if (restored.file === null && restored.kept === "none") {
      return fail(restored.message ?? "The project file could not be read.");
    }
    const lines: string[] = [];
    if (restored.message !== null && restored.message.length > 0) lines.push(restored.message);
    if (restored.gitNote !== null) lines.push(restored.gitNote);
    if (restored.readOnly) lines.push("Opened read-only. The project file was not rewritten.");
    const step =
      restored.questionId !== null && restored.questionId !== "done"
        ? `Restored question ${restored.questionId}.`
        : restored.promptId !== null
          ? `Restored prompt ${restored.promptId}.`
          : "Restored the project.";
    lines.push(step);
    lines.push(`Restart at prompt ${nextPromptId(restored.lastDone)}.`);
    lines.push(`Project folder: ${restored.projectDir}`);
    if (restored.kept === "live") lines.push("resume: kept the project folder");
    return { exitCode: restored.readOnly ? 0 : 0, stdout: `${lines.join("\n")}\n` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The project could not be resumed.";
    return fail(message);
  }
}

export async function restartLine(filePath: string): Promise<string> {
  const loaded = await loadProjectFile(filePath);
  const last = loaded.file?.queue.lastDone ?? "";
  return `Restart at prompt ${nextPromptId(last)}.`;
}
