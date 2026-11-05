/**
 * Hero-variant structure gate (245f).
 *
 * checkVariantStructure lives in the design-system package, beside the
 * structure exports. This module turns built HTML and variants.json into
 * that call. The engine cannot open the CDP browser (that dependency sits
 * on qa), so the close reads the built markup: data attributes, inline
 * size, and the known hero classes. The qa probe measures the same facts
 * at 375 and 1440 and calls judgeVariantStructure.
 *
 * A hero with no data-variant fails. DESIGN.md opts out only when Signature
 * techniques names a signature structure for that section. The close then
 * checks the facts written there, when any are written, and logs signature mode.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  SLOT_NAMES,
  checkVariantStructure,
  structureForSection,
  type LayoutFact,
  type SlotName,
  type StructureBreach,
  type StructureMeasure,
  type VariantStructure,
  type VariantStructureFacts,
} from "@hitchhiker/design-system";
import { distHtmlForOwnedSource } from "./visible-copy.ts";
import { readVariantRanking, type VariantRecord } from "./variant-rank.ts";

export const STRUCTURE_WIDTHS = [375, 1440] as const;

const FILE_CAP = 2_000_000;

const SECTION_KINDS = [
  "hero",
  "feature",
  "gallery",
  "quote",
  "cta",
  "steps",
  "listing",
  "faq",
  "contact",
  "footer",
  "nav",
] as const;

export interface NamedSignature {
  section: string;
  /** Null when the line names a structure and describes no facts. */
  structure: VariantStructure | null;
}

export interface BuiltPageSection {
  facts: VariantStructureFacts;
  page: string;
  missing?: boolean;
}

export interface VariantStructureJudgement {
  ok: boolean;
  mode: "variant" | "signature";
  signatureSections: readonly string[];
  breaches: readonly StructureBreach[];
  reason: string;
  log: string;
}

export interface VariantStructureCloseResult {
  reason: string;
  log: string;
}

interface RawSection {
  name: string;
  attrs: string;
  inner: string;
}

export function signatureStructures(designMd: string): NamedSignature[] {
  // Signature techniques is the heading writeDesignMd emits. It is not in
  // DESIGN_SECTION_ORDER (that list says Signature moments), so the canonical
  // section reader returns nothing for it.
  const lines = signatureTechniquesBody(designMd).split("\n");
  const found: NamedSignature[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line === "" || !/signature structure/i.test(line)) continue;
    const chunk = [line];
    while (index + 1 < lines.length) {
      const follow = lines[index + 1]?.trim() ?? "";
      if (follow === "" || /signature structure/i.test(follow)) break;
      chunk.push(follow);
      index += 1;
    }
    const text = chunk.join(" ");
    const section = sectionNamed(text);
    if (section === null || found.some((item) => item.section === section)) continue;
    found.push({ section, structure: structureFromSignature(text) });
  }
  return found;
}

/** Slots, order, and layout facts read off built markup at the given widths. */
export function readStructureDocument(html: string, widths: readonly number[]): VariantStructureFacts[] {
  return findSections(html).map((section) => {
    const variant = attr(section.attrs, "data-variant");
    return {
      section: section.name,
      variant: variant === null || variant.trim() === "" ? null : variant.trim(),
      slots: slotNames(section.inner),
      measures: widths.map((width) => measureSection(section, width)),
    };
  });
}

/** Join per-width snapshots of the same sections into one facts list. */
export function mergeStructureFacts(
  groups: readonly { width: number; sections: readonly VariantStructureFacts[] }[],
): VariantStructureFacts[] {
  const order: string[] = [];
  const bySection = new Map<string, VariantStructureFacts>();
  const sorted = [...groups].sort((left, right) => left.width - right.width);
  for (const group of sorted) {
    for (const section of group.sections) {
      const key = section.section.trim().toLowerCase();
      const existing = bySection.get(key);
      if (existing === undefined) {
        order.push(key);
        bySection.set(key, {
          section: key,
          variant: section.variant,
          slots: [...section.slots],
          measures: [...section.measures],
        });
        continue;
      }
      const next: VariantStructureFacts = {
        section: key,
        variant: section.variant ?? existing.variant,
        slots: section.slots.length > 0 ? [...section.slots] : existing.slots,
        measures: [...existing.measures, ...section.measures],
      };
      bySection.set(key, next);
    }
  }
  const merged: VariantStructureFacts[] = [];
  for (const key of order) {
    const section = bySection.get(key);
    if (section !== undefined) merged.push(section);
  }
  return merged;
}

