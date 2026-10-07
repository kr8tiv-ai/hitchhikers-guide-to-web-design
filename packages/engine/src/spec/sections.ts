/**
 * SECTION-PLAN.md and a short VISUAL-DIRECTION.md.
 * Pure. The caller writes both files.
 *
 * The generated site's hero slice is Infinite Improbability (v2 §5.2).
 *
 * Assumptions, because the session note and the typed interface differ:
 * - The return is `{ sectionPlan, visual }`, not one markdown string.
 * - Assignments stay. They carry the library and element from planMotion.
 *   EffectRequest in this function is `{ sectionId, effectId }`, a parallel
 *   array on `effects`. It is not the EffectRequest in motion.ts.
 * - `effects` may be omitted. Zero assignments need no map. One assignment
 *   lands on the hero. Two or more require `effects`. Nothing is guessed,
 *   and a motion-plan row (including Lenis) is not dropped.
 * - One section per page. The first section id is `hero`. Later section
 *   ids are the page ids. A later page id of `hero` collides and throws.
 * - Heavy libraries are `three` and `theatre`, the names planMotion emits.
 *   Those need a text fallback of at least 20 characters, keyed by effect id.
 * - `answers` is optional: light, type, and signature moment. A missing or
 *   blank field is `Not decided.`
 * - Protected is `no`. This input has no protected list.
 * - Every section prints a Text line (the fallback, or the purpose) so a
 *   heavy hero is not canvas-only.
 */

import { MOTION_LIBS, type MotionLib } from "./motion.ts";

export interface PageInput {
  id: string;
  title: string;
  purpose: string;
}

/** Placement of one motion-plan effect onto one section. */
export interface EffectRequest {
  sectionId: string;
  effectId: string;
}

export class SectionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectionsError";
  }
}

const HERO_ID = "hero";
const HERO_SLICE = "Infinite Improbability";
const NOT_DECIDED = "Not decided.";
const MIN_FALLBACK = 20;

function isHeavy(library: MotionLib): boolean {
  return library === "three" || library === "theatre";
}

interface CleanPage {
  id: string;
  title: string;
  purpose: string;
}

interface CleanAssignment {
  id: string;
  library: MotionLib;
  element: string;
}

interface PlannedSection {
  id: string;
  pageId: string;
  title: string;
  purpose: string;
  name: string;
  slice: string;
}

interface VisualFields {
  light: string;
  type: string;
  signature: string;
}

function flatten(value: string): string {
  return value.replace(/\r\n|[\r\n]/g, " ").replace(/ {2,}/g, " ").trim();
}

function assertSafe(text: string, field: string): void {
  if (text.includes("!") || text.includes("\uFF01")) {
    throw new SectionsError(`${field} cannot contain an exclamation mark.`);
  }
  if (/\blorem\b/i.test(text)) {
    throw new SectionsError(`${field} cannot contain lorem.`);
  }
}

function cleanToken(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new SectionsError(`${field} must be a string.`);
  }
  const text = flatten(value);
  if (text.length === 0) {
    throw new SectionsError(`${field} must not be empty.`);
  }
  assertSafe(text, field);
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanPages(raw: unknown): CleanPage[] {
  if (!Array.isArray(raw)) {
    throw new SectionsError("pages must be an array.");
  }
  if (raw.length === 0) {
    throw new SectionsError("At least one page is required.");
  }
  const pages: CleanPage[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) {
      throw new SectionsError("Each page must be an object.");
    }
    const id = cleanToken(item.id, "Page id");
    if (seen.has(id)) {
      throw new SectionsError(`Duplicate page id "${id}".`);
    }
    seen.add(id);
    pages.push({
      id,
      title: cleanToken(item.title, `Page "${id}" title`),
      purpose: cleanToken(item.purpose, `Page "${id}" purpose`),
    });
  }
  return pages;
}

function cleanLibrary(value: unknown): MotionLib {
  const library = cleanToken(value, "Effect library");
  if ((MOTION_LIBS as readonly string[]).includes(library)) {
    return library as MotionLib;
  }
  throw new SectionsError(`Unknown library "${library}". Known libraries: ${MOTION_LIBS.join(", ")}.`);
}

