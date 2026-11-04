/**
 * One text-free render per primary page, approved before site prompts.
 * Drafting waits for .hitchhiker/design-lock.json (245a writes that on
 * style-guide approval and then calls onDesignLocked). The paid API
 * provider is never constructed here. A missing runner does nothing.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packagedModule } from "../packaged-dir.ts";
import { DESIGN_LOCK_REL, designLockMatches } from "./design-lock.ts";
import { ownerPhotoFiles, refreshReferenceReadme, sha256File } from "./reference-shots.ts";

export { DESIGN_LOCK_REL, designLockMatches };
export const RENDERS_REL = ".hitchhiker/renders.json";

const RENDER_MODEL = "grok-imagine-image";

export interface PrimaryPage {
  title: string;
  route: string;
  sections: string[];
  group: "primary" | "footer";
}

export interface RenderApproval {
  route: string;
  file: string;
  sha256: string;
  approvedAt: string;
}

export interface WaitingPage {
  title: string;
  route: string;
  file: string;
}

interface SpawnRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

interface SpawnOutput {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode: string | null;
}

type SpawnLike = (request: SpawnRequest) => Promise<SpawnOutput>;

export interface DraftRenderDeps {
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  browserDriver?: { submitStill(prompt: string): Promise<{ bytes: Uint8Array } | { handsBack: string }> };
  /** Accepted and ignored. Page renders never attach the billed API provider. */
  key?: string;
  client?: { generateImage(...args: unknown[]): Promise<unknown> };
  fetchImpl?: typeof fetch;
}

interface DeskImage {
  b64?: string;
  url?: string;
}

interface DeskProvider {
  generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<DeskImage[]>;
}

interface DeskModule {
  resolveDeskProvider(
    projectDir: string,
    deps: {
      spawn?: SpawnLike;
      env?: NodeJS.ProcessEnv;
      browserDriver?: DraftRenderDeps["browserDriver"];
    },
  ): DeskProvider;
}

type RenderRunner = (projectDir: string) => Promise<void>;

const runners = new Map<string, RenderRunner>();
const inflight = new Set<string>();
const again = new Set<string>();

export class RenderApprovalError extends Error {
  readonly waiting: WaitingPage[];

  constructor(waiting: readonly WaitingPage[]) {
    const pages = waiting.map((page) => ({ title: page.title, route: page.route, file: page.file }));
    super(renderApprovalMessage(pages));
    this.name = "RenderApprovalError";
    this.waiting = pages;
  }
}

export function renderApprovalMessage(waiting: readonly WaitingPage[]): string {
  const names = waiting.map((page) => `${page.title} (${page.route})`).join(", ");
  return `These primary pages still need an approved render: ${names}.`;
}

export function setPageRenderRunner(projectDir: string, runner: RenderRunner | null): void {
  const key = path.resolve(projectDir);
  if (runner === null) runners.delete(key);
  else runners.set(key, runner);
}

export function clearPageRenderRunner(projectDir?: string): void {
  if (projectDir === undefined) {
    runners.clear();
    return;
  }
  runners.delete(path.resolve(projectDir));
}

/** Returns before the draft finishes. A second call during a draft runs once after. */
export function schedulePageRenders(projectDir: string): void {
  const key = path.resolve(projectDir);
  if (runners.get(key) === undefined) return;
  if (inflight.has(key)) {
    again.add(key);
    return;
  }
  inflight.add(key);
  const job = Promise.resolve().then(() => runRender(key));
  void job.finally(() => {
    inflight.delete(key);
    if (again.delete(key)) schedulePageRenders(key);
  });
}

async function runRender(key: string): Promise<void> {
  const runner = runners.get(key);
  if (runner === undefined) return;
  try {
    await runner(key);
  } catch (error) {
    const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Render draft failed.";
    recordRenderNotes(key, [message]);
  }
}

/**
 * 245a calls this after it writes the design lock. A style-guide approval
 * also calls it when the lock is already on disk. No lock, or no runner, does nothing.
 */
