/**
 * Generate one concept still per planned section.
 * The desk owns this step. A prompt never receives a key.
 * There is no quote, no spend cap, and no confirm.
 * Each file is written before the next section starts.
 * When generation is unavailable, the section gets stock already in
 * the project, or an art-directed composition. Never an empty slot.
 */

import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BUILD_EFFORT, BUILD_MODEL, type SpawnLike } from "@hitchhiker/engine";
import { RealSubjectError } from "./imagine-run.ts";
import { DEFAULT_VARIANT_WIDTHS, variantWidthsForProject } from "./media-budget.ts";
import { createImagineClient, type GeneratedImage, type ImagineClient } from "./imagine-http.ts";
import {
  assetsFile,
  generatedDir,
  loadSlots,
  readAssetTable,
  refusesRealReplacement,
  slotsFile,
  updateAssetRows,
  type AssetRow,
  type AssetSlot,
} from "./slots.ts";

export const RESPONSIVE_WIDTHS = DEFAULT_VARIANT_WIDTHS;
export const SECTION_ATTEMPTS = 3;

const CONCEPT_LABEL = "Concept image, generated with Grok Imagine";
const OPEN_QUESTION =
  "Open question: IPTC DigitalSourceType trainedAlgorithmicMedia is recorded here. The desk has no encoder, so the field is not embedded in the file.";

export interface MediaImageRequest {
  model: string;
  prompt: string;
  aspect: string;
  n: number;
}

export interface MediaVideoRequest {
  model: string;
  prompt: string;
  seconds: number;
  resolution: "480p" | "720p" | "1080p";
  aspect?: string;
  image?: string;
  generateAudio?: boolean;
}

export interface MediaPoll {
  url?: string;
  bytes?: Uint8Array;
}

export class ImagineHandsBack extends Error {
  constructor(message = "Imagine needs you. A captcha, sign-in, or limit stopped the browser. Nothing was generated.") {
    super(message);
    this.name = "ImagineHandsBack";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ImaginePageDriver {
  openImagine?(projectDir: string): Promise<void>;
  submitStill(prompt: string): Promise<{ bytes: Uint8Array } | { handsBack: string }>;
  submitVideo?(prompt: string): Promise<{ bytes: Uint8Array } | { handsBack: string }>;
}

export interface MediaProvider {
  generateImage(req: MediaImageRequest): Promise<GeneratedImage[]>;
  startVideo?(req: MediaVideoRequest): Promise<{ id: string }>;
  pollVideo?(id: string): Promise<MediaPoll>;
}

export interface GenerateSectionResult {
  count: number;
  fallbacks: string[];
}

export interface MediaSettings {
  order: Array<"grok-cli" | "browser" | "api">;
  browser: boolean;
  api: boolean;
}

export interface DeskProviderDeps {
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  key?: string;
  client?: ImagineClient;
  browserDriver?: ImaginePageDriver;
}

interface CreditRow {
  file: string;
  origin: "generated" | "owner" | "stock";
  label: string;
  prompt: string;
  model: string;
  alt: string;
  caption: string;
  digitalSourceType: string;
}

interface PictureRow {
  id: string;
  src: string;
  widths: readonly number[];
  formats: readonly string[];
  sizes: string;
  width: number;
  height: number;
  eager: boolean;
  preload: boolean;
}

const DEFAULT_SETTINGS: MediaSettings = {
  order: ["grok-cli", "browser", "api"],
  browser: false,
  api: false,
};

export function readMediaSettings(projectDir: string): MediaSettings {
  const file = path.join(projectDir, ".hitchhiker", "assets", "media.json");
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return { ...DEFAULT_SETTINGS, order: [...DEFAULT_SETTINGS.order] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...DEFAULT_SETTINGS, order: [...DEFAULT_SETTINGS.order] };
  }
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS, order: [...DEFAULT_SETTINGS.order] };
  const record = raw as Record<string, unknown>;
  const order = readOrder(record.order);
  return {
    order,
    browser: record.browser === true,
    api: record.api === true,
  };
}

const VIDEO_CREDIT = "Concept video, generated with Grok Imagine";

