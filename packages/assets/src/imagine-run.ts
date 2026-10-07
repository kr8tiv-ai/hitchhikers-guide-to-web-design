/**
 * Run a confirmed Imagine batch.
 *
 * Quotes come from prices.ts (card 2026-09-29), not from the flat
 * per-second line on the video model page. A batch that would pass the
 * cap is refused before confirm and before any fetch. One confirm covers
 * the batch. Jobs run one at a time. The running total is
 * .hitchhiker/assets/spend.json. Files land in
 * .hitchhiker/assets/generated/.
 *
 * A started video is counted when the request id comes back, so a poll
 * timeout cannot be followed by more jobs that walk past the cap.
 * The job id stays on the slot so a later run can poll it again.
 * A slot that is already done and has a file is left alone.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ImagineHttpError,
  VideoJobError,
  VideoPollTimeout,
  fetchBytes,
  validateImageRequest,
  validateVideoRequest,
  type GeneratedImage,
  type HttpDeps,
  type ImageRequest,
  type ImagineClient,
  type PollDeps,
  type VideoRequest,
} from "./imagine-http.ts";
import { CapExceeded, estimateMustFit, quote, quoteJob, type ImagineJob, type StillJob, type VideoJob } from "./prices.ts";
import {
  type AssetSlot,
  assertSlotId,
  generatedDir,
  refusesRealReplacement,
  rowFromSlot,
  updateAssetRows,
  writeTextAtomic,
} from "./slots.ts";

export class RealSubjectError extends Error {
  readonly slotId: string;

  constructor(slotId: string) {
    super(`Slot ${slotId} replaces a real subject. A replacement needs a recorded yes.`);
    this.name = "RealSubjectError";
    this.slotId = slotId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface SpendEntry {
  slot: string;
  usd: number;
  at: string;
  jobId?: string;
}

export interface SpendLedger {
  spentUsd: number;
  entries: SpendEntry[];
}

export interface RunBatchDeps {
  confirm: (quote: { usd: number; lines: string[] }) => Promise<boolean>;
  cap: number;
  spent: number;
  client: ImagineClient;
  projectDir: string;
  key: string;
  fetchImpl: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
}

export function spendFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "assets", "spend.json");
}

/** Quote every slot with the 053 price card. No fetch and no confirm. */
export function planBatch(slots: readonly AssetSlot[]): { usd: number; lines: string[] } {
  if (slots.length === 0) throw new Error("An Imagine batch needs at least one slot.");
  const jobs: ImagineJob[] = [];
  for (const slot of slots) {
    assertSlotId(slot.id);
    jobs.push(slotToJob(slot));
  }
  const quoted = quote(jobs);
  return {
    usd: quoted.usd,
    lines: quoted.lines.map((line, index) => `${slots[index]?.id ?? "slot"}: ${line}`),
  };
}

export async function runBatch(
  slots: readonly AssetSlot[],
  deps: RunBatchDeps,
): Promise<{ done: AssetSlot[]; spent: number }> {
  assertRunDeps(deps);
  const ledger = await readSpend(deps.projectDir);
  const pending = slots.filter((slot) => !isFinished(slot));
  if (pending.length === 0) {
    return { done: slots.map((slot) => structuredClone(slot)), spent: deps.spent };
  }
  for (const slot of pending) {
    if (refusesRealReplacement(slot)) throw new RealSubjectError(slot.id);
  }
  const billable = pending.filter((slot) => !isResume(slot, ledger));
  const quoted = billable.length > 0 ? planBatch(billable) : { usd: 0, lines: [] as string[] };
  for (const slot of pending) {
    if (!isResume(slot, ledger)) continue;
    quoted.lines.push(`${slot.id}: resume job ${slot.jobId ?? ""}`);
  }
  const remainingCents = cents(deps.cap) - cents(deps.spent);
  if (quoted.usd > 0 && (remainingCents < 0 || cents(quoted.usd) > remainingCents)) {
    throw new CapExceeded(quoted.usd, Math.max(0, remainingCents) / 100, quoted.lines);
  }
  if (quoted.usd > 0) estimateMustFit(quoted, deps.cap - deps.spent);

  const accepted = await deps.confirm(quoted);
  if (!accepted) {
    return { done: slots.map((slot) => structuredClone(slot)), spent: deps.spent };
  }

  const done = slots.map((slot) => structuredClone(slot));
  let spentCents = cents(deps.spent);
  const http = httpDeps(deps);
  for (const slot of done) {
    if (isFinished(slot)) continue;
    try {
      spentCents = await runSlot(slot, deps, http, spentCents);
    } catch (error) {
      markFailed(slot, error, deps.key);
      await updateAssetRows(deps.projectDir, [rowFromSlot(slot, deps.projectDir)]);
      const ledger = await readSpend(deps.projectDir);
      spentCents = Math.max(spentCents, cents(ledger.spentUsd));
      break;
    }
  }
  return { done, spent: spentCents / 100 };
}

