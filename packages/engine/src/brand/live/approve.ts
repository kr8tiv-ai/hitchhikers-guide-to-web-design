/**
 * Per-item brand approval.
 * Status lives in `.hitchhiker/brand/approvals.json` so a later reader
 * (brand brain, brand kit) can see pending, approved, and rejected.
 * A rejection with a note is the only state that may be re-drafted,
 * and the re-draft asks the model for that item alone.
 */

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { think } from "../../ai/think.ts";
import { replaceViaTemp, withStateLock } from "../../lock.ts";
import { scanSecrets } from "../brain.ts";
import { evidenceFromAnswers } from "../truth.ts";
import { selectTaglines } from "../voice.ts";
import {
  BRAND_ITEM_REDRAFT_TASK,
  CompetitorSloganError,
  ITEM_REDRAFT_SCHEMA,
  LiveShapeError,
  answerLines,
  assertClaims,
  assertCleanProse,
  competitorPhrases,
  isRecord,
  readString,
  sloganMatch,
  type BrandFacts,
} from "./schemas.ts";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalItem {
  itemId: string;
  kind: string;
  text: string;
  status: ApprovalStatus;
  note?: string;
  style?: string;
}

/** A line before it is stored. recordDraftItems forces status to pending. */
export interface ApprovalDraft {
  itemId: string;
  kind: string;
  text: string;
  note?: string;
  style?: string;
}

export interface ApprovalFile {
  version: 1;
  items: ApprovalItem[];
}

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

export function approvalsPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "brand", "approvals.json");
}

export async function readApprovals(projectDir: string): Promise<ApprovalFile> {
  return readFileBody(approvalsPath(projectDir));
}

export async function recordDraftItems(projectDir: string, items: readonly ApprovalDraft[]): Promise<void> {
  await withStateLock(projectDir, async () => {
    const current = await readFileBody(approvalsPath(projectDir));
    const next = [...current.items];
    for (const item of items) {
      const clean = normalizeItem(item);
      const index = next.findIndex((saved) => saved.itemId === clean.itemId);
      if (index < 0) {
        next.push({ ...clean, status: "pending" });
        continue;
      }
      const saved = next[index];
      if (saved !== undefined && saved.text === clean.text && saved.status !== "pending") continue;
      next[index] = { ...clean, status: "pending" };
    }
    await writeBody(projectDir, { version: 1, items: next });
  });
}

export async function setApproval(
  projectDir: string,
  itemId: string,
  status: "approved" | "rejected",
  note?: string,
): Promise<void> {
  await withStateLock(projectDir, async () => {
    const current = await readFileBody(approvalsPath(projectDir));
    const index = current.items.findIndex((item) => item.itemId === itemId);
    const existing = index < 0 ? undefined : current.items[index];
    if (existing === undefined) throw new ApprovalError(`Unknown approval item: ${itemId}.`);
    const updated: ApprovalItem = {
      itemId: existing.itemId,
      kind: existing.kind,
      text: existing.text,
      status,
    };
    if (existing.style !== undefined) updated.style = existing.style;
    const trimmed = note?.trim() ?? "";
    if (trimmed !== "") updated.note = trimmed;
    else if (status === "rejected" && existing.note !== undefined) updated.note = existing.note;
    scanSecrets(JSON.stringify(updated));
    const items = [...current.items];
    items[index] = updated;
    await writeBody(projectDir, { version: 1, items });
  });
}

/**
 * Re-drafts one rejected item that carries a note.
 * Other items are not sent to the model and are not rewritten.
 */
export async function redraftRejectedItem(
  projectDir: string,
  itemId: string,
  brand: BrandFacts,
  deps: { think: typeof think },
): Promise<ApprovalItem> {
  const current = await readApprovals(projectDir);
  const item = current.items.find((entry) => entry.itemId === itemId);
  if (item === undefined) throw new ApprovalError(`Unknown approval item: ${itemId}.`);
  if (item.status !== "rejected") throw new ApprovalError(`Item ${itemId} is not rejected.`);
  if (item.note === undefined || item.note.trim() === "") {
    throw new ApprovalError("A rejection needs a note before a re-draft.");
  }
  const note = item.note.trim();
  const first = parseRedraft((await deps.think(redraftRequest(item, note, brand))).value);
  const text = acceptRedraft(item, first, brand) ?? (await repairRedraft(item, note, brand, deps, first));
  const updated: ApprovalItem = {
    itemId: item.itemId,
    kind: item.kind,
    text,
    status: "pending",
    note,
  };
  if (item.style !== undefined && item.kind !== "tagline-top") updated.style = item.style;
  await withStateLock(projectDir, async () => {
    const fresh = await readFileBody(approvalsPath(projectDir));
    const index = fresh.items.findIndex((entry) => entry.itemId === itemId);
    if (index < 0) throw new ApprovalError(`Unknown approval item: ${itemId}.`);
    const items = fresh.items.map((entry) => (entry.itemId === itemId ? updated : entry));
    await writeBody(projectDir, { version: 1, items });
  });
  return updated;
}

