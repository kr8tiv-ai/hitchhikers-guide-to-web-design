/**
 * Static anti-slop lint for site output and Guide UI strings (prompt 112).
 *
 * A new text ban is one function in `CHECKERS`. Words and phrases come from
 * the engine voice list, which matches the anti-slop pack fences. Visual bans
 * (three icon cards, a blob hero, cloned rhythm) are not decided here. The
 * caller passes the text. This module does not read the pack from disk.
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

import { BANNED_PHRASES, BANNED_WORDS } from "@hitchhiker/engine";

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
