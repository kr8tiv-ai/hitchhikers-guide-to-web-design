/**
 * Caps image variants before they fill the disk.
 * Widths stop at 1920. A run stops when free space or the byte budget runs out.
 * Each variant is written to a `.partial` file and renamed after it lands.
 * A second run with the same source hash skips the encode.
 */

import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, statfs as statfsNative, writeFile } from "node:fs/promises";
import path from "node:path";

/** Longest variant edge. 2560 is not written. */
export const MAX_VARIANT_WIDTH = 1920;
export const MAX_WIDTHS_PER_IMAGE = 3;
export const DEFAULT_VARIANT_WIDTHS = [640, 1280, 1920] as const;
export const VARIANT_FORMATS = ["avif", "webp"] as const;
export const AVIF_QUALITY = 50;
export const WEBP_QUALITY = 72;
export const H264_QUALITY = 23;
export const WEBM_QUALITY = 32;
/** Keep in step with GuideConfig media defaults in the engine. */
export const MAX_VARIANTS_PER_IMAGE = 8;
export const MAX_RUN_BYTES = 400 * 1024 * 1024;
export const MAX_VARIANT_BYTES = 1_572_864;
export const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const FREE_SPACE_FACTOR = 3;
export const MANIFEST_NAME = ".variants.json";

export const MEDIA_DISK_SPACE_FALLBACK = formatMediaDiskSpaceReason("unknown", "the output volume", "2 GB");

const WIDTH_CLOSENESS = 0.1;
const MAX_VARIANTS_CAP = 64;
const MAX_RUN_CAP = 50 * 1024 * 1024 * 1024;
const UNSUPPORTED_STATFS = "Free-space check skipped: statfs is not supported on this platform.";

export interface MediaBudget {
  maxVariantsPerImage: number;
  maxRunBytes: number;
  maxWidth: number;
}

export interface VariantEntry {
  file: string;
  bytes: number;
  sourceHash: string;
  width: number;
  format: string;
  quality: number;
}

export interface VariantManifest {
  version: 1;
  entries: Record<string, VariantEntry>;
}

export interface DiskStat {
  bsize: number;
  bavail: number;
}

export type StatFsFn = (dir: string) => Promise<DiskStat>;

export interface ImageVariantJob {
  input: string;
  width: number;
  format: "avif" | "webp";
  quality: number;
  destination: string;
}

export interface VideoVariantJob {
  input: string;
  codec: "h264" | "webm";
  quality: number;
  destination: string;
  ffmpeg: string;
}

export interface MediaEncodeDeps {
  sourceWidth?: (input: string) => Promise<number>;
  encodeImageVariant?: (job: ImageVariantJob) => Promise<void>;
  encodeVideoVariant?: (job: VideoVariantJob) => Promise<void>;
  /** Null skips the guard and warns. Omit to call fs.statfs. */
  statfs?: StatFsFn | null;
  warn?: (message: string) => void;
}

export interface PlannedOutput {
  format: "avif" | "webp";
  width: number;
  file: string;
}

export interface PlannedImage {
  input: string;
  outputs: PlannedOutput[];
}

export interface PlannedVideo {
  input: string;
  h264: string;
  webm: string;
  keyframeInterval: number;
  skipped?: string;
}

export interface MediaEncodeReport {
  images: PlannedImage[];
  videos: PlannedVideo[];
  encoded: number;
  skipped: number;
  copied: number;
}

export class MediaDiskSpaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaDiskSpaceError";
  }
}

export class MediaBudgetExceededError extends Error {
  readonly writtenBytes: number;
  readonly limitBytes: number;

  constructor(writtenBytes: number, limitBytes: number) {
    super(
      `Media variant budget reached: ${writtenBytes} bytes written, limit ${limitBytes}. No further variants were written.`,
    );
    this.name = "MediaBudgetExceededError";
    this.writtenBytes = writtenBytes;
    this.limitBytes = limitBytes;
  }
}

interface RunCounts {
  encoded: number;
  skipped: number;
  copied: number;
  bytes: number;
}

interface WrittenVariant {
  file: string;
  bytes: number;
  width: number;
  format: "avif" | "webp";
  quality: number;
  key: string;
  how: "encoded" | "copied";
}

