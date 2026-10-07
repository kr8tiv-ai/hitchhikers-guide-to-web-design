/**
 * Deterministic archetype, positioning, and story shaper.
 * Keyword score is not the user's choice, so the archetype stays ASSUMED.
 * Medium and long text may only reuse extracted facts. A missing founding
 * anecdote stays a bracket. This module does not call a model.
 */

import type { AnswerRecord } from "../required.ts";
import type { WhyDraft } from "./why.ts";

export interface StoryPack {
  archetype: string;
  archetypeStatus: "ASSUMED";
  positioning: string;
  words25: string;
  words100: string;
  words300: string;
  holes: string[];
}

export interface ArchetypePick {
  label: string;
  status: "ASSUMED";
  tie: boolean;
}

export class StoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryError";
  }
}

/**
 * Fixed twelve, in tie-break order. An earlier label wins a tie.
 * Guide display names Caregiver and Everyman score here as caretaker and everyperson.
 * Keywords are whole words. A hit is one occurrence, compared without case.
 */
export const ARCHETYPES = [
  "caretaker",
  "creator",
  "explorer",
  "innocent",
  "jester",
  "lover",
  "magician",
  "everyperson",
  "hero",
  "outlaw",
  "ruler",
  "sage",
] as const;

const KEYWORDS: Readonly<Record<(typeof ARCHETYPES)[number], readonly string[]>> = {
  caretaker: [
    "care",
    "cares",
    "cared",
    "caring",
    "caregiver",
    "caretaker",
    "nurture",
    "nurtures",
    "nurtured",
    "nurturing",
    "protect",
    "protects",
    "protected",
    "protecting",
    "comfort",
    "comforts",
    "comforted",
    "comforting",
    "heal",
    "heals",
    "healed",
    "healing",
  ],
  creator: [
    "create",
    "creates",
    "created",
    "creating",
    "creator",
    "craft",
    "crafts",
    "crafted",
    "crafting",
    "invent",
    "invents",
    "invented",
    "inventing",
    "design",
    "designs",
    "designed",
    "designing",
  ],
  explorer: [
    "explore",
    "explores",
    "explored",
    "exploring",
    "explorer",
    "discover",
    "discovers",
    "discovered",
    "discovering",
    "discovery",
    "wander",
    "wanders",
    "wandered",
    "wandering",
    "adventure",
    "frontier",
  ],
  innocent: ["innocent", "innocence", "simplicity", "wholesome", "pure", "purity", "optimism", "optimistic"],
  jester: ["joke", "jokes", "joked", "joking", "jester", "humor", "humour", "playful", "irreverent", "witty"],
  lover: ["lover", "lovers", "intimacy", "romance", "romantic", "beauty", "beautiful", "desire", "affection"],
  magician: [
    "magic",
    "magical",
    "magician",
    "transform",
    "transforms",
    "transformed",
    "transforming",
    "transformation",
    "wonder",
    "enchant",
    "enchants",
    "enchanted",
    "enchanting",
  ],
  everyperson: [
    "ordinary",
    "everyday",
    "everyman",
    "everyperson",
    "belonging",
    "neighbour",
    "neighbor",
    "humble",
    "commonplace",
  ],
  hero: ["hero", "heroes", "heroic", "courage", "courageous", "brave", "triumph", "overcome", "overcomes"],
  outlaw: [
    "outlaw",
    "outlaws",
    "rebel",
    "rebels",
    "rebellion",
    "rebellious",
    "defy",
    "defies",
    "defied",
    "disrupt",
    "disrupts",
    "disrupted",
    "disruptive",
    "renegade",
  ],
  ruler: [
    "ruler",
    "rulers",
    "luxury",
    "premium",
    "command",
    "commands",
    "commanding",
    "prestige",
    "sovereign",
    "status",
  ],
  sage: [
    "sage",
    "wisdom",
    "wise",
    "insight",
    "insights",
    "knowledge",
    "teach",
    "teaches",
    "taught",
    "teaching",
    "teacher",
    "truth",
  ],
};

const VISITOR_ID = "DP-2.6";
const OFFER_ID = "DP-2.7";
/** Where customers are. The whole answer is the place when it is not the skip line. */
const PLACE_ID = "DP-4.4";
/** Open notes. Only a place phrase is kept, and only when one is actually written. */
const NOTES_ID = "DP-9.5";
const PROTECTED_ID = "DP-1.9";

