/**
 * Sens-O-Matic tokens. Palettes are 60-30-10: paper, ink, signal.
 * Ink on paper must clear WCAG 2.2 body contrast (4.5). A miss is dropped.
 * A seed that fails as body text stays a signal swatch, never the ink.
 * Type is one family or a pair from the appendix. This module does not download fonts.
 */

import {
  TYPE_LIBRARY,
  UNMATCHED_PAIR_ID,
  type TypePairing,
} from "./type-library.ts";

export {
  DO_NOT_SHIP,
  TRIAL_FACES,
  TYPE_LIBRARY,
  UNMATCHED_PAIR_ID,
} from "./type-library.ts";
export type { TrialFace, TypeDeal, TypePairing, TypeShip } from "./type-library.ts";

export class TokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenError";
  }
}

export interface Palette {
  name: string;
  paper: string;
  ink: string;
  signal: string;
  ratioBody: number;
}

export interface TypePair {
  families: [string, string] | [string];
  source: "user" | "list";
  warnings: string[];
  /** Ship rule for a library pair, or confirm-at-install when the person named an unknown face. */
  license: string;
  /** Mood, era, tone, and industry words that selected a list pair. Empty when none matched. */
  adjectives: readonly string[];
  /** Appendix id when the families are one library pair. Null for a free name. */
  pairId: number | null;
}

/** Tailwind indigo-600 and violet-600. Never propose these, alone or as a pair. */
export const DENY_HEX = ["#4f46e5", "#7c3aed"] as const;

/** Fallback when the person names a face that is not in the library. */
export const TYPE_LICENSE = "confirm-at-install";

/**
 * Refused as an automatic brand face unless the person typed the name.
 * Arial, Helvetica, and system-ui are refused as the display face on the same rule.
 * Order is the 240r summary row.
 */
export const OVERUSED_DEFAULTS: readonly string[] = [
  "Inter",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Lato",
  "Nunito",
  "Raleway",
  "Playfair Display",
  "Bebas Neue",
  "Plus Jakarta Sans",
  "JetBrains Mono",
  "Arial",
  "Helvetica",
  "system-ui",
];

/** Appendix order. Index 0 is Boska / General Sans, and it is not the unmatched fallback. */
export const TYPE_PAIRINGS: readonly (readonly [string, string])[] = TYPE_LIBRARY.map((pairing) => [
  pairing.display,
  pairing.body,
]);

/** Plain-language samples for the font question. Six moods, not six overused faces. */
export const MOOD_TYPE_SAMPLES: readonly { readonly adjectives: string }[] = [
  { adjectives: "editorial, quiet, publishing" },
  { adjectives: "playful food" },
  { adjectives: "brutalist poster" },
  { adjectives: "fashion, sharp" },
  { adjectives: "product, one family" },
  { adjectives: "3d-world poster" },
];

const BODY_MIN = 4.5;
const LARGE_MIN = 3;
const FALLBACK_PAPER = "#f4f0e6";
const FALLBACK_INK = "#1c1915";
const SAFE_SIGNAL = "#9a3412";
const NAMES = ["paper", "ink", "signal"] as const;

const WHITE = { r: 255, g: 255, b: 255 };
const NEAR_BLACK = { r: 0x1c, g: 0x19, b: 0x15 };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Draft {
  paper: string;
  ink: string;
  signal: string;
  ratioBody: number;
}

const GLUE =
  /^(?:i|a|an|the|and|or|for|with|please|use|using|font|fonts|like|want|my|set|in|on|to|of|our|we|headlines?|body|text|pairing|pair|family|families|something|really|just|maybe)$/i;

/**
 * WCAG 2.2 relative luminance.
 * Threshold 0.04045, exponent 2.4, coefficients 0.2126, 0.7152, 0.0722.
 */
function channelLinear(channel: number): number {
  const s = channel / 255;
  if (s <= 0.04045) return s / 12.92;
  return ((s + 0.055) / 1.055) ** 2.4;
}

