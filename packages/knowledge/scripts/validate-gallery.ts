/**
 * Check the curated gallery pack. Prints every problem and exits non-zero.
 * `--online` does one polite request per URL and is never used by tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { USER_AGENT, allowed } from "@hitchhiker/crawler";
import { BANNED_PHRASES, BANNED_WORDS, FAMILIES, FAMILY_STYLE, type GalleryFamily } from "@hitchhiker/engine";

export const STYLE_TAGS = [
  "gsap",
  "webgl",
  "scroll-driven",
  "serif",
  "grotesk",
  "mono",
  "dark",
  "light",
  "grid",
  "full-bleed",
  "kinetic-type",
  "product-3d",
  "cursor-play",
  "editorial-layout",
  "dense",
  "airy",
] as const;

export const AWARDS = ["none", "SOTD", "Honorable Mention", "Developer Award", "SOTY 2025"] as const;

export const SOURCE_NAMES = [
  "Awwwards",
  "Recent (formerly Godly)",
  "GSAP Showcase",
  "aura.build",
  "Siteinspire",
  "Minimal Gallery",
  "Land-book",
  "Lapa Ninja",
  "Httpster",
  "CSS Design Awards",
  "The FWA",
  "Mobbin",
  "Refero",
  "Codrops",
  "Direct pick",
] as const;

const SOURCE_HOSTS: Record<string, readonly string[]> = {
  Awwwards: ["awwwards.com"],
  "Recent (formerly Godly)": ["recent.design"],
  "GSAP Showcase": ["gsap.com"],
  "aura.build": ["aura.build"],
  Siteinspire: ["siteinspire.com"],
  "Minimal Gallery": ["minimal.gallery"],
  "Land-book": ["land-book.com"],
  "Lapa Ninja": ["lapa.ninja"],
  Httpster: ["httpster.net"],
  "CSS Design Awards": ["cssdesignawards.com"],
  "The FWA": ["thefwa.com"],
  Mobbin: ["mobbin.com"],
  Refero: ["refero.design"],
  Codrops: ["tympanus.net"],
  "Direct pick": [],
};

const MACHINE_SOURCES = ["awwwards", "recent", "gsap-showcase", "aura", "other"] as const;
const FILE_EXT = /\.(png|jpe?g|webp|gif|mp4|svg)$/i;
const HEX = /^#[0-9A-F]{6}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ValidateOptions {
  seedText?: string;
  now?: Date;
  /** When false, skip the pack-size totals. Field rules still run. */
  totals?: boolean;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PACK = path.resolve(here, "..", "galleries", "curated.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function wordsOf(value: string): string[] {
  return value.split(/\s+/).filter((word) => word.length > 0);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function normalUrl(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathName = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${host}${pathName}`;
}

function problem(id: string, field: string, message: string): string {
  return `${id} ${field}: ${message}`;
}

function yearFields(value: unknown, prefix: string): string[] {
  if (typeof value === "string") return value.includes("Year") ? [prefix || "entry"] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => yearFields(item, `${prefix}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => yearFields(item, prefix.length > 0 ? `${prefix}.${key}` : key));
  }
  return [];
}

function proseIssues(id: string, field: string, value: string): string[] {
  const issues: string[] = [];
  if (value.includes("!")) issues.push(problem(id, field, "contains an exclamation mark."));
  if (value.includes("\u2014")) issues.push(problem(id, field, "contains an em dash."));
  if (/lorem|ipsum/i.test(value)) issues.push(problem(id, field, "contains lorem."));
  if (/https?:/i.test(value) || value.includes("http")) {
    issues.push(problem(id, field, "contains http."));
  }
  const lower = value.toLowerCase();
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(value)) issues.push(problem(id, field, `contains the banned word ${word}.`));
  }
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) issues.push(problem(id, field, `contains the banned phrase ${phrase}.`));
  }
  return issues;
}

function oneSentence(id: string, field: string, value: string, min: number, max: number): string[] {
  const issues = proseIssues(id, field, value);
  const count = wordsOf(value).length;
  if (count < min || count > max) {
    issues.push(problem(id, field, `has ${count} words, and needs ${min} to ${max}.`));
  }
  const body = value.trim();
  if (!body.endsWith(".") || body.slice(0, -1).includes(".") || body.includes("?")) {
    issues.push(problem(id, field, "must be one sentence."));
  }
  return issues;
}

