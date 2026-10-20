/**
 * Append-only decision log (BUG-058 idea 31).
 * A direction that was dealt, the one that was picked, and the ones that
 * were rejected each keep a one-line reason. A later phase reads the same
 * file. This module never rewrites or deletes a row.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DirectionDeal } from "./directions.ts";

export class DecisionLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionLogError";
  }
}

export interface DecisionEntry {
  at: string;
  status: "dealt" | "picked" | "rejected" | "phase";
  id: string;
  name: string;
  reason: string;
}

export function decisionLogPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "decisions.jsonl");
}

/**
 * Record the deal, the pick, and every rejection.
 * Rows are appended. A previous rejection stays on disk.
 */
export function recordDirectionChoice(
  projectDir: string,
  deal: DirectionDeal,
  pickedId: string,
  reasons: Readonly<Record<string, string>>,
  at: string,
): DecisionEntry[] {
  const stamp = oneLine(at, "A decision needs a timestamp.");
  if (!Array.isArray(deal.directions) || deal.directions.length === 0) {
    throw new DecisionLogError("A decision needs the directions that were dealt.");
  }
  const ids = new Set<string>();
  for (const direction of deal.directions) {
    if (ids.has(direction.id)) throw new DecisionLogError(`Direction ${direction.id} is listed twice.`);
    ids.add(direction.id);
  }
  if (!ids.has(pickedId)) throw new DecisionLogError(`Unknown direction ${pickedId}.`);
  const rows: DecisionEntry[] = [];
  for (const direction of deal.directions) {
    const reason = oneLine(reasons[direction.id] ?? "", `Direction ${direction.name} needs a one-line reason.`);
    rows.push({ at: stamp, status: "dealt", id: direction.id, name: direction.name, reason });
  }
  for (const direction of deal.directions) {
    const reason = oneLine(reasons[direction.id] ?? "", `Direction ${direction.name} needs a one-line reason.`);
    rows.push({
      at: stamp,
      status: direction.id === pickedId ? "picked" : "rejected",
      id: direction.id,
      name: direction.name,
      reason,
    });
  }
  appendRows(projectDir, rows);
  return rows;
}

/** A finished phase appends one row. Rejected directions stay in the log. */
export function notePhaseFinished(projectDir: string, phase: string, reason: string, at: string): DecisionEntry {
  const row: DecisionEntry = {
    at: oneLine(at, "A decision needs a timestamp."),
    status: "phase",
    id: slug(phase),
    name: oneLine(phase, "A phase needs a name."),
    reason: oneLine(reason, "A phase needs a one-line reason."),
  };
  appendRows(projectDir, [row]);
  return row;
}

export function readDecisionLog(projectDir: string): DecisionEntry[] {
  const file = decisionLogPath(projectDir);
  if (!existsSync(file)) return [];
  const entries: DecisionEntry[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      const entry = asEntry(parsed);
      if (entry !== null) entries.push(entry);
    } catch {
      // A damaged later line does not erase the rows above it.
    }
  }
  return entries;
}

/** Names a later phase can read. Order is the order the rejections were written. */
export function rejectedDirectionNames(projectDir: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of readDecisionLog(projectDir)) {
    if (entry.status !== "rejected" || seen.has(entry.id)) continue;
    seen.add(entry.id);
    names.push(entry.name);
  }
  return names;
}

function appendRows(projectDir: string, rows: readonly DecisionEntry[]): void {
  const file = decisionLogPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

function oneLine(value: string, empty: string): string {
  const text = value.replaceAll("!", ".").replaceAll("\u2014", "-").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (text === "") throw new DecisionLogError(empty);
  return text;
}

function slug(value: string): string {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return text === "" ? "phase" : text;
}

function asEntry(value: unknown): DecisionEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (status !== "dealt" && status !== "picked" && status !== "rejected" && status !== "phase") return null;
  if (typeof row.at !== "string" || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.reason !== "string") {
    return null;
  }
  return { at: row.at, status, id: row.id, name: row.name, reason: row.reason };
}