export function defaultMediaBudget(): MediaBudget {
  return {
    maxVariantsPerImage: MAX_VARIANTS_PER_IMAGE,
    maxRunBytes: MAX_RUN_BYTES,
    maxWidth: MAX_VARIANT_WIDTH,
  };
}

export function formatMediaDiskSpaceReason(free: string, volume: string, required: string): string {
  return `Not enough free disk space to write media variants: ${free} free on ${volume}, need ${required}. Free space and retry.`;
}

export function formatByteCount(bytes: number): string {
  const n = Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0;
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (n >= gb && n % gb === 0) return `${n / gb} GB`;
  if (n >= mb && n % mb === 0) return `${n / mb} MB`;
  return `${n} B`;
}

export function requiredFreeBytes(estimatedBatchBytes: number): number {
  const estimate = Number.isFinite(estimatedBatchBytes) ? Math.max(0, estimatedBatchBytes) : 0;
  return Math.max(MIN_FREE_BYTES, FREE_SPACE_FACTOR * estimate);
}

export function volumeLabel(dir: string): string {
  const root = path.parse(path.resolve(dir)).root;
  if (root === "/") return "/";
  const trimmed = root.replace(/[\\/]+$/, "");
  return trimmed === "" ? "the output volume" : trimmed;
}

export function variantKey(sourceHash: string, width: number, format: string, quality: number): string {
  return `${sourceHash}:${width}:${format}:${quality}`;
}

export function selectVariantWidths(options: {
  candidates?: readonly number[];
  sourceWidth: number;
  maxWidth?: number;
  maxCount?: number;
}): number[] {
  const maxCount = clampCount(options.maxCount, MAX_WIDTHS_PER_IMAGE);
  const cap = Math.min(
    MAX_VARIANT_WIDTH,
    positive(options.maxWidth, MAX_VARIANT_WIDTH),
    positive(options.sourceWidth, MAX_VARIANT_WIDTH),
  );
  const unique = new Set<number>();
  for (const value of options.candidates ?? DEFAULT_VARIANT_WIDTHS) {
    if (!Number.isFinite(value)) continue;
    const width = Math.round(value);
    if (width <= 0 || width > cap) continue;
    unique.add(width);
  }
  const sorted = [...unique].sort((left, right) => left - right);
  const kept: number[] = [];
  for (const width of sorted) {
    if (kept.length >= maxCount) break;
    if (kept.some((previous) => withinTenPercent(previous, width))) continue;
    kept.push(width);
  }
  return kept;
}

/** Widths recorded on a picture. The encode step still refuses to upscale the file. */
export function variantWidthsForProject(projectDir: string): number[] {
  const budget = readMediaBudget(projectDir);
  return selectVariantWidths({ sourceWidth: budget.maxWidth, maxWidth: budget.maxWidth });
}

export function readMediaBudget(projectDir: string): MediaBudget {
  const defaults = defaultMediaBudget();
  let raw: unknown;
  try {
    const text = readFileSync(path.join(projectDir, ".hitchhiker", "config.json"), "utf8").replace(/^\uFEFF/, "");
    raw = JSON.parse(text);
  } catch {
    return defaults;
  }
  if (!isRecord(raw)) return defaults;
  const media = raw.media;
  if (media === undefined) return defaults;
  if (!isRecord(media)) return defaults;
  return {
    maxVariantsPerImage: positiveInt(media.maxVariantsPerImage, defaults.maxVariantsPerImage, 1, MAX_VARIANTS_CAP),
    maxRunBytes: positiveInt(media.maxRunBytes, defaults.maxRunBytes, 1, MAX_RUN_CAP),
    maxWidth: Math.min(MAX_VARIANT_WIDTH, positiveInt(media.maxWidth, defaults.maxWidth, 1, 8192)),
  };
}

export async function assertFreeForMedia(
  dir: string,
  estimatedBytes: number,
  deps: { statfs?: StatFsFn | null; warn?: (message: string) => void; warned?: { current: boolean } } = {},
): Promise<void> {
  const warned = deps.warned ?? { current: false };
  const statfsFn = deps.statfs === undefined ? defaultStatfs : deps.statfs;
  if (statfsFn === null) {
    warnOnce(warned, deps.warn);
    return;
  }
  let stats: DiskStat;
  try {
    stats = await statfsFn(dir);
  } catch (error) {
    if (!isUnsupportedStatfs(error)) throw error;
    warnOnce(warned, deps.warn);
    return;
  }
  const free = stats.bavail * stats.bsize;
  const required = requiredFreeBytes(estimatedBytes);
  if (free < required) {
    throw new MediaDiskSpaceError(
      formatMediaDiskSpaceReason(formatByteCount(free), volumeLabel(dir), formatByteCount(required)),
    );
  }
}

