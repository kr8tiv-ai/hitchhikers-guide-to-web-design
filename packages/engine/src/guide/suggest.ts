import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { think } from "../ai/think.ts";
import { validateJson } from "../ai/schema-validate.ts";
import {
  CHOICES_SCHEMA,
  SUGGEST_SCHEMA,
  SUGGEST_TASK,
  type ChoiceId,
  type ChoiceOrigin,
  type Facts,
  type GalleryEntry,
  type SuggestChoice,
  type SuggestOption,
} from "./schemas.ts";
import { guideTextIssues } from "./validators.ts";

/**
 * Grounded Suggest. Options that cite material the project does not have are dropped.
 * Taste cards are a local copy of the 029 picker: two Godly, two Awwwards, no "other" backfill.
 * The engine cannot import the crawler package.
 */

const PER_SOURCE_CAP = 2;
const STYLE_WORLDS = [
  "editorial",
  "3d-world",
  "scroll-film",
  "brutalist",
  "minimal-luxury",
  "playful",
] as const;

export function defaultGalleryFile(): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "knowledge", "galleries", "curated.json");
}

export function isTasteId(questionId: string): boolean {
  return questionId.startsWith("DP-5.");
}

const CHOICE_IDS: readonly ChoiceId[] = ["A", "B", "C", "D"];
const STANDING_WHY = "This is the standing suggestion for the question.";
const EMPTY_LABEL = "A short answer in your own words.";

export interface ChoiceSet {
  choices: SuggestChoice[];
  origin: ChoiceOrigin;
}

export interface SuggestOffer {
  options: SuggestOption[];
  choices: SuggestChoice[];
  origin: ChoiceOrigin;
}

export async function suggest(
  questionId: string,
  facts: Facts,
  deps: { think: typeof think; projectDir?: string; language?: string; fallbackLabel?: string },
): Promise<SuggestOption[]> {
  const offer = await suggestOffer(questionId, facts, deps);
  return offer.options;
}

/**
 * One model call. `options` stays the grounded list suggest() already returned.
 * `choices` is 2 to 4 labelled picks, or exactly one fallback. Bad JSON never throws.
 */
export async function suggestOffer(
  questionId: string,
  facts: Facts,
  deps: { think: typeof think; projectDir?: string; language?: string; fallbackLabel?: string },
): Promise<SuggestOffer> {
  const language = deps.language ?? "en";
  const fallback = { label: deps.fallbackLabel ?? "" };
  let value: unknown;
  try {
    const result = await deps.think(
      {
        task: SUGGEST_TASK,
        schema: SUGGEST_SCHEMA,
        effort: "medium",
        input: [
          `Question id: ${questionId}`,
          "Return 2 to 4 choices with ids A, B, C, D in that order.",
          "Each choice has id, label, why, and source.",
          "Each source must be upload:<file>, answer:<id>, crawl:<note>, or industry:<name> from the facts below.",
          "Do not cite a file, answer, note, or industry that is not listed.",
          renderFacts(facts),
        ].join("\n"),
      },
      deps.projectDir === undefined ? {} : { projectDir: deps.projectDir },
    );
    value = result.value;
  } catch {
    const set = choiceSetFrom(undefined, facts, language, fallback);
    return { options: [], choices: set.choices, origin: set.origin };
  }
  const set = choiceSetFrom(value, facts, language, fallback);
  return {
    options: groundedOptions(value, facts, language).slice(0, 4),
    choices: set.choices,
    origin: set.origin,
  };
}

/**
 * Valid 2 to 4 ordered choices become a model set.
 * Bad JSON, a schema miss, or fewer than 2 grounded rows become exactly one fallback.
 * A present `choices` key that fails the schema does not fall through to `options`.
 */
