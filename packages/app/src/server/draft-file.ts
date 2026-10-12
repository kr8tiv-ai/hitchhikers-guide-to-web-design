/**
 * A copy of the unsent answer in the project folder, so a new browser
 * or a restarted desk can bring the same words back.
 * The file holds the question id, the text, and a timestamp. Not the path.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "@hitchhiker/engine";
import type { CardChoiceSet } from "../card.ts";
import { attachQuestionId } from "../client/attach.ts";

export const DRAFT_TEXT_CAP = 20_000;
const PUSH_CAP = 4_000;
const CHOICE_CAP = 2_000;
const MAX_ENTRIES = 40;
const PROJECT_CHAR_CAP = 100_000;
const QUESTION_ID = /^[A-Za-z0-9._-]{1,64}$/;

export interface StoredDraft {
  text: string;
  savedAt: string;
  step: number;
}

export interface SavedFile {
  path: string;
  originalName: string;
  size: number;
  type: string;
}

interface ShownDraft {
  forId: string;
  pushback: string | null;
  choices: CardChoiceSet | null;
}

interface DraftFile {
  version: 1;
  entries: Record<string, StoredDraft>;
  shown: ShownDraft | null;
  clearedAt: string | null;
}

export interface DraftPost {
  questionId: string;
  text?: string;
  step: number;
  /** Client clock. An older write must not replace a newer one. */
  savedAt?: string;
  pushback?: string | null;
  choices?: CardChoiceSet | null;
  touchShown: boolean;
}

export function projectKeyFor(projectDir: string): string {
  return createHash("sha256").update(path.resolve(projectDir)).digest("hex").slice(0, 32);
}

export function readDraftFileSync(projectDir: string): DraftFile {
  const file = draftPath(projectDir);
  if (!existsSync(file)) return emptyFile();
  try {
    return normalizeFile(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return emptyFile();
  }
}

export function currentDraft(projectDir: string, questionId: string | null): StoredDraft | null {
  if (questionId === null || !QUESTION_ID.test(questionId)) return null;
  return readDraftFileSync(projectDir).entries[questionId] ?? null;
}

export function shownFor(projectDir: string, questionId: string | null): ShownDraft | null {
  if (questionId === null) return null;
  const shown = readDraftFileSync(projectDir).shown;
  if (shown === null || shown.forId !== questionId) return null;
  return shown;
}

export function draftsClearedAt(projectDir: string): string | null {
  return readDraftFileSync(projectDir).clearedAt;
}

export async function writeDraftPost(projectDir: string, post: DraftPost): Promise<void> {
  await withStateLock(projectDir, async () => {
    const current = readDraftFileSync(projectDir);
    const next = applyPost(current, post);
    await replaceViaTemp(draftPath(projectDir), `${JSON.stringify(next, null, 2)}\n`);
  });
}

export async function clearQuestionDraft(projectDir: string, questionId: string): Promise<void> {
  if (!QUESTION_ID.test(questionId)) return;
  await withStateLock(projectDir, async () => {
    const current = readDraftFileSync(projectDir);
    delete current.entries[questionId];
    if (current.shown?.forId === questionId) current.shown = null;
    await replaceViaTemp(draftPath(projectDir), `${JSON.stringify(current, null, 2)}\n`);
  });
}

export async function clearAllDrafts(projectDir: string, clearedAt: string): Promise<void> {
  await withStateLock(projectDir, async () => {
    const next: DraftFile = { version: 1, entries: {}, shown: null, clearedAt };
    await replaceViaTemp(draftPath(projectDir), `${JSON.stringify(next, null, 2)}\n`);
  });
}

export function parseDraftPost(raw: string): DraftPost | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "The desk could not read that draft." };
  }
  if (!isPlain(value)) return { error: "The desk could not read that draft." };
  if (typeof value.questionId !== "string" || !QUESTION_ID.test(value.questionId)) {
    return { error: "The question id is not valid." };
  }
  if (value.text !== undefined && typeof value.text !== "string") {
    return { error: "The desk could not read that draft." };
  }
  if (typeof value.text === "string" && value.text.length > 100_000) {
    return { error: "That draft is too long." };
  }
  const step = value.step === undefined ? 0 : value.step;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > 10_000) {
    return { error: "The desk could not read that draft." };
  }
  let savedAt: string | undefined;
  if (value.savedAt !== undefined) {
    if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) {
      return { error: "The desk could not read that draft." };
    }
    savedAt = value.savedAt;
  }
  const post: DraftPost = { questionId: value.questionId, step, touchShown: false };
  if (savedAt !== undefined) post.savedAt = savedAt;
  if (typeof value.text === "string") post.text = value.text.slice(0, DRAFT_TEXT_CAP);
  if ("pushback" in value) {
    post.touchShown = true;
    if (value.pushback === null) post.pushback = null;
    else if (typeof value.pushback === "string") post.pushback = value.pushback.slice(0, PUSH_CAP);
    else return { error: "The desk could not read that draft." };
  }
  if ("choices" in value) {
    post.touchShown = true;
    if (value.choices === null) post.choices = null;
    else {
      const choices = parseChoices(value.choices, value.questionId);
      post.choices = choices;
    }
  }
  return post;
}

