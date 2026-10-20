/**
 * Plan-then-critique, before any page prompt (BUG-055 idea 1).
 * The draft is tokens plus an ASCII wireframe. The critique asks whether
 * any similar brief would produce that plan. Three concrete differences
 * pass. A café, a studio, and a clinic that differ only by the category
 * word fail. No model call and no vendor.
 */

import { translateBrief } from "./art-direction.ts";

export interface PlanTokens {
  paper: string;
  ink: string;
  accent: string;
  display: string;
  motion: string;
  world: string;
}

export interface PlanDraft {
  brief: string;
  tokens: PlanTokens;
  wireframe: string;
  anchors: readonly string[];
  generic: boolean;
}

export interface PlanCritique {
  pass: boolean;
  differences: readonly string[];
  failure: string;
}

export class PlanCritiqueError extends Error {
  readonly failure: string;

  constructor(failure: string) {
    super(failure);
    this.name = "PlanCritiqueError";
    this.failure = failure;
  }
}

const GENERIC_TOKENS: PlanTokens = {
  paper: "#f4f1ea",
  ink: "#1a1a1a",
  accent: "#1f6b4a",
  display: "default",
  motion: "quiet:4",
  world: "editorial",
};

const GENERIC_PAGES = new Set(["home", "menu", "visit"]);

const CATEGORY_WORD =
  /\b(cafés|café|cafes|cafe|coffee|pastries|pastry|studios|studio|projects|project|design|clinics|clinic|patients|patient|care)\b/gi;

const FAIL = "Any similar brief would produce this plan.";

export function draftPlan(brief: string): PlanDraft {
  const anchors = contentAnchors(brief);
  const generic = isGeneric(brief, anchors);
  const tokens = generic ? { ...GENERIC_TOKENS } : tokensFrom(brief);
  const wireframe = generic ? genericWireframe() : wireframeFrom(anchors);
  return { brief, tokens, wireframe, anchors, generic };
}

export function planSwapKey(draft: PlanDraft): string {
  return stripCategories(`${JSON.stringify(draft.tokens)}\n${draft.wireframe}`);
}

export function plansSwapWithoutEdit(left: PlanDraft, right: PlanDraft): boolean {
  return planSwapKey(left) === planSwapKey(right);
}

export function critiquePlan(draft: PlanDraft): PlanCritique {
  const differences = draft.generic ? [] : concreteDifferences(draft);
  if (draft.generic || differences.length < 3) {
    return { pass: false, differences: [], failure: FAIL };
  }
  return { pass: true, differences: differences.slice(0, 3), failure: "" };
}

function tokensFrom(brief: string): PlanTokens {
  const art = translateBrief(brief);
  return {
    paper: GENERIC_TOKENS.paper,
    ink: GENERIC_TOKENS.ink,
    accent: GENERIC_TOKENS.accent,
    display: art.styleWorld,
    motion: `${art.motion.intensity}:${art.motion.score}`,
    world: art.styleWorld,
  };
}

const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "been", "before", "both", "but", "each", "for", "from",
  "have", "home", "into", "its", "just", "menu", "more", "not", "only", "our", "over", "page",
  "pages", "site", "some", "such", "than", "that", "the", "them", "then", "they", "this", "very",
  "visit", "was", "were", "what", "when", "where", "which", "while", "will", "with", "your",
]);

function concreteDifferences(draft: PlanDraft): string[] {
  const found = [...draft.anchors];
  if (draft.tokens.world !== GENERIC_TOKENS.world) found.push(`world ${draft.tokens.world}`);
  if (draft.tokens.motion !== GENERIC_TOKENS.motion) found.push(`motion ${draft.tokens.motion}`);
  let unique = dedupe(found.filter((item) => item.trim().length >= 3));
  if (unique.length >= 3) return unique;
  for (const word of significantWords(draft.brief)) {
    unique = dedupe([...unique, word]);
    if (unique.length >= 3) return unique;
  }
  if (draft.wireframe !== genericWireframe()) {
    unique = dedupe([...unique, "section order is not hero, cards, testimonials, contact"]);
  }
  const text = draft.brief.replace(/\s+/g, " ").trim();
  if (text.length >= 3) unique = dedupe([...unique, text]);
  return unique.filter((item) => item.trim().length >= 3);
}

function significantWords(brief: string): string[] {
  const words = brief.match(/[A-Za-z][A-Za-z0-9&'-]{3,}/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase();
    if (STOP_WORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function isGeneric(brief: string, anchors: readonly string[]): boolean {
  if (anchors.length > 0) return false;
  if (singleCategory(brief) === null) return false;
  return /in the city/i.test(brief) && /book a table/i.test(brief);
}

function singleCategory(brief: string): "cafe" | "studio" | "clinic" | null {
  const lower = brief.toLowerCase();
  const cafe = /\bcaf[eé]s?\b|\bcoffee\b|\bpastr(?:y|ies)\b/.test(lower);
  const studio = /\bstudios?\b|\bprojects?\b/.test(lower);
  const clinic = /\bclinics?\b|\bpatients?\b/.test(lower);
  const hits = [cafe, studio, clinic].filter(Boolean).length;
  if (hits !== 1) return null;
  if (cafe) return "cafe";
  if (studio) return "studio";
  return "clinic";
}

function contentAnchors(brief: string): string[] {
  const anchors: string[] = [];
  for (const raw of brief.split(/\n+/)) {
    const line = raw.trim();
    if (line === "" || isBoilerplateLine(line)) continue;
    for (const sentence of line.split(/(?<=\.)\s+/)) {
      const text = sentence.replace(/\s+/g, " ").trim();
      if (text.length < 8 || isCategoryFiller(text)) continue;
      anchors.push(text);
    }
  }
  for (const name of pageNames(brief)) {
    if (!GENERIC_PAGES.has(name.toLowerCase())) anchors.push(name);
  }
  return dedupe(anchors);
}

function isBoilerplateLine(line: string): boolean {
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^pages:\s*home,\s*menu,\s*visit\.?$/i.test(line)) return true;
  if (/^sections:\s*hero,\s*cards,\s*testimonials,\s*contact\.?$/i.test(line)) return true;
  return false;
}

function isCategoryFiller(sentence: string): boolean {
  const stripped = stripCategories(sentence).replace(/[.]+$/g, "").trim();
  if (stripped === "" || stripped === "book a table") return true;
  if (/^a § in the city$/.test(stripped)) return true;
  return /^(?:§(?:\s+and\s+§)*)+$/.test(stripped);
}

function pageNames(brief: string): string[] {
  const names: string[] = [];
  for (const match of brief.matchAll(/Pages:\s*([^\n]+)/gi)) {
    const line = match[1] ?? "";
    for (const part of line.split(/[;,]/)) {
      const name = part.replace(/\(.*$/, "").replace(/\.$/, "").trim();
      if (name !== "") names.push(name);
    }
  }
  return names;
}

function stripCategories(text: string): string {
  return text
    .replace(/cafés/gi, "§")
    .replace(/café/gi, "§")
    .replace(CATEGORY_WORD, "§")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function genericWireframe(): string {
  return wireframeFrom(["HERO", "CARDS", "TESTIMONIALS", "CONTACT"]);
}

function wireframeFrom(labels: readonly string[]): string {
  return labels.slice(0, 6).map((label) => box(label)).join("\n");
}

function box(label: string): string {
  const text = label.replace(/[|]/g, "/");
  const width = Math.max(24, text.length);
  const bar = `+${"-".repeat(width + 2)}+`;
  return `${bar}\n| ${text} |\n${bar}`;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