function relLum(rgb: Rgb): number {
  return (
    0.2126 * channelLinear(rgb.r) +
    0.7152 * channelLinear(rgb.g) +
    0.0722 * channelLinear(rgb.b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relLum(parseHex(foreground));
  const bg = relLum(parseHex(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The caller picks the bar. Body is 4.5. Large text is 3. Same ratio either way. */
export function passes(ratio: number, kind: "body" | "large"): boolean {
  if (!Number.isFinite(ratio)) return false;
  return ratio >= (kind === "body" ? BODY_MIN : LARGE_MIN);
}

export function proposePalettes(input: { seedHex: string | null; vibe: string }): Palette[] {
  const explicit = input.seedHex === null ? null : toHex(parseHex(input.seedHex));
  const allowSeed = explicit === null || !denied(explicit);
  const seed = parseHex(explicit ?? seedFromVibe(input.vibe));
  const drafts: Draft[] = [];
  // Light ground and dark ground. A third mix is not invented to launder a failing ink.
  pushUnique(drafts, draftFrom(channelMix(seed, WHITE, liftAmount(input.vibe)), seed, allowSeed));
  pushUnique(
    drafts,
    draftFrom(channelMix(seed, NEAR_BLACK, depthAmount(input.vibe)), seed, allowSeed),
  );
  if (drafts.length < 3) {
    pushUnique(drafts, fallbackDraft(seed, allowSeed));
  }
  return nameDrafts(drafts);
}

export function renderCssVars(palette: Palette): string {
  const paper = toHex(parseHex(palette.paper));
  const ink = toHex(parseHex(palette.ink));
  const signal = toHex(parseHex(palette.signal));
  const css = [
    ":root {",
    `  --paper: ${paper}; /* 60 */`,
    `  --ink: ${ink}; /* 30 */`,
    `  --signal: ${signal}; /* 10 */`,
    "}",
    "",
  ].join("\n");
  if (/gradient\s*\(/i.test(css)) {
    throw new TokenError("Gradient tokens are not allowed.");
  }
  return css;
}

export function isOverusedFamily(name: string): boolean {
  const key = name.trim().toLowerCase();
  return OVERUSED_DEFAULTS.some((family) => family.toLowerCase() === key);
}

export interface FontSampleDeal {
  adjectives: string;
  display: string;
  body: string;
  pair: string;
}

/**
 * Six library pairs for the font card.
 * An empty mood keeps the six canned lines. Mood words reorder the library.
 * Overused defaults are never offered.
 */
export function dealFontSamples(mood: string): FontSampleDeal[] {
  const canned = MOOD_TYPE_SAMPLES.map((sample) => sampleFromPair(pickType(sample.adjectives), sample.adjectives));
  const text = mood.trim();
  if (text === "") return canned.slice(0, 6);
  const ranked = rankPairs(text);
  const dealt: FontSampleDeal[] = [];
  const seen = new Set<string>();
  const push = (sample: FontSampleDeal): void => {
    if (dealt.length >= 6) return;
    if (isOverusedFamily(sample.display) || isOverusedFamily(sample.body)) return;
    const key = `${sample.display}\n${sample.body}`;
    if (seen.has(key)) return;
    seen.add(key);
    dealt.push(sample);
  };
  for (const pairing of ranked) {
    const label = pairing.industry[0] ?? pairing.tone[0] ?? pairing.worlds[0] ?? "library";
    push(sampleFromPairing(pairing, label));
  }
  for (const sample of canned) push(sample);
  return dealt;
}

function sampleFromPair(pair: TypePair, adjectives: string): FontSampleDeal {
  const display = pair.families[0] ?? "";
  const body = pair.families[1] ?? display;
  return {
    adjectives,
    display,
    body,
    pair: display === body || body === "" ? display : `${display} + ${body}`,
  };
}

function sampleFromPairing(pairing: TypePairing, adjectives: string): FontSampleDeal {
  const display = pairing.display;
  const body = pairing.body;
  return {
    adjectives,
    display,
    body,
    pair: display === body ? display : `${display} + ${body}`,
  };
}

function rankPairs(answer: string): TypePairing[] {
  const adjectives = readAdjectives(answer);
  const worlds = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "world" && entry.value === value)));
  const tones = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "tone" && entry.value === value)));
  const eras = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "era" && entry.value === value)));
  const industries = new Set(
    adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "industry" && entry.value === value)),
  );
  const oneFamily = adjectives.includes("one family");
  if (tones.has("swiss")) worlds.add("product");
  const scored: { pairing: TypePairing; score: number }[] = [];
  for (const pairing of TYPE_LIBRARY) {
    if (pairing.deal !== "default") continue;
    if (isOverusedFamily(pairing.display) || isOverusedFamily(pairing.body)) continue;
    let score = 0;
    for (const world of pairing.worlds) if (worlds.has(world)) score += 3;
    for (const tone of pairing.tone) if (tones.has(tone)) score += 2;
    for (const era of pairing.era) if (eras.has(era)) score += 2;
    for (const industry of pairing.industry) if (industries.has(industry)) score += 2;
    if (oneFamily && pairing.display === pairing.body) score += 4;
    if (score <= 0) continue;
    scored.push({ pairing, score });
  }
  scored.sort((a, b) => b.score - a.score || a.pairing.id - b.pairing.id);
  return scored.map((row) => row.pairing);
}

