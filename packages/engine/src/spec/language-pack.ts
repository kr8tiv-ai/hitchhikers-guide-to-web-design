/**
 * High-end language pack. Entries are precise starting vocabulary.
 * The same query returns the same entries. No model call.
 * A high appetite opens spatial terms. A section only receives the
 * entries its art direction triggers. Nothing here is a mandate.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { styleWorldFrom } from "./art-direction.ts";

export const HIGH_APPETITE = 7;
export const LOW_APPETITE = 4;

const FAMILIES = ["camera", "material", "post", "scroll", "type", "reveal", "shader"] as const;

export type LanguageFamily = (typeof FAMILIES)[number];

export interface LanguageEntry {
  name: string;
  webgl: boolean;
  family: LanguageFamily;
  triggers: string[];
  whenToUse: string;
  ranges: string;
  snippet: string;
  performance: string;
  reducedMotion: string;
  source: string;
}

export interface LanguageQuery {
  appetite: number;
  sectionKind: string;
  artDirection: string;
}

const HERO_FAMILIES = new Set<LanguageFamily>(["camera", "material", "post"]);

export function languagePackRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "knowledge", "language-pack");
}

export function loadLanguagePack(dir = languagePackRoot()): LanguageEntry[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md");
  } catch {
    return [];
  }
  names.sort((left, right) => left.localeCompare(right));
  return names.map((name) => parseLanguageEntry(readFileSync(path.join(dir, name), "utf8"), name));
}

export function selectLanguageEntries(query: LanguageQuery, entries: readonly LanguageEntry[]): LanguageEntry[] {
  const textLed = isTextLed(query);
  const hero3d = isHero3d(query);
  const high = query.appetite >= HIGH_APPETITE;
  const blob = queryBlob(query);
  const chosen: LanguageEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: LanguageEntry): void => {
    if (seen.has(entry.name)) return;
    if (entry.webgl && !high) return;
    seen.add(entry.name);
    chosen.push(entry);
  };
  for (const entry of entries) {
    if (textLed) {
      if (!entry.webgl && (entry.family === "type" || entry.family === "reveal")) add(entry);
      continue;
    }
    if (hero3d && HERO_FAMILIES.has(entry.family)) {
      add(entry);
      continue;
    }
    if (entry.triggers.some((trigger) => blob.includes(trigger))) add(entry);
  }
  return chosen;
}

export function formatLanguagePack(entries: readonly LanguageEntry[]): string {
  if (entries.length === 0) return "";
  const blocks = entries.map((entry) =>
    [
      `#### ${entry.name}`,
      "",
      `When to use: ${entry.whenToUse}`,
      "",
      `Ranges: ${entry.ranges}`,
      "",
      "Snippet:",
      entry.snippet,
      "",
      `Performance: ${entry.performance}`,
      "",
      `Reduced motion: ${entry.reducedMotion}`,
      "",
      `Source: ${entry.source}`,
    ].join("\n"),
  );
  return [
    "### High-end language",
    "",
    "Starting vocabulary for this section. Build on these ranges, remix them, and go further. This is not a mandate.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export function languageBlockFor(query: LanguageQuery, entries = loadLanguagePack()): string {
  return formatLanguagePack(selectLanguageEntries(query, entries));
}

export function languageQueryFrom(sectionKind: string, artDirection: string, styleText: string): LanguageQuery {
  const corpus = `${styleText}\n${artDirection}`;
  const scored = /motion score(?:\s+is)?\s*[:=]?\s*(\d{1,2})\b/i.exec(corpus) ?? /appetite:\s*(\d{1,2})\b/i.exec(corpus);
  let appetite: number;
  if (scored?.[1] !== undefined) {
    const parsed = Number(scored[1]);
    appetite = parsed >= 10 ? 10 : parsed < 1 ? 1 : parsed;
  } else {
    const world = styleWorldFrom(corpus);
    appetite = world === "3d-world" ? 8 : world === "playful" || world === "brutalist" ? 5 : 4;
  }
  return { appetite, sectionKind, artDirection };
}

export function parseLanguageEntry(markdown: string, fileName: string): LanguageEntry {
  const text = markdown.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error(`${fileName} must start with front matter.`);
  }
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) throw new Error(`${fileName} is missing a closing ---.`);
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, close)) {
    if (line.trim() === "") continue;
    const pair = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line.trim());
    if (!pair?.[1]) throw new Error(`${fileName} has an unreadable front matter line.`);
    fields.set(pair[1], (pair[2] ?? "").trim());
  }
  const body = lines.slice(close + 1).join("\n");
  const name = fields.get("name") ?? "";
  const family = fields.get("family") ?? "";
  const whenToUse = fields.get("when-to-use") ?? "";
  const triggers = splitList(fields.get("triggers") ?? "");
  const webglRaw = fields.get("webgl") ?? "";
  if (name === "") throw new Error(`${fileName} is missing name.`);
  if (whenToUse === "") throw new Error(`${fileName} is missing when-to-use.`);
  if (triggers.length === 0) throw new Error(`${fileName} is missing triggers.`);
  if (!isFamily(family)) throw new Error(`${fileName} has an unknown family.`);
  if (webglRaw !== "true" && webglRaw !== "false") throw new Error(`${fileName} must set webgl to true or false.`);
  const ranges = sectionBody(body, "Ranges");
  const snippet = sectionBody(body, "Snippet");
  const performance = sectionBody(body, "Performance");
  const reducedMotion = sectionBody(body, "Reduced motion");
  const source = sectionBody(body, "Source");
  if (ranges === "" || snippet === "" || performance === "" || reducedMotion === "" || source === "") {
    throw new Error(`${fileName} is missing a required section.`);
  }
  return {
    name,
    webgl: webglRaw === "true",
    family,
    triggers,
    whenToUse,
    ranges,
    snippet,
    performance,
    reducedMotion,
    source,
  };
}

function isTextLed(query: LanguageQuery): boolean {
  const blob = queryBlob(query);
  const spatial = /\b3d\b|webgl|shader|glass|\bcamera\b|bloom/.test(blob);
  if (spatial) return false;
  if (/\btext-led\b|typograph/.test(blob)) return true;
  return query.sectionKind === "story" || query.sectionKind === "copy" || query.sectionKind === "text";
}

function isHero3d(query: LanguageQuery): boolean {
  if (query.appetite < HIGH_APPETITE || isTextLed(query)) return false;
  const blob = queryBlob(query);
  const hero = query.sectionKind === "hero" || /\bhero\b|showcase|\bproduct\b/.test(blob);
  const spatial = /\b3d\b|webgl|shader|glass|\bcamera\b|bloom|\bproduct\b/.test(blob);
  return hero && spatial;
}

function queryBlob(query: LanguageQuery): string {
  return `${query.sectionKind} ${query.artDirection}`.toLowerCase();
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
}

function isFamily(value: string): value is LanguageFamily {
  return (FAMILIES as readonly string[]).includes(value);
}

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^## ${heading}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}
