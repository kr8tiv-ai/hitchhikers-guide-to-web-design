/**
 * Three directions from pages the desk has already studied (BUG-055 idea 4).
 * Each direction cites a real library entry. A deal that shares one type pair
 * and one section order is only a hue change, and it fails. No ingest.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packagedPath } from "../packaged-dir.ts";
import { DecisionLogError, recordDirectionChoice, rejectedDirectionNames } from "./decision-canvas.ts";
import { isOverusedFamily } from "./tokens.ts";
import { winsSentence } from "./type-conflict.ts";
import { TYPE_LIBRARY, type TypePairing } from "./type-library.ts";
import { familiesSentence } from "./type-scale.ts";

export interface StudiedPage {
  id: string;
  title: string;
  url: string;
  styleWorld: string;
  sectionTypes: readonly string[];
}

export interface Direction {
  id: string;
  name: string;
  /** One line a person can read. Empty on a deal saved before this field existed. */
  description: string;
  citationId: string;
  title: string;
  url: string;
  display: string;
  body: string;
  sectionOrder: readonly string[];
  hue: string;
}

export interface DirectionDeal {
  directions: readonly Direction[];
  pickedId: string | null;
}

export interface DirectionCheck {
  pass: boolean;
  failure: string;
}

const HUES = ["#1f6b4a", "#8c4a2f", "#1d4e89"] as const;

/** Factual line for a direction the person saw and did not pick. Not a taste invented for them. */
const SHOWN_NOT_PICKED = "Shown and not picked.";

const WORLD_ALIAS: Record<string, string> = {
  "minimal-luxury": "editorial",
  "scroll-film": "editorial",
};

export function designLibraryRoot(): string {
  return path.join(packagedPath(["knowledge"], "packs"), "design-library");
}

/**
 * Docs hosts, framework guides, and gallery listing pages are knowledge packs.
 * A direction may cite a studied site. It may not cite the documentation of a tool.
 */
export function isDocsOrPackUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pathName = parsed.pathname.toLowerCase();
  if (host.startsWith("docs.")) return true;
  const packHost =
    host === "astro.build" ||
    host.endsWith(".astro.build") ||
    host === "nextjs.org" ||
    host.endsWith(".nextjs.org") ||
    host === "vitejs.dev" ||
    host.endsWith(".vitejs.dev") ||
    host === "gsap.com" ||
    host.endsWith(".gsap.com") ||
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "threejs.org" ||
    host.endsWith(".threejs.org") ||
    host === "developer.chrome.com" ||
    host.endsWith(".chrome.com") ||
    host.endsWith(".pmnd.rs") ||
    host === "tympanus.net" ||
    host.endsWith(".tympanus.net") ||
    host === "stitch.withgoogle.com" ||
    host === "framer.com" ||
    host.endsWith(".framer.com");
  if (packHost) return true;
  if (host === "awwwards.com" && (pathName.startsWith("/websites") || pathName.startsWith("/sites"))) return true;
  if (
    pathName === "/docs" ||
    pathName.startsWith("/docs/") ||
    pathName.includes("/guides/") ||
    pathName.startsWith("/guides") ||
    pathName.includes("/knowledge/") ||
    pathName.includes("knowledge-pack")
  ) {
    return true;
  }
  return false;
}

/** Gallery sites, named design references, and a custom library that is not a docs pack. */
export function loadDesignReferences(root?: string, projectDir?: string): StudiedPage[] {
  const libraryRoot = root === undefined || root.trim() === "" ? designLibraryRoot() : root;
  if (path.resolve(libraryRoot) !== path.resolve(designLibraryRoot())) {
    return loadStudiedPages(libraryRoot).filter((page) => !isDocsOrPackUrl(page.url));
  }
  const pages: StudiedPage[] = [];
  const seen = new Set<string>();
  const add = (page: StudiedPage): void => {
    if (isDocsOrPackUrl(page.url) || seen.has(page.id)) return;
    seen.add(page.id);
    pages.push(page);
  };
  for (const page of namedReferencePages()) add(page);
  for (const page of loadGalleryPages()) add(page);
  for (const page of loadStudiedPages(designLibraryRoot())) add(page);
  for (const page of customerReferencePages(projectDir)) add(page);
  return pages;
}