export async function runMediaEncode(options: {
  images?: readonly string[];
  videos?: readonly string[];
  outDir: string;
  projectDir?: string;
  budget?: Partial<MediaBudget>;
  ffmpeg?: string | null;
  keyframeInterval?: number;
  ffmpegMissing?: string;
  videoQuality?: { h264: number; webm: number };
  deps?: MediaEncodeDeps;
}): Promise<MediaEncodeReport> {
  const outDir = options.outDir;
  const budget = mergeBudget(options.projectDir === undefined ? defaultMediaBudget() : readMediaBudget(options.projectDir), options.budget);
  const deps = options.deps ?? {};
  const images = options.images ?? [];
  const videos = options.videos ?? [];
  const ffmpeg = options.ffmpeg === undefined ? null : options.ffmpeg;
  const keyframeInterval = options.keyframeInterval ?? 2;
  const videoQuality = options.videoQuality ?? { h264: H264_QUALITY, webm: WEBM_QUALITY };
  const warned = { current: false };
  const guard: {
    statfs?: StatFsFn | null;
    warn?: (message: string) => void;
    warned: { current: boolean };
  } = { warned };
  if (deps.statfs !== undefined) guard.statfs = deps.statfs;
  if (deps.warn !== undefined) guard.warn = deps.warn;
  await mkdir(outDir, { recursive: true });
  await removePartials(outDir);
  const manifest = await loadManifest(outDir);
  const counts: RunCounts = { encoded: 0, skipped: 0, copied: 0, bytes: 0 };
  let estimate = 0;
  for (const image of images) {
    const size = await fileSize(image);
    const variants = Math.min(budget.maxVariantsPerImage, MAX_WIDTHS_PER_IMAGE * VARIANT_FORMATS.length);
    estimate += variants * Math.min(size, MAX_VARIANT_BYTES);
  }
  const videosToEncode = ffmpeg === null ? [] : videos;
  for (const video of videosToEncode) estimate += (await fileSize(video)) * 2;
  await assertFreeForMedia(outDir, estimate, guard);

  const plannedImages: PlannedImage[] = [];
  for (const input of images) {
    const started: string[] = [];
    try {
      const outputs = await encodeImageSet({
        input,
        outDir,
        budget,
        deps,
        guard,
        manifest,
        counts,
        started,
      });
      plannedImages.push({ input, outputs });
      await saveManifest(outDir, manifest);
    } catch (error) {
      if (error instanceof MediaBudgetExceededError) {
        await saveManifestQuiet(outDir, manifest);
        throw error;
      }
      await rollback(started);
      forget(manifest, outDir, started);
      await saveManifestQuiet(outDir, manifest);
      throw asDiskError(error);
    }
  }

  const plannedVideos: PlannedVideo[] = [];
  for (const input of videos) {
    const h264 = path.join(outDir, `${stem(input)}.mp4`);
    const webm = path.join(outDir, `${stem(input)}.webm`);
    const plan: PlannedVideo = { input, h264, webm, keyframeInterval };
    if (ffmpeg === null) {
      plan.skipped = options.ffmpegMissing ?? "ffmpeg is not installed. Video encoding was skipped.";
      plannedVideos.push(plan);
      continue;
    }
    const started: string[] = [];
    try {
      await encodeVideoSet({
        input,
        h264,
        webm,
        ffmpeg,
        outDir,
        budget,
        quality: videoQuality,
        deps,
        guard,
        manifest,
        counts,
        started,
      });
      plannedVideos.push(plan);
      await saveManifest(outDir, manifest);
    } catch (error) {
      if (error instanceof MediaBudgetExceededError) {
        await saveManifestQuiet(outDir, manifest);
        throw error;
      }
      await rollback(started);
      forget(manifest, outDir, started);
      await saveManifestQuiet(outDir, manifest);
      throw asDiskError(error);
    }
  }
  return {
    images: plannedImages,
    videos: plannedVideos,
    encoded: counts.encoded,
    skipped: counts.skipped,
    copied: counts.copied,
  };
}