export function pickType(answer: string | null): TypePair {
  const text = answer?.trim() ?? "";
  const adjectives = text.length === 0 ? [] : readAdjectives(text);
  if (text.length === 0) return listChoice(unmatchedPair(), adjectives);
  const found = uniqueMentions(collectMentions(text));
  const first = found[0];
  if (!first) return dealFromMood(text, adjectives);
  const second = found[1];
  if (!second) {
    if (first.pairId !== null) {
      const pairing = pairingById(first.pairId);
      if (pairing) return userFromPair(pairing, adjectives);
    }
    return userChoice([first.name], [], adjectives, null, TYPE_LICENSE);
  }
  const warnings = found.length > 2 ? ["dropped extra family"] : [];
  const shared = sharedPair(first, second);
  return userChoice(
    [first.name, second.name],
    warnings,
    adjectives,
    shared?.id ?? null,
    shared?.ship ?? TYPE_LICENSE,
  );
}

function parseHex(input: string): Rgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  const digits = match?.[1];
  if (!digits) throw new TokenError(`Invalid hex color: ${input}`);
  const expanded = digits.length === 3 ? expandShort(digits) : digits;
  const value = Number.parseInt(expanded, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function expandShort(digits: string): string {
  const chars = digits.split("");
  const r = chars[0];
  const g = chars[1];
  const b = chars[2];
  if (r === undefined || g === undefined || b === undefined) {
    throw new TokenError(`Invalid hex color: ${digits}`);
  }
  return `${r}${r}${g}${g}${b}${b}`;
}

function toHex(rgb: Rgb): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function denied(hex: string): boolean {
  return (DENY_HEX as readonly string[]).includes(hex);
}

function channelMix(from: Rgb, toward: Rgb, amount: number): Rgb {
  const t = Math.min(1, Math.max(0, amount));
  const mix = (start: number, end: number) => Math.round(start + (end - start) * t);
  return {
    r: mix(from.r, toward.r),
    g: mix(from.g, toward.g),
    b: mix(from.b, toward.b),
  };
}

function seedFromVibe(vibe: string): string {
  if (/\b(sea|ocean|night|forest|cool|teal|pine|moss)\b/i.test(vibe)) return "#1f6f5b";
  if (/\b(ink|editorial|noir)\b/i.test(vibe)) return "#1c1915";
  return "#c4512c";
}

function liftAmount(vibe: string): number {
  if (/\b(quiet|calm|soft|gentle)\b/i.test(vibe)) return 0.9;
  if (/\b(loud|bold|stark)\b/i.test(vibe)) return 0.78;
  return 0.84;
}

function depthAmount(vibe: string): number {
  if (/\b(loud|bold|stark)\b/i.test(vibe)) return 0.9;
  if (/\b(quiet|calm|soft|gentle)\b/i.test(vibe)) return 0.72;
  return 0.8;
}

function readableInk(seed: Rgb, paper: Rgb, allowSeed: boolean): Rgb | null {
  const paperHex = toHex(paper);
  const primary = relLum(paper) >= 0.5 ? NEAR_BLACK : WHITE;
  const secondary = primary === NEAR_BLACK ? WHITE : NEAR_BLACK;
  const tries: Rgb[] = [];
  if (allowSeed) tries.push(seed);
  for (const target of [primary, secondary]) {
    tries.push(channelMix(seed, target, 0.72));
    tries.push(channelMix(seed, target, 0.88));
    tries.push(target);
  }
  for (const ink of tries) {
    const hex = toHex(ink);
    if (denied(hex)) continue;
    if (passes(contrastRatio(hex, paperHex), "body")) return ink;
  }
  return null;
}

function chooseSignal(seed: Rgb, ink: Rgb, paper: Rgb, allowSeed: boolean): string {
  const seedHex = toHex(seed);
  const inkHex = toHex(ink);
  const paperHex = toHex(paper);
  // A seed that cannot be body text stays the signal swatch, even under 3:1.
  if (allowSeed && seedHex !== inkHex && seedHex !== paperHex) return seedHex;
  const onLight = relLum(paper) >= 0.5;
  const pivots = onLight
    ? [SAFE_SIGNAL, "#1f6f5b", "#14532d", FALLBACK_INK]
    : [FALLBACK_PAPER, "#ffffff", "#f7f3ea", SAFE_SIGNAL];
  for (const pivotHex of pivots) {
    const mixed = toHex(channelMix(seed, parseHex(pivotHex), 0.7));
    if (usableSignal(mixed, inkHex, paperHex)) return mixed;
    if (usableSignal(pivotHex, inkHex, paperHex)) return pivotHex;
  }
  const reserve = onLight ? "#14532d" : "#ffffff";
  if (usableSignal(reserve, inkHex, paperHex)) return reserve;
  return SAFE_SIGNAL;
}

function usableSignal(hex: string, inkHex: string, paperHex: string): boolean {
  if (denied(hex) || hex === inkHex || hex === paperHex) return false;
  return passes(contrastRatio(hex, paperHex), "large");
}

function draftFrom(paperRgb: Rgb, seed: Rgb, allowSeed: boolean): Draft | null {
  const inkRgb = readableInk(seed, paperRgb, allowSeed);
  if (!inkRgb) return null;
  const paper = toHex(paperRgb);
  const ink = toHex(inkRgb);
  const signal = chooseSignal(seed, inkRgb, paperRgb, allowSeed);
  if (denied(paper) || denied(ink) || denied(signal)) return null;
  const ratioBody = contrastRatio(ink, paper);
  // Signal contrast never rescues a failing ink. Drop the whole candidate.
  if (!passes(ratioBody, "body")) return null;
  return { paper, ink, signal, ratioBody };
}

function fallbackDraft(seed: Rgb, allowSeed: boolean): Draft {
  const paper = parseHex(FALLBACK_PAPER);
  const ink = parseHex(FALLBACK_INK);
  let signal = chooseSignal(seed, ink, paper, allowSeed);
  if (denied(signal) || signal === FALLBACK_INK) signal = SAFE_SIGNAL;
  const ratioBody = contrastRatio(FALLBACK_INK, FALLBACK_PAPER);
  return { paper: FALLBACK_PAPER, ink: FALLBACK_INK, signal, ratioBody };
}

function pushUnique(list: Draft[], draft: Draft | null): void {
  if (!draft) return;
  if (!passes(draft.ratioBody, "body")) return;
  if (denied(draft.paper) || denied(draft.ink) || denied(draft.signal)) return;
  const id = `${draft.paper}|${draft.ink}`;
  if (list.some((item) => `${item.paper}|${item.ink}` === id)) return;
  list.push(draft);
}

function nameDrafts(drafts: readonly Draft[]): Palette[] {
  const named: Palette[] = [];
  for (let index = 0; index < drafts.length && named.length < 3; index += 1) {
    const draft = drafts[index];
    const name = NAMES[named.length];
    if (!draft || !name) continue;
    if (!passes(draft.ratioBody, "body")) continue;
    named.push({ name, ...draft });
  }
  if (named.length === 0) {
    const spare = fallbackDraft(parseHex(SAFE_SIGNAL), false);
    named.push({ name: "paper", ...spare });
  }
  return named;
}

interface Mention {
  name: string;
  index: number;
  pairId: number | null;
}

interface TagHit {
  index: number;
  value: string;
  kind: "world" | "tone" | "era" | "industry" | "flag";
}

const LEXICON: readonly { readonly pattern: RegExp; readonly kind: TagHit["kind"]; readonly value: string }[] = [
  { pattern: /\beditorial\b/i, kind: "world", value: "editorial" },
  { pattern: /\bliterary\b/i, kind: "world", value: "editorial" },
  { pattern: /\bserif\b/i, kind: "world", value: "editorial" },
  { pattern: /\bplayful\b/i, kind: "world", value: "playful" },
  { pattern: /\bbrutal(?:ist)?\b/i, kind: "world", value: "brutalist" },
  { pattern: /\b3d(?:-|\s)?world\b/i, kind: "world", value: "3d-world" },
  { pattern: /\b(?:webgl|shader)\b/i, kind: "world", value: "3d-world" },
  { pattern: /\bfashion\b/i, kind: "world", value: "fashion" },
  { pattern: /\b(?:product|interface|startup|tech|saas)\b/i, kind: "world", value: "product" },
  { pattern: /\bcivic\b/i, kind: "world", value: "civic" },
  { pattern: /\bswiss\b/i, kind: "tone", value: "swiss" },
  { pattern: /\bquiet\b/i, kind: "tone", value: "quiet" },
  { pattern: /\bwarm\b/i, kind: "tone", value: "warm" },
  { pattern: /\bsharp\b/i, kind: "tone", value: "sharp" },
  { pattern: /\bmagazine\b/i, kind: "tone", value: "magazine" },
  { pattern: /\bgallery\b/i, kind: "tone", value: "gallery" },
  { pattern: /\bprecise\b/i, kind: "tone", value: "precise" },
  { pattern: /\bconstructed\b/i, kind: "tone", value: "constructed" },
  { pattern: /\bposter\b/i, kind: "tone", value: "poster" },
  { pattern: /\bbookish\b/i, kind: "era", value: "bookish" },
  { pattern: /\bbook\b/i, kind: "era", value: "book" },
  { pattern: /\bpublishing\b/i, kind: "industry", value: "publishing" },
  { pattern: /\bfood\b/i, kind: "industry", value: "food" },
  { pattern: /\bcraft\b/i, kind: "industry", value: "craft" },
  { pattern: /\bhospitality\b/i, kind: "industry", value: "hospitality" },
  { pattern: /\bfilm\b/i, kind: "industry", value: "film" },
  { pattern: /\bmusic\b/i, kind: "industry", value: "music" },
  { pattern: /\beducation\b/i, kind: "industry", value: "education" },
  { pattern: /\bclimate\b/i, kind: "industry", value: "climate" },
  { pattern: /\bretail\b/i, kind: "industry", value: "retail" },
  { pattern: /\bsport\b/i, kind: "industry", value: "sport" },
  { pattern: /\bstudio\b/i, kind: "industry", value: "studio" },
  { pattern: /\bprint\b/i, kind: "industry", value: "print" },
  { pattern: /\bmanufacturing\b/i, kind: "industry", value: "manufacturing" },
  { pattern: /\bcoffee\b/i, kind: "industry", value: "coffee" },
  { pattern: /\btools\b/i, kind: "industry", value: "tools" },
  { pattern: /\bhome\b/i, kind: "industry", value: "home" },
  { pattern: /\bone family\b|\bsingle[- ]family\b/i, kind: "flag", value: "one family" },
];

function pairingById(id: number): TypePairing | undefined {
  return TYPE_LIBRARY.find((pairing) => pairing.id === id);
}

function unmatchedPair(): TypePairing {
  const pairing = pairingById(UNMATCHED_PAIR_ID);
  if (!pairing) throw new TokenError("Missing unmatched type pairing.");
  if (TYPE_LIBRARY[0]?.id === pairing.id) throw new TokenError("Unmatched type pairing must not be index 0.");
  return pairing;
}

function familiesOf(pairing: TypePairing): [string, string] | [string] {
  if (pairing.display === pairing.body) return [pairing.display];
  return [pairing.display, pairing.body];
}

function listChoice(pairing: TypePairing, adjectives: readonly string[]): TypePair {
  return {
    families: familiesOf(pairing),
    source: "list",
    warnings: [],
    license: pairing.ship,
    adjectives,
    pairId: pairing.id,
  };
}

function userFromPair(pairing: TypePairing, adjectives: readonly string[]): TypePair {
  return {
    families: familiesOf(pairing),
    source: "user",
    warnings: [],
    license: pairing.ship,
    adjectives,
    pairId: pairing.id,
  };
}

function userChoice(
  families: [string, string] | [string],
  warnings: string[],
  adjectives: readonly string[],
  pairId: number | null,
  license: string,
): TypePair {
  return {
    families,
    source: "user",
    warnings,
    license,
    adjectives,
    pairId,
  };
}

function readAdjectives(answer: string): string[] {
  const hits: TagHit[] = [];
  for (const entry of LEXICON) {
    const pattern = new RegExp(entry.pattern.source, "gi");
    for (const match of answer.matchAll(pattern)) {
      hits.push({ index: match.index ?? 0, kind: entry.kind, value: entry.value });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const adjectives: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (seen.has(hit.value)) continue;
    seen.add(hit.value);
    adjectives.push(hit.value);
  }
  return adjectives;
}

function dealFromMood(answer: string, adjectives: readonly string[]): TypePair {
  const worlds = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "world" && entry.value === value)));
  const tones = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "tone" && entry.value === value)));
  const eras = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "era" && entry.value === value)));
  const industries = new Set(adjectives.filter((value) => LEXICON.some((entry) => entry.kind === "industry" && entry.value === value)));
  const oneFamily = adjectives.includes("one family");
  if (tones.has("swiss")) worlds.add("product");
  let best: TypePairing | null = null;
  let bestScore = 0;
  for (const pairing of TYPE_LIBRARY) {
    if (pairing.deal !== "default") continue;
    if (isOverusedFamily(pairing.display) || isOverusedFamily(pairing.body)) continue;
    let score = 0;
    for (const world of pairing.worlds) if (worlds.has(world)) score += 3;
    for (const tone of pairing.tone) if (tones.has(tone)) score += 2;
    for (const era of pairing.era) if (eras.has(era)) score += 2;
    for (const industry of pairing.industry) if (industries.has(industry)) score += 2;
    if (oneFamily && pairing.display === pairing.body) score += 4;
    if (score <= 0) continue;
    if (best === null || score > bestScore || (score === bestScore && pairing.id < best.id)) {
      best = pairing;
      bestScore = score;
    }
  }
  if (best === null) return listChoice(unmatchedPair(), adjectives);
  return listChoice(best, adjectives);
}

