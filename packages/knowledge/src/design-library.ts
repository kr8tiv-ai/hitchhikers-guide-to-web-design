/**
 * Design library selection. Entries are inspiration and vocabulary.
 * The same input returns the same entries. No model call and no vector store.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BANNED_PHRASES, BANNED_WORDS, FAMILY_STYLE, FAMILIES, packagedPath } from "@hitchhiker/engine";

const STYLE_WORLDS = [...new Set(Object.values(FAMILY_STYLE))];

export const MOODS = [
  "calm",
  "warm",
  "editorial",
  "bold",
  "dark",
  "playful",
  "luxurious",
  "technical",
  "organic",
  "cinematic",
  "minimal",
  "maximal",
] as const;

export const SECTION_TYPES = [
  "hero",
  "story",
  "gallery",
  "cards",
  "testimonial-free proof",
  "pricing",
  "contact",
  "footer",
  "transition",
] as const;

export const LIBRARY_IDS = [
  "gsap",
  "scrolltrigger",
  "splittext",
  "lenis",
  "motion",
  "three",
  "r3f",
  "ogl",
  "glsl",
  "css-scroll",
  "view-transitions",
  "howler",
  "web-audio",
  "vanilla",
] as const;

export const ENTRY_KINDS = ["site", "technique", "pattern"] as const;
export const ENTRY_SOURCES = [
  "aura",
  "godly",
  "awwwards",
  "land-book",
  "lapa",
  "fwa",
  "codrops",
  "gsap-showcase",
  "three-showcase",
  "official-docs",
  "original-note",
  "direct",
] as const;

export const CODE_LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
] as const;

export const LINK_LICENSES = ["none-stated", "link-only"] as const;
export const SNIPPET_LINE_CAP = 80;
export const DEFAULT_BYTE_BUDGET = 12_000;
export const DEFAULT_PICK = 4;

export const REMIX_LINE = "Take the thinking, not the skin.";
export const REMIX_DETAIL =
  "These are inspiration for the language of what is possible. Remix, improve and add your own idea; do not reproduce an entry.";

const BAN_PHRASES = ["never use", "do not use", "no effect", "only the libraries"];

export interface DesignEntry {
  id: string;
  kind: (typeof ENTRY_KINDS)[number];
  title: string;
  url: string;
  source: (typeof ENTRY_SOURCES)[number];
  sourcePage: string;
  styleWorld: string;
  family: string;
  moods: string[];
  sectionTypes: string[];
  techniques: string[];
  libraries: string[];
  promptLanguage: string;
  notes: string;
  perfCost: "low" | "medium" | "high";
  reducedMotion: string;
  sourceUrl: string;
  license: string;
  creditLine: string;
  licenseTextPath?: string;
  ingestMode: "code" | "feed" | "link-only";
  snippets: string[];
  shots: string[];
  checked: string;
  verified: "auto" | "human";
  retired: boolean;
}

export interface DesignIndex {
  built: string;
  entries: string[];
  by: {
    styleWorld: Record<string, string[]>;
    moods: Record<string, string[]>;
    sectionTypes: Record<string, string[]>;
    techniques: Record<string, string[]>;
    libraries: Record<string, string[]>;
  };
}

export interface SelectInput {
  artDirection: string;
  sectionType: string;
  styleWorld: string;
  moods: readonly string[];
  motionScore: number;
  budget3d: number;
  stack: readonly string[];
}

export interface SelectOptions {
  index?: DesignIndex | null;
  byteBudget?: number;
  limit?: number;
}

export function libraryRoot(): string {
  return path.join(packagedPath(["knowledge"], "packs"), "design-library");
}

export function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

export function buildDesignIndex(entries: readonly DesignEntry[], built: string): DesignIndex {
  const by = {
    styleWorld: {} as Record<string, string[]>,
    moods: {} as Record<string, string[]>,
    sectionTypes: {} as Record<string, string[]>,
    techniques: {} as Record<string, string[]>,
    libraries: {} as Record<string, string[]>,
  };
  const ids = entries.map((entry) => entry.id).sort();
  for (const entry of entries) {
    pushTag(by.styleWorld, entry.styleWorld, entry.id);
    for (const mood of entry.moods) pushTag(by.moods, mood, entry.id);
    for (const section of entry.sectionTypes) pushTag(by.sectionTypes, section, entry.id);
    for (const technique of entry.techniques) pushTag(by.techniques, technique, entry.id);
    for (const library of entry.libraries) pushTag(by.libraries, library, entry.id);
  }
  const sorted = {
    styleWorld: sortTags(by.styleWorld),
    moods: sortTags(by.moods),
    sectionTypes: sortTags(by.sectionTypes),
    techniques: sortTags(by.techniques),
    libraries: sortTags(by.libraries),
  };
  return { built, entries: ids, by: sorted };
}

function sortTags(table: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const key of Object.keys(table).sort()) {
    next[key] = [...(table[key] ?? [])].sort();
  }
  return next;
}

export function loadDesignEntries(dir: string): DesignEntry[] {
  const folder = path.join(dir, "entries");
  let names: string[] = [];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  return names.map((name) => JSON.parse(readFileSync(path.join(folder, name), "utf8")) as DesignEntry);
}

export function loadDesignIndex(dir: string): DesignIndex | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as DesignIndex;
  } catch {
    return null;
  }
}

export function selectDesignEntries(
  input: SelectInput,
  entries: readonly DesignEntry[],
  options: SelectOptions = {},
): DesignEntry[] {
  const limit = options.limit ?? DEFAULT_PICK;
  const byteBudget = options.byteBudget ?? DEFAULT_BYTE_BUDGET;
  const pool = candidates(entries, input, options.index ?? null);
  const ranked = [...pool].sort((a, b) => compareScore(input, a, b));
  const chosen: DesignEntry[] = [];
  const worlds = new Map<string, number>();
  const sources = new Map<string, number>();
  const techniques = new Map<string, number>();
  let bytes = 0;
  while (chosen.length < limit) {
    let best: { entry: DesignEntry; score: number } | null = null;
    for (const entry of ranked) {
      if (chosen.some((item) => item.id === entry.id)) continue;
      let score = baseScore(input, entry);
      score -= (worlds.get(entry.styleWorld) ?? 0) * 12;
      score -= (sources.get(entry.source) ?? 0) * 4;
      for (const technique of entry.techniques) score -= (techniques.get(technique) ?? 0) * 3;
      if (best === null || score > best.score || (score === best.score && entry.id < best.entry.id)) {
        best = { entry, score };
      }
    }
    if (best === null) break;
    const size = Buffer.byteLength(`${best.entry.promptLanguage}\n${best.entry.notes}`, "utf8");
    if (chosen.length > 0 && bytes + size > byteBudget) break;
    bytes += size;
    chosen.push(best.entry);
    worlds.set(best.entry.styleWorld, (worlds.get(best.entry.styleWorld) ?? 0) + 1);
    sources.set(best.entry.source, (sources.get(best.entry.source) ?? 0) + 1);
    for (const technique of best.entry.techniques) {
      techniques.set(technique, (techniques.get(technique) ?? 0) + 1);
    }
  }
  return chosen;
}

export function formatSelection(entries: readonly DesignEntry[]): string {
  const lines = [REMIX_LINE, REMIX_DETAIL];
  for (const entry of entries.slice(0, DEFAULT_PICK)) {
    lines.push(`- ${entry.title}: ${entry.promptLanguage}`);
    lines.push(`Technique: ${entry.notes}`);
  }
  return lines.join("\n");
}

export function selectionHasBan(text: string): boolean {
  const lower = text.toLowerCase();
  return BAN_PHRASES.some((phrase) => lower.includes(phrase));
}

export function quotaAllows(
  entries: readonly DesignEntry[],
  styleWorld: string,
  floor = 8,
  maxShare = 0.34,
): boolean {
  const active = entries.filter((entry) => !entry.retired);
  if (active.length < floor) return true;
  const count = active.filter((entry) => entry.styleWorld === styleWorld).length;
  return (count + 1) / (active.length + 1) <= maxShare;
}

export function nearDuplicate(left: DesignEntry, right: DesignEntry): boolean {
  if (canonicalUrl(left.sourceUrl) === canonicalUrl(right.sourceUrl)) return true;
  if (left.styleWorld !== right.styleWorld) return false;
  const a = new Set(left.techniques);
  const b = new Set(right.techniques);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const technique of a) if (b.has(technique)) shared += 1;
  const union = new Set([...a, ...b]).size;
  return union > 0 && shared / union >= 0.8;
}

export interface ValidateContext {
  techniqueNames?: ReadonlySet<string>;
  snippetText?: (relativePath: string) => string;
  licenseText?: (relativePath: string) => string;
  seenUrls?: Set<string>;
}

export function validateDesignEntry(entry: DesignEntry, context: ValidateContext = {}): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9-]+$/.test(entry.id)) problems.push(`${entry.id}: id must be a slug`);
  if (!ENTRY_KINDS.includes(entry.kind)) problems.push(`${entry.id}: kind`);
  if (entry.title.trim() === "") problems.push(`${entry.id}: title`);
  if (entry.url.trim() === "" || entry.sourceUrl.trim() === "") problems.push(`${entry.id}: source URL`);
  if (!ENTRY_SOURCES.includes(entry.source)) problems.push(`${entry.id}: source`);
  if (entry.sourcePage.trim() === "") problems.push(`${entry.id}: sourcePage`);
  if (!(STYLE_WORLDS as readonly string[]).includes(entry.styleWorld)) problems.push(`${entry.id}: styleWorld`);
  if (!(FAMILIES as readonly string[]).includes(entry.family)) problems.push(`${entry.id}: family`);
  else if (FAMILY_STYLE[entry.family as (typeof FAMILIES)[number]] !== entry.styleWorld) {
    problems.push(`${entry.id}: styleWorld does not match family`);
  }
  if (entry.moods.length < 2 || entry.moods.length > 6) problems.push(`${entry.id}: moods`);
  for (const mood of entry.moods) {
    if (!(MOODS as readonly string[]).includes(mood)) problems.push(`${entry.id}: mood ${mood}`);
  }
  if (entry.sectionTypes.length === 0) problems.push(`${entry.id}: sectionTypes`);
  for (const section of entry.sectionTypes) {
    if (!(SECTION_TYPES as readonly string[]).includes(section)) problems.push(`${entry.id}: section ${section}`);
  }
  if (entry.techniques.length === 0) problems.push(`${entry.id}: techniques`);
  for (const technique of entry.techniques) {
    if (context.techniqueNames !== undefined && !context.techniqueNames.has(technique)) {
      problems.push(`${entry.id}: missing technique ${technique}`);
    }
  }
  for (const library of entry.libraries) {
    if (!(LIBRARY_IDS as readonly string[]).includes(library)) problems.push(`${entry.id}: library ${library}`);
  }
  problems.push(...proseProblems(entry.id, "promptLanguage", entry.promptLanguage, 3));
  problems.push(...proseProblems(entry.id, "notes", entry.notes, 2));
  if (!["low", "medium", "high"].includes(entry.perfCost)) problems.push(`${entry.id}: perfCost`);
  if (sentenceCount(entry.reducedMotion) !== 1) problems.push(`${entry.id}: reducedMotion`);
  if (entry.creditLine.trim() === "") problems.push(`${entry.id}: credit line`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.checked)) problems.push(`${entry.id}: checked`);
  if (entry.verified !== "auto" && entry.verified !== "human") problems.push(`${entry.id}: verified`);
  if (typeof entry.retired !== "boolean") problems.push(`${entry.id}: retired`);
  if (entry.ingestMode === "code") {
    if (!(CODE_LICENSES as readonly string[]).includes(entry.license)) problems.push(`${entry.id}: code license`);
    if (entry.licenseTextPath === undefined || entry.licenseTextPath.trim() === "") {
      problems.push(`${entry.id}: license text`);
    } else if (context.licenseText !== undefined) {
      const text = context.licenseText(entry.licenseTextPath);
      if (text.trim() === "") problems.push(`${entry.id}: license text`);
      if (isCopyleft(text) || isCopyleft(entry.license)) problems.push(`${entry.id}: copyleft license stored`);
    }
    if (entry.snippets.length === 0) problems.push(`${entry.id}: snippet`);
  } else {
    if (!(LINK_LICENSES as readonly string[]).includes(entry.license)) problems.push(`${entry.id}: link license`);
    if (entry.snippets.length > 0) problems.push(`${entry.id}: link-only stores no code`);
    if (entry.licenseTextPath !== undefined && entry.licenseTextPath !== "") {
      problems.push(`${entry.id}: link-only stores no license text`);
    }
  }
  if (isCopyleft(entry.license)) problems.push(`${entry.id}: copyleft license stored`);
  for (const snippet of entry.snippets) {
    const text = context.snippetText === undefined ? "" : context.snippetText(snippet);
    if (context.snippetText !== undefined && text.trim() === "") problems.push(`${entry.id}: missing snippet ${snippet}`);
    if (text.split(/\r?\n/).length > SNIPPET_LINE_CAP) problems.push(`${entry.id}: snippet over the cap`);
    if (isCopyleft(text)) problems.push(`${entry.id}: copyleft snippet`);
  }
  if (context.seenUrls !== undefined) {
    const key = canonicalUrl(entry.sourceUrl);
    if (context.seenUrls.has(key)) problems.push(`${entry.id}: duplicate canonical URL`);
    context.seenUrls.add(key);
  }
  return problems;
}

function candidates(
  entries: readonly DesignEntry[],
  input: SelectInput,
  index: DesignIndex | null,
): DesignEntry[] {
  const active = entries.filter((entry) => !entry.retired);
  if (index === null) return active;
  const ids = new Set<string>();
  const add = (list: readonly string[] | undefined): void => {
    for (const id of list ?? []) ids.add(id);
  };
  add(index.by.styleWorld[input.styleWorld]);
  for (const mood of input.moods) add(index.by.moods[mood]);
  add(index.by.sectionTypes[input.sectionType]);
  for (const library of input.stack) add(index.by.libraries[library]);
  if (ids.size === 0) return active;
  return active.filter((entry) => ids.has(entry.id));
}

function compareScore(input: SelectInput, left: DesignEntry, right: DesignEntry): number {
  const delta = baseScore(input, right) - baseScore(input, left);
  if (delta !== 0) return delta;
  if (left.checked !== right.checked) return right.checked < left.checked ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function baseScore(input: SelectInput, entry: DesignEntry): number {
  let score = entry.verified === "human" ? 4 : 1;
  if (entry.styleWorld === input.styleWorld) score += 8;
  for (const mood of input.moods) if (entry.moods.includes(mood)) score += 3;
  if (entry.sectionTypes.includes(input.sectionType)) score += 4;
  for (const library of input.stack) if (entry.libraries.includes(library)) score += 2;
  const checked = Date.parse(`${entry.checked}T00:00:00Z`);
  if (Number.isFinite(checked)) score += checked / 1e15;
  if (input.motionScore < 5) {
    if (entry.perfCost === "high") score -= 6;
    else if (entry.perfCost === "medium") score -= 2;
  }
  if (input.budget3d === 0) {
    if (entry.libraries.includes("three") || entry.libraries.includes("r3f")) score -= 8;
    if (
      entry.libraries.includes("glsl") ||
      entry.libraries.includes("css-scroll") ||
      entry.libraries.includes("vanilla")
    ) {
      score += 2;
    }
  }
  return score;
}

function pushTag(table: Record<string, string[]>, key: string, id: string): void {
  const list = table[key] ?? [];
  if (!list.includes(id)) list.push(id);
  table[key] = list;
}

function proseProblems(id: string, field: string, value: string, maxSentences: number): string[] {
  const problems: string[] = [];
  const count = sentenceCount(value);
  if (count < 1 || count > maxSentences) problems.push(`${id}: ${field} sentence count`);
  if (value.includes("!") || value.includes("\u2014")) problems.push(`${id}: ${field} voice`);
  if (/https?:/i.test(value)) problems.push(`${id}: ${field} keeps URLs out of the prose`);
  const lower = value.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) problems.push(`${id}: ${field} banned word`);
  }
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) problems.push(`${id}: ${field} banned phrase`);
  }
  return problems;
}

function sentenceCount(value: string): number {
  const parts = value
    .split(/\.(?:\s+|$)/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return parts.length;
}

function isCopyleft(value: string): boolean {
  return /\bAGPL\b|\bGPL-\d|\bGNU General Public License\b|\bGPL\b/i.test(value) && !/\bLGPL\b/i.test(value);
}
