/**
 * Tripo and Meshy generation.
 *
 * Quote first. If the quote is over the cap, do not ask and do not send.
 * Ask once. A no, or a provider error, records no charge here.
 *
 * Tripo prices are the published v3 card: 1 credit = $0.01.
 * Text with standard texture is 20 credits. Image with standard texture is 30.
 * Docs: https://developers.tripo3d.ai (checked 2026-10-07).
 *
 * Meshy lists credits, not an API pack price. $0.02 per credit is the public
 * Pro plan ($20 for 1000 credits/month) on meshy.ai/pricing, not an official
 * pack rate. Text is preview (20) then refine (10). Image at 2K texture is 30.
 * One yes covers the whole quote. Nothing is posted until that yes.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { KEYCHAIN_SERVICE, type KeychainGet } from "../keychain.ts";

export const TRIPO_USD_PER_CREDIT = 0.01;
export const MESHY_USD_PER_CREDIT = 0.02;

export const TRIPO_TEXT_CREDITS = 20;
export const TRIPO_IMAGE_CREDITS = 30;
export const MESHY_PREVIEW_CREDITS = 20;
export const MESHY_REFINE_CREDITS = 10;
export const MESHY_IMAGE_CREDITS = 30;
export const MESHY_TEXT_CREDITS = MESHY_PREVIEW_CREDITS + MESHY_REFINE_CREDITS;

export const TRIPO_TEXT_USD = TRIPO_TEXT_CREDITS * TRIPO_USD_PER_CREDIT;
export const TRIPO_IMAGE_USD = TRIPO_IMAGE_CREDITS * TRIPO_USD_PER_CREDIT;
export const MESHY_TEXT_USD = MESHY_TEXT_CREDITS * MESHY_USD_PER_CREDIT;
export const MESHY_IMAGE_USD = MESHY_IMAGE_CREDITS * MESHY_USD_PER_CREDIT;

export const TRIPO_TEXT_URL = "https://openapi.tripo3d.ai/v3/generation/text-to-model";
export const TRIPO_IMAGE_URL = "https://openapi.tripo3d.ai/v3/generation/image-to-model";
export const MESHY_IMAGE_URL = "https://api.meshy.ai/openapi/v1/image-to-3d";
export const MESHY_TEXT_URL = "https://api.meshy.ai/openapi/v2/text-to-3d";

const TRIPO_MODEL = "v3.1-20260211";
const MESHY_MODEL = "meshy-7.1";
const FACE_LIMIT = 50_000;
const MESHY_POLYCOUNT = 30_000;
const MAX_POLLS = 8;
const KEYTAR_SPECIFIER = "keytar";

export interface GenerateRequest {
  prompt?: string;
  image?: string;
  provider: "tripo" | "meshy";
}

export interface GenerateDeps {
  confirm: (quote: { usd: number }) => Promise<boolean>;
  cap: number;
  fetchImpl: typeof fetch;
  key: string;
  env?: Record<string, string | undefined>;
  keychain?: KeychainGet | null;
  outDir?: string;
}

export interface GenerationQuote {
  usd: number;
  credits: number;
}

export class GenerationCapError extends Error {
  readonly usd: number;
  readonly cap: number;

  constructor(usd: number, cap: number) {
    super(
      `This generation is $${usd.toFixed(2)}. The cap is $${cap.toFixed(2)}. Nothing was sent, and no charge was recorded.`,
    );
    this.name = "GenerationCapError";
    this.usd = usd;
    this.cap = cap;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GenerationDeclinedError extends Error {
  constructor() {
    super("Generation was not confirmed. Nothing was sent, and no charge was recorded.");
    this.name = "GenerationDeclinedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GenerationFailedError extends Error {
  constructor(message: string) {
    const trimmed = message.trim().replace(/\.$/, "");
    super(`${trimmed}. No charge was recorded.`);
    this.name = "GenerationFailedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function quoteGeneration(req: GenerateRequest): GenerationQuote {
  const image = hasText(req.image);
  if (req.provider === "tripo") {
    return image
      ? { usd: TRIPO_IMAGE_USD, credits: TRIPO_IMAGE_CREDITS }
      : { usd: TRIPO_TEXT_USD, credits: TRIPO_TEXT_CREDITS };
  }
  if (req.provider === "meshy") {
    return image
      ? { usd: MESHY_IMAGE_USD, credits: MESHY_IMAGE_CREDITS }
      : { usd: MESHY_TEXT_USD, credits: MESHY_TEXT_CREDITS };
  }
  throw new GenerationFailedError("Provider must be tripo or meshy.");
}

export function tripoTaskUrl(taskId: string): string {
  return `https://openapi.tripo3d.ai/v3/tasks/${encodeURIComponent(taskId)}`;
}

export function meshyTaskUrl(kind: "image" | "text", taskId: string): string {
  const base = kind === "image" ? MESHY_IMAGE_URL : MESHY_TEXT_URL;
  return `${base}/${encodeURIComponent(taskId)}`;
}

export async function generate3d(
  req: GenerateRequest,
  deps: GenerateDeps,
): Promise<{ file: string; usd: number }> {
  const prompt = optionalText(req.prompt);
  const image = optionalText(req.image);
  if (prompt === null && image === null) {
    throw new GenerationFailedError("A prompt or an image is required. Nothing was sent.");
  }
  if (prompt !== null && prompt.length > 1024) {
    throw new GenerationFailedError("The prompt is longer than 1024 characters. Nothing was sent.");
  }

  const quote = quoteGeneration({ ...req, prompt: prompt ?? undefined, image: image ?? undefined });
  if (!Number.isFinite(deps.cap) || deps.cap < 0) {
    throw new GenerationFailedError("The dollar cap must be a finite number of zero or more.");
  }
  if (toCents(quote.usd) > toCents(deps.cap)) {
    throw new GenerationCapError(quote.usd, deps.cap);
  }

  const key = await resolveKey(req.provider, deps);
  const yes = await deps.confirm({ usd: quote.usd });
  if (!yes) throw new GenerationDeclinedError();

  const file =
    req.provider === "tripo"
      ? await runTripo({ prompt, image, key, fetchImpl: deps.fetchImpl, outDir: deps.outDir })
      : await runMeshy({ prompt, image, key, fetchImpl: deps.fetchImpl, outDir: deps.outDir });
  return { file, usd: quote.usd };
}

async function runTripo(input: JobInput): Promise<string> {
  const url = input.image !== null ? TRIPO_IMAGE_URL : TRIPO_TEXT_URL;
  const body =
    input.image !== null
      ? {
          input: input.image,
          model: TRIPO_MODEL,
          texture: true,
          pbr: true,
          texture_quality: "standard",
          face_limit: FACE_LIMIT,
        }
      : {
          prompt: input.prompt,
          model: TRIPO_MODEL,
          texture: true,
          pbr: true,
          texture_quality: "standard",
          face_limit: FACE_LIMIT,
        };
  const created = await postJson(input, url, body);
  const data = tripoData(created, input.key);
  const taskId = requiredString(data.task_id, "Tripo did not return a task id");
  const done = await poll(input, tripoTaskUrl(taskId), (payload) => {
    const row = tripoData(payload, input.key);
    const status = requiredString(row.status, "Tripo did not return a status");
    if (status === "success") return "done";
    if (status === "failed" || status === "cancelled") return "fail";
    if (status === "queued" || status === "running") return "pending";
    throw new GenerationFailedError(`Tripo status "${scrub(status, input.key)}" is not recognised.`);
  }, (payload) => {
    const row = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const detail = typeof row.error_message === "string" ? row.error_message : "Tripo reported a failed task";
    return scrub(detail, input.key);
  });
  const output = tripoData(done, input.key).output;
  if (!isRecord(output) || typeof output.model_url !== "string" || output.model_url.length === 0) {
    throw new GenerationFailedError("Tripo finished without a model URL.");
  }
  const bytes = await getModelBytes(input.fetchImpl, output.model_url, input.key);
  return writeGlb(input.outDir, `tripo-${safeToken(taskId)}`, bytes);
}

async function runMeshy(input: JobInput): Promise<string> {
  if (input.image !== null) {
    const created = await postJson(input, MESHY_IMAGE_URL, {
      image_url: input.image,
      ai_model: MESHY_MODEL,
      should_texture: true,
      texture_resolution: "2k",
      enable_pbr: true,
      should_remesh: true,
      topology: "triangle",
      target_polycount: MESHY_POLYCOUNT,
      target_formats: ["glb"],
    });
    const taskId = meshyId(created, input.key);
    const done = await pollMeshy(input, "image", taskId, "Meshy image generation failed");
    return saveMeshyGlb(input, "image", taskId, done);
  }

  if (input.prompt === null) {
    throw new GenerationFailedError("A prompt is required for Meshy text. Nothing was sent.");
  }
  const preview = await postJson(input, MESHY_TEXT_URL, {
    mode: "preview",
    prompt: input.prompt,
    ai_model: MESHY_MODEL,
    should_remesh: true,
    topology: "triangle",
    target_polycount: MESHY_POLYCOUNT,
  });
  const previewId = meshyId(preview, input.key);
  await pollMeshy(input, "text", previewId, "Meshy preview failed. Check the Meshy account if a preview credit was used");
  const refined = await postJson(input, MESHY_TEXT_URL, {
    mode: "refine",
    preview_task_id: previewId,
    enable_pbr: true,
    target_formats: ["glb"],
  });
  const refineId = meshyId(refined, input.key);
  const done = await pollMeshy(
    input,
    "text",
    refineId,
    "Meshy refine failed after the preview was submitted. Check the Meshy account",
  );
  return saveMeshyGlb(input, "text", refineId, done);
}

async function saveMeshyGlb(
  input: JobInput,
  kind: "image" | "text",
  taskId: string,
  body: unknown,
): Promise<string> {
  const glbUrl = meshyGlbUrl(body);
  if (glbUrl === null) throw new GenerationFailedError("Meshy finished without a GLB URL.");
  const bytes = await getModelBytes(input.fetchImpl, glbUrl, input.key);
  return writeGlb(input.outDir, `meshy-${kind}-${safeToken(taskId)}`, bytes);
}

async function pollMeshy(input: JobInput, kind: "image" | "text", taskId: string, failPrefix: string): Promise<unknown> {
  return poll(input, meshyTaskUrl(kind, taskId), (payload) => {
    const status = meshyStatus(payload);
    if (status === "SUCCEEDED") return "done";
    if (status === "FAILED" || status === "CANCELED") return "fail";
    if (status === "PENDING" || status === "IN_PROGRESS") return "pending";
    throw new GenerationFailedError(`Meshy status "${scrub(status, input.key)}" is not recognised.`);
  }, (payload) => {
    const detail = meshyError(payload);
    return `${failPrefix}. ${detail}`;
  });
}

type PollState = "pending" | "done" | "fail";

interface JobInput {
  prompt: string | null;
  image: string | null;
  key: string;
  fetchImpl: typeof fetch;
  outDir: string | undefined;
}

async function poll(
  input: JobInput,
  url: string,
  classify: (body: unknown) => PollState,
  failMessage: (body: unknown) => string,
): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const body = await getJson(input, url);
    const state = classify(body);
    if (state === "done") return body;
    if (state === "fail") throw new GenerationFailedError(failMessage(body));
    await delay(20);
  }
  throw new GenerationFailedError("The provider did not finish in time.");
}

async function postJson(input: JobInput, url: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetchImpl(url, {
      method: "POST",
      headers: authHeaders(input.key),
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new GenerationFailedError(scrub(errorText(error), input.key));
  }
  return readBody(response, input.key);
}

async function getJson(input: JobInput, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetchImpl(url, { headers: authHeaders(input.key) });
  } catch (error) {
    throw new GenerationFailedError(scrub(errorText(error), input.key));
  }
  return readBody(response, input.key);
}

async function readBody(response: Response, key: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new GenerationFailedError(`Provider HTTP ${response.status}. ${clip(scrub(text, key))}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GenerationFailedError("The provider returned a response that was not JSON.");
  }
}

async function getModelBytes(fetchImpl: typeof fetch, url: string, key: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new GenerationFailedError(scrub(errorText(error), key));
  }
  if (!response.ok) {
    throw new GenerationFailedError(`Model download failed with HTTP ${response.status}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 12 || bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
    throw new GenerationFailedError("The provider file is not a GLB.");
  }
  return bytes;
}

async function writeGlb(outDir: string | undefined, name: string, bytes: Uint8Array): Promise<string> {
  const dir = outDir ?? path.join(os.tmpdir(), "hitchhiker-3d");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.glb`);
  await writeFile(file, bytes);
  return file;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function tripoData(body: unknown, key: string): Record<string, unknown> {
  if (!isRecord(body)) throw new GenerationFailedError("Tripo returned a response that was not an object.");
  if (body.code !== 0) {
    const message = typeof body.message === "string" ? body.message : `Tripo code ${String(body.code)}`;
    throw new GenerationFailedError(scrub(message, key));
  }
  if (!isRecord(body.data)) throw new GenerationFailedError("Tripo returned no task.");
  return body.data;
}

function meshyId(body: unknown, key: string): string {
  if (!isRecord(body)) throw new GenerationFailedError("Meshy returned a response that was not an object.");
  if (typeof body.result === "string" && body.result.trim().length > 0) return body.result.trim();
  throw new GenerationFailedError(scrub("Meshy did not return a task id.", key));
}

function meshyStatus(body: unknown): string {
  if (!isRecord(body) || typeof body.status !== "string") {
    throw new GenerationFailedError("Meshy did not return a status.");
  }
  return body.status;
}

function meshyGlbUrl(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.model_urls)) return null;
  const glb = body.model_urls.glb;
  return typeof glb === "string" && glb.length > 0 ? glb : null;
}

function meshyError(body: unknown): string {
  if (!isRecord(body)) return "Meshy reported a failed task.";
  if (isRecord(body.task_error) && typeof body.task_error.message === "string") {
    return body.task_error.message;
  }
  return "Meshy reported a failed task.";
}

async function resolveKey(provider: "tripo" | "meshy", deps: GenerateDeps): Promise<string> {
  const direct = cleanSecret(deps.key);
  if (direct !== null) return direct;
  const env = deps.env ?? process.env;
  const envName = provider === "tripo" ? "TRIPO_API_KEY" : "MESHY_API_KEY";
  const fromEnv = cleanSecret(env[envName]);
  if (fromEnv !== null) return fromEnv;
  if (deps.keychain !== null) {
    const chain = deps.keychain ?? (await loadOptionalKeytar());
    if (chain !== null) {
      const stored = cleanSecret(await chain.getPassword(KEYCHAIN_SERVICE, provider));
      if (stored !== null) return stored;
    }
  }
  const hint =
    provider === "tripo"
      ? "No Tripo API key. Set TRIPO_API_KEY, or store it in the OS keychain under service hitchhikers-guide and account tripo. A key is not read from a project file."
      : "No Meshy API key. Set MESHY_API_KEY, or store it in the OS keychain under service hitchhikers-guide and account meshy. A key is not read from a project file.";
  throw new GenerationFailedError(hint);
}

function cleanSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\r\n]/.test(value)) {
    throw new GenerationFailedError("The API key contains a line break. Nothing was sent.");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadOptionalKeytar(): Promise<KeychainGet | null> {
  try {
    const require = createRequire(import.meta.url);
    const loaded: unknown = require(KEYTAR_SPECIFIER);
    if (!isRecord(loaded)) return null;
    const source = isRecord(loaded.default) ? loaded.default : loaded;
    const getPassword = source.getPassword;
    if (typeof getPassword !== "function") return null;
    return {
      getPassword: (service: string, account: string) =>
        Promise.resolve(getPassword.call(source, service, account)).then((value: unknown) =>
          typeof value === "string" ? value : null,
        ),
    };
  } catch {
    return null;
  }
}

function optionalText(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasText(value: string | undefined): boolean {
  return optionalText(value) !== null;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GenerationFailedError(message);
  }
  return value.trim();
}

function toCents(usd: number): number {
  return Math.round(usd * 100);
}

function safeToken(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "model";
}

function scrub(text: string, key: string): string {
  if (key.length === 0) return text;
  return text.split(key).join("[redacted]");
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 180)}...` : flat;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The provider request failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}