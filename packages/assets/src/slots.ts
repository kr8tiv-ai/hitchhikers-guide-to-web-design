/**
 * Asset slots and the ASSETS.md table.
 *
 * Rows are what later prompts read: slot, source, file, cost, approved,
 * plus license, status, grade, and job id. A weak grade can be proposed
 * for replacement. A real subject is not proposed, and is not replaced,
 * unless realPersonYes is recorded.
 *
 * Weak means a 057 grade under 7, the collateral line in the context
 * package: still weak after the local checks.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { grade, type GradeFacts } from "./grade.ts";

export const WEAK_GRADE_BELOW = 7;

export type AssetSource = "imagine" | "diy" | "upload";
export type SlotStatus = "pending" | "done" | "failed";
export type StillPriceResolution = "1k-low" | "2k-medium" | "default";
export type VideoFrame = "480p" | "720p" | "1080p";

export interface AssetSlot {
  id: string;
  kind: "still" | "video";
  model: string;
  prompt: string;
  aspect: string;
  n: number;
  subjectIsReal: boolean;
  light: string;
  stillResolution?: StillPriceResolution;
  seconds?: number;
  resolution?: VideoFrame;
  image?: string;
  /** Recorded yes to replace this real subject. */
  realPersonYes?: boolean;
  /** Set when this job would stand in for an existing asset. */
  replaces?: string;
  gradeScore?: number;
  file?: string;
  costUsd?: number;
  source?: AssetSource;
  approved?: boolean;
  status?: SlotStatus;
  jobId?: string;
  error?: string;
}

export interface ReplacementInput {
  id: string;
  subjectIsReal: boolean;
  realPersonYes?: boolean;
  gradeScore?: number;
  gradeFacts?: GradeFacts;
}

export interface ReplacementProposal {
  slotId: string;
  propose: boolean;
  /** True when a weak real subject was refused for lack of a recorded yes. */
  needsYes: boolean;
  reason: string;
}

export interface AssetRow {
  slot: string;
  source: AssetSource;
  file: string;
  cost: string;
  approved: "yes" | "no";
  license: string;
  status: string;
  grade: string;
  job: string;
}

const TABLE_HEADER = "| slot | source | file | cost | approved | license | status | grade | job |";
const TABLE_RULE = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";

const SLOT_KEYS = [
  "id",
  "kind",
  "model",
  "prompt",
  "aspect",
  "n",
  "subjectIsReal",
  "light",
  "stillResolution",
  "seconds",
  "resolution",
  "image",
  "realPersonYes",
  "replaces",
  "gradeScore",
  "file",
  "costUsd",
  "source",
  "approved",
  "status",
  "jobId",
  "error",
] as const;

const SOURCES: readonly AssetSource[] = ["imagine", "diy", "upload"];
const STILL_RESOLUTIONS: readonly StillPriceResolution[] = ["1k-low", "2k-medium", "default"];
const VIDEO_FRAMES: readonly VideoFrame[] = ["480p", "720p", "1080p"];

export function assetsFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "ASSETS.md");
}

export function slotsFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "assets", "slots.json");
}

export function generatedDir(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "assets", "generated");
}

export function diyDir(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "assets", "diy");
}

export async function loadSlots(projectDir: string): Promise<AssetSlot[]> {
  const file = slotsFile(projectDir);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error("No asset slots yet. Write .hitchhiker/assets/slots.json.");
    }
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("slots.json is not valid JSON.");
  }
  if (!isRecord(raw) || !Array.isArray(raw.slots)) {
    throw new Error("slots.json needs a slots array.");
  }
  if (raw.slots.length === 0) throw new Error("slots.json needs at least one slot.");
  return raw.slots.map((entry, index) => parseSlot(entry, index));
}

/**
 * Propose a replacement from a 057 grade. This does not write a file and
 * does not call Imagine. A real subject stays unless realPersonYes is set.
 */
