/**
 * Wordmarks are glyph outlines from a font file.
 * An Imagine raster is refused. Letters are never traced.
 * opentype.js 2.0.0 retired loadSync, so the file is parsed from bytes.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { optimize } from "svgo";

const require = createRequire(import.meta.url);

const INK = "#111111";
const FONT_ONLY = "Set the wordmark in a font. An Imagine raster is not the wordmark.";

export interface WordmarkSvgOptions {
  text: string;
  glyphToPath: (ch: string) => string;
  source: "font" | "imagine-raster";
}

export interface WordmarkFontOptions {
  fontPath: string;
  text: string;
  fontSize: number;
  source?: "font" | "imagine-raster";
}

interface GlyphFace {
  advanceWidth?: number;
  getPath(
    x: number,
    y: number,
    fontSize: number,
    options: { drawSVG: false; drawLayers: false },
  ): { toPathData(decimalPlaces: number): string };
}

interface FontFace {
  unitsPerEm: number;
  ascender?: number;
  descender?: number;
  hasChar(ch: string): boolean;
  charToGlyph(ch: string): GlyphFace;
  getKerningValue(left: GlyphFace, right: GlyphFace): number;
}

interface LaidGlyph {
  ch: string;
  d: string;
}

interface LaidWord {
  glyphs: LaidGlyph[];
  width: number;
  height: number;
}

let parseFontBytes: ((buffer: Buffer) => unknown) | null = null;

export function buildWordmarkSvg(opts: WordmarkSvgOptions): string {
  if (opts.source !== "font") {
    throw new Error(FONT_ONLY);
  }
  if (typeof opts.text !== "string" || opts.text.length === 0) {
    throw new Error("Wordmark text must not be empty.");
  }
  if (typeof opts.glyphToPath !== "function") {
    throw new Error("Wordmark needs a glyph path function.");
  }
  const paths: string[] = [];
  for (const ch of Array.from(opts.text)) {
    const data = opts.glyphToPath(ch);
    if (typeof data !== "string" || data.trim().length === 0) {
      throw new Error(emptyGlyph(ch));
    }
    paths.push(`<path fill="${INK}" d="${escapeAttr(data.trim())}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">${paths.join("")}</svg>`;
  assertLogoSvg(svg);
  return svg;
}

/** Shape text with opentype.js. Kerning is applied between glyph advances. */
export function wordmarkSvg(opts: WordmarkFontOptions): string {
  const source = opts.source ?? "font";
  if (source !== "font") {
    throw new Error(FONT_ONLY);
  }
  if (typeof opts.text !== "string" || opts.text.length === 0) {
    throw new Error("Wordmark text must not be empty.");
  }
  if (typeof opts.fontPath !== "string" || opts.fontPath.trim().length === 0) {
    throw new Error("Wordmark font path is empty.");
  }
  if (typeof opts.fontSize !== "number" || !Number.isFinite(opts.fontSize) || opts.fontSize <= 0) {
    throw new Error("Wordmark font size must be a positive number.");
  }
  const laid = layoutWord(loadFont(opts.fontPath), opts.text, opts.fontSize);
  let cursor = 0;
  const raw = buildWordmarkSvg({
    text: opts.text,
    source: "font",
    glyphToPath: (ch) => {
      const item = laid.glyphs[cursor];
      cursor += 1;
      if (item === undefined || item.ch !== ch || item.d.trim().length === 0) {
        throw new Error(emptyGlyph(ch));
      }
      return item.d;
    },
  });
  const fitted = replaceBox(raw, laid.width, laid.height);
  const inked = paintInk(svgoOptimize(fitted));
  assertLogoSvg(inked);
  return withoutDeclaration(inked);
}

export function assertLogoSvg(svg: string): void {
  if (typeof svg !== "string" || svg.length === 0) {
    throw new Error("Logo SVG is empty.");
  }
  if (/<image\b/i.test(svg) || /data:image/i.test(svg)) {
    throw new Error("Logo SVG must not embed an image.");
  }
  if (/<foreignObject\b/i.test(svg)) {
    throw new Error("Logo SVG must not use a foreignObject.");
  }
  if (/<text\b/i.test(svg)) {
    throw new Error("A text fallback is forbidden. Set the wordmark in a font.");
  }
  if (!/<svg\b/i.test(svg)) {
    throw new Error("Logo SVG needs an svg element.");
  }
  if (!/<path\b/i.test(svg)) {
    throw new Error("Logo SVG needs a path.");
  }
  if (strokeColors(svg).size > 1) {
    throw new Error("Logo SVG uses two stroke colors. Keep one color.");
  }
}