async function encodeImageSet(args: {
  input: string;
  outDir: string;
  budget: MediaBudget;
  deps: MediaEncodeDeps;
  guard: { statfs?: StatFsFn | null; warn?: (message: string) => void; warned: { current: boolean } };
  manifest: VariantManifest;
  counts: RunCounts;
  started: string[];
}): Promise<PlannedOutput[]> {
  const sourceBytes = await fileSize(args.input);
  const sourceWidth = args.deps.sourceWidth === undefined ? args.budget.maxWidth : await args.deps.sourceWidth(args.input);
  const sourceHash = await hashFile(args.input);
  const widths = selectVariantWidths({ sourceWidth, maxWidth: args.budget.maxWidth });
  const outputs: PlannedOutput[] = [];
  let produced = 0;
  for (const width of widths) {
    if (produced >= args.budget.maxVariantsPerImage) break;
    const made: WrittenVariant[] = [];
    for (const format of VARIANT_FORMATS) {
      if (produced >= args.budget.maxVariantsPerImage) break;
      const quality = format === "avif" ? AVIF_QUALITY : WEBP_QUALITY;
      const dest = path.join(args.outDir, `${stem(args.input)}-${width}.${format}`);
      const key = variantKey(sourceHash, width, format, quality);
      const existing = await existingVariant(args.outDir, args.manifest, key);
      if (existing !== null && (await reusableOutput(dest, existing))) {
        outputs.push({ format, width, file: dest });
        args.counts.skipped += 1;
        produced += 1;
        continue;
      }
      if (args.counts.bytes >= args.budget.maxRunBytes) {
        throw new MediaBudgetExceededError(args.counts.bytes, args.budget.maxRunBytes);
      }
      await assertFreeForMedia(args.outDir, Math.min(sourceBytes, MAX_VARIANT_BYTES), args.guard);
      const bytes = existing === null
        ? await publishEncoded(dest, () => encodeImageVariant(args.deps, {
          input: args.input,
          width,
          format,
          quality,
          destination: `${dest}.partial`,
        }))
        : await publishCopy(existing.file, dest);
      args.started.push(dest);
      made.push({ file: dest, bytes, width, format, quality, key, how: existing === null ? "encoded" : "copied" });
      produced += 1;
    }
    const kept = chooseKept(made, sourceBytes);
    const keep = new Set(kept);
    for (const item of made) {
      if (keep.has(item)) continue;
      await rm(item.file, { force: true });
      const index = args.started.lastIndexOf(item.file);
      if (index >= 0) args.started.splice(index, 1);
    }
    for (const item of kept) {
      if (args.counts.bytes + item.bytes > args.budget.maxRunBytes) {
        await rm(item.file, { force: true });
        const index = args.started.lastIndexOf(item.file);
        if (index >= 0) args.started.splice(index, 1);
        throw new MediaBudgetExceededError(args.counts.bytes, args.budget.maxRunBytes);
      }
      args.counts.bytes += item.bytes;
      if (item.how === "encoded") args.counts.encoded += 1;
      else args.counts.copied += 1;
      remember(args.manifest, args.outDir, item, sourceHash);
      outputs.push({ format: item.format, width: item.width, file: item.file });
    }
  }
  return outputs;
}