export function proposeReplacement(input: ReplacementInput): ReplacementProposal {
  const real = isReal(input);
  const yes = input.realPersonYes === true;
  const measured = measure(input);
  if (measured === null) {
    return {
      slotId: input.id,
      propose: false,
      needsYes: false,
      reason: "No grade yet.",
    };
  }
  if (measured.score >= WEAK_GRADE_BELOW) {
    return {
      slotId: input.id,
      propose: false,
      needsYes: false,
      reason: `Grade ${measured.score} stays.`,
    };
  }
  const why = measured.reasons.length > 0 ? ` ${measured.reasons.join(" ")}` : "";
  if (real && !yes) {
    return {
      slotId: input.id,
      propose: false,
      needsYes: true,
      reason: `A real subject is not replaced without a recorded yes.${why}`.trim(),
    };
  }
  const door = real
    ? "A recorded yes allows a replacement."
    : "A new still can replace it.";
  return {
    slotId: input.id,
    propose: true,
    needsYes: false,
    reason: `Grade ${measured.score} is under ${WEAK_GRADE_BELOW}.${why} ${door} The batch quote shows the cost.`.replace(
      /\s+/g,
      " ",
    ),
  };
}

export function refusesRealReplacement(slot: AssetSlot): boolean {
  return slot.replaces !== undefined && slot.subjectIsReal === true && slot.realPersonYes !== true;
}

export async function updateAssetRows(projectDir: string, rows: readonly AssetRow[]): Promise<string> {
  const file = assetsFile(projectDir);
  const current = await readOptional(file);
  const next = upsertTable(current, rows);
  await writeTextAtomic(file, next);
  return file;
}

export function rowFromSlot(slot: AssetSlot, projectDir: string): AssetRow {
  const source = slot.source ?? "imagine";
  return {
    slot: slot.id,
    source,
    file: docPath(projectDir, slot.file ?? ""),
    cost: formatUsd(slot.costUsd ?? 0),
    approved: slot.approved === true ? "yes" : "no",
    license: source === "imagine" ? "user-account" : "user-supplied",
    status: slot.status ?? "pending",
    grade: slot.gradeScore === undefined ? "" : String(slot.gradeScore),
    job: slot.jobId ?? "",
  };
}

export function readAssetTable(markdown: string): AssetRow[] {
  const rows: AssetRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells[0] === "slot" || cells[0] === "---" || cells[0] === "") continue;
    if (cells.length !== 9) continue;
    const source = cells[1];
    if (!isSource(source)) continue;
    rows.push({
      slot: cells[0] ?? "",
      source,
      file: cells[2] ?? "",
      cost: cells[3] ?? "",
      approved: cells[4] === "yes" ? "yes" : "no",
      license: cells[5] ?? "",
      status: cells[6] ?? "",
      grade: cells[7] ?? "",
      job: cells[8] ?? "",
    });
  }
  return rows;
}

export function renderAssets(rows: readonly AssetRow[]): string {
  return `${preamble()}${renderTable(rows)}`;
}