/** Files already stored for this question. Paths stay relative to the project. */
export function readSavedFiles(projectDir: string, questionId: string | null): SavedFile[] {
  if (questionId === null || !attachQuestionId(questionId)) return [];
  const root = path.resolve(projectDir, ".hitchhiker", "uploads");
  const folder = path.resolve(root, questionId);
  const rel = path.relative(root, folder);
  if (rel !== questionId || rel.startsWith("..") || path.isAbsolute(rel)) return [];
  const manifest = path.join(folder, "manifest.json");
  if (!existsSync(manifest)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifest, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const files: SavedFile[] = [];
  for (const item of parsed) {
    if (files.length >= 8 || !isPlain(item)) continue;
    if (typeof item.path !== "string" || typeof item.originalName !== "string") continue;
    if (typeof item.size !== "number" || !Number.isFinite(item.size) || item.size < 0) continue;
    if (typeof item.type !== "string" || typeof item.storedName !== "string") continue;
    const relPath = item.path.replaceAll("\\", "/");
    const prefix = `.hitchhiker/uploads/${questionId}/`;
    if (!relPath.startsWith(prefix) || relPath.includes("..")) continue;
    const stored = relPath.slice(prefix.length);
    if (stored !== item.storedName || stored.includes("/") || stored.includes("..")) continue;
    const abs = path.resolve(folder, stored);
    const inside = path.relative(folder, abs);
    if (inside !== stored || inside.startsWith("..") || path.isAbsolute(inside)) continue;
    if (!isPlainFile(abs)) continue;
    files.push({
      path: relPath,
      originalName: item.originalName.slice(0, 120),
      size: item.size,
      type: item.type.slice(0, 120),
    });
  }
  return files;
}

function draftPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "drafts.json");
}

function emptyFile(): DraftFile {
  return { version: 1, entries: {}, shown: null, clearedAt: null };
}

function applyPost(current: DraftFile, post: DraftPost): DraftFile {
  const next: DraftFile = {
    version: 1,
    entries: { ...current.entries },
    shown: current.shown,
    clearedAt: current.clearedAt,
  };
  if (post.text !== undefined) {
    const incoming = post.savedAt ?? new Date().toISOString();
    const existing = next.entries[post.questionId];
    const existingAt = existing === undefined ? Number.NaN : Date.parse(existing.savedAt);
    const incomingAt = Date.parse(incoming);
    const older = existing !== undefined && !Number.isNaN(existingAt) && !Number.isNaN(incomingAt) && incomingAt < existingAt;
    if (!older) {
      if (post.text.trim() === "") delete next.entries[post.questionId];
      else {
        next.entries[post.questionId] = {
          text: post.text,
          savedAt: incoming,
          step: post.step,
        };
      }
    }
  }
  if (post.touchShown) {
    const prev = next.shown?.forId === post.questionId ? next.shown : null;
    const pushback = post.pushback !== undefined ? post.pushback : (prev?.pushback ?? null);
    const choices = post.choices !== undefined ? post.choices : (prev?.choices ?? null);
    const quote = pushback === null || pushback.trim() === "" ? null : pushback;
    if (quote === null && choices === null) {
      if (next.shown?.forId === post.questionId) next.shown = null;
    } else {
      next.shown = { forId: post.questionId, pushback: quote, choices };
    }
  }
  return capFile(next, post.questionId);
}

