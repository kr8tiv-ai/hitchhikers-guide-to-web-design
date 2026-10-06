import { createRequire } from "node:module";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { JsonSchema } from "./ai/schema-validate.ts";
import type { ThinkRequest, ThinkResult } from "./ai/think.ts";
import type { AnswerRecord } from "./required.ts";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * PDF text and image measurements for an imported brand guide.
 * Text comes from pdfjs in-process. Image width and height come from the
 * file header. Nothing here rewrites the file or calls a network API.
 */

const require = createRequire(import.meta.url);

/** 25 MiB. A larger file is refused before it is read. */
export const MAX_INGEST_BYTES = 25 * 1024 * 1024;

/** Extracted PDF text is cut here. The prefix is kept and truncated is set. */
export const TEXT_CAP = 100_000;

const MIN_LONG_SIDE = 512;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

const standardFontDataUrl = pathToFileURL(
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") +
    path.sep,
).href;

const LABELS = [
  { label: "Slogan:", id: "DP-1.3" },
  { label: "Colors:", id: "DP-1.2" },
  { label: "Do not use:", id: "DP-1.9" },
] as const;

/** Brand and voice question ids. Asset inventory stays on the label path. */
export const BRAND_VOICE_IDS = [
  "DP-1.1",
  "DP-1.2",
  "DP-1.3",
  "DP-1.4",
  "DP-1.5",
  "DP-1.6",
  "DP-1.7",
  "DP-1.8",
] as const;

const BRAND_VOICE_SET = new Set<string>(BRAND_VOICE_IDS);

export const BRAND_GUIDE_TASK = "import-brand-guide";

export const HAPPY_CARD = "happy with this?" as const;

export const BRAND_GUIDE_SCHEMA: JsonSchema = {
  type: "object",
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "value"],
        properties: {
          id: { type: "string", enum: [...BRAND_VOICE_IDS] },
          value: { type: "string", maxLength: 4000 },
        },
      },
    },
  },
};

export type IngestErrorCode = "NOT_FOUND" | "TOO_LARGE" | "UNSUPPORTED" | "OUTSIDE_ROOT";

export class IngestError extends Error {
  readonly code: IngestErrorCode;

  constructor(code: IngestErrorCode, message: string) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}

export interface PdfExtract {
  text: string;
  pages: number;
  truncated: boolean;
}

export interface ImageFacts {
  bytes: number;
  width: number;
  height: number;
  warning: string | null;
}

export interface IngestFileStat {
  size: number;
}

export interface IngestOptions {
  root?: string;
  statImpl?: (file: string) => Promise<IngestFileStat>;
}

export interface BrandGuideField {
  id: string;
  value: string;
}

export interface BrandGuideModel {
  fields: BrandGuideField[];
}

export interface ImportedGuideCard {
  answer: AnswerRecord;
  card: typeof HAPPY_CARD;
}

export type BrandGuideAdapter = (
  request: ThinkRequest<BrandGuideModel>,
) => Promise<ThinkResult<BrandGuideModel>>;

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsModule: Promise<PdfjsModule> | undefined;

function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsModule ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsModule;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function staysInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (relative === "") return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function defaultStat(file: string): Promise<IngestFileStat> {
  const info = await stat(file);
  return { size: info.size };
}

async function locate(file: string, root: string | undefined): Promise<string> {
  const absolute = path.resolve(file);
  if (root === undefined) return absolute;
  const rootAbsolute = path.resolve(root);
  if (!staysInside(rootAbsolute, absolute)) {
    throw new IngestError("OUTSIDE_ROOT", "File is outside the allowed root.");
  }
  let realFile: string;
  let realRoot: string;
  try {
    [realFile, realRoot] = await Promise.all([realpath(absolute), realpath(rootAbsolute)]);
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) {
      throw new IngestError("NOT_FOUND", "File was not found.");
    }
    throw error;
  }
  if (!staysInside(realRoot, realFile)) {
    throw new IngestError("OUTSIDE_ROOT", "File is outside the allowed root.");
  }
  return realFile;
}