const PLACE_SKIP = "customers not placed.";
const PROTECTED_SKIP = "no inventory yet. nothing marked protected.";
const NOTES_SKIP = "nothing else.";

const MISSING_NAME = "this practice";
const NAME_LIMIT = 60;
const WORD_TOLERANCE = 15;
const LONG_STORY_AT = 200;
const FOUNDING_BRACKET = "[needs a fact: founding story]";
const HOLE_TIE = "archetype tie";
const HOLE_PROOF = "dropped a proof sentence";
const HOLE_FOUNDING = "founding story";
const FACT_FRAME = "The answers give this:";

/** Same five the why shaper refuses. Whole words only. `elevated` stays. */
const BANNED = ["innovative", "elevate", "seamless", "cutting-edge", "passionate"] as const;

const PLACE_STOP = new Set(["the", "a", "an", "we", "our", "this", "that", "my", "your", "their", "and"]);

/**
 * buildStory shapes a positioning line and three story lengths from answers and a WhyDraft.
 * words25 is the brand why, unchanged. Longer lengths call expandOnly.
 * The archetype is always ASSUMED. The user approves it later.
 */
export function buildStory(input: { answers: AnswerRecord[]; why: WhyDraft; name: string }): StoryPack {
  const visitor = latestValue(input.answers, VISITOR_ID);
  const offer = latestValue(input.answers, OFFER_ID);
  const positioning = positioningLine({
    visitor,
    offer,
    name: input.name,
    siteWhy: input.why.siteWhy,
  });
  const pick = pickArchetype(scoreText(input));
  const facts = extractFacts(input.answers, input.name);
  const words100 = expandOnly(facts, 100);
  const words300 = expandOnly(facts, 300);
  const holes: string[] = [];
  if (pick.tie) holes.push(HOLE_TIE);
  if (containsProof(facts)) holes.push(HOLE_PROOF);
  if (words300.includes(FOUNDING_BRACKET)) holes.push(HOLE_FOUNDING);
  return {
    archetype: pick.label,
    archetypeStatus: "ASSUMED",
    positioning,
    words25: input.why.brandWhy,
    words100,
    words300,
    holes,
  };
}