export function loadStudiedPages(root = designLibraryRoot()): StudiedPage[] {
  const indexPath = path.join(root, "index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as { entries?: unknown };
  const ids = Array.isArray(index.entries) ? index.entries.filter((item): item is string => typeof item === "string") : [];
  const pages: StudiedPage[] = [];
  for (const id of ids) {
    const raw = JSON.parse(readFileSync(path.join(root, "entries", `${id}.json`), "utf8")) as Record<string, unknown>;
    if (raw.retired === true) continue;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    const styleWorld = typeof raw.styleWorld === "string" ? raw.styleWorld.trim() : "";
    const sectionTypes = Array.isArray(raw.sectionTypes)
      ? raw.sectionTypes.filter((item): item is string => typeof item === "string" && item.trim() !== "")
      : [];
    const pageId = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim() : id;
    if (title === "" || url === "" || sectionTypes.length === 0) continue;
    pages.push({ id: pageId, title, url, styleWorld, sectionTypes });
  }
  pages.sort((left, right) => left.id.localeCompare(right.id));
  return pages;
}

export function dealDirections(root?: string, projectDir?: string): DirectionDeal {
  const rejected = new Set(
    projectDir === undefined || projectDir.trim() === "" ? [] : rejectedDirectionNames(projectDir),
  );
  const pages = pagesForDeal(root, projectDir).filter(
    (page) => !rejected.has(page.title) && !rejected.has(page.moodName),
  );
  const chosen: ReferencePage[] = [];
  const seenOrders = new Set<string>();
  for (const page of pages) {
    const key = page.sectionTypes.join("|");
    if (seenOrders.has(key)) continue;
    seenOrders.add(key);
    chosen.push(page);
    if (chosen.length === 3) break;
  }
  for (const page of pages) {
    if (chosen.length === 3) break;
    if (chosen.some((item) => item.id === page.id)) continue;
    chosen.push(page);
  }
  if (chosen.length < 3) throw new Error("The studied library does not have three directions.");
  const used = new Set<number>();
  const directions = chosen.map((page, index) => {
    const pair = pairFor(page.styleWorld, used);
    used.add(pair.id);
    const hue = HUES[index] ?? "#1f6b4a";
    return {
      id: `dir-${page.id}`,
      name: page.moodName,
      description: page.description,
      citationId: page.id,
      title: page.title,
      url: page.url,
      display: pair.display,
      body: pair.body,
      sectionOrder: page.sectionTypes,
      hue,
    };
  });
  return { directions, pickedId: null };
}

export function checkDirectionDeal(deal: DirectionDeal, pages = loadDesignReferences()): DirectionCheck {
  if (deal.directions.length !== 3) {
    return { pass: false, failure: "A deal needs three directions." };
  }
  for (const direction of deal.directions) {
    const page = pages.find((item) => item.id === direction.citationId);
    if (page === undefined || page.title !== direction.title || page.url !== direction.url) {
      return { pass: false, failure: "A direction cites a page the desk has not studied." };
    }
  }
  const first = deal.directions[0];
  if (first === undefined) return { pass: false, failure: "A deal needs three directions." };
  const sameType = deal.directions.every((direction) => typeKey(direction) === typeKey(first));
  const sameSections = deal.directions.every((direction) => sectionKey(direction) === sectionKey(first));
  if (sameType && sameSections) {
    return { pass: false, failure: "The three directions differ only by hue." };
  }
  return { pass: true, failure: "" };
}

export function pickDirection(deal: DirectionDeal, id: string): DirectionDeal {
  if (!deal.directions.some((direction) => direction.id === id)) {
    throw new Error(`Unknown direction ${id}.`);
  }
  return { directions: deal.directions, pickedId: id };
}

export function directionDealPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "directions.json");
}

