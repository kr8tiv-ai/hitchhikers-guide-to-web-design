/**
 * Read and write the five context files under `.hitchhiker/`.
 * Reads reuse the file bytes until size or mtime changes.
 * Fact writes take the existing STATE lock and never call saveState inside it.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "../lock.ts";
import { readUtf8Cached } from "../text-cache.ts";
import { loadState, saveState } from "../state.ts";
import {
  ANSWER_SOURCES,
  type AssetRecord,
  type DecisionKind,
  type DecisionRecord,
  type DecisionSource,
  type ProjectSections,
} from "./types.ts";

const PROJECT_HEADINGS = ["Who", "What", "Audience", "Goals", "Constraints"] as const;
type ProjectHeading = (typeof PROJECT_HEADINGS)[number];

const PROJECT_FIELDS: Record<string, ProjectHeading> = {
  "DP-0.1": "Audience",
  "DP-0.2": "What",
  "DP-0.3": "Who",
  "DP-2.1": "Goals",
  "DP-2.6": "Audience",
};

const CONSTRAINT_IDS = new Set(["DP-9.2", "DP-1.2", "DP-5.3", "DP-6.2"]);

export interface FactInput {
  questionId: string;
  text: string;
  source: DecisionSource | string;
  phase?: string;
  date?: string;
  open?: boolean;
  kind?: DecisionKind;
  context?: string;
  options?: string;
  choice?: string;
  why?: string;
  /** When set, only this decision id is superseded. */
  supersedeId?: string;
}

export interface InterviewFact {
  id: string;
  status: string;
  value: string;
}

interface Memory {
  project: string;
  decisions: DecisionRecord[];
  assets: AssetRecord[];
  summary: string;
  projectDirty: boolean;
  decisionsDirty: boolean;
  assetsDirty: boolean;
  summaryDirty: boolean;
}

function hitch(projectDir: string, name: string): string {
  return path.join(projectDir, ".hitchhiker", name);
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function readText(filePath: string): string | null {
  const text = readUtf8Cached(filePath);
  if (text === null) return null;
  return normalize(text);
}

function emptyProject(): string {
  const sections = PROJECT_HEADINGS.map((heading) => `## ${heading}\n\n`).join("\n");
  return `# Project\n\n${sections}`;
}

function emptyAssets(): string {
  return "# Assets\n\n## Index\n\n| Saved | Original | Role | Question | Status |\n| --- | --- | --- | --- | --- |\n";
}

export function loadProjectMarkdown(projectDir: string): string {
  return readText(hitch(projectDir, "PROJECT.md")) ?? emptyProject();
}

export function loadProjectSections(projectDir: string): ProjectSections {
  return sectionsFrom(loadProjectMarkdown(projectDir));
}

export function loadDecisions(projectDir: string): DecisionRecord[] {
  const text = readText(hitch(projectDir, "DECISIONS.md"));
  if (text === null) return [];
  return parseDecisions(text);
}

export function decisionsFileExists(projectDir: string): boolean {
  return existsSync(hitch(projectDir, "DECISIONS.md"));
}

export function loadAssets(projectDir: string): AssetRecord[] {
  const text = readText(hitch(projectDir, "ASSETS.md"));
  if (text === null) return [];
  return parseAssets(text);
}

export function assetsFileExists(projectDir: string): boolean {
  return existsSync(hitch(projectDir, "ASSETS.md"));
}

export function loadSummary(projectDir: string): string {
  const text = readText(hitch(projectDir, "CONTEXT-SUMMARY.md"));
  if (text === null) return "";
  const body = text.replace(/^# Context summary\s*/i, "");
  return body.trim();
}

export function loadBuildSummary(projectDir: string): string {
  return (readText(hitch(projectDir, "SUMMARY.md")) ?? "").trim();
}

export function readLogoAsset(projectDir: string): AssetRecord | null {
  const file = hitch(projectDir, path.join("brand", "logo-intake.json"));
  try {
    const text = readUtf8Cached(file);
    if (text === null) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { safeName?: unknown; originalName?: unknown; questionId?: unknown };
    if (typeof record.safeName !== "string" || record.safeName.trim() === "") return null;
    const saved = record.safeName.replace(/\\/g, "/");
    const original =
      typeof record.originalName === "string" && record.originalName.trim() !== ""
        ? record.originalName.trim()
        : path.basename(saved);
    const questionId = typeof record.questionId === "string" ? record.questionId : "";
    return { saved, original, role: "logo", questionId, status: "live" };
  } catch {
    return null;
  }
}

export function readInterviewFacts(projectDir: string): InterviewFact[] {
  const file = hitch(projectDir, "interview.json");
  try {
    const text = readUtf8Cached(file);
    if (text === null) return [];
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { answers?: unknown }).answers)
        ? (parsed as { answers: unknown[] }).answers
        : [];
    const latest = new Map<string, InterviewFact>();
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as { id?: unknown; status?: unknown; value?: unknown };
      if (typeof row.id !== "string" || typeof row.value !== "string") continue;
      latest.set(row.id, {
        id: row.id,
        status: typeof row.status === "string" ? row.status : "ANSWERED",
        value: row.value,
      });
    }
    return [...latest.values()];
  } catch {
    return [];
  }
}