async function repairRedraft(
  item: ApprovalItem,
  note: string,
  brand: BrandFacts,
  deps: { think: typeof think },
  previous: string | null,
): Promise<string> {
  const second = parseRedraft(
    (await deps.think(redraftRequest(item, note, brand, "The last line failed the shaper."))).value,
  );
  const text = acceptRedraft(item, second, brand);
  if (text === null) {
    if (previous !== null && sloganMatch(previous, competitorPhrases(brand)) !== null) {
      throw new CompetitorSloganError(sloganMatch(previous, competitorPhrases(brand)) ?? previous);
    }
    throw new LiveShapeError(`Re-draft of ${item.itemId} failed the shaper.`);
  }
  return text;
}

function acceptRedraft(item: ApprovalItem, text: string | null, brand: BrandFacts): string | null {
  if (text === null || text.trim() === "") return null;
  const slogan = sloganMatch(text, competitorPhrases(brand));
  if (slogan !== null) return null;
  if (item.kind === "tagline" || item.kind === "tagline-top") {
    const cut = selectTaglines([text]);
    const kept = cut.taglines[0];
    if (kept === undefined) return null;
    try {
      assertClaims(kept, evidenceFromAnswers([...brand.answers]));
    } catch {
      return null;
    }
    return kept;
  }
  try {
    assertCleanProse(item.itemId, text);
    assertClaims(text, evidenceFromAnswers([...brand.answers]));
  } catch {
    return null;
  }
  return text;
}

function redraftRequest(item: ApprovalItem, note: string, brand: BrandFacts, repair?: string) {
  const lines = [
    "Rewrite only this one item.",
    "Do not return the other items.",
    `Item id: ${item.itemId}`,
    `Kind: ${item.kind}`,
    `Current text: ${item.text}`,
    `Rejection note: ${note}`,
    `Brand: ${brand.name}`,
    "Answers:",
    answerLines(brand.answers),
    "No exclamation marks. No em dashes. No banned hype words.",
    "Do not invent testimonials, awards, metrics, or client names.",
    "Do not repeat a competitor slogan.",
  ];
  if (repair !== undefined) lines.push(repair);
  return { task: BRAND_ITEM_REDRAFT_TASK, schema: ITEM_REDRAFT_SCHEMA, input: lines.join("\n") };
}

function parseRedraft(value: unknown): string | null {
  if (!isRecord(value)) return null;
  try {
    const text = readString(value.text, "text");
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

function normalizeItem(item: ApprovalDraft): ApprovalItem {
  const itemId = item.itemId.trim();
  if (itemId === "" || itemId.includes("\n")) throw new ApprovalError("Approval item id is empty.");
  const text = item.text.trim();
  if (text === "") throw new ApprovalError(`Approval item ${itemId} has no text.`);
  const next: ApprovalItem = { itemId, kind: item.kind.trim() || "item", text, status: "pending" };
  if (item.style !== undefined && item.style.trim() !== "") next.style = item.style.trim();
  if (item.note !== undefined && item.note.trim() !== "") next.note = item.note.trim();
  return next;
}

async function readFileBody(file: string): Promise<ApprovalFile> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return { version: 1, items: [] };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApprovalError("approvals.json is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.items)) {
    throw new ApprovalError("approvals.json is not version 1.");
  }
  return { version: 1, items: parsed.items.map((item, index) => parseStored(item, index)) };
}

function parseStored(value: unknown, index: number): ApprovalItem {
  if (!isRecord(value)) throw new ApprovalError(`approvals item ${index + 1} is not an object.`);
  const itemId = value.itemId;
  const kind = value.kind;
  const text = value.text;
  const status = value.status;
  if (typeof itemId !== "string" || itemId.trim() === "") {
    throw new ApprovalError(`approvals item ${index + 1} is missing an id.`);
  }
  if (typeof kind !== "string" || typeof text !== "string") {
    throw new ApprovalError(`approvals item ${index + 1} is missing text.`);
  }
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    throw new ApprovalError(`approvals item ${index + 1} has an unknown status.`);
  }
  const item: ApprovalItem = { itemId, kind, text, status };
  if (typeof value.note === "string" && value.note.trim() !== "") item.note = value.note;
  if (typeof value.style === "string" && value.style.trim() !== "") item.style = value.style;
  return item;
}

async function writeBody(projectDir: string, body: ApprovalFile): Promise<void> {
  const file = approvalsPath(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  scanSecrets(payload);
  await replaceViaTemp(file, payload);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
