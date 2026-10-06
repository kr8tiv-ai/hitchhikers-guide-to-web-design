import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USER_AGENT } from "./crawl.ts";

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

const PER_SOURCE_CAP = 2;

const STYLE_WORLDS = [
  "editorial",
  "3d-world",
  "scroll-film",
  "brutalist",
  "minimal-luxury",
  "playful",
] as const;

const SOURCES = ["awwwards", "godly", "other"] as const;

export type GalleryStyleWorld = (typeof STYLE_WORLDS)[number];
export type GallerySource = (typeof SOURCES)[number];

export interface GalleryEntry {
  industry: string;
  styleWorld: GalleryStyleWorld;
  motionLevel: number;
  name: string;
  url: string;
  source: GallerySource;
  award: string;
  noted: string;
}

export interface GalleryCache {
  fetchedAt: string;
  entries: GalleryEntry[];
}

export interface SuggestQuery {
  industry?: string;
  styleWorld?: string;
  exclude?: readonly string[];
  limit: number;
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

const styleWorldSet: ReadonlySet<string> = new Set(STYLE_WORLDS);
const sourceSet: ReadonlySet<string> = new Set(SOURCES);

function isStyleWorld(value: string): value is GalleryStyleWorld {
  return styleWorldSet.has(value);
}

function isSource(value: string): value is GallerySource {
  return sourceSet.has(value);
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
  const name = readString(value, ["name"]);
  const url = readString(value, ["url"]);
  const source = readString(value, ["source"]);
  const industry = readString(value, ["industry"]);
  const styleWorld = readString(value, ["styleWorld", "style_world"]);
  const award = readString(value, ["award"]);
  const noted = readString(value, ["noted"]);
  const motionRaw = value.motionLevel ?? value.motion_level;

  if (name === null || name.length === 0) throw new Error(`Gallery entry ${index} needs a name.`);
  if (url === null || url.length === 0) throw new Error(`Gallery entry ${index} needs a url.`);
  assertHttpUrl(url, `Gallery entry ${index} url`);
  if (source === null || !isSource(source)) {
    throw new Error(`Gallery entry ${index} has a source this pack does not use.`);
  }
  if (industry === null || industry.length === 0) {
    throw new Error(`Gallery entry ${index} needs an industry.`);
  }
  if (styleWorld === null || !isStyleWorld(styleWorld)) {
    throw new Error(`Gallery entry ${index} has a style world this pack does not use.`);
  }
  if (typeof motionRaw !== "number" || !Number.isInteger(motionRaw) || motionRaw < 1 || motionRaw > 10) {
    throw new Error(`Gallery entry ${index} needs a motion level from 1 to 10.`);
  }
  if (award === null || award.length === 0) throw new Error(`Gallery entry ${index} needs an award.`);
  assertAward(award);
  if (noted === null || !noted.startsWith("Look at")) {
    throw new Error(`Gallery entry ${index} needs a one-line Look at note.`);
  }
  if (noted.includes("\n") || noted.includes("!")) {
    throw new Error(`Gallery entry ${index} note must be one line, with no exclamation mark.`);
  }

  const year = value.year;
  if (year !== undefined && (typeof year !== "number" || !Number.isInteger(year))) {
    throw new Error(`Gallery entry ${index} year must be an integer when present.`);
  }
  const date = value.date;
  if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error(`Gallery entry ${index} date must be YYYY-MM-DD when present.`);
  }

  return {
    name,
    url,
    source,
    industry,
    styleWorld,
    motionLevel: motionRaw,
    award,
    noted,
  };
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
 * Up to two Godly and two Awwwards rows for the query, and never more than
 * limit. A provided industry and a provided style world both have to match.
 * Source "other" stays in the pack for loadCurated and is not backfilled
 * into this round. The input array is not reordered or resized.
 */
export function suggestReferences(entries: readonly GalleryEntry[], q: SuggestQuery): GalleryEntry[] {
  if (!Number.isFinite(q.limit) || q.limit <= 0) return [];
  const excluded = new Set(q.exclude ?? []);
  const godly: GalleryEntry[] = [];
  const awwwards: GalleryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.url) || excluded.has(entry.url)) continue;
    if (q.industry !== undefined && entry.industry !== q.industry) continue;
    if (q.styleWorld !== undefined && entry.styleWorld !== q.styleWorld) continue;
    seen.add(entry.url);
    if (entry.source === "godly") godly.push(entry);
    else if (entry.source === "awwwards") awwwards.push(entry);
  }

  const picked: GalleryEntry[] = [];
  let godlyIndex = 0;
  let awwwardsIndex = 0;
  for (let round = 0; round < PER_SOURCE_CAP; round += 1) {
    const godlyEntry = godly[godlyIndex];
    if (godlyEntry !== undefined && picked.length < q.limit) {
      picked.push(godlyEntry);
      godlyIndex += 1;
    }
    const awwwardsEntry = awwwards[awwwardsIndex];
    if (awwwardsEntry !== undefined && picked.length < q.limit) {
      picked.push(awwwardsEntry);
      awwwardsIndex += 1;
    }
  }
  return picked;
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
