/**
 * Elevate round ledger (spec 243-02, E4).
 *
 * Each round updates `.hitchhiker/elevate/ROUNDS.md` and `rounds.json`
 * with the picks, what was kept, what was reverted and why, the scores,
 * and the shot paths. Reasons stay in plain language.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ElevateLedgerPick {
  id: string;
  file: string;
  change: string;
}

export interface ElevateLedgerRevert {
  id: string;
  reason: string;
}

export interface ElevateLedgerScores {
  beauty: number;
  jury: number;
}

export interface ElevateLedgerRound {
  round: number;
  picks: ElevateLedgerPick[];
  kept: string[];
  reverted: ElevateLedgerRevert[];
  scores: ElevateLedgerScores | null;
  shots: string[];
}

export interface ElevateLedger {
  rounds: ElevateLedgerRound[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneLine(value: string): string {
  return value.replaceAll("!", ".").replaceAll("\u2014", "-").replace(/[\r\n]+/g, " ").trim();
}

export function elevateLedgerDir(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "elevate");
}

function asRound(value: unknown): ElevateLedgerRound | null {
  if (!isRecord(value) || typeof value.round !== "number" || !Number.isInteger(value.round)) return null;
  return value as unknown as ElevateLedgerRound;
}

export async function readElevateLedger(projectDir: string): Promise<ElevateLedger> {
  const file = path.join(elevateLedgerDir(projectDir), "rounds.json");
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.rounds)) return { rounds: [] };
    const rounds: ElevateLedgerRound[] = [];
    for (const row of parsed.rounds) {
      const round = asRound(row);
      if (round !== null) rounds.push(round);
    }
    return { rounds };
  } catch {
    return { rounds: [] };
  }
}

function renderRounds(ledger: ElevateLedger): string {
  const lines = ["# Elevate rounds", ""];
  if (ledger.rounds.length === 0) {
    lines.push("No rounds yet.", "");
    return lines.join("\n");
  }
  for (const round of ledger.rounds) {
    lines.push(`## Round ${round.round}`, "", "Picks:");
    if (round.picks.length === 0) lines.push("None.");
    else {
      for (const pick of round.picks) {
        lines.push(`- ${pick.id}. ${oneLine(pick.file)}: ${oneLine(pick.change)}`);
      }
    }
    lines.push("", "Kept:");
    if (round.kept.length === 0) lines.push("None.");
    else for (const id of round.kept) lines.push(`- ${id}`);
    lines.push("", "Reverted:");
    if (round.reverted.length === 0) lines.push("None.");
    else for (const row of round.reverted) lines.push(`- ${row.id}. ${oneLine(row.reason)}`);
    lines.push("", "Scores:");
    if (round.scores === null) lines.push("Not measured this round.");
    else {
      lines.push(`- Design ${round.scores.beauty}`);
      lines.push(`- Jury ${round.scores.jury}`);
    }
    lines.push("", "Shots:");
    if (round.shots.length === 0) lines.push("None.");
    else for (const shot of round.shots) lines.push(`- ${shot}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Replace the row for this round, then write both ledger files. */
export async function writeElevateRound(projectDir: string, entry: ElevateLedgerRound): Promise<void> {
  const dir = elevateLedgerDir(projectDir);
  await mkdir(dir, { recursive: true });
  const current = await readElevateLedger(projectDir);
  const rounds = current.rounds.filter((row) => row.round !== entry.round);
  rounds.push(entry);
  rounds.sort((left, right) => left.round - right.round);
  const ledger: ElevateLedger = { rounds };
  await writeFile(path.join(dir, "rounds.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await writeFile(path.join(dir, "ROUNDS.md"), renderRounds(ledger), "utf8");
}
