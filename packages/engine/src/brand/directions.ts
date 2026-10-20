/**
 * Three directions from pages the desk has already studied (BUG-055 idea 4).
 * Each direction cites a real library entry. A deal that shares one type pair
 * and one section order is only a hue change, and it fails. No ingest.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DecisionLogError, recordDirectionChoice, rejectedDirectionNames } from "./decision-canvas.ts";
import { isOverusedFamily } from "./tokens.ts";
import { TYPE_LIBRARY, type TypePairing } from "./type-library.ts";

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
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "knowledge", "design-library");
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

export function dealDirections(root = designLibraryRoot(), projectDir?: string): DirectionDeal {
  const rejected = new Set(
    projectDir === undefined || projectDir.trim() === "" ? [] : rejectedDirectionNames(projectDir),
  );
  const pages = loadStudiedPages(root).filter((page) => !rejected.has(page.title));
  const chosen: StudiedPage[] = [];
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
      name: page.title,
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

export function checkDirectionDeal(deal: DirectionDeal, pages = loadStudiedPages()): DirectionCheck {
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
  return picked;
}

export function renderDirectionBlock(deal: DirectionDeal): string {
  const lines = ["## Directions", "", "Pick one.", ""];
  for (const direction of deal.directions) {
    lines.push(
      `### ${direction.name}`,
      "",
      `Studied page: ${direction.title} (${direction.citationId}). ${direction.url}`,
      `Type: ${direction.display} and ${direction.body}.`,
      `Sections: ${direction.sectionOrder.join(", ")}.`,
      `Hue: ${direction.hue}.`,
      "",
    );
  }
  return lines.join("\n").replaceAll("!", ".").replaceAll("\u2014", "-");
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
  return { id, name, citationId, title, url, display, body, sectionOrder: sections, hue };
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
