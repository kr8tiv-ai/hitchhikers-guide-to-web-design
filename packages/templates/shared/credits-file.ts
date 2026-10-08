/**
 * One parser for CREDITS.json.
 *
 * Writers in this repo emit three shapes:
 * - a top-level array of { name, author, license, link, usedFor, category } (3D fetcher)
 * - { entries: [{ name, url, sha256, licence, category }] } (upscaler cache)
 * - { assets: [{ file, source, license, author, url? }] } (starter media)
 *
 * CC0 and CC0-1.0 both mean public domain. The writer's spelling stays on the row.
 * Every field those writers set is kept. Empty string means that writer did not set it.
 *
 * Generated sites copy this file. The copy test asserts the bytes match.
 * Starter copies import this file by relative path and do not import the monorepo.
 */

export const ALLOWED_LICENSES = ["CC0", "CC0-1.0", "CC-BY-4.0"] as const;
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

export type CreditsOrigin = "array" | "entries" | "assets";

export interface CreditPageEntry {
  origin: CreditsOrigin;
  name: string;
  author: string;
  license: string;
  licence: string;
  link: string;
  usedFor: string;
  category: string;
  file: string;
  source: string;
  url: string;
  sha256: string;
  /** True when the writer wrote CC0 or CC0-1.0. */
  publicDomain: boolean;
}

export interface CreditsPageModel {
  entries: CreditPageEntry[];
}

export function isPublicDomain(license: string): boolean {
  return license === "CC0" || license === "CC0-1.0";
}

export function assertMediaLicense(license: string, file: string): asserts license is AllowedLicense {
  if ((ALLOWED_LICENSES as readonly string[]).includes(license)) return;
  throw new Error(`Refusing ${license} for ${file}. Allowed licenses are CC0 and CC-BY-4.0.`);
}

export function parseCredits(text: string): CreditsPageModel {
  return parseCreditsValue(JSON.parse(text) as unknown);
}

export function parseCreditsValue(value: unknown): CreditsPageModel {
  if (Array.isArray(value)) {
    return { entries: value.map((row, index) => fromArray(row, index)) };
  }
  if (!isRecord(value)) {
    throw new Error("CREDITS.json needs an assets array, an entries array, or a top-level array.");
  }
  const hasAssets = Object.prototype.hasOwnProperty.call(value, "assets");
  const hasEntries = Object.prototype.hasOwnProperty.call(value, "entries");
  if (!hasAssets && !hasEntries) {
    throw new Error("CREDITS.json needs an assets array, an entries array, or a top-level array.");
  }
  const entries: CreditPageEntry[] = [];
  if (hasAssets) {
    if (!Array.isArray(value.assets)) throw new Error("CREDITS.json needs an assets array.");
    entries.push(...value.assets.map((row, index) => fromAssets(row, index)));
  }
  if (hasEntries) {
    if (!Array.isArray(value.entries)) throw new Error("CREDITS.json needs an entries array.");
    entries.push(...value.entries.map((row, index) => fromEntries(row, index)));
  }
  return { entries };
}

/**
 * One plain-text line for the credits page. Paired spellings (license/licence,
 * file/name, source/link/url) show once when they carry the same text.
 */
