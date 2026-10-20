/**
 * Static anti-slop lint for site output and Guide UI strings (prompt 112).
 *
 * A new text ban is one function in `CHECKERS`. Words and phrases come from
 * the engine voice list, which matches the anti-slop pack fences. Copy bans
 * stay in `CHECKERS`. Visual cluster tells are `judgeAiCluster`. They measure
 * outcomes and do not ban a library. The caller passes the text. This module
 * does not read the pack from disk.
 *
 * `elevate` is a whole word, case-insensitive. `elevation` and `elevated` are
 * not hits. Site mode flags every line. Guide mode skips the elevate hit on a
 * line that contains `/hh-elevate` or `The Hitchhiker's Guide` (straight or
 * typographic apostrophe). Other lines still flag elevate. Guide mode returns
 * no hits when the text is the anti-slop pack's own discussion.
 *
 * Magnetic is file-level. Both `magnetic` and `pointer` must appear.
 * Purple gradients use the same hue window as the shell CSS check: 230 to 295
 * degrees, saturation above 0.18, mid lightness. A hyphen is not an em dash.
 */

import { BANNED_PHRASES, BANNED_WORDS, DENY_HEX, isOverusedFamily } from "@hitchhiker/engine";

export interface SlopHit {
  line: number;
  rule: string;
}

interface SlopContext {
  text: string;
  mode: "site" | "guide";
  lines: readonly string[];
  hits: SlopHit[];
  seen: Set<string>;
}

type SlopChecker = (ctx: SlopContext) => void;

const GUIDE_TITLE = "The Hitchhiker's Guide";
const GUIDE_TITLE_CURLY = "The Hitchhiker\u2019s Guide";
const ELEVATE_COMMAND = "/hh-elevate";
const PACK_NAME = "name: anti-slop";
const PACK_LINE = "This file is the ban list.";

const HYPE_WORDS = BANNED_WORDS.filter((word) => word !== "elevate");

const EXTRA_PHRASES = ["learn more", "get started", "build the future of"] as const;

const EMOJI = /\p{Extended_Pictographic}/u;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function add(ctx: SlopContext, line: number, rule: string): void {
  const key = `${line}\0${rule}`;
  if (ctx.seen.has(key)) return;
  ctx.seen.add(key);
  ctx.hits.push({ line, rule });
}

function fold(line: string): string {
  return line.replace(/\u2019/g, "'").replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAt(text: string, index: number): number {
  let line = 1;
  const end = Math.min(index, text.length);
  for (let i = 0; i < end; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function isPackDiscussion(text: string): boolean {
  return text.includes(PACK_NAME) && text.includes(PACK_LINE);
}

function elevateLineExempt(line: string, mode: "site" | "guide"): boolean {
  if (mode !== "guide") return false;
  return (
    line.includes(ELEVATE_COMMAND) ||
    line.includes(GUIDE_TITLE) ||
    line.includes(GUIDE_TITLE_CURLY)
  );
}

function checkLorem(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (/\blorem\b/i.test(line)) add(ctx, index + 1, "lorem");
  }
}

function checkExclamation(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (line.includes("!")) add(ctx, index + 1, "exclamation");
  }
}

function checkEmDash(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (line.includes("\u2014") || /&mdash;|&#8212;|&#x0*2014;/i.test(line)) {
      add(ctx, index + 1, "em-dash");
    }
  }
}

function checkElevate(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (elevateLineExempt(line, ctx.mode)) continue;
    if (/\belevate\b/i.test(line)) add(ctx, index + 1, "elevate");
  }
}

function checkHypeWords(ctx: SlopContext): void {
  const pattern = new RegExp(
    `\\b(?:${HYPE_WORDS.map((word) => escapeRegExp(word)).join("|")})\\b`,
    "gi",
  );
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const word = match[0];
      if (word === undefined) continue;
      add(ctx, index + 1, `word:${word.toLowerCase()}`);
    }
  }
}

function checkPhrases(ctx: SlopContext): void {
  const phrases = [...BANNED_PHRASES, ...EXTRA_PHRASES];
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const folded = fold(ctx.lines[index] ?? "");
    for (const phrase of phrases) {
      if (folded.includes(phrase)) add(ctx, index + 1, `phrase:${phrase}`);
    }
  }
}

function checkUntrackedTodo(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (!/\bTODO\b/.test(line)) continue;
    if (/\bASSETS\b/.test(line) || /\bSTATE\b/.test(line)) continue;
    add(ctx, index + 1, "todo");
  }
}

function checkEmojiInHeadings(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    const heading = /^\s{0,3}#{1,6}\s+\S/.test(line) || /<\s*h[1-6]\b/i.test(line);
    if (!heading || !EMOJI.test(line)) continue;
    add(ctx, index + 1, "emoji-heading");
  }
}

