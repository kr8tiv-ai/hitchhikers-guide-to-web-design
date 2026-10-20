/**
 * Three directions from pages the desk has already studied (BUG-055 idea 4).
 * Each direction cites a real library entry. A deal that shares one type pair
 * and one section order is only a hue change, and it fails. No ingest.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

export function dealDirections(root = designLibraryRoot()): DirectionDeal {
  const pages = loadStudiedPages(root);
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
