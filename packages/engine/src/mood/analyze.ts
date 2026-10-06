import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import type { ThinkRequest } from "../ai/think.ts";
import type { InterviewDepth } from "../config.ts";
import type { Facts } from "../guide/schemas.ts";
import {
  DEEP_WHY_CAP,
  MOOD_IMAGE_BYTE_LIMIT,
  MOOD_IMAGE_CAP,
  MOOD_SCHEMA,
  MOOD_TASK,
  MoodInputError,
  readMoodModel,
  type MoodDirection,
  type MoodPerImage,
  type ParsedMood,
} from "./schemas.ts";

export type { MoodDirection, MoodPerImage } from "./schemas.ts";
export {
  DEEP_WHY_CAP,
  MOOD_DIRECTION_COUNT,
  MOOD_IMAGE_BYTE_LIMIT,
  MOOD_IMAGE_CAP,
  MOOD_SCHEMA,
  MOOD_TASK,
  MoodInputError,
  MoodValidationError,
  classifyType,
  normalizeHex,
} from "./schemas.ts";

/**
 * Images over 10 MB are resampled before think().
 * JPEG metadata is stripped first. A still-large JPEG is decoded and sent as a smaller PNG.
 * The decoder is pdfjs, already used for PDF ingest. No new package.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export class MoodImageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MoodImageError";
  }
}

interface RgbImage {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

interface JpegDecoder {
  width: number;
  height: number;
  parse(data: Uint8Array): void;
  getData(options: { width: number; height: number; forceRGB: boolean }): Uint8Array;
}

interface JpegModule {
  JpegImage: new () => JpegDecoder;
}

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    const mixed = CRC_TABLE[(c ^ byte) & 0xff] ?? 0;
    c = (mixed ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function channelsFor(color: number | undefined): number {
  if (color === 0) return 1;
  if (color === 2) return 3;
  if (color === 4) return 2;
  if (color === 6) return 4;
  return 0;
}

function colorTypeFor(channels: number): number {
  if (channels === 1) return 0;
  if (channels === 3) return 2;
  if (channels === 2) return 4;
  if (channels === 4) return 6;
  throw new MoodImageError("Cannot encode this channel count.");
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDelta = Math.abs(estimate - left);
  const upDelta = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDelta <= upDelta && leftDelta <= diagonal) return left;
  if (upDelta <= diagonal) return up;
  return upLeft;
}

function unfilter(data: Buffer, height: number, stride: number, channels: number): Buffer {
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = data[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const filtered = data[rowStart + x] ?? 0;
      const left = x >= channels ? (out[outStart + x - channels] ?? 0) : 0;
      const up = y > 0 ? (out[prevStart + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (out[prevStart + x - channels] ?? 0) : 0;
      let value = filtered;
      if (filter === 1) value = (filtered + left) & 255;
      else if (filter === 2) value = (filtered + up) & 255;
      else if (filter === 3) value = (filtered + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (filtered + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new MoodImageError("PNG filter is not supported.");
      out[outStart + x] = value;
    }
  }
  return out;
}

function decodePng(bytes: Buffer): RgbImage {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new MoodImageError("PNG signature is missing.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let sawHeader = false;
  const idat: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > bytes.length) {
      throw new MoodImageError("PNG chunk is truncated.");
    }
    const data = bytes.subarray(dataStart, dataEnd);
    const expected = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    const actual = bytes.readUInt32BE(dataEnd);
    if (expected !== actual) throw new MoodImageError(`PNG ${type} checksum failed.`);
    if (type === "IHDR") {
      if (length < 13) throw new MoodImageError("PNG header is short.");
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      if (depth !== 8 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new MoodImageError("PNG bit depth, compression, or interlace is not supported.");
      }
      channels = channelsFor(color);
      if (channels === 0 || width < 1 || height < 1) {
        throw new MoodImageError("PNG color type or size is not supported.");
      }
      sawHeader = true;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset = crcEnd;
  }
  if (!sawHeader || idat.length === 0) throw new MoodImageError("PNG is missing image data.");
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (inflated.length < height * (stride + 1)) {
    throw new MoodImageError("PNG pixel data is short.");
  }
  return {
    width,
    height,
    channels,
    pixels: unfilter(inflated, height, stride, channels),
  };
}

function encodePng(image: RgbImage): Buffer {
  const stride = image.width * image.channels;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    image.pixels.copy(raw, dest + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = colorTypeFor(image.channels);
  const idat = deflateSync(raw);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function resample(image: RgbImage, width: number, height: number): RgbImage {
  const pixels = Buffer.alloc(width * height * image.channels);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const from = (sourceY * image.width + sourceX) * image.channels;
      const to = (y * width + x) * image.channels;
      image.pixels.copy(pixels, to, from, from + image.channels);
    }
  }
  return { width, height, channels: image.channels, pixels };
}

function shrinkUntil(image: RgbImage): Buffer {
  let current = image;
  let encoded = encodePng(current);
  while (encoded.length > MOOD_IMAGE_BYTE_LIMIT && (current.width > 1 || current.height > 1)) {
    const width = Math.max(1, Math.floor(current.width / 2));
    const height = Math.max(1, Math.floor(current.height / 2));
    if (width === current.width && height === current.height) break;
    current = resample(current, width, height);
    encoded = encodePng(current);
  }
  if (encoded.length > MOOD_IMAGE_BYTE_LIMIT) {
    throw new MoodImageError("Image stayed over 10 MB after downscaling.");
  }
  return encoded;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** Drop APP and COM segments before the scan. The picture itself stays. */
