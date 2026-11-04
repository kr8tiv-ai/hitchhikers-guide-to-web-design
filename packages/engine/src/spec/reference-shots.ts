/**
 * Capture screenshots for every named reference and every owner URL.
 * A name with no URL is listed for the owner. No search and no guessed host.
 * The desk schedules this off the request path. Tests pass capture.
 * 245a counts reference/refs and reference/renders together via countDesignReferenceImages.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { catalogReferences, type CatalogReference } from "../brand/directions.ts";

export const REFERENCE_ASKS_REL = ".hitchhiker/reference-asks.json";
export const REFERENCE_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

const CAPTURE_TIMEOUT_MS = 20_000;
const LOVE_LIMIT = 400;

export interface CapturedReferenceShot {
  kind: "fold" | "full";
  pageUrl: string;
  bytes: Uint8Array;
}

export interface ReferenceCaptureOptions {
  timeoutMs: number;
  signal: AbortSignal;
}

export interface CollectReferenceDeps {
  capture: (url: string, options: ReferenceCaptureOptions) => Promise<readonly CapturedReferenceShot[]>;
  now?: () => Date;
  timeoutMs?: number;
}

export interface ReferenceNeed {
  label: string;
  detail: string;
}

export interface CollectedReference {
  label: string;
  slug: string;
  url: string;
  love: string;
  files: string[];
  error: string;
}

export interface CollectReferenceResult {
  captured: CollectedReference[];
  needs: ReferenceNeed[];
}

interface Mention {
  at: number;
  label: string;
  slug: string;
  url: string | null;
  catalogId: string | null;
}

type CaptureRunner = (projectDir: string) => Promise<void>;

const runners = new Map<string, CaptureRunner>();
const inflight = new Set<string>();
const again = new Set<string>();

/** Desk installs the browser. A missing runner does nothing, so tests stay offline. */
export function setReferenceCaptureRunner(projectDir: string, runner: CaptureRunner | null): void {
  const key = path.resolve(projectDir);
  if (runner === null) runners.delete(key);
  else runners.set(key, runner);
}

export function clearReferenceCaptureRunner(projectDir?: string): void {
  if (projectDir === undefined) {
    runners.clear();
    return;
  }
  runners.delete(path.resolve(projectDir));
}

/**
 * Starts a capture and returns before it finishes.
 * A second save while one is running is kept and run once after.
 */
export function scheduleReferenceCapture(projectDir: string): void {
  const key = path.resolve(projectDir);
  if (runners.get(key) === undefined) return;
  if (inflight.has(key)) {
    again.add(key);
    return;
  }
  inflight.add(key);
  const job = Promise.resolve().then(() => runCapture(key));
  void job.finally(() => {
    inflight.delete(key);
    if (again.delete(key)) scheduleReferenceCapture(key);
  });
}

async function runCapture(key: string): Promise<void> {
  const runner = runners.get(key);
  if (runner === undefined) return;
  try {
    await runner(key);
  } catch (error) {
    const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Reference capture failed.";
    recordReferenceCaptureFailure(key, message);
  }
}

export function recordReferenceCaptureFailure(projectDir: string, message: string): void {
  const dir = path.join(projectDir, "reference");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "README.md");
  const prior = readOptional(file);
  const line = `Capture did not finish. ${message.trim()}`;
  if (prior.includes(line)) return;
  const next = prior.trim() === "" ? `# References\n\n${line}\n` : `${prior.trimEnd()}\n\n${line}\n`;
  writeFileSync(file, next, "utf8");
}