async function encodeVideoSet(args: {
  input: string;
  h264: string;
  webm: string;
  ffmpeg: string;
  outDir: string;
  budget: MediaBudget;
  quality: { h264: number; webm: number };
  deps: MediaEncodeDeps;
  guard: { statfs?: StatFsFn | null; warn?: (message: string) => void; warned: { current: boolean } };
  manifest: VariantManifest;
  counts: RunCounts;
  started: string[];
}): Promise<void> {
  const sourceBytes = await fileSize(args.input);
  const sourceHash = await hashFile(args.input);
  const jobs: { dest: string; codec: "h264" | "webm"; quality: number }[] = [
    { dest: args.h264, codec: "h264", quality: args.quality.h264 },
    { dest: args.webm, codec: "webm", quality: args.quality.webm },
  ];
  for (const job of jobs) {
    const key = variantKey(sourceHash, 0, job.codec, job.quality);
    const existing = await existingVariant(args.outDir, args.manifest, key);
    if (existing !== null && (await reusableOutput(job.dest, existing))) {
      args.counts.skipped += 1;
      continue;
    }
    if (args.counts.bytes >= args.budget.maxRunBytes) {
      throw new MediaBudgetExceededError(args.counts.bytes, args.budget.maxRunBytes);
    }
    await assertFreeForMedia(args.outDir, sourceBytes, args.guard);
    const bytes = existing === null
      ? await publishEncoded(job.dest, () => encodeVideoVariant(args.deps, {
        input: args.input,
        codec: job.codec,
        quality: job.quality,
        destination: `${job.dest}.partial`,
        ffmpeg: args.ffmpeg,
      }))
      : await publishCopy(existing.file, job.dest);
    args.started.push(job.dest);
    if (args.counts.bytes + bytes > args.budget.maxRunBytes) {
      await rm(job.dest, { force: true });
      const index = args.started.lastIndexOf(job.dest);
      if (index >= 0) args.started.splice(index, 1);
      throw new MediaBudgetExceededError(args.counts.bytes, args.budget.maxRunBytes);
    }
    args.counts.bytes += bytes;
    if (existing === null) args.counts.encoded += 1;
    else args.counts.copied += 1;
    const relative = relativeTo(args.outDir, job.dest);
    if (args.manifest.entries[key] === undefined || existing === null) {
      args.manifest.entries[key] = {
        file: relative,
        bytes,
        sourceHash,
        width: 0,
        format: job.codec,
        quality: job.quality,
      };
    }
  }
}

function chooseKept(items: readonly WrittenVariant[], sourceBytes: number): WrittenVariant[] {
  if (items.length === 0) return [];
  const fits = items.filter((item) => item.bytes <= sourceBytes && item.bytes <= MAX_VARIANT_BYTES);
  if (fits.length > 0) return [...fits];
  let smallest = items[0];
  if (smallest === undefined) return [];
  for (const item of items) {
    if (item.bytes < smallest.bytes) smallest = item;
  }
  return [smallest];
}

function remember(manifest: VariantManifest, outDir: string, item: WrittenVariant, sourceHash: string): void {
  const current = manifest.entries[item.key];
  if (current !== undefined) return;
  manifest.entries[item.key] = {
    file: relativeTo(outDir, item.file),
    bytes: item.bytes,
    sourceHash,
    width: item.width,
    format: item.format,
    quality: item.quality,
  };
}

async function existingVariant(outDir: string, manifest: VariantManifest, key: string): Promise<{ file: string; bytes: number } | null> {
  const entry = manifest.entries[key];
  if (entry === undefined) return null;
  const abs = safeResolve(outDir, entry.file);
  if (abs === null) return null;
  return (await fileExists(abs)) ? { file: abs, bytes: entry.bytes } : null;
}

async function reusableOutput(dest: string, existing: { file: string; bytes: number }): Promise<boolean> {
  if (path.resolve(dest) === path.resolve(existing.file)) return true;
  try {
    const info = await stat(dest);
    return info.isFile() && info.size > 0 && info.size === existing.bytes;
  } catch {
    return false;
  }
}

async function encodeImageVariant(deps: MediaEncodeDeps, job: ImageVariantJob): Promise<void> {
  if (deps.encodeImageVariant === undefined) throw new Error("Image encoding is not configured.");
  await mkdir(path.dirname(job.destination), { recursive: true });
  await deps.encodeImageVariant(job);
}

async function encodeVideoVariant(deps: MediaEncodeDeps, job: VideoVariantJob): Promise<void> {
  if (deps.encodeVideoVariant === undefined) throw new Error("Video encoding is not configured.");
  await mkdir(path.dirname(job.destination), { recursive: true });
  await deps.encodeVideoVariant(job);
}

async function publishEncoded(dest: string, produce: () => Promise<void>): Promise<number> {
  const partial = `${dest}.partial`;
  await rm(partial, { force: true });
  try {
    await produce();
    const info = await stat(partial);
    await rm(dest, { force: true });
    await rename(partial, dest);
    return info.size;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function publishCopy(source: string, dest: string): Promise<number> {
  const partial = `${dest}.partial`;
  await rm(partial, { force: true });
  try {
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, partial);
    const info = await stat(partial);
    await rm(dest, { force: true });
    await rename(partial, dest);
    return info.size;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function rollback(files: readonly string[]): Promise<void> {
  for (const file of files) {
    await rm(file, { force: true });
    await rm(`${file}.partial`, { force: true });
  }
}

function forget(manifest: VariantManifest, outDir: string, files: readonly string[]): void {
  const dropped = new Set(files.map((file) => relativeTo(outDir, file)));
  for (const [key, entry] of Object.entries(manifest.entries)) {
    if (dropped.has(entry.file)) delete manifest.entries[key];
  }
}

async function removePartials(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await removePartials(full);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".partial")) await rm(full, { force: true });
  }
}

