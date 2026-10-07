/**
 * Sens-O-Matic tokens. Palettes are 60-30-10: paper, ink, signal.
 * Ink on paper must clear WCAG 2.2 body contrast (4.5). A miss is dropped.
 * A seed that fails as body text stays a signal swatch, never the ink.
 * Type is one family or a pair from DP-1.5. This module does not download fonts.
 */

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
  license: string;
}

/** Tailwind indigo-600 and violet-600. Never propose these, alone or as a pair. */
export const DENY_HEX = ["#4f46e5", "#7c3aed"] as const;

export const TYPE_LICENSE = "Google Fonts or Fontshare. Confirm the license at install.";

/** Six DP-1.5 pairings, in tree order. At most two families. */
export const TYPE_PAIRINGS: readonly (readonly [string, string])[] = [
  ["Bebas Neue", "Barlow"],
  ["Space Grotesk", "Inter"],
  ["DM Serif Display", "DM Sans"],
  ["Fraunces", "Work Sans"],
  ["Archivo Black", "Archivo"],
  ["Clash Display", "Satoshi"],
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

const MOODS: readonly RegExp[] = [
  /\b(condensed|poster|impact|caps)\b/i,
  /\b(tech|geometric|grotesk|startup|interface)\b/i,
  /\b(elegant|editorial|literary|classic|serif)\b/i,
  /\b(warm|quirky|craft|food|soft)\b/i,
  /\b(swiss|grotesque|neutral|single-family|one family)\b/i,
  /\b(fashion|sharp)\b/i,
];

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

export function pickType(answer: string | null): TypePair {
  const text = answer?.trim() ?? "";
  if (text.length === 0) return listChoice(0);
  const found = uniqueMentions(collectMentions(text));
  const first = found[0];
  if (!first) return listChoice(moodIndex(text));
  const second = found[1];
  if (!second) {
    if (first.pairIndex !== null) return userChoice(pairingAt(first.pairIndex), []);
    return userChoice([first.name], []);
  }
  const warnings = found.length > 2 ? ["dropped extra family"] : [];
  return userChoice([first.name, second.name], warnings);
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
  pairIndex: number | null;
}

function pairingAt(index: number): [string, string] {
  const pair = TYPE_PAIRINGS[index];
  if (!pair) throw new TokenError("Missing type pairing.");
  return [pair[0], pair[1]];
}

function listChoice(index: number): TypePair {
  return {
    families: pairingAt(index),
    source: "list",
    warnings: [],
    license: TYPE_LICENSE,
  };
}

function userChoice(families: [string, string] | [string], warnings: string[]): TypePair {
  return {
    families,
    source: "user",
    warnings,
    license: TYPE_LICENSE,
  };
}

function moodIndex(answer: string): number {
  for (let index = 0; index < MOODS.length; index += 1) {
    const mood = MOODS[index];
    if (mood?.test(answer)) return index;
  }
  return 0;
}

function knownCatalog(): { name: string; pairIndex: number }[] {
  const catalog: { name: string; pairIndex: number }[] = [];
  for (let index = 0; index < TYPE_PAIRINGS.length; index += 1) {
    const pair = TYPE_PAIRINGS[index];
    if (!pair) continue;
    catalog.push({ name: pair[0], pairIndex: index });
    catalog.push({ name: pair[1], pairIndex: index });
  }
  catalog.sort((a, b) => b.name.length - a.name.length);
  return catalog;
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
        hits.push({ name: family.name, index: at, pairIndex: family.pairIndex });
      }
      from = at + Math.max(needle.length, 1);
    }
  }
  hits.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  const kept: Mention[] = [];
  let coveredUntil = -1;
  for (const hit of hits) {
    if (hit.index < coveredUntil) continue;
    kept.push(hit);
    coveredUntil = hit.index + hit.name.length;
  }
  return kept;
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
    found.push({ name: words.join(" "), index, pairIndex: null });
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