export async function collectReferenceShots(
  projectDir: string,
  deps: CollectReferenceDeps,
): Promise<CollectReferenceResult> {
  const now = deps.now ?? (() => new Date());
  const capturedAt = now().toISOString();
  const timeoutMs = finiteTimeout(deps.timeoutMs);
  const text = referenceCorpus(projectDir);
  const mentions = findMentions(text, catalogReferences());
  const captured: CollectedReference[] = [];
  const needs: ReferenceNeed[] = [];
  for (const mention of mentions) {
    const love = loveText(text, mention, mentions);
    if (mention.url === null) {
      needs.push({ label: mention.label, detail: needLine(mention.label) });
      continue;
    }
    const row: CollectedReference = {
      label: mention.label,
      slug: uniqueSlug(mention.slug, captured),
      url: mention.url,
      love,
      files: [],
      error: "",
    };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = deps.capture(mention.url, { timeoutMs, signal: controller.signal });
    const guarded = pending.then(
      (value) => value,
      (error: unknown) => Promise.reject(error instanceof Error ? error : new Error("Reference capture failed.")),
    );
    void guarded.catch(() => undefined);
    try {
      const shots = await new Promise<readonly CapturedReferenceShot[]>((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Reference capture timed out."));
        }, timeoutMs);
        guarded.then(resolve, reject);
      });
      let index = 0;
      for (const shot of shots) {
        if (shot.bytes.byteLength === 0) continue;
        index += 1;
        const name = `${row.slug}-${index}.png`;
        const rel = `reference/refs/${name}`;
        const abs = path.join(projectDir, "reference", "refs", name);
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, shot.bytes);
        row.files.push(rel);
      }
      if (row.files.length === 0) row.error = "The capture returned no images.";
    } catch (error) {
      row.error = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Reference capture failed.";
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    captured.push(row);
  }
  writeRefsReadme(projectDir, captured, capturedAt);
  writeReferenceReadme(projectDir, needs);
  writeAsks(projectDir, needs);
  return { captured, needs };
}

/** Rewrites reference/README.md from the current asks and owner photos. */
export function refreshReferenceReadme(projectDir: string): void {
  writeReferenceReadme(projectDir, readReferenceAsks(projectDir));
}

export function readReferenceAsks(projectDir: string): ReferenceNeed[] {
  const file = path.join(projectDir, REFERENCE_ASKS_REL);
  if (!existsSync(file)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { needs?: unknown }).needs)) return [];
    const needs: ReferenceNeed[] = [];
    for (const item of (raw as { needs: unknown[] }).needs) {
      if (typeof item !== "object" || item === null) continue;
      const label = (item as { label?: unknown }).label;
      const detail = (item as { detail?: unknown }).detail;
      if (typeof label !== "string" || label.trim() === "") continue;
      const line = typeof detail === "string" && detail.trim() !== "" ? detail.trim() : needLine(label.trim());
      needs.push({ label: label.trim(), detail: line });
    }
    return needs;
  } catch {
    return [];
  }
}

/** png, jpg, jpeg, and webp under reference/refs and reference/renders. 245a calls this. */
export function countDesignReferenceImages(projectDir: string): number {
  return listReferenceImages(projectDir).length;
}

export function listReferenceImages(projectDir: string): string[] {
  const found: string[] = [];
  for (const folder of ["refs", "renders"]) {
    walkImages(path.join(projectDir, "reference", folder), path.join("reference", folder), found);
  }
  return found;
}