/** Persist the dealt set. This is not a decision-log row. */
export function saveDirectionDeal(projectDir: string, deal: DirectionDeal): void {
  const file = directionDealPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(deal, null, 2)}\n`, "utf8");
}

/** Null when no deal has been saved. A damaged file throws instead of looking like a new deal. */
export function readDirectionDeal(projectDir: string): DirectionDeal | null {
  const file = directionDealPath(projectDir);
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new DecisionLogError("directions.json is not a deal.");
  }
  const deal = asDeal(parsed);
  if (deal === null) throw new DecisionLogError("directions.json is not a deal.");
  return deal;
}

/**
 * Record a choice the person actually made against the deal on disk.
 * Rejected rows use a factual line. This function does not invent a pick.
 */
/** Registered by the design stages so a pick can refresh the style guide without a cycle. */
let afterDirectionPicked: ((projectDir: string) => void) | null = null;

export function onDirectionPicked(listener: (projectDir: string) => void): void {
  afterDirectionPicked = listener;
}

export function chooseDirection(
  projectDir: string,
  pickedId: string,
  reason: string,
  at = new Date().toISOString(),
): DirectionDeal {
  const id = pickedId.trim();
  const line = reason.trim();
  if (id === "") throw new DecisionLogError("A pick needs a direction.");
  if (line === "") throw new DecisionLogError("A pick needs a one-line reason.");
  const deal = readDirectionDeal(projectDir);
  if (deal === null) throw new DecisionLogError("No directions are on the desk. Deal a set before a pick.");
  if (!deal.directions.some((direction) => direction.id === id)) {
    throw new DecisionLogError(`Unknown direction ${id}.`);
  }
  const reasons: Record<string, string> = {};
  for (const direction of deal.directions) {
    reasons[direction.id] = direction.id === id ? line : SHOWN_NOT_PICKED;
  }
  recordDirectionChoice(projectDir, deal, id, reasons, at);
  const picked = pickDirection(deal, id);
  saveDirectionDeal(projectDir, picked);
  noteBrandKitPick(projectDir, picked);
  applyPickedDirection(projectDir, picked);
  afterDirectionPicked?.(projectDir);
  return picked;
}

function noteBrandKitPick(projectDir: string, deal: DirectionDeal): void {
  const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
  if (picked === undefined) return;
  const file = path.join(projectDir, ".hitchhiker", "brand", "BRAND.md");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  const next = text.replace(/## Directions\r?\n\r?\n(?:Pick one|Picked [^\n]+)\./, () => `## Directions\n\nPicked ${picked.name}.`);
  if (next !== text) writeFileSync(file, next, "utf8");
}

const RAN_PROMPT = new Set(["running", "passed", "failed", "interrupted", "fixing", "escalated"]);

/** A pick rewrites the type line, brand.ts, and unbuilt prompt style lines. */
function applyPickedDirection(projectDir: string, deal: DirectionDeal): void {
  const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
  if (picked === undefined) return;
  const families = familiesSentence(picked.display === picked.body ? [picked.display] : [picked.display, picked.body]);
  const wins = winsSentence(picked.display, picked.body, typeWishText(projectDir));
  rewriteBrandType(projectDir, families, wins, null);
  rewriteBrandModule(projectDir, picked.display, picked.body);
  rewritePromptStyles(projectDir, families, wins);
}

function typeWishText(projectDir: string): string {
  const briefFile = path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md");
  if (existsSync(briefFile)) {
    const brief = readFileSync(briefFile, "utf8");
    const fromBrief = briefSection(brief, "Type") || briefSection(brief, "Typography");
    if (fromBrief !== "") return fromBrief.replace(/\s+/g, " ").trim();
  }
  const fromAnswer = readInterviewAnswers(projectDir).find((answer) => answer.id === "DP-1.5")?.value ?? "";
  return fromAnswer.replace(/\s+/g, " ").trim();
}