function cleanAssignments(raw: unknown): CleanAssignment[] {
  if (!Array.isArray(raw)) {
    throw new SectionsError("assignments must be an array.");
  }
  const assignments: CleanAssignment[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) {
      throw new SectionsError("Each assignment must be an object.");
    }
    const id = cleanToken(item.id, "Effect id");
    if (seen.has(id)) {
      throw new SectionsError(`Duplicate effect id "${id}".`);
    }
    seen.add(id);
    assignments.push({
      id,
      library: cleanLibrary(item.library),
      element: cleanToken(item.element, `Effect "${id}" element`),
    });
  }
  return assignments;
}

function cleanFallbacks(raw: unknown): Map<string, string> {
  if (!isRecord(raw)) {
    throw new SectionsError("textFallbacks must be an object.");
  }
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new SectionsError(`Text fallback for "${key}" must be a string.`);
    }
    const id = cleanToken(key, "Text fallback id");
    if (map.has(id)) {
      throw new SectionsError(`Duplicate text fallback for "${id}".`);
    }
    map.set(id, value);
  }
  return map;
}

function buildSections(pages: readonly CleanPage[]): PlannedSection[] {
  return pages.map((page, index) => {
    if (index === 0) {
      return {
        id: HERO_ID,
        pageId: page.id,
        title: page.title,
        purpose: page.purpose,
        name: HERO_SLICE,
        slice: HERO_SLICE,
      };
    }
    if (page.id === HERO_ID) {
      throw new SectionsError(`Page id "${HERO_ID}" collides with the hero section.`);
    }
    return {
      id: page.id,
      pageId: page.id,
      title: page.title,
      purpose: page.purpose,
      name: page.purpose,
      slice: "none",
    };
  });
}

function explicitEffects(raw: unknown): EffectRequest[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new SectionsError("effects must be an array.");
  }
  const effects: EffectRequest[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      throw new SectionsError("Each effect request must be an object.");
    }
    effects.push({
      sectionId: cleanToken(item.sectionId, "sectionId"),
      effectId: cleanToken(item.effectId, "effectId"),
    });
  }
  return effects;
}

function placeEffects(
  sections: readonly PlannedSection[],
  assignments: readonly CleanAssignment[],
  effects: readonly EffectRequest[] | undefined,
): Map<string, CleanAssignment> {
  const known = sections.map((section) => section.id);
  const knownSet = new Set(known);
  const byEffect = new Map(assignments.map((item) => [item.id, item]));
  let requests = effects;
  if (requests === undefined) {
    if (assignments.length > 1) {
      throw new SectionsError("Name a sectionId for each effect. Do not guess.");
    }
    const only = assignments[0];
    requests = only === undefined ? [] : [{ sectionId: HERO_ID, effectId: only.id }];
  }

  const placed = new Map<string, CleanAssignment>();
  const used = new Set<string>();
  for (const request of requests) {
    if (!knownSet.has(request.sectionId)) {
      throw new SectionsError(`Unknown section "${request.sectionId}". Known sections: ${known.join(", ")}.`);
    }
    const assignment = byEffect.get(request.effectId);
    if (assignment === undefined) {
      throw new SectionsError(`Unknown effect "${request.effectId}".`);
    }
    const existing = placed.get(request.sectionId);
    if (existing !== undefined) {
      throw new SectionsError(
        `Section "${request.sectionId}" cannot have two effects ("${existing.id}" and "${request.effectId}").`,
      );
    }
    if (used.has(request.effectId)) {
      throw new SectionsError(`Effect "${request.effectId}" is already placed on a section.`);
    }
    placed.set(request.sectionId, assignment);
    used.add(request.effectId);
  }

  for (const assignment of assignments) {
    if (!used.has(assignment.id)) {
      throw new SectionsError(`Effect "${assignment.id}" is not placed on a section.`);
    }
  }
  return placed;
}

function heavyText(effect: CleanAssignment, fallbacks: ReadonlyMap<string, string>): string {
  const raw = fallbacks.get(effect.id);
  const text = raw === undefined ? "" : flatten(raw);
  if (text.length < MIN_FALLBACK) {
    throw new SectionsError(
      `Effect "${effect.id}" uses ${effect.library} and needs a text fallback of at least ${MIN_FALLBACK} characters.`,
    );
  }
  assertSafe(text, `Text fallback for "${effect.id}"`);
  return text;
}

