/**
 * Thin Imagine client. Fetch is injected. The key travels only in the
 * Authorization header.
 *
 * Wire names follow the xAI docs. The function arguments keep the names
 * from this prompt, then map: aspect to aspect_ratio, seconds to duration,
 * and the video request_id to id. Image bytes come back as data[].url or
 * data[].b64_json (mapped to b64).
 *
 * Edits post to /v1/images/edits. One source is `image`. Two to five
 * sources are `images`. Reference-to-video sends `reference_images` and
 * cannot be combined with a first-frame image.
 *
 * Polling waits 2 seconds, then doubles up to 30 seconds, and stops after
 * 10 minutes of waiting. That cadence is the one this prompt sets. The doc
 * examples sleep 5 seconds. The SDK default interval is 100 milliseconds.
 *
 * HTTP 429 and 5xx are tried again twice, with 1 second then 2 seconds
 * between tries. The response body is discarded so a key or a prompt in
 * an error payload cannot leak into the message.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const IMAGINE_ORIGIN = "https://api.x.ai";
export const IMAGE_GENERATIONS_PATH = "/v1/images/generations";
export const IMAGE_EDITS_PATH = "/v1/images/edits";
export const VIDEO_GENERATIONS_PATH = "/v1/videos/generations";

/** Local guard so a data URI stays a reasonable request. Not an xAI field. 20 MB. */
export const FILE_DATA_URI_MAX_BYTES = 20 * 1024 * 1024;

export const POLL_START_MS = 2_000;
export const POLL_MAX_INTERVAL_MS = 30_000;
export const POLL_CAP_MS = 10 * 60 * 1000;

const HTTP_RETRY_START_MS = 1_000;
const HTTP_RETRY_MAX_MS = 4_000;
const HTTP_RETRIES = 2;
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;

const IMAGE_ASPECTS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
  "19.5:9",
  "9:19.5",
  "20:9",
  "9:20",
  "21:9",
  "5:2",
  "auto",
] as const;

const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export interface GeneratedImage {
  url?: string;
  b64?: string;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  aspect: string;
  n: number;
  resolution?: "1k" | "2k";
  quality?: "low" | "medium" | "auto";
}

export interface EditRequest {
  model: string;
  prompt: string;
  /** http(s) URLs or data:image URIs. One sends `image`. Two to five send `images`. */
  sources: readonly string[];
  n: number;
  aspect?: string;
  resolution?: "1k" | "2k";
  quality?: "low" | "medium" | "auto";
}

export interface VideoRequest {
  model: string;
  prompt: string;
  image?: string;
  /** Style references. Cannot be combined with `image`. At most five. */
  referenceImages?: readonly string[];
  seconds: number;
  resolution: VideoResolution;
  aspect?: string;
  /** Sent only when set. Decorative video passes false. xAI otherwise turns audio on. */
  generateAudio?: boolean;
}

export interface HttpDeps {
  fetchImpl: typeof fetch;
  key: string;
  sleep?: (ms: number) => Promise<void>;
}

export interface PollDeps {
  fetchImpl: typeof fetch;
  key: string;
  sleep: (ms: number) => Promise<void>;
}

export interface ImagineClient {
  generateImage(req: ImageRequest, deps: HttpDeps): Promise<GeneratedImage[]>;
  editImage(req: EditRequest, deps: HttpDeps): Promise<GeneratedImage[]>;
  startVideo(req: VideoRequest, deps: HttpDeps): Promise<{ id: string }>;
  pollVideo(id: string, deps: PollDeps): Promise<{ url: string }>;
}

