/**
 * Cross-platform rasters for the lockup and the social card.
 *
 * Chromium's screenshot of live Literata text is a different PNG on
 * Windows, Ubuntu, and macOS (CI run 38224093878). Icon tiles of the
 * mark match because they are solid rectangles. These rasters are drawn
 * from the glyph outlines and the wordmark path, then deflated here, so
 * the pixels do not depend on DirectWrite, Core Text, or FreeType.
 * A caller that already has those pixels leaves the file alone, so a
 * second run does not churn bytes when zlib versions differ.
 */

import { createRequire } from "node:module";
import { deflateSync, inflateSync } from "node:zlib";

const require = createRequire(import.meta.url);

const SUB = 8;
const CURVE_SPLITS = 5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface RectPaint {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  color: Rgb;
}

export interface PathPaint {
  kind: "path";
  d: string;
  color: Rgb;
  map: (x: number, y: number) => { x: number; y: number };
}

export interface GlyphPaint {
  kind: "glyphs";
  contours: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>;
  color: Rgb;
}

export type Paint = RectPaint | PathPaint | GlyphPaint;

interface Point {
  x: number;
  y: number;
  on: boolean;
}

interface Component {
  glyphIndex: number;
  dx: number;
  dy: number;
  xx: number;
  xy: number;
  yx: number;
  yy: number;
  round: boolean;
}

interface EmptyGlyph {
  kind: "empty";
}

interface SimpleGlyph {
  kind: "simple";
  contours: Point[][];
}

interface CompositeGlyph {
  kind: "composite";
  components: Component[];
  hasInstructions: boolean;
}

type RawGlyph = EmptyGlyph | SimpleGlyph | CompositeGlyph;

interface OtCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface OtGlyph {
  advanceWidth: number;
  getPath(x: number, y: number, fontSize: number, options: { drawSVG: false; drawLayers: false }): { commands: OtCommand[] };
}

interface OtFont {
  unitsPerEm: number;
  hasChar(ch: string): boolean;
  charToGlyph(ch: string): OtGlyph;
  getKerningValue(left: OtGlyph, right: OtGlyph): number;
}

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
] as const;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

class Cursor {
  i: number;
  buf: Buffer;

  constructor(buf: Buffer, start = 0) {
    this.buf = buf;
    this.i = start;
  }

  private need(n: number): void {
    if (this.i + n > this.buf.length) throw new Error("Truncated font data.");
  }

  u8(): number {
    this.need(1);
    const value = this.buf[this.i] ?? 0;
    this.i += 1;
    return value;
  }

  u16(): number {
    this.need(2);
    const value = this.buf.readUInt16BE(this.i);
    this.i += 2;
    return value;
  }

  i16(): number {
    this.need(2);
    const value = this.buf.readInt16BE(this.i);
    this.i += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.buf.readUInt32BE(this.i);
    this.i += 4;
    return value;
  }

  base128(): number {
    let result = 0;
    for (let i = 0; i < 5; i += 1) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error("WOFF2 base128 has a leading zero.");
      if ((result & 0xfe000000) !== 0) throw new Error("WOFF2 base128 overflow.");
      result = ((result << 7) | (byte & 0x7f)) >>> 0;
      if ((byte & 0x80) === 0) return result;
    }
    throw new Error("WOFF2 base128 is too long.");
  }

  u255(): number {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 254) return this.u8() + 506;
    if (code === 255) return this.u8() + 253;
    return code;
  }

  f2dot14(): number {
    return this.i16() / 16384;
  }

  slice(n: number): Buffer {
    this.need(n);
    const out = this.buf.subarray(this.i, this.i + n);
    this.i += n;
    return out;
  }
}

function tagOf(index: number, cursor: Cursor): string {
  if (index === 0x3f) return cursor.slice(4).toString("ascii");
  const tag = KNOWN_TAGS[index];
  if (tag === undefined) throw new Error(`WOFF2 tag index ${index} is unknown.`);
  return tag;
}

