/**
 * Guide thoughts about answers that already moved on.
 * Open notes block the build hand-off. Unchecked notes stay listed.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { escapeHtml } from "../card.ts";

export type GuideNoteStatus = "checking" | "open" | "kept" | "unchecked";

export interface GuideNote {
  questionId: string;
  ask: string;
  message: string;
  status: GuideNoteStatus;
}

const FILE = "guide-notes.json";

export function readGuideNotes(projectDir: string): GuideNote[] {
  const file = path.join(projectDir, ".hitchhiker", FILE);
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    const notes: GuideNote[] = [];
    for (const item of parsed) {
      if (!isNote(item)) continue;
      notes.push(item);
    }
    return notes;
  } catch {
    return [];
  }
}

export async function upsertGuideNote(projectDir: string, note: GuideNote): Promise<GuideNote[]> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const notes = readGuideNotes(projectDir).filter((item) => item.questionId !== note.questionId);
  if (note.status !== "checking") notes.push(note);
  else notes.push(note);
  await writeFile(path.join(dir, FILE), `${JSON.stringify(notes, null, 2)}\n`, "utf8");
  return notes;
}

export function blockingNotes(notes: readonly GuideNote[]): GuideNote[] {
  return notes.filter((note) => note.status === "open" || note.status === "checking");
}

export function renderGuideNotes(notes: readonly GuideNote[]): string {
  if (notes.length === 0) return `<div data-guide-notes></div>`;
  const items = notes
    .map((note) => {
      const busy = note.status === "checking" ? ` aria-busy="true"` : "";
      const actions =
        note.status === "open"
          ? `<button class="hh-btn hh-btn--secondary" type="button" data-revisit="${escapeHtml(note.questionId)}">Revisit</button><button class="hh-btn hh-btn--ghost" type="button" data-keep-answer="${escapeHtml(note.questionId)}">Keep my answer</button>`
          : note.status === "unchecked" || note.status === "checking"
            ? `<button class="hh-btn hh-btn--secondary" type="button" data-guide-retry="${escapeHtml(note.questionId)}">Retry</button><button class="hh-btn hh-btn--ghost" type="button" data-guide-skip="${escapeHtml(note.questionId)}">Skip check, keep my answer</button>`
            : "";
      return `<article class="hh-guide-note" data-guide-note="${escapeHtml(note.questionId)}" data-note-status="${note.status}"${busy}><p>The Guide has a thought about your answer to "${escapeHtml(note.ask)}"</p><p>${escapeHtml(note.message)}</p>${actions}</article>`;
    })
    .join("");
  return `<div data-guide-notes aria-live="polite">${items}</div>`;
}

function isNote(value: unknown): value is GuideNote {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const note = value as { questionId?: unknown; ask?: unknown; message?: unknown; status?: unknown };
  return (
    typeof note.questionId === "string" &&
    typeof note.ask === "string" &&
    typeof note.message === "string" &&
    (note.status === "checking" || note.status === "open" || note.status === "kept" || note.status === "unchecked")
  );
}