export async function readSpend(projectDir: string): Promise<SpendLedger> {
  let text: string;
  try {
    text = await readFile(spendFile(projectDir), "utf8");
  } catch (error) {
    if (isEnoent(error)) return { spentUsd: 0, entries: [] };
    throw error;
  }
  return parseSpend(text);
}

export async function recordSpend(projectDir: string, entry: SpendEntry, totalUsd: number): Promise<number> {
  const previous = await readSpend(projectDir);
  if (entry.jobId !== undefined && alreadyCounted(previous, entry.slot, entry.jobId)) {
    return previous.spentUsd;
  }
  const entries = [...previous.entries, entry];
  const summed = entries.reduce((sum, item) => sum + cents(item.usd), 0);
  const spentCents = Math.max(cents(previous.spentUsd) + cents(entry.usd), cents(totalUsd), summed);
  const body: SpendLedger = { spentUsd: spentCents / 100, entries };
  await writeTextAtomic(spendFile(projectDir), `${JSON.stringify(body, null, 2)}\n`);
  return body.spentUsd;
}

async function runSlot(
  slot: AssetSlot,
  deps: RunBatchDeps,
  http: HttpDeps,
  spentCents: number,
): Promise<number> {
  if (slot.kind === "video" && slot.jobId !== undefined && slot.status === "failed") {
    return resumeVideo(slot, deps, http, spentCents);
  }
  if (slot.kind === "video") return runVideo(slot, deps, http, spentCents);
  return runStill(slot, deps, http, spentCents);
}

async function runStill(
  slot: AssetSlot,
  deps: RunBatchDeps,
  http: HttpDeps,
  spentCents: number,
): Promise<number> {
  const images = await deps.client.generateImage(imageRequest(slot), http);
  const charged = await charge(slot, deps, spentCents, undefined);
  const file = await writeImages(deps, slot, images);
  slot.file = file;
  finish(slot, charged.usd);
  await updateAssetRows(deps.projectDir, [rowFromSlot(slot, deps.projectDir)]);
  return charged.spentCents;
}

async function runVideo(
  slot: AssetSlot,
  deps: RunBatchDeps,
  http: HttpDeps,
  spentCents: number,
): Promise<number> {
  const started = await deps.client.startVideo(videoRequest(slot), http);
  slot.jobId = started.id;
  const charged = await charge(slot, deps, spentCents, started.id);
  const polled = await deps.client.pollVideo(started.id, pollDeps(deps));
  const file = await writeDownload(deps, slot.id, polled.url, "video", 0);
  slot.file = file;
  finish(slot, charged.usd);
  await updateAssetRows(deps.projectDir, [rowFromSlot(slot, deps.projectDir)]);
  return charged.spentCents;
}

async function resumeVideo(
  slot: AssetSlot,
  deps: RunBatchDeps,
  http: HttpDeps,
  spentCents: number,
): Promise<number> {
  const jobId = slot.jobId;
  if (jobId === undefined) throw new ImagineHttpError(0, "Imagine video job id is not usable.");
  const ledger = await readSpend(deps.projectDir);
  let next = spentCents;
  let usd = slot.costUsd ?? quoteJob(slotToJob(slot)).usd;
  if (!alreadyCounted(ledger, slot.id, jobId)) {
    const charged = await charge(slot, deps, spentCents, jobId);
    next = charged.spentCents;
    usd = charged.usd;
  }
  const polled = await deps.client.pollVideo(jobId, pollDeps(deps));
  const file = await writeDownload(deps, slot.id, polled.url, "video", 0);
  slot.file = file;
  finish(slot, usd);
  await updateAssetRows(deps.projectDir, [rowFromSlot(slot, deps.projectDir)]);
  return next;
}

async function charge(
  slot: AssetSlot,
  deps: RunBatchDeps,
  spentCents: number,
  jobId: string | undefined,
): Promise<{ spentCents: number; usd: number }> {
  const usd = quoteJob(slotToJob(slot)).usd;
  slot.costUsd = usd;
  const entry: SpendEntry = {
    slot: slot.id,
    usd,
    at: deps.now !== undefined ? deps.now() : new Date().toISOString(),
  };
  if (jobId !== undefined) entry.jobId = jobId;
  const stored = await recordSpend(deps.projectDir, entry, (spentCents + cents(usd)) / 100);
  return { spentCents: cents(stored), usd };
}

