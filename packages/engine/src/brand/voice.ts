/**
 * Deterministic VOICE.md shaper and tagline filter.
 * Prompt 061 sends thirty model taglines through the 011 adapter.
 * This module does not call a model. It validates, cuts to five, and shapes the file.
 * Rewritten from Matt's voice and tagline method (guide prompts 14 and 15), with credit. D-005.
 *
 * `positioning` is the line from buildStory / positioningLine:
 * For {visitor}, {name} is the {offer} that {siteWhy}.
 * Taglines rearrange that line. A line of 8 or more words is discarded.
 * Fewer than five unique keepers sets shortfall. Repeats are dropped, not padded.
 */

export interface VoiceDoc {
  markdown: string;
  taglines: string[];
  shortfall: boolean;
  assumed: boolean;
}

export interface VoiceInput {
  vibe: string;
  antiVibe: string;
  positioning: string;
  offer: string;
}

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceError";
  }
}

/**
 * Section 14 list, plus innovative and passionate.
 * The why shaper already refuses both, and the passionate example must not survive a rewrite.
 * Whole words only. `elevated` and `innovation` stay.
 */
export const BANNED_WORDS = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "game-changer",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "cutting-edge",
  "journey",
  "tapestry",
  "landscape",
  "innovative",
  "passionate",
] as const;

export const BANNED_PHRASES = [
  "in today's fast-paced world",
  "it's not just",
  "in a world where",
] as const;

/** Shipped taglines stay under this count. Eight or more is discarded. */
export const TAGLINE_WORD_CAP = 8;

export const VOICE_HEADINGS = [
  "Traits",
  "NN/g positions",
  "Vocabulary",
  "Banned words",
  "Punctuation",
  "Tone by situation",
  "Slogans",
  "How we talk about the product",
  "How we talk about the customer",
  "How we talk about the competitor",
  "How we talk about price",
  "How we talk about ourselves",
  "Five rewrites",
  "Microcopy",
] as const;

const TAGLINE_KEEP = 5;
const TRAIT_COUNT = 3;
const LIST_CAP = 12;
const PROSE_CAP = 24;

const DEFAULT_THIS = ["Direct", "Specific", "Plain"] as const;
const ANTI_SLOP_NEVER = ["seamless", "innovative", "cutting-edge"] as const;
const PRACTICE = [
  "Say the useful thing, then stop.",
  "Prefer a concrete noun.",
  "Name the person and the object.",
] as const;

const GLUE = new Set(["a", "an", "the", "of", "for", "and", "to", "is", "at", "in", "on", "with"]);

const MICRO_ERROR = "That did not send. Try again.";
const MICRO_EMPTY = "Nothing is listed yet.";
const MICRO_NOT_FOUND = "This page is not here.";

const PASSIONATE_BEFORE = "We are passionate about innovative solutions";

interface ParsedPositioning {
  visitor: string;
  name: string;
  offer: string;
  siteWhy: string;
}

/**
 * Keep the first five candidates that pass the filter.
 * Drops empties, exclamation marks, em dashes, banned words, banned phrases,
 * lines of 8 or more words, and case-insensitive duplicates.
 */