/** Scores text by keyword. Status is ASSUMED even when one label leads. */
export function pickArchetype(text: string): ArchetypePick {
  const opening = ARCHETYPES[0] ?? "caretaker";
  let best: (typeof ARCHETYPES)[number] = opening;
  let bestScore = -1;
  let tie = false;
  for (const label of ARCHETYPES) {
    const score = scoreLabel(text, label);
    if (score > bestScore) {
      best = label;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return { label: best, status: "ASSUMED", tie };
}

/**
 * For ${visitor}, ${name} is the ${offer} that ${siteWhy}.
 * Throws when the visitor or the offer is empty after cleaning.
 * A blank name becomes "this practice". Only this line truncates a long name.
 */
export function positioningLine(input: {
  visitor: string;
  name: string;
  offer: string;
  siteWhy: string;
}): string {
  const visitor = cleanPiece(input.visitor);
  const offer = cleanPiece(input.offer);
  if (visitor === "") throw new StoryError("Visitor is empty. Positioning needs the visitor.");
  if (offer === "") throw new StoryError("Offer is empty. Positioning needs the offer.");
  const name = practiceName(input.name, true);
  const siteWhy = cleanPiece(input.siteWhy);
  return `For ${visitor}, ${name} is the ${offer} that ${siteWhy}`;
}

/**
 * Fills a story up to the target from facts alone.
 * A target of 200 words or more needs a founding anecdote, which this function
 * will not write. The bracket stands in that spot.
 * A four-digit run is emitted only when that same run appears in the facts.
 */
export function expandOnly(facts: readonly string[], targetWords: number): string {
  const long = targetWords >= LONG_STORY_AT;
  const fillers = factSentences(facts);
  const required = long ? [FOUNDING_BRACKET] : [];
  let text = fillToTarget(required, fillers, targetWords);
  text = removeDisallowedDigitRuns(text, facts);
  text = collapse(text.replace(/!+/g, ""));
  if (long && !text.includes(FOUNDING_BRACKET)) {
    text = collapse(`${FOUNDING_BRACKET} ${text}`);
  }
  if (countWords(text) > targetWords + WORD_TOLERANCE) {
    text = takeWords(text, targetWords + WORD_TOLERANCE);
  }
  if (countWords(text) < Math.max(0, targetWords - WORD_TOLERANCE) && fillers.length > 0) {
    text = fillToTarget(long ? [FOUNDING_BRACKET] : [], fillers, targetWords);
    text = collapse(removeDisallowedDigitRuns(text, facts).replace(/!+/g, ""));
  }
  if (long && !text.includes(FOUNDING_BRACKET)) {
    const room = targetWords + WORD_TOLERANCE - countWords(FOUNDING_BRACKET);
    const rest = takeWords(text, Math.max(0, room));
    text = rest === "" ? FOUNDING_BRACKET : `${FOUNDING_BRACKET} ${rest}`;
  }
  return text;
}

/** Splits on whitespace. Empty pieces do not count. */
export function countWords(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function scoreText(input: { answers: AnswerRecord[]; why: WhyDraft; name: string }): string {
  const parts = [input.name, input.why.siteWhy, input.why.brandWhy];
  for (const value of latestMap(input.answers).values()) parts.push(value);
  return parts.join("\n");
}

function scoreLabel(text: string, label: (typeof ARCHETYPES)[number]): number {
  let score = 0;
  for (const word of KEYWORDS[label]) score += countKeyword(text, word);
  return score;
}

function countKeyword(text: string, keyword: string): number {
  if (keyword === "" || text === "") return 0;
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "gi");
  return [...text.matchAll(pattern)].length;
}

function extractFacts(answers: readonly AnswerRecord[], name: string): string[] {
  const facts: string[] = [];
  const practice = practiceName(name, false);
  if (practice !== "") facts.push(practice);
  const visitor = cleanPiece(latestValue(answers, VISITOR_ID));
  const offer = cleanPiece(latestValue(answers, OFFER_ID));
  if (visitor !== "") facts.push(visitor);
  if (offer !== "") facts.push(offer);
  const place = placeFact(latestValue(answers, PLACE_ID));
  if (place !== "") facts.push(place);
  for (const extra of placesFromNotes(latestValue(answers, NOTES_ID))) facts.push(extra);
  const protectedList = protectedFact(latestValue(answers, PROTECTED_ID));
  if (protectedList !== "") facts.push(protectedList);
  return facts;
}

function placeFact(value: string): string {
  const text = cleanPiece(value);
  if (text === "" || text.toLowerCase() === PLACE_SKIP) return "";
  return text;
}

function protectedFact(value: string): string {
  const text = cleanPiece(value);
  if (text === "" || text.toLowerCase() === PROTECTED_SKIP) return "";
  return text;
}

function placesFromNotes(value: string): string[] {
  const text = cleanPiece(value);
  if (text === "" || text.toLowerCase() === NOTES_SKIP) return [];
  const kept = splitSentences(text).filter((sentence) => !isProof(sentence));
  const pool = kept.join(" ");
  const found: string[] = [];
  const push = (raw: string): void => {
    const place = tidyPlace(raw);
    if (place === "") return;
    if (!acceptPlace(place)) return;
    if (found.some((item) => item.toLowerCase() === place.toLowerCase())) return;
    found.push(place);
  };
  if (/\bworldwide\b/i.test(pool)) push("worldwide");
  if (/\bnationwide\b/i.test(pool)) push("nationwide");
  const patterns = [
    /\b(?:based|located|serving|served|from|near)\s+in\s+([A-Z][a-z][A-Za-z'’.-]*(?:\s+[A-Z][a-z][A-Za-z'’.-]*){0,3})/g,
    /\b(?:based|located|serving|served|from|near)\s+([A-Z][a-z][A-Za-z'’.-]*(?:\s+[A-Z][a-z][A-Za-z'’.-]*){0,3})/g,
    /\bin\s+([A-Z][a-z][A-Za-z'’.-]*(?:\s+[A-Z][a-z][A-Za-z'’.-]*){0,3})/g,
    /\b(?:city|town|village|country)\s+of\s+([A-Z][a-z][A-Za-z'’.-]*(?:\s+[A-Z][a-z][A-Za-z'’.-]*){0,3})/g,
  ];
  for (const pattern of patterns) {
    for (const match of pool.matchAll(pattern)) {
      const name = match[1];
      if (name !== undefined) push(name);
    }
  }
  return found;
}