function finish(slot: AssetSlot, usd: number): void {
  slot.costUsd = usd;
  slot.source = "imagine";
  slot.approved = false;
  slot.status = "done";
  delete slot.error;
}

async function writeImages(deps: RunBatchDeps, slot: AssetSlot, images: readonly GeneratedImage[]): Promise<string> {
  if (images.length === 0) throw new ImagineHttpError(200, "Imagine image response had no images.");
  let first = "";
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (image === undefined) continue;
    const saved = await writeOneImage(deps, slot.id, image, index);
    if (first.length === 0) first = saved;
  }
  if (first.length === 0) throw new ImagineHttpError(200, "Imagine image response had no images.");
  return first;
}

async function writeOneImage(
  deps: RunBatchDeps,
  slotId: string,
  image: GeneratedImage,
  index: number,
): Promise<string> {
  if (image.b64 !== undefined) {
    const bytes = decodeB64(image.b64);
    return writeBytes(deps.projectDir, slotId, bytes, "", "still", index);
  }
  if (image.url === undefined) throw new ImagineHttpError(200, "Imagine image response had no url or base64.");
  return writeDownload(deps, slotId, image.url, "still", index);
}

async function writeDownload(
  deps: RunBatchDeps,
  slotId: string,
  url: string,
  kind: "still" | "video",
  index: number,
): Promise<string> {
  const downloaded = await fetchBytes(url, httpDeps(deps));
  return writeBytes(deps.projectDir, slotId, downloaded.bytes, downloaded.contentType, kind, index);
}

async function writeBytes(
  projectDir: string,
  slotId: string,
  bytes: Uint8Array,
  contentType: string,
  kind: "still" | "video",
  index: number,
): Promise<string> {
  const dir = generatedDir(projectDir);
  await mkdir(dir, { recursive: true });
  const ext = extensionFor(bytes, contentType, kind);
  const stem = index === 0 ? slotId : `${slotId}-${index + 1}`;
  const file = path.join(dir, `${stem}${ext}`);
  await writeFile(file, bytes);
  return file;
}

function imageRequest(slot: AssetSlot): ImageRequest {
  const req: ImageRequest = {
    model: slot.model,
    prompt: slot.prompt,
    aspect: slot.aspect,
    n: slot.n,
  };
  const token = slot.stillResolution ?? "default";
  if (token === "1k-low") {
    req.resolution = "1k";
    if (slot.model === "grok-imagine-image-2.0") req.quality = "low";
  } else if (token === "2k-medium") {
    req.resolution = "2k";
    if (slot.model === "grok-imagine-image-2.0") req.quality = "medium";
  }
  validateImageRequest(req);
  return req;
}

function videoRequest(slot: AssetSlot): VideoRequest {
  const resolution = slot.resolution ?? "480p";
  const req: VideoRequest = {
    model: slot.model,
    prompt: slot.prompt,
    seconds: slot.seconds ?? 1,
    resolution,
    aspect: slot.aspect,
  };
  if (slot.image !== undefined) req.image = slot.image;
  validateVideoRequest(req);
  return req;
}

function slotToJob(slot: AssetSlot): ImagineJob {
  if (slot.kind === "still") {
    const job: StillJob = {
      kind: "still",
      model: stillModel(slot.model),
      resolution: slot.stillResolution ?? "default",
      prompt: slot.prompt,
      count: slot.n,
    };
    return job;
  }
  if (slot.seconds === undefined) throw new Error(`Slot ${slot.id} needs seconds.`);
  if (slot.resolution === undefined) throw new Error(`Slot ${slot.id} needs a video resolution.`);
  const job: VideoJob = {
    kind: "video",
    model: videoModel(slot.model),
    resolution: slot.resolution,
    seconds: slot.seconds,
    prompt: slot.prompt,
  };
  return job;
}

function stillModel(model: string): StillJob["model"] {
  if (
    model === "grok-imagine-image" ||
    model === "grok-imagine-image-2.0" ||
    model === "grok-imagine-image-quality"
  ) {
    return model;
  }
  throw new Error(`Unknown Imagine model "${model}".`);
}

function videoModel(model: string): VideoJob["model"] {
  if (
    model === "grok-imagine-video-1.5" ||
    model === "grok-imagine-video-1.5-lite" ||
    model === "grok-imagine-video"
  ) {
    return model;
  }
  throw new Error(`Unknown Imagine model "${model}".`);
}

function isFinished(slot: AssetSlot): boolean {
  return slot.status === "done" && slot.file !== undefined && slot.file.length > 0;
}

function isResume(slot: AssetSlot, ledger: SpendLedger): boolean {
  return (
    slot.kind === "video" &&
    slot.jobId !== undefined &&
    slot.status === "failed" &&
    alreadyCounted(ledger, slot.id, slot.jobId)
  );
}