export function judgeVariantStructure(input: {
  designMd: string;
  ranking: readonly VariantRecord[] | null;
  built: readonly BuiltPageSection[];
}): VariantStructureJudgement {
  const signatures = signatureStructures(input.designMd);
  const breaches: StructureBreach[] = [];
  const signatureSections: string[] = [];
  for (const item of input.built) {
    if (item.missing === true) {
      breaches.push({
        section: "hero",
        fact: "hero",
        actual: "missing",
        expected: "[data-section=hero]",
        detail: "No [data-section=hero] at 375 and 1440.",
      });
      continue;
    }
    judgeSection(item, signatures, input.ranking, breaches, signatureSections);
  }
  const unique = [...new Set(signatureSections)];
  const log =
    unique.length === 0 ? "" : `Variant structure gate ran in signature mode for ${unique.join(", ")}.`;
  const shown = breaches.slice(0, 8).map(breachText);
  return {
    ok: breaches.length === 0,
    mode: unique.length > 0 ? "signature" : "variant",
    signatureSections: unique,
    breaches,
    reason: shown.length === 0 ? "" : `Variant structure failed. ${shown.join(" ")}`,
    log,
  };
}

export function judgeProjectStructure(
  projectDir: string,
  built: readonly BuiltPageSection[],
): VariantStructureJudgement {
  return judgeVariantStructure({
    designMd: readDesign(projectDir),
    ranking: readVariantRanking(projectDir),
    built,
  });
}

/**
 * Per-prompt close. Empty when this prompt does not own a built page that
 * has a hero or a section with a declared structure. The caller logs `log`
 * when signature mode ran.
 */
export function variantStructureClose(
  projectDir: string,
  promptText: string,
  files: readonly string[] = [],
): VariantStructureCloseResult {
  const built = builtSections(projectDir, promptText, files);
  if (built.length === 0) return { reason: "", log: "" };
  const judgement = judgeProjectStructure(projectDir, built);
  return { reason: judgement.reason, log: judgement.log };
}

function judgeSection(
  item: BuiltPageSection,
  signatures: readonly NamedSignature[],
  ranking: readonly VariantRecord[] | null,
  breaches: StructureBreach[],
  signatureSections: string[],
): void {
  const section = item.facts.section.trim().toLowerCase();
  const signature = signatures.find((entry) => entry.section === section) ?? null;
  const row = rowFor(ranking, item.page, section);
  const variant = item.facts.variant?.trim() ?? "";
  const declared = variant === "" ? null : structureForSection(section, variant);
  if (variant === "") {
    if (signature !== null) {
      signatureSections.push(section);
      if (signature.structure !== null) {
        breaches.push(...checkVariantStructure(item.facts, signature.structure).breaches);
      }
      return;
    }
    if (section === "hero") {
      breaches.push({
        section,
        fact: "data-variant",
        actual: "none",
        expected: row?.variant ?? "a data-variant",
        detail: "The hero has no data-variant.",
      });
    }
    return;
  }
  if ((section === "hero" || declared !== null) && row !== null && row.variant !== variant) {
    breaches.push({
      section,
      fact: "data-variant",
      actual: variant,
      expected: row.variant,
      detail: `data-variant is ${variant}. variants.json declares ${row.variant}.`,
    });
    return;
  }
  if (declared === null) {
    if (section === "hero") {
      breaches.push({
        section,
        fact: "data-variant",
        actual: variant,
        expected: "a known hero variant",
        detail: `data-variant is ${variant}, which has no structure.`,
      });
    }
    return;
  }
  breaches.push(...checkVariantStructure(item.facts, declared).breaches);
}

function builtSections(projectDir: string, promptText: string, files: readonly string[]): BuiltPageSection[] {
  const owned = listedFiles(promptText, files);
  const distRels = new Set<string>();
  for (const rel of owned) {
    for (const html of distTargets(rel)) distRels.add(html);
  }
  if (distRels.size === 0) return [];
  const design = readDesign(projectDir);
  const ranking = readVariantRanking(projectDir);
  const built: BuiltPageSection[] = [];
  for (const rel of distRels) {
    const page = slugFromDist(rel);
    const html = readDistOrSource(projectDir, rel, owned);
    if (html === null) continue;
    const sections = readStructureDocument(html, STRUCTURE_WIDTHS);
    if (!sections.some((section) => section.section === "hero") && expectsHero(design, ranking, page)) {
      built.push({
        facts: { section: "hero", variant: null, slots: [], measures: [] },
        page,
        missing: true,
      });
    }
    for (const facts of sections) built.push({ facts, page });
  }
  return built;
}

function expectsHero(designMd: string, ranking: readonly VariantRecord[] | null, page: string): boolean {
  if (rowFor(ranking, page, "hero") !== null) return true;
  return page === "home" && signatureStructures(designMd).some((item) => item.section === "hero");
}

