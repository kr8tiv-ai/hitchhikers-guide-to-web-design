/**
 * Router, decision records, discuss notes, doctor, undo, and the verify ledger.
 * Status reads do not write. Undo supersedes. It does not delete history.
 * Ledger shape follows the GSD SUMMARY / VERIFICATION templates (MIT), ported.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { think } from "../ai/think.ts";
import { replaceViaTemp, withStateLock } from "../lock.ts";
import { missingRequired, type AnswerRecord } from "../required.ts";
import { loadState, saveState, type GuideState } from "../state.ts";
import { interviewTreeFile } from "../packaged-dir.ts";
import { loadTree, questionsForDepth } from "../tree.ts";
import {
  isLive,
  loadAssets,
  loadDecisions,
  loadSummary,
  patchCursor,
  readInterviewFacts,
  recordFact,
  recordFacts,
  sourceForInterview,
  displayAnswer,
  upsertAsset,
  upsertDecision,
  renderAssets,
  renderDecisions,
  type FactInput,
} from "./disk.ts";
import { readAudit } from "./packet.ts";
import { ANSWER_SOURCES, type AssetRecord, type DecisionRecord, type DoctorFinding, type RouterStatus } from "./types.ts";

const PHASES = [
  "Don't Panic",
  "Babel Fish",
  "Deep Thought",
  "Improbability Drive",
  "Mostly Harmless",
  "So Long, and Thanks for All the Fish",
] as const;

export function phaseNames(): readonly string[] {
  return PHASES;
}

function treeFile(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return interviewTreeFile();
}

function questionIds(projectDir: string): Set<string> {
  try {
    return new Set(loadTree(treeFile(projectDir)).map((question) => question.id));
  } catch {
    return new Set();
  }
}

function answersForGate(projectDir: string): AnswerRecord[] {
  const interview = readInterviewFacts(projectDir);
  if (interview.length > 0) {
    return interview.map((row) => ({
      id: row.id,
      status: (["ANSWERED", "SUGGESTED", "SKIPPED", "SOFT", "IMPORTED"].includes(row.status) ? row.status : "ANSWERED") as AnswerRecord["status"],
      value: row.value,
    }));
  }
  return loadDecisions(projectDir)
    .filter((record) => isLive(record) && ANSWER_SOURCES.has(record.source))
    .map((record) => ({ id: record.questionId, status: "ANSWERED" as const, value: record.text }));
}

export function readStatus(projectDir: string): RouterStatus {
  const state = loadState(projectDir);
  const decisions = loadDecisions(projectDir).filter(isLive);
  const openDecisions = decisions.filter((record) => record.open);
  const unanswered = missingRequired(answersForGate(projectDir));
  const questionId = state?.promptId.startsWith("interview:")
    ? state.promptId.slice("interview:".length)
    : (decisions.filter((record) => ANSWER_SOURCES.has(record.source)).at(-1)?.questionId ?? "");
  let gate: RouterStatus["gate"] = "continue";
  let next = `Continue ${state?.phase ?? "the interview"}.`;
  if (unanswered.length > 0) {
    gate = "answer";
    next = `Answer ${unanswered.join(", ")}.`;
  } else if (openDecisions.length > 0) {
    gate = "decision";
    next = `Settle ${openDecisions.map((record) => record.id).join(", ")}.`;
  }
  return {
    phase: state?.phase ?? "",
    questionId,
    blockers: state?.blockers ?? [],
    openDecisions,
    unanswered,
    next,
    gate,
  };
}

export function assertCanAdvance(projectDir: string): { ok: boolean; reasons: string[] } {
  const status = readStatus(projectDir);
  const reasons: string[] = [];
  if (status.unanswered.length > 0) reasons.push(`Unanswered: ${status.unanswered.join(", ")}.`);
  if (status.openDecisions.length > 0) {
    reasons.push(`Open decisions: ${status.openDecisions.map((record) => record.id).join(", ")}.`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function formatStatusLine(projectDir: string): string {
  try {
    const status = readStatus(projectDir);
    const blockers = status.blockers.length === 0 ? "none" : status.blockers.join(", ");
    const open = status.openDecisions.length === 0 ? "none" : status.openDecisions.map((record) => record.id).join(", ");
    const phase = status.phase === "" ? "No phase yet" : status.phase;
    return `${phase}. Next: ${status.next} Blockers: ${blockers}. Open decisions: ${open}.`;
  } catch {
    return "Context status is unreadable.";
  }
}

interface Advisory {
  questionId: string;
  context: string;
  options: string;
  why: string;
  links: string[];
}

const ADVISORIES: readonly Advisory[] = [
  {
    questionId: "adr:stack",
    context: "The build needs one stack.",
    options: "Astro, Next, or Vite.",
    why: "DP-4.1 chooses the stack the later prompts assume.",
    links: ["DP-4.1"],
  },
  {
    questionId: "adr:motion",
    context: "Motion level has to agree with how calm the brand is.",
    options: "Keep the calm voice and lower motion, or raise motion and say so.",
    why: "DP-5.3 and DP-6.2 pull against each other when one is calm and the other is high.",
    links: ["DP-5.3", "DP-6.2"],
  },
  {
    questionId: "adr:hosting",
    context: "Launch needs a host.",
    options: "Hostinger, or another host the person names.",
    why: "DP-9.2 is the hosting decision.",
    links: ["DP-9.2"],
  },
];

function answerText(projectDir: string, id: string): string {
  const interview = readInterviewFacts(projectDir).find((row) => row.id === id);
  if (interview !== undefined) return displayAnswer(interview.value);
  const decision = loadDecisions(projectDir).find((row) => isLive(row) && row.questionId === id && ANSWER_SOURCES.has(row.source));
  return decision?.text ?? "";
}

export async function writePhaseAdvisories(projectDir: string, date?: string): Promise<DecisionRecord[]> {
  const inputs: FactInput[] = [];
  const live = loadDecisions(projectDir).filter((record) => isLive(record) && record.kind === "adr");
  for (const advisory of ADVISORIES) {
    if (live.some((record) => record.questionId === advisory.questionId)) continue;
    const linked = advisory.links.map((id) => `${id}: ${answerText(projectDir, id) || "not stated"}`).join(" ");
    const choice = advisory.links.map((id) => answerText(projectDir, id)).find((value) => value !== "" && !/no idea/i.test(value)) ?? "";
    const open = choice === "";
    inputs.push({
      questionId: advisory.questionId,
      text: open ? `${advisory.context} Still open. ${linked}` : `${advisory.context} Choice: ${choice}. ${linked}`,
      source: "approval",
      ...(date === undefined ? {} : { date }),
      open,
      kind: "adr",
      context: advisory.context,
      options: advisory.options,
      choice: choice === "" ? "open" : choice,
      why: advisory.why,
    });
  }
  if (inputs.length === 0) return [];
  return recordFacts(projectDir, inputs);
}

export interface DiscussNote {
  id: string;
  questionId: string;
  date: string;
  text: string;
}

function discussPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "DISCUSS.md");
}

export function loadNotes(projectDir: string): DiscussNote[] {
  if (!existsSync(discussPath(projectDir))) return [];
  const text = readFileSync(discussPath(projectDir), "utf8").replace(/\r\n/g, "\n");
  const matches = [...text.matchAll(/^## (N-\d+)\s*$/gm)];
  const notes: DiscussNote[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined || match.index === undefined || match[1] === undefined) continue;
    const start = match.index + match[0].length;
    const next = matches[index + 1];
    const chunk = text.slice(start, next?.index ?? text.length);
    const question = /^- Question:\s?(.*)$/m.exec(chunk)?.[1]?.trim() ?? "";
    const date = /^- Date:\s?(.*)$/m.exec(chunk)?.[1]?.trim() ?? "";
    const body = chunk.replace(/^- Question:.*$/m, "").replace(/^- Date:.*$/m, "").trim();
    notes.push({ id: match[1], questionId: question, date, text: body });
  }
  return notes;
}

function renderNotes(notes: readonly DiscussNote[]): string {
  const blocks = notes.map((note) => `## ${note.id}\n\n- Question: ${note.questionId}\n- Date: ${note.date}\n\n${note.text}\n`);
  return `# Notes\n\n${blocks.join("\n")}`;
}

export async function recordDiscussNote(projectDir: string, text: string, questionId = "", date?: string): Promise<DiscussNote | null> {
  const body = text.trim();
  if (body === "") return null;
  let created: DiscussNote | null = null;
  await withStateLock(projectDir, async () => {
    const notes = loadNotes(projectDir);
    let max = 0;
    for (const note of notes) {
      const match = /^N-(\d+)$/.exec(note.id);
      if (match?.[1] !== undefined) max = Math.max(max, Number(match[1]));
    }
    created = {
      id: `N-${String(max + 1).padStart(3, "0")}`,
      questionId,
      date: date ?? new Date().toISOString().slice(0, 10),
      text: body,
    };
    notes.push(created);
    await replaceViaTemp(discussPath(projectDir), renderNotes(notes));
  });
  return created;
}

export async function promoteDiscuss(projectDir: string, noteId: string, date?: string): Promise<DecisionRecord | null> {
  const note = loadNotes(projectDir).find((row) => row.id === noteId);
  if (note === undefined) return null;
  return recordFact(projectDir, {
    questionId: note.questionId === "" ? "discuss" : note.questionId,
    text: note.text,
    source: "discuss",
    ...(date === undefined ? {} : { date }),
  });
}

export function auditContext(projectDir: string): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const dir = path.resolve(projectDir);
  const decisions = loadDecisions(dir);
  const liveIds = new Set(
    decisions.filter((record) => isLive(record) && ANSWER_SOURCES.has(record.source)).map((record) => record.questionId),
  );
  for (const row of readInterviewFacts(dir)) {
    if (row.value.trim() === "") continue;
    if (!liveIds.has(row.id)) {
      findings.push({
        file: "DECISIONS.md",
        problem: `${row.id} has an answer and no decision.`,
        fix: `hh context repair --decisions --project ${dir}`,
      });
    }
  }
  for (const asset of loadAssets(dir)) {
    if (asset.status !== "live") continue;
    const uploads = path.join(dir, ".hitchhiker", "uploads", asset.saved);
    const direct = path.join(dir, ".hitchhiker", asset.saved);
    if (!existsSync(uploads) && !existsSync(direct)) {
      findings.push({
        file: "ASSETS.md",
        problem: `${asset.saved} is indexed and missing on disk.`,
        fix: `hh context repair --assets --project ${dir}`,
      });
    }
  }
  const state = loadState(dir);
  if (state !== null) {
    const ids = questionIds(dir);
    const cursor = state.promptId.startsWith("interview:") ? state.promptId.slice("interview:".length) : "";
    if (cursor === "" || !ids.has(cursor)) {
      findings.push({
        file: "STATE.md",
        problem: `Cursor ${state.promptId === "" ? "is empty" : state.promptId} is not a real question.`,
        fix: `hh context repair --cursor --project ${dir}`,
      });
    }
  }
  return findings;
}

export async function repairDecisions(projectDir: string): Promise<number> {
  const inputs: FactInput[] = readInterviewFacts(projectDir).map((row) => ({
    questionId: row.id,
    text: displayAnswer(row.value),
    source: sourceForInterview(row.status, row.value),
  }));
  const created = await recordFacts(projectDir, inputs.filter((row) => row.text !== ""));
  return created.length;
}

export async function repairAssets(projectDir: string): Promise<number> {
  let changed = 0;
  await withStateLock(projectDir, async () => {
    const assets = loadAssets(projectDir);
    const decisions = loadDecisions(projectDir);
    let dirtyAssets = false;
    let dirtyDecisions = false;
    for (const asset of assets) {
      if (asset.status !== "live") continue;
      const uploads = path.join(projectDir, ".hitchhiker", "uploads", asset.saved);
      const direct = path.join(projectDir, ".hitchhiker", asset.saved);
      if (existsSync(uploads) || existsSync(direct)) continue;
      if (upsertAsset(assets, { ...asset, status: "withdrawn" })) dirtyAssets = true;
      const row = upsertDecision(
        decisions,
        { questionId: asset.questionId === "" ? "upload" : asset.questionId, text: `Withdrawn. ${asset.original}`, source: "upload" },
        loadState(projectDir)?.phase ?? "",
      );
      if (row !== null) dirtyDecisions = true;
      changed += 1;
    }
    if (dirtyAssets) await replaceViaTemp(path.join(projectDir, ".hitchhiker", "ASSETS.md"), renderAssets(assets));
    if (dirtyDecisions) await replaceViaTemp(path.join(projectDir, ".hitchhiker", "DECISIONS.md"), renderDecisions(decisions));
  });
  return changed;
}

export async function repairCursor(projectDir: string): Promise<string> {
  const ids = questionIds(projectDir);
  const latest = [...readInterviewFacts(projectDir)].reverse().find((row) => ids.has(row.id));
  let fallback = "";
  try {
    fallback = questionsForDepth(loadTree(treeFile(projectDir)), "standard")[0]?.id ?? "";
  } catch {
    fallback = [...ids][0] ?? "";
  }
  const questionId = latest?.id ?? fallback;
  if (questionId === "") return "";
  const state = loadState(projectDir);
  const next: GuideState = state ?? {
    phase: "Don't Panic",
    slice: "",
    promptId: "",
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Answer ${questionId}.`,
    updatedAt: new Date().toISOString(),
  };
  await saveState(projectDir, { ...next, promptId: `interview:${questionId}` });
  return questionId;
}

export async function undoLast(projectDir: string, kind: "answer" | "upload"): Promise<DecisionRecord | null> {
  const decisions = loadDecisions(projectDir);
  let target: DecisionRecord | undefined;
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    const record = decisions[index];
    if (record === undefined || !isLive(record)) continue;
    if (kind === "upload" && record.source === "upload") {
      target = record;
      break;
    }
    if (kind === "answer" && ANSWER_SOURCES.has(record.source)) {
      target = record;
      break;
    }
  }
  if (target === undefined) return null;
  const created = await recordFact(projectDir, {
    questionId: target.questionId,
    text: `Withdrawn. ${target.text}`,
    source: kind === "upload" ? "upload" : target.source,
    supersedeId: target.id,
  });
  if (kind === "upload") {
    await withStateLock(projectDir, async () => {
      const assets = loadAssets(projectDir);
      const match = assets.find((asset) => asset.questionId === target?.questionId && asset.status === "live" && target.text.includes(asset.original));
      if (match === undefined) return;
      upsertAsset(assets, { ...match, status: "withdrawn" });
      await replaceViaTemp(path.join(projectDir, ".hitchhiker", "ASSETS.md"), renderAssets(assets));
    });
  }
  return created;
}

export interface LedgerEntry {
  sha: string;
  passed: boolean;
  at: string;
}

function ledgerPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "verify-ledger.json");
}

export function readLedger(projectDir: string): LedgerEntry[] {
  if (!existsSync(ledgerPath(projectDir))) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(ledgerPath(projectDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as { entries?: unknown }).entries)) return [];
    const entries: LedgerEntry[] = [];
    for (const item of (parsed as { entries: unknown[] }).entries) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as { sha?: unknown; passed?: unknown; at?: unknown };
      if (typeof row.sha !== "string" || typeof row.passed !== "boolean") continue;
      entries.push({ sha: row.sha, passed: row.passed, at: typeof row.at === "string" ? row.at : "" });
    }
    return entries;
  } catch {
    return [];
  }
}

export function gateForSha(projectDir: string, sha: string): { reuse: boolean; entry: LedgerEntry | null } {
  const found = [...readLedger(projectDir)].reverse().find((entry) => entry.sha === sha && entry.passed);
  if (found === undefined) return { reuse: false, entry: null };
  return { reuse: true, entry: found };
}

export async function recordVerification(
  projectDir: string,
  input: { sha: string; passed: boolean; summary: string; at?: string },
): Promise<LedgerEntry> {
  const entry: LedgerEntry = { sha: input.sha, passed: input.passed, at: input.at ?? new Date().toISOString() };
  await withStateLock(projectDir, async () => {
    const entries = readLedger(projectDir);
    entries.push(entry);
    const summary = [
      "# Summary",
      "",
      "## What shipped",
      "",
      input.summary.trim(),
      "",
      "## Base",
      "",
      input.sha,
      "",
    ].join("\n");
    const verification = [
      "# Verification",
      "",
      "## Gate",
      "",
      input.passed ? "pass" : "fail",
      "",
      "## Base",
      "",
      input.sha,
      "",
    ].join("\n");
    const hitch = path.join(projectDir, ".hitchhiker");
    await replaceViaTemp(path.join(hitch, "SUMMARY.md"), summary);
    await replaceViaTemp(path.join(hitch, "VERIFICATION.md"), verification);
    await replaceViaTemp(ledgerPath(projectDir), `${JSON.stringify({ entries }, null, 2)}\n`);
  });
  return entry;
}

export async function runGate(
  projectDir: string,
  sha: string,
  run: () => Promise<{ passed: boolean; summary: string }>,
): Promise<{ reused: boolean; passed: boolean }> {
  const gate = gateForSha(projectDir, sha);
  if (gate.reuse && gate.entry !== null) return { reused: true, passed: true };
  const result = await run();
  await recordVerification(projectDir, { sha, passed: result.passed, summary: result.summary });
  return { reused: false, passed: result.passed };
}

export interface LookaheadItem {
  questionId: string;
  text: string;
  source?: string;
}

function lookaheadPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "next", "track.json");
}

export async function recordLookahead(projectDir: string, items: readonly LookaheadItem[]): Promise<void> {
  await withStateLock(projectDir, async () => {
    mkdirSync(path.dirname(lookaheadPath(projectDir)), { recursive: true });
    await replaceViaTemp(lookaheadPath(projectDir), `${JSON.stringify({ promoted: false, items }, null, 2)}\n`);
  });
}

export async function promoteLookahead(projectDir: string, date?: string): Promise<number> {
  if (!existsSync(lookaheadPath(projectDir))) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(lookaheadPath(projectDir), "utf8"));
  } catch {
    return 0;
  }
  if (typeof parsed !== "object" || parsed === null) return 0;
  const body = parsed as { promoted?: unknown; items?: unknown };
  if (body.promoted === true || !Array.isArray(body.items)) return 0;
  const inputs: FactInput[] = [];
  for (const item of body.items) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { questionId?: unknown; text?: unknown; source?: unknown };
    if (typeof row.questionId !== "string" || typeof row.text !== "string") continue;
    inputs.push({
      questionId: row.questionId,
      text: row.text,
      source: typeof row.source === "string" ? row.source : "answer",
      ...(date === undefined ? {} : { date }),
    });
  }
  const created = await recordFacts(projectDir, inputs);
  await withStateLock(projectDir, async () => {
    await replaceViaTemp(
      lookaheadPath(projectDir),
      `${JSON.stringify({ promoted: true, at: date ?? new Date().toISOString(), items: [] }, null, 2)}\n`,
    );
  });
  return created.length;
}

export interface PhaseStatRow {
  phase: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export function readPhaseStats(projectDir: string): PhaseStatRow[] {
  const file = path.join(projectDir, ".hitchhiker", "phase-stats.json");
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    const rows: PhaseStatRow[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as { phase?: unknown; inputTokens?: unknown; outputTokens?: unknown; durationMs?: unknown };
      if (typeof row.phase !== "string") continue;
      rows.push({
        phase: row.phase,
        inputTokens: typeof row.inputTokens === "number" ? row.inputTokens : 0,
        outputTokens: typeof row.outputTokens === "number" ? row.outputTokens : 0,
        durationMs: typeof row.durationMs === "number" ? row.durationMs : 0,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export function renderContextText(projectDir: string, audit = false): string {
  const status = readStatus(projectDir);
  const summary = loadSummary(projectDir);
  const decisions = loadDecisions(projectDir);
  const assets = loadAssets(projectDir);
  const lines = [
    "What the Guide knows",
    "",
    `Phase: ${status.phase === "" ? "none" : status.phase}`,
    `Question: ${status.questionId === "" ? "none" : status.questionId}`,
    "",
    "Summary:",
    summary === "" ? "none" : summary,
    "",
    "Decisions:",
  ];
  if (decisions.length === 0) lines.push("none");
  for (const record of decisions) {
    const state = record.supersededBy === "" ? "live" : `superseded by ${record.supersededBy}`;
    lines.push(`- ${record.id} ${record.phase} ${record.source} ${state}: ${record.text}`);
  }
  lines.push("", "Assets:");
  if (assets.length === 0) lines.push("none");
  for (const asset of assets) {
    lines.push(`- ${asset.original} saved ${asset.saved} role ${asset.role} question ${asset.questionId} ${asset.status}`);
  }
  if (audit) {
    lines.push("", "Last call:");
    const last = readAudit(projectDir);
    if (last === null) lines.push("No context audit yet.");
    else {
      lines.push(`Purpose: ${last.purpose}`);
      lines.push(`Sections: ${last.sections.join(", ")}`);
      lines.push(`Trimmed: ${last.trimmed.length === 0 ? "none" : last.trimmed.join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function syncInterviewFacts(
  projectDir: string,
  options: { summarize?: boolean; moveCursor?: boolean; think?: typeof think } = {},
): Promise<DecisionRecord[]> {
  const inputs: FactInput[] = [];
  for (const row of readInterviewFacts(projectDir)) {
    const text = displayAnswer(row.value);
    if (text === "") continue;
    inputs.push({ questionId: row.id, text, source: sourceForInterview(row.status, row.value) });
  }
  const created = await recordFacts(projectDir, inputs);
  // The interview lock already writes the next question into STATE.
  // Patch only a blank cursor. Do not pull the prompt id back to the last answer.
  if (options.moveCursor !== false) {
    const state = loadState(projectDir);
    const cursor = inputs.at(-1)?.questionId;
    if (state !== null && state.promptId === "" && cursor !== undefined) await patchCursor(projectDir, cursor);
  }
  const answered = created.some((record) => record.source !== "skip");
  if (options.summarize !== false && answered) {
    const { refreshSummary } = await import("./packet.ts");
    await refreshSummary(projectDir, options.think);
  }
  return created;
}