async function loadManifest(outDir: string): Promise<VariantManifest> {
  const manifest = emptyManifest();
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(outDir, MANIFEST_NAME), "utf8"));
  } catch {
    return manifest;
  }
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.entries)) return manifest;
  for (const [key, value] of Object.entries(raw.entries)) {
    if (!isEntry(value)) continue;
    if (safeResolve(outDir, value.file) === null) continue;
    manifest.entries[key] = value;
  }
  return manifest;
}

async function saveManifest(outDir: string, manifest: VariantManifest): Promise<void> {
  const dest = path.join(outDir, MANIFEST_NAME);
  const partial = `${dest}.partial`;
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(partial, body, "utf8");
  try {
    await copyFile(partial, dest);
    await rm(partial, { force: true });
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function saveManifestQuiet(outDir: string, manifest: VariantManifest): Promise<void> {
  try {
    await saveManifest(outDir, manifest);
  } catch {
    // The encode error is the one the caller needs.
  }
}

function emptyManifest(): VariantManifest {
  return { version: 1, entries: {} };
}

function isEntry(value: unknown): value is VariantEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.file === "string" &&
    typeof value.bytes === "number" &&
    typeof value.sourceHash === "string" &&
    typeof value.width === "number" &&
    typeof value.format === "string" &&
    typeof value.quality === "number"
  );
}

function mergeBudget(base: MediaBudget, override?: Partial<MediaBudget>): MediaBudget {
  return {
    maxVariantsPerImage: positiveInt(override?.maxVariantsPerImage, base.maxVariantsPerImage, 1, MAX_VARIANTS_CAP),
    maxRunBytes: positiveInt(override?.maxRunBytes, base.maxRunBytes, 1, MAX_RUN_CAP),
    maxWidth: Math.min(MAX_VARIANT_WIDTH, positiveInt(override?.maxWidth, base.maxWidth, 1, 8192)),
  };
}

function asDiskError(error: unknown): Error {
  if (error instanceof MediaDiskSpaceError) return error;
  if (!isNoSpace(error)) return error instanceof Error ? error : new Error("Media encoding failed.");
  const wrapped = new MediaDiskSpaceError(MEDIA_DISK_SPACE_FALLBACK);
  wrapped.cause = error;
  return wrapped;
}

function isNoSpace(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOSPC") {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /ENOSPC|No space left on device/i.test(message);
}

function warnOnce(warned: { current: boolean }, warn?: (message: string) => void): void {
  if (warned.current) return;
  warned.current = true;
  if (warn !== undefined) warn(UNSUPPORTED_STATFS);
  else console.warn(UNSUPPORTED_STATFS);
}

async function defaultStatfs(dir: string): Promise<DiskStat> {
  if (typeof statfsNative !== "function") {
    throw Object.assign(new Error("statfs is not supported"), { code: "ENOSYS" });
  }
  const stats = await statfsNative(dir);
  return { bsize: Number(stats.bsize), bavail: Number(stats.bavail) };
}

function isUnsupportedStatfs(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ENOSYS" || code === "ENOTSUP" || code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") return true;
  }
  return /statfs|not supported|not implemented/i.test(message);
}

function withinTenPercent(left: number, right: number): boolean {
  const base = Math.max(left, right);
  if (base <= 0) return false;
  return Math.abs(left - right) / base <= WIDTH_CLOSENESS;
}

function clampCount(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function positive(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function stem(file: string): string {
  return path.basename(file, path.extname(file));
}

async function fileSize(file: string): Promise<number> {
  const info = await stat(file);
  return info.size;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

function relativeTo(outDir: string, file: string): string {
  return path.relative(path.resolve(outDir), path.resolve(file)).split(path.sep).join("/");
}

function safeResolve(outDir: string, relative: string): string | null {
  if (relative === "" || relative.includes("\0")) return null;
  const root = path.resolve(outDir);
  const abs = path.resolve(outDir, relative);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