export function grokCliProvider(projectDir: string, run: SpawnLike, env: NodeJS.ProcessEnv = process.env): MediaProvider {
  let serial = 0;
  const safeEnv = deskEnv(env);
  return {
    async generateImage(req) {
      serial += 1;
      const dest = path.join(projectDir, ".hitchhiker", "assets", "cli-out", `${serial}.png`);
      await runCli(projectDir, run, safeEnv, dest, [
        "Use features.image_gen on the existing Grok login and save the still to the path below.",
        "No API key is attached.",
        `Model: ${req.model}`,
        `Aspect ratio: ${req.aspect}`,
        `Count: ${req.n}`,
        `Save the image bytes to ${dest}`,
        "Prompt:",
        req.prompt,
      ]);
      const bytes = await readFile(dest);
      return [{ b64: Buffer.from(bytes).toString("base64") }];
    },
    async startVideo(req) {
      serial += 1;
      const dest = path.join(projectDir, ".hitchhiker", "assets", "cli-out", `${serial}.mp4`);
      const audio = req.generateAudio === true ? "true" : "false";
      await runCli(projectDir, run, safeEnv, dest, [
        "Use features.video_gen on the existing Grok login and save the video to the path below.",
        "No API key is attached.",
        `generate_audio: ${audio}`,
        `Model: ${req.model}`,
        `Seconds: ${req.seconds}`,
        `Resolution: ${req.resolution}`,
        `Save the video bytes to ${dest}`,
        "Prompt:",
        req.prompt,
      ]);
      await readFile(dest);
      return { id: dest };
    },
    async pollVideo(id) {
      return { bytes: await readFile(id) };
    },
  };
}

/** Opt-in browser Imagine. Without a driver it hands control back and generates nothing. */
export function browserHandsBackProvider(projectDir = "", driver?: ImaginePageDriver): MediaProvider {
  if (driver === undefined) {
    return {
      async generateImage() {
        throw new ImagineHandsBack("Browser Imagine is on, and no signed-in session is attached. Nothing was generated.");
      },
    };
  }
  return browserImagineProvider(projectDir, driver);
}

export function browserImagineProvider(projectDir: string, driver: ImaginePageDriver): MediaProvider {
  let lastAt = 0;
  const pace = async (): Promise<void> => {
    const wait = 3000 - (Date.now() - lastAt);
    if (lastAt !== 0 && wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
  };
  return {
    async generateImage(req) {
      await pace();
      if (driver.openImagine !== undefined) await driver.openImagine(projectDir);
      const result = await driver.submitStill(req.prompt);
      if ("handsBack" in result) throw new ImagineHandsBack(result.handsBack);
      const dest = path.join(projectDir, ".hitchhiker", "assets", "browser-out", `${Date.now()}.png`);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, result.bytes);
      return [{ b64: Buffer.from(result.bytes).toString("base64") }];
    },
    async startVideo(req) {
      await pace();
      if (driver.submitVideo === undefined) throw new ImagineHandsBack("Video is not available in this browser session.");
      const result = await driver.submitVideo(req.prompt);
      if ("handsBack" in result) throw new ImagineHandsBack(result.handsBack);
      const dest = path.join(projectDir, ".hitchhiker", "assets", "browser-out", `${Date.now()}.mp4`);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, result.bytes);
      return { id: dest };
    },
    async pollVideo(id) {
      return { bytes: await readFile(id) };
    },
  };
}