function alreadyCounted(ledger: SpendLedger, slotId: string, jobId: string): boolean {
  return ledger.entries.some((entry) => entry.slot === slotId && entry.jobId === jobId);
}

function markFailed(slot: AssetSlot, error: unknown, key: string): void {
  slot.status = "failed";
  if (error instanceof VideoPollTimeout || error instanceof VideoJobError) {
    slot.jobId = error.jobId;
  }
  slot.error = redactJob(messageOf(error), key, slot.prompt);
}

function httpDeps(deps: RunBatchDeps): HttpDeps {
  const http: HttpDeps = { fetchImpl: deps.fetchImpl, key: deps.key };
  if (deps.sleep !== undefined) http.sleep = deps.sleep;
  return http;
}

function pollDeps(deps: RunBatchDeps): PollDeps {
  return {
    fetchImpl: deps.fetchImpl,
    key: deps.key,
    sleep: deps.sleep ?? defaultSleep,
  };
}

function assertRunDeps(deps: RunBatchDeps): void {
  if (typeof deps.confirm !== "function") throw new Error("Imagine batch needs a confirm function.");
  if (!Number.isFinite(deps.cap) || deps.cap < 0) {
    throw new Error("Imagine cap must be a finite number of dollars, zero or more.");
  }
  if (!Number.isFinite(deps.spent) || deps.spent < 0) {
    throw new Error("Imagine spent must be a finite number of dollars, zero or more.");
  }
  if (typeof deps.projectDir !== "string" || deps.projectDir.trim().length === 0) {
    throw new Error("Imagine batch needs a project directory.");
  }
  if (typeof deps.fetchImpl !== "function") throw new Error("Imagine needs an injected fetch.");
  if (typeof deps.key !== "string" || deps.key.trim().length === 0) {
    throw new Error("Imagine needs an API key.");
  }
  const client = deps.client;
  if (
    client === undefined ||
    typeof client.generateImage !== "function" ||
    typeof client.startVideo !== "function" ||
    typeof client.pollVideo !== "function"
  ) {
    throw new Error("Imagine batch needs a client.");
  }
}

function parseSpend(text: string): SpendLedger {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("spend.json is not valid JSON.");
  }
  if (!isRecord(raw) || typeof raw.spentUsd !== "number" || !Array.isArray(raw.entries)) {
    throw new Error("spend.json needs spentUsd and entries.");
  }
  if (!Number.isFinite(raw.spentUsd) || raw.spentUsd < 0) {
    throw new Error("spend.json spentUsd must be zero or more.");
  }
  const entries: SpendEntry[] = [];
  for (const item of raw.entries) {
    if (!isRecord(item) || typeof item.slot !== "string" || typeof item.usd !== "number" || typeof item.at !== "string") {
      throw new Error("spend.json has a bad entry.");
    }
    if (!Number.isFinite(item.usd) || item.usd < 0) throw new Error("spend.json has a bad entry.");
    const entry: SpendEntry = { slot: item.slot, usd: item.usd, at: item.at };
    if (item.jobId !== undefined) {
      if (typeof item.jobId !== "string") throw new Error("spend.json has a bad entry.");
      entry.jobId = item.jobId;
    }
    entries.push(entry);
  }
  const summed = entries.reduce((sum, item) => sum + cents(item.usd), 0);
  const spentCents = Math.max(cents(raw.spentUsd), summed);
  return { spentUsd: spentCents / 100, entries };
}

function extensionFor(bytes: Uint8Array, contentType: string, kind: "still" | "video"): string {
  const type = contentType.toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("mp4") || type.includes("video")) return ".mp4";
  if (kind === "video") return ".mp4";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return ".png";
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return ".webp";
  }
  return ".jpg";
}

function decodeB64(value: string): Uint8Array {
  const cleaned = value.replace(/\s/g, "");
  if (cleaned.length === 0 || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new ImagineHttpError(200, "Imagine image base64 could not be read.");
  }
  return new Uint8Array(Buffer.from(cleaned, "base64"));
}

function redactJob(message: string, key: string, prompt: string): string {
  let safe = message;
  if (key.length >= 8 && safe.includes(key)) safe = safe.split(key).join("[redacted]");
  if (prompt.length >= 8 && safe.includes(prompt)) safe = safe.split(prompt).join("[prompt]");
  const trimmed = safe.trim();
  return trimmed.length > 0 ? trimmed : "Imagine request failed.";
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Imagine request failed.";
}

function cents(usd: number): number {
  if (!Number.isFinite(usd)) throw new Error("Imagine amount must be a finite number of dollars.");
  return Math.round(usd * 100);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