export async function writeTextAtomic(file: string, text: string): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.tmp`);
  await writeFile(temp, text, "utf8");
  try {
    await rm(file, { force: true });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export function assertSlotId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    throw new Error("Slot id must be letters, numbers, hyphens, or underscores.");
  }
  return id;
}

export function toDocPath(projectDir: string, file: string): string {
  return docPath(projectDir, file);
}

function measure(input: ReplacementInput): { score: number; reasons: string[] } | null {
  if (input.gradeFacts !== undefined) {
    const result = grade(input.gradeFacts);
    return { score: result.score, reasons: result.reasons };
  }
  if (input.gradeScore === undefined) return null;
  if (!Number.isFinite(input.gradeScore)) throw new Error("gradeScore must be a finite number.");
  return { score: input.gradeScore, reasons: [] };
}

function isReal(input: ReplacementInput): boolean {
  if (input.subjectIsReal === true) return true;
  return input.gradeFacts?.subjectIsReal === true;
}

function parseSlot(entry: unknown, index: number): AssetSlot {
  if (!isRecord(entry)) throw new Error(`Slot ${index + 1} must be an object.`);
  rejectUnknown(entry, index);
  const id = assertSlotId(readString(entry, "id", index));
  const kind = readString(entry, "kind", index);
  if (kind !== "still" && kind !== "video") {
    throw new Error(`Slot ${id} kind must be still or video.`);
  }
  const slot: AssetSlot = {
    id,
    kind,
    model: readString(entry, "model", index),
    prompt: readString(entry, "prompt", index),
    aspect: readString(entry, "aspect", index),
    n: readCount(entry, id),
    subjectIsReal: readBool(entry, "subjectIsReal", id),
    light: readLight(entry, id),
  };
  assignOptional(slot, entry, id);
  if (slot.kind === "video") {
    if (slot.seconds === undefined) throw new Error(`Slot ${id} needs seconds.`);
    if (slot.resolution === undefined) throw new Error(`Slot ${id} needs a video resolution.`);
  }
  return slot;
}

function assignOptional(slot: AssetSlot, entry: Record<string, unknown>, id: string): void {
  if (Object.hasOwn(entry, "stillResolution")) {
    const value = readString(entry, "stillResolution", 0);
    if (!isStillResolution(value)) throw new Error(`Slot ${id} still resolution is not on the price card.`);
    slot.stillResolution = value;
  }
  if (Object.hasOwn(entry, "seconds")) slot.seconds = readWhole(entry.seconds, `Slot ${id} seconds`);
  if (Object.hasOwn(entry, "resolution")) {
    const value = readString(entry, "resolution", 0);
    if (!isVideoFrame(value)) throw new Error(`Slot ${id} resolution must be 480p, 720p, or 1080p.`);
    slot.resolution = value;
  }
  if (Object.hasOwn(entry, "image")) slot.image = readString(entry, "image", 0);
  if (Object.hasOwn(entry, "realPersonYes")) slot.realPersonYes = readBool(entry, "realPersonYes", id);
  if (Object.hasOwn(entry, "replaces")) {
    const replaces = readString(entry, "replaces", 0);
    slot.replaces = assertSlotId(replaces);
  }
  if (Object.hasOwn(entry, "gradeScore")) {
    const score = entry.gradeScore;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 1 || score > 10) {
      throw new Error(`Slot ${id} gradeScore must be from 1 to 10.`);
    }
    slot.gradeScore = score;
  }
  if (Object.hasOwn(entry, "file")) slot.file = readString(entry, "file", 0);
  if (Object.hasOwn(entry, "costUsd")) {
    const cost = entry.costUsd;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) {
      throw new Error(`Slot ${id} costUsd must be zero or more.`);
    }
    slot.costUsd = cost;
  }
  if (Object.hasOwn(entry, "source")) {
    const source = readString(entry, "source", 0);
    if (!isSource(source)) throw new Error(`Slot ${id} source must be imagine, diy, or upload.`);
    slot.source = source;
  }
  if (Object.hasOwn(entry, "approved")) slot.approved = readBool(entry, "approved", id);
  if (Object.hasOwn(entry, "status")) {
    const status = readString(entry, "status", 0);
    if (status !== "pending" && status !== "done" && status !== "failed") {
      throw new Error(`Slot ${id} status must be pending, done, or failed.`);
    }
    slot.status = status;
  }
  if (Object.hasOwn(entry, "jobId")) slot.jobId = readString(entry, "jobId", 0);
  if (Object.hasOwn(entry, "error")) slot.error = readString(entry, "error", 0);
}

function readCount(entry: Record<string, unknown>, id: string): number {
  if (!Object.hasOwn(entry, "n")) return 1;
  return readWhole(entry.n, `Slot ${id} n`);
}

function readLight(entry: Record<string, unknown>, id: string): string {
  if (!Object.hasOwn(entry, "light")) return "";
  const value = entry.light;
  if (typeof value !== "string") throw new Error(`Slot ${id} light must be text.`);
  return value;
}

function readBool(entry: Record<string, unknown>, key: string, id: string): boolean {
  const value = entry[key];
  if (typeof value !== "boolean") throw new Error(`Slot ${id} ${key} must be true or false.`);
  return value;
}

function readWhole(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value;
}

function readString(entry: Record<string, unknown>, key: string, index: number): string {
  const value = entry[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    const where = typeof entry.id === "string" ? entry.id : String(index + 1);
    throw new Error(`Slot ${where} needs ${key}.`);
  }
  return value.trim();
}

function rejectUnknown(entry: Record<string, unknown>, index: number): void {
  for (const key of Object.keys(entry)) {
    if (!(SLOT_KEYS as readonly string[]).includes(key)) {
      const where = typeof entry.id === "string" ? entry.id : String(index + 1);
      throw new Error(`Slot ${where} has unknown field ${key}.`);
    }
  }
}

function upsertTable(current: string, rows: readonly AssetRow[]): string {
  const existing = readAssetTable(current);
  const bySlot = new Map(existing.map((row) => [row.slot, row]));
  for (const row of rows) bySlot.set(row.slot, row);
  const ordered: AssetRow[] = [];
  const seen = new Set<string>();
  for (const row of existing) {
    const next = bySlot.get(row.slot);
    if (next === undefined || seen.has(row.slot)) continue;
    ordered.push(next);
    seen.add(row.slot);
  }
  for (const row of rows) {
    if (seen.has(row.slot)) continue;
    ordered.push(row);
    seen.add(row.slot);
  }
  const parts = splitDocument(current);
  return `${parts.head}${renderTable(ordered)}${parts.tail}`;
}

function splitDocument(markdown: string): { head: string; tail: string } {
  if (markdown.trim().length === 0) return { head: preamble(), tail: "" };
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("| slot |"));
  if (start === -1) {
    const body = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
    return { head: `${body}\n`, tail: "" };
  }
  let end = start;
  while (end < lines.length && (lines[end]?.startsWith("|") ?? false)) end += 1;
  const headLines = lines.slice(0, start).join("\n").replace(/\s+$/, "");
  const head = headLines.length === 0 ? preamble() : `${headLines}\n\n`;
  const tailBody = lines.slice(end).join("\n").trim();
  const tail = tailBody.length === 0 ? "" : `\n${tailBody}\n`;
  return { head, tail };
}

function preamble(): string {
  return `# Assets\n\n`;
}

