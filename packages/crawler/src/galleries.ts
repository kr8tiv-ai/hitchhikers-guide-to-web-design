import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USER_AGENT } from "./crawl.ts";
import {
  isGalleryFamily,
  isGallerySource,
  isGalleryStyleWorld,
  selectReferenceCards,
  styleWorldForFamily,
  type GalleryFamily,
  type GallerySource,
  type GalleryStyleWorld,
} from "./gallery-pick.ts";

/**
 * Offline shortlist for Suggest. Resolved from this file so Windows, macOS,
 * and Linux share one path. Importing this module does not read or fetch it.
 */
export const CURATED_PACK_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "knowledge",
  "galleries",
  "curated.json",
);

/** No gallery host is allowed until a caller passes one. */
export const DEFAULT_GALLERY_ALLOW: readonly string[] = [];

/** A cache older than this is not used. Seven days, not "about a week". */
export const GALLERY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Allow-listed GETs abort at this limit. */
export const GALLERY_FETCH_TIMEOUT_MS = 10_000;

export type { GalleryStyleWorld, GallerySource };

export interface GalleryEntry {
  industry: string;
  styleWorld: GalleryStyleWorld;
  motionLevel: number;
  name: string;
  url: string;
  source: GallerySource;
  award: string;
  noted: string;
  id?: string;
  title?: string;
  sourceName?: string;
  sourcePage?: string | null;
  family?: GalleryFamily;
  styleTags?: string[];
  why?: string;
  palette?: { note: string; hex: string[] };
  typography?: string;
  borrow?: string;
  attribution?: string;
  verified?: boolean;
  verificationNote?: string;
  checked?: string;
}

export interface GalleryCache {
  fetchedAt: string;
  entries: GalleryEntry[];
}

export interface SuggestQuery {
  industry?: string;
  styleWorld?: string;
  family?: string;
  exclude?: readonly string[];
  limit: number;
  seed?: string;
  round?: number;
  lovedUrls?: readonly string[];
}

export interface RefreshOptions {
  fetchImpl?: typeof fetch;
  allow: readonly string[];
  cachePath?: string;
  now?: Date;
}

export interface RefreshResult {
  status: "skipped" | "ok";
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function readString(raw: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") return value.trim();
  }
  return null;
}

function assertAward(award: string): void {
  if (/SOTY\s*2026/i.test(award)) {
    throw new Error("SOTY 2026 is not an award this loader will accept.");
  }
  if (award.includes("SOTD") && award.includes("SOTY")) {
    throw new Error("A Site of the Day row must not use the award string SOTY.");
  }
}