export function saveReferenceUpload(projectDir: string, filename: string, bytes: Uint8Array): string {
  const ext = imageExt(filename);
  const base = slugify(path.basename(filename, path.extname(filename))) || "upload";
  const name = `${base}${ext}`;
  const rel = `reference/refs/${name}`;
  const abs = path.join(projectDir, "reference", "refs", name);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  const readme = path.join(projectDir, "reference", "refs", "README.md");
  const prior = readOptional(readme);
  const line = `- ${name}: uploaded by the owner.`;
  const next = prior.trim() === "" ? `# Reference shots\n\n## Owner uploads\n\n${line}\n` : `${prior.trimEnd()}\n${line}\n`;
  if (!prior.includes(line)) writeFileSync(readme, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  const needs = readReferenceAsks(projectDir).filter((item) => slugify(item.label) !== base);
  writeAsks(projectDir, needs);
  writeReferenceReadme(projectDir, needs);
  return rel;
}

export function ownerPhotoFiles(projectDir: string): string[] {
  const files: string[] = [];
  for (const rel of [path.join(".hitchhiker", "ASSETS.md"), "ASSETS.md"]) {
    for (const row of assetRows(readOptional(path.join(projectDir, rel)))) {
      if (row.license !== "owner" || row.file.trim() === "") continue;
      if (/logo/i.test(row.slot) || /logo/i.test(row.file)) continue;
      if (!files.includes(row.file)) files.push(row.file);
    }
  }
  return files;
}

export function needLine(label: string): string {
  return `${label} needs a URL or screenshot from the owner.`;
}

function referenceCorpus(projectDir: string): string {
  const parts = [sectionBody(readOptional(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md")), "References")];
  for (const answer of interviewValues(projectDir)) {
    if (answer.id === "DP-5.1" || answer.id === "DP-5.2") parts.push(answer.value);
  }
  return parts.filter((part) => part.trim() !== "").join("\n");
}

function interviewValues(projectDir: string): Array<{ id: string; value: string }> {
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.answers) ? raw.answers : [];
  const answers: Array<{ id: string; value: string }> = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    const status = typeof item.status === "string" ? item.status : "";
    if (status === "SKIPPED" || status === "NOT_APPLICABLE" || status === "UNANSWERED") continue;
    answers.push({ id: item.id, value: item.value });
  }
  return answers;
}

function findMentions(text: string, catalog: readonly CatalogReference[]): Mention[] {
  const mentions: Mention[] = [];
  const spans: Array<{ start: number; end: number }> = [];
  const lower = text.toLowerCase();
  const overlaps = (start: number, end: number): boolean => spans.some((span) => start < span.end && end > span.start);
  const claim = (start: number, end: number): void => {
    spans.push({ start, end });
  };
  for (const match of text.matchAll(/https?:\/\/[^\s)<>"']+/gi)) {
    const raw = match[0].replace(/[.,);]+$/g, "");
    const at = match.index ?? 0;
    if (overlaps(at, at + raw.length)) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.username.length > 0 || parsed.password.length > 0) continue;
    claim(at, at + raw.length);
    const hit = catalog.find((entry) => sameUrl(entry.url, parsed.href));
    const host = parsed.hostname.replace(/^www\./, "");
    const slug = hit?.id ?? slugify(host);
    if (mentions.some((item) => item.catalogId === hit?.id && hit !== undefined)) continue;
    if (mentions.some((item) => item.url !== null && sameUrl(item.url, parsed.href))) continue;
    mentions.push({
      at,
      label: hit?.title ?? host,
      slug,
      url: parsed.href,
      catalogId: hit?.id ?? null,
    });
  }
  const names = catalog
    .flatMap((entry) => entry.names.map((name) => ({ name: name.toLowerCase(), entry })))
    .sort((left, right) => right.name.length - left.name.length);
  for (const { name, entry } of names) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(name, from);
      if (at < 0) break;
      const end = at + name.length;
      from = end;
      if (!boundary(lower, at, end) || overlaps(at, end)) continue;
      claim(at, end);
      if (mentions.some((item) => item.catalogId === entry.id || (item.url !== null && sameUrl(item.url, entry.url)))) break;
      mentions.push({ at, label: entry.title, slug: entry.id, url: entry.url, catalogId: entry.id });
      break;
    }
  }
  for (const match of text.matchAll(/(?:^|[\n.])\s*([A-Z][A-Za-z0-9&'’./ -]{1,60}?):\s*(?:love|meh|hate)\b/g)) {
    const label = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (label === "") continue;
    const whole = match.index ?? 0;
    const at = whole + match[0].toLowerCase().indexOf(label.toLowerCase());
    if (overlaps(at, at + label.length)) continue;
    if (mentions.some((item) => item.label.toLowerCase() === label.toLowerCase() || item.slug === slugify(label))) continue;
    claim(at, at + label.length);
    mentions.push({ at, label, slug: slugify(label), url: null, catalogId: null });
  }
  mentions.sort((left, right) => left.at - right.at);
  const seen = new Set<string>();
  return mentions.filter((item) => {
    const key = item.catalogId ?? item.url ?? item.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loveText(text: string, mention: Mention, mentions: readonly Mention[]): string {
  const next = mentions.find((item) => item.at > mention.at);
  const end = next === undefined ? text.length : next.at;
  const slice = text.slice(mention.at, end).replace(/\s+/g, " ").trim();
  const without = slice.replace(new RegExp(`^${escapeRegExp(mention.label)}\\s*:?\\s*`, "i"), "").trim();
  const love = without === "" ? slice : without;
  return love.length > LOVE_LIMIT ? `${love.slice(0, LOVE_LIMIT).trim()}…` : love;
}

function uniqueSlug(slug: string, captured: readonly CollectedReference[]): string {
  const base = slug === "" ? "reference" : slug;
  if (!captured.some((item) => item.slug === base)) return base;
  let index = 2;
  while (captured.some((item) => item.slug === `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function writeRefsReadme(projectDir: string, captured: readonly CollectedReference[], capturedAt: string): void {
  if (captured.length === 0) return;
  const lines = ["# Reference shots", ""];
  for (const row of captured) {
    lines.push(`## ${row.label}`, "");
    lines.push(`- Source: ${row.url}`);
    lines.push(`- Captured: ${capturedAt}`);
    lines.push(`- The owner said: ${row.love === "" ? "No note." : row.love}`);
    if (row.files.length > 0) lines.push(`- Files: ${row.files.map((file) => path.posix.basename(file)).join(", ")}`);
    if (row.error !== "") lines.push(`- Capture failed: ${row.error}`);
    lines.push("");
  }
  const uploads = ownerUploads(projectDir, new Set(captured.flatMap((row) => row.files.map((file) => path.posix.basename(file)))));
  if (uploads.length > 0) {
    lines.push("## Owner uploads", "");
    for (const name of uploads) lines.push(`- ${name}: uploaded by the owner.`);
    lines.push("");
  }
  const dir = path.join(projectDir, "reference", "refs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "README.md"), `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function writeReferenceReadme(projectDir: string, needs: readonly ReferenceNeed[]): void {
  const photos = ownerPhotoFiles(projectDir);
  if (needs.length === 0 && photos.length === 0 && !existsSync(path.join(projectDir, "reference"))) return;
  const lines = ["# References", ""];
  lines.push("## Needs a URL or screenshot from the owner", "");
  if (needs.length === 0) lines.push("Every named reference has a URL.", "");
  else {
    for (const need of needs) lines.push(`- ${need.detail}`);
    lines.push("");
  }
  lines.push("## Owner photos", "");
  lines.push("Compose page renders with these owner photos. A render may not use the logo file as a photo.", "");
  if (photos.length === 0) lines.push("No owner photos are listed in ASSETS.md yet.", "");
  else {
    for (const file of photos) lines.push(`- ${file}`);
    lines.push("");
  }
  lines.push("Shots live in reference/refs. Page renders live in reference/renders.", "");
  const dir = path.join(projectDir, "reference");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "README.md"), `${lines.join("\n").trimEnd()}\n`, "utf8");
}

function writeAsks(projectDir: string, needs: readonly ReferenceNeed[]): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "reference-asks.json"), `${JSON.stringify({ needs }, null, 2)}\n`, "utf8");
}

function ownerUploads(projectDir: string, capturedNames: ReadonlySet<string>): string[] {
  const dir = path.join(projectDir, "reference", "refs");
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!isImage(name) || capturedNames.has(name)) continue;
    names.push(name);
  }
  names.sort();
  return names;
}