function woff2Tables(font: Buffer): Map<string, Buffer> {
  if (font.toString("ascii", 0, 4) !== "wOF2") throw new Error("Literata is not a WOFF2 font.");
  const numTables = font.readUInt16BE(12);
  const totalCompressed = font.readUInt32BE(20);
  const cursor = new Cursor(font, 48);
  const directory: { tag: string; length: number; origLength: number }[] = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = cursor.u8();
    const tag = tagOf(flags & 0x3f, cursor);
    const origLength = cursor.base128();
    const transformed = tag === "glyf" || tag === "loca" ? flags >> 6 !== 3 : flags >> 6 !== 0;
    const length = transformed ? cursor.base128() : origLength;
    directory.push({ tag, length, origLength });
  }
  const raw = brotli(font.subarray(cursor.i, cursor.i + totalCompressed));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  const glyfMeta = directory.find((entry) => entry.tag === "glyf");
  const locaMeta = directory.find((entry) => entry.tag === "loca");
  if (glyfMeta === undefined || locaMeta === undefined) throw new Error("Literata is missing glyf.");
  for (const entry of directory) {
    if (entry.tag === "loca") continue;
    const bytes = raw.subarray(offset, offset + entry.length);
    offset += entry.length;
    if (entry.tag === "glyf") tables.set("glyf", reconstructGlyf(bytes, locaMeta.origLength));
    else tables.set(entry.tag, Buffer.from(bytes));
  }
  if (offset !== raw.length) throw new Error("WOFF2 table stream length does not match.");
  const glyf = tables.get("glyf");
  if (glyf === undefined || locaByGlyf.get(glyf) === undefined) throw new Error("Literata glyf did not reconstruct.");
  const head = tables.get("head");
  if (head === undefined || head.length < 52) throw new Error("Literata is missing head.");
  const headCopy = Buffer.from(head);
  headCopy.writeUInt16BE(1, 50);
  headCopy.writeUInt32BE(0, 8);
  tables.set("head", headCopy);
  return tables;
}

function brotli(payload: Buffer): Buffer {
  return Buffer.from(brotliDecompress(payload));
}

function brotliDecompress(payload: Buffer): Buffer {
  const { brotliDecompressSync } = require("node:zlib") as typeof import("node:zlib");
  return Buffer.from(brotliDecompressSync(payload));
}

function reconstructGlyf(data: Buffer, locaOrig: number): Buffer {
  const cursor = new Cursor(data);
  const version = cursor.u16();
  if (version !== 0) throw new Error(`WOFF2 glyf transform version ${version} is not supported.`);
  const optionFlags = cursor.u16();
  const numGlyphs = cursor.u16();
  cursor.u16();
  const sizes = {
    nContour: cursor.u32(),
    nPoints: cursor.u32(),
    flags: cursor.u32(),
    glyph: cursor.u32(),
    composite: cursor.u32(),
    bbox: cursor.u32(),
    instruction: cursor.u32(),
  };
  const nContour = new Cursor(cursor.slice(sizes.nContour));
  const nPoints = new Cursor(cursor.slice(sizes.nPoints));
  const flags = new Cursor(cursor.slice(sizes.flags));
  const glyphStream = new Cursor(cursor.slice(sizes.glyph));
  const composite = new Cursor(cursor.slice(sizes.composite));
  const bbox = new Cursor(cursor.slice(sizes.bbox));
  const instructions = new Cursor(cursor.slice(sizes.instruction));
  if ((optionFlags & 1) !== 0) {
    const overlapBytes = (numGlyphs + 7) >> 3;
    cursor.slice(overlapBytes);
  }
  if (cursor.i !== data.length) throw new Error("WOFF2 glyf transform has trailing bytes.");
  if (nContour.buf.length !== numGlyphs * 2) throw new Error("WOFF2 nContour stream length is wrong.");
  const bboxBitmapSize = ((numGlyphs + 31) >> 5) << 2;
  const bboxBits = bbox.slice(bboxBitmapSize);
  const counts: number[] = [];
  for (let id = 0; id < numGlyphs; id += 1) counts.push(nContour.i16());
  const raw: RawGlyph[] = [];
  for (let id = 0; id < numGlyphs; id += 1) {
    const contours = counts[id] ?? 0;
    if (contours === 0) raw.push({ kind: "empty" });
    else if (contours < 0) raw.push(readComposite(composite, glyphStream, instructions));
    else raw.push(readSimple(contours, nPoints, flags, glyphStream, instructions));
    const explicit = (bboxBits[id >> 3] ?? 0) & (0x80 >> (id & 7));
    if (explicit !== 0) bbox.slice(8);
    else if (contours < 0) throw new Error(`Composite glyph ${id} is missing a bounding box.`);
  }
  if (nPoints.i !== nPoints.buf.length || flags.i !== flags.buf.length || glyphStream.i !== glyphStream.buf.length) {
    throw new Error("WOFF2 glyph streams were not fully consumed.");
  }
  if (composite.i !== composite.buf.length || instructions.i !== instructions.buf.length) {
    throw new Error("WOFF2 composite or instruction stream was not fully consumed.");
  }
  const flat = raw.map((_, id) => flattenGlyph(raw, id, new Set<number>()));
  const encoded = flat.map(encodeSimple);
  const glyfParts: Buffer[] = [];
  const offsets: number[] = [0];
  let at = 0;
  for (const record of encoded) {
    glyfParts.push(record);
    at += record.length;
    offsets.push(at);
  }
  if (offsets.length !== numGlyphs + 1) throw new Error("loca count does not match glyf.");
  if ((numGlyphs + 1) * 2 !== locaOrig && (numGlyphs + 1) * 4 !== locaOrig) {
    throw new Error(`loca size ${locaOrig} does not match ${numGlyphs} glyphs.`);
  }
  const loca = Buffer.alloc((numGlyphs + 1) * 4);
  offsets.forEach((offset, index) => loca.writeUInt32BE(offset, index * 4));
  const built = Buffer.concat(glyfParts);
  stashLoca(built, loca);
  return built;
}

