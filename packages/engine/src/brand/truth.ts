/**
 * Brand-copy truth gate.
 * lintClaims is meant to run on story and voice markdown before they are saved.
 * It returns hits. It does not rewrite the markdown. The caller decides.
 * It does not call the network, and it is not a general fact checker.
 *
 * Three claim patterns, plus one heading:
 * - stars: `\b\d(\.\d)? stars?\b` unless that phrase is in evidence.quotes
 * - percent: digits glued to `%` unless those digits are in evidence.numbers
 * - award-winning, in either letter case, unless evidence.awards is non-empty
 * - a line `## Testimonials` unless evidence.quotes has an entry
 *
 * A trailing word boundary after `%` does not match before a space or a
 * semicolon, so the percent scan is `\b\d+%`. A percent in a CSS note is
 * still a hit. Callers should not pass CSS to this linter.
 *
 * evidenceFromAnswers keeps ANSWERED and IMPORTED values only.
 * SKIPPED, SOFT, and SUGGESTED do not become evidence.
 * A value is quote evidence when it contains a star phrase, the word
 * testimonial, or a double quotation mark. A value is award evidence when
 * it contains the word award or awards. Number evidence is each digit run
 * in a kept value. A skipped "5 stars" does not license that phrase.
 */

import type { AnswerRecord } from "../required.ts";

export interface Evidence {
  quotes: string[];
  awards: string[];
  numbers: string[];
}

const STAR_NAME = "stars";
const PERCENT_NAME = "percent";
const AWARD_NAME = "award-winning";
const TESTIMONIAL_NAME = "testimonials";

const STAR_SOURCE = String.raw`\b\d(\.\d)? stars?\b`;
const PERCENT_SOURCE = String.raw`\b\d+%`;
const AWARD_SOURCE = String.raw`\baward-winning\b`;

const KEPT_STATUS = new Set<AnswerRecord["status"]>(["ANSWERED", "IMPORTED"]);

export function lintClaims(
  markdown: string,
  evidence: Evidence,
): { ok: boolean; hits: { line: number; pattern: string }[] } {
  const hits: { line: number; pattern: string }[] = [];
  if (markdown === "") return { ok: true, hits };
  const lines = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const awardsOpen = evidence.awards.length > 0;
  const quotesOpen = evidence.quotes.length > 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNo = index + 1;
    for (const phrase of findAll(line, STAR_SOURCE, "gi")) {
      if (!phraseInQuotes(phrase, evidence.quotes)) {
        hits.push({ line: lineNo, pattern: STAR_NAME });
      }
    }
    for (const token of findAll(line, PERCENT_SOURCE, "g")) {
      if (!digitsInNumbers(digitsOf(token), evidence.numbers)) {
        hits.push({ line: lineNo, pattern: PERCENT_NAME });
      }
    }
    if (!awardsOpen) {
      const awardHits = findAll(line, AWARD_SOURCE, "gi").length;
      for (let count = 0; count < awardHits; count += 1) {
        hits.push({ line: lineNo, pattern: AWARD_NAME });
      }
    }
    if (!quotesOpen && isTestimonialHeading(line)) {
      hits.push({ line: lineNo, pattern: TESTIMONIAL_NAME });
    }
  }
  return { ok: hits.length === 0, hits };
}

/**
 * Pull proof text from the answer file.
 * The latest record is not special: every ANSWERED or IMPORTED value counts,
 * and a later SKIPPED or SOFT record does not erase an earlier kept value.
 */
export function evidenceFromAnswers(answers: AnswerRecord[]): Evidence {
  const quotes: string[] = [];
  const awards: string[] = [];
  const numbers: string[] = [];
  for (const answer of answers) {
    if (!KEPT_STATUS.has(answer.status)) continue;
    const value = answer.value.trim();
    if (value === "") continue;
    if (isQuoteEvidence(value)) quotes.push(value);
    if (isAwardEvidence(value)) awards.push(value);
    for (const run of value.matchAll(/\d+/g)) {
      const digits = run[0];
      if (digits !== undefined && digits !== "") numbers.push(digits);
    }
  }
  return { quotes, awards, numbers };
}

function isQuoteEvidence(value: string): boolean {
  if (findAll(value, STAR_SOURCE, "gi").length > 0) return true;
  if (/\btestimonials?\b/i.test(value)) return true;
  if (value.includes("\"") || value.includes("\u201c") || value.includes("\u201d")) return true;
  return false;
}

function isAwardEvidence(value: string): boolean {
  return /\bawards?\b/i.test(value);
}

function isTestimonialHeading(line: string): boolean {
  return line.trim().replace(/\s+/g, " ").toLowerCase() === "## testimonials";
}

function phraseInQuotes(phrase: string, quotes: readonly string[]): boolean {
  const pattern = new RegExp(String.raw`(?:^|\W)${escapeRegExp(phrase)}(?:$|\W)`, "i");
  for (const quote of quotes) {
    if (pattern.test(quote)) return true;
  }
  return false;
}

function digitsOf(token: string): string {
  const match = /(\d+)/.exec(token);
  return match?.[1] ?? "";
}

function digitsInNumbers(digits: string, numbers: readonly string[]): boolean {
  if (digits === "") return false;
  const pattern = new RegExp(String.raw`(?:^|\D)${digits}(?:$|\D)`);
  for (const entry of numbers) {
    if (pattern.test(entry)) return true;
  }
  return false;
}

function findAll(line: string, source: string, flags: string): string[] {
  const pattern = new RegExp(source, flags);
  const found: string[] = [];
  for (const match of line.matchAll(pattern)) {
    found.push(match[0]);
  }
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