function walkImages(dir: string, rel: string, into: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const nextRel = `${rel}/${name.name}`;
    if (name.isDirectory()) {
      walkImages(path.join(dir, name.name), nextRel, into);
      continue;
    }
    if (isImage(name.name)) into.push(nextRel.split(path.sep).join("/"));
  }
}

function assetRows(markdown: string): Array<{ slot: string; file: string; license: string }> {
  const rows: Array<{ slot: string; file: string; license: string }> = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells.length !== 9) continue;
    if (cells[0] === "slot" || cells[0] === "---" || cells[0] === "") continue;
    rows.push({ slot: cells[0] ?? "", file: cells[2] ?? "", license: cells[5] ?? "" });
  }
  return rows;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function sameUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const pathA = a.pathname.replace(/\/+$/, "") || "/";
    const pathB = b.pathname.replace(/\/+$/, "") || "/";
    return a.hostname.replace(/^www\./, "").toLowerCase() === b.hostname.replace(/^www\./, "").toLowerCase() && pathA === pathB;
  } catch {
    return false;
  }
}

function boundary(text: string, start: number, end: number): boolean {
  const before = start === 0 ? "" : text.charAt(start - 1);
  const after = end >= text.length ? "" : text.charAt(end);
  return !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after);
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 60);
}

function imageExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return (REFERENCE_IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? ext : ".png";
}

function isImage(name: string): boolean {
  return (REFERENCE_IMAGE_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase());
}

function finiteTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return CAPTURE_TIMEOUT_MS;
  return Math.min(value, 30_000);
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

export function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