export function apiMediaProvider(deps: { key: string; fetchImpl: typeof fetch; client?: ImagineClient }): MediaProvider {
  const client = deps.client ?? createImagineClient();
  const http = { key: deps.key, fetchImpl: deps.fetchImpl };
  return {
    async generateImage(req) {
      return client.generateImage(
        { model: req.model, prompt: req.prompt, aspect: req.aspect, n: req.n },
        http,
      );
    },
    async startVideo(req) {
      return client.startVideo(
        {
          model: req.model,
          prompt: req.prompt,
          seconds: req.seconds,
          resolution: req.resolution,
          ...(req.aspect === undefined ? {} : { aspect: req.aspect }),
          ...(req.image === undefined ? {} : { image: req.image }),
          ...(req.generateAudio === undefined ? {} : { generateAudio: req.generateAudio }),
        },
        http,
      );
    },
    async pollVideo(id) {
      return client.pollVideo(id, { ...http, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
    },
  };
}

export function resolveDeskProvider(projectDir: string, deps: DeskProviderDeps = {}): MediaProvider {
  const settings = readMediaSettings(projectDir);
  const chain: MediaProvider[] = [];
  for (const name of settings.order) {
    if (name === "grok-cli" && deps.spawn !== undefined) {
      chain.push(grokCliProvider(projectDir, deps.spawn, deps.env ?? process.env));
    }
    if (name === "browser" && settings.browser) chain.push(browserHandsBackProvider(projectDir, deps.browserDriver));
    if (name === "api" && settings.api && deps.key !== undefined && deps.key.trim() !== "" && deps.fetchImpl !== undefined) {
      const api: { key: string; fetchImpl: typeof fetch; client?: ImagineClient } = {
        key: deps.key,
        fetchImpl: deps.fetchImpl,
      };
      if (deps.client !== undefined) api.client = deps.client;
      chain.push(apiMediaProvider(api));
    }
  }
  return chainProvider(chain);
}

export async function generateSectionStills(
  projectDir: string,
  provider: MediaProvider,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<GenerateSectionResult> {
  const slots = await readStillSlots(projectDir);
  const assetsMarkdown = await readOptional(assetsFile(projectDir));
  const credits: CreditRow[] = ownerCredits(assetsMarkdown);
  const pictures: PictureRow[] = ownerPictures(projectDir, assetsMarkdown);
  let count = 0;
  const fallbacks: string[] = [];
  const usedStock = new Set<string>();
  for (const slot of slots) {
    if (slot.kind === "video") {
      const video = await tryVideo(projectDir, provider, slot, options.fetchImpl);
      if (video === null) {
        await dropSlot(projectDir, slot.id);
        const note = `Video was unavailable for ${slot.id}. Stills and motion only.`;
        fallbacks.push(note);
        await appendNote(projectDir, note);
        continue;
      }
      count += 1;
      credits.push(generatedCredit(slot, video.rel));
      await updateAssetRows(projectDir, [assetRow(slot.id, "imagine", video.rel, "generated", "done")]);
      await persist(projectDir, credits, pictures, count);
      continue;
    }
    if (slot.kind !== "still") continue;
    if (slot.status === "done" && slot.file !== undefined && slot.file.length > 0) continue;
    if (refusesRealReplacement(slot)) throw new RealSubjectError(slot.id);
    const attempt = await tryGenerate(provider, slot);
    if (attempt.images === null) {
      const fallen = await writeFallback(projectDir, slot, usedStock, attempt.error);
      fallbacks.push(fallen.note);
      credits.push(fallen.credit);
      pictures.push(fallen.picture);
      await persist(projectDir, credits, pictures, count);
      continue;
    }
    const saved = await writeArrival(projectDir, slot, attempt.images, options.fetchImpl);
    count += 1;
    credits.push(generatedCredit(slot, saved.rel));
    pictures.push(pictureFor(projectDir, slot.id, slot.aspect, saved.rel));
    await updateAssetRows(projectDir, [assetRow(slot.id, "imagine", saved.rel, "generated", "done")]);
    await persist(projectDir, credits, pictures, count);
  }
  await persist(projectDir, credits, pictures, count);
  return { count, fallbacks };
}

function chainProvider(chain: readonly MediaProvider[]): MediaProvider {
  let videoOwner: MediaProvider | undefined;
  return {
    async generateImage(req) {
      let last = "No Imagine provider is available.";
      for (const provider of chain) {
        try {
          return await provider.generateImage(req);
        } catch (error) {
          if (error instanceof ImagineHandsBack) throw error;
          last = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : last;
        }
      }
      throw new Error(last);
    },
    async startVideo(req) {
      let last = "No Imagine provider is available.";
      for (const provider of chain) {
        if (provider.startVideo === undefined) continue;
        try {
          const started = await provider.startVideo(req);
          videoOwner = provider;
          return started;
        } catch (error) {
          if (error instanceof ImagineHandsBack) throw error;
          last = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : last;
        }
      }
      throw new Error(last);
    },
    async pollVideo(id) {
      if (videoOwner?.pollVideo === undefined) throw new Error("No Imagine provider is available.");
      return videoOwner.pollVideo(id);
    },
  };
}

function deskEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === "XAI_API_KEY" || key === "OPENAI_API_KEY") continue;
    if (/API_KEY|APIKEY|SECRET|TOKEN|AUTHORIZATION/i.test(key)) continue;
    next[key] = value;
  }
  return next;
}

