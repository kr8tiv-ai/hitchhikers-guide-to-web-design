/**
 * Rebuild `.hitchhiker/` from a project file.
 * A newer live folder is kept unless the caller picks the file. Git is reported, never changed.
 * An unapproved gate is never written as a yes.
 */

import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp } from "../lock.ts";
import { loadState } from "../state.ts";
import { gitMismatch } from "./git-refs.ts";
import { loadProjectFile, type LoadResult } from "./load.ts";
import type { ApprovalStamp, ProjectFile, ProjectState } from "./schema.ts";

export type RestorePrefer = "file" | "live" | "newer";

export interface RestoreOptions {
  projectDir?: string | null;
  prefer?: RestorePrefer;
}

export interface RestoreResult {
  projectDir: string;
  file: ProjectFile | null;
  kept: "file" | "live" | "none";
  source: LoadResult["source"];
  readOnly: boolean;
  message: string | null;
  gitNote: string | null;
  promptId: string | null;
  questionId: string | null;
  lastDone: string;
}

const KEPT_LIVE = "The project folder is newer. Kept the folder. Nothing was overwritten.";

const YES_FILES: Record<string, "brief" | "elevate" | "hostinger"> = {
  "brief-yes.json": "brief",
  "elevate-yes.json": "elevate",
  "hostinger-yes.json": "hostinger",
};

function stampFor(file: ProjectFile, key: "brief" | "elevate" | "hostinger"): ApprovalStamp {
  if (key === "brief") return file.brief.approval;
  if (key === "elevate") return file.elevate;
  return file.hostinger;
}

function safeRelative(relative: string): boolean {
  if (relative.length === 0 || path.isAbsolute(relative)) return false;
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) return false;
  if (path.isAbsolute(normalized)) return false;
  return true;
}

function chooseDir(file: ProjectFile | null, requested: string | null): { dir: string; note: string | null } {
  if (requested !== null && requested.length > 0) {
    const resolved = path.resolve(requested);
    if (existsSync(resolved)) return { dir: resolved, note: null };
  }
  if (file !== null && file.sourceDir.length > 0 && existsSync(file.sourceDir)) {
    return { dir: file.sourceDir, note: null };
  }
  const cwd = process.cwd();
  const missing = requested !== null && requested.length > 0 ? path.resolve(requested) : file?.sourceDir ?? "";
  const note =
    missing.length > 0
      ? `The saved project folder is not on this machine. Restored into ${cwd}.`
      : null;
  return { dir: cwd, note };
}

