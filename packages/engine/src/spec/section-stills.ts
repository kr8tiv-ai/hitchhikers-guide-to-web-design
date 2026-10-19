/**
 * Section stills planned from the art direction. No model call and no fetch.
 * A supplied image keeps the section. Every other section gets one concept slot.
 * Prompts share one art-direction block, word for word.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { translateBrief, type ArtAnswer, type ArtDirection } from "./art-direction.ts";
import type { PlannedPage } from "./brief-plan.ts";

export const SECTION_STILL_MODEL = "grok-imagine-image-2.0";

export const RESPONSIVE_WIDTHS = [640, 1280, 1920, 2560] as const;

export interface SuppliedStill {
  sectionId: string;
  file: string;
}

export interface SectionStillSlot {
  id: string;
  kind: "still";
  model: string;
  prompt: string;
  aspect: string;
  n: number;
  subjectIsReal: boolean;
  light: string;
  replaces?: string;
}

export interface SectionStillPlan {
  artBlock: string;
  kept: SuppliedStill[];
  slots: SectionStillSlot[];
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);

export function sharedArtBlock(art: ArtDirection): string {
  return [art.concept, art.mood, art.light, art.colorGrade, art.typeVoice, art.motionCharacter]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stillPath(sectionId: string): string {
  return `src/assets/generated/${sectionId}.webp`;
}

export function planSectionStills(input: {
  sections: readonly string[];
  art: ArtDirection;
  supplied?: readonly SuppliedStill[];
  realSectionIds?: readonly string[];
}): SectionStillPlan {
  const artBlock = sharedArtBlock(input.art);
  const supplied = new Map<string, SuppliedStill>();
  for (const item of input.supplied ?? []) {
    if (!supplied.has(item.sectionId)) supplied.set(item.sectionId, item);
  }
  const real = new Set(input.realSectionIds ?? []);
  const kept: SuppliedStill[] = [];
  const slots: SectionStillSlot[] = [];
  const seen = new Set<string>();
  for (const sectionId of input.sections) {
    if (sectionId.trim() === "" || seen.has(sectionId)) continue;
    seen.add(sectionId);
    const owned = supplied.get(sectionId);
    if (owned !== undefined) {
      kept.push(owned);
      continue;
    }
    const hero = sectionId === "hero" || sectionId.endsWith("-hero");
    const aspect = hero ? "16:9" : "3:2";
    const slot: SectionStillSlot = {
      id: sectionId,
      kind: "still",
      model: SECTION_STILL_MODEL,
      prompt: stillPrompt(sectionId, input.art, artBlock, aspect),
      aspect,
      n: 1,
      subjectIsReal: real.has(sectionId),
      light: input.art.light,
    };
    if (real.has(sectionId)) slot.replaces = sectionId;
    slots.push(slot);
  }
  return { artBlock, kept, slots };
}

export function stillPrompt(sectionId: string, art: ArtDirection, artBlock: string, aspect: string): string {
  const subject = `a concept still for the ${sectionId} section, not a specific real person, place, product, or listing`;
  return [
    `Subject: ${subject}.`,
    "Details and camera: 50mm lens, quiet framing, no text and no watermark.",
    `Art direction: ${artBlock}`,
    `Light: ${art.light}`,
    `Color: ${art.colorGrade}`,
    `Composition: ${aspect} frame for ${sectionId}.`,
  ].join("\n");
}

export function findSuppliedStills(
  projectDir: string,
  brief: string,
  sections: readonly string[],
): SuppliedStill[] {
  const files = listImages(projectDir);
  const found: SuppliedStill[] = [];
  const used = new Set<string>();
  for (const sectionId of sections) {
    const match = files.find((file) => file.toLowerCase().includes(sectionId.toLowerCase()) && !used.has(file));
    if (match === undefined) continue;
    used.add(match);
    found.push({ sectionId, file: match });
  }
  const heroFree = sections.includes("hero") && !found.some((item) => item.sectionId === "hero");
  const ownHero = /own hero|supplied hero|my hero/i.test(brief);
  const spare = files.find((file) => !used.has(file));
  if (heroFree && ownHero && spare !== undefined) found.push({ sectionId: "hero", file: spare });
  return found;
}

export function writeSectionStillPlan(
  projectDir: string,
  brief: string,
  answers: readonly ArtAnswer[],
  pages: readonly PlannedPage[],
): SectionStillPlan {
  const sections = pages.flatMap((page) => page.sections);
  const art = translateBrief(brief, answers, sections);
  const plan = planSectionStills({
    sections,
    art,
    supplied: findSuppliedStills(projectDir, brief, sections),
  });
  const dir = path.join(projectDir, ".hitchhiker", "assets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "slots.json"), `${JSON.stringify({ slots: plan.slots }, null, 2)}\n`, "utf8");
  const assetsPath = path.join(projectDir, ".hitchhiker", "ASSETS.md");
  if (!exists(assetsPath)) writeFileSync(assetsPath, renderAssetTable(plan), "utf8");
  return plan;
}

function renderAssetTable(plan: SectionStillPlan): string {
  const lines = [
    "| slot | source | file | cost | approved | license | status | grade | job |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const kept of plan.kept) {
    lines.push(`| ${kept.sectionId} | upload | ${kept.file} | 0 | yes | owner | ready |  |  |`);
  }
  for (const slot of plan.slots) {
    lines.push(`| ${slot.id} | imagine | ${stillPath(slot.id)} | 0 | yes | generated | planned |  |  |`);
  }
  lines.push("");
  return lines.join("\n");
}

function exists(file: string): boolean {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
}

function listImages(root: string): string[] {
  const roots = ["public", path.join("src", "assets"), path.join(".hitchhiker", "uploads")];
  const found: string[] = [];
  for (const rel of roots) {
    walk(path.join(root, rel), root, found);
  }
  return found.sort();
}

function walk(dir: string, root: string, into: string[]): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "generated" || entry.name === "node_modules") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, root, into);
      continue;
    }
    if (!IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (!rel.startsWith("..")) into.push(rel);
  }
}