function stripJpegMetadata(bytes: Buffer): Buffer {
  if (!isJpeg(bytes)) throw new MoodImageError("JPEG does not start with a start-of-image marker.");
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    while (offset + 1 < bytes.length && bytes[offset + 1] === 0xff) offset += 1;
    const marker = bytes[offset + 1];
    if (marker === undefined) break;
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]));
      break;
    }
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) break;
    const drop = marker === 0xfe || (marker >= 0xe0 && marker <= 0xef);
    if (!drop) parts.push(bytes.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }
  return Buffer.concat(parts);
}

function isJpegModule(value: unknown): value is JpegModule {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "JpegImage") === "function";
}

async function decodeJpeg(bytes: Buffer): Promise<RgbImage> {
  const specifier: string = "pdfjs-dist/image_decoders/pdf.image_decoders.mjs";
  let loaded: unknown;
  try {
    loaded = await import(specifier);
  } catch (cause) {
    throw new MoodImageError("JPEG decoder failed to load.", { cause });
  }
  if (!isJpegModule(loaded)) throw new MoodImageError("JPEG decoder did not export JpegImage.");
  const jpeg = new loaded.JpegImage();
  try {
    jpeg.parse(new Uint8Array(bytes));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "decode failed";
    throw new MoodImageError(`JPEG could not be decoded: ${detail}`);
  }
  if (jpeg.width < 1 || jpeg.height < 1) throw new MoodImageError("JPEG size is empty.");
  let width = jpeg.width;
  let height = jpeg.height;
  const pixelBudget = Math.floor(MOOD_IMAGE_BYTE_LIMIT / 3);
  while (width * height > pixelBudget && (width > 1 || height > 1)) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  let sampled: Uint8Array;
  try {
    sampled = jpeg.getData({ width, height, forceRGB: true });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "decode failed";
    throw new MoodImageError(`JPEG could not be decoded: ${detail}`);
  }
  const pixels = Buffer.from(sampled);
  if (pixels.length < width * height * 3) {
    throw new MoodImageError("JPEG pixel data is short.");
  }
  return {
    width,
    height,
    channels: 3,
    pixels: pixels.subarray(0, width * height * 3),
  };
}

async function writeScratch(scratch: string, name: string, bytes: Buffer): Promise<string> {
  const dest = path.join(scratch, name);
  await writeFile(dest, bytes);
  return dest;
}

/**
 * Return a path whose file is at most 10 MB.
 * A file already under the limit is returned unchanged.
 */
export async function fitMoodImage(file: string, scratch: string, index: number): Promise<string> {
  let size = 0;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new MoodImageError("Mood image was not a file.");
    size = info.size;
  } catch (error) {
    if (error instanceof MoodImageError) throw error;
    throw new MoodImageError("Mood image was not found.");
  }
  if (size <= MOOD_IMAGE_BYTE_LIMIT) return file;

  const bytes = await readFile(file);
  if (isPng(bytes)) {
    const encoded = shrinkUntil(decodePng(bytes));
    return writeScratch(scratch, `fitted-${String(index).padStart(2, "0")}.png`, encoded);
  }
  if (isJpeg(bytes)) {
    const stripped = stripJpegMetadata(bytes);
    if (stripped.length <= MOOD_IMAGE_BYTE_LIMIT && stripped.length > 0) {
      return writeScratch(scratch, `fitted-${String(index).padStart(2, "0")}.jpg`, stripped);
    }
    const encoded = shrinkUntil(await decodeJpeg(stripped.length > 0 ? stripped : bytes));
    return writeScratch(scratch, `fitted-${String(index).padStart(2, "0")}.png`, encoded);
  }
  throw new MoodImageError("Images over 10 MB must be PNG or JPEG so they can be downscaled.");
}

export function moodImageName(file: string, index: number): string {
  return `${String(index + 1).padStart(2, "0")}-${path.basename(file)}`;
}