export function creditLine(entry: CreditPageEntry): string {
  const parts: string[] = [];
  const push = (value: string): void => {
    if (value.length > 0) parts.push(value);
  };
  push(entry.file);
  if (entry.name.length > 0 && entry.name !== entry.file) push(entry.name);
  push(entry.author);
  push(entry.license);
  if (entry.licence.length > 0 && entry.licence !== entry.license) push(entry.licence);
  push(entry.source);
  if (entry.link.length > 0 && entry.link !== entry.source) push(entry.link);
  if (entry.url.length > 0 && entry.url !== entry.source && entry.url !== entry.link) push(entry.url);
  if (entry.usedFor.length > 0) parts.push(`Used for ${entry.usedFor}`);
  push(entry.category);
  if (entry.sha256.length > 0) parts.push(`sha256 ${entry.sha256}`);
  if (parts.length === 0) return "";
  return `${parts.join(". ")}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(row: Record<string, unknown>, key: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return "";
  const value = row[key];
  if (typeof value !== "string") throw new Error(label);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(label);
  return value;
}

function finish(entry: Omit<CreditPageEntry, "publicDomain">): CreditPageEntry {
  return {
    ...entry,
    publicDomain: isPublicDomain(entry.license) || isPublicDomain(entry.licence),
  };
}

function fromArray(row: unknown, index: number): CreditPageEntry {
  if (!isRecord(row)) throw new Error(`CREDITS.json row ${index} is not an object.`);
  const label = `CREDITS.json row ${index} needs name, author, license, link, usedFor, and category.`;
  const license = requiredString(row.license, label);
  const licence = optionalString(row, "licence", `CREDITS.json row ${index} licence must be a string.`);
  return finish({
    origin: "array",
    name: requiredString(row.name, label),
    author: requiredString(row.author, label),
    license,
    licence: licence.length > 0 ? licence : license,
    link: requiredString(row.link, label),
    usedFor: requiredString(row.usedFor, label),
    category: requiredString(row.category, label),
    file: optionalString(row, "file", `CREDITS.json row ${index} file must be a string.`),
    source: optionalString(row, "source", `CREDITS.json row ${index} source must be a string.`),
    url: optionalString(row, "url", `CREDITS.json row ${index} url must be a string.`),
    sha256: optionalString(row, "sha256", `CREDITS.json row ${index} sha256 must be a string.`),
  });
}

function fromEntries(row: unknown, index: number): CreditPageEntry {
  if (!isRecord(row)) throw new Error(`CREDITS.json entries row ${index} is not an object.`);
  const label = `CREDITS.json entries row ${index} needs name, url, sha256, licence, and category.`;
  const licence = requiredString(row.licence ?? row.license, label);
  const licenseText = optionalString(row, "license", `CREDITS.json entries row ${index} license must be a string.`);
  return finish({
    origin: "entries",
    name: requiredString(row.name, label),
    author: optionalString(row, "author", `CREDITS.json entries row ${index} author must be a string.`),
    license: licenseText.length > 0 ? licenseText : licence,
    licence,
    link: optionalString(row, "link", `CREDITS.json entries row ${index} link must be a string.`),
    usedFor: optionalString(row, "usedFor", `CREDITS.json entries row ${index} usedFor must be a string.`),
    category: requiredString(row.category, label),
    file: optionalString(row, "file", `CREDITS.json entries row ${index} file must be a string.`),
    source: optionalString(row, "source", `CREDITS.json entries row ${index} source must be a string.`),
    url: requiredString(row.url, label),
    sha256: requiredString(row.sha256, label),
  });
}

function fromAssets(row: unknown, index: number): CreditPageEntry {
  if (!isRecord(row)) throw new Error("A credit entry is not an object.");
  const file = row.file;
  const source = row.source;
  const license = row.license;
  const author = row.author;
  if (typeof file !== "string" || typeof source !== "string" || typeof license !== "string" || typeof author !== "string") {
    throw new Error("A credit entry needs file, source, license, and author.");
  }
  if (typeof row.url !== "undefined" && typeof row.url !== "string") throw new Error("A credit url must be a string.");
  const label = `CREDITS.json assets row ${index}`;
  const licence = optionalString(row, "licence", `${label} licence must be a string.`);
  return finish({
    origin: "assets",
    name: optionalString(row, "name", `${label} name must be a string.`),
    author,
    license,
    licence: licence.length > 0 ? licence : license,
    link: optionalString(row, "link", `${label} link must be a string.`),
    usedFor: optionalString(row, "usedFor", `${label} usedFor must be a string.`),
    category: optionalString(row, "category", `${label} category must be a string.`),
    file,
    source,
    url: typeof row.url === "string" ? row.url : "",
    sha256: optionalString(row, "sha256", `${label} sha256 must be a string.`),
  });
}