async function runCli(
  projectDir: string,
  run: SpawnLike,
  env: NodeJS.ProcessEnv,
  dest: string,
  lines: string[],
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const promptFile = dest.replace(/\.(png|mp4)$/i, ".prompt.txt");
  await writeFile(promptFile, lines.join("\n"), "utf8");
  const result = await run({
    command: "grok",
    args: [
      "--no-auto-update",
      "--no-alt-screen",
      "--prompt-file",
      promptFile,
      "-m",
      BUILD_MODEL,
      "--effort",
      BUILD_EFFORT,
      "--cwd",
      projectDir,
    ],
    cwd: projectDir,
    env,
    timeoutMs: 120_000,
  });
  if (result.status !== 0) throw new Error("Grok CLI media generation failed.");
}

async function tryVideo(
  projectDir: string,
  provider: MediaProvider,
  slot: AssetSlot,
  fetchImpl: typeof fetch | undefined,
): Promise<{ rel: string } | null> {
  if (provider.startVideo === undefined || provider.pollVideo === undefined) return null;
  try {
    const started = await provider.startVideo({
      model: slot.model,
      prompt: slot.prompt,
      seconds: slot.seconds ?? 8,
      resolution: slot.resolution ?? "720p",
      aspect: slot.aspect,
      ...(slot.image === undefined ? {} : { image: slot.image }),
      ...(slot.generateAudio === undefined ? {} : { generateAudio: slot.generateAudio }),
    });
    const polled = await provider.pollVideo(started.id);
    const bytes = polled.bytes ?? (polled.url === undefined ? null : await downloadBytes(polled.url, fetchImpl));
    if (bytes === null || bytes.byteLength === 0) return null;
    const rel = `src/assets/generated/${slot.id}.mp4`;
    const abs = path.join(projectDir, ...rel.split("/"));
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    const copy = path.join(generatedDir(projectDir), `${slot.id}.mp4`);
    await mkdir(path.dirname(copy), { recursive: true });
    await writeFile(copy, bytes);
    return { rel };
  } catch (error) {
    if (error instanceof ImagineHandsBack) throw error;
    return null;
  }
}