const locaByGlyf = new WeakMap<Buffer, Buffer>();

function stashLoca(glyf: Buffer, loca: Buffer): void {
  locaByGlyf.set(glyf, loca);
}

function readSimple(
  contourCount: number,
  nPoints: Cursor,
  flags: Cursor,
  glyphStream: Cursor,
  instructions: Cursor,
): SimpleGlyph {
  const ends: number[] = [];
  let end = -1;
  for (let index = 0; index < contourCount; index += 1) {
    end += nPoints.u255();
    ends.push(end);
  }
  const count = end + 1;
  const flagBytes: number[] = [];
  for (let index = 0; index < count; index += 1) flagBytes.push(flags.u8());
  let x = 0;
  let y = 0;
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const flag = flagBytes[index] ?? 0;
    const on = (flag & 0x80) === 0;
    const code = flag & 0x7f;
    const delta = triplet(code, glyphStream);
    x += delta.dx;
    y += delta.dy;
    points.push({ x, y, on });
  }
  const instructionLength = glyphStream.u255();
  if (instructionLength > 0) instructions.slice(instructionLength);
  const contours: Point[][] = [];
  let start = 0;
  for (const last of ends) {
    contours.push(points.slice(start, last + 1));
    start = last + 1;
  }
  return { kind: "simple", contours };
}

function triplet(flag: number, stream: Cursor): { dx: number; dy: number } {
  const sign = (bit: number, magnitude: number): number => ((bit & 1) !== 0 ? magnitude : -magnitude);
  if (flag < 10) return { dx: 0, dy: sign(flag, ((flag & 14) << 7) + stream.u8()) };
  if (flag < 20) return { dx: sign(flag, (((flag - 10) & 14) << 7) + stream.u8()), dy: 0 };
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = stream.u8();
    return {
      dx: sign(flag, 1 + (b0 & 0x30) + (b1 >> 4)),
      dy: sign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)),
    };
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const dx = sign(flag, 1 + (Math.floor(b0 / 12) << 8) + stream.u8());
    const dy = sign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + stream.u8());
    return { dx, dy };
  }
  if (flag < 124) {
    const b0 = stream.u8();
    const b1 = stream.u8();
    const b2 = stream.u8();
    return {
      dx: sign(flag, (b0 << 4) + (b1 >> 4)),
      dy: sign(flag >> 1, ((b1 & 0x0f) << 8) + b2),
    };
  }
  const x0 = stream.u8();
  const x1 = stream.u8();
  const y0 = stream.u8();
  const y1 = stream.u8();
  return { dx: sign(flag, (x0 << 8) + x1), dy: sign(flag >> 1, (y0 << 8) + y1) };
}

