import type { Question } from "../tree.ts";

/**
 * Expected answer shape for the pushback judge.
 * The user text is scanned with indexOf, never a regular expression.
 */

export type AnswerShape = "number" | "yes-no" | "names" | "colour" | "free";

export interface AnswerClassification {
  shape: AnswerShape;
  concreteLikely: boolean;
  evidence: string;
}

const INSPECT = 500;

const UNITS = [
  "month",
  "months",
  "week",
  "weeks",
  "day",
  "days",
  "year",
  "years",
  "hour",
  "hours",
  "percent",
  "inquiry",
  "inquiries",
  "call",
  "calls",
  "booking",
  "bookings",
  "sale",
  "sales",
  "visitor",
  "visitors",
  "usd",
  "dollar",
  "dollars",
  "qualified",
] as const;

const COLOUR_WORDS = [
  "jungle",
  "green",
  "gold",
  "sunset",
  "ocean",
  "blue",
  "sand",
  "black",
  "ember",
  "white",
  "red",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "grey",
  "gray",
  "teal",
  "navy",
  "cream",
] as const;

const TLDS = ["com", "org", "net", "io", "example", "co", "cr"] as const;

const NAME_STOP = new Set([
  "the",
  "a",
  "an",
  "i",
  "we",
  "you",
  "what",
  "how",
  "should",
  "do",
  "does",
  "yes",
  "no",
  "similar",
  "loved",
  "and",
  "or",
  "if",
  "when",
  "this",
  "that",
  "from",
  "with",
  "for",
  "take",
  "one",
  "both",
]);

const YES_NO = new Set(["yes", "no", "yeah", "nope", "yep"]);

const SOFT_PHRASES = ["it's fine", "whatever", "you decide", "idk", "something modern", "make it pop"] as const;

const OVERRIDE_MARKS = [
  "direct yes or no",
  "named colours",
  "url or domain",
  "named brands",
  "named fonts",
  "named places",
] as const;

/**
 * True when the answer is concrete enough that a cited gap must not push.
 * A number with a unit does not override. The judge still runs.
 */
export function modelOverride(classification: AnswerClassification): boolean {
  if (!classification.concreteLikely) return false;
  for (const mark of OVERRIDE_MARKS) {
    if (classification.evidence.indexOf(mark) !== -1) return true;
  }
  return false;
}

/** Shape, plus whether the answer already looks concrete. The judge still runs. */
export function classifyAnswer(question: Question, text: string, followUp?: string): AnswerClassification {
  const shape = expectedShape(question, followUp);
  const sample = text.slice(0, INSPECT);
  const evidence: string[] = [];
  if (hasNumberWithUnit(sample)) evidence.push("number with a unit or period");
  if (hasDomain(sample)) evidence.push("url or domain");
  if (hasNamedColours(sample)) evidence.push("named colours or a hex value");
  if (properNameCount(sample) >= 2) evidence.push("named brands or sites");
  if (shape === "yes-no" && isDirectYesNo(sample)) evidence.push("direct yes or no");
  if (evidence.length === 0 && isShortPick(question, sample)) evidence.push("short answer on a pick question");
  return {
    shape,
    concreteLikely: evidence.length > 0,
    evidence: evidence.length === 0 ? "none" : evidence.join(", "),
  };
}

export function expectedShape(question: Question, followUp?: string): AnswerShape {
  const follow = (followUp ?? "").trim();
  if (follow !== "" && isYesNoAsk(follow)) return "yes-no";
  const ask = question.ask;
  const topic = (question.topic ?? "").toLowerCase();
  if (topic === "palette" || includesWord(ask.toLowerCase(), "colour") || includesWord(ask.toLowerCase(), "color") || ask.toLowerCase().indexOf("colors") !== -1 || ask.toLowerCase().indexOf("colours") !== -1) {
    return "colour";
  }
  if (topic === "outcomes" || ask.toLowerCase().indexOf("how many") !== -1 || ask.toLowerCase().indexOf("a month") !== -1) {
    return "number";
  }
  if (
    topic === "competitors" ||
    topic === "references" ||
    topic === "kindred" ||
    ask.toLowerCase().indexOf("competitor") !== -1 ||
    ask.toLowerCase().indexOf("brands") !== -1 ||
    ask.toLowerCase().indexOf("sites you love") !== -1
  ) {
    return "names";
  }
  if (isYesNoAsk(ask)) return "yes-no";
  return "free";
}