function readDistOrSource(projectDir: string, distRel: string, owned: readonly string[]): string | null {
  const dist = readCapped(path.join(projectDir, "dist", distRel));
  if (dist !== null) return dist;
  const source = owned.find((file) => distTargets(file).includes(distRel) && !file.replace(/\\/g, "/").startsWith("dist/"));
  if (source === undefined) return null;
  const text = readCapped(path.join(projectDir, source));
  if (text === null || !text.includes("data-section")) return null;
  return text;
}

function distTargets(rel: string): string[] {
  const norm = rel.replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm.startsWith(".hitchhiker/")) return [];
  if (norm.startsWith("dist/") && /\.html?$/i.test(norm)) return [norm.slice("dist/".length)];
  const mapped = distHtmlForOwnedSource(norm);
  if (mapped.length > 0) return mapped;
  // vite-react home is World.tsx. The shared dist mapper does not know that file.
  if (/(?:^|\/)world\/world\.tsx$/i.test(norm)) return ["index.html"];
  if (/(?:^|\/)hero\.(astro|tsx|jsx|svelte|vue)$/i.test(norm)) return ["index.html"];
  return [];
}

function listedFiles(promptText: string, changed: readonly string[]): string[] {
  const found = new Set<string>();
  const match = /^Files:\s*(.+)$/m.exec(promptText);
  const raw = match?.[1]?.trim() ?? "";
  if (raw !== "" && raw.toLowerCase() !== "none") {
    for (const part of raw.split(",")) {
      const rel = safeRelative(part.trim());
      if (rel !== null) found.add(rel);
    }
  }
  for (const rel of changed) {
    const safe = safeRelative(rel);
    if (safe !== null) found.add(safe);
  }
  return [...found];
}

