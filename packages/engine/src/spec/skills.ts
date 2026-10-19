/**
 * Aura-style skill packs. Front matter names the triggers and the pins.
 * Bodies are starting notes. No model call.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StyleWorld } from "./art-direction.ts";
import { estimateTokens } from "./context-doc.ts";

export interface SkillPack {
  name: string;
  siteTypes: string[];
  motionAppetite: string;
  sectionKinds: string[];
  techniques: string[];
  versions: Record<string, string>;
  body: string;
  file: string;
}

export interface SkillQuery {
  siteType: string;
  motionAppetite: number;
  sectionKind: string;
  artDirection: string;
}

export interface SkillExpansion {
  text: string;
  unknown: string[];
  inlined: string[];
  referenced: string[];
}

/** Inline a pack while this many tokens remain. A larger pack becomes a path. */
export const SKILL_INCLUDE_TOKEN_BUDGET = 1_600;

const TEXT_LED_PACK = "scroll-choreography";
const SPATIAL_PACKS = new Set(["object-showcase", "shader-recipes", "post-processing", "locked-versions", "awwwards-sotd-breakdowns"]);

export function skillsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "knowledge", "skills");
}

export function loadSkillPacks(dir = skillsRoot()): SkillPack[] {
  const files: string[] = [];
  collectMarkdown(dir, files);
  files.sort((left, right) => left.localeCompare(right));
  return files.map((file) => parseSkillPack(readFileSync(file, "utf8"), repoSkillPath(file)));
}

export function parseSkillPack(markdown: string, file: string): SkillPack {
  const text = markdown.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error(`${file} must start with front matter.`);
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) throw new Error(`${file} is missing a closing ---.`);
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, close)) {
    if (line.trim() === "") continue;
    const pair = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line.trim());
    if (!pair?.[1]) throw new Error(`${file} has an unreadable front matter line.`);
    fields.set(pair[1], (pair[2] ?? "").trim());
  }
  const name = fields.get("name") ?? "";
  const siteTypes = splitList(fields.get("site-types") ?? "");
  const sectionKinds = splitList(fields.get("section-kinds") ?? "");
  const techniques = splitList(fields.get("techniques") ?? "");
  const motionAppetite = (fields.get("motion-appetite") ?? "").trim();
  if (name === "") throw new Error(`${file} is missing name.`);
  if (siteTypes.length === 0) throw new Error(`${file} is missing site-types.`);
  if (sectionKinds.length === 0) throw new Error(`${file} is missing section-kinds.`);
  if (techniques.length === 0) throw new Error(`${file} is missing techniques.`);
  if (motionAppetite === "") throw new Error(`${file} is missing motion-appetite.`);
  const versions = parseVersions(fields.get("versions") ?? "", file);
  const body = lines.slice(close + 1).join("\n").trim();
  if (body === "") throw new Error(`${file} is missing a body.`);
  return { name, siteTypes, motionAppetite, sectionKinds, techniques, versions, body, file };
}

function parseVersions(value: string, file: string): Record<string, string> {
  const versions: Record<string, string> = {};
  if (value.trim() === "") return versions;
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const at = trimmed.lastIndexOf("@");
    if (at <= 0) throw new Error(`${file} has a bad version pin: ${trimmed}`);
    const lib = trimmed.slice(0, at);
    const version = trimmed.slice(at + 1);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${file} has a bad version pin: ${trimmed}`);
    versions[lib] = version;
  }
  return versions;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
}

function collectMarkdown(dir: string, into: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdown(full, into);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md") into.push(full);
  }
}

function repoSkillPath(file: string): string {
  const norm = file.replaceAll("\\", "/");
  const marker = "packages/knowledge/skills/";
  const at = norm.lastIndexOf(marker);
  if (at === -1) return norm;
  return norm.slice(at);
}

export function siteTypeForWorld(world: StyleWorld): string {
  if (world === "3d-world") return "product";
  if (world === "playful") return "marketing";
  return "editorial";
}

export function selectSkillPacks(query: SkillQuery, packs: readonly SkillPack[]): SkillPack[] {
  const blob = `${query.siteType} ${query.sectionKind} ${query.artDirection}`.toLowerCase();
  const textLed = isTextLed(query, blob);
  return packs.filter((pack) => {
    if (!appetiteFits(pack.motionAppetite, query.motionAppetite)) return false;
    if (!pack.siteTypes.includes(query.siteType)) return false;
    const sectionOk = pack.sectionKinds.some((kind) => query.sectionKind === kind || query.sectionKind.endsWith(`-${kind}`));
    const techniqueOk = pack.techniques.some((technique) => mentions(blob, technique));
    if (!sectionOk && !techniqueOk) return false;
    if (textLed && pack.name !== TEXT_LED_PACK) return false;
    if (textLed && SPATIAL_PACKS.has(pack.name)) return false;
    return true;
  });
}

export function planSkillLines(query: SkillQuery, packs = loadSkillPacks()): string {
  return selectSkillPacks(query, packs)
    .map((pack) => `@skill:${pack.name}`)
    .join("\n");
}

export function expandSkillIncludes(
  source: string,
  packs: readonly SkillPack[],
  budget = SKILL_INCLUDE_TOKEN_BUDGET,
): SkillExpansion {
  const byName = new Map(packs.map((pack) => [pack.name, pack]));
  const unknown: string[] = [];
  const inlined: string[] = [];
  const referenced: string[] = [];
  let remaining = budget;
  const text = source.replace(/@skill:([a-z0-9-]+)/g, (full, name: string) => {
    const pack = byName.get(name);
    if (pack === undefined) {
      unknown.push(name);
      return `${full}\nUnknown skill: ${name}.`;
    }
    const cost = estimateTokens(pack.body);
    if (cost > remaining) {
      referenced.push(name);
      remaining = 0;
      return `${full}\nRead on demand: ${pack.file}`;
    }
    remaining -= cost;
    inlined.push(name);
    return `${full}\n${pack.body}`;
  });
  return { text, unknown, inlined, referenced };
}

function appetiteFits(band: string, appetite: number): boolean {
  if (band === "any") return true;
  if (band === "low") return appetite <= 4;
  if (band === "medium") return appetite >= 4 && appetite <= 6;
  if (band === "high") return appetite >= 7;
  const floor = Number(band);
  return Number.isFinite(floor) && appetite >= floor;
}

function isTextLed(query: SkillQuery, blob: string): boolean {
  const spatial = /\b3d\b|webgl|shader|glass|\bcamera\b|bloom/.test(blob);
  if (spatial) return false;
  if (/\btext-led\b|typograph/.test(blob)) return true;
  return query.sectionKind === "story" || query.sectionKind === "copy" || query.sectionKind === "text";
}

function mentions(blob: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(blob);
}

export function skillVersionMentions(body: string): Array<{ lib: string; version: string }> {
  const found: Array<{ lib: string; version: string }> = [];
  const pattern = /(\S+)@(\d+\.\d+\.\d+)/g;
  for (const match of body.matchAll(pattern)) {
    const lib = match[1];
    const version = match[2];
    if (lib === undefined || version === undefined) continue;
    if (lib.startsWith("http") || lib.includes("://")) continue;
    found.push({ lib, version });
  }
  return found;
}