function briefSection(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function rewriteBrandType(projectDir: string, families: string, wins: string, displayWeight: string | null): void {
  const file = path.join(projectDir, ".hitchhiker", "brand", "BRAND.md");
  if (!existsSync(file)) return;
  const pickedLine = families.replace(/^Families:/, "Picked families:");
  let text = readFileSync(file, "utf8");
  text = text.replace(/^[ \t]*Display weight: .+\n?/gm, "");
  text = text.replace(/^(?:Dealt|Picked) families: .+$/m, pickedLine);
  text = text.replace(/[ \t]*The owner's words win over [^.\n]+\.?\n?/g, "");
  if (wins !== "") text = text.replace(pickedLine, `${pickedLine}\n${wins}`);
  if (displayWeight !== null && displayWeight !== "") {
    const anchor = wins !== "" ? wins : pickedLine;
    text = text.replace(anchor, `${anchor}\nDisplay weight: ${displayWeight}.`);
  }
  writeFileSync(file, text, "utf8");
}

function rewriteBrandModule(projectDir: string, display: string, body: string): void {
  const file = path.join(projectDir, "src", "data", "brand.ts");
  if (!existsSync(file)) return;
  const displayLine = `display: ${JSON.stringify(display)}`;
  const bodyLine = `body: ${JSON.stringify(body)}`;
  let text = readFileSync(file, "utf8");
  if (/^\s*display: /m.test(text)) text = text.replace(/display: (?:"(?:\\.|[^"\\])*")/, displayLine);
  else text = text.replace(/imagineStem: /, `${displayLine},\n  ${bodyLine},\n  imagineStem: `);
  if (/^\s*body: /m.test(text)) text = text.replace(/body: (?:"(?:\\.|[^"\\])*")/, bodyLine);
  writeFileSync(file, text, "utf8");
}

function ranPromptIds(projectDir: string): Set<string> {
  const file = path.join(projectDir, ".hitchhiker", "queue.json");
  if (!existsSync(file)) return new Set();
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { items?: unknown }).items)) {
      return new Set();
    }
    const ids = new Set<string>();
    for (const item of (parsed as { items: unknown[] }).items) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      const status = (item as { status?: unknown }).status;
      if (typeof id === "string" && typeof status === "string" && RAN_PROMPT.has(status)) ids.add(id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** The style guide resolved a conflicting display. Unbuilt prompts follow the same pair. */
export function syncResolvedFamilies(
  projectDir: string,
  display: string,
  body: string,
  displayWeight?: string | null,
): void {
  const families = familiesSentence(display === body ? [display] : [display, body]);
  rewriteBrandType(projectDir, families, "", displayWeight ?? null);
  rewriteBrandModule(projectDir, display, body);
  rewritePromptStyles(projectDir, families, "");
}

function rewritePromptStyles(projectDir: string, families: string, wins: string): void {
  const folder = path.join(projectDir, ".hitchhiker", "prompts");
  if (!existsSync(folder)) return;
  let names: string[] = [];
  try {
    names = readdirSync(folder);
  } catch {
    return;
  }
  const ran = ranPromptIds(projectDir);
  for (const name of names) {
    const id = /^(\d{3})\.md$/.exec(name)?.[1];
    if (id === undefined || ran.has(id)) continue;
    const file = path.join(folder, name);
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const next = rewriteStyleText(text, families, wins);
    if (next !== text) writeFileSync(file, next, "utf8");
  }
}

function rewriteStyleText(text: string, families: string, wins: string): string {
  let next = text.replace(/ ?The owner's words win over [^.\n]+\./g, "");
  next = next.replace(/Families: [^.\n]+\./g, families);
  if (wins !== "" && next.includes(families)) next = next.replaceAll(families, `${wins} ${families}`);
  return next;
}

export function renderDirectionBlock(deal: DirectionDeal): string {
  const picked = deal.pickedId === null ? undefined : deal.directions.find((direction) => direction.id === deal.pickedId);
  const lead = picked === undefined ? "Pick one." : `Picked ${picked.name}.`;
  const lines = ["## Directions", "", lead, ""];
  for (const direction of deal.directions) {
    lines.push(
      `### ${direction.name}`,
      "",
      direction.description,
      `Reference: ${referenceLabel(direction)}. ${direction.url}`,
      `Type: ${direction.display} and ${direction.body}.`,
      `Sections: ${direction.sectionOrder.join(", ")}.`,
      `Hue: ${direction.hue}.`,
      "",
    );
  }
  return lines.join("\n").replaceAll("!", ".").replaceAll("\u2014", "-");
}

let gallerySiteNames: Map<string, string> | null = null;

/** Site name from the named list, then gallery metadata, then the URL host. */
function referenceLabel(direction: Direction): string {
  const named = NAMED_REFERENCES.find((entry) => entry.id === direction.citationId || entry.url === direction.url);
  if (named !== undefined) return named.title;
  const names = loadGallerySiteNames();
  const byId = names.get(`id:${direction.citationId}`);
  if (byId !== undefined && byId !== "") return byId;
  const byUrl = names.get(`url:${direction.url}`);
  if (byUrl !== undefined && byUrl !== "") return byUrl;
  return hostLabel(direction.url);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function loadGallerySiteNames(): Map<string, string> {
  if (gallerySiteNames !== null) return gallerySiteNames;
  const names = new Map<string, string>();
  const file = path.join(packagedPath(["knowledge"], "packs"), "galleries", "curated.json");
  if (!existsSync(file)) {
    gallerySiteNames = names;
    return names;
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    gallerySiteNames = names;
    return names;
  }
  if (!Array.isArray(value)) {
    gallerySiteNames = names;
    return names;
  }
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name === "") continue;
    if (id !== "") names.set(`id:${id}`, name);
    if (url !== "") names.set(`url:${url}`, name);
  }
  gallerySiteNames = names;
  return names;
}

function asDeal(value: unknown): DirectionDeal | null {
  if (!isRecord(value) || !Array.isArray(value.directions) || value.directions.length === 0) return null;
  const directions: Direction[] = [];
  for (const item of value.directions) {
    const direction = asDirection(item);
    if (direction === null) return null;
    directions.push(direction);
  }
  const ids = new Set(directions.map((direction) => direction.id));
  if (ids.size !== directions.length) return null;
  if (value.pickedId === undefined) return null;
  if (value.pickedId === null) return { directions, pickedId: null };
  if (typeof value.pickedId !== "string" || !ids.has(value.pickedId)) return null;
  return { directions, pickedId: value.pickedId };
}

function asDirection(value: unknown): Direction | null {
  if (!isRecord(value)) return null;
  const sectionOrder = value.sectionOrder;
  if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) return null;
  const sections: string[] = [];
  for (const item of sectionOrder) {
    if (typeof item !== "string" || item.trim() === "") return null;
    sections.push(item);
  }
  const id = textField(value.id);
  const name = textField(value.name);
  const citationId = textField(value.citationId);
  const title = textField(value.title);
  const url = textField(value.url);
  const display = textField(value.display);
  const body = textField(value.body);
  const hue = textField(value.hue);
  if (
    id === null ||
    name === null ||
    citationId === null ||
    title === null ||
    url === null ||
    display === null ||
    body === null ||
    hue === null
  ) {
    return null;
  }
  const description = typeof value.description === "string" ? value.description : "";
  return { id, name, description, citationId, title, url, display, body, sectionOrder: sections, hue };
}