async function readBounded(file: string, opts?: IngestOptions): Promise<Buffer> {
  const located = await locate(file, opts?.root);
  const statImpl = opts?.statImpl ?? defaultStat;
  let info: IngestFileStat;
  try {
    info = await statImpl(located);
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) {
      throw new IngestError("NOT_FOUND", "File was not found.");
    }
    throw error;
  }
  if (!Number.isSafeInteger(info.size) || info.size < 0) {
    throw new IngestError("UNSUPPORTED", "File size is not a byte count.");
  }
  if (info.size > MAX_INGEST_BYTES) {
    throw new IngestError("TOO_LARGE", "File is over 25 MB.");
  }
  try {
    return await readFile(located);
  } catch (error) {
    if (isErrno(error, "ENOENT") || isErrno(error, "ENOTDIR")) {
      throw new IngestError("NOT_FOUND", "File was not found.");
    }
    throw error;
  }
}

function isTextItem(item: object): item is { str: string; hasEOL: boolean } {
  if (!("str" in item) || !("hasEOL" in item)) return false;
  return typeof item.str === "string" && typeof item.hasEOL === "boolean";
}

async function documentText(doc: PDFDocumentProxy): Promise<string> {
  const pages: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!isTextItem(item)) continue;
      text += item.str;
      if (item.hasEOL) text += "\n";
    }
    pages.push(text);
  }
  return pages.join("\n");
}

function pdfFailure(error: unknown, pdfjs: PdfjsModule): Error {
  if (error instanceof IngestError) return error;
  if (error instanceof pdfjs.InvalidPDFException) {
    return new IngestError("UNSUPPORTED", "PDF could not be read.");
  }
  if (error instanceof Error && error.name === "PasswordException") {
    return new IngestError("UNSUPPORTED", "PDF needs a password.");
  }
  if (error instanceof Error) return error;
  return new IngestError("UNSUPPORTED", "PDF could not be read.");
}

async function closeQuietly(work: Promise<void>): Promise<void> {
  try {
    await work;
  } catch {
    // The bytes are already read. Closing the in-process worker is best-effort.
  }
}

/**
 * Read text from a PDF. When root is set, the file must stay inside it
 * after realpath. Text longer than TEXT_CAP keeps the prefix and sets truncated.
 */
export async function extractPdfText(file: string, opts?: IngestOptions): Promise<PdfExtract> {
  const bytes = await readBounded(file, opts);
  const pdfjs = await loadPdfjs();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    isEvalSupported: false,
    useWasm: false,
    standardFontDataUrl,
  });
  let doc: PDFDocumentProxy | undefined;
  try {
    doc = await task.promise;
    const text = await documentText(doc);
    const truncated = text.length > TEXT_CAP;
    return {
      text: truncated ? text.slice(0, TEXT_CAP) : text,
      pages: doc.numPages,
      truncated,
    };
  } catch (error) {
    throw pdfFailure(error, pdfjs);
  } finally {
    await closeQuietly(doc !== undefined ? doc.destroy() : task.destroy());
  }
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new IngestError("UNSUPPORTED", "Image type is not supported.");
  }
  const length = bytes.readUInt32BE(8);
  const type = bytes.toString("ascii", 12, 16);
  if (type !== "IHDR" || length < 8) {
    throw new IngestError("UNSUPPORTED", "Image type is not supported.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) {
    throw new IngestError("UNSUPPORTED", "Image type is not supported.");
  }
  return { width, height };
}

function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes.readUInt8(0) !== 0xff || bytes.readUInt8(1) !== 0xd8) {
    throw new IngestError("UNSUPPORTED", "Image type is not supported.");
  }
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes.readUInt8(offset) !== 0xff) {
      throw new IngestError("UNSUPPORTED", "Image type is not supported.");
    }
    offset += 1;
    while (offset < bytes.length && bytes.readUInt8(offset) === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes.readUInt8(offset);
    offset += 1;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new IngestError("UNSUPPORTED", "Image type is not supported.");
    }
    if (isSof(marker)) {
      if (segmentLength < 7) {
        throw new IngestError("UNSUPPORTED", "Image type is not supported.");
      }
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width < 1 || height < 1) {
        throw new IngestError("UNSUPPORTED", "Image type is not supported.");
      }
      return { width, height };
    }
    offset += segmentLength;
  }
  throw new IngestError("UNSUPPORTED", "Image type is not supported.");
}

function imageSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return pngSize(bytes);
  if (bytes.length >= 2 && bytes.readUInt8(0) === 0xff && bytes.readUInt8(1) === 0xd8) {
    return jpegSize(bytes);
  }
  throw new IngestError("UNSUPPORTED", "Image type is not supported.");
}

/**
 * Measure a PNG (IHDR) or JPEG (SOF). The file is not rewritten.
 * Longest side under 512 sets a warning. Other types throw UNSUPPORTED.
 */
export async function readImageFacts(file: string, opts?: IngestOptions): Promise<ImageFacts> {
  const bytes = await readBounded(file, opts);
  const size = imageSize(bytes);
  const longest = Math.max(size.width, size.height);
  return {
    bytes: bytes.length,
    width: size.width,
    height: size.height,
    warning: longest < MIN_LONG_SIDE ? `Longest side is ${longest}px, under 512.` : null,
  };
}

/**
 * Patches for explicit labels at the start of a line.
 * Slogan -> DP-1.3, Colors -> DP-1.2, Do not use -> DP-1.9.
 * A missing label is omitted. Nothing is inferred.
 * Records are returned in that label order. The first line for a label wins.
 */
export function suggestAnswerPatches(text: string): AnswerRecord[] {
  const found = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    for (const spec of LABELS) {
      if (found.has(spec.id) || !line.startsWith(spec.label)) continue;
      const value = line.slice(spec.label.length).trim();
      if (value.length === 0) continue;
      found.set(spec.id, value);
    }
  }
  const records: AnswerRecord[] = [];
  for (const spec of LABELS) {
    const value = found.get(spec.id);
    if (value === undefined) continue;
    records.push({ id: spec.id, status: "IMPORTED", value });
  }
  return records;
}

export function brandGuideInput(text: string): string {
  return [
    "Read the brand guide text below.",
    "Return JSON with a fields array.",
    "Each field has an id and a value.",
    "Include a field only when the guide states it in so many words.",
    "Allowed ids:",
    "DP-1.1 logo",
    "DP-1.2 colors",
    "DP-1.3 slogan",
    "DP-1.4 mood",
    "DP-1.5 fonts",
    "DP-1.6 voice, as a person or an animal",
    "DP-1.7 why the brand exists",
    "DP-1.8 kindred brands",
    "Omit an id when the guide does not state it.",
    "Do not infer a slogan from the first sentence.",
    "Do not invent testimonials, prices, or search volumes.",
    "",
    "Guide text:",
    text,
  ].join("\n");
}

/** The structured request importBrandGuide sends. Page images are paths, not PDF bytes. */
export function brandGuideRequest(
  text: string,
  pageImages: readonly string[],
): ThinkRequest<BrandGuideModel> {
  const request: ThinkRequest<BrandGuideModel> = {
    task: BRAND_GUIDE_TASK,
    schema: BRAND_GUIDE_SCHEMA,
    input: brandGuideInput(text),
    maxTurns: 1,
  };
  if (pageImages.length > 0) request.images = [...pageImages];
  return request;
}

function isGuideField(value: unknown): value is BrandGuideField {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || !("value" in value)) return false;
  return typeof value.id === "string" && typeof value.value === "string";
}

function cardsFromModel(model: BrandGuideModel): ImportedGuideCard[] {
  if (!Array.isArray(model.fields)) return [];
  const seen = new Set<string>();
  const cards: ImportedGuideCard[] = [];
  for (const field of model.fields) {
    if (!isGuideField(field)) continue;
    if (!BRAND_VOICE_SET.has(field.id) || seen.has(field.id)) continue;
    const value = field.value.trim();
    if (value.length === 0) continue;
    seen.add(field.id);
    cards.push({
      answer: { id: field.id, status: "IMPORTED", value },
      card: HAPPY_CARD,
    });
  }
  return cards;
}

/**
 * Send extracted guide text and page-image paths through the 011 adapter.
 * Each kept field is IMPORTED and paired with a happy-with-this card.
 * Ids outside the brand and voice list are dropped. The PDF is not sent.
 */
export async function importBrandGuide(
  text: string,
  pageImages: readonly string[],
  adapter: BrandGuideAdapter,
): Promise<ImportedGuideCard[]> {
  const result = await adapter(brandGuideRequest(text, pageImages));
  return cardsFromModel(result.value);
}
