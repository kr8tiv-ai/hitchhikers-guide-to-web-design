import type { CrawlResult } from "./crawl.ts";

/**
 * A reference note must be at least this many characters after trimming.
 * Twelve is long enough to be a clause. It rejects an empty note, and it
 * rejects a note that is only "nice", "cool", or "love it".
 */
export const REFERENCE_NOTE_MIN_LENGTH = 12;

/** Words shorter than this are dropped before title sets are compared. */
const MIN_TITLE_WORD = 4;

/** Competitor reports refuse a fourth result. */
const MAX_COMPETITORS = 3;

const NO_SHARED_TITLE_PATTERN = "No shared title pattern in this set.";

const FILLER_NOTES = new Set(["nice", "cool", "love it"]);

/**
 * Significant words in first-seen order. Lowercase, then split on anything
 * that is not a letter, mark, or number. The same path runs for every
 * script. Sets ignore order and repeated words. An extra kept word makes
 * the sets unequal, so a partial overlap is not a match.
 */
function titleWords(title: string): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const token of title.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (token.length < MIN_TITLE_WORD) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    words.push(token);
  }
  return words;
}

function bagKey(words: readonly string[]): string {
  return [...words].sort().join("\0");
}

function headings(h1: readonly string[]): string[] {
  return h1.filter((heading) => heading.trim().length > 0);
}

/**
 * Sea of sameness for titles. Two titles match when their kept-word sets
 * are equal. An empty set is not a pattern. Otherwise the line names the
 * shared words.
 */
export function sameness(results: CrawlResult[]): string {
  const groups = new Map<string, { count: number; words: string[] }>();
  for (const result of results) {
    const words = titleWords(result.title);
    if (words.length === 0) continue;
    const key = bagKey(words);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
    } else {
      groups.set(key, { count: 1, words });
    }
  }

  const lines: string[] = [];
  for (const group of groups.values()) {
    if (group.count < 2) continue;
    lines.push(`A shared title pattern: ${group.words.join(" ")}.`);
  }
  if (lines.length === 0) return NO_SHARED_TITLE_PATTERN;
  return lines.join("\n");
}

/**
 * COMPETITORS.md body from crawl fields only. Loved for stays a blank
 * underscore: this module does not invent a reason. Descriptions and h1s
 * are copied. Search volumes are not estimated.
 */
export function buildCompetitorReport(results: CrawlResult[]): string {
  if (results.length > MAX_COMPETITORS) {
    throw new Error(
      `At most ${MAX_COMPETITORS} competitor results can enter the report. Received ${results.length}.`,
    );
  }

  const lines: string[] = ["# Competitors", "", sameness(results), ""];

  for (const result of results) {
    lines.push(`## ${result.finalUrl}`, "");
    lines.push(`- URL: ${result.finalUrl}`);
    lines.push(`- Title: ${result.title}`);
    const found = headings(result.h1);
    if (found.length === 0) {
      lines.push("- H1: No h1 found");
    } else {
      for (const heading of found) lines.push(`- H1: ${heading}`);
    }
    lines.push(`- Stack: ${result.stackHint}`);
    lines.push("- Loved for: _");
    lines.push("");
  }

  lines.push("## SEO", "");
  let wrotePhrase = false;
  for (const result of results) {
    if (result.description.trim().length > 0) {
      lines.push(`- Description: ${result.description}`);
      wrotePhrase = true;
    }
    for (const heading of headings(result.h1)) {
      lines.push(`- H1: ${heading}`);
      wrotePhrase = true;
    }
  }
  if (!wrotePhrase) {
    lines.push("No meta description or h1 in this set.");
  }
  lines.push("");
  lines.push("Search volumes are not estimated.");
  lines.push("");
  return lines.join("\n");
}

function requireReferenceNote(note: string): string {
  const trimmed = note.trim();
  const filler = FILLER_NOTES.has(trimmed.toLowerCase());
  if (trimmed.length === 0 || filler || trimmed.length < REFERENCE_NOTE_MIN_LENGTH) {
    throw new Error(
      `Reference note must be at least ${REFERENCE_NOTE_MIN_LENGTH} characters so the why is a clause. Empty notes and the phrases nice, cool, and love it are rejected.`,
    );
  }
  return trimmed;
}

/**
 * A loved-site card for DP-5.1. The note is the user's reason. A blank,
 * a filler phrase, or anything shorter than REFERENCE_NOTE_MIN_LENGTH throws.
 * The URL is printed as given.
 */
export function referenceCard(input: { url: string; note: string }): string {
  const note = requireReferenceNote(input.note);
  return ["# Reference", "", `- URL: ${input.url}`, `- Loved for: ${note}`, ""].join("\n");
}