function readComposite(composite: Cursor, glyphStream: Cursor, instructions: Cursor): CompositeGlyph {
  const components: Component[] = [];
  let more = true;
  let hasInstructions = false;
  while (more) {
    const flags = composite.u16();
    const glyphIndex = composite.u16();
    if ((flags & 0x0002) === 0) throw new Error(`Glyph component ${glyphIndex} uses point matching.`);
    let dx: number;
    let dy: number;
    if ((flags & 0x0001) !== 0) {
      dx = composite.i16();
      dy = composite.i16();
    } else {
      dx = composite.buf.readInt8(composite.i);
      composite.i += 1;
      dy = composite.buf.readInt8(composite.i);
      composite.i += 1;
    }
    let xx = 1;
    let xy = 0;
    let yx = 0;
    let yy = 1;
    if ((flags & 0x0008) !== 0) {
      xx = composite.f2dot14();
      yy = xx;
    } else if ((flags & 0x0040) !== 0) {
      xx = composite.f2dot14();
      yy = composite.f2dot14();
    } else if ((flags & 0x0080) !== 0) {
      xx = composite.f2dot14();
      xy = composite.f2dot14();
      yx = composite.f2dot14();
      yy = composite.f2dot14();
    }
    if ((flags & 0x0004) !== 0) {
      dx = Math.round(dx);
      dy = Math.round(dy);
    }
    if ((flags & 0x0100) !== 0) hasInstructions = true;
    more = (flags & 0x0020) !== 0;
    components.push({ glyphIndex, dx, dy, xx, xy, yx, yy, round: (flags & 0x0004) !== 0 });
  }
  if (hasInstructions) {
    const length = glyphStream.u255();
    if (length > 0) instructions.slice(length);
  }
  return { kind: "composite", components, hasInstructions };
}

function flattenGlyph(raw: RawGlyph[], id: number, stack: Set<number>): Point[][] {
  if (stack.has(id)) throw new Error(`Composite glyph cycle at ${id}.`);
  const glyph = raw[id];
  if (glyph === undefined) throw new Error(`Missing glyph ${id}.`);
  if (glyph.kind === "empty") return [];
  if (glyph.kind === "simple") return glyph.contours;
  stack.add(id);
  const contours: Point[][] = [];
  for (const component of glyph.components) {
    const base = flattenGlyph(raw, component.glyphIndex, stack);
    for (const contour of base) {
      contours.push(contour.map((point) => ({
        x: Math.round(component.xx * point.x + component.xy * point.y + component.dx),
        y: Math.round(component.yx * point.x + component.yy * point.y + component.dy),
        on: point.on,
      })));
    }
  }
  stack.delete(id);
  return contours;
}

function encodeSimple(contours: Point[][]): Buffer {
  const used = contours.filter((contour) => contour.length > 0);
  if (used.length === 0) return Buffer.alloc(0);
  let xMin = 32767;
  let yMin = 32767;
  let xMax = -32768;
  let yMax = -32768;
  for (const contour of used) {
    for (const point of contour) {
      xMin = Math.min(xMin, point.x);
      yMin = Math.min(yMin, point.y);
      xMax = Math.max(xMax, point.x);
      yMax = Math.max(yMax, point.y);
    }
  }
  const flags: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const ends: number[] = [];
  let prevX = 0;
  let prevY = 0;
  let count = 0;
  for (const contour of used) {
    for (const point of contour) {
      const dx = point.x - prevX;
      const dy = point.y - prevY;
      let flag = point.on ? 0x01 : 0;
      if (dx === 0) flag |= 0x10;
      else xs.push(dx);
      if (dy === 0) flag |= 0x20;
      else ys.push(dy);
      flags.push(flag);
      prevX = point.x;
      prevY = point.y;
      count += 1;
    }
    ends.push(count - 1);
  }
  const record = Buffer.alloc(10 + ends.length * 2 + 2 + flags.length + xs.length * 2 + ys.length * 2);
  let offset = 0;
  record.writeInt16BE(used.length, offset);
  offset += 2;
  record.writeInt16BE(xMin, offset);
  record.writeInt16BE(yMin, offset + 2);
  record.writeInt16BE(xMax, offset + 4);
  record.writeInt16BE(yMax, offset + 6);
  offset += 8;
  for (const end of ends) {
    record.writeUInt16BE(end, offset);
    offset += 2;
  }
  record.writeUInt16BE(0, offset);
  offset += 2;
  for (const flag of flags) {
    record[offset] = flag;
    offset += 1;
  }
  for (const dx of xs) {
    record.writeInt16BE(dx, offset);
    offset += 2;
  }
  for (const dy of ys) {
    record.writeInt16BE(dy, offset);
    offset += 2;
  }
  return record.subarray(0, offset);
}

