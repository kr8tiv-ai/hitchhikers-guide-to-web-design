/**
 * Motion reference clips and approximate section bands.
 * Parsing and the Imagine call live here. comps.ts owns comps.json.
 * This file does not import comps.ts.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SpawnLike } from "../ai/grok-cli.ts";
import { loadConfig, type MotionVideoModel, type MotionVideoResolution } from "../config.ts";
import { cropPngBand } from "../mood/analyze.ts";
import { packagedModule } from "../packaged-dir.ts";
import { parseSignatureMoments } from "./design-md-lint.ts";
import { parseMotionConstitution } from "./motion-constitution.ts";
import { slugify } from "./reference-shots.ts";
import { sectionHostsMoment } from "./signature-moments.ts";

/** Tall desktop viewport. Used when a long sketch has no readable PNG height. */
const LONG_COMP_HEIGHT = 2880;

const SECTION_ID = /^[a-z0-9-]+$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LED_PREFIX = /^(?:[-*]\s+)?motion-led\s*:\s*(.+?)\s*$/i;
const LED_SUFFIX = /^(?:[-*]\s+)?(.+?)\s*:\s*motion-led\b/i;
const ASSIGNMENT =
  /^(?:[-*]\s+)?(\S+)\s+on\s+(\S+)\s+\(page\s+([^,]+),\s*kind\s+([^,]+),\s*taxonomy\s+([^)]+)\):\s*([a-z0-9-]+)\./i;

export interface SectionBand {
  y: number;
  height: number;
  approximate: boolean;
}

export interface MotionVideoRequest {
  model: string;
  prompt: string;
  seconds: number;
  resolution: MotionVideoResolution;
  aspect: "16:9";
  referenceImages: readonly string[];
  generateAudio: false;
}

export interface MotionVideoProvider {
  startVideo(req: MotionVideoRequest): Promise<{ id: string }>;
  pollVideo(id: string): Promise<{ url?: string; bytes?: Uint8Array }>;
}

export interface MotionImagineClient {
  startVideo(
    req: MotionVideoRequest,
    deps: { key: string; fetchImpl: typeof fetch },
  ): Promise<{ id: string }>;
  pollVideo(
    id: string,
    deps: { key: string; fetchImpl: typeof fetch; sleep?: (ms: number) => Promise<void> },
  ): Promise<{ url?: string; bytes?: Uint8Array }>;
}

export interface MotionRefDeps {
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  key?: string;
  fetchImpl?: typeof fetch;
  client?: MotionImagineClient;
  provider?: MotionVideoProvider;
  /** Quote and record spend. An injected provider stays off the ledger unless this is set. */
  billed?: boolean;
}

export interface MotionSectionRef {
  id: string;
  title: string;
}

export interface MotionPageRef {
  route: string;
  slug: string;
}

interface AssignmentRow {
  id: string;
  element: string;
  page: string;
  kind: string;
  library: string;
}

interface AssetVideoModule {
  grokCliProvider(
    projectDir: string,
    run: SpawnLike,
    env?: NodeJS.ProcessEnv,
  ): MotionVideoProvider;
  apiMediaProvider(deps: {
    key: string;
    fetchImpl: typeof fetch;
    client?: MotionImagineClient;
  }): MotionVideoProvider;
  readMediaSettings(projectDir: string): { order: readonly string[]; api: boolean };
}

interface HttpModule {
  fileToDataUri(filePath: string): Promise<string>;
  fetchBytes(
    url: string,
    deps: { key: string; fetchImpl: typeof fetch },
  ): Promise<{ bytes: Uint8Array; contentType: string }>;
  createImagineClient(): MotionImagineClient;
}

interface PriceModule {
  quoteJob(job: {
    kind: "video";
    model: MotionVideoModel;
    resolution: MotionVideoResolution;
    seconds: number;
    prompt: string;
  }): { usd: number; line: string };
  assertFits(quoted: { usd: number; line: string }, remainingUsd: number): void;
}

interface SpendModule {
  readSpend(projectDir: string): Promise<{ spentUsd: number }>;
  recordSpend(
    projectDir: string,
    entry: { slot: string; usd: number; at: string; jobId?: string },
    totalUsd: number,
  ): Promise<number>;
}

export function isSafeSectionId(id: string): boolean {
  return SECTION_ID.test(id);
}