function capFile(file: DraftFile, keepId: string): DraftFile {
  const rows = Object.entries(file.entries).sort((a, b) => a[1].savedAt.localeCompare(b[1].savedAt));
  let total = 0;
  for (const [, entry] of rows) total += entry.text.length;
  const drop = new Set<string>();
  for (const [id, entry] of rows) {
    const overCount = rows.length - drop.size > MAX_ENTRIES;
    const overChars = total > PROJECT_CHAR_CAP;
    if (!overCount && !overChars) break;
    if (id === keepId) continue;
    drop.add(id);
    total -= entry.text.length;
  }
  if (drop.size === 0) return file;
  const entries: DraftFile["entries"] = {};
  for (const [id, entry] of Object.entries(file.entries)) {
    if (!drop.has(id)) entries[id] = entry;
  }
  return { ...file, entries };
}

function normalizeFile(value: unknown): DraftFile {
  if (!isPlain(value)) return emptyFile();
  const entries: DraftFile["entries"] = {};
  if (isPlain(value.entries)) {
    for (const [id, entry] of Object.entries(value.entries)) {
      if (!QUESTION_ID.test(id)) continue;
      const stored = asStored(entry);
      if (stored !== null) entries[id] = stored;
    }
  }
  return {
    version: 1,
    entries,
    shown: asShown(value.shown),
    clearedAt: typeof value.clearedAt === "string" ? value.clearedAt : null,
  };
}

function asStored(value: unknown): StoredDraft | null {
  if (!isPlain(value)) return null;
  if (typeof value.text !== "string" || value.text.trim() === "") return null;
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
  if (typeof value.step !== "number" || !Number.isFinite(value.step)) return null;
  return { text: value.text.slice(0, DRAFT_TEXT_CAP), savedAt: value.savedAt, step: value.step };
}

function asShown(value: unknown): ShownDraft | null {
  if (!isPlain(value) || typeof value.forId !== "string" || !QUESTION_ID.test(value.forId)) return null;
  const pushback = typeof value.pushback === "string" && value.pushback.trim() !== "" ? value.pushback.slice(0, PUSH_CAP) : null;
  const choices = parseChoices(value.choices, value.forId);
  if (pushback === null && choices === null) return null;
  return { forId: value.forId, pushback, choices };
}

function parseChoices(value: unknown, questionId: string): CardChoiceSet | null {
  if (!isPlain(value)) return null;
  if (value.origin !== "model" && value.origin !== "fallback") return null;
  if (value.forId !== questionId) return null;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 4) return null;
  const ids = ["A", "B", "C", "D"] as const;
  const items: CardChoiceSet["items"] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item = value.items[index];
    const id = ids[index];
    if (!isPlain(item) || id === undefined || item.id !== id) return null;
    if (typeof item.label !== "string" || item.label.trim() === "") return null;
    if (typeof item.why !== "string" || typeof item.source !== "string") return null;
    items.push({
      id,
      label: item.label.slice(0, CHOICE_CAP),
      why: item.why.slice(0, CHOICE_CAP),
      source: item.source.slice(0, CHOICE_CAP),
    });
  }
  return { forId: questionId, origin: value.origin, items };
}

function isPlainFile(abs: string): boolean {
  try {
    const stat = lstatSync(abs);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