function sfntFromWoff2(font: Buffer): Buffer {
  const tables = woff2Tables(font);
  const glyf = tables.get("glyf");
  const loca = glyf === undefined ? undefined : locaByGlyf.get(glyf);
  if (glyf === undefined || loca === undefined) throw new Error("Literata loca was not rebuilt.");
  tables.set("loca", loca);
  const tags = [...tables.keys()].sort();
  const records = tags.map((tag) => {
    const data = tables.get(tag);
    if (data === undefined) throw new Error(`Missing table ${tag}.`);
    return { tag, data };
  });
  const numTables = records.length;
  let search = 1;
  let selector = 0;
  while (search * 2 <= numTables) {
    search *= 2;
    selector += 1;
  }
  const searchRange = search * 16;
  const rangeShift = numTables * 16 - searchRange;
  const directory = Buffer.alloc(12 + numTables * 16);
  directory.writeUInt32BE(0x00010000, 0);
  directory.writeUInt16BE(numTables, 4);
  directory.writeUInt16BE(searchRange, 6);
  directory.writeUInt16BE(selector, 8);
  directory.writeUInt16BE(rangeShift, 10);
  let offset = directory.length;
  const chunks: Buffer[] = [directory];
  records.forEach((record, index) => {
    const at = 12 + index * 16;
    directory.write(record.tag, at, 4, "ascii");
    directory.writeUInt32BE(checksum(record.data), at + 4);
    directory.writeUInt32BE(offset, at + 8);
    directory.writeUInt32BE(record.data.length, at + 12);
    const pad = (4 - (record.data.length & 3)) & 3;
    chunks.push(record.data, Buffer.alloc(pad));
    offset += record.data.length + pad;
  });
  return Buffer.concat(chunks);
}

function checksum(data: Buffer): number {
  let sum = 0;
  const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + padded.readUInt32BE(offset)) >>> 0;
  return sum;
}

function loadFont(woff2: Buffer): OtFont {
  const loaded: unknown = require("opentype.js");
  const record = unwrap(loaded);
  const parse = record.parse;
  if (typeof parse !== "function") throw new Error("opentype.js parse is missing.");
  const parsed: unknown = (parse as (buffer: Buffer) => unknown)(sfntFromWoff2(woff2));
  if (!isFont(parsed)) throw new Error("opentype.js did not return Literata.");
  return parsed;
}

function unwrap(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("opentype.js did not load.");
  const record = value as Record<string, unknown>;
  const inner = record.default;
  if (typeof inner === "object" && inner !== null && typeof (inner as Record<string, unknown>).parse === "function") {
    return inner as Record<string, unknown>;
  }
  return record;
}

function isFont(value: unknown): value is OtFont {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.unitsPerEm === "number"
    && typeof record.hasChar === "function"
    && typeof record.charToGlyph === "function"
    && typeof record.getKerningValue === "function";
}

function isGlyph(value: unknown): value is OtGlyph {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.getPath === "function" && typeof record.advanceWidth === "number";
}