interface CatalogName {
  name: string;
  pairId: number | null;
}

function knownCatalog(): CatalogName[] {
  const byName = new Map<string, { name: string; ids: number[] }>();
  const add = (name: string, id: number | null) => {
    const key = name.toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, { name, ids: id === null ? [] : [id] });
      return;
    }
    if (id !== null && !current.ids.includes(id)) current.ids.push(id);
  };
  for (const pairing of TYPE_LIBRARY) {
    add(pairing.display, pairing.id);
    add(pairing.body, pairing.id);
  }
  for (const name of OVERUSED_DEFAULTS) add(name, null);
  const catalog: CatalogName[] = [];
  for (const entry of byName.values()) {
    catalog.push({ name: entry.name, pairId: entry.ids.length === 1 ? (entry.ids[0] ?? null) : null });
  }
  catalog.sort((a, b) => b.name.length - a.name.length);
  return catalog;
}

function isKnownName(name: string): boolean {
  const key = name.toLowerCase();
  return knownCatalog().some((entry) => entry.name.toLowerCase() === key);
}

function bounded(text: string, start: number, length: number): boolean {
  const before = start === 0 ? "" : text.charAt(start - 1);
  const after = start + length >= text.length ? "" : text.charAt(start + length);
  const edge = (ch: string) => ch === "" || !/[A-Za-z0-9]/.test(ch);
  return edge(before) && edge(after);
}