function checkIndigoUtilities(ctx: SlopContext): void {
  const pattern =
    /(?:^|[^A-Za-z0-9_-])(?:[A-Za-z0-9-]+:)*[A-Za-z0-9-]*indigo-\d{2,3}(?![A-Za-z0-9_-])/i;
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (pattern.test(line)) add(ctx, index + 1, "indigo");
  }
}

function checkGray50(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (/(?:^|[^A-Za-z0-9_-])bg-gray-50(?![A-Za-z0-9_-])/i.test(line)) {
      add(ctx, index + 1, "gray-50");
    }
  }
}

function checkCenteredContainer(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (
      line.includes("max-w-7xl") &&
      line.includes("mx-auto") &&
      line.includes("text-center")
    ) {
      add(ctx, index + 1, "centered-container");
    }
  }
}

function isBannedPalette(rgb: Rgb): boolean {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return false;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === rgb.r) hue = ((rgb.g - rgb.b) / delta) % 6;
  else if (max === rgb.g) hue = (rgb.b - rgb.r) / delta + 2;
  else hue = (rgb.r - rgb.g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return saturation > 0.18 && lightness > 0.12 && lightness < 0.92 && hue >= 230 && hue <= 295;
}

function parseHex(token: string): Rgb | null {
  const raw = token.slice(1);
  const full =
    raw.length === 3
      ? raw.replace(/[0-9a-fA-F]/g, (channel) => channel + channel)
      : raw.length === 6 || raw.length === 8
        ? raw.slice(0, 6)
        : "";
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

function gradientBodies(text: string): Array<{ body: string; index: number }> {
  const found: Array<{ body: string; index: number }> = [];
  const start = /(?:linear|radial|conic)-gradient\(/gi;
  for (const match of text.matchAll(start)) {
    const origin = match.index ?? 0;
    const open = origin + match[0].length;
    let depth = 1;
    let cursor = open;
    while (cursor < text.length && depth > 0) {
      const ch = text[cursor];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) found.push({ body: text.slice(open, cursor - 1), index: origin });
  }
  return found;
}

function gradientUsesBannedPalette(body: string): boolean {
  if (/\b(?:indigo|violet|purple|rebeccapurple|blueviolet|fuchsia)\b/i.test(body)) return true;
  const hexes = body.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) ?? [];
  for (const token of hexes) {
    const rgb = parseHex(token);
    if (rgb !== null && isBannedPalette(rgb)) return true;
  }
  const channels =
    /rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})/gi;
  for (const match of body.matchAll(channels)) {
    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    if ([red, green, blue].some((channel) => channel > 255)) continue;
    if (isBannedPalette({ r: red / 255, g: green / 255, b: blue / 255 })) return true;
  }
  return false;
}

function checkPurpleGradient(ctx: SlopContext): void {
  for (const gradient of gradientBodies(ctx.text)) {
    if (gradientUsesBannedPalette(gradient.body)) {
      add(ctx, lineAt(ctx.text, gradient.index), "purple-gradient");
    }
  }
  const stops = /(?:from|via|to)-(?:violet|purple|fuchsia)-\d{2,3}(?![A-Za-z0-9_-])/gi;
  for (const match of ctx.text.matchAll(stops)) {
    add(ctx, lineAt(ctx.text, match.index ?? 0), "purple-gradient");
  }
}

function checkRainbowGradient(ctx: SlopContext): void {
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = fold(ctx.lines[index] ?? "");
    if (line.includes("rainbow gradient")) add(ctx, index + 1, "rainbow-gradient");
  }
}

function checkMagnetic(ctx: SlopContext): void {
  const folded = ctx.text.toLowerCase();
  if (!folded.includes("magnetic") || !folded.includes("pointer")) return;
  for (let index = 0; index < ctx.lines.length; index += 1) {
    const line = ctx.lines[index] ?? "";
    if (line.toLowerCase().includes("magnetic")) add(ctx, index + 1, "magnetic");
  }
}

const CHECKERS: readonly SlopChecker[] = [
  checkLorem,
  checkExclamation,
  checkEmDash,
  checkElevate,
  checkHypeWords,
  checkPhrases,
  checkUntrackedTodo,
  checkEmojiInHeadings,
  checkIndigoUtilities,
  checkGray50,
  checkCenteredContainer,
  checkPurpleGradient,
  checkRainbowGradient,
  checkMagnetic,
];

