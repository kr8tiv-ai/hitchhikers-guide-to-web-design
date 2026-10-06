import type { Facts } from "./schemas.ts";

/**
 * Guide copy checks. One question, no banned words, no invented proof.
 * TODO(058): replace lintClaims with the shared lintClaims from prompt 058.
 * Matching uses indexOf and a character scan, not a regular expression on the text.
 */

const BANNED_WORDS = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "journey",
  "tapestry",
  "landscape",
] as const;

const BANNED_PHRASES = [
  "game-changer",
  "game changer",
  "cutting-edge",
  "cutting edge",
  "in today's fast-paced world",
  "it's not just",
  "in a world where",
] as const;

const EN_FUNCTION = ["the", "a", "you", "what", "how", "is"] as const;

/** Detection markers. "a" and "la" are too weak to flip the language. */
const EN_DETECT = ["the", "you", "what", "how", "is", "and", "for", "with", "this", "have", "your"] as const;
const ES_MARKERS = ["para", "que", "sitio", "una", "tienda", "como", "quiero", "cómo"] as const;

const TESTIMONIAL_PHRASES = ["customer said", "customers say", "five star", "5 star"] as const;
const AWARD_PHRASES = ["winner of", "award winning", "award-winning"] as const;
const AWARD_WORDS = ["award", "awards", "soty", "sotd"] as const;

export function questionCount(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (ch === "?" || ch === "\uFF1F") count += 1;
  }
  return count;
}

/** Strict winner only. Fewer than two markers, or a tie, returns null. */
export function detectLanguage(text: string): "en" | "es" | null {
  const words = tokens(text);
  let en = 0;
  let es = 0;
  for (const word of words) {
    if (includesWord(EN_DETECT, word)) en += 1;
    if (includesWord(ES_MARKERS, word)) es += 1;
  }
  if (es >= 2 && es > en) return "es";
  if (en >= 2 && en > es) return "en";
  return null;
}

/**
 * Local stand-in until prompt 058 ships the shared claim linter.
 * TODO(058): replace this stub with lintClaims from prompt 058.
 * A digit run is allowed when the facts corpus contains that exact run.
 */
export function lintClaims(text: string, facts: Facts): string[] {
  const issues: string[] = [];
  const corpus = factsCorpus(facts);
  const normalized = normalize(text);
  const words = tokens(text);
  for (const run of digitRuns(text)) {
    if (corpus.indexOf(run) === -1) issues.push(`claim:number:${run}`);
  }
  if (words.includes("testimonial") && corpus.indexOf("testimonial") === -1) {
    issues.push("claim:testimonial");
  }
  for (const phrase of TESTIMONIAL_PHRASES) {
    if (normalized.indexOf(phrase) !== -1 && corpus.indexOf(phrase) === -1) {
      issues.push("claim:testimonial");
    }
  }
  for (const word of AWARD_WORDS) {
    if (words.includes(word) && !corpusHasWord(corpus, word)) issues.push("claim:award");
  }
  for (const phrase of AWARD_PHRASES) {
    if (normalized.indexOf(phrase) !== -1 && corpus.indexOf(phrase) === -1) {
      issues.push("claim:award");
    }
  }
  return issues;
}

/** Banned words, punctuation, invented proof, and language. No question-count rule. */
export function guideTextIssues(text: string, ctx: { language: string; facts: Facts }): string[] {
  const issues: string[] = [];
  if (text.indexOf("!") !== -1) issues.push("exclamation");
  if (text.indexOf("\u2014") !== -1) issues.push("em-dash");
  const normalized = normalize(text);
  const words = tokens(text);
  for (const banned of BANNED_WORDS) {
    if (words.includes(banned)) issues.push(`banned:${banned}`);
  }
  for (const phrase of BANNED_PHRASES) {
    if (normalized.indexOf(phrase) !== -1) issues.push(`banned:${phrase}`);
  }
  issues.push(...lintClaims(text, ctx.facts));
  issues.push(...languageIssues(text, ctx.language));
  return issues;
}

/** Guide message: guideTextIssues plus exactly one question. */
export function validateGuideMessage(msg: string, ctx: { language: string; facts: Facts }): string[] {
  const issues = guideTextIssues(msg, ctx);
  if (questionCount(msg) !== 1) issues.push("questions");
  return issues;
}

export function tokens(text: string): string[] {
  const normalized = normalize(text);
  const out: string[] = [];
  let current = "";
  for (const ch of normalized) {
    if (isWordChar(ch)) current += ch;
    else if (current !== "") {
      out.push(current);
      current = "";
    }
  }
  if (current !== "") out.push(current);
  return out;
}

function languageIssues(text: string, language: string): string[] {
  const words = tokens(text);
  if (language === "en") {
    const ok = words.some((word) => includesWord(EN_FUNCTION, word));
    if (!ok || majorityNonLatin(text)) return ["language"];
    return [];
  }
  if (language === "es") {
    const ok = words.some((word) => includesWord(ES_MARKERS, word));
    return ok ? [] : ["language"];
  }
  const detected = detectLanguage(text);
  if (detected !== null && detected !== language) return ["language"];
  return [];
}

function factsCorpus(facts: Facts): string {
  const parts: string[] = [];
  for (const answer of facts.answers) {
    parts.push(answer.id, answer.value);
  }
  parts.push(...facts.uploads, ...facts.crawlNotes);
  if (facts.industry !== undefined) parts.push(facts.industry);
  return normalize(parts.join("\n"));
}

function corpusHasWord(corpus: string, word: string): boolean {
  return tokens(corpus).includes(word);
}

function digitRuns(text: string): string[] {
  const runs: string[] = [];
  let current = "";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") current += ch;
    else if (current !== "") {
      runs.push(current);
      current = "";
    }
  }
  if (current !== "") runs.push(current);
  return runs;
}

function normalize(text: string): string {
  return text.toLowerCase().replaceAll("\u2019", "'").replaceAll("\u2018", "'");
}

function includesWord(list: readonly string[], word: string): boolean {
  for (const item of list) {
    if (item === word) return true;
  }
  return false;
}

function isWordChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 48 && code <= 57) return true;
  if (code >= 97 && code <= 122) return true;
  if (ch === "'") return true;
  if (code >= 0x00e0 && code <= 0x00ff && code !== 0x00f7) return true;
  return false;
}

function isLatinLetter(code: number): boolean {
  if (code >= 65 && code <= 90) return true;
  if (code >= 97 && code <= 122) return true;
  if (code >= 0x00c0 && code <= 0x024f) return true;
  return false;
}

function majorityNonLatin(text: string): boolean {
  let latin = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const letter =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 0x00c0 && code > 0 && isLetterCode(code));
    if (!letter) continue;
    if (isLatinLetter(code)) latin += 1;
    else other += 1;
  }
  if (latin + other === 0) return false;
  return other > latin;
}

function isLetterCode(code: number): boolean {
  if (code >= 65 && code <= 90) return true;
  if (code >= 97 && code <= 122) return true;
  if (code >= 0x00c0 && code <= 0x02ff) return true;
  if (code >= 0x0370 && code <= 0x1fff) return true;
  return false;
}