export function sourceForInterview(status: string, value: string): DecisionSource {
  if (status === "SUGGESTED") return "suggestion accepted";
  if (status === "SKIPPED" || /^ASSUMED:/i.test(value)) return "skip";
  return "answer";
}

export function displayAnswer(value: string): string {
  return value.replace(/^ASSUMED:\s*/i, "").trim();
}

function sectionsFrom(markdown: string): ProjectSections {
  const bodies = headingBodies(markdown);
  return {
    who: bodies.get("Who") ?? "",
    what: bodies.get("What") ?? "",
    audience: bodies.get("Audience") ?? "",
    goals: bodies.get("Goals") ?? "",
    constraints: bodies.get("Constraints") ?? "",
  };
}

function headingBodies(markdown: string): Map<string, string> {
  const matches = [...markdown.matchAll(/^## (.+)$/gm)];
  const bodies = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined || match.index === undefined) continue;
    const title = match[1]?.trim() ?? "";
    if (title === "") continue;
    const start = match.index + match[0].length;
    const next = matches[index + 1];
    const end = next?.index ?? markdown.length;
    bodies.set(title, markdown.slice(start, end).replace(/^\n+/, "").replace(/\s+$/, ""));
  }
  return bodies;
}

function replaceSection(markdown: string, heading: string, body: string): string {
  const pattern = new RegExp(`(^## ${heading}\\n)([\\s\\S]*?)(?=^## |$)`, "m");
  const next = `\n${body.trim()}\n\n`;
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, `$1${next}`);
  }
  return `${markdown.replace(/\s*$/, "")}\n\n## ${heading}\n${next}`;
}

function projectTouch(questionId: string, text: string, markdown: string): string {
  const mapped = PROJECT_FIELDS[questionId];
  if (mapped !== undefined) {
    if (questionId === "DP-2.6" || questionId === "DP-0.2") {
      const current = headingBodies(markdown).get(mapped) ?? "";
      if (current.includes(text)) return markdown;
      const combined = current.trim() === "" ? text : `${current.trim()}\n${text}`;
      return replaceSection(markdown, mapped, combined);
    }
    return replaceSection(markdown, mapped, text);
  }
  if (!CONSTRAINT_IDS.has(questionId)) return markdown;
  const current = headingBodies(markdown).get("Constraints") ?? "";
  if (current.includes(text)) return markdown;
  const line = `${questionId}: ${text}`;
  const combined = current.trim() === "" ? line : `${current.trim()}\n${line}`;
  return replaceSection(markdown, "Constraints", combined);
}