export function choiceSetFrom(
  value: unknown,
  facts: Facts,
  language: string,
  fallback: { label: string; why?: string; source?: string },
): ChoiceSet {
  const standing = fallbackSet(fallback);
  if (!isRecord(value)) return standing;
  if (Object.hasOwn(value, "choices")) {
    if (validateJson({ choices: value.choices }, CHOICES_SCHEMA).length > 0) return standing;
    const list = value.choices;
    if (!Array.isArray(list) || !idsInOrder(list)) return standing;
    const grounded = groundList(list, facts, language);
    if (grounded.length >= 2) return { origin: "model", choices: assignIds(grounded) };
    if (grounded.length === 1) return { origin: "fallback", choices: assignIds(grounded) };
    return standing;
  }
  if (!Object.hasOwn(value, "options") || !Array.isArray(value.options)) return standing;
  const options = value.options;
  if (options.length < 2 || options.length > 4) return standing;
  for (const item of options) {
    if (asOption(item) === null) return standing;
  }
  const grounded = groundList(options, facts, language);
  if (grounded.length >= 2) return { origin: "model", choices: assignIds(grounded) };
  if (grounded.length === 1) return { origin: "fallback", choices: assignIds(grounded) };
  return standing;
}

export function referenceCards(
  entries: readonly GalleryEntry[],
  query: { industry?: string; styleWorld?: string; exclude?: readonly string[]; limit: number },
): GalleryEntry[] {
  if (!Number.isFinite(query.limit) || query.limit <= 0) return [];
  const excluded = new Set(query.exclude ?? []);
  const godly: GalleryEntry[] = [];
  const awwwards: GalleryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.url) || excluded.has(entry.url)) continue;
    if (query.industry !== undefined && entry.industry !== query.industry) continue;
    if (query.styleWorld !== undefined && entry.styleWorld !== query.styleWorld) continue;
    seen.add(entry.url);
    if (entry.source === "godly") godly.push(entry);
    else if (entry.source === "awwwards") awwwards.push(entry);
  }
  const picked: GalleryEntry[] = [];
  let godlyIndex = 0;
  let awwwardsIndex = 0;
  for (let round = 0; round < PER_SOURCE_CAP; round += 1) {
    const godlyEntry = godly[godlyIndex];
    if (godlyEntry !== undefined && picked.length < query.limit) {
      picked.push(godlyEntry);
      godlyIndex += 1;
    }
    const awwwardsEntry = awwwards[awwwardsIndex];
    if (awwwardsEntry !== undefined && picked.length < query.limit) {
      picked.push(awwwardsEntry);
      awwwardsIndex += 1;
    }
  }
  return picked;
}

export function loadGallery(file: string): GalleryEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Gallery pack must be a JSON array.");
  const entries: GalleryEntry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < parsed.length; index += 1) {
    const entry = parseGalleryEntry(parsed[index], index);
    if (seen.has(entry.url)) throw new Error(`Duplicate gallery url: ${entry.url}`);
    seen.add(entry.url);
    entries.push(entry);
  }
  return entries;
}

export function loadFacts(projectDir: string): Facts {
  const answers = readAnswers(projectDir);
  const uploads = readUploads(projectDir);
  const extra = readFactFiles(projectDir);
  const crawlNotes = dedupe([...extra.crawlNotes, ...readCrawlNotes(projectDir)]);
  const facts: Facts = { answers, uploads, crawlNotes };
  if (extra.industry !== undefined && extra.industry !== "") facts.industry = extra.industry;
  return facts;
}

function groundedOptions(value: unknown, facts: Facts, language: string): SuggestOption[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const options = (value as { options?: unknown }).options;
  if (!Array.isArray(options)) return [];
  const kept: SuggestOption[] = [];
  for (const item of options) {
    const option = asOption(item);
    if (option === null) continue;
    if (!sourceExists(option.source, facts)) continue;
    const ctx = { language, facts };
    if (guideTextIssues(option.label, ctx).length > 0) continue;
    if (guideTextIssues(option.why, ctx).length > 0) continue;
    kept.push(option);
  }
  return kept;
}