export function lintSlop(text: string, mode: "site" | "guide"): SlopHit[] {
  if (mode !== "site" && mode !== "guide") {
    throw new Error(`lintSlop mode must be "site" or "guide". Received ${JSON.stringify(mode)}.`);
  }
  if (text === "") return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (mode === "guide" && isPackDiscussion(normalized)) return [];
  const ctx: SlopContext = {
    text: normalized,
    mode,
    lines: normalized.split("\n"),
    hits: [],
    seen: new Set<string>(),
  };
  for (const checker of CHECKERS) checker(ctx);
  ctx.hits.sort((a, b) => a.line - b.line);
  return ctx.hits;
}

/** Same names as the 241e vision bans. Kept here so this file does not import zaphod. */
export const AI_CLUSTER_VISION_KEYS = [
  "genericAiDefaultType",
  "weakDisplayBodyContrast",
  "blobHero",
  "threeIconCards",
  "clonedRhythm",
  "stockLaptopPeople",
  "fakeLogos",
  "fakeTestimonials",
  "fakeNumbers",
] as const;

export type AiClusterVisionKey = (typeof AI_CLUSTER_VISION_KEYS)[number];

export interface AiClusterInput {
  css: string;
  html: string;
  namedFamilies?: readonly string[];
  brief?: string;
  vision?: Partial<Record<AiClusterVisionKey, boolean>>;
}

export interface AiClusterHit {
  tell: string;
  detail: string;
}

export interface AiClusterResult {
  pass: boolean;
  hits: readonly AiClusterHit[];
}

const VISION_DETAIL: Record<AiClusterVisionKey, string> = {
  genericAiDefaultType: "Generic or AI-default type.",
  weakDisplayBodyContrast: "Weak display and body contrast.",
  blobHero: "Blob hero.",
  threeIconCards: "Three icon cards.",
  clonedRhythm: "Cloned rhythm.",
  stockLaptopPeople: "Stock laptop people.",
  fakeLogos: "Fake logos.",
  fakeTestimonials: "Fake testimonials.",
  fakeNumbers: "Fake numbers.",
};

const DISPLAY_SELECTOR = /(?:^|[\s,>+~])(?:h1|\.display|\.hero)(?![A-Za-z0-9_-])/i;
const HERO_SELECTOR = /(?:^|[\s,>+~.#])hero(?![A-Za-z0-9_-])/i;
const DENY = new Set<string>(DENY_HEX);

/**
 * Palette and chrome tells. An overused display face fails unless the person
 * named it. A Three.js import is not a tell. Copy lint stays in `lintSlop`.
 */
export function judgeAiCluster(input: AiClusterInput): AiClusterResult {
  const hits: AiClusterHit[] = [];
  const css = `${input.css}\n${embeddedCss(input.html)}`;
  const rules = parseRules(css);
  for (const family of displayFamilies(rules, input.html)) {
    if (!isOverusedFamily(family) || familyNamed(family, input)) continue;
    hits.push({
      tell: "display-face",
      detail: `Display face is ${family}. A default face is refused unless the person named it.`,
    });
  }
  for (const hex of heroDenyHex(rules, input.html)) {
    hits.push({
      tell: "deny-hex",
      detail: `Hero uses ${hex}. Indigo and violet defaults are refused.`,
    });
  }
  if (blobHero(rules, input.html)) hits.push({ tell: "blob-hero", detail: "Blob hero." });
  if (threeIdenticalIconCards(input.html)) {
    hits.push({ tell: "three-icon-cards", detail: "Three identical icon cards." });
  }
  if (clonedRhythm(input.html)) hits.push({ tell: "cloned-rhythm", detail: "Cloned section rhythm." });
  if (stockLaptopPeople(input.html)) hits.push({ tell: "stock-laptop", detail: "Stock laptop people." });
  if (/logoipsum|fake-logo|placeholder-logo/i.test(input.html)) {
    hits.push({ tell: "fake-logos", detail: "Fake logos." });
  }
  if (/fake-testimonial|\bjohn doe\b|\bjane doe\b/i.test(input.html)) {
    hits.push({ tell: "fake-testimonials", detail: "Fake testimonials." });
  }
  if (/fake-number|trusted by \d|\b\d[\d,]*\+\s+(?:happy\s+)?(?:customers|clients|users)\b/i.test(input.html)) {
    hits.push({ tell: "fake-numbers", detail: "Fake numbers." });
  }
  const vision = input.vision;
  if (vision !== undefined) {
    for (const key of AI_CLUSTER_VISION_KEYS) {
      if (vision[key] === true) hits.push({ tell: key, detail: VISION_DETAIL[key] });
    }
  }
  return { pass: hits.length === 0, hits };
}

function familyNamed(family: string, input: AiClusterInput): boolean {
  const key = family.trim().toLowerCase();
  for (const name of input.namedFamilies ?? []) {
    if (name.trim().toLowerCase() === key) return true;
  }
  const brief = input.brief ?? "";
  if (brief.trim() === "") return false;
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?:[^A-Za-z0-9]|$)`, "i").test(brief);
}

function displayFamilies(rules: readonly CssRule[], html: string): string[] {
  const found: string[] = [];
  for (const rule of rules) {
    if (!DISPLAY_SELECTOR.test(rule.selector)) continue;
    const family = familyOf(rule.body);
    if (family !== "") found.push(family);
  }
  for (const tag of tags(html)) {
    const tokens = classTokens(tag.attrs);
    const display = tag.name === "h1" || tokens.includes("display") || tokens.includes("hero");
    if (!display) continue;
    const family = familyOf(styleOf(tag.attrs));
    if (family !== "") found.push(family);
  }
  return dedupeFamilies(found);
}

function heroDenyHex(rules: readonly CssRule[], html: string): string[] {
  const found: string[] = [];
  for (const rule of rules) {
    if (!HERO_SELECTOR.test(rule.selector)) continue;
    for (const hex of hexes(rule.body)) {
      if (DENY.has(hex)) found.push(hex);
    }
  }
  for (const tag of tags(html)) {
    if (!classTokens(tag.attrs).includes("hero") && !/\bid\s*=\s*["']hero["']/i.test(tag.attrs)) continue;
    for (const hex of hexes(styleOf(tag.attrs))) {
      if (DENY.has(hex)) found.push(hex);
    }
  }
  return [...new Set(found)];
}

function blobHero(rules: readonly CssRule[], html: string): boolean {
  for (const rule of rules) {
    const blob = /\bblob\b/i.test(rule.selector) || /\bblob\b/i.test(rule.body);
    if (blob && (HERO_SELECTOR.test(rule.selector) || /\bblob-hero\b/i.test(rule.selector))) return true;
  }
  if (/\bblob-hero\b/i.test(html)) return true;
  for (const tag of tags(html)) {
    const tokens = classTokens(tag.attrs);
    if (tokens.includes("blob") && tokens.includes("hero")) return true;
  }
  return false;
}

function threeIdenticalIconCards(html: string): boolean {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/<(article|div|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tokens = classTokens(match[2] ?? "");
    const card = tokens.includes("card") || tokens.some((token) => token.endsWith("-card"));
    if (!card) continue;
    const icon = (match[3] ?? "").match(/\bicon[-a-z0-9]*/i);
    if (icon === null) continue;
    const key = icon[0].toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 3) return true;
  }
  return false;
}

function clonedRhythm(html: string): boolean {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
    const classes = classTokens(match[1] ?? "").join(" ");
    if (classes === "") continue;
    const inner = [...(match[2] ?? "").matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)]
      .map((item) => (item[1] ?? "").toLowerCase())
      .join(">");
    const key = `${classes}|${inner}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 3) return true;
  }
  return false;
}