export function parseDecisions(markdown: string): DecisionRecord[] {
  const text = normalize(markdown);
  const matches = [...text.matchAll(/^## (D-\d+)\s*$/gm)];
  const records: DecisionRecord[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined || match.index === undefined || match[1] === undefined) continue;
    const start = match.index + match[0].length;
    const next = matches[index + 1];
    const chunk = text.slice(start, next?.index ?? text.length);
    records.push(parseDecision(match[1], chunk));
  }
  return records;
}

function parseDecision(id: string, chunk: string): DecisionRecord {
  const record: DecisionRecord = {
    id,
    phase: "",
    questionId: "",
    text: "",
    source: "answer",
    date: "",
    supersededBy: "",
    open: false,
    kind: "decision",
    context: "",
    options: "",
    choice: "",
    why: "",
  };
  const lines = chunk.split("\n");
  let bodyStart = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const field = /^- (Phase|Question|Source|Date|Superseded by|Open|Kind|Context|Options|Choice|Why):\s?(.*)$/.exec(line);
    if (field === null) {
      if (line.trim() === "") continue;
      bodyStart = index;
      break;
    }
    const name = field[1];
    const value = field[2] ?? "";
    if (name === "Phase") record.phase = value;
    else if (name === "Question") record.questionId = value;
    else if (name === "Source") record.source = value;
    else if (name === "Date") record.date = value;
    else if (name === "Superseded by") record.supersededBy = value.trim();
    else if (name === "Open") record.open = value.trim().toLowerCase() === "yes";
    else if (name === "Kind") record.kind = value.trim() === "adr" ? "adr" : "decision";
    else if (name === "Context") record.context = value;
    else if (name === "Options") record.options = value;
    else if (name === "Choice") record.choice = value;
    else if (name === "Why") record.why = value;
    bodyStart = index + 1;
  }
  record.text = lines.slice(bodyStart).join("\n").trim();
  return record;
}

export function renderDecisions(records: readonly DecisionRecord[]): string {
  const blocks = records.map((record) => {
    const lines = [
      `## ${record.id}`,
      "",
      `- Phase: ${record.phase}`,
      `- Question: ${record.questionId}`,
      `- Source: ${record.source}`,
      `- Date: ${record.date}`,
      `- Superseded by: ${record.supersededBy}`,
      `- Open: ${record.open ? "yes" : "no"}`,
      `- Kind: ${record.kind}`,
    ];
    if (record.kind === "adr" || record.context !== "" || record.options !== "" || record.choice !== "" || record.why !== "") {
      lines.push(`- Context: ${record.context}`);
      lines.push(`- Options: ${record.options}`);
      lines.push(`- Choice: ${record.choice}`);
      lines.push(`- Why: ${record.why}`);
    }
    lines.push("", record.text, "");
    return lines.join("\n");
  });
  return `# Decisions\n\n${blocks.join("\n")}`.replace(/\s*$/, "\n");
}

function cell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}

export function parseAssets(markdown: string): AssetRecord[] {
  const records: AssetRecord[] = [];
  for (const line of normalize(markdown).split("\n")) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    const parts = line.split("|").map((part) => part.trim()).filter((part) => part !== "");
    if (parts.length < 5) continue;
    if (parts[0] === "Saved") continue;
    const status = parts[4] === "withdrawn" ? "withdrawn" : "live";
    records.push({
      saved: parts[0] ?? "",
      original: parts[1] ?? "",
      role: parts[2] ?? "other",
      questionId: parts[3] ?? "",
      status,
    });
  }
  return records;
}

export function renderAssets(records: readonly AssetRecord[]): string {
  const rows = records.map(
    (record) =>
      `| ${cell(record.saved)} | ${cell(record.original)} | ${cell(record.role)} | ${cell(record.questionId)} | ${record.status} |`,
  );
  return `${emptyAssets()}${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

function renderSummary(body: string): string {
  return `# Context summary\n\n${body.trim()}\n`;
}

function today(date: string | undefined): string {
  if (date !== undefined && date.trim() !== "") return date.trim();
  return new Date().toISOString().slice(0, 10);
}

function nextId(records: readonly DecisionRecord[]): string {
  let max = 0;
  for (const record of records) {
    const match = /^D-(\d+)$/.exec(record.id);
    if (match?.[1] !== undefined) max = Math.max(max, Number(match[1]));
  }
  return `D-${String(max + 1).padStart(3, "0")}`;
}

function sameFact(record: DecisionRecord, input: FactInput, phase: string, date: string): boolean {
  return (
    record.questionId === input.questionId &&
    record.text === input.text &&
    record.source === input.source &&
    record.phase === phase &&
    record.date === date &&
    record.open === (input.open ?? false) &&
    record.kind === (input.kind ?? "decision")
  );
}