function whyLines(depth: InterviewDepth, names: readonly string[]): string[] {
  if (depth === "deep") {
    const asked = names.slice(0, DEEP_WHY_CAP);
    return [
      "Depth is deep.",
      `Ask why for at most ${DEEP_WHY_CAP} images.`,
      `Ask why for: ${asked.join(", ")}.`,
      "Leave why unset on every other image.",
    ];
  }
  if (depth === "express") {
    return ["Depth is express.", "Do not include why. Express records none."];
  }
  return [
    "Depth is standard.",
    "Include why only when the picture states a reason. Do not invent one.",
  ];
}

function factsBlock(facts: Facts): string {
  const lines = [
    ...facts.answers.map((answer) => `${answer.id}: ${answer.value}`),
    ...facts.uploads.map((upload) => `upload: ${path.basename(upload)}`),
    ...facts.crawlNotes.map((note) => `crawl: ${note}`),
  ];
  if (facts.industry !== undefined && facts.industry.trim().length > 0) {
    lines.push(`industry: ${facts.industry.trim()}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

/** The think() request for a mood pass. Labels are basenames, never absolute paths. */
export function buildMoodRequest(
  images: readonly string[],
  facts: Facts,
  depth: InterviewDepth,
  labels?: readonly string[],
): ThinkRequest<unknown> {
  const names =
    labels ?? images.map((file, index) => moodImageName(file, index));
  const input = [
    "Read these mood images and font or site screenshots.",
    "Return JSON that matches the schema.",
    "perImage has one object per image, in order.",
    "Each palette entry is a hex color, for example #1a2b3c.",
    "typeClass is a class such as humanist sans, high-contrast serif, grotesk, or slab.",
    "Do not name an exact font. A font name is not a fact.",
    "directions has exactly 3 visual directions.",
    "Each direction palette has exactly 5 hex colors.",
    "The 3 direction palettes must differ.",
    "typeClasses.display and typeClasses.text are classes, not font names.",
    ...whyLines(depth, names),
    "Known facts:",
    factsBlock(facts),
    "Images, in order:",
    names.join("\n"),
  ].join("\n");
  const request: ThinkRequest<unknown> = {
    task: MOOD_TASK,
    schema: MOOD_SCHEMA,
    input,
    maxTurns: 1,
  };
  if (images.length > 0) request.images = [...images];
  return request;
}

function withoutWhy(image: MoodPerImage): MoodPerImage {
  const next: MoodPerImage = {
    file: image.file,
    whatItSays: image.whatItSays,
    palette: image.palette,
    typeClass: image.typeClass,
  };
  if (image.note !== undefined) next.note = image.note;
  return next;
}

function applyWhy(parsed: ParsedMood, depth: InterviewDepth): {
  perImage: unknown[];
  directions: MoodDirection[];
} {
  if (depth === "express") {
    const perImage = parsed.perImage.map((image) => {
      const next = withoutWhy(image);
      next.why = "ASSUMED";
      return next;
    });
    return { perImage, directions: parsed.directions };
  }
  if (depth === "deep") {
    let kept = 0;
    const perImage = parsed.perImage.map((image, index) => {
      const why = image.why;
      const allowed =
        index < DEEP_WHY_CAP && why !== undefined && why.trim().length > 0 && why.trim() !== "ASSUMED";
      if (!allowed) return withoutWhy(image);
      kept += 1;
      if (kept > DEEP_WHY_CAP) return withoutWhy(image);
      const next = withoutWhy(image);
      next.why = why.trim();
      return next;
    });
    return { perImage, directions: parsed.directions };
  }
  const perImage = parsed.perImage.map((image) => {
    const why = image.why;
    if (why === undefined || why.trim().length === 0 || why.trim() === "ASSUMED") {
      return withoutWhy(image);
    }
    const next = withoutWhy(image);
    next.why = why.trim();
    return next;
  });
  return { perImage, directions: parsed.directions };
}

export async function analyzeMood(
  images: string[],
  facts: Facts,
  depth: InterviewDepth,
  deps: { think: typeof import("../ai/think.ts").think },
): Promise<{ perImage: unknown[]; directions: MoodDirection[] }> {
  if (images.length === 0) throw new MoodInputError("No mood images were given.");
  const selected = images.slice(0, MOOD_IMAGE_CAP);
  const labels = selected.map((file, index) => moodImageName(file, index));
  const scratch = await mkdtemp(path.join(os.tmpdir(), "hh-mood-"));
  try {
    const prepared: string[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      if (file === undefined) continue;
      prepared.push(await fitMoodImage(file, scratch, index));
    }
    const request = buildMoodRequest(prepared, facts, depth, labels);
    const result = await deps.think(request);
    return applyWhy(readMoodModel(result.value, labels), depth);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