export function selectTaglines(candidates: readonly string[]): { taglines: string[]; shortfall: boolean } {
  const taglines: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    if (taglines.length === TAGLINE_KEEP) break;
    const line = normalizeTagline(raw);
    if (!acceptable(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    taglines.push(capFirst(line));
  }
  return { taglines, shortfall: taglines.length < TAGLINE_KEEP };
}

/**
 * Build a pool of rearrangements from a positioning line, then cut it with selectTaglines.
 * Unparsed text is one candidate. It still has to pass the filter.
 */
export function buildTaglines(positioning: string): { taglines: string[]; shortfall: boolean } {
  const parsed = parsePositioning(positioning);
  if (parsed === null) return selectTaglines([positioning]);
  const pool = candidatePool(parsed).filter((line) => related(line, parsed.offer, parsed.visitor));
  return selectTaglines(pool);
}

/**
 * renderVoice writes the voice file and the five taglines.
 * assumed is true unless both the vibe list and the never-word list have at least three items.
 * An empty antiVibe is the assumed case: the not-side comes from the anti-slop list.
 */
export function renderVoice(input: VoiceInput): VoiceDoc {
  const vibeWords = splitList(input.vibe);
  const antiWords = splitList(input.antiVibe);
  const assumed = vibeWords.length < TRAIT_COUNT || antiWords.length < TRAIT_COUNT;
  const parsed = parsePositioning(input.positioning);
  const offer = clipWords(plain(input.offer) || plain(parsed?.offer ?? ""), PROSE_CAP);
  const visitor = clipWords(plain(parsed?.visitor ?? ""), PROSE_CAP);
  const cut = buildTaglines(input.positioning);
  const markdown = compose({
    assumed,
    offer,
    visitor,
    vibeWords,
    antiWords,
    taglines: cut.taglines,
    shortfall: cut.shortfall,
  });
  if (markdown.includes("!") || markdown.includes("\u2014")) {
    throw new VoiceError("Voice markdown includes a banned punctuation mark.");
  }
  return {
    markdown,
    taglines: cut.taglines,
    shortfall: cut.shortfall,
    assumed,
  };
}

export function wordCount(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function compose(input: {
  assumed: boolean;
  offer: string;
  visitor: string;
  vibeWords: readonly string[];
  antiWords: readonly string[];
  taglines: readonly string[];
  shortfall: boolean;
}): string {
  const traits = traitLines(input.vibeWords, input.antiWords);
  const vocab = vocabulary(input.vibeWords, input.antiWords, input.offer);
  const self = (traits.thisWords[0] ?? "direct").toLowerCase();
  const thing = input.offer === "" ? "the work" : input.offer;
  const sections: string[] = [
    "# VOICE",
    "",
    heading("Traits"),
    "",
    "Traits are this, not that.",
    input.assumed
      ? "Status: ASSUMED."
      : "Status: mapped from the three vibe words and the three never-words.",
    "",
    ...traits.lines,
    "",
    heading("NN/g positions"),
    "",
    ...nngLines(input.vibeWords),
    "",
    heading("Vocabulary"),
    "",
    `Words we use: ${vocab.use}.`,
    `Words we never use: ${vocab.never}`,
    "",
    heading("Banned words"),
    "",
    "The list applies even when the notes name none of these words.",
    ...BANNED_WORDS.map((word) => `- ${word}`),
    ...BANNED_PHRASES.map((phrase) => `- ${phrase}`),
    "- it's not just X, it's Y",
    "",
    heading("Punctuation"),
    "",
    "No exclamation marks in site copy.",
    "No em dashes in site copy.",
    "End a sentence with a period.",
    "",
    heading("Tone by situation"),
    "",
    "- Error: name what failed and the next step.",
    "- Success: state the fact.",
    salesLine(input.offer, input.visitor),
    "- Apology: name the mistake and the fix.",
    "",
    heading("Slogans"),
    "",
    sloganBlock(input.taglines, input.shortfall),
    "",
    heading("How we talk about the product"),
    "",
    input.offer === "" ? "Name the offer in plain words." : `Call it ${input.offer}. Say what it is.`,
    "",
    heading("How we talk about the customer"),
    "",
    input.visitor === ""
      ? "Talk to the visitor as one person."
      : `Talk to ${input.visitor} as one person.`,
    "",
    heading("How we talk about the competitor"),
    "",
    "We do not name competitors in headlines.",
    "We do not insult named businesses.",
    "",
    heading("How we talk about price"),
    "",
    "Say the number. Do not hide a price behind a mood.",
    "",
    heading("How we talk about ourselves"),
    "",
    `We are ${self}. We do not narrate our feelings about the work.`,
    "",
    heading("Five rewrites"),
    "",
    ...rewriteLines(thing, input.visitor),
    "",
    heading("Microcopy"),
    "",
    `- button: ${buttonLabel(input.offer)}`,
    `- error: ${MICRO_ERROR}`,
    `- empty: ${MICRO_EMPTY}`,
    `- notFound: ${MICRO_NOT_FOUND}`,
    "",
  ];
  return sections.join("\n");
}

function heading(title: (typeof VOICE_HEADINGS)[number]): string {
  return `## ${title}`;
}

function traitLines(vibeWords: readonly string[], antiWords: readonly string[]): { lines: string[]; thisWords: string[] } {
  const lines: string[] = [];
  const thisWords: string[] = [];
  for (let index = 0; index < TRAIT_COUNT; index += 1) {
    const rawThis = vibeWords[index] ?? "";
    const thisWord = usableThis(rawThis) ?? DEFAULT_THIS[index] ?? "Direct";
    const rawNot = neverWord(antiWords[index] ?? "");
    const notWord = rawNot === "" ? (ANTI_SLOP_NEVER[index] ?? "seamless") : rawNot;
    const practice = PRACTICE[index] ?? PRACTICE[0];
    thisWords.push(thisWord);
    lines.push(`- ${capFirst(thisWord)}, not ${notWord}. ${practice}`);
  }
  return { lines, thisWords };
}

function nngLines(vibeWords: readonly string[]): string[] {
  const hay = vibeWords.join(" ");
  return [
    `- Funny or serious: ${hit(hay, ["funny", "playful", "witty", "humorous"]) ? "funny" : "serious"}`,
    `- Formal or casual: ${hit(hay, ["formal", "proper", "official"]) ? "formal" : "casual"}`,
    `- Respectful or irreverent: ${hit(hay, ["irreverent", "snarky", "sarcastic"]) ? "irreverent" : "respectful"}`,
    `- Enthusiastic or matter-of-fact: ${hit(hay, ["enthusiastic", "eager", "excited", "bubbly"]) ? "enthusiastic" : "matter-of-fact"}`,
  ];
}

function vocabulary(
  vibeWords: readonly string[],
  antiWords: readonly string[],
  offer: string,
): { use: string; never: string } {
  const useWords: string[] = [];
  for (const word of vibeWords) {
    const clean = usableThis(word);
    if (clean !== null) useWords.push(clean.toLowerCase());
  }
  for (const word of tokens(offer)) {
    if (GLUE.has(word) || hasBanned(word)) continue;
    useWords.push(word);
  }
  const use = uniqueLimit(useWords, LIST_CAP);
  const neverWords = uniqueLimit(
    antiWords.map((word) => neverWord(word)).filter((word) => word !== ""),
    LIST_CAP,
  );
  return {
    use: use.length > 0 ? use.join(", ") : "plain nouns for the offer",
    never:
      neverWords.length > 0
        ? `${neverWords.join(", ")}. Also every word in Banned words.`
        : "No extra never-words were given. Banned words still apply.",
  };
}

function salesLine(offer: string, visitor: string): string {
  if (offer === "" && visitor === "") return "- Sales: name the offer and who it is for.";
  if (offer === "") return `- Sales: name the offer for ${visitor}.`;
  if (visitor === "") return `- Sales: offer ${offer}.`;
  return `- Sales: offer ${offer} to ${visitor}.`;
}

function sloganBlock(taglines: readonly string[], shortfall: boolean): string {
  const lines = taglines.map((line, index) => `${index + 1}. ${line}`);
  if (lines.length === 0) lines.push("No tagline cleared the filter.");
  lines.push("", `Shortfall: ${shortfall ? "true" : "false"}.`);
  return lines.join("\n");
}

function rewriteLines(thing: string, visitor: string): string[] {
  const who = visitor === "" ? "People can ask" : `${capFirst(visitor)} can ask`;
  const pairs: Array<[string, string]> = [
    [PASSIONATE_BEFORE, `We make ${thing}.`],
    ["We leverage cutting-edge tools to unlock new work.", `The offer is ${thing}.`],
    ["In today's fast-paced world the journey starts now.", `Ask for ${thing}.`],
    ["It is not just a product, it is a seamless experience.", `It is ${thing}.`],
    ["This game-changer will revolutionize the day.", `${who} for ${thing}.`],
  ];
  return pairs.map((pair, index) => `${index + 1}. Before: ${pair[0]}\n   After: ${pair[1]}`);
}

function buttonLabel(offer: string): string {
  if (offer === "") return "Order this";
  const label = `Order ${offer}`;
  if (wordCount(label) >= TAGLINE_WORD_CAP || hasBanned(label)) return "Order this";
  return label;
}

function candidatePool(parsed: ParsedPositioning): string[] {
  const o = parsed.offer.trim();
  const v = parsed.visitor.trim();
  const n = parsed.name.trim();
  const w = parsed.siteWhy.trim();
  const pool: string[] = [];
  const push = (line: string, ok: boolean): void => {
    if (!ok) return;
    const text = line.replace(/\s+/g, " ").trim();
    if (text !== "") pool.push(text);
  };
  const both = o !== "" && v !== "";
  const named = n !== "";
  push(`${o} for ${v}`, both);
  push(`${v} for ${o}`, both);
  push(`For ${v}, ${o}`, both);
  push(`${o}, ${v}`, both);
  push(`${v}, ${o}`, both);
  push(`${n} ${o}`, named && o !== "");
  push(`${o}, ${n}`, named && o !== "");
  push(`${n} for ${v}`, named && v !== "");
  push(`${v}, ${n}`, named && v !== "");
  push(`${n}, ${v}, ${o}`, named && both);
  push(`${o} ${v}`, both);
  push(`${v} ${o}`, both);
  push(`${n} ${v}`, named && v !== "");
  push(`${v} ${n}`, named && v !== "");
  push(o, o !== "");
  push(v, v !== "");
  push(`${n} ${o} ${v}`, named && both);
  push(`${v} ${n} ${o}`, named && both);
  push(`${o} ${n} ${v}`, named && both);
  push(`For ${v} ${o}`, both);
  push(`${v}, ${o}, ${n}`, named && both);
  push(`${o}, ${n}, ${v}`, named && both);
  push(`${n}, ${o}, ${v}`, named && both);
  push(`${o} for ${n}`, named && o !== "");
  push(`${v} for ${n}`, named && v !== "");
  push(`${n}, ${o} for ${v}`, named && both);
  push(`${o} for ${v}, ${n}`, named && both);
  push(`${v}, ${n}, ${o}`, named && both);
  push(`${n} ${v} ${o}`, named && both);
  push(w === "" ? `${o}, ${v}, ${n}` : `${o} for ${v} ${w}`, both && (w !== "" || named));
  return pool;
}

function related(line: string, offer: string, visitor: string): boolean {
  const wanted = significant(`${offer} ${visitor}`);
  if (wanted.length === 0) return true;
  const have = new Set(tokens(line));
  return wanted.some((word) => have.has(word));
}

function parsePositioning(line: string): ParsedPositioning | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed.startsWith("For ")) return null;
  const rest = trimmed.slice(4);
  const isThe = " is the ";
  const isAt = rest.indexOf(isThe);
  if (isAt < 0) return null;
  const left = rest.slice(0, isAt);
  const comma = left.lastIndexOf(", ");
  if (comma < 0) return null;
  const visitor = left.slice(0, comma).trim();
  const name = left.slice(comma + 2).trim();
  const right = rest.slice(isAt + isThe.length);
  const that = " that ";
  const thatAt = right.indexOf(that);
  if (thatAt < 0) return null;
  const offer = right.slice(0, thatAt).trim();
  const siteWhy = right.slice(thatAt + that.length).trim();
  if (visitor === "" || name === "" || offer === "") return null;
  return { visitor, name, offer, siteWhy };
}