export function onDesignLocked(projectDir: string): void {
  if (!designLockMatches(projectDir)) return;
  schedulePageRenders(projectDir);
}

export function listPrimaryPages(projectDir: string): PrimaryPage[] {
  return parseSitemap(readOptional(path.join(projectDir, ".hitchhiker", "sitemap.md"))).filter(
    (page) => page.group === "primary",
  );
}

export function renderRelForRoute(route: string): string {
  const normalized = normalizeRoute(route);
  if (normalized === "/") return "reference/renders/home.png";
  const slug = normalized
    .replace(/^\/+/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `reference/renders/${slug === "" ? "page" : slug}.png`;
}

export function buildRenderPrompt(projectDir: string, route: string | PrimaryPage = "/"): string {
  const page =
    typeof route === "string"
      ? (listPrimaryPages(projectDir).find((item) => sameRoute(item.route, route)) ?? {
          title: "",
          route: normalizeRoute(route),
          sections: [],
          group: "primary" as const,
        })
      : route;
  const design = readOptional(path.join(projectDir, "DESIGN.md"));
  const colours = colourTokens(design);
  const photos = ownerPhotoFiles(projectDir);
  const shots = styleShots(projectDir);
  const lines = [
    "Text-free page render. No letters, no words, no numbers, and no baked-in copy.",
    "",
    `Brand idea: ${sectionLine(design, "Brand idea", "not set")}`,
    "",
    `Type pair: ${typePair(design)}`,
    "",
    `Colours: ${colours.length === 0 ? "not set" : colours.map((token) => `${token.name} ${token.value}`).join(", ")}`,
    "",
    `Image direction: ${sectionLine(design, "Image direction", "not set")}`,
    "",
    `Signature effect: ${signatureEffect(design)}`,
    "",
    `Page sections: ${page.sections.length === 0 ? "none listed" : page.sections.join(", ")}`,
    "",
    "Style references:",
  ];
  if (shots.length === 0) lines.push("none captured yet.");
  else for (const shot of shots) lines.push(`- ${shot}`);
  lines.push("");
  if (photos.length === 0) {
    lines.push("Owner photos: none yet. Do not use the logo file as a photo.");
  } else {
    lines.push("Owner photos: compose the page with these owner photographs. Do not use the logo file as a photo.");
    for (const photo of photos) lines.push(`- ${photo}`);
  }
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function draftKeyPageRenders(projectDir: string, deps: DraftRenderDeps = {}): Promise<string[]> {
  if (!designLockMatches(projectDir)) return [];
  refreshReferenceReadme(projectDir);
  const written: string[] = [];
  const notes: string[] = [];
  let provider: DeskProvider | null = null;
  for (const page of listPrimaryPages(projectDir)) {
    const rel = renderRelForRoute(page.route);
    const abs = absFromRel(projectDir, rel);
    const prompt = buildRenderPrompt(projectDir, page);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs.replace(/\.png$/i, ".prompt.txt"), prompt, "utf8");
    if (existsSync(abs)) continue;
    try {
      provider ??= await loadDeskProvider(projectDir, deps);
      const images = await provider.generateImage({
        model: RENDER_MODEL,
        prompt,
        aspect: "16:9",
        n: 1,
      });
      const bytes = firstImageBytes(images);
      if (bytes === null || bytes.byteLength === 0) {
        notes.push(`${page.route}: the provider returned no image bytes.`);
        continue;
      }
      writeFileSync(abs, bytes);
      written.push(rel);
    } catch (error) {
      const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Render draft failed.";
      notes.push(`${page.route}: ${message}`);
    }
  }
  if (notes.length > 0) recordRenderNotes(projectDir, notes);
  return written;
}

export function saveRenderUpload(projectDir: string, route: string, bytes: Uint8Array): string {
  const rel = renderRelForRoute(route);
  const abs = absFromRel(projectDir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  return rel;
}

export function approveRender(projectDir: string, route: string, approvedAt = new Date().toISOString()): RenderApproval {
  const page = listPrimaryPages(projectDir).find((item) => sameRoute(item.route, route));
  if (page === undefined) throw new Error(`No primary page matches ${normalizeRoute(route)}.`);
  const rel = renderRelForRoute(page.route);
  const abs = absFromRel(projectDir, rel);
  if (!existsSync(abs)) throw new Error(`No render file for ${page.route}.`);
  const row: RenderApproval = { route: page.route, file: rel, sha256: sha256File(abs), approvedAt };
  const rest = readApprovals(projectDir).filter((item) => !sameRoute(item.route, page.route));
  writeApprovals(projectDir, [...rest, row]);
  return row;
}

export function isRenderApproved(projectDir: string, route: string): boolean {
  const rel = renderRelForRoute(route);
  const row = readApprovals(projectDir).find((item) => sameRoute(item.route, route));
  if (row === undefined || row.file.replace(/\\/g, "/") !== rel) return false;
  const abs = absFromRel(projectDir, rel);
  if (!existsSync(abs)) return false;
  return sha256File(abs) === row.sha256;
}

/** Drops approvals whose file is missing or whose bytes changed. */
export function syncRenderApprovals(projectDir: string): RenderApproval[] {
  const file = path.join(projectDir, RENDERS_REL);
  if (!existsSync(file)) return [];
  const kept = readApprovals(projectDir).filter((row) => approvalMatches(projectDir, row));
  writeApprovals(projectDir, kept);
  return kept;
}

export function pagesWaitingForRender(projectDir: string): WaitingPage[] {
  syncRenderApprovals(projectDir);
  const waiting: WaitingPage[] = [];
  for (const page of listPrimaryPages(projectDir)) {
    if (isRenderApproved(projectDir, page.route)) continue;
    waiting.push({ title: page.title, route: page.route, file: renderRelForRoute(page.route) });
  }
  return waiting;
}

async function loadDeskProvider(projectDir: string, deps: DraftRenderDeps): Promise<DeskProvider> {
  const href = pathToFileURL(packagedModule("assets", "src/section-generate.ts")).href;
  const mod = (await import(href)) as DeskModule;
  return mod.resolveDeskProvider(projectDir, {
    ...(deps.spawn === undefined ? {} : { spawn: deps.spawn }),
    ...(deps.env === undefined ? {} : { env: deps.env }),
    ...(deps.browserDriver === undefined ? {} : { browserDriver: deps.browserDriver }),
  });
}

function firstImageBytes(images: readonly DeskImage[]): Uint8Array | null {
  const image = images[0];
  if (image === undefined || typeof image.b64 !== "string" || image.b64.trim() === "") return null;
  return Buffer.from(image.b64, "base64");
}

function recordRenderNotes(projectDir: string, notes: readonly string[]): void {
  const dir = path.join(projectDir, "reference", "renders");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "README.md");
  const prior = readOptional(file);
  const fresh = notes.filter((note) => !prior.includes(note));
  if (fresh.length === 0) return;
  const block = fresh.map((note) => `- ${note}`).join("\n");
  const next = prior.trim() === "" ? `# Page renders\n\n${block}\n` : `${prior.trimEnd()}\n\n${block}\n`;
  writeFileSync(file, next, "utf8");
}

function approvalMatches(projectDir: string, row: RenderApproval): boolean {
  const abs = absFromRel(projectDir, row.file);
  if (!existsSync(abs)) return false;
  try {
    return sha256File(abs) === row.sha256;
  } catch {
    return false;
  }
}

function readApprovals(projectDir: string): RenderApproval[] {
  const file = path.join(projectDir, RENDERS_REL);
  if (!existsSync(file)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(raw)
      ? raw
      : isRecord(raw) && Array.isArray(raw.renders)
        ? raw.renders
        : isRecord(raw) && typeof raw.route === "string"
          ? [raw]
          : [];
    const rows: RenderApproval[] = [];
    for (const item of list) {
      if (!isRecord(item)) continue;
      if (typeof item.route !== "string" || typeof item.file !== "string") continue;
      if (typeof item.sha256 !== "string" || typeof item.approvedAt !== "string") continue;
      rows.push({
        route: item.route,
        file: item.file.replace(/\\/g, "/"),
        sha256: item.sha256,
        approvedAt: item.approvedAt,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

function writeApprovals(projectDir: string, rows: readonly RenderApproval[]): void {
  const file = path.join(projectDir, RENDERS_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

function parseSitemap(markdown: string): PrimaryPage[] {
  let group: "primary" | "footer" | null = null;
  const pages: PrimaryPage[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      const name = (heading[1] ?? "").trim().toLowerCase();
      if (name === "primary" || name === "footer") group = name;
      continue;
    }
    if (group === null) continue;
    const page = /^-\s+(.+?)\s+at\s+(\S+)\s*$/.exec(line);
    if (page !== null) {
      pages.push({
        title: (page[1] ?? "").trim(),
        route: normalizeRoute(page[2] ?? ""),
        sections: [],
        group,
      });
      continue;
    }
    const section = /^\s+-\s+(.+?)\s*$/.exec(line);
    if (section !== null && pages.length > 0) pages[pages.length - 1]?.sections.push((section[1] ?? "").trim());
  }
  return pages;
}

function normalizeRoute(route: string): string {
  let value = route.trim();
  if (value === "") return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function sameRoute(left: string, right: string): boolean {
  return normalizeRoute(left).toLowerCase() === normalizeRoute(right).toLowerCase();
}

function typePair(markdown: string): string {
  const display = fontFamily(markdown, "display");
  const body = fontFamily(markdown, "body");
  if (display !== "" && body !== "") return `${display} and ${body}`;
  const typed = /^Type pair:\s*(.+)$/im.exec(sectionBody(markdown, "Typography"));
  if (typed !== null) {
    const parts = (typed[1] ?? "")
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (parts.length >= 2) return `${parts[0]} and ${parts[1]}`;
    const line = (typed[1] ?? "").trim();
    if (line !== "") return line;
  }
  if (display !== "") return display;
  return "not set";
}

function frontLines(markdown: string): string[] {
  return frontMatterBlock(markdown).split(/\r?\n/);
}

function fontFamily(markdown: string, role: "display" | "body"): string {
  const lines = frontLines(markdown);
  const start = lines.findIndex((line) => line.trim() === `${role}:`);
  if (start < 0) return "";
  const indent = leadingSpaces(lines[start] ?? "");
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    if (leadingSpaces(line) <= indent) break;
    const family = /^\s+fontFamily:\s*(.+)$/.exec(line);
    if (family !== null) return unquote(family[1] ?? "");
  }
  return "";
}

function colourTokens(markdown: string): Array<{ name: string; value: string }> {
  const lines = frontLines(markdown);
  const start = lines.findIndex((line) => line.trim() === "colors:");
  if (start < 0) return [];
  const tokens: Array<{ name: string; value: string }> = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    if (!line.startsWith(" ")) break;
    const row = /^ +([A-Za-z0-9_-]+):\s*(.+)$/.exec(line);
    if (row === null) continue;
    const value = unquote(row[2] ?? "");
    if (value === "") continue;
    tokens.push({ name: row[1] ?? "", value });
  }
  return tokens;
}

function leadingSpaces(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function signatureEffect(markdown: string): string {
  const body = sectionBody(markdown, "Signature techniques");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.replace(/^[-*]\s*/, "").trim();
    if (trimmed === "" || /^any appropriate library/i.test(trimmed)) continue;
    return trimmed;
  }
  return "not set";
}

function sectionLine(markdown: string, heading: string, fallback: string): string {
  const body = sectionBody(markdown, heading).replace(/\s+/g, " ").trim();
  return body === "" ? fallback : body;
}

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function frontMatterBlock(markdown: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match?.[1] ?? "";
}

function unquote(value: string): string {
  const trimmed = value.trim().replace(/,$/, "");
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function styleShots(projectDir: string): string[] {
  const dir = path.join(projectDir, "reference", "refs");
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    names.push(`reference/refs/${name}`);
  }
  names.sort();
  return names;
}

function absFromRel(projectDir: string, rel: string): string {
  return path.join(projectDir, ...rel.split("/"));
}

function readOptional(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
