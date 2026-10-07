/**
 * Imagine prices from the xAI card dated 2026-09-29.
 * https://docs.x.ai/developers/pricing
 *
 * This is a snapshot, not a live feed. Nothing here calls the network.
 * Estimates must be recomputed if the card changes. SuperGrok is not a
 * billing source for these amounts.
 *
 * Rates are integer cents so a batch cannot drift. $0.25 per second is
 * 25 cents. Video is not a flat $0.08 per second.
 *
 * grok-imagine-image is $0.02 at 1K and at 2K, so every resolution token
 * for that model is 2 cents. grok-imagine-image-2.0 is $0.04 at 1K low
 * and $0.08 at 2K medium. Its default is not listed, so it throws.
 * grok-imagine-image-quality is published as "from $0.05". That floor is
 * the quote for every resolution token. grok-imagine-video has no 1080p
 * price, so that pair throws.
 */

export const PRICE_CARD_DATE = "2026-09-29";

const FIT_EPSILON = 1e-9;

export interface StillJob {
  kind: "still";
  model: "grok-imagine-image" | "grok-imagine-image-2.0" | "grok-imagine-image-quality";
  resolution: "1k-low" | "2k-medium" | "default";
  prompt: string;
  count: number;
}

export interface VideoJob {
  kind: "video";
  model: "grok-imagine-video-1.5" | "grok-imagine-video-1.5-lite" | "grok-imagine-video";
  resolution: "480p" | "720p" | "1080p";
  seconds: number;
  prompt: string;
}

export type ImagineJob = StillJob | VideoJob;

export interface JobQuote {
  usd: number;
  line: string;
}

export interface BatchQuote {
  usd: number;
  lines: string[];
}

const STILL_MODELS: readonly string[] = [
  "grok-imagine-image",
  "grok-imagine-image-2.0",
  "grok-imagine-image-quality",
];

const STILL_RESOLUTIONS: readonly string[] = ["1k-low", "2k-medium", "default"];

const VIDEO_MODELS: readonly string[] = [
  "grok-imagine-video-1.5",
  "grok-imagine-video-1.5-lite",
  "grok-imagine-video",
];

const VIDEO_RESOLUTIONS: readonly string[] = ["480p", "720p", "1080p"];

/** Cents per still. Key is `${model}|${resolution}`. */
const STILL_CENTS: Readonly<Record<string, number>> = {
  "grok-imagine-image|default": 2,
  "grok-imagine-image|1k-low": 2,
  "grok-imagine-image|2k-medium": 2,
  "grok-imagine-image-2.0|1k-low": 4,
  "grok-imagine-image-2.0|2k-medium": 8,
  "grok-imagine-image-quality|default": 5,
  "grok-imagine-image-quality|1k-low": 5,
  "grok-imagine-image-quality|2k-medium": 5,
};

/** Cents per second. Key is `${model}|${resolution}`. */
const VIDEO_CENTS_PER_SECOND: Readonly<Record<string, number>> = {
  "grok-imagine-video-1.5|480p": 8,
  "grok-imagine-video-1.5|720p": 14,
  "grok-imagine-video-1.5|1080p": 25,
  "grok-imagine-video-1.5-lite|480p": 2,
  "grok-imagine-video-1.5-lite|720p": 3,
  "grok-imagine-video-1.5-lite|1080p": 14,
  "grok-imagine-video|480p": 5,
  "grok-imagine-video|720p": 7,
};

interface Priced {
  cents: number;
  line: string;
}

export class CapExceeded extends Error {
  readonly usd: number;
  readonly remainingUsd: number;

  constructor(usd: number, remainingUsd: number, lines: readonly string[]) {
    const detail = lines.length > 0 ? ` ${lines.join("; ")}` : "";
    super(
      `Cap exceeded: estimate ${usd.toFixed(2)} is above remaining ${remainingUsd.toFixed(2)}.${detail}`,
    );
    this.name = "CapExceeded";
    this.usd = usd;
    this.remainingUsd = remainingUsd;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function stillImageUsd(
  model: StillJob["model"],
  resolution: StillJob["resolution"] = "default",
): number {
  return centsToUsd(stillUnitCents(model, resolution));
}

export function videoPerSecondUsd(
  model: VideoJob["model"],
  resolution: VideoJob["resolution"],
): number {
  return centsToUsd(videoUnitCents(model, resolution));
}

/** One job. The line names model and resolution, never the prompt. */
export function quoteJob(job: ImagineJob): JobQuote {
  const priced = priceJob(job);
  return { usd: centsToUsd(priced.cents), line: priced.line };
}

export function quote(job: ImagineJob): BatchQuote;
export function quote(jobs: readonly ImagineJob[]): BatchQuote;
export function quote(jobOrJobs: ImagineJob | readonly ImagineJob[]): BatchQuote {
  const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];
  if (jobs.length === 0) {
    throw new Error("An Imagine quote needs at least one job.");
  }
  const lines: string[] = [];
  let cents = 0;
  for (const job of jobs) {
    const priced = priceJob(job);
    cents = addCents(cents, priced.cents);
    lines.push(priced.line);
  }
  return { usd: centsToUsd(cents), lines };
}

export function assertFits(totalUsd: number, remainingUsd: number): void;
export function assertFits(quoted: BatchQuote, remainingUsd: number): void;
export function assertFits(quoted: JobQuote, remainingUsd: number): void;
export function assertFits(
  totalOrQuote: number | BatchQuote | JobQuote,
  remainingUsd: number,
): void {
  const usd = typeof totalOrQuote === "number" ? totalOrQuote : totalOrQuote.usd;
  const lines = linesFrom(totalOrQuote);
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) {
    throw new Error("Imagine estimate must be a finite dollar amount.");
  }
  if (typeof remainingUsd !== "number" || !Number.isFinite(remainingUsd) || remainingUsd < 0) {
    throw new Error("remainingUsd must be a finite number of dollars, zero or more.");
  }
  if (usd > remainingUsd + FIT_EPSILON) {
    throw new CapExceeded(usd, remainingUsd, lines);
  }
}