export function validateGallery(value: unknown, options: ValidateOptions = {}): string[] {
  const issues: string[] = [];
  if (!Array.isArray(value)) return ["pack: Gallery pack must be a JSON array."];
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const seedText = options.seedText ?? "";
  const ids = new Set<string>();
  const urls = new Set<string>();
  const familyCounts = new Map<string, number>();
  let verifiedCount = 0;
  let unverifiedCount = 0;

  for (const raw of value) {
    if (!isRecord(raw)) {
      issues.push("pack: an entry is not an object.");
      continue;
    }
    const id = text(raw.id) ?? "(missing id)";
    if (text(raw.id) === null) issues.push(problem(id, "id", "is required."));
    else if (!SLUG.test(id)) issues.push(problem(id, "id", "must be a kebab slug."));
    else if (ids.has(id)) issues.push(problem(id, "id", "is duplicated."));
    else ids.add(id);

    const title = text(raw.title);
    if (title === null) issues.push(problem(id, "title", "is required."));
    else {
      const count = wordsOf(title).length;
      if (count < 3 || count > 9) issues.push(problem(id, "title", `has ${count} words, and needs 3 to 9.`));
      issues.push(...proseIssues(id, "title", title));
    }

    if (text(raw.name) === null) issues.push(problem(id, "name", "is required."));

    const sourceName = text(raw.sourceName);
    if (sourceName === null || !SOURCE_NAMES.includes(sourceName as (typeof SOURCE_NAMES)[number])) {
      issues.push(problem(id, "sourceName", "is not a known gallery name."));
    }

    const source = text(raw.source);
    if (source === null || !MACHINE_SOURCES.includes(source as (typeof MACHINE_SOURCES)[number])) {
      issues.push(problem(id, "source", "is not a machine source this pack ships."));
    }

    const sourcePage = raw.sourcePage === null ? null : text(raw.sourcePage);
    if (sourceName === "Direct pick") {
      if (raw.sourcePage !== null) issues.push(problem(id, "sourcePage", "must be null for a direct pick."));
    } else if (sourcePage === null) {
      issues.push(problem(id, "sourcePage", "is required for a listed source."));
    } else {
      issues.push(...urlIssues(id, "sourcePage", sourcePage));
      const host = hostOf(sourcePage);
      const allowedHosts = sourceName === null ? [] : (SOURCE_HOSTS[sourceName] ?? []);
      if (host === null || !allowedHosts.includes(host)) {
        issues.push(problem(id, "sourcePage", "host is not allow-listed for the source name."));
      }
    }

    const url = text(raw.url);
    if (url === null) issues.push(problem(id, "url", "is required."));
    else {
      issues.push(...urlIssues(id, "url", url));
      try {
        const key = normalUrl(url);
        if (urls.has(key)) issues.push(problem(id, "url", "duplicates another row after normalizing the host and path."));
        else urls.add(key);
      } catch {
        // urlIssues already reported a parse failure.
      }
    }

    const family = text(raw.family);
    if (family === null || !FAMILIES.includes(family as GalleryFamily)) {
      issues.push(problem(id, "family", "is not in the family list."));
    } else {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      const style = text(raw.styleWorld) ?? text(raw.style_world);
      if (style !== FAMILY_STYLE[family as GalleryFamily]) {
        issues.push(problem(id, "styleWorld", "does not match the family table."));
      }
    }

    const tags = raw.styleTags;
    if (!Array.isArray(tags) || tags.length < 2 || tags.length > 5) {
      issues.push(problem(id, "styleTags", "needs 2 to 5 tags."));
    } else {
      const seenTags = new Set<string>();
      for (const tag of tags) {
        if (typeof tag !== "string" || !STYLE_TAGS.includes(tag as (typeof STYLE_TAGS)[number])) {
          issues.push(problem(id, "styleTags", "includes a tag outside the vocabulary."));
        } else if (seenTags.has(tag)) issues.push(problem(id, "styleTags", "repeats a tag."));
        else seenTags.add(tag);
      }
    }

    const why = text(raw.why);
    if (why === null) issues.push(problem(id, "why", "is required."));
    else issues.push(...oneSentence(id, "why", why, 12, 28));

    const palette = raw.palette;
    if (!isRecord(palette)) issues.push(problem(id, "palette", "must be an object with a note and hex values."));
    else {
      const note = text(palette.note);
      if (note === null) issues.push(problem(id, "palette", "needs a sentence."));
      else {
        issues.push(...proseIssues(id, "palette", note));
        if (note.length > 220) issues.push(problem(id, "palette", "is longer than 220 characters."));
        if (!note.endsWith(".")) issues.push(problem(id, "palette", "must be one sentence."));
      }
      const hex = palette.hex;
      if (!Array.isArray(hex) || hex.length < 1 || hex.length > 5) {
        issues.push(problem(id, "palette", "needs 1 to 5 hex values."));
      } else {
        for (const item of hex) {
          if (typeof item !== "string" || !HEX.test(item)) {
            issues.push(problem(id, "palette", "has a hex value outside #RRGGBB uppercase."));
          }
        }
      }
    }

    for (const field of ["typography", "borrow"] as const) {
      const line = text(raw[field]);
      if (line === null) issues.push(problem(id, field, "is required."));
      else {
        issues.push(...proseIssues(id, field, line));
        if (line.length > 220) issues.push(problem(id, field, "is longer than 220 characters."));
      }
    }

    const attribution = text(raw.attribution);
    if (attribution === null) issues.push(problem(id, "attribution", "is required."));
    else {
      issues.push(...proseIssues(id, "attribution", attribution));
      if (sourceName === "Direct pick" && attribution !== "Direct pick, no gallery listing.") {
        issues.push(problem(id, "attribution", "must say Direct pick, no gallery listing."));
      }
      if (sourceName !== null && sourceName !== "Direct pick" && attribution !== `Listed on ${sourceName}.`) {
        issues.push(problem(id, "attribution", "must credit the source name."));
      }
    }

    const award = text(raw.award);
    const name = text(raw.name) ?? "";
    if (award === null || !AWARDS.includes(award as (typeof AWARDS)[number])) {
      issues.push(problem(id, "award", "is not an allowed award."));
    } else if (award === "SOTY 2025" && name !== "Lando Norris") {
      issues.push(problem(id, "award", "SOTY is only allowed on Lando Norris."));
    } else if (award === "SOTD") {
      for (const field of yearFields(raw, "")) {
        issues.push(problem(id, field, "a Site of the Day row must not contain Year."));
      }
    }

    const motion = raw.motionLevel ?? raw.motion_level;
    if (typeof motion !== "number" || !Number.isInteger(motion) || motion < 1 || motion > 10) {
      issues.push(problem(id, "motionLevel", "must be an integer from 1 to 10."));
    }

    if (typeof raw.verified !== "boolean") issues.push(problem(id, "verified", "must be a boolean."));
    else if (raw.verified) verifiedCount += 1;
    else {
      unverifiedCount += 1;
      if (text(raw.verificationNote) === null) {
        issues.push(problem(id, "verificationNote", "is required when verified is false."));
      }
    }

    const checked = text(raw.checked);
    if (checked === null || !/^\d{4}-\d{2}-\d{2}$/.test(checked) || Number.isNaN(Date.parse(`${checked}T00:00:00Z`))) {
      issues.push(problem(id, "checked", "must be a real ISO date."));
    } else if (checked > today) issues.push(problem(id, "checked", "is in the future."));

    const noted = text(raw.noted);
    if (noted === null || !noted.startsWith("Look at")) issues.push(problem(id, "noted", "must start with Look at."));
    else issues.push(...proseIssues(id, "noted", noted));

    if (text(raw.industry) === null) issues.push(problem(id, "industry", "is required."));

    if (seedText.length > 0) {
      for (const field of ["title", "why", "typography", "borrow", "noted", "attribution"] as const) {
        const line = text(raw[field]);
        if (line !== null && line.length >= 24 && seedText.includes(line)) {
          issues.push(problem(id, field, "repeats text from the seed."));
        }
      }
      if (isRecord(raw.palette) && text(raw.palette.note) !== null) {
        const line = text(raw.palette.note) ?? "";
        if (line.length >= 24 && seedText.includes(line)) {
          issues.push(problem(id, "palette", "repeats text from the seed."));
        }
      }
    }
  }

  if (options.totals === false) return issues;
  const total = value.length;
  if (total < 120) issues.push(`pack: has ${total} rows, and needs at least 120.`);
  if (familyCounts.size < 12) issues.push(`pack: uses ${familyCounts.size} families, and needs at least 12.`);
  for (const [family, count] of familyCounts) {
    if (count < 6) issues.push(`pack family: ${family} has ${count} rows, and needs at least 6.`);
    if (total > 0 && count / total > 0.25) {
      issues.push(`pack family: ${family} is over 25 percent of the pack.`);
    }
  }
  if (verifiedCount < 100) issues.push(`pack: has ${verifiedCount} verified rows, and needs at least 100.`);
  if (total > 0 && unverifiedCount / total > 0.1) {
    issues.push(`pack: unverified rows are over 10 percent.`);
  }
  return issues;
}