export function upsertDecision(records: DecisionRecord[], input: FactInput, phase: string): DecisionRecord | null {
  const date = today(input.date);
  const text = input.text.trim();
  if (text === "" || input.questionId.trim() === "") return null;
  const existing = records.find(
    (record) =>
      record.supersededBy === "" &&
      record.questionId === input.questionId &&
      record.source === input.source &&
      record.text === text &&
      record.kind === (input.kind ?? "decision"),
  );
  if (existing !== undefined && (input.supersedeId === undefined || existing.id === input.supersedeId)) {
    return null;
  }
  if (existing !== undefined && input.supersedeId === undefined) return null;
  const targets =
    input.supersedeId !== undefined
      ? records.filter((record) => record.id === input.supersedeId && record.supersededBy === "")
      : input.source === "upload"
        ? []
        : records.filter((record) => {
            if (record.supersededBy !== "") return false;
            if (record.questionId !== input.questionId) return false;
            if (input.kind === "adr") return record.kind === "adr";
            return ANSWER_SOURCES.has(record.source);
          });
  if (targets.length === 1 && targets[0] !== undefined && sameFact(targets[0], input, phase, date)) return null;
  const id = nextId(records);
  for (const target of targets) target.supersededBy = id;
  const created: DecisionRecord = {
    id,
    phase,
    questionId: input.questionId,
    text,
    source: input.source,
    date,
    supersededBy: "",
    open: input.open ?? false,
    kind: input.kind ?? "decision",
    context: input.context ?? "",
    options: input.options ?? "",
    choice: input.choice ?? "",
    why: input.why ?? "",
  };
  records.push(created);
  return created;
}

export function upsertAsset(records: AssetRecord[], asset: AssetRecord): boolean {
  const saved = asset.saved.trim();
  const original = asset.original.trim() === "" ? path.basename(saved) : asset.original.trim();
  if (saved === "") return false;
  const found = records.find((record) => record.saved === saved);
  if (found !== undefined) {
    if (
      found.original === original &&
      found.role === asset.role &&
      found.questionId === asset.questionId &&
      found.status === asset.status
    ) {
      return false;
    }
    found.original = original;
    found.role = asset.role;
    found.questionId = asset.questionId;
    found.status = asset.status;
    return true;
  }
  records.push({ saved, original, role: asset.role, questionId: asset.questionId, status: asset.status });
  return true;
}

const mutationTails = new Map<string, Promise<unknown>>();

/**
 * In-process writers share one tail per project. A second upload in this
 * process waits instead of seeing LockHeld from our own pid. A live lock
 * held by another process still throws.
 */
async function mutate(projectDir: string, change: (memory: Memory) => void): Promise<void> {
  const key = path.resolve(projectDir);
  const previous = mutationTails.get(key) ?? Promise.resolve();
  const run = previous.then(
    () => writeUnderLock(projectDir, change),
    () => writeUnderLock(projectDir, change),
  );
  mutationTails.set(key, run);
  try {
    await run;
  } finally {
    if (mutationTails.get(key) === run) mutationTails.delete(key);
  }
}

async function writeUnderLock(projectDir: string, change: (memory: Memory) => void): Promise<void> {
  await withStateLock(projectDir, async () => {
    const memory = readMemory(projectDir);
    change(memory);
    await writeMemory(projectDir, memory);
  });
}

function readMemory(projectDir: string): Memory {
  return {
    project: loadProjectMarkdown(projectDir),
    decisions: loadDecisions(projectDir),
    assets: loadAssets(projectDir),
    summary: loadSummary(projectDir),
    projectDirty: false,
    decisionsDirty: false,
    assetsDirty: false,
    summaryDirty: false,
  };
}

async function writeMemory(projectDir: string, memory: Memory): Promise<void> {
  if (memory.projectDirty) await replaceViaTemp(hitch(projectDir, "PROJECT.md"), memory.project.endsWith("\n") ? memory.project : `${memory.project}\n`);
  if (memory.decisionsDirty) await replaceViaTemp(hitch(projectDir, "DECISIONS.md"), renderDecisions(memory.decisions));
  if (memory.assetsDirty) await replaceViaTemp(hitch(projectDir, "ASSETS.md"), renderAssets(memory.assets));
  if (memory.summaryDirty) await replaceViaTemp(hitch(projectDir, "CONTEXT-SUMMARY.md"), renderSummary(memory.summary));
}

function phaseOf(projectDir: string, given: string | undefined): string {
  if (given !== undefined && given.trim() !== "") return given.trim();
  return loadState(projectDir)?.phase ?? "";
}