function safeRelative(value: string): string | null {
  const norm = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (norm === "" || norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null;
  if (norm.split("/").some((part) => part === ".." || part === "")) return null;
  return norm;
}

function readDesign(projectDir: string): string {
  const file = path.join(projectDir, "DESIGN.md");
  if (!existsSync(file)) return "";
  return readCapped(file) ?? "";
}

function readCapped(file: string): string | null {
  try {
    if (!statSync(file).isFile() || statSync(file).size > FILE_CAP) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugFromDist(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/\/index\.html?$/i, "").replace(/\.html?$/i, "");
  if (norm === "" || norm.toLowerCase() === "index") return "home";
  const last = norm.split("/").filter((part) => part !== "").pop() ?? "home";
  return slug(last);
}

function rowFor(ranking: readonly VariantRecord[] | null, page: string, section: string): VariantRecord | null {
  if (ranking === null) return null;
  const sectionName = slug(section);
  const pageName = slug(page);
  const rows = ranking.filter((row) => slug(row.section) === sectionName);
  const exact = rows.find((row) => slug(row.page) === pageName);
  if (exact !== undefined) return exact;
  if (rows.length === 1) return rows[0] ?? null;
  return null;
}

function sectionNamed(text: string): string | null {
  const targeted = /signature structure(?:\s+for)?(?:\s+the)?\s+([a-z][a-z-]*)/i.exec(text);
  if (targeted?.[1] !== undefined && isKind(targeted[1])) return targeted[1].toLowerCase();
  for (const kind of SECTION_KINDS) {
    if (new RegExp(`\\b${kind}\\b`, "i").test(text)) return kind;
  }
  return null;
}

function isKind(value: string): boolean {
  return (SECTION_KINDS as readonly string[]).includes(value.toLowerCase());
}

function structureFromSignature(text: string): VariantStructure | null {
  const layout: LayoutFact[] = [];
  const cover = /covers (?:at least )?(\d+(?:\.\d+)?)%\s+of the viewport at (\d+)/i.exec(text);
  if (cover?.[1] !== undefined && cover[2] !== undefined) {
    const percent = Number(cover[1]);
    const at = Number(cover[2]);
    layout.push({
      kind: "media-cover",
      at,
      minFraction: percent / 100,
      slot: "media",
      detail: `Media covers at least ${percent}% of the viewport at ${at}.`,
    });
  }
  const unequal = /unequal widths at (\d+)|two columns with unequal widths at (\d+)|unequal columns(?: at (\d+))?/i.exec(text);
  if (unequal !== null) {
    const raw = unequal[1] ?? unequal[2] ?? unequal[3] ?? "1024";
    const width = Number(raw);
    layout.push({
      kind: "unequal-columns",
      minWidth: Number.isFinite(width) ? width : 1024,
      columns: 2,
      detail: "Two columns with unequal widths.",
    });
  }
  if (/\b(?:centred|centered)\b/i.test(text)) {
    layout.push({
      kind: "centred-reveal",
      progressive: /\bprogressive\b/i.test(text),
      detail: "Centred statement with a progressive reveal.",
    });
  }
  if (/\b(?:horizontal|marquee)\b/i.test(text)) {
    layout.push({ kind: "horizontal", detail: "Horizontal marquee." });
  }
  if (/extreme (?:display )?type/i.test(text)) {
    layout.push({ kind: "extreme-type", slot: "title", detail: "The title is extreme display type." });
  }
  const layers = /(\d+)\s+layers/i.exec(text);
  if (layers?.[1] !== undefined) {
    layout.push({
      kind: "layered-depth",
      layers: Number(layers[1]),
      detail: `${layers[1]} layers occupy one cell.`,
    });
  }
  const required = slotList(text, "required slots?");
  const order = slotList(text, "order");
  if (layout.length === 0 && required === null && order === null) return null;
  return {
    variant: "signature",
    requiredSlots: required ?? [],
    elementOrder: order ?? required ?? [],
    layout,
  };
}

function slotList(text: string, label: string): SlotName[] | null {
  const match = new RegExp(`(?:^|[\\n.])\\s*${label}\\s*:\\s*([^\\n.]+)`, "i").exec(text);
  if (match?.[1] === undefined) return null;
  const names: SlotName[] = [];
  for (const part of match[1].split(/[, ]+/)) {
    const name = part.trim().toLowerCase().replace(/[^a-z-]/g, "");
    if (!isSlotName(name) || names.includes(name)) continue;
    names.push(name);
  }
  return names.length > 0 ? names : null;
}

function isSlotName(value: string): value is SlotName {
  return (SLOT_NAMES as readonly string[]).includes(value);
}

function findSections(html: string): RawSection[] {
  const tags: { name: string; attrs: string; start: number; innerStart: number }[] = [];
  const re = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  for (let match = re.exec(html); match !== null; match = re.exec(html)) {
    const attrs = match[2] ?? "";
    const section = attr(attrs, "data-section");
    if (section === null || section.trim() === "") continue;
    tags.push({
      name: section.trim().toLowerCase(),
      attrs,
      start: match.index,
      innerStart: re.lastIndex,
    });
  }
  return tags.map((tag, index) => {
    const next = tags[index + 1];
    const end = next === undefined ? html.length : next.start;
    return { name: tag.name, attrs: tag.attrs, inner: html.slice(tag.innerStart, end) };
  });
}

function measureSection(section: RawSection, width: number): StructureMeasure {
  const measure: StructureMeasure = { width };
  const className = attr(section.attrs, "class") ?? "";
  applyClass(measure, className, section.inner);
  if ((attr(section.attrs, "data-recipe") ?? "") === "reveal") measure.progressive = true;
  applyInline(measure, section);
  applyData(measure, section.attrs);
  applyData(measure, slotAttrs(section.inner, "media"));
  return measure;
}

function applyClass(measure: StructureMeasure, className: string, inner: string): void {
  if (className.includes("hh-hero--cinematic")) measure.mediaCover = 1;
  if (className.includes("hh-hero--split-editorial") && measure.width >= 1024) {
    measure.columnFractions = [1.35 / 2, 0.65 / 2];
  }
  if (className.includes("hh-hero--statement")) {
    measure.centred = true;
    measure.progressive = true;
  }
  if (className.includes("hh-hero--marquee")) measure.horizontal = true;
  if (className.includes("hh-hero--monument")) measure.titleFontPx = Math.max(measure.width * 0.18, 96);
  if (className.includes("hh-hero--object")) measure.imageFallback = true;
  if (className.includes("hh-hero--layered-depth")) measure.layers = 3;
  if (/<img\b/i.test(inner)) measure.imageFallback = true;
  if (/<canvas\b/i.test(inner)) measure.webgl = true;
}

function applyInline(measure: StructureMeasure, section: RawSection): void {
  const mediaStyle = attr(slotAttrs(section.inner, "media"), "style") ?? "";
  const cover = coverFromStyle(mediaStyle);
  if (cover !== null) measure.mediaCover = cover;
  const columns = columnsFromStyle(attr(section.attrs, "style") ?? "");
  if (columns !== undefined) measure.columnFractions = columns;
}

function applyData(measure: StructureMeasure, attrs: string): void {
  if (attrs === "") return;
  const cover = widthAttr(attrs, "data-media-cover", measure.width);
  if (cover !== null) {
    const value = parseCover(cover);
    if (value !== null) measure.mediaCover = value;
  }
  const columns = widthAttr(attrs, "data-column-fractions", measure.width);
  if (columns !== null) {
    const fractions = parseFractions(columns);
    if (fractions !== undefined) measure.columnFractions = fractions;
  }
  const centred = flag(widthAttr(attrs, "data-centred", measure.width));
  if (centred !== undefined) measure.centred = centred;
  const progressive = flag(widthAttr(attrs, "data-progressive", measure.width));
  if (progressive !== undefined) measure.progressive = progressive;
  const horizontal = flag(widthAttr(attrs, "data-horizontal", measure.width));
  if (horizontal !== undefined) measure.horizontal = horizontal;
  const title = widthAttr(attrs, "data-title-font", measure.width);
  if (title !== null) {
    const value = Number(title);
    if (Number.isFinite(value)) measure.titleFontPx = value;
  }
  const layers = widthAttr(attrs, "data-layers", measure.width);
  if (layers !== null) {
    const value = Number(layers);
    if (Number.isFinite(value)) measure.layers = value;
  }
  const image = flag(widthAttr(attrs, "data-image-fallback", measure.width));
  if (image !== undefined) measure.imageFallback = image;
  const webgl = flag(widthAttr(attrs, "data-webgl", measure.width));
  if (webgl !== undefined) measure.webgl = webgl;
  if (attr(attrs, "data-object-fallback") === "image") measure.imageFallback = true;
}

function widthAttr(attrs: string, base: string, width: number): string | null {
  return attr(attrs, `${base}-${width}`) ?? attr(attrs, base);
}

function coverFromStyle(style: string): number | null {
  const height = /(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)vh/i.exec(style);
  if (height?.[1] === undefined) return null;
  const width = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)%/i.exec(style);
  const widthFrac = width?.[1] === undefined ? 1 : Number(width[1]) / 100;
  return (Number(height[1]) / 100) * widthFrac;
}

function columnsFromStyle(style: string): number[] | undefined {
  const match = /grid-template-columns\s*:\s*([^;]+)/i.exec(style);
  if (match?.[1] === undefined) return undefined;
  const values: number[] = [];
  const token = /minmax\(\s*0\s*,\s*(\d+(?:\.\d+)?)fr\s*\)|(\d+(?:\.\d+)?)fr|(\d+(?:\.\d+)?)px/gi;
  for (let found = token.exec(match[1]); found !== null; found = token.exec(match[1])) {
    const raw = found[1] ?? found[2] ?? found[3];
    if (raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) values.push(value);
  }
  return parseFractionValues(values);
}

/** Body under `## Signature techniques`, after any front matter. */
function signatureTechniquesBody(markdown: string): string {
  const lines = markdownBody(markdown).split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1]?.toLowerCase() === "signature techniques") {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return "";
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n");
}