function asOption(value: unknown): SuggestOption | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.label !== "string" || record.label.trim() === "") return null;
  if (typeof record.why !== "string" || record.why.trim() === "") return null;
  if (typeof record.source !== "string" || record.source.trim() === "") return null;
  return { label: record.label.trim(), why: record.why.trim(), source: record.source.trim() };
}

function fallbackSet(fallback: { label: string; why?: string; source?: string }): ChoiceSet {
  const label = fallback.label.trim() === "" ? EMPTY_LABEL : fallback.label.trim();
  const why = fallback.why?.trim() ?? "";
  const source = fallback.source?.trim() ?? "";
  return {
    origin: "fallback",
    choices: [
      {
        id: "A",
        label,
        why: why === "" ? STANDING_WHY : why,
        source: source === "" ? "question:suggest" : source,
      },
    ],
  };
}

function idsInOrder(list: readonly unknown[]): boolean {
  if (list.length < 2 || list.length > 4) return false;
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!isRecord(item) || item.id !== CHOICE_IDS[index]) return false;
  }
  return true;
}

function groundList(list: readonly unknown[], facts: Facts, language: string): SuggestOption[] {
  const kept: SuggestOption[] = [];
  const ctx = { language, facts };
  for (const item of list) {
    const option = asOption(item);
    if (option === null) continue;
    if (!sourceExists(option.source, facts)) continue;
    if (guideTextIssues(option.label, ctx).length > 0) continue;
    if (guideTextIssues(option.why, ctx).length > 0) continue;
    kept.push(option);
  }
  return kept;
}

function assignIds(options: readonly SuggestOption[]): SuggestChoice[] {
  const choices: SuggestChoice[] = [];
  for (let index = 0; index < options.length && index < CHOICE_IDS.length; index += 1) {
    const option = options[index];
    const id = CHOICE_IDS[index];
    if (option === undefined || id === undefined) continue;
    choices.push({ id, label: option.label, why: option.why, source: option.source });
  }
  return choices;
}

function sourceExists(source: string, facts: Facts): boolean {
  const colon = source.indexOf(":");
  if (colon <= 0) return false;
  const kind = source.slice(0, colon);
  const rest = source.slice(colon + 1);
  if (rest.trim() === "") return false;
  if (kind === "upload") return facts.uploads.includes(rest);
  if (kind === "answer") {
    for (const answer of facts.answers) {
      if (answer.id === rest && answer.value.trim() !== "") return true;
    }
    return false;
  }
  if (kind === "crawl") return facts.crawlNotes.includes(rest);
  if (kind === "industry") return facts.industry === rest;
  return false;
}

function renderFacts(facts: Facts): string {
  const lines: string[] = ["Facts:"];
  for (const answer of facts.answers) lines.push(`answer:${answer.id} ${answer.value}`);
  for (const upload of facts.uploads) lines.push(`upload:${upload}`);
  for (const note of facts.crawlNotes) lines.push(`crawl:${note}`);
  if (facts.industry !== undefined) lines.push(`industry:${facts.industry}`);
  return lines.join("\n");
}

function readAnswers(projectDir: string): Array<{ id: string; value: string }> {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.answers)
      ? value.answers
      : [];
  const answers: Array<{ id: string; value: string }> = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    answers.push({ id: item.id, value: item.value });
  }
  return answers;
}