function textField(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pairFor(world: string, used: ReadonlySet<number>): TypePairing {
  const pool = TYPE_LIBRARY.filter(
    (pair) => pair.deal === "default" && !isOverusedFamily(pair.display) && !isOverusedFamily(pair.body),
  );
  const mapped = WORLD_ALIAS[world] ?? world;
  const match = pool.find((pair) => !used.has(pair.id) && pair.worlds.includes(mapped));
  const next = match ?? pool.find((pair) => !used.has(pair.id));
  if (next === undefined) throw new Error("No type pair is left for a direction.");
  return next;
}

function typeKey(direction: Direction): string {
  return `${direction.display}\n${direction.body}`.toLowerCase();
}

function sectionKey(direction: Direction): string {
  return direction.sectionOrder.join("|").toLowerCase();
}

interface ReferencePage extends StudiedPage {
  moodName: string;
  description: string;
}

interface NamedReference {
  id: string;
  names: readonly string[];
  title: string;
  moodName: string;
  description: string;
  url: string;
  styleWorld: string;
  sectionTypes: readonly string[];
}

/** Sites a customer can name. Cereal is known so a "meh" can be skipped, not dealt by accident. */
const NAMED_REFERENCES: readonly NamedReference[] = [
  {
    id: "patagonia",
    names: ["patagonia"],
    title: "Patagonia",
    moodName: "Big quiet photography",
    description: "A wide photograph carries the page, and the type stays plain.",
    url: "https://www.patagonia.com/",
    styleWorld: "editorial",
    sectionTypes: ["hero", "gallery", "story", "visit"],
  },
  {
    id: "aesop",
    names: ["aesop"],
    title: "Aesop",
    moodName: "Restraint and empty space",
    description: "A few words, a lot of quiet ground, and type that does not shout.",
    url: "https://www.aesop.com/",
    styleWorld: "editorial",
    sectionTypes: ["hero", "story", "detail", "visit"],
  },
  {
    id: "kinfolk",
    names: ["kinfolk"],
    title: "Kinfolk",
    moodName: "Margins doing the hierarchy",
    description: "The page stacks a few long lines and trusts the reader to move without a second pitch.",
    url: "https://www.kinfolk.com/",
    styleWorld: "editorial",
    sectionTypes: ["hero", "essay", "gallery", "colophon"],
  },
  {
    id: "airbnb-luxe",
    names: ["airbnb luxe", "airbnb"],
    title: "Airbnb Luxe",
    moodName: "Clean listing cards",
    description: "A card, a gallery, and a clear way to ask.",
    url: "https://www.airbnb.com/luxury",
    styleWorld: "product",
    sectionTypes: ["hero", "cards", "gallery", "inquiry"],
  },
  {
    id: "cereal",
    names: ["cereal"],
    title: "Cereal",
    moodName: "A cold magazine grid",
    description: "A cold grid. Deal it only when the owner did not set it aside.",
    url: "https://www.readcereal.com/",
    styleWorld: "editorial",
    sectionTypes: ["hero", "grid", "essay", "colophon"],
  },
];

const SECTION_BANK: readonly (readonly string[])[] = [
  ["hero", "essay", "gallery", "colophon"],
  ["hero", "story", "detail", "visit"],
  ["hero", "cards", "gallery", "inquiry"],
  ["hero", "object", "story", "visit"],
  ["hero", "look", "list", "visit"],
  ["hero", "facts", "story", "visit"],
];

function namedReferencePages(): ReferencePage[] {
  return NAMED_REFERENCES.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    styleWorld: entry.styleWorld,
    sectionTypes: entry.sectionTypes,
    moodName: entry.moodName,
    description: entry.description,
  }));
}