function renderTable(rows: readonly AssetRow[]): string {
  const lines = [TABLE_HEADER, TABLE_RULE];
  for (const row of rows) {
    lines.push(
      `| ${cell(row.slot)} | ${cell(row.source)} | ${cell(row.file)} | ${cell(row.cost)} | ${cell(row.approved)} | ${cell(row.license)} | ${cell(row.status)} | ${cell(row.grade)} | ${cell(row.job)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function cell(value: string): string {
  if (/[|\r\n]/.test(value)) throw new Error("An ASSETS.md cell cannot contain a pipe or a newline.");
  return value;
}

function splitRow(line: string): string[] {
  const parts = line.split("|").map((part) => part.trim());
  if (parts[0] === "") parts.shift();
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function docPath(projectDir: string, file: string): string {
  if (file.length === 0) return "";
  if (!path.isAbsolute(file)) return file.split(path.sep).join("/");
  const relative = path.relative(projectDir, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return file.split(path.sep).join("/");
  return relative.split(path.sep).join("/");
}

function formatUsd(usd: number): string {
  return (Math.round(usd * 100) / 100).toFixed(2);
}

async function readOptional(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) return "";
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is AssetSource {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

function isStillResolution(value: string): value is StillPriceResolution {
  return (STILL_RESOLUTIONS as readonly string[]).includes(value);
}

function isVideoFrame(value: string): value is VideoFrame {
  return (VIDEO_FRAMES as readonly string[]).includes(value);
}