function acceptable(line: string): boolean {
  if (!/[0-9a-z]/i.test(line)) return false;
  if (line.includes("!")) return false;
  if (line.includes("\u2014")) return false;
  if (wordCount(line) >= TAGLINE_WORD_CAP) return false;
  if (hasBanned(line)) return false;
  return true;
}

function normalizeTagline(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(/[.]+$/g, "").trim();
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => /[0-9a-z]/i.test(part));
}

function usableThis(value: string): string | null {
  const cleaned = value.replace(/!+/g, " ").replace(/\u2014/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned === "" || hasBanned(cleaned)) return null;
  return cleaned;
}

function neverWord(value: string): string {
  return value.replace(/!+/g, " ").replace(/\u2014/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function plain(value: string): string {
  const stripped = stripBanned(value.replace(/!+/g, " ").replace(/\u2014/g, " "));
  return stripped.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/[.]+$/g, "").trim();
}

function stripBanned(text: string): string {
  let next = text.replace(/\u2019/g, "'");
  for (const phrase of BANNED_PHRASES) {
    next = next.replace(new RegExp(escapeRegExp(phrase), "gi"), " ");
  }
  next = next.replace(bannedWordPattern("gi"), " ");
  return next;
}

function hasBanned(value: string): boolean {
  const folded = value.replace(/\u2019/g, "'").toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (folded.includes(phrase)) return true;
  }
  return bannedWordPattern("i").test(value);
}

function bannedWordPattern(flags: string): RegExp {
  return new RegExp(`\\b(?:${BANNED_WORDS.map((word) => escapeRegExp(word)).join("|")})\\b`, flags);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

function significant(value: string): string[] {
  return tokens(value).filter((word) => !GLUE.has(word) && word.length > 1);
}

function clipWords(value: string, max: number): string {
  const parts = value.trim().split(/\s+/).filter((part) => part !== "");
  return parts.slice(0, max).join(" ");
}

function uniqueLimit(words: readonly string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const key = word.toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
    if (out.length === max) break;
  }
  return out;
}

function hit(hay: string, keys: readonly string[]): boolean {
  return keys.some((key) => new RegExp(`\\b${escapeRegExp(key)}\\b`, "i").test(hay));
}

function capFirst(value: string): string {
  const first = value.charAt(0);
  if (first === "") return value;
  return first.toUpperCase() + value.slice(1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