function pagesForDeal(root: string | undefined, projectDir: string | undefined): ReferencePage[] {
  const libraryRoot = root === undefined || root.trim() === "" ? designLibraryRoot() : root;
  if (path.resolve(libraryRoot) !== path.resolve(designLibraryRoot())) {
    return loadStudiedPages(libraryRoot)
      .filter((page) => !isDocsOrPackUrl(page.url))
      .map((page) => ({ ...page, moodName: page.title, description: page.title }));
  }
  const loved = customerReferencePages(projectDir);
  const seen = new Set(loved.map((page) => page.id));
  const gallery = loadGalleryPages().filter((page) => !seen.has(page.id));
  return [...loved, ...gallery];
}

function customerReferencePages(projectDir: string | undefined): ReferencePage[] {
  if (projectDir === undefined || projectDir.trim() === "") return [];
  const answers = readInterviewAnswers(projectDir);
  const loved = answers.find((answer) => answer.id === "DP-5.2")?.value ?? "";
  const named = answers.find((answer) => answer.id === "DP-5.1")?.value ?? "";
  const sentiment = new Map<string, "love" | "meh" | "hate" | "named">();
  markSentiment(named, sentiment, false);
  markSentiment(loved, sentiment, true);
  const pages: ReferencePage[] = [];
  for (const entry of NAMED_REFERENCES) {
    const tone = sentiment.get(entry.id);
    if (tone === undefined || tone === "meh" || tone === "hate") continue;
    pages.push({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      styleWorld: entry.styleWorld,
      sectionTypes: entry.sectionTypes,
      moodName: entry.moodName,
      description: entry.description,
    });
  }
  pages.sort((left, right) => rankTone(sentiment.get(left.id)) - rankTone(sentiment.get(right.id)));
  return pages;
}