function isYesNoAsk(ask: string): boolean {
  const lower = ask.trim().toLowerCase();
  if (lower.indexOf("yes or no") !== -1) return true;
  const first = lower.split(" ")[0] ?? "";
  return (
    first === "do" ||
    first === "does" ||
    first === "did" ||
    first === "is" ||
    first === "are" ||
    first === "was" ||
    first === "were" ||
    first === "should" ||
    first === "can" ||
    first === "could" ||
    first === "will" ||
    first === "would" ||
    first === "have" ||
    first === "has"
  );
}

function hasNumberWithUnit(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index] ?? "";
    if (ch < "0" || ch > "9") continue;
    let end = index;
    while (end < text.length && (text[end] ?? "") >= "0" && (text[end] ?? "") <= "9") end += 1;
    let cursor = end;
    while (cursor < text.length && text[cursor] === " ") cursor += 1;
    const next = text[cursor] ?? "";
    const after = text[cursor + 1] ?? "";
    if (next === "." && (after === "" || after === " " || after === "\n")) return true;
    const tail = text.slice(end, Math.min(text.length, end + 48)).toLowerCase();
    if (tail.indexOf("%") !== -1) return true;
    for (const unit of UNITS) {
      if (hasWord(tail, unit)) return true;
    }
    index = end - 1;
  }
  return false;
}

function hasDomain(text: string): boolean {
  const sample = text.toLowerCase();
  if (sample.indexOf("https://") !== -1 || sample.indexOf("http://") !== -1) return true;
  let from = 0;
  while (from < sample.length) {
    const dot = sample.indexOf(".", from);
    if (dot < 0) return false;
    let start = dot - 1;
    while (start >= 0 && isHost(sample[start] ?? "")) start -= 1;
    if (start + 1 < dot) {
      for (const tld of TLDS) {
        if (sample.startsWith(tld, dot + 1)) {
          const after = sample[dot + 1 + tld.length] ?? " ";
          if (!isHost(after)) return true;
        }
      }
    }
    from = dot + 1;
  }
  return false;
}

function hasNamedColours(text: string): boolean {
  if (hasHex(text)) return true;
  const padded = ` ${soften(text.toLowerCase())} `;
  let count = 0;
  for (const word of COLOUR_WORDS) {
    if (padded.indexOf(` ${word} `) !== -1) count += 1;
  }
  return count >= 3;
}

function hasHex(text: string): boolean {
  const lower = text.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const mark = lower.indexOf("#", from);
    if (mark < 0) return false;
    let size = 0;
    let cursor = mark + 1;
    while (cursor < lower.length && isHex(lower[cursor] ?? "")) {
      size += 1;
      cursor += 1;
    }
    if ((size === 3 || size === 6 || size === 8) && !isHost(lower[cursor] ?? " ")) return true;
    from = mark + 1;
  }
  return false;
}

function properNameCount(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    while (index < text.length && !isLetter(text[index] ?? "")) index += 1;
    const start = index;
    while (index < text.length && (isLetter(text[index] ?? "") || isDigit(text[index] ?? ""))) index += 1;
    if (start === index) continue;
    const word = text.slice(start, index);
    const first = word[0] ?? "";
    if (first < "A" || first > "Z") continue;
    if (!hasLower(word) && word.length < 3) continue;
    if (NAME_STOP.has(word.toLowerCase())) continue;
    count += 1;
  }
  return count;
}

function isDirectYesNo(text: string): boolean {
  let trimmed = text.trim().toLowerCase();
  if (trimmed.endsWith(".")) trimmed = trimmed.slice(0, -1).trim();
  return YES_NO.has(trimmed);
}

function isShortPick(question: Question, text: string): boolean {
  if (!question.input.includes("choice")) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 160) return false;
  const lower = trimmed.toLowerCase();
  for (const phrase of SOFT_PHRASES) {
    if (lower.indexOf(phrase) !== -1) return false;
  }
  return true;
}

function includesWord(hay: string, word: string): boolean {
  return hasWord(hay, word);
}

function hasWord(hay: string, word: string): boolean {
  let from = 0;
  while (from < hay.length) {
    const at = hay.indexOf(word, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : (hay[at - 1] ?? " ");
    const after = hay[at + word.length] ?? " ";
    if (!isWord(before) && !isWord(after)) return true;
    from = at + 1;
  }
  return false;
}

function soften(text: string): string {
  let out = "";
  for (const ch of text) {
    out += isWord(ch) ? ch : " ";
  }
  return out;
}

function hasLower(word: string): boolean {
  for (const ch of word) {
    if (ch >= "a" && ch <= "z") return true;
  }
  return false;
}

function isWord(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === "'";
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHost(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === "-";
}

function isHex(ch: string): boolean {
  return isDigit(ch) || (ch >= "a" && ch <= "f");
}