function stockLaptopPeople(html: string): boolean {
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0].toLowerCase();
    if (tag.includes("laptop") && /stock|unsplash|pexels|shutterstock/.test(tag)) return true;
  }
  return false;
}

interface CssRule {
  selector: string;
  body: string;
}

function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  for (const match of css.matchAll(/([^{}/]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim();
    if (selector === "" || selector.startsWith("@")) continue;
    rules.push({ selector, body: match[2] ?? "" });
  }
  return rules;
}

function embeddedCss(html: string): string {
  const parts: string[] = [];
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) parts.push(match[1] ?? "");
  return parts.join("\n");
}

function tags(html: string): Array<{ name: string; attrs: string }> {
  const found: Array<{ name: string; attrs: string }> = [];
  for (const match of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    found.push({ name: (match[1] ?? "").toLowerCase(), attrs: match[2] ?? "" });
  }
  return found;
}

function classTokens(attrs: string): string[] {
  const match = /class\s*=\s*["']([^"']*)["']/i.exec(attrs);
  if (match === null) return [];
  return (match[1] ?? "").split(/\s+/).map((token) => token.trim().toLowerCase()).filter((token) => token !== "");
}

function styleOf(attrs: string): string {
  const match = /style\s*=\s*["']([^"']*)["']/i.exec(attrs);
  return match?.[1] ?? "";
}

function familyOf(body: string): string {
  const match = /font-family\s*:\s*([^;}{]+)/i.exec(body);
  if (match === null) return "";
  const first = (match[1] ?? "").split(",")[0] ?? "";
  return first.replace(/!important/gi, "").replace(/["']/g, "").trim();
}

function hexes(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = normalizeHex(match[0]);
    if (hex !== null && DENY.has(hex)) found.push(hex);
  }
  return found;
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
  if (match === null) return null;
  const hex = match[1] ?? "";
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  return `#${hex.slice(0, 6)}`;
}

function dedupeFamilies(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