function acceptPlace(name: string): boolean {
  const first = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  return first !== "" && !PLACE_STOP.has(first);
}

function tidyPlace(name: string): string {
  return name.replace(/[.?,;:]+$/g, "").trim();
}

function practiceName(name: string, truncate: boolean): string {
  const cleaned = cleanPiece(name);
  if (cleaned === "") return MISSING_NAME;
  if (!truncate || cleaned.length <= NAME_LIMIT) return cleaned;
  return cleaned.slice(0, NAME_LIMIT).trimEnd();
}

function factSentences(facts: readonly string[]): string[] {
  const framed: string[] = [];
  for (const fact of facts) {
    for (const sentence of splitSentences(fact)) {
      if (isProof(sentence)) continue;
      const line = frameFact(sentence);
      if (line !== "") framed.push(line);
    }
  }
  return unique(framed);
}

function containsProof(facts: readonly string[]): boolean {
  for (const fact of facts) {
    for (const sentence of splitSentences(fact)) {
      if (isProof(sentence)) return true;
    }
  }
  return false;
}

function isProof(sentence: string): boolean {
  return /testimonial/i.test(sentence) || /5 stars/i.test(sentence);
}

function frameFact(sentence: string): string {
  const body = sentence.replace(/[.?\s]+$/g, "").trim();
  if (body === "") return "";
  return `${FACT_FRAME} ${body}.`;
}

function fillToTarget(required: readonly string[], fillers: readonly string[], targetWords: number): string {
  const low = Math.max(0, targetWords - WORD_TOLERANCE);
  const high = targetWords + WORD_TOLERANCE;
  const chunks: string[] = [];
  for (const piece of required) {
    if (piece !== "") chunks.push(piece);
  }
  const usable = fillers.filter((piece) => piece !== "");
  let index = 0;
  let spins = 0;
  const spinCap = usable.length === 0 ? 0 : 8000;
  while (countWords(joinChunks(chunks)) < low && spins < spinCap) {
    const next = usable[index % usable.length];
    index += 1;
    spins += 1;
    if (next === undefined || next === "") break;
    const nextCount = countWords(next);
    if (nextCount === 0) break;
    const count = countWords(joinChunks(chunks));
    if (count + nextCount <= high) {
      chunks.push(next);
      continue;
    }
    const room = high - count;
    if (room > 0) {
      const partial = takeWords(next, room);
      if (partial !== "") chunks.push(partial);
    }
    break;
  }
  let text = joinChunks(chunks);
  if (countWords(text) > high) text = takeWords(text, high);
  return text;
}

function removeDisallowedDigitRuns(text: string, facts: readonly string[]): string {
  const corpus = facts.join("\n");
  return text.replace(/\b\d{4}\b/g, (run) => (corpus.includes(run) ? run : ""));
}

function takeWords(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed === "" || max <= 0) return "";
  const words = trimmed.split(/\s+/);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ");
}

function joinChunks(chunks: readonly string[]): string {
  return chunks.join(" ");
}

function splitSentences(text: string): string[] {
  const prepared = cleanPiece(text).replace(/!+/g, ".");
  const collapsed = collapse(prepared);
  if (collapsed === "") return [];
  return collapsed
    .split(/(?<=[A-Za-z]{3}[.?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function unique(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function cleanPiece(value: string): string {
  const stripped = stripBanned(value.replace(/!+/g, " "));
  return collapse(stripped).replace(/\s+([,.;:?])/g, "$1").trim();
}

function stripBanned(text: string): string {
  return text.replace(bannedPattern("gi"), " ");
}

function bannedPattern(flags: string): RegExp {
  const body = BANNED.map(escapeRegExp).join("|");
  return new RegExp(`\\b(?:${body})\\b`, flags);
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function latestValue(answers: readonly AnswerRecord[], id: string): string {
  return latestMap(answers).get(id) ?? "";
}

function latestMap(answers: readonly AnswerRecord[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const answer of answers) latest.set(answer.id, answer.value);
  return latest;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