export function literataContours(woff2: Buffer, text: string, x: number, baseline: number, fontSize: number): { x: number; y: number }[][] {
  const font = loadFont(woff2);
  const chars = Array.from(text);
  const glyphs = chars.map((ch) => {
    if (font.hasChar(ch) !== true) throw new Error(`Literata has no glyph for ${JSON.stringify(ch)}.`);
    const glyph: unknown = font.charToGlyph(ch);
    if (!isGlyph(glyph)) throw new Error(`Literata glyph for ${JSON.stringify(ch)} has no path.`);
    return glyph;
  });
  const contours: { x: number; y: number }[][] = [];
  let cursor = x;
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    const ch = chars[index];
    if (glyph === undefined || ch === undefined) throw new Error("Literata layout dropped a character.");
    const path = glyph.getPath(cursor, baseline, fontSize, { drawSVG: false, drawLayers: false });
    const drawn = contoursFromCommands(path.commands);
    if (ch !== " " && drawn.length === 0) throw new Error(`Literata outline for ${JSON.stringify(ch)} is empty.`);
    contours.push(...drawn);
    const next = glyphs[index + 1];
    const kern = next === undefined ? 0 : font.getKerningValue(glyph, next);
    cursor += (glyph.advanceWidth + (Number.isFinite(kern) ? kern : 0)) * (fontSize / font.unitsPerEm);
  }
  const width = cursor - x;
  if (width < 300 || width > 900) throw new Error(`Literata line is ${width.toFixed(1)} px, expected the social-card line.`);
  return contours;
}

function contoursFromCommands(commands: readonly OtCommand[]): { x: number; y: number }[][] {
  const contours: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const flush = (): void => {
    if (current.length > 1) contours.push(current);
    current = [];
  };
  for (const command of commands) {
    if (command.type === "M") {
      flush();
      current.push(point(command.x, command.y));
    } else if (command.type === "L") {
      current.push(point(command.x, command.y));
    } else if (command.type === "Q") {
      const last = current[current.length - 1];
      if (last === undefined) throw new Error("Quadratic without a start.");
      quad(last, point(command.x1, command.y1), point(command.x, command.y), CURVE_SPLITS, current);
    } else if (command.type === "C") {
      const last = current[current.length - 1];
      if (last === undefined) throw new Error("Cubic without a start.");
      cubic(last, point(command.x1, command.y1), point(command.x2, command.y2), point(command.x, command.y), CURVE_SPLITS, current);
    } else if (command.type === "Z") {
      flush();
    } else {
      throw new Error(`Outline command ${command.type} is not supported.`);
    }
  }
  flush();
  return contours;
}

function point(x: number | undefined, y: number | undefined): { x: number; y: number } {
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Outline command is missing a coordinate.");
  }
  return { x, y };
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function quad(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  depth: number,
  out: { x: number; y: number }[],
): void {
  if (depth === 0) {
    out.push(p2);
    return;
  }
  const a = mid(p0, p1);
  const b = mid(p1, p2);
  const c = mid(a, b);
  quad(p0, a, c, depth - 1, out);
  quad(c, b, p2, depth - 1, out);
}

function cubic(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  depth: number,
  out: { x: number; y: number }[],
): void {
  if (depth === 0) {
    out.push(p3);
    return;
  }
  const a = mid(p0, p1);
  const b = mid(p1, p2);
  const c = mid(p2, p3);
  const d = mid(a, b);
  const e = mid(b, c);
  const f = mid(d, e);
  cubic(p0, a, d, f, depth - 1, out);
  cubic(f, e, c, p3, depth - 1, out);
}

interface PathCommand {
  t: "M" | "L" | "Q" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
}