function markdownBody(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return markdown;
  return markdown.slice(end + 5);
}

function parseCover(value: string): number | null {
  const number = Number(value.trim().replace(/%$/, ""));
  if (!Number.isFinite(number) || number < 0) return null;
  if (value.includes("%") || number > 1) return number / 100;
  return number;
}

function parseFractions(value: string): number[] | undefined {
  const parts = value
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part) && part > 0);
  return parseFractionValues(parts);
}

function parseFractionValues(values: readonly number[]): number[] | undefined {
  if (values.length < 2) return undefined;
  const sum = values.reduce((total, part) => total + part, 0);
  if (sum <= 0) return undefined;
  if (sum > 1.2) return values.map((part) => part / sum);
  return [...values];
}

function flag(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (/^(1|true|yes)$/i.test(value.trim())) return true;
  if (/^(0|false|no)$/i.test(value.trim())) return false;
  return undefined;
}

function slotNames(inner: string): string[] {
  const names: string[] = [];
  const re = /\bdata-slot\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (let match = re.exec(inner); match !== null; match = re.exec(inner)) {
    const name = (match[2] ?? match[3] ?? "").trim();
    if (name !== "") names.push(name);
  }
  return names;
}

function slotAttrs(inner: string, slot: string): string {
  const re = new RegExp(`<[a-zA-Z][\\w:-]*\\b([^>]*\\bdata-slot\\s*=\\s*(["'])${slot}\\2[^>]*)>`, "i");
  return re.exec(inner)?.[1] ?? "";
}

function attr(source: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(source);
  if (match === null) return null;
  return match[2] ?? match[3] ?? "";
}

function breachText(breach: StructureBreach): string {
  return `${breach.section} ${breach.fact}: ${breach.detail} Actual ${breach.actual}. Expected ${breach.expected}.`;
}