async function downloadBytes(url: string, fetchImpl: typeof fetch | undefined): Promise<Uint8Array | null> {
  if (fetchImpl === undefined) return null;
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function dropSlot(projectDir: string, id: string): Promise<void> {
  const file = slotsFile(projectDir);
  const raw = JSON.parse(await readFile(file, "utf8")) as { slots?: { id?: string }[] };
  const slots = (raw.slots ?? []).filter((slot) => slot.id !== id);
  await writeFile(file, `${JSON.stringify({ slots }, null, 2)}\n`, "utf8");
}

async function tryGenerate(
  provider: MediaProvider,
  slot: AssetSlot,
): Promise<{ images: GeneratedImage[] | null; error: string }> {
  let last = "Imagine failed.";
  for (let attempt = 1; attempt <= SECTION_ATTEMPTS; attempt += 1) {
    try {
      const images = await provider.generateImage({
        model: slot.model,
        prompt: slot.prompt,
        aspect: slot.aspect,
        n: slot.n,
      });
      if (images.length > 0) return { images, error: "" };
      last = "Imagine image response had no images.";
    } catch (error) {
      if (error instanceof ImagineHandsBack) throw error;
      last = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Imagine failed.";
    }
  }
  return { images: null, error: last };
}

async function writeArrival(
  projectDir: string,
  slot: AssetSlot,
  images: readonly GeneratedImage[],
  fetchImpl: typeof fetch | undefined,
): Promise<{ rel: string }> {
  const image = images[0];
  if (image === undefined) throw new Error("Imagine image response had no images.");
  const bytes = await imageBytes(image, fetchImpl);
  const ext = extensionFor(bytes);
  const rel = `src/assets/generated/${slot.id}${ext}`;
  const abs = path.join(projectDir, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  const copy = path.join(generatedDir(projectDir), `${slot.id}${ext}`);
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(copy, bytes);
  return { rel };
}

async function imageBytes(image: GeneratedImage, fetchImpl: typeof fetch | undefined): Promise<Uint8Array> {
  if (image.b64 !== undefined && image.b64.length > 0) return Buffer.from(image.b64, "base64");
  if (image.url === undefined || fetchImpl === undefined) throw new Error("Imagine image response had no bytes.");
  const response = await fetchImpl(image.url);
  if (!response.ok) throw new Error("Imagine image download failed.");
  return new Uint8Array(await response.arrayBuffer());
}

async function writeFallback(
  projectDir: string,
  slot: AssetSlot,
  usedStock: Set<string>,
  reason: string,
): Promise<{ note: string; credit: CreditRow; picture: PictureRow }> {
  const why = reason.trim() === "" ? "" : `${reason} `;
  const stock = await findStock(projectDir, usedStock);
  if (stock !== null) {
    usedStock.add(stock.file);
    const note = `Generation was unavailable for ${slot.id}. ${why}Used open-license stock already in the project: ${stock.file}.`;
    await appendNote(projectDir, note);
    await updateAssetRows(projectDir, [assetRow(slot.id, "upload", stock.file, "stock", "ready")]);
    return {
      note,
      credit: {
        file: stock.file,
        origin: "stock",
        label: stock.license,
        prompt: "",
        model: "",
        alt: altFor(slot.id),
        caption: captionFor(slot.id),
        digitalSourceType: "",
      },
      picture: pictureFor(projectDir, slot.id, slot.aspect, stock.file),
    };
  }
  const rel = `src/assets/generated/${slot.id}.svg`;
  const abs = path.join(projectDir, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  const svg = compositionSvg(slot);
  await writeFile(abs, svg, "utf8");
  const copy = path.join(generatedDir(projectDir), `${slot.id}.svg`);
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(copy, svg, "utf8");
  const note = `Generation was unavailable for ${slot.id}. ${why}Used an art-directed composition.`;
  await appendNote(projectDir, note);
  await updateAssetRows(projectDir, [assetRow(slot.id, "diy", rel, "generated", "ready")]);
  return { note, credit: generatedCredit(slot, rel), picture: pictureFor(projectDir, slot.id, slot.aspect, rel) };
}

async function findStock(projectDir: string, used: Set<string>): Promise<{ file: string; license: string } | null> {
  const table = readAssetTable(await readOptional(assetsFile(projectDir)));
  for (const row of table) {
    if (!/CC0|CC-BY/i.test(row.license)) continue;
    if (row.file.trim() === "" || used.has(row.file)) continue;
    const abs = path.join(projectDir, ...row.file.split("/"));
    try {
      await readFile(abs);
    } catch {
      continue;
    }
    return { file: row.file, license: row.license };
  }
  return null;
}

function compositionSvg(slot: AssetSlot): string {
  const hero = slot.aspect === "16:9" || slot.aspect === "21:9";
  const width = hero ? 1920 : 1600;
  const height = hero ? (slot.aspect === "21:9" ? 823 : 1080) : 1066;
  const label = slot.id.replace(/[^A-Za-z0-9 -]/g, "");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(altFor(slot.id))}">`,
    `<rect width="${width}" height="${height}" fill="#1c1410"/>`,
    `<rect x="72" y="72" width="${width - 144}" height="${height - 144}" fill="#3d2b22"/>`,
    `<text x="120" y="220" fill="#f4efe6" font-size="64" font-family="Georgia, serif">${escapeXml(label)}</text>`,
    "</svg>",
    "",
  ].join("\n");
}

function generatedCredit(slot: AssetSlot, file: string): CreditRow {
  return {
    file,
    origin: "generated",
    label: slot.kind === "video" ? VIDEO_CREDIT : CONCEPT_LABEL,
    prompt: redact(slot.prompt),
    model: slot.model,
    alt: altFor(slot.id),
    caption: captionFor(slot.id),
    digitalSourceType: OPEN_QUESTION,
  };
}

function ownerCredits(markdown: string): CreditRow[] {
  const rows: CreditRow[] = [];
  for (const row of readAssetTable(markdown)) {
    if (row.license !== "owner") continue;
    rows.push({
      file: row.file,
      origin: "owner",
      label: "Owner image",
      prompt: "",
      model: "",
      alt: altFor(row.slot),
      caption: "Supplied by the owner.",
      digitalSourceType: "",
    });
  }
  return rows;
}

function pictureFor(projectDir: string, id: string, aspect: string, src: string): PictureRow {
  const hero = id === "hero" || id.endsWith("-hero");
  const width = 1920;
  const height = aspect === "21:9" ? 823 : aspect === "16:9" || hero ? 1080 : 1280;
  return {
    id,
    src,
    widths: variantWidthsForProject(projectDir),
    formats: ["avif", "webp"],
    sizes: "(min-width: 80rem) 80rem, 100vw",
    width,
    height: aspect === "3:2" ? 1280 : height,
    eager: hero,
    preload: hero,
  };
}

function ownerPictures(projectDir: string, markdown: string): PictureRow[] {
  const pictures: PictureRow[] = [];
  for (const row of readAssetTable(markdown)) {
    if (row.license !== "owner" || row.file.trim() === "") continue;
    const aspect = row.slot === "hero" || row.slot.endsWith("-hero") ? "16:9" : "3:2";
    pictures.push(pictureFor(projectDir, row.slot, aspect, row.file));
  }
  return pictures;
}

function altFor(sectionId: string): string {
  return `A concept still for the ${sectionId} section.`;
}

function captionFor(sectionId: string): string {
  if (/farm|listing|product|person/i.test(sectionId)) {
    return "This picture is a concept, not a real listing.";
  }
  return "This picture is concept art.";
}

function assetRow(slot: string, source: AssetRow["source"], file: string, license: string, status: string): AssetRow {
  return { slot, source, file, cost: "0", approved: "yes", license, status, grade: "", job: "" };
}

async function persist(projectDir: string, credits: readonly CreditRow[], pictures: readonly PictureRow[], count: number): Promise<void> {
  const data = path.join(projectDir, "src", "data");
  await mkdir(data, { recursive: true });
  await writeFile(path.join(data, "credits.ts"), renderCredits(credits), "utf8");
  await writeFile(path.join(data, "pictures.ts"), renderPictures(pictures), "utf8");
  const countFile = path.join(projectDir, ".hitchhiker", "assets", "generated-count.json");
  await mkdir(path.dirname(countFile), { recursive: true });
  await writeFile(countFile, `${JSON.stringify({ count }, null, 2)}\n`, "utf8");
}

function renderCredits(rows: readonly CreditRow[]): string {
  return `/** Concept and owner images for this site. */\nexport const credits = ${JSON.stringify(rows, null, 2)};\n`;
}

function renderPictures(rows: readonly PictureRow[]): string {
  return [
    "/** Responsive picture manifest. The site pipeline emits AVIF and WebP. */",
    `export const pictures = ${JSON.stringify(rows, null, 2)};`,
    "",
  ].join("\n");
}

async function appendNote(projectDir: string, note: string): Promise<void> {
  const file = path.join(projectDir, ".hitchhiker", "assets", "fallback.md");
  const prior = await readOptional(file);
  const next = `${prior}${redact(note)}\n`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, next, "utf8");
}

async function readStillSlots(projectDir: string): Promise<AssetSlot[]> {
  let text = "";
  try {
    text = await readFile(slotsFile(projectDir), "utf8");
  } catch {
    return [];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { slots?: unknown }).slots)) return [];
  const slots = (raw as { slots: unknown[] }).slots;
  if (slots.length === 0) return [];
  return loadSlots(projectDir);
}

function readOrder(value: unknown): MediaSettings["order"] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.order];
  const allowed = new Set(["grok-cli", "browser", "api"]);
  const order: MediaSettings["order"] = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) continue;
    const name = item as MediaSettings["order"][number];
    if (!order.includes(name)) order.push(name);
  }
  return order.length > 0 ? order : [...DEFAULT_SETTINGS.order];
}

function extensionFor(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ".png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return ".webp";
  return ".png";
}

function redact(text: string): string {
  return text.split("XAI_API_KEY").join("[redacted]").split("hitchhikers-guide").join("[redacted]");
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}