function parsePath(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  let index = 0;
  let command = "";
  const skip = (): void => {
    while (index < d.length) {
      const ch = d[index] ?? "";
      if (ch !== " " && ch !== "," && ch !== "\n" && ch !== "\t" && ch !== "\r") break;
      index += 1;
    }
  };
  const readNumber = (): number => {
    skip();
    const start = index;
    const sign = d[index];
    if (sign === "-" || sign === "+") index += 1;
    let saw = false;
    while (index < d.length && (d[index] ?? "") >= "0" && (d[index] ?? "") <= "9") {
      index += 1;
      saw = true;
    }
    if (d[index] === ".") {
      index += 1;
      while (index < d.length && (d[index] ?? "") >= "0" && (d[index] ?? "") <= "9") {
        index += 1;
        saw = true;
      }
    }
    if (!saw) throw new Error("Wordmark path is missing a number.");
    const value = Number(d.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("Wordmark path number is not finite.");
    return value;
  };
  while (index < d.length) {
    skip();
    if (index >= d.length) break;
    const ch = d[index] ?? "";
    if (ch === "M" || ch === "L" || ch === "Q" || ch === "Z") {
      command = ch;
      index += 1;
    } else if (command === "") {
      throw new Error(`Wordmark path command ${ch} is not supported.`);
    }
    if (command === "Z") {
      commands.push({ t: "Z" });
      command = "";
      continue;
    }
    if (command === "M" || command === "L") {
      const x = readNumber();
      const y = readNumber();
      commands.push({ t: command, x, y });
      if (command === "M") command = "L";
    } else if (command === "Q") {
      commands.push({ t: "Q", x1: readNumber(), y1: readNumber(), x: readNumber(), y: readNumber() });
    } else {
      throw new Error(`Wordmark path command ${command} is not supported.`);
    }
  }
  return commands;
}

function pathContours(d: string, map: (x: number, y: number) => { x: number; y: number }): { x: number; y: number }[][] {
  const contours: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  const flush = (): void => {
    if (current.length > 1) contours.push(current);
    current = [];
  };
  for (const command of parsePath(d)) {
    if (command.t === "M" || command.t === "L") {
      if (command.t === "M") flush();
      const mapped = map(command.x ?? 0, command.y ?? 0);
      current.push(mapped);
    } else if (command.t === "Q") {
      const last = current[current.length - 1];
      if (last === undefined) throw new Error("Wordmark quadratic has no start.");
      quad(last, map(command.x1 ?? 0, command.y1 ?? 0), map(command.x ?? 0, command.y ?? 0), CURVE_SPLITS, current);
    } else {
      flush();
    }
  }
  flush();
  return contours;
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: number;
}

function contoursToEdges(contours: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>): Edge[] {
  const edges: Edge[] = [];
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const a = contour[index];
      const b = contour[(index + 1) % contour.length];
      if (a === undefined || b === undefined) continue;
      const x0 = Math.round(a.x * SUB);
      const y0 = Math.round(a.y * SUB);
      const x1 = Math.round(b.x * SUB);
      const y1 = Math.round(b.y * SUB);
      if (y0 === y1) continue;
      edges.push({ x0, y0, x1, y1, dir: y1 > y0 ? 1 : -1 });
    }
  }
  return edges;
}