/** Square viewBox `0 0 size size`. Path data stays in the file. */
export function setViewBox(svg: string, size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("viewBox size must be a positive number.");
  }
  assertLogoSvg(svg);
  const box = readBox(svg);
  const inner = innerSvg(svg);
  const sx = size / box.w;
  const sy = size / box.h;
  const tx = -box.x;
  const ty = -box.y;
  const same =
    Math.abs(sx - 1) < 0.0001 &&
    Math.abs(sy - 1) < 0.0001 &&
    Math.abs(tx) < 0.0001 &&
    Math.abs(ty) < 0.0001;
  const body = same ? inner : `<g transform="${fitTransform(sx, sy, tx, ty)}">${inner}</g>`;
  const next = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(size)} ${num(size)}" width="${num(size)}" height="${num(size)}">${body}</svg>`;
  assertLogoSvg(next);
  return next;
}

export function svgoOptimize(svg: string): string {
  if (typeof svg !== "string" || svg.length === 0) {
    throw new Error("SVGO needs an SVG string.");
  }
  const result = optimize(svg, { multipass: true });
  return result.data;
}

/** Default ink is #111111. Two stroke colors are rejected before any rewrite. */
export function paintInk(svg: string): string {
  if (strokeColors(svg).size > 1) {
    throw new Error("Logo SVG uses two stroke colors. Keep one color.");
  }
  let next = svg.replace(/\bfill\s*=\s*"(?!none\b)[^"]*"/gi, `fill="${INK}"`);
  next = next.replace(/\bfill\s*=\s*'(?!none\b)[^']*'/gi, `fill="${INK}"`);
  next = next.replace(/\bfill\s*:\s*(?!none\b)[^;}"']+/gi, `fill:${INK}`);
  next = next.replace(/<path\b((?![^>]*\bfill\s*=)[^>]*)>/gi, `<path fill="${INK}"$1>`);
  if (strokeColors(next).size === 1) {
    next = next.replace(/\bstroke\s*=\s*"(?!none\b)[^"]*"/gi, `stroke="${INK}"`);
    next = next.replace(/\bstroke\s*=\s*'(?!none\b)[^']*'/gi, `stroke="${INK}"`);
    next = next.replace(/\bstroke\s*:\s*(?!none\b)[^;}"']+/gi, `stroke:${INK}`);
  }
  return next;
}

function layoutWord(font: FontFace, text: string, fontSize: number): LaidWord {
  const scale = fontSize / font.unitsPerEm;
  const ascender = numberOr(font.ascender, font.unitsPerEm * 0.8);
  const descender = numberOr(font.descender, -font.unitsPerEm * 0.2);
  const baseline = ascender * scale;
  const height = Math.max((ascender - descender) * scale, 1);
  const chars = Array.from(text);
  const glyphs = chars.map((ch) => requireGlyph(font, ch));
  let x = 0;
  const laid: LaidGlyph[] = [];
  for (let i = 0; i < glyphs.length; i += 1) {
    const glyph = glyphs[i];
    const ch = chars[i];
    if (glyph === undefined || ch === undefined) {
      throw new Error("Glyph path is empty for character.");
    }
    const path = glyph.getPath(x, baseline, fontSize, { drawSVG: false, drawLayers: false });
    const d = path.toPathData(2);
    if (typeof d !== "string" || d.trim().length === 0) {
      throw new Error(emptyGlyph(ch));
    }
    laid.push({ ch, d });
    const advance = numberOr(glyph.advanceWidth, 0) * scale;
    const next = glyphs[i + 1];
    const kern = next === undefined ? 0 : kernUnits(font, glyph, next) * scale;
    x += advance + kern;
  }
  return { glyphs: laid, width: Math.max(x, 1), height };
}

function loadFont(fontPath: string): FontFace {
  const bytes = readFileSync(fontPath);
  const parsed: unknown = openTypeParse()(bytes);
  if (!isFont(parsed)) {
    throw new Error("opentype.js did not return a font.");
  }
  return parsed;
}

function openTypeParse(): (buffer: Buffer) => unknown {
  if (parseFontBytes !== null) {
    return parseFontBytes;
  }
  const loaded: unknown = require("opentype.js");
  const record = unwrapModule(loaded);
  const parse = record.parse;
  if (typeof parse !== "function") {
    throw new Error("opentype.js parse is missing. Version 2.0.0 retired loadSync.");
  }
  const parseBuffer = parse as (buffer: Buffer) => unknown;
  parseFontBytes = (buffer: Buffer) => parseBuffer(buffer);
  return parseFontBytes;
}

function unwrapModule(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("opentype.js did not load.");
  }
  const record = value as Record<string, unknown>;
  const inner = record.default;
  if (typeof inner === "object" && inner !== null) {
    const innerRecord = inner as Record<string, unknown>;
    if (typeof innerRecord.parse === "function") {
      return innerRecord;
    }
  }
  return record;
}

function isFont(value: unknown): value is FontFace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.unitsPerEm === "number" &&
    record.unitsPerEm > 0 &&
    typeof record.hasChar === "function" &&
    typeof record.charToGlyph === "function" &&
    typeof record.getKerningValue === "function"
  );
}