function urlIssues(id: string, field: string, url: string): string[] {
  const issues: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [problem(id, field, "is not a URL.")];
  }
  if (parsed.protocol !== "https:") issues.push(problem(id, field, "must use https."));
  if (parsed.hash.length > 0) issues.push(problem(id, field, "must not include a fragment."));
  for (const key of parsed.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || lower === "ref" || lower === "fbclid") {
      issues.push(problem(id, field, "must not include a tracking query."));
    }
  }
  if (FILE_EXT.test(parsed.pathname)) issues.push(problem(id, field, "must not point at an image or video file."));
  return issues;
}

interface OnlineRow {
  id: string;
  url: string;
  status: string;
}

export async function checkOnline(entries: readonly { id?: string; url?: string }[]): Promise<OnlineRow[]> {
  const rows: OnlineRow[] = [];
  const lastByHost = new Map<string, number>();
  const robotsByHost = new Map<string, string | null>();
  for (const entry of entries) {
    const id = typeof entry.id === "string" ? entry.id : "(missing id)";
    const url = typeof entry.url === "string" ? entry.url : "";
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      rows.push({ id, url, status: "bad-url" });
      continue;
    }
    const waited = lastByHost.get(host) ?? 0;
    const due = waited + 1000 - Date.now();
    if (due > 0) await new Promise((resolve) => setTimeout(resolve, due));
    lastByHost.set(host, Date.now());
    let robots = robotsByHost.get(host);
    if (robots === undefined) {
      robots = await readRobots(url);
      robotsByHost.set(host, robots);
      lastByHost.set(host, Date.now());
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (robots !== null && !allowed(url, robots, USER_AGENT)) {
      rows.push({ id, url, status: "robots-denied" });
      continue;
    }
    const status = await requestOnce(url);
    rows.push({ id, url, status });
  }
  return rows;
}