function paintContours(
  pixels: Uint8Array,
  width: number,
  height: number,
  contours: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  color: Rgb,
): void {
  const edges = contoursToEdges(contours);
  if (edges.length === 0) return;
  const buckets: Edge[][] = Array.from({ length: height }, () => []);
  for (const edge of edges) {
    const yMin = edge.y0 < edge.y1 ? edge.y0 : edge.y1;
    const yMax = edge.y0 > edge.y1 ? edge.y0 : edge.y1;
    let y0 = Math.floor(yMin / SUB);
    let y1 = Math.floor((yMax - 1) / SUB);
    if (y0 < 0) y0 = 0;
    if (y1 >= height) y1 = height - 1;
    for (let y = y0; y <= y1; y += 1) buckets[y]?.push(edge);
  }
  const denom = SUB * SUB;
  const row = new Uint16Array(width);
  for (let y = 0; y < height; y += 1) {
    const bucket = buckets[y];
    if (bucket === undefined || bucket.length === 0) continue;
    row.fill(0);
    for (let sub = 0; sub < SUB; sub += 1) {
      const sy = y * SUB + sub;
      const hits: { x: number; dir: number }[] = [];
      for (const edge of bucket) {
        const yMin = edge.y0 < edge.y1 ? edge.y0 : edge.y1;
        const yMax = edge.y0 > edge.y1 ? edge.y0 : edge.y1;
        if (sy < yMin || sy >= yMax) continue;
        const den = edge.y1 - edge.y0;
        const num = (sy - edge.y0) * (edge.x1 - edge.x0);
        hits.push({ x: edge.x0 + Math.round(num / den), dir: edge.dir });
      }
      hits.sort((a, b) => a.x - b.x || a.dir - b.dir);
      let winding = 0;
      let span: number | null = null;
      for (const hit of hits) {
        const before = winding;
        winding += hit.dir;
        if (before === 0 && winding !== 0) span = hit.x;
        else if (before !== 0 && winding === 0 && span !== null) {
          const from = span < 0 ? 0 : span;
          const to = hit.x > width * SUB ? width * SUB : hit.x;
          for (let sx = from; sx < to; sx += 1) {
            const px = Math.floor(sx / SUB);
            const count = row[px];
            if (count !== undefined) row[px] = count + 1;
          }
          span = null;
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      const cover = row[x] ?? 0;
      if (cover === 0) continue;
      const offset = (y * width + x) * 3;
      const keep = denom - cover;
      pixels[offset] = Math.round(((pixels[offset] ?? 0) * keep + color.r * cover) / denom);
      pixels[offset + 1] = Math.round(((pixels[offset + 1] ?? 0) * keep + color.g * cover) / denom);
      pixels[offset + 2] = Math.round(((pixels[offset + 2] ?? 0) * keep + color.b * cover) / denom);
    }
  }
}

export function rasterRgb(width: number, height: number, background: Rgb, paints: readonly Paint[]): Buffer {
  if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error(`Raster ${width}x${height} is out of range.`);
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = background.r;
    pixels[index + 1] = background.g;
    pixels[index + 2] = background.b;
  }
  for (const paint of paints) {
    if (paint.kind === "rect") {
      paintContours(pixels, width, height, [[
        { x: paint.x, y: paint.y },
        { x: paint.x + paint.w, y: paint.y },
        { x: paint.x + paint.w, y: paint.y + paint.h },
        { x: paint.x, y: paint.y + paint.h },
      ]], paint.color);
    } else if (paint.kind === "path") {
      paintContours(pixels, width, height, pathContours(paint.d, paint.map), paint.color);
    } else {
      paintContours(pixels, width, height, paint.contours, paint.color);
    }
  }
  return encodeRgb(width, height, pixels);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let index = 0; index < buf.length; index += 1) {
    c = (CRC_TABLE[(c ^ (buf[index] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crc = Buffer.concat([out.subarray(4, 8), data]);
  out.writeUInt32BE(crc32(crc), 8 + data.length);
  return out;
}

function encodeRgb(width: number, height: number, pixels: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, row + 1);
  }
  const idat = deflateSync(raw, { level: 9, windowBits: 15, memLevel: 8, strategy: 0 });
  return Buffer.concat([PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

export interface Rgba {
  width: number;
  height: number;
  pixels: Uint8Array;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dlu = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dlu) return left;
  if (du <= dlu) return up;
  return upLeft;
}

export function decodeRgba(buf: Buffer): Rgba {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("Raster is not a PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error("PNG is not an 8-bit non-interlaced image.");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`PNG color type ${colorType} is not RGB.`);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const prior = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src] ?? 0;
    src += 1;
    for (let index = 0; index < stride; index += 1) {
      const raw = inflated[src + index] ?? 0;
      const left = index >= channels ? (row[index - channels] ?? 0) : 0;
      const up = prior[index] ?? 0;
      const upLeft = index >= channels ? (prior[index - channels] ?? 0) : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
      row[index] = value;
    }
    src += stride;
    prior.set(row);
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const out = (y * width + x) * 4;
      pixels[out] = row[index] ?? 0;
      pixels[out + 1] = row[index + 1] ?? 0;
      pixels[out + 2] = row[index + 2] ?? 0;
      pixels[out + 3] = channels === 4 ? (row[index + 3] ?? 0) : 255;
    }
  }
  return { width, height, pixels };
}

export function samePicture(left: Buffer, right: Buffer): boolean {
  const a = decodeRgba(left);
  const b = decodeRgba(right);
  if (a.width !== b.width || a.height !== b.height || a.pixels.length !== b.pixels.length) return false;
  for (let index = 0; index < a.pixels.length; index += 1) {
    if (a.pixels[index] !== b.pixels[index]) return false;
  }
  return true;
}