function liveMillis(projectDir: string): number | null {
  const state = loadState(projectDir);
  if (state === null) return null;
  const parsed = Date.parse(state.updatedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function fileWins(file: ProjectFile, projectDir: string, prefer: RestorePrefer): boolean {
  if (prefer === "file") return true;
  if (prefer === "live") return liveMillis(projectDir) === null;
  const live = liveMillis(projectDir);
  if (live === null) return true;
  const saved = Date.parse(file.savedAt);
  if (!Number.isFinite(saved)) return false;
  return saved >= live;
}

function renderState(state: ProjectState): string {
  const blockers = state.blockers.map((item) => `- ${item}`).join("\n");
  return [
    "# Guide state",
    "",
    "## Phase",
    "",
    state.phase,
    "",
    "## Slice",
    "",
    state.slice,
    "",
    "## Prompt id",
    "",
    state.promptId,
    "",
    "## Last good commit",
    "",
    state.lastGoodCommit,
    "",
    "## Blockers",
    "",
    blockers,
    "",
    "## Next action",
    "",
    state.nextAction,
    "",
    "## Updated at",
    "",
    state.updatedAt,
    "",
  ].join("\n");
}

async function writeSnapshot(hitch: string, file: ProjectFile): Promise<void> {
  await mkdir(hitch, { recursive: true });
  const written = new Set<string>();
  for (const item of file.snapshot) {
    if (!safeRelative(item.path)) continue;
    const gate = YES_FILES[item.path];
    if (gate !== undefined && !stampFor(file, gate).approved) continue;
    await replaceViaTemp(path.join(hitch, item.path), item.text.endsWith("\n") ? item.text : `${item.text}\n`);
    written.add(item.path);
  }
  if (!written.has("STATE.md") && file.state !== null) {
    await replaceViaTemp(path.join(hitch, "STATE.md"), renderState(file.state));
  }
  for (const [name, key] of Object.entries(YES_FILES)) {
    const stamp = stampFor(file, key);
    const target = path.join(hitch, name);
    if (!stamp.approved) {
      await unlink(target).catch(() => undefined);
      continue;
    }
    if (written.has(name)) continue;
    const body = `${JSON.stringify({ approved: true, at: stamp.at })}\n`;
    await replaceViaTemp(target, body);
  }
}

function questionOf(file: ProjectFile | null, projectDir: string, kept: RestoreResult["kept"]): {
  promptId: string | null;
  questionId: string | null;
} {
  if (kept === "live") {
    const state = loadState(projectDir);
    const promptId = state?.promptId ?? null;
    const questionId = promptId !== null && promptId.startsWith("interview:") ? promptId.slice("interview:".length) : null;
    return { promptId, questionId };
  }
  if (file === null) return { promptId: null, questionId: null };
  const promptId = file.state?.promptId ?? (file.interview.currentQuestionId === null ? null : `interview:${file.interview.currentQuestionId}`);
  return { promptId, questionId: file.interview.currentQuestionId };
}

/**
 * Restore from a project file into a project folder.
 * `prefer` defaults to the newer of the file and the live folder. Equal times keep the file.
 */
export async function restoreProject(filePath: string, options: RestoreOptions = {}): Promise<RestoreResult> {
  const prefer = options.prefer ?? "newer";
  const requested = options.projectDir ?? null;
  const hinted = requested !== null && existsSync(path.resolve(requested)) ? path.resolve(requested) : null;
  const loaded = await loadProjectFile(filePath, { liveDir: hinted });
  const chosen = chooseDir(loaded.file, requested);
  const notes = [loaded.message, chosen.note].filter((item): item is string => item !== null && item.length > 0);
  if (loaded.readOnly || loaded.file === null) {
    const place = questionOf(loaded.file, chosen.dir, "none");
    return {
      projectDir: chosen.dir,
      file: loaded.file,
      kept: "none",
      source: loaded.source,
      readOnly: loaded.readOnly,
      message: notes.join(" ") || null,
      gitNote: loaded.file === null ? null : await gitMismatch(chosen.dir, loaded.file.git),
      promptId: place.promptId,
      questionId: place.questionId,
      lastDone: loaded.file?.queue.lastDone ?? "",
    };
  }
  const apply = fileWins(loaded.file, chosen.dir, prefer);
  if (!apply) {
    const place = questionOf(loaded.file, chosen.dir, "live");
    return {
      projectDir: chosen.dir,
      file: loaded.file,
      kept: "live",
      source: loaded.source,
      readOnly: false,
      message: [KEPT_LIVE, ...notes].join(" "),
      gitNote: await gitMismatch(chosen.dir, loaded.file.git),
      promptId: place.promptId,
      questionId: place.questionId,
      lastDone: loaded.file.queue.lastDone,
    };
  }
  await writeSnapshot(path.join(chosen.dir, ".hitchhiker"), loaded.file);
  const place = questionOf(loaded.file, chosen.dir, "file");
  return {
    projectDir: chosen.dir,
    file: loaded.file,
    kept: "file",
    source: loaded.source,
    readOnly: false,
    message: notes.join(" ") || null,
    gitNote: await gitMismatch(chosen.dir, loaded.file.git),
    promptId: place.promptId,
    questionId: place.questionId,
    lastDone: loaded.file.queue.lastDone,
  };
}
