/**
 * Page structure and weight gate (prompt 124, v2 §12, v2 §15.3, seo pack).
 *
 * The caller supplies the title, the h1 count, the crawlable text length,
 * broken in-site hrefs, and the page size in bytes. This module does not
 * open a network connection. Collecting links is later wiring.
 *
 * budgetBytes is the page-byte ceiling for an interview appetite level
 * (v2 §8.3, levels 1–10). Levels 1–2 stay at 500_000 bytes, under a
 * megabyte, so a calm page cannot carry a physics payload. Levels 9–10
 * may reach 8_000_000. Research 06's 90/160/250 KB rows are initial JS
 * gzip. They are a different measurement and are not this ceiling.
 *
 * A title that trims to nothing is empty. textLength of 40 passes.
 * Bytes equal to the ceiling pass. One byte over blocks.
 */

/** Crawlable characters required before a page can pass. */
const TEXT_MIN = 40;

/**
 * Inclusive top of each appetite band, then the page-byte ceiling.
 * Bands: 1–2, 3–5, 6–8, 9–10.
 */
const BANDS = [
  { through: 2, bytes: 500_000 },
  { through: 5, bytes: 1_500_000 },
  { through: 8, bytes: 4_000_000 },
  { through: 10, bytes: 8_000_000 },
] as const;

export interface PageWeightInput {
  title: string;
  h1Count: number;
  textLength: number;
  brokenLinks: string[];
  bytes: number;
  appetite: number;
}

export interface PageWeightResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function label(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    return String(value);
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

/** Interview appetite is a whole level from 1 to 10. Anything else throws. */
function readAppetite(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(`${label(value)} is not an integer from 1 to 10.`);
  }
  return value;
}

function ceiling(appetite: number): number {
  for (const band of BANDS) {
    if (appetite <= band.through) return band.bytes;
  }
  throw new Error(`${appetite} is not an integer from 1 to 10.`);
}

function readTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`title is ${label(value)}. Expected a string.`);
  }
  return value;
}

function readWhole(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} is ${label(value)}. Expected a whole number from 0 up.`);
  }
  return value;
}

function readLinks(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`brokenLinks is ${label(value)}. Expected a list of hrefs.`);
  }
  const links: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const href = value[index];
    if (typeof href !== "string") {
      throw new Error(`brokenLinks[${index}] is ${label(href)}. Expected an href string.`);
    }
    links.push(href);
  }
  return links;
}

/** Page-byte ceiling for an appetite level. Does not look at a page. */
export function budgetBytes(appetite: number): number {
  return ceiling(readAppetite(appetite));
}

/**
 * Judge one page from caller-supplied facts.
 * Reasons list every failure. Status is BLOCKER when any reason exists.
 * An appetite outside 1–10 throws instead of returning a verdict.
 */
export function evaluatePage(input: PageWeightInput): PageWeightResult {
  if (!isRecord(input)) {
    throw new Error(`evaluatePage input is ${label(input)}. Expected an object.`);
  }
  const title = readTitle(input.title);
  const h1Count = readWhole(input.h1Count, "h1Count");
  const textLength = readWhole(input.textLength, "textLength");
  const brokenLinks = readLinks(input.brokenLinks);
  const bytes = readWhole(input.bytes, "bytes");
  const appetite = readAppetite(input.appetite);
  const budget = ceiling(appetite);

  const reasons: string[] = [];
  if (title.trim().length === 0) reasons.push("Title is empty.");
  if (h1Count !== 1) reasons.push(`Heading count is ${h1Count}. Expected one h1.`);
  if (textLength < TEXT_MIN) {
    reasons.push(`Crawlable text is ${textLength} characters. Expected at least ${TEXT_MIN}.`);
  }
  for (const href of brokenLinks) {
    reasons.push(`Broken link ${href}.`);
  }
  if (bytes > budget) {
    reasons.push(`Page is ${bytes} bytes. Appetite ${appetite} allows ${budget}.`);
  }

  return {
    status: reasons.length > 0 ? "BLOCKER" : "PASS",
    reasons,
  };
}