function rankTone(tone: "love" | "meh" | "hate" | "named" | undefined): number {
  if (tone === "love") return 0;
  if (tone === "named") return 1;
  return 2;
}

function markSentiment(
  text: string,
  sentiment: Map<string, "love" | "meh" | "hate" | "named">,
  preferExplicit: boolean,
): void {
  const lower = text.toLowerCase();
  const catalog = [...NAMED_REFERENCES].sort((left, right) => {
    const leftLen = Math.max(...left.names.map((name) => name.length));
    const rightLen = Math.max(...right.names.map((name) => name.length));
    return rightLen - leftLen;
  });
  const names = catalog.flatMap((entry) => [...entry.names]);
  for (const entry of catalog) {
    for (const name of entry.names) {
      const at = lower.indexOf(name);
      if (at < 0) continue;
      // Stop at the next name or sentence, so "Patagonia: love. Cereal: meh" does not mark Patagonia meh.
      const window = clauseAround(lower, at, name.length, names);
      let tone: "love" | "meh" | "hate" | "named" = "named";
      if (/\bhate\b/.test(window)) tone = "hate";
      else if (/\bmeh\b/.test(window)) tone = "meh";
      else if (/\blove\b/.test(window)) tone = "love";
      const current = sentiment.get(entry.id);
      if (current === undefined || preferExplicit) sentiment.set(entry.id, tone);
      break;
    }
  }
}

/** The words that belong to this name: up to the next sentence or the next catalog name. */
function clauseAround(lower: string, at: number, nameLength: number, names: readonly string[]): string {
  const after = at + nameLength;
  let end = lower.length;
  const sentence = lower.slice(after).search(/[.!?]/);
  if (sentence >= 0) end = after + sentence;
  for (const other of names) {
    if (other.length === 0) continue;
    const next = lower.indexOf(other, after);
    if (next >= 0 && next < end) end = next;
  }
  return lower.slice(at, end);
}

function readInterviewAnswers(projectDir: string): Array<{ id: string; value: string }> {
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
    const status = typeof item.status === "string" ? item.status : "";
    if (status === "SKIPPED" || status === "NOT_APPLICABLE" || status === "UNANSWERED") continue;
    answers.push({ id: item.id, value: item.value });
  }
  return answers;
}

function loadGalleryPages(): ReferencePage[] {
  const file = path.join(packagedPath(["knowledge"], "packs"), "galleries", "curated.json");
  if (!existsSync(file)) return [];
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const pages: ReferencePage[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const why = typeof item.why === "string" ? item.why.trim() : "";
    const styleWorld = typeof item.styleWorld === "string" ? item.styleWorld.trim() : "editorial";
    if (id === "" || title === "" || url === "" || isDocsOrPackUrl(url)) continue;
    const named = NAMED_REFERENCES.find((entry) => entry.id === id || entry.url === url);
    const index = pages.length;
    const bank = SECTION_BANK[index % SECTION_BANK.length] ?? ["hero", "story", "visit"];
    pages.push({
      id: named?.id ?? id,
      title: named?.title ?? title,
      url: named?.url ?? url,
      styleWorld: named?.styleWorld ?? (styleWorld === "" ? "editorial" : styleWorld),
      sectionTypes: named?.sectionTypes ?? bank,
      moodName: named?.moodName ?? title,
      description: named?.description ?? (why === "" ? title : why),
    });
  }
  return pages;
}