export class ImagineHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ImagineHttpError";
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VideoPollTimeout extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Video job ${jobId} timed out after 10 minutes. Resume with this job id.`);
    this.name = "VideoPollTimeout";
    this.jobId = jobId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class VideoJobError extends Error {
  readonly jobId: string;

  constructor(jobId: string, detail: string) {
    super(`Video job ${jobId} ${detail}`);
    this.name = "VideoJobError";
    this.jobId = jobId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createImagineClient(): ImagineClient {
  return { generateImage, editImage, startVideo, pollVideo };
}

export function generateImage(req: ImageRequest, deps: HttpDeps): Promise<GeneratedImage[]> {
  assertKey(deps.key);
  assertFetch(deps.fetchImpl);
  validateImageRequest(req);
  const body: { [key: string]: Json } = {
    model: req.model,
    prompt: req.prompt,
    n: req.n,
    aspect_ratio: req.aspect,
  };
  if (req.resolution !== undefined) body.resolution = req.resolution;
  if (req.quality !== undefined) body.quality = req.quality;
  return postJson(imageUrl(), body, deps).then(readImages);
}

export function editImage(req: EditRequest, deps: HttpDeps): Promise<GeneratedImage[]> {
  assertKey(deps.key);
  assertFetch(deps.fetchImpl);
  validateEditRequest(req);
  const body: { [key: string]: Json } = {
    model: req.model,
    prompt: req.prompt,
    n: req.n,
  };
  if (req.aspect !== undefined) body.aspect_ratio = req.aspect;
  if (req.resolution !== undefined) body.resolution = req.resolution;
  if (req.quality !== undefined) body.quality = req.quality;
  const encoded = req.sources.map((url) => ({ type: "image_url", url }));
  const only = encoded[0];
  if (encoded.length === 1 && only !== undefined) body.image = only;
  else body.images = encoded;
  return postJson(editUrl(), body, deps).then(readImages);
}

/** Read a local png, jpeg, or webp and return a data:image URI. */
export async function fileToDataUri(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const mime = DATA_URI_MIME[ext];
  if (mime === undefined) {
    throw new ImagineHttpError(0, "Imagine image file must be a png, jpeg, or webp.");
  }
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new ImagineHttpError(0, "Imagine image file could not be read.");
  }
  if (!info.isFile()) {
    throw new ImagineHttpError(0, "Imagine image file could not be read.");
  }
  if (info.size <= 0) {
    throw new ImagineHttpError(0, "Imagine image file is empty.");
  }
  if (info.size > FILE_DATA_URI_MAX_BYTES) {
    throw new ImagineHttpError(0, "Imagine image file must be 20 MB or smaller.");
  }
  const bytes = await readFile(filePath);
  if (bytes.byteLength > FILE_DATA_URI_MAX_BYTES) {
    throw new ImagineHttpError(0, "Imagine image file must be 20 MB or smaller.");
  }
  if (!magicMatches(bytes, ext)) {
    throw new ImagineHttpError(0, "Imagine image file must be a png, jpeg, or webp.");
  }
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export function startVideo(req: VideoRequest, deps: HttpDeps): Promise<{ id: string }> {
  assertKey(deps.key);
  assertFetch(deps.fetchImpl);
  validateVideoRequest(req);
  const body: { [key: string]: Json } = {
    model: req.model,
    prompt: req.prompt,
    duration: req.seconds,
    resolution: req.resolution,
  };
  if (req.aspect !== undefined) body.aspect_ratio = req.aspect;
  if (req.image !== undefined) body.image = req.image;
  if (req.referenceImages !== undefined) {
    body.reference_images = req.referenceImages.map((url) => ({ url }));
  }
  if (req.generateAudio !== undefined) body.generate_audio = req.generateAudio;
  return postJson(videoUrl(), body, deps).then(readRequestId);
}

/** Download a temporary asset URL. The API key is not sent. */
export async function fetchBytes(
  url: string,
  deps: HttpDeps,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  assertFetch(deps.fetchImpl);
  assertDownloadUrl(url, deps.key);
  const sleep = deps.sleep ?? defaultSleep;
  let delay: number = HTTP_RETRY_START_MS;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await deps.fetchImpl(url, { method: "GET", redirect: "follow" });
    } catch (error) {
      throw new ImagineHttpError(0, redact(networkMessage(error), deps.key));
    }
    if (!response.ok) {
      await discard(response);
      lastStatus = response.status;
      const retry = response.status === 429 || response.status >= 500;
      if (!retry || attempt === HTTP_RETRIES) {
        throw new ImagineHttpError(lastStatus, `Imagine download failed with status ${lastStatus}.`);
      }
      await sleep(delay);
      delay = Math.min(delay * 2, HTTP_RETRY_MAX_MS);
      continue;
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES) {
      await discard(response);
      throw new ImagineHttpError(200, "Imagine download is too large.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new ImagineHttpError(200, "Imagine download is too large.");
    }
    return { bytes, contentType: response.headers.get("content-type") ?? "" };
  }
  throw new ImagineHttpError(lastStatus, `Imagine download failed with status ${lastStatus}.`);
}

export async function pollVideo(id: string, deps: PollDeps): Promise<{ url: string }> {
  assertKey(deps.key);
  assertFetch(deps.fetchImpl);
  const jobId = assertJobId(id);
  let waited = 0;
  let delay: number = POLL_START_MS;
  for (;;) {
    const view = await readVideoStatus(jobId, deps);
    if (view.state === "done") return { url: view.url };
    if (view.state === "failed" || view.state === "expired") {
      throw new VideoJobError(jobId, `ended ${view.state}.`);
    }
    if (waited >= POLL_CAP_MS || delay > POLL_CAP_MS - waited) {
      throw new VideoPollTimeout(jobId);
    }
    await deps.sleep(delay);
    waited += delay;
    delay = Math.min(delay * 2, POLL_MAX_INTERVAL_MS);
  }
}

export function validateImageRequest(req: ImageRequest): void {
  assertModel(req.model);
  assertPrompt(req.prompt);
  if (!IMAGE_ASPECTS.includes(req.aspect as (typeof IMAGE_ASPECTS)[number])) {
    throw new ImagineHttpError(0, `Imagine aspect "${req.aspect}" is not a listed image ratio.`);
  }
  if (!Number.isInteger(req.n) || req.n < 1 || req.n > 10) {
    throw new ImagineHttpError(0, "Imagine image count must be a whole number from 1 to 10.");
  }
}

export function validateVideoRequest(req: VideoRequest): void {
  assertModel(req.model);
  assertPrompt(req.prompt);
  if (!VIDEO_RESOLUTIONS.includes(req.resolution)) {
    throw new ImagineHttpError(0, "Imagine video resolution must be 480p, 720p, or 1080p.");
  }
  if (!Number.isInteger(req.seconds) || req.seconds < 1 || req.seconds > 15) {
    throw new ImagineHttpError(0, "Imagine video length must be a whole number of seconds from 1 to 15.");
  }
  if (req.aspect !== undefined && !VIDEO_ASPECTS.includes(req.aspect as (typeof VIDEO_ASPECTS)[number])) {
    throw new ImagineHttpError(0, `Imagine aspect "${req.aspect}" is not a listed video ratio.`);
  }
  if (req.image !== undefined && req.referenceImages !== undefined) {
    throw new ImagineHttpError(0, "Imagine video cannot take a first-frame image and reference images together.");
  }
  if (req.image !== undefined) assertImageSource(req.image);
  if (req.referenceImages !== undefined) assertReferenceImages(req.referenceImages);
}

function validateEditRequest(req: EditRequest): void {
  assertModel(req.model);
  assertPrompt(req.prompt);
  assertEditSources(req.sources);
  if (req.aspect !== undefined && !IMAGE_ASPECTS.includes(req.aspect as (typeof IMAGE_ASPECTS)[number])) {
    throw new ImagineHttpError(0, `Imagine aspect "${req.aspect}" is not a listed image ratio.`);
  }
  if (!Number.isInteger(req.n) || req.n < 1 || req.n > 10) {
    throw new ImagineHttpError(0, "Imagine image count must be a whole number from 1 to 10.");
  }
}

function imageUrl(): string {
  return `${IMAGINE_ORIGIN}${IMAGE_GENERATIONS_PATH}`;
}

function editUrl(): string {
  return `${IMAGINE_ORIGIN}${IMAGE_EDITS_PATH}`;
}

function videoUrl(): string {
  return `${IMAGINE_ORIGIN}${VIDEO_GENERATIONS_PATH}`;
}

function videoStatusUrl(id: string): string {
  return `${IMAGINE_ORIGIN}/v1/videos/${id}`;
}

async function postJson(
  url: string,
  body: { [key: string]: Json },
  deps: HttpDeps,
): Promise<unknown> {
  const payload = JSON.stringify(body);
  assertNoKey(url, deps.key);
  assertNoKey(payload, deps.key);
  const response = await send(
    url,
    {
      method: "POST",
      headers: authHeaders(deps.key, true),
      body: payload,
      redirect: "error",
    },
    deps,
  );
  return response;
}

async function readVideoStatus(
  id: string,
  deps: PollDeps,
): Promise<{ state: "pending" } | { state: "done"; url: string } | { state: "failed" | "expired" }> {
  const url = videoStatusUrl(id);
  assertNoKey(url, deps.key);
  const body = await send(
    url,
    {
      method: "GET",
      headers: authHeaders(deps.key, false),
      redirect: "error",
    },
    deps,
  );
  return parseVideoStatus(body);
}

async function send(url: string, init: RequestInit, deps: HttpDeps | PollDeps): Promise<unknown> {
  const sleep = deps.sleep ?? defaultSleep;
  let delay: number = HTTP_RETRY_START_MS;
  let lastStatus = 0;
  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt += 1) {
    let response: Response;
    try {
      response = await deps.fetchImpl(url, init);
    } catch (error) {
      throw new ImagineHttpError(0, redact(networkMessage(error), deps.key));
    }
    if (response.ok) return readJson(response, deps.key);
    await discard(response);
    lastStatus = response.status;
    const retry = response.status === 429 || response.status >= 500;
    if (!retry || attempt === HTTP_RETRIES) {
      throw new ImagineHttpError(lastStatus, `Imagine request failed with status ${lastStatus}.`);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, HTTP_RETRY_MAX_MS);
  }
  throw new ImagineHttpError(lastStatus, `Imagine request failed with status ${lastStatus}.`);
}

async function readJson(response: Response, key: string): Promise<unknown> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    throw new ImagineHttpError(response.status, "Imagine response could not be read.");
  }
  if (text.trim().length === 0) {
    throw new ImagineHttpError(response.status, "Imagine response was empty.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ImagineHttpError(response.status, redact("Imagine response was not JSON.", key));
  }
}

function readImages(body: unknown): GeneratedImage[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new ImagineHttpError(200, "Imagine image response had no data array.");
  }
  if (body.data.length === 0) {
    throw new ImagineHttpError(200, "Imagine image response had no images.");
  }
  const images: GeneratedImage[] = [];
  for (const item of body.data) {
    if (!isRecord(item)) throw new ImagineHttpError(200, "Imagine image response had a bad item.");
    const image: GeneratedImage = {};
    if (typeof item.url === "string" && item.url.length > 0) image.url = item.url;
    const encoded = item.b64_json ?? item.b64;
    if (typeof encoded === "string" && encoded.length > 0) image.b64 = encoded;
    if (image.url === undefined && image.b64 === undefined) {
      throw new ImagineHttpError(200, "Imagine image response had no url or base64.");
    }
    images.push(image);
  }
  return images;
}

function readRequestId(body: unknown): { id: string } {
  if (!isRecord(body) || typeof body.request_id !== "string") {
    throw new ImagineHttpError(200, "Imagine video response had no request id.");
  }
  return { id: assertJobId(body.request_id) };
}

function parseVideoStatus(
  body: unknown,
): { state: "pending" } | { state: "done"; url: string } | { state: "failed" | "expired" } {
  if (!isRecord(body) || typeof body.status !== "string") {
    throw new ImagineHttpError(200, "Imagine video status was missing.");
  }
  if (body.status === "pending") return { state: "pending" };
  if (body.status === "done") {
    const video = body.video;
    if (!isRecord(video) || typeof video.url !== "string" || video.url.length === 0) {
      throw new ImagineHttpError(200, "Imagine video was done without a url.");
    }
    return { state: "done", url: video.url };
  }
  if (body.status === "failed" || body.status === "expired") return { state: body.status };
  throw new ImagineHttpError(200, "Imagine video status was not pending, done, failed, or expired.");
}

function authHeaders(key: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function assertKey(key: string): void {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new ImagineHttpError(0, "Imagine needs an API key.");
  }
  if (/[\r\n]/.test(key)) {
    throw new ImagineHttpError(0, "Imagine needs an API key.");
  }
}

function assertFetch(fetchImpl: typeof fetch): void {
  if (typeof fetchImpl !== "function") {
    throw new ImagineHttpError(0, "Imagine needs an injected fetch.");
  }
}

function assertModel(model: string): void {
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new ImagineHttpError(0, "Imagine model must be text.");
  }
}

function assertPrompt(prompt: string): void {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new ImagineHttpError(0, "Imagine prompt must be text.");
  }
}

function assertImageSource(image: string): void {
  assertRemoteImage(image, "Imagine video image must be an https URL or a data URI.");
}

function assertEditSources(sources: readonly string[]): void {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 5) {
    throw new ImagineHttpError(0, "Imagine edit needs 1 to 5 source images.");
  }
  for (const source of sources) {
    assertRemoteImage(source, "Imagine edit source must be an http(s) URL or a data:image URI.");
  }
}

function assertReferenceImages(images: readonly string[]): void {
  if (!Array.isArray(images) || images.length < 1 || images.length > 5) {
    throw new ImagineHttpError(0, "Imagine video reference images must be 1 to 5.");
  }
  for (const image of images) {
    assertRemoteImage(image, "Imagine video reference image must be an http(s) URL or a data:image URI.");
  }
}

function assertRemoteImage(image: string, message: string): void {
  if (typeof image !== "string" || image.length === 0) {
    throw new ImagineHttpError(0, message);
  }
  if (image.startsWith("data:image/")) return;
  let url: URL;
  try {
    url = new URL(image);
  } catch {
    throw new ImagineHttpError(0, message);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImagineHttpError(0, message);
  }
}

function assertDownloadUrl(value: string, key: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImagineHttpError(0, "Imagine download URL is not usable.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImagineHttpError(0, "Imagine download URL is not usable.");
  }
  assertNoKey(value, key);
}

function assertJobId(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ImagineHttpError(0, "Imagine video job id is not usable.");
  }
  return id;
}

function assertNoKey(value: string, key: string): void {
  if (key.length >= 8 && value.includes(key)) {
    throw new ImagineHttpError(0, "Imagine request must not carry the API key outside the header.");
  }
}

function redact(message: string, key: string): string {
  const cleaned = key.length >= 8 ? message.split(key).join("[redacted]") : message;
  const trimmed = cleaned.trim();
  return trimmed.length > 0 ? trimmed : "Imagine request failed before a response.";
}

function networkMessage(error: unknown): string {
  if (error instanceof ImagineHttpError) throw error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Imagine request failed before a response.";
}

async function discard(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // The body can echo the key or the prompt. Drop it.
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATA_URI_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

type Json = string | number | boolean | Json[] | { [key: string]: Json };

function magicMatches(bytes: Uint8Array, ext: string): boolean {
  if (ext === ".png") return isPng(bytes);
  if (ext === ".jpg" || ext === ".jpeg") return isJpeg(bytes);
  if (ext === ".webp") return isWebp(bytes);
  return false;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