function findKnown(answer: string): Mention[] {
  const lower = answer.toLowerCase();
  const hits: Mention[] = [];
  for (const family of knownCatalog()) {
    const needle = family.name.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      if (bounded(lower, at, needle.length)) {
        hits.push({ name: family.name, index: at, pairId: family.pairId });
      }
      from = at + Math.max(needle.length, 1);
    }
  }
  hits.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  const kept: Mention[] = [];
  let coveredUntil = -1;
  for (const hit of hits) {
    if (hit.index < coveredUntil) continue;
    const extended = extendKnown(answer, hit);
    kept.push(extended);
    coveredUntil = extended.index + extended.name.length;
  }
  return kept;
}

/** "Archivo Black" is one name the person typed, not the shorter library face plus a stray word. */
function extendKnown(answer: string, hit: Mention): Mention {
  const end = hit.index + hit.name.length;
  const extra = /^(\s+)([A-Z][A-Za-z0-9]*)/.exec(answer.slice(end));
  const word = extra?.[2];
  const gap = extra?.[1];
  if (!word || !gap || GLUE.test(word) || isKnownName(word)) return hit;
  return {
    name: answer.slice(hit.index, end + gap.length + word.length),
    index: hit.index,
    pairId: null,
  };
}

function sharedPair(first: Mention, second: Mention): TypePairing | null {
  if (first.pairId !== null && first.pairId === second.pairId) return pairingById(first.pairId) ?? null;
  const left = first.name.toLowerCase();
  const right = second.name.toLowerCase();
  return (
    TYPE_LIBRARY.find((pairing) => {
      const display = pairing.display.toLowerCase();
      const body = pairing.body.toLowerCase();
      return (display === left && body === right) || (display === right && body === left);
    }) ?? null
  );
}

function findUnknown(answer: string, known: readonly Mention[]): Mention[] {
  const spans = known.map((hit) => ({ start: hit.index, end: hit.index + hit.name.length }));
  const found: Mention[] = [];
  const pattern = /\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3}\b/g;
  for (const match of answer.matchAll(pattern)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const end = index + raw.length;
    if (spans.some((span) => index < span.end && end > span.start)) continue;
    const words = raw.split(/\s+/).filter((word) => !GLUE.test(word));
    if (words.length === 0) continue;
    found.push({ name: words.join(" "), index, pairId: null });
  }
  return found;
}

function collectMentions(answer: string): Mention[] {
  const known = findKnown(answer);
  return [...known, ...findUnknown(answer, known)].sort((a, b) => a.index - b.index);
}

function uniqueMentions(items: readonly Mention[]): Mention[] {
  const seen = new Set<string>();
  const unique: Mention[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
