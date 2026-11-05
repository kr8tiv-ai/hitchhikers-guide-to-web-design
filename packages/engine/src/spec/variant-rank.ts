/**
 * Section variant ranking written after a direction pick.
 * Style world is styleWorldFrom on the brief plus the picked direction.
 * Sections come from .hitchhiker/sitemap.md. A missing sitemap records Home / hero.
 * The file is a list of { page, section, variant, alternatives, reason }.
 * alternatives are the other ranks, each with a one-line reason.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rankVariants, sectionKindFor, type RankedVariant } from "@hitchhiker/design-system";
import { styleWorldFrom } from "./art-direction.ts";

export const VARIANTS_REL = ".hitchhiker/design/variants.json";

export interface VariantAlternative {
  id: string;
  reason: string;
}

export interface VariantRecord {
  page: string;
  section: string;
  variant: string;
  alternatives: VariantAlternative[];
  reason: string;
}

export interface VariantDirection {
  name: string;
  description: string;
}

interface SitemapPage {
  title: string;
  sections: string[];
}

export function writeVariantRanking(projectDir: string, direction: VariantDirection): VariantRecord[] {
  const brief = readBrief(projectDir);
  const directionText = [direction.name, direction.description]
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "")
    .join(". ");
  const world = styleWorldFrom(`${brief}\n${directionText}`);
  const records: VariantRecord[] = [];
  for (const page of readPages(projectDir)) {
    for (const section of page.sections) {
      const ranked = rankVariants(world, directionText, sectionKindFor(section), brief);
      const winner = ranked[0];
      if (winner === undefined) continue;
      records.push({
        page: page.title,
        section,
        variant: winner.id,
        alternatives: ranked.slice(1).map(toAlternative),
        reason: winner.reason,
      });
    }
  }
  const file = path.join(projectDir, VARIANTS_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records;
}

export function readVariantRanking(projectDir: string): VariantRecord[] | null {
  const file = path.join(projectDir, VARIANTS_REL);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed) ? parsed : rowsOf(parsed);
  if (rows === null) return null;
  const records: VariantRecord[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (record === null) return null;
    records.push(record);
  }
  return records;
}

/** Desk fragment. Empty when no ranking has been written. */
export function variantRankingHtml(projectDir: string): string {
  const rows = readVariantRanking(projectDir);
  if (rows === null || rows.length === 0) return "";
  const items = rows
    .map((row) => {
      const alts = row.alternatives.map((item) => escapeHtml(item.id)).join(", ");
      const altText = alts === "" ? "" : ` Alternatives: ${alts}.`;
      return `<li data-variant-pick data-page="${escapeHtml(row.page)}" data-section="${escapeHtml(row.section)}" data-variant="${escapeHtml(row.variant)}">${escapeHtml(row.page)} ${escapeHtml(row.section)}: ${escapeHtml(row.variant)}. ${escapeHtml(row.reason)}${altText}</li>`;
    })
    .join("");
  return `<aside data-variant-ranking><h3>Section variants</h3><ul>${items}</ul></aside>`;
}

function toAlternative(ranked: RankedVariant): VariantAlternative {
  return { id: ranked.id, reason: ranked.reason };
}

function readBrief(projectDir: string): string {
  const file = path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md");
  if (!existsSync(file)) return "";
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function readPages(projectDir: string): SitemapPage[] {
  const file = path.join(projectDir, ".hitchhiker", "sitemap.md");
  if (!existsSync(file)) return [{ title: "Home", sections: ["hero"] }];
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [{ title: "Home", sections: ["hero"] }];
  }
  const pages = parseSitemap(text);
  if (pages.length === 0) return [{ title: "Home", sections: ["hero"] }];
  return pages.map((page) => ({
    title: page.title,
    sections: page.sections.length > 0 ? page.sections : [fallbackSection(page.title)],
  }));
}

function parseSitemap(text: string): SitemapPage[] {
  const pages: SitemapPage[] = [];
  let current: SitemapPage | null = null;
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (/^##\s+(?:footer|primary)\b/i.test(trimmed)) {
      current = null;
      continue;
    }
    if (/^- /.test(line)) {
      const match = /^- (.+?) at (\S+)\s*$/.exec(trimmed);
      if (match?.[1] === undefined) continue;
      current = { title: match[1].trim(), sections: [] };
      pages.push(current);
      continue;
    }
    if (current !== null && /^\s+-\s+/.test(line)) current.sections.push(line.replace(/^\s+-\s+/, "").trim());
  }
  return pages;
}

function fallbackSection(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "" || slug === "home") return "hero";
  if (slug === "contact") return "contact";
  return slug;
}

function rowsOf(value: unknown): unknown[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.picks)) return record.picks;
  if (Array.isArray(record.variants)) return record.variants;
  return null;
}

function asRecord(value: unknown): VariantRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.page !== "string" || row.page.trim() === "") return null;
  if (typeof row.section !== "string" || row.section.trim() === "") return null;
  if (typeof row.variant !== "string" || row.variant.trim() === "") return null;
  if (!Array.isArray(row.alternatives)) return null;
  const alternatives: VariantAlternative[] = [];
  for (const item of row.alternatives) {
    if (typeof item === "string" && item.trim() !== "") {
      alternatives.push({ id: item.trim(), reason: "" });
      continue;
    }
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const alt = item as Record<string, unknown>;
    if (typeof alt.id !== "string" || alt.id.trim() === "") return null;
    alternatives.push({ id: alt.id.trim(), reason: typeof alt.reason === "string" ? alt.reason : "" });
  }
  return {
    page: row.page.trim(),
    section: row.section.trim(),
    variant: row.variant.trim(),
    alternatives,
    reason: typeof row.reason === "string" ? row.reason : "",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