/** Sitemap titles become the same section ids draftComps stores. */
export function sectionPlan(titles: readonly string[]): string[] {
  const ids: string[] = [];
  for (const title of titles) {
    const base = slugify(title) || "section";
    let id = base;
    let n = 2;
    while (ids.includes(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    ids.push(id);
  }
  return ids;
}

export function isMotionLed(
  section: MotionSectionRef,
  page: MotionPageRef,
  designMd: string,
  motionMd: string,
): boolean {
  if (explicitMotionLed(designMd, section) || explicitMotionLed(motionMd, section)) return true;
  if (parseSignatureMoments(designMd).some((moment) => hosts(section, moment.section))) return true;
  return parseAssignments(motionMd).some(
    (row) => !isScrollOwner(row) && pageMatches(row.page, page) && assignmentMatches(section, row),
  );
}

export function choreographyFor(
  section: MotionSectionRef,
  page: MotionPageRef,
  designMd: string,
  motionMd: string,
): { recipe: string; kind: string } {
  let recipe = "";
  for (const moment of parseSignatureMoments(designMd)) {
    if (!hosts(section, moment.section)) continue;
    recipe = moment.recipe;
    break;
  }
  let kind = "";
  for (const row of parseAssignments(motionMd)) {
    if (isScrollOwner(row) || !pageMatches(row.page, page) || !assignmentMatches(section, row)) continue;
    kind = row.kind;
    break;
  }
  return { recipe, kind };
}

export function easingFeel(designMd: string): string {
  const first = parseMotionConstitution(designMd)?.easings[0];
  if (first === undefined) return "a smooth settle";
  const value = first.value.trim();
  if (value === "" || value.toLowerCase() === "none") return "a smooth settle";
  return `${first.name} ${value}`;
}

/**
 * Camera and scroll only. The section title stays out so the clip is not asked to draw words.
 */
export function buildMotionClipPrompt(input: {
  index: number;
  count: number;
  recipe: string;
  kind: string;
  easing: string;
}): string {
  const band = input.index + 1;
  const arrival = input.index === 0 ? "It is the first band." : "It arrives after the bands above it.";
  const lines = [
    "Silent motion reference for one section band of the approved sketch. Camera and scroll only.",
    "",
    `Direction: ${directionPhrase(input.recipe, input.kind)}`,
    `Pin: ${pinPhrase(input.recipe, input.kind)}`,
    `Parallax: ${parallaxPhrase(input.recipe, input.kind)}`,
    `Reveal order: band ${band} of ${input.count}. ${arrival}`,
    `Easing feel: ${input.easing}`,
    "No readable text. No letters, no words, and no numbers.",
  ];
  return `${lines.join("\n")}\n`;
}

export function evenBands(height: number, count: number): Array<{ y: number; height: number }> {
  if (!Number.isInteger(count) || count < 1) return [];
  const safeHeight = Number.isInteger(height) && height > 0 ? height : 0;
  const base = Math.floor(safeHeight / count);
  const extra = safeHeight % count;
  const bands: Array<{ y: number; height: number }> = [];
  let y = 0;
  for (let index = 0; index < count; index += 1) {
    const bandHeight = base + (index < extra ? 1 : 0);
    bands.push({ y, height: bandHeight });
    y += bandHeight;
  }
  return bands;
}

/**
 * Even slices of a long sketch. Every band is approximate: the file does not store real section edges.
 * A picture that cannot be decoded still returns the band list and no crop bytes.
 */
export function sliceLongComp(bytes: Buffer, count: number): { bands: SectionBand[]; crops: Buffer[] | null } {
  const size = pngSize(bytes);
  const height = size?.height ?? LONG_COMP_HEIGHT;
  const bands = evenBands(height, count).map((band) => ({ y: band.y, height: band.height, approximate: true }));
  if (size === null) return { bands, crops: null };
  const crops: Buffer[] = [];
  try {
    for (const band of bands) {
      if (band.height < 1) continue;
      crops.push(cropPngBand(bytes, band.y, band.height));
    }
  } catch {
    return { bands, crops: null };
  }
  return { bands, crops };
}

export async function openMotionProvider(
  projectDir: string,
  deps: MotionRefDeps,
): Promise<{ provider: MotionVideoProvider; billed: boolean }> {
  if (deps.provider !== undefined) {
    return { provider: deps.provider, billed: deps.billed === true };
  }
  if (deps.spawn !== undefined) {
    const assets = await loadAssets<AssetVideoModule>("src/section-generate.ts");
    return { provider: assets.grokCliProvider(projectDir, deps.spawn, deps.env ?? process.env), billed: false };
  }
  const assets = await loadAssets<AssetVideoModule>("src/section-generate.ts");
  const settings = assets.readMediaSettings(projectDir);
  const key = deps.key?.trim() ?? "";
  if (settings.api && settings.order.includes("api") && key !== "" && deps.fetchImpl !== undefined) {
    const http = await loadAssets<HttpModule>("src/imagine-http.ts");
    const raw = deps.client ?? http.createImagineClient();
    const fetchImpl = deps.fetchImpl;
    const client = wrapApiClient(projectDir, raw, (file) => http.fileToDataUri(file));
    return {
      provider: assets.apiMediaProvider({ key, fetchImpl, client }),
      billed: true,
    };
  }
  throw new Error("No Imagine provider is available.");
}

export async function motionQuoteFits(
  projectDir: string,
  req: { model: MotionVideoModel; resolution: MotionVideoResolution; seconds: number; prompt: string },
): Promise<{ ok: true; usd: number } | { ok: false; note: string }> {
  try {
    const prices = await loadAssets<PriceModule>("src/prices.ts");
    const spend = await loadAssets<SpendModule>("src/imagine-run.ts");
    const quote = prices.quoteJob({
      kind: "video",
      model: req.model,
      resolution: req.resolution,
      seconds: req.seconds,
      prompt: req.prompt,
    });
    const ledger = await spend.readSpend(projectDir);
    const budgetCents = Math.round(loadConfig(projectDir).imagineBudgetUsd * 100);
    const spentCents = Math.round(ledger.spentUsd * 100);
    const remaining = Math.max(0, budgetCents - spentCents) / 100;
    prices.assertFits(quote, remaining);
    return { ok: true, usd: quote.usd };
  } catch (error) {
    const note = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Imagine quote failed.";
    return { ok: false, note };
  }
}

export async function recordMotionSpend(
  projectDir: string,
  slot: string,
  usd: number,
  jobId: string,
): Promise<void> {
  const spend = await loadAssets<SpendModule>("src/imagine-run.ts");
  const ledger = await spend.readSpend(projectDir);
  const next = (Math.round(ledger.spentUsd * 100) + Math.round(usd * 100)) / 100;
  const entry: { slot: string; usd: number; at: string; jobId?: string } = {
    slot: motionSlotId(slot),
    usd,
    at: new Date().toISOString(),
  };
  if (jobId !== "") entry.jobId = jobId;
  await spend.recordSpend(projectDir, entry, next);
}

export async function motionVideoBytes(
  polled: { url?: string; bytes?: Uint8Array },
  fetchImpl: typeof fetch | undefined,
  key: string | undefined,
): Promise<Uint8Array | null> {
  if (polled.bytes !== undefined && polled.bytes.byteLength > 0) return polled.bytes;
  if (polled.url === undefined || polled.url.trim() === "" || fetchImpl === undefined) {
    return polled.bytes ?? null;
  }
  const http = await loadAssets<HttpModule>("src/imagine-http.ts");
  const downloaded = await http.fetchBytes(polled.url, { key: key ?? "", fetchImpl });
  return downloaded.bytes;
}

export function redactMotionKey(message: string, key: string | undefined): string {
  const secret = key?.trim() ?? "";
  if (secret.length < 8) return message;
  const cleaned = message.split(secret).join("[redacted]").trim();
  return cleaned === "" ? "Motion draft failed." : cleaned;
}

function motionSlotId(slot: string): string {
  const raw = slot.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return raw === "" ? "motion" : raw;
}

function wrapApiClient(
  projectDir: string,
  client: MotionImagineClient,
  toDataUri: (file: string) => Promise<string>,
): MotionImagineClient {
  return {
    async startVideo(req, http) {
      const referenceImages: string[] = [];
      for (const source of req.referenceImages) {
        referenceImages.push(await referenceToUri(projectDir, source, toDataUri));
      }
      return client.startVideo({ ...req, referenceImages, generateAudio: false }, http);
    },
    pollVideo(id, http) {
      return client.pollVideo(id, http);
    },
  };
}

async function referenceToUri(
  projectDir: string,
  source: string,
  toDataUri: (file: string) => Promise<string>,
): Promise<string> {
  if (source.startsWith("data:image/") || /^https?:\/\//i.test(source)) return source;
  return toDataUri(path.resolve(projectDir, source));
}

async function loadAssets<T>(rel: string): Promise<T> {
  const href = pathToFileURL(packagedModule("assets", rel)).href;
  return (await import(href)) as T;
}

function explicitMotionLed(markdown: string, section: MotionSectionRef): boolean {
  return explicitNames(markdown).some((name) => nameMatches(section, name));
}

function explicitNames(markdown: string): string[] {
  const names: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const prefix = LED_PREFIX.exec(line);
    if (prefix?.[1] !== undefined) {
      names.push(cleanName(prefix[1]));
      continue;
    }
    const suffix = LED_SUFFIX.exec(line);
    if (suffix?.[1] !== undefined) names.push(cleanName(suffix[1]));
  }
  return names;
}

function cleanName(value: string): string {
  return value.replace(/\.\s*$/, "").trim();
}

function nameMatches(section: MotionSectionRef, name: string): boolean {
  const text = name.trim().toLowerCase();
  if (text === "") return false;
  if (text === section.title.trim().toLowerCase()) return true;
  if (text === section.id) return true;
  const slug = slugify(name);
  return slug !== "" && slug === section.id;
}

function hosts(section: MotionSectionRef, mark: string): boolean {
  if (sectionHostsMoment(section.id, mark)) return true;
  if (sectionHostsMoment(section.title, mark)) return true;
  const slug = slugify(mark);
  if (slug !== "" && slug === section.id) return true;
  const text = mark.trim().toLowerCase();
  if (text === "") return false;
  if (text === section.title.trim().toLowerCase()) return true;
  return text === section.id;
}

function parseAssignments(markdown: string): AssignmentRow[] {
  const rows: AssignmentRow[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const match = ASSIGNMENT.exec(raw.trim());
    if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) continue;
    if (match[4] === undefined || match[6] === undefined) continue;
    rows.push({
      id: match[1],
      element: match[2],
      page: match[3].trim(),
      kind: match[4].trim(),
      library: match[6].trim(),
    });
  }
  return rows;
}

function isScrollOwner(row: AssignmentRow): boolean {
  const library = row.library.toLowerCase();
  const element = row.element.toLowerCase();
  const kind = row.kind.toLowerCase();
  if (library === "lenis" || library === "css-scroll") return true;
  if (element === "documentelement" || element === "page-scroll") return true;
  if (kind === "smooth-scroll" || kind === "css-scroll") return true;
  return false;
}

function pageMatches(token: string, page: MotionPageRef): boolean {
  const text = token.trim().toLowerCase();
  const route = normalizeRoute(page.route).toLowerCase();
  if (text === route) return true;
  if (text === page.slug.toLowerCase()) return true;
  const bare = route.replace(/^\//, "");
  if (bare !== "" && text === bare) return true;
  return (text === "home" || text === "/") && route === "/";
}

function assignmentMatches(section: MotionSectionRef, row: AssignmentRow): boolean {
  return nameMatches(section, row.element) || nameMatches(section, row.id);
}

function directionPhrase(recipe: string, kind: string): string {
  const recipeText = recipe.toLowerCase();
  const kindText = kind.toLowerCase();
  if (recipeText === "horizontaltrack" || kindText.includes("horizontal")) return "sideways along this band.";
  if (
    recipeText === "scrollcamera" ||
    recipeText === "framesequence" ||
    kindText.includes("3d") ||
    kindText.includes("camera")
  ) {
    return "the camera moves down through this band.";
  }
  return "scroll down through this band.";
}

function pinPhrase(recipe: string, kind: string): string {
  const recipeText = recipe.toLowerCase();
  const kindText = kind.toLowerCase();
  if (recipeText === "pinnedtimeline" || recipeText === "snaptolabels" || kindText.includes("pin")) {
    return "hold. This band stays in place while the camera moves through it.";
  }
  return "none. The band keeps moving with the scroll.";
}

function parallaxPhrase(recipe: string, kind: string): string {
  if (recipe.toLowerCase() === "parallaxlayers" || kind.toLowerCase().includes("parallax")) {
    return "layers drift at different speeds.";
  }
  return "none. The layers move together.";
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || height < 1 || width > 20000 || height > 20000) return null;
  return { width, height };
}

function normalizeRoute(route: string): string {
  let value = route.trim();
  if (value === "") return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}