export function estimateMustFit(quoted: BatchQuote | JobQuote, remainingUsd: number): void {
  if ("lines" in quoted) {
    assertFits(quoted, remainingUsd);
    return;
  }
  assertFits(quoted, remainingUsd);
}

function linesFrom(totalOrQuote: number | BatchQuote | JobQuote): string[] {
  if (typeof totalOrQuote === "number") return [];
  if ("lines" in totalOrQuote && Array.isArray(totalOrQuote.lines)) {
    return [...totalOrQuote.lines];
  }
  if ("line" in totalOrQuote && typeof totalOrQuote.line === "string") {
    return [totalOrQuote.line];
  }
  return [];
}

function priceJob(job: ImagineJob): Priced {
  if (job === null || typeof job !== "object") {
    throw new Error("Imagine job must be an object.");
  }
  if (job.kind === "still") return priceStill(job);
  if (job.kind === "video") return priceVideo(job);
  throw new Error("Imagine job kind must be still or video.");
}

function priceStill(job: StillJob): Priced {
  const model = readToken(job.model, "model");
  const resolution = readToken(job.resolution, "resolution");
  const count = positiveWhole(job.count, "count");
  readPrompt(job.prompt);
  const centsEach = stillUnitCents(model, resolution);
  const cents = multiply(centsEach, count);
  const floor = model === "grok-imagine-image-quality" ? ", floor" : "";
  return {
    cents,
    line: `${model} at ${resolution}, count ${count}${floor}, card ${PRICE_CARD_DATE}`,
  };
}

function priceVideo(job: VideoJob): Priced {
  const model = readToken(job.model, "model");
  const resolution = readToken(job.resolution, "resolution");
  const seconds = positiveWhole(job.seconds, "seconds");
  readPrompt(job.prompt);
  const centsEach = videoUnitCents(model, resolution);
  const cents = multiply(centsEach, seconds);
  return {
    cents,
    line: `${model} at ${resolution}, ${seconds} seconds, card ${PRICE_CARD_DATE}`,
  };
}

function stillUnitCents(model: string, resolution: string): number {
  if (!STILL_MODELS.includes(model)) {
    throw new Error(`Unknown Imagine model "${model}".`);
  }
  if (!STILL_RESOLUTIONS.includes(resolution)) {
    throw new Error(`Unknown Imagine resolution "${resolution}".`);
  }
  const cents = STILL_CENTS[`${model}|${resolution}`];
  if (cents === undefined) {
    throw new Error(
      `No listed price for ${model} at ${resolution} on the ${PRICE_CARD_DATE} card.`,
    );
  }
  return cents;
}

function videoUnitCents(model: string, resolution: string): number {
  if (!VIDEO_MODELS.includes(model)) {
    throw new Error(`Unknown Imagine model "${model}".`);
  }
  if (!VIDEO_RESOLUTIONS.includes(resolution)) {
    throw new Error(`Unknown Imagine resolution "${resolution}".`);
  }
  const cents = VIDEO_CENTS_PER_SECOND[`${model}|${resolution}`];
  if (cents === undefined) {
    throw new Error(
      `No listed price for ${model} at ${resolution} on the ${PRICE_CARD_DATE} card.`,
    );
  }
  return cents;
}

function readToken(value: unknown, noun: "model" | "resolution"): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Imagine ${noun} must be text.`);
  }
  return value;
}

function readPrompt(value: unknown): void {
  if (typeof value !== "string") {
    throw new Error("Imagine prompt must be text.");
  }
}

function positiveWhole(value: unknown, noun: "seconds" | "count"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || !Number.isSafeInteger(value)) {
    throw new Error(`Imagine ${noun} must be a positive whole number.`);
  }
  return value;
}

function multiply(unitCents: number, quantity: number): number {
  const cents = unitCents * quantity;
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Imagine quote is too large to price.");
  }
  return cents;
}

function addCents(left: number, right: number): number {
  const cents = left + right;
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Imagine quote is too large to price.");
  }
  return cents;
}

function centsToUsd(cents: number): number {
  return cents / 100;
}
