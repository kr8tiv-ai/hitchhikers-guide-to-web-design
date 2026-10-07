/**
 * Deterministic why shaper.
 * The live finder is a later model call through the 011 adapter.
 * This module only trims, labels, and refuses hype. It does not call a model.
 * No book quote is added. Stored answers stay text.
 */

import type { AnswerRecord } from "../required.ts";

export interface WhyDraft {
  siteWhy: string;
  brandWhy: string;
  status: "ANSWERED" | "ASSUMED" | "IMPORTED";
  warnings: string[];
  siteTruncated: boolean;
}

export class WhyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhyError";
  }
}

/** Whole words only. `innovation` stays. `innovative` does not. */
const BANNED = ["innovative", "elevate", "seamless", "cutting-edge", "passionate"] as const;

const SITE_ID = "DP-2.1";
const VISITOR_ID = "DP-2.6";
const OFFER_ID = "DP-2.7";
const BRAND_ID = "DP-1.7";

/** One sentence. Longer answers cut on a word, not mid-token, when a space exists. */
const SITE_LIMIT = 240;

/** A real brand why is kept at this length. Shorter stubs are deferred. */
const BRAND_MIN_WORDS = 8;

interface Cleaned {
  text: string;
  warnings: string[];
}

/**
 * compileWhy reads DP-2.1, DP-2.6, DP-2.7, and DP-1.7.
 * The last record for an id wins.
 * A qualifying DP-1.7 (ANSWERED or IMPORTED, at least 8 words) is kept.
 * IMPORTED stays IMPORTED so an import is not relabeled as an interview answer.
 * Anything else is an ASSUMED draft: visitor comes for offer because site why.
 * A missing offer uses the site why alone. No adjectives are added.
 * A SKIPPED site why is allowed when the text is present. That derived draft stays ASSUMED.
 */
export function compileWhy(answers: readonly AnswerRecord[]): WhyDraft {
  const site = latest(answers, SITE_ID);
  const siteClean = clean(site?.value ?? "", "site why");
  if (siteClean.text === "") {
    throw new WhyError("Missing DP-2.1. The site why cannot be blank.");
  }

  const limited = truncateOnWord(siteClean.text, SITE_LIMIT);
  if (limited.text === "") {
    throw new WhyError("Missing DP-2.1. The site why cannot be blank.");
  }

  const warnings = [...siteClean.warnings];
  const brand = latest(answers, BRAND_ID);
  const kept = keepBrand(brand);

  let brandWhy: string;
  let status: WhyDraft["status"];

  if (kept !== null) {
    const brandClean = clean(kept.value, "brand why");
    if (brandClean.text === "") {
      const assumed = assumeBrand(answers, limited.text);
      brandWhy = assumed.brandWhy;
      status = "ASSUMED";
      warnings.push(...assumed.warnings);
    } else {
      brandWhy = brandClean.text;
      status = kept.status;
      warnings.push(...brandClean.warnings);
    }
  } else {
    const assumed = assumeBrand(answers, limited.text);
    brandWhy = assumed.brandWhy;
    status = "ASSUMED";
    warnings.push(...assumed.warnings);
  }

  rejectDirty(limited.text, brandWhy);

  return {
    siteWhy: limited.text,
    brandWhy,
    status,
    warnings,
    siteTruncated: limited.truncated,
  };
}

function keepBrand(record: AnswerRecord | undefined): { value: string; status: "ANSWERED" | "IMPORTED" } | null {
  if (record === undefined) return null;
  if (record.status !== "ANSWERED" && record.status !== "IMPORTED") return null;
  if (wordCount(record.value) < BRAND_MIN_WORDS) return null;
  return { value: record.value, status: record.status };
}

function assumeBrand(answers: readonly AnswerRecord[], siteWhy: string): { brandWhy: string; warnings: string[] } {
  const offerRecord = latest(answers, OFFER_ID);
  const offerRaw = offerRecord?.value ?? "";
  if (offerRaw.trim() === "") return { brandWhy: siteWhy, warnings: [] };

  const offer = clean(offerRaw, "offer");
  if (offer.text === "") return { brandWhy: siteWhy, warnings: offer.warnings };

  const visitorRecord = latest(answers, VISITOR_ID);
  const visitorRaw = visitorRecord?.value ?? "";
  const visitor = clean(visitorRaw, "visitor");
  if (visitor.text === "") {
    const warnings = [...offer.warnings];
    if (visitorRaw.trim() !== "") warnings.push(...visitor.warnings);
    return {
      brandWhy: `Comes for ${offer.text} because ${siteWhy}`,
      warnings,
    };
  }

  return {
    brandWhy: `${visitor.text} comes for ${offer.text} because ${siteWhy}`,
    warnings: [...visitor.warnings, ...offer.warnings],
  };
}

function latest(answers: readonly AnswerRecord[], id: string): AnswerRecord | undefined {
  let found: AnswerRecord | undefined;
  for (const answer of answers) {
    if (answer.id === id) found = answer;
  }
  return found;
}

function clean(raw: string, field: string): Cleaned {
  const warnings: string[] = [];
  let text = raw.replace(/\s+/g, " ").trim();
  const stripped = stripBanned(text);
  text = stripped.text;
  for (const word of stripped.removed) {
    warnings.push(`Stripped banned word "${word}" from ${field}.`);
  }
  if (text.includes("!")) {
    text = text.replace(/!+/g, "");
    warnings.push(`Stripped an exclamation mark from ${field}.`);
  }
  text = text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.;:])/g, "$1").trim();
  return { text, warnings };
}

function stripBanned(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const next = text.replace(bannedPattern("gi"), (match) => {
    const canonical = match.toLowerCase();
    if (!removed.includes(canonical)) removed.push(canonical);
    return " ";
  });
  return { text: next, removed };
}

function bannedPattern(flags: string): RegExp {
  const body = BANNED.map(escapeRegExp).join("|");
  return new RegExp(`\\b(?:${body})\\b`, flags);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordCount(value: string): number {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "") return 0;
  return trimmed.split(" ").length;
}

/**
 * Keep the longest whole-word prefix that fits.
 * A single token longer than the limit has no boundary, so the cut is the limit.
 */
function truncateOnWord(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const window = text.slice(0, limit);
  const next = text[limit];
  if (next !== undefined && /\s/.test(next)) {
    return { text: window.trimEnd(), truncated: true };
  }
  if (/\s$/.test(window)) {
    return { text: window.trimEnd(), truncated: true };
  }
  const boundary = lastWhitespace(window);
  if (boundary <= 0) return { text: window, truncated: true };
  return { text: window.slice(0, boundary).trimEnd(), truncated: true };
}

function lastWhitespace(value: string): number {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char !== undefined && /\s/.test(char)) return index;
  }
  return -1;
}

function rejectDirty(siteWhy: string, brandWhy: string): void {
  for (const text of [siteWhy, brandWhy]) {
    if (text.includes("!")) {
      throw new WhyError("Why text still contains an exclamation mark.");
    }
    const hit = text.match(bannedPattern("i"));
    const word = hit?.[0];
    if (word !== undefined) {
      throw new WhyError(`Why text still contains a banned word: ${word.toLowerCase()}.`);
    }
  }
}