async function readRobots(url: string): Promise<string | null> {
  try {
    const robotsUrl = new URL("/robots.txt", url);
    const response = await fetch(robotsUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  }
}

async function requestOnce(url: string): Promise<string> {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (head.ok) return String(head.status);
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    return String(get.status);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.name : "error";
    return message;
  }
}

function printOnline(rows: readonly OnlineRow[]): number {
  let failed = 0;
  console.log("id\tstatus\turl");
  for (const row of rows) {
    console.log(`${row.id}\t${row.status}\t${row.url}`);
    if (!/^[23]\d\d$/.test(row.status)) failed += 1;
  }
  console.log(`online failures: ${failed}`);
  return failed;
}

async function main(): Promise<void> {
  const online = process.argv.includes("--online");
  const file = process.argv.find((arg) => arg.endsWith(".json")) ?? DEFAULT_PACK;
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  let seedText = "";
  const seedPath = path.resolve(here, "..", "..", "..", "hh-build-plan", "prompts", "202-gallery-seed.json");
  try {
    seedText = readFileSync(seedPath, "utf8");
  } catch {
    seedText = "";
  }
  const issues = validateGallery(parsed, { seedText, now: new Date() });
  if (issues.length > 0) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log(`Gallery pack ok (${Array.isArray(parsed) ? parsed.length : 0} rows).`);
  }
  if (!online || !Array.isArray(parsed)) return;
  const rows = await checkOnline(
    parsed.filter(isRecord).map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      url: typeof entry.url === "string" ? entry.url : "",
    })),
  );
  const failed = printOnline(rows);
  if (failed > 0) process.exitCode = 1;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const invoked = path.resolve(entry);
  const self = fileURLToPath(import.meta.url);
  if (process.platform === "win32") return invoked.toLowerCase() === self.toLowerCase();
  return invoked === self;
}

if (invokedDirectly()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Gallery validation failed.");
    process.exitCode = 1;
  });
}
