import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { packagedPath } from "../packaged-dir.ts";
import { isBillingFailure } from "../ai/grok-failure.ts";
import type { think } from "../ai/think.ts";
import { applyContextFacts, bindPacket } from "../context/index.ts";
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
import {
  isGalleryFamily,
  isGallerySource,
  isGalleryStyleWorld,
  selectReferenceCards,
  styleWorldForFamily,
} from "./gallery-model.ts";
import {
  assetDisplayName,
  choiceAllowed,
  reletterChoices,
  loadSessionState,
  projectMentionsQuotes,
  projectTree,
  sessionBlock,
} from "./session-state.ts";
import { guideTextIssues } from "./validators.ts";

/**
 * Grounded Suggest. Options that cite material the project does not have are dropped.
 * Taste cards use the gallery picker: up to two Recent or legacy Godly, up to two
 * Awwwards, then backfill until the round has four. The engine cannot import the crawler.
 */

export function defaultGalleryFile(): string {
  return path.join(packagedPath(["knowledge"], "packs"), "galleries", "curated.json");
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
  const questions = deps.projectDir === undefined ? [] : projectTree(deps.projectDir);
  const session = deps.projectDir === undefined ? null : loadSessionState(deps.projectDir, questions);
  const boundThink = bindPacket(deps.think, deps.projectDir ?? "", "suggest");
  let value: unknown;
  try {
    const result = await boundThink(
      {
        task: SUGGEST_TASK,
        schema: SUGGEST_SCHEMA,
        input: [
          `Question id: ${questionId}`,
          "Return 2 to 4 choices with ids A, B, C, D in that order.",
          "Each choice has id, label, why, and source.",
          "Each source must be upload:<file>, answer:<id>, crawl:<note>, or industry:<name> from the facts below.",
          "Do not cite a file, answer, note, or industry that is not listed.",
          "Only name files listed under uploads. Never name a file that is not listed.",
          renderFacts(facts),
          session === null ? "" : sessionBlock(session),
        ].join("\n"),
      },
      deps.projectDir === undefined ? {} : { projectDir: deps.projectDir },
    );
    value = result.value;
  } catch (error) {
    if (isBillingFailure(error)) throw error;
    const set = choiceSetFrom(undefined, facts, language, fallback);
    return { options: [], choices: set.choices, origin: set.origin };
  }
  const set = choiceSetFrom(value, facts, language, fallback);
  const about = session === null ? false : projectMentionsQuotes(session);
  const choices =
    session === null
      ? set.choices
      : reletterChoices(set.choices.filter((item) => choiceAllowed(item.label, session, questions, about)));
  return {
    options: groundedOptions(value, facts, language).slice(0, 4),
    choices,
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
  empty: "standing" | "none" = "standing",
): ChoiceSet {
  const standing = empty === "none" ? { origin: "fallback" as const, choices: [] } : fallbackSet(fallback);
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
  query: {
    industry?: string;
    styleWorld?: string;
    family?: string;
    exclude?: readonly string[];
    limit: number;
    seed?: string;
    round?: number;
    lovedUrls?: readonly string[];
  },
): GalleryEntry[] {
  return selectReferenceCards(entries, query);
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
  return applyContextFacts(projectDir, facts);
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

function readAnswers(projectDir: string): Array<{ id: string; value: string; status?: string }> {
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
  const answers: Array<{ id: string; value: string; status?: string }> = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    const status = typeof item.status === "string" ? item.status : "";
    if (status === "SKIPPED" || status === "NOT_APPLICABLE" || status === "UNANSWERED") {
      answers.push({ id: item.id, value: item.value, status });
    } else {
      answers.push({ id: item.id, value: item.value });
    }
  }
  return answers;
}

function readUploads(projectDir: string): string[] {
  const names = new Set<string>();
  const dir = path.join(projectDir, ".hitchhiker", "uploads");
  if (existsSync(dir)) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile()) names.add(entry.name);
      }
    } catch {
      // A missing uploads folder contributes no flat files.
    }
  }
  try {
    for (const file of loadSessionState(projectDir).uploads) {
      const safe = path.basename(file.safeName.replace(/\\/g, "/"));
      if (safe !== "") names.add(safe);
      const original = path.basename(file.originalName.replace(/\\/g, "/"));
      if (original !== "") names.add(original);
      const display = assetDisplayName(file.safeName, file.originalName);
      if (display !== "") names.add(display);
    }
  } catch {
    // Session state is optional context. Facts still list the flat files.
  }
  return [...names];
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
  const label = entryLabel(index, value);
  const name = readString(value, ["name"]);
  const url = readString(value, ["url"]);
  const source = readString(value, ["source"]);
  const industry = readString(value, ["industry"]);
  const styleRaw = readString(value, ["styleWorld", "style_world"]);
  const award = readString(value, ["award"]);
  const noted = readString(value, ["noted"]);
  const motionRaw = value.motionLevel ?? value.motion_level;
  const familyRaw = readString(value, ["family"]);
  if (name === null || name.length === 0) throw new Error(`${label} needs a name.`);
  if (url === null || !isHttpUrl(url)) throw new Error(`${label} needs an http(s) url.`);
  if (source === null || !isGallerySource(source)) {
    throw new Error(`${label} has a source this pack does not use.`);
  }
  if (industry === null || industry.length === 0) throw new Error(`${label} needs an industry.`);
  if (familyRaw !== null && !isGalleryFamily(familyRaw)) {
    throw new Error(`${label} has a family this pack does not use.`);
  }
  let styleWorld = styleRaw;
  if (familyRaw !== null) {
    const expected = styleWorldForFamily(familyRaw);
    if (styleWorld === null) styleWorld = expected;
    else if (styleWorld !== expected) {
      throw new Error(`${label} style world does not match its family.`);
    }
  }
  if (styleWorld === null || !isGalleryStyleWorld(styleWorld)) {
    throw new Error(`${label} has a style world this pack does not use.`);
  }
  if (typeof motionRaw !== "number" || !Number.isInteger(motionRaw) || motionRaw < 1 || motionRaw > 10) {
    throw new Error(`${label} needs a motion level from 1 to 10.`);
  }
  if (award === null || award.length === 0) throw new Error(`${label} needs an award.`);
  const awardLower = award.toLowerCase();
  if (awardLower.indexOf("soty") !== -1 && awardLower.indexOf("2026") !== -1) {
    throw new Error("SOTY 2026 is not an award this loader will accept.");
  }
  if (awardLower.indexOf("sotd") !== -1 && awardLower.indexOf("soty") !== -1) {
    throw new Error("A Site of the Day row must not use the award string SOTY.");
  }
  if (noted === null || noted.indexOf("Look at") !== 0) {
    throw new Error(`${label} needs a one-line Look at note.`);
  }
  if (noted.indexOf("\n") !== -1 || noted.indexOf("!") !== -1) {
    throw new Error(`${label} note must be one line, with no exclamation mark.`);
  }
  const entry: GalleryEntry = {
    name,
    url,
    source,
    industry,
    styleWorld,
    motionLevel: motionRaw,
    award,
    noted,
  };
  const id = optionalText(value, "id", label);
  if (id !== undefined) entry.id = id;
  const title = optionalText(value, "title", label);
  if (title !== undefined) entry.title = title;
  const sourceName = optionalText(value, "sourceName", label);
  if (sourceName !== undefined) entry.sourceName = sourceName;
  if (Object.hasOwn(value, "sourcePage")) {
    if (value.sourcePage === null) entry.sourcePage = null;
    else {
      const sourcePage = optionalText(value, "sourcePage", label);
      if (sourcePage !== undefined) entry.sourcePage = sourcePage;
    }
  }
  if (familyRaw !== null) entry.family = familyRaw;
  if (Object.hasOwn(value, "styleTags")) entry.styleTags = optionalTags(value.styleTags, label);
  const why = optionalText(value, "why", label);
  if (why !== undefined) entry.why = why;
  if (Object.hasOwn(value, "palette")) {
    const palette = optionalPalette(value.palette, label);
    if (palette !== undefined) entry.palette = palette;
  }
  const typography = optionalText(value, "typography", label);
  if (typography !== undefined) entry.typography = typography;
  const borrow = optionalText(value, "borrow", label);
  if (borrow !== undefined) entry.borrow = borrow;
  const attribution = optionalText(value, "attribution", label);
  if (attribution !== undefined) entry.attribution = attribution;
  if (Object.hasOwn(value, "verified")) {
    if (typeof value.verified !== "boolean") throw new Error(`${label} verified must be a boolean.`);
    entry.verified = value.verified;
  }
  const verificationNote = optionalText(value, "verificationNote", label);
  if (verificationNote !== undefined) entry.verificationNote = verificationNote;
  const checked = optionalText(value, "checked", label);
  if (checked !== undefined) entry.checked = checked;
  return entry;
}

function entryLabel(index: number, raw: Record<string, unknown>): string {
  const id = raw.id;
  if (typeof id === "string" && id.trim() !== "") return `Gallery entry ${index} (${id.trim()})`;
  return `Gallery entry ${index}`;
}

function optionalText(raw: Record<string, unknown>, key: string, label: string): string | undefined {
  if (!Object.hasOwn(raw, key) || raw[key] === undefined) return undefined;
  if (typeof raw[key] !== "string" || raw[key].trim() === "") {
    throw new Error(`${label} ${key} must be a non-empty string.`);
  }
  return raw[key].trim();
}

function optionalTags(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} styleTags must be an array of strings.`);
  }
  return value;
}

function optionalPalette(value: unknown, label: string): GalleryEntry["palette"] {
  if (!isRecord(value) || typeof value.note !== "string" || !Array.isArray(value.hex)) {
    throw new Error(`${label} palette must include a note and hex values.`);
  }
  if (value.hex.some((item) => typeof item !== "string")) {
    throw new Error(`${label} palette hex values must be strings.`);
  }
  return { note: value.note.trim(), hex: value.hex };
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