function assertHttpUrl(url: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${label} is not an absolute URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https. Refused ${parsed.protocol}`);
  }
}

function parseEntry(value: unknown, index: number): GalleryEntry {
  if (!isRecord(value)) {
    throw new Error(`Gallery entry ${index} is not an object.`);
  }
  const label = entryLabel(index, value);
  const name = readString(value, ["name"]);
  const url = readString(value, ["url"]);
  const source = readString(value, ["source"]);
  const industry = readString(value, ["industry"]);
  const styleRaw = readString(value, ["styleWorld", "style_world"]);
  const award = readString(value, ["award"]);
  const noted = readString(value, ["noted"]);
  const motionRaw = value.motionLevel ?? value.motion_level;
  const familyRaw = readString(value, ["family"]);

  if (name === null || name.length === 0) throw new Error(`${label} needs a name.`);
  if (url === null || url.length === 0) throw new Error(`${label} needs a url.`);
  assertHttpUrl(url, `${label} url`);
  if (source === null || !isGallerySource(source)) {
    throw new Error(`${label} has a source this pack does not use.`);
  }
  if (industry === null || industry.length === 0) {
    throw new Error(`${label} needs an industry.`);
  }
  if (familyRaw !== null && !isGalleryFamily(familyRaw)) {
    throw new Error(`${label} has a family this pack does not use.`);
  }
  let styleWorld = styleRaw;
  if (familyRaw !== null) {
    const expected = styleWorldForFamily(familyRaw);
    if (styleWorld === null) styleWorld = expected;
    else if (styleWorld !== expected) {
      throw new Error(`${label} style world does not match its family.`);
    }
  }
  if (styleWorld === null || !isGalleryStyleWorld(styleWorld)) {
    throw new Error(`${label} has a style world this pack does not use.`);
  }
  if (typeof motionRaw !== "number" || !Number.isInteger(motionRaw) || motionRaw < 1 || motionRaw > 10) {
    throw new Error(`${label} needs a motion level from 1 to 10.`);
  }
  if (award === null || award.length === 0) throw new Error(`${label} needs an award.`);
  assertAward(award);
  if (noted === null || !noted.startsWith("Look at")) {
    throw new Error(`${label} needs a one-line Look at note.`);
  }
  if (noted.includes("\n") || noted.includes("!")) {
    throw new Error(`${label} note must be one line, with no exclamation mark.`);
  }

  const year = value.year;
  if (year !== undefined && (typeof year !== "number" || !Number.isInteger(year))) {
    throw new Error(`${label} year must be an integer when present.`);
  }
  const date = value.date;
  if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error(`${label} date must be YYYY-MM-DD when present.`);
  }

  const entry: GalleryEntry = {
    name,
    url,
    source,
    industry,
    styleWorld,
    motionLevel: motionRaw,
    award,
    noted,
  };
  if (familyRaw !== null) entry.family = familyRaw;
  if (Object.hasOwn(value, "verified")) {
    if (typeof value.verified !== "boolean") throw new Error(`${label} verified must be a boolean.`);
    entry.verified = value.verified;
  }
  const id = typeof value.id === "string" && value.id.trim() !== "" ? value.id.trim() : undefined;
  if (id !== undefined) entry.id = id;
  return entry;
}

function entryLabel(index: number, raw: Record<string, unknown>): string {
  const id = raw.id;
  if (typeof id === "string" && id.trim() !== "") return `Gallery entry ${index} (${id.trim()})`;
  return `Gallery entry ${index}`;
}

function parseEntries(value: unknown): GalleryEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Curated gallery pack must be a JSON array.");
  }
  const entries: GalleryEntry[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = parseEntry(value[index], index);
    if (seen.has(entry.url)) {
      throw new Error(`Duplicate gallery url: ${entry.url}`);
    }
    seen.add(entry.url);
    entries.push(entry);
  }
  return entries;
}

/** Read a curated pack from disk. Does not fetch. */
export function loadCurated(file: string): GalleryEntry[] {
  const text = readFileSync(file, "utf8");
  const parsed: unknown = JSON.parse(text);
  return parseEntries(parsed);
}

/**
 * Up to two Recent or legacy Godly rows and two Awwwards rows, then backfill
 * until the round has four. The input array is not reordered or resized.
 * This is the crawler copy of the engine picker.
 */
export function suggestReferences(entries: readonly GalleryEntry[], q: SuggestQuery): GalleryEntry[] {
  return selectReferenceCards(entries, q);
}

/**
 * True when fetchedAt is a real time and now is not more than maxAgeMs
 * after it. A future stamp, or an unparseable stamp, is not fresh.
 */
export function cacheIsFresh(
  fetchedAt: string,
  now: Date,
  maxAgeMs: number = GALLERY_CACHE_MAX_AGE_MS,
): boolean {
  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) return false;
  const age = now.getTime() - then;
  if (age < 0) return false;
  return age <= maxAgeMs;
}

function loadCache(file: string): GalleryCache | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.fetchedAt !== "string" || !Array.isArray(parsed.entries)) {
    return null;
  }
  try {
    return { fetchedAt: parsed.fetchedAt, entries: parseEntries(parsed.entries) };
  } catch {
    return null;
  }
}

function writeCache(file: string, cache: GalleryCache): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, { encoding: "utf8" });
}

/**
 * Opt-in refresh. Omitting fetchImpl returns skipped and does not touch the
 * network. An empty allow list returns skipped before fetchImpl is called.
 * Only those exact URLs are GETed, with a 10 second timeout and no redirect
 * follow. HTML is not turned into awards. A top-level JSON array is the
 * only payload stored, and it goes through the same award checks as the file.
 * A cache older than 7 days is not used.
 */
export async function refreshGalleries(opts: RefreshOptions): Promise<RefreshResult> {
  if (opts.fetchImpl === undefined) {
    return { status: "skipped", reason: "no fetcher" };
  }
  if (opts.allow.length === 0) {
    return { status: "skipped", reason: "allow list empty" };
  }

  const now = opts.now ?? new Date();
  const cachePath = opts.cachePath;
  if (cachePath !== undefined) {
    const cached = loadCache(cachePath);
    if (cached !== null && cacheIsFresh(cached.fetchedAt, now)) {
      return { status: "ok", reason: "cache fresh" };
    }
  }

  const allow: string[] = [];
  const seenAllow = new Set<string>();
  for (const url of opts.allow) {
    if (seenAllow.has(url)) continue;
    seenAllow.add(url);
    assertHttpUrl(url, "Gallery allow URL");
    allow.push(url);
  }

  const collected: unknown[] = [];
  for (const url of allow) {
    const response = await opts.fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(GALLERY_FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html, application/json;q=0.9",
        "user-agent": USER_AGENT,
      },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error(
        "Gallery refresh refused a redirect from the allow-listed URL. The next hop was not fetched.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Gallery refresh GET returned ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      await response.body?.cancel();
      continue;
    }
    const body: unknown = await response.json();
    if (Array.isArray(body)) {
      for (const item of body) collected.push(item);
    }
  }

  const entries = collected.length === 0 ? [] : parseEntries(collected);
  if (cachePath !== undefined) {
    const cache: GalleryCache = { fetchedAt: now.toISOString(), entries };
    writeCache(cachePath, cache);
  }
  return { status: "ok", reason: "fetched" };
}