function requireGlyph(font: FontFace, ch: string): GlyphFace {
  const present: unknown = font.hasChar(ch);
  if (present !== true) {
    throw new Error(emptyGlyph(ch));
  }
  const glyph: unknown = font.charToGlyph(ch);
  if (!isGlyph(glyph)) {
    throw new Error(emptyGlyph(ch));
  }
  return glyph;
}

function isGlyph(value: unknown): value is GlyphFace {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.getPath === "function";
}

function kernUnits(font: FontFace, left: GlyphFace, right: GlyphFace): number {
  const value: unknown = font.getKerningValue(left, right);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyGlyph(ch: string): string {
  return `Glyph path is empty for character ${JSON.stringify(ch)}.`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceBox(svg: string, width: number, height: number): string {
  const w = num(width);
  const h = num(height);
  let next = svg.replace(/viewBox="[^"]*"/, `viewBox="0 0 ${w} ${h}"`);
  next = next.replace(/width="[^"]*"/, `width="${w}"`);
  next = next.replace(/height="[^"]*"/, `height="${h}"`);
  return next;
}

function readBox(svg: string): { x: number; y: number; w: number; h: number } {
  const view = /viewBox\s*=\s*"([^"]+)"/i.exec(svg);
  if (view?.[1] !== undefined) {
    const parts = view[1]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number(part));
    const x = parts[0];
    const y = parts[1];
    const w = parts[2];
    const h = parts[3];
    if (
      x !== undefined &&
      y !== undefined &&
      w !== undefined &&
      h !== undefined &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(w) &&
      Number.isFinite(h) &&
      w > 0 &&
      h > 0
    ) {
      return { x, y, w, h };
    }
  }
  const width = readLength(svg, "width");
  const height = readLength(svg, "height");
  if (width !== null && height !== null && width > 0 && height > 0) {
    return { x: 0, y: 0, w: width, h: height };
  }
  return { x: 0, y: 0, w: 32, h: 32 };
}

function readLength(svg: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i").exec(svg);
  if (match?.[1] === undefined) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function innerSvg(svg: string): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (open === null || open.index === undefined) {
    throw new Error("Logo SVG needs an svg element.");
  }
  const start = open.index + open[0].length;
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (end < start) {
    throw new Error("Logo SVG needs an svg element.");
  }
  return svg.slice(start, end);
}

function fitTransform(sx: number, sy: number, tx: number, ty: number): string {
  if (Math.abs(tx) < 0.0001 && Math.abs(ty) < 0.0001) {
    return `scale(${num(sx)} ${num(sy)})`;
  }
  return `scale(${num(sx)} ${num(sy)}) translate(${num(tx)} ${num(ty)})`;
}

function strokeColors(svg: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\bstroke\s*=\s*"([^"]+)"/gi,
    /\bstroke\s*=\s*'([^']+)'/gi,
    /\bstroke\s*:\s*([^;}"']+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of svg.matchAll(pattern)) {
      const raw = match[1];
      if (raw === undefined) {
        continue;
      }
      const color = raw.trim().toLowerCase().replace(/\s+/g, "");
      if (color.length === 0 || color === "none" || color === "transparent") {
        continue;
      }
      found.add(color);
    }
  }
  return found;
}

function withoutDeclaration(svg: string): string {
  return svg.replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, "");
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function num(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  if (!Number.isFinite(rounded) || Object.is(rounded, -0)) {
    return "0";
  }
  return String(rounded);
}