export async function recordFact(projectDir: string, input: FactInput): Promise<DecisionRecord | null> {
  let created: DecisionRecord | null = null;
  const phase = phaseOf(projectDir, input.phase);
  await mutate(projectDir, (memory) => {
    created = upsertDecision(memory.decisions, input, phase);
    if (created === null) return;
    memory.decisionsDirty = true;
    if (ANSWER_SOURCES.has(input.source)) {
      const next = projectTouch(input.questionId, input.text.trim(), memory.project);
      if (next !== memory.project) {
        memory.project = next;
        memory.projectDirty = true;
      }
    }
  });
  return created;
}

export async function recordFacts(projectDir: string, inputs: readonly FactInput[]): Promise<DecisionRecord[]> {
  const created: DecisionRecord[] = [];
  const phase = phaseOf(projectDir, inputs[0]?.phase);
  await mutate(projectDir, (memory) => {
    for (const input of inputs) {
      const row = upsertDecision(memory.decisions, { ...input, phase: input.phase ?? phase }, input.phase ?? phase);
      if (row === null) continue;
      created.push(row);
      memory.decisionsDirty = true;
      if (ANSWER_SOURCES.has(input.source)) {
        const next = projectTouch(input.questionId, input.text.trim(), memory.project);
        if (next !== memory.project) {
          memory.project = next;
          memory.projectDirty = true;
        }
      }
    }
  });
  return created;
}

export async function recordAssetFile(projectDir: string, asset: AssetRecord): Promise<DecisionRecord | null> {
  let created: DecisionRecord | null = null;
  await mutate(projectDir, (memory) => {
    const changed = upsertAsset(memory.assets, asset);
    if (!changed && memory.assets.some((row) => row.saved === asset.saved)) {
      const live = memory.decisions.find(
        (row) =>
          row.supersededBy === "" &&
          row.source === "upload" &&
          row.questionId === asset.questionId &&
          row.text === uploadText(asset),
      );
      if (live !== undefined) return;
    }
    if (changed) memory.assetsDirty = true;
    const phase = phaseOf(projectDir, undefined);
    created = upsertDecision(
      memory.decisions,
      {
        questionId: asset.questionId === "" ? "upload" : asset.questionId,
        text: uploadText(asset),
        source: "upload",
        phase,
      },
      phase,
    );
    if (created !== null) memory.decisionsDirty = true;
  });
  return created;
}

function uploadText(asset: AssetRecord): string {
  const original = asset.original.trim() === "" ? path.basename(asset.saved) : asset.original.trim();
  return `${original} role ${asset.role}`;
}

export async function writeSummaryFile(projectDir: string, body: string): Promise<void> {
  await mutate(projectDir, (memory) => {
    if (memory.summary === body.trim()) return;
    memory.summary = body.trim();
    memory.summaryDirty = true;
  });
}

export async function patchCursor(projectDir: string, questionId: string): Promise<void> {
  if (!/^DP-[\w.-]+$/.test(questionId)) return;
  const file = hitch(projectDir, "STATE.md");
  if (!existsSync(file)) return;
  const raw = readText(file) ?? "";
  if (!raw.includes("## Prompt id")) return;
  const state = loadState(projectDir);
  if (state === null) return;
  if (state.promptId !== "" && !state.promptId.startsWith("interview:")) return;
  const promptId = `interview:${questionId}`;
  if (state.promptId === promptId) return;
  await saveState(projectDir, { ...state, promptId });
}

export function inferAssetRole(questionId: string, fileName: string, logoSlot: boolean): string {
  if (logoSlot) return "logo";
  const name = fileName.toLowerCase();
  if (questionId === "DP-1.2") return "palette";
  if (questionId === "DP-1.4") return "mood";
  if (questionId === "DP-1.5") return "font";
  if (questionId === "DP-7.3" || questionId === "DP-3.6") return "photo";
  if (questionId === "DP-6.4") return "3d";
  if ((questionId === "DP-1.1" || questionId === "DP-0.4") && /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) {
    return "brand-kit";
  }
  if (/\b(brand-?guide|guidelines)\b/.test(name) || name.endsWith(".pdf")) return "brand-guide";
  return "other";
}

export function ensureHitch(projectDir: string): void {
  mkdirSync(path.join(projectDir, ".hitchhiker"), { recursive: true });
}

export function isLive(record: DecisionRecord): boolean {
  return record.supersededBy.trim() === "";
}