function sectionText(
  section: PlannedSection,
  effect: CleanAssignment | undefined,
  fallbacks: ReadonlyMap<string, string>,
): string {
  if (effect === undefined || !isHeavy(effect.library)) return section.purpose;
  return heavyText(effect, fallbacks);
}

function renderSection(
  section: PlannedSection,
  effect: CleanAssignment | undefined,
  text: string,
): string {
  const heavy = effect !== undefined && isHeavy(effect.library);
  const lines = [
    `## ${section.pageId}`,
    "",
    `Title: ${section.title}`,
    "",
    `### ${section.id}`,
    "",
    `- Slice: ${section.slice}`,
    `- Name: ${section.name}`,
    `- Job: ${section.purpose}`,
    `- Wow: ${effect === undefined ? "none" : effect.id}`,
    `- Library: ${effect === undefined ? "none" : effect.library}`,
    `- Element: ${effect === undefined ? "none" : effect.element}`,
    `- Text: ${text}`,
  ];
  if (heavy) {
    lines.push("- The text line is crawlable in the page, outside the WebGL context.");
  }
  lines.push("- Protected: no", "");
  return lines.join("\n");
}

function decided(value: unknown, field: string): string {
  if (value === undefined) return NOT_DECIDED;
  if (typeof value !== "string") {
    throw new SectionsError(`${field} must be a string.`);
  }
  const text = flatten(value);
  if (text.length === 0) return NOT_DECIDED;
  assertSafe(text, field);
  return text;
}

function cleanAnswers(raw: unknown): VisualFields {
  if (raw === undefined) {
    return { light: NOT_DECIDED, type: NOT_DECIDED, signature: NOT_DECIDED };
  }
  if (!isRecord(raw)) {
    throw new SectionsError("answers must be an object.");
  }
  return {
    light: decided(raw.light, "Light"),
    type: decided(raw.type, "Type"),
    signature: decided(raw.signature, "Signature moment"),
  };
}

function renderVisual(fields: VisualFields): string {
  return [
    "# VISUAL-DIRECTION",
    "",
    `Hero slice: ${HERO_SLICE}`,
    "",
    "## Light",
    "",
    fields.light,
    "",
    "## Type",
    "",
    fields.type,
    "",
    "## Signature moment",
    "",
    fields.signature,
    "",
  ].join("\n");
}

function assertDoc(markdown: string, field: string): void {
  if (
    markdown.includes("!") ||
    markdown.includes("\uFF01") ||
    markdown.includes("\r") ||
    /\blorem\b/i.test(markdown)
  ) {
    throw new SectionsError(`${field} contained a forbidden mark.`);
  }
}

export function planSections(input: {
  pages: PageInput[];
  assignments: Array<{ id: string; library: string; element: string }>;
  textFallbacks: Record<string, string>;
  effects?: EffectRequest[];
  answers?: {
    light?: string;
    type?: string;
    signature?: string;
  };
}): { sectionPlan: string; visual: string } {
  if (!isRecord(input)) {
    throw new SectionsError("planSections input must be an object.");
  }
  const pages = cleanPages(input.pages);
  const assignments = cleanAssignments(input.assignments);
  const fallbacks = cleanFallbacks(input.textFallbacks);
  const sections = buildSections(pages);
  const placed = placeEffects(sections, assignments, explicitEffects(input.effects));

  const blocks = sections.map((section) => {
    const effect = placed.get(section.id);
    const text = sectionText(section, effect, fallbacks);
    return renderSection(section, effect, text);
  });
  const sectionPlan = [
    "# SECTION-PLAN",
    "",
    "One effect per section. A heavy effect keeps a crawlable text line.",
    "",
    blocks.join("\n"),
  ].join("\n");
  const visual = renderVisual(cleanAnswers(input.answers));

  if (!sectionPlan.includes(`Slice: ${HERO_SLICE}`) || !visual.includes(HERO_SLICE)) {
    throw new SectionsError("The hero slice is missing.");
  }
  assertDoc(sectionPlan, "Section plan");
  assertDoc(visual, "Visual direction");
  return { sectionPlan, visual };
}
