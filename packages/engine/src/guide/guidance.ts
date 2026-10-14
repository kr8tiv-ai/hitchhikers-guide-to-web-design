/**
 * Model-only lines from interview/tree.yaml.
 * They go to the Guide prompt. They do not go on the card, in the transcript, or in the brief.
 */
import path from "node:path";
import { loadTree, type Question } from "../tree.ts";

/** Phrases that mean the sentence is an instruction to the model. */
export const GUIDANCE_MARKERS = [
  "not a forced value",
  "recommended word",
  "do not promise",
  "stop at the cap",
  "the model should",
  "show the model",
  "do not invent",
  "not in this question",
  "on every line",
  "prices live on the cost meter",
  "does not lecture",
] as const;

/** Kept in lockstep with INTERNAL_LINES in the app question splitter. */
export const INTERNAL_LINES = [
  "Do not promise 12 clips of 10 seconds at 1080p inside a $15 cap. That video alone is $30.00.",
] as const;

export function guidanceMarkerHits(text: string): string[] {
  const lower = text.toLowerCase();
  return GUIDANCE_MARKERS.filter((marker) => lower.includes(marker));
}

/** A sentence aimed at the model, not at the person at the desk. */
export function isModelInstruction(text: string): boolean {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return false;
  if (guidanceMarkerHits(flat).length > 0) return true;
  const lower = flat.toLowerCase();
  return INTERNAL_LINES.some((line) => lower.includes(line.toLowerCase()));
}

function cutMarked(text: string, lines: readonly string[]): string {
  let next = text;
  for (const line of lines) {
    const needle = line.toLowerCase();
    if (needle === "") continue;
    let from = 0;
    let built = "";
    const lower = next.toLowerCase();
    while (from < next.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) {
        built += next.slice(from);
        break;
      }
      built += next.slice(from, at);
      from = at + needle.length;
    }
    next = built;
  }
  return next;
}

function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function sentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return [];
  return flat
    .split(/(?<=[.?!])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** Drops a helper line that repeats guidance, or that carries a guidance marker. */
export function dropInternalCopy(text: string, guidance: readonly string[]): string {
  const flat = cutMarked(text, INTERNAL_LINES).replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  const guides = guidance.map((line) => line.trim()).filter((line) => line !== "");
  const wholes = new Set(guides.map(norm));
  const guideSentences = new Set(guides.flatMap((line) => sentences(line).map(norm)));
  if (wholes.has(norm(flat))) return "";
  const kept = sentences(flat).filter((sentence) => {
    const key = norm(sentence);
    if (key === "") return false;
    if (wholes.has(key) || guideSentences.has(key)) return false;
    return !isModelInstruction(sentence);
  });
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function guidanceCorpus(questions: readonly Pick<Question, "guidance">[]): string[] {
  const lines: string[] = [];
  for (const question of questions) {
    const line = question.guidance?.trim() ?? "";
    if (line !== "") lines.push(line);
  }
  return lines;
}

let cachedLines: string[] | null = null;

/** Guidance lines from the repo tree. Empty when the file cannot be read. */
export function repoGuidanceLines(): string[] {
  if (cachedLines !== null) return cachedLines;
  try {
    const file = path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
    cachedLines = guidanceCorpus(loadTree(file));
  } catch {
    cachedLines = [];
  }
  return cachedLines;
}