function readUploads(projectDir: string): string[] {
  const dir = path.join(projectDir, ".hitchhiker", "uploads");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function readFactFiles(projectDir: string): { industry?: string; crawlNotes: string[] } {
  const file = path.join(projectDir, ".hitchhiker", "facts.json");
  const notes: string[] = [];
  let industry: string | undefined;
  if (existsSync(file)) {
    try {
      const value: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (isRecord(value)) {
        if (typeof value.industry === "string" && value.industry.trim() !== "") {
          industry = value.industry.trim();
        }
        if (Array.isArray(value.crawlNotes)) {
          for (const note of value.crawlNotes) {
            if (typeof note === "string" && note.trim() !== "") notes.push(note.trim());
          }
        }
      }
    } catch {
      // A broken facts file contributes nothing. The interview still runs.
    }
  }
  const industryFile = path.join(projectDir, ".hitchhiker", "industry.txt");
  if (industry === undefined && existsSync(industryFile)) {
    const text = readFileSync(industryFile, "utf8").trim();
    if (text !== "") industry = text;
  }
  const result: { industry?: string; crawlNotes: string[] } = { crawlNotes: notes };
  if (industry !== undefined) result.industry = industry;
  return result;
}

function readCrawlNotes(projectDir: string): string[] {
  const file = path.join(projectDir, ".hitchhiker", "crawl-notes.json");
  if (!existsSync(file)) return [];
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(value)) return [];
    const notes: string[] = [];
    for (const note of value) {
      if (typeof note === "string" && note.trim() !== "") notes.push(note.trim());
    }
    return notes;
  } catch {
    return [];
  }
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseGalleryEntry(value: unknown, index: number): GalleryEntry {
  if (!isRecord(value)) throw new Error(`Gallery entry ${index} is not an object.`);
  const name = readString(value, ["name"]);
  const url = readString(value, ["url"]);
  const source = readString(value, ["source"]);
  const industry = readString(value, ["industry"]);
  const styleWorld = readString(value, ["styleWorld", "style_world"]);
  const award = readString(value, ["award"]);
  const noted = readString(value, ["noted"]);
  const motionRaw = value.motionLevel ?? value.motion_level;
  if (name === null || name.length === 0) throw new Error(`Gallery entry ${index} needs a name.`);
  if (url === null || !isHttpUrl(url)) throw new Error(`Gallery entry ${index} needs an http(s) url.`);
  if (source !== "awwwards" && source !== "godly" && source !== "other") {
    throw new Error(`Gallery entry ${index} has a source this pack does not use.`);
  }
  if (industry === null || industry.length === 0) throw new Error(`Gallery entry ${index} needs an industry.`);
  if (styleWorld === null || !isStyleWorld(styleWorld)) {
    throw new Error(`Gallery entry ${index} has a style world this pack does not use.`);
  }
  if (typeof motionRaw !== "number" || !Number.isInteger(motionRaw) || motionRaw < 1 || motionRaw > 10) {
    throw new Error(`Gallery entry ${index} needs a motion level from 1 to 10.`);
  }
  if (award === null || award.length === 0) throw new Error(`Gallery entry ${index} needs an award.`);
  const awardLower = award.toLowerCase();
  if (awardLower.indexOf("soty") !== -1 && awardLower.indexOf("2026") !== -1) {
    throw new Error("SOTY 2026 is not an award this loader will accept.");
  }
  if (awardLower.indexOf("sotd") !== -1 && awardLower.indexOf("soty") !== -1) {
    throw new Error("A Site of the Day row must not use the award string SOTY.");
  }
  if (noted === null || noted.indexOf("Look at") !== 0) {
    throw new Error(`Gallery entry ${index} needs a one-line Look at note.`);
  }
  if (noted.indexOf("\n") !== -1 || noted.indexOf("!") !== -1) {
    throw new Error(`Gallery entry ${index} note must be one line, with no exclamation mark.`);
  }
  return { name, url, source, industry, styleWorld, motionLevel: motionRaw, award, noted };
}

function isStyleWorld(value: string): boolean {
  for (const style of STYLE_WORLDS) {
    if (style === value) return true;
  }
  return false;
}

function isHttpUrl(value: string): boolean {
  if (value.indexOf("http://") !== 0 && value.indexOf("https://") !== 0) return false;
  if (value.indexOf(" ") !== -1) return false;
  return true;
}

function readString(raw: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
