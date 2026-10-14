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

export function guidanceMarkerHits(text: string): string[] {
  const lower = text.toLowerCase();
  return GUIDANCE_MARKERS.filter((marker) => lower.includes(marker));
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
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  const guides = guidance.map((line) => line.trim()).filter((line) => line !== "");
  const wholes = new Set(guides.map(norm));
  const guideSentences = new Set(guides.flatMap((line) => sentences(line).map(norm)));
  if (wholes.has(norm(flat))) return "";
  const kept = sentences(flat).filter((sentence) => {
    const key = norm(sentence);
    if (key === "") return false;
    if (wholes.has(key) || guideSentences.has(key)) return false;
    return guidanceMarkerHits(sentence).length === 0;
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
