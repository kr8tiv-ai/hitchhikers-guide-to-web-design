/**
 * One context packet for every Grok call. The packet is redacted on the way
 * out. On-disk notes stay as the person wrote them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redact } from "../ai/redact.ts";
import { appendAiOutcome, type think, type ThinkRequest } from "../ai/think.ts";
import { INTERVIEW_EFFORT_DEFAULT, INTERVIEW_MODEL } from "../guide/interview-call.ts";
import type { Facts } from "../guide/schemas.ts";
import {
  assetsFileExists,
  decisionsFileExists,
  isLive,
  loadAssets,
  loadBuildSummary,
  loadDecisions,
  loadProjectSections,
  loadSummary,
  readLogoAsset,
  writeSummaryFile,
} from "./disk.ts";
import { loadState } from "../state.ts";
import {
  ANSWER_SOURCES,
  DEFAULT_RECENT_LIMIT,
  DEFAULT_TOKEN_BUDGET,
  PACKET_SECTIONS,
  SUMMARY_WORD_CAP,
  type AssetRecord,
  type ContextAudit,
  type ContextPacket,
  type DecisionRecord,
  type RecentAnswer,
} from "./types.ts";

const SUMMARY_SCHEMA = {
  type: "object",
  required: ["summary"],
  properties: { summary: { type: "string" } },
} as const;

export interface PacketOptions {
  budgetTokens?: number;
  recentLimit?: number;
}

export function emptyContextPacket(purpose = "empty"): ContextPacket {
  return {
    purpose,
    project: { who: "", what: "", audience: "", goals: "", constraints: "" },
    decisions: [],
    assets: [],
    phase: "",
    questionId: "",
    summary: "",
    recent: [],
    buildSummary: "",
    trimmed: [],
    budgetTokens: 0,
    estimatedTokens: 0,
  };
}

export function budgetFromEnv(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) return Math.floor(override);
  const raw = process.env.HH_CONTEXT_TOKEN_BUDGET;
  if (raw !== undefined && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return DEFAULT_TOKEN_BUDGET;
}

export function liveAssets(projectDir: string): AssetRecord[] {
  const indexed = loadAssets(projectDir).filter((asset) => asset.status === "live");
  const logo = readLogoAsset(projectDir);
  if (logo === null) return indexed;
  const known = indexed.some((asset) => asset.saved === logo.saved || path.basename(asset.saved) === path.basename(logo.saved));
  if (known) return indexed;
  return [...indexed, logo];
}

export function buildContextPacket(projectDir: string, purpose: string, options: PacketOptions = {}): ContextPacket {
  const allDecisions = loadDecisions(projectDir);
  const decisions = allDecisions.filter(isLive);
  const assets = liveAssets(projectDir);
  const state = loadState(projectDir);
  const recentAll = recentAnswers(allDecisions, options.recentLimit ?? DEFAULT_RECENT_LIMIT);
  const packet: ContextPacket = {
    purpose,
    project: loadProjectSections(projectDir),
    decisions,
    assets,
    phase: state?.phase ?? "",
    questionId: questionFrom(state?.promptId ?? "", decisions),
    summary: loadSummary(projectDir),
    recent: recentAll,
    buildSummary: loadBuildSummary(projectDir),
    trimmed: [],
    budgetTokens: budgetFromEnv(options.budgetTokens),
    estimatedTokens: 0,
  };
  trimPacket(packet);
  packet.estimatedTokens = estimate(renderContextPacket(packet));
  return packet;
}

function recentAnswers(records: readonly DecisionRecord[], limit: number): RecentAnswer[] {
  const rows = records.filter((record) => ANSWER_SOURCES.has(record.source) && record.text.trim() !== "");
  const slice = rows.slice(Math.max(0, rows.length - limit));
  return slice.map((record) => ({ id: record.id, questionId: record.questionId, text: record.text }));
}

function questionFrom(promptId: string, decisions: readonly DecisionRecord[]): string {
  if (promptId.startsWith("interview:")) return promptId.slice("interview:".length);
  for (let index = decisions.length - 1; index >= 0; index -= 1) {
    const row = decisions[index];
    if (row !== undefined && ANSWER_SOURCES.has(row.source)) return row.questionId;
  }
  return "";
}

export function renderContextPacket(packet: ContextPacket): string {
  const project = packet.project;
  const decisions = packet.decisions.map(
    (record) => `- ${record.id} ${record.questionId} ${record.source}: ${record.text}`,
  );
  const assets = packet.assets.map(
    (asset) => `- ${asset.original} role ${asset.role} question ${asset.questionId}`,
  );
  const recent = packet.recent.map((row) => `- ${row.id} ${row.questionId}: ${row.text}`);
  const trimmed = packet.trimmed.length === 0 ? "none" : packet.trimmed.join(", ");
  return [
    "## Context packet",
    "",
    `Purpose: ${packet.purpose}`,
    "",
    "### Project",
    "",
    `Who: ${project.who}`,
    `What: ${project.what}`,
    `Audience: ${project.audience}`,
    `Goals: ${project.goals}`,
    `Constraints: ${project.constraints}`,
    "",
    "### Decisions",
    "",
    decisions.length === 0 ? "none" : decisions.join("\n"),
    "",
    "### Assets",
    "",
    assets.length === 0 ? "none" : assets.join("\n"),
    "",
    "### Phase",
    "",
    packet.phase === "" ? "unknown" : packet.phase,
    "",
    "### Question",
    "",
    packet.questionId === "" ? "none" : packet.questionId,
    "",
    "### Summary",
    "",
    packet.summary === "" ? "none" : packet.summary,
    "",
    "### Recent answers",
    "",
    recent.length === 0 ? "none" : recent.join("\n"),
    "",
    "### Build summaries",
    "",
    packet.buildSummary === "" ? "none" : packet.buildSummary,
    "",
    "### Trimmed",
    "",
    trimmed,
    "",
  ].join("\n");
}

function estimate(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimPacket(packet: ContextPacket): void {
  packet.estimatedTokens = estimate(renderContextPacket(packet));
  while (packet.estimatedTokens > packet.budgetTokens && packet.recent.length > 0) {
    const dropped = packet.recent.shift();
    if (dropped !== undefined) packet.trimmed.push(dropped.id);
    packet.estimatedTokens = estimate(renderContextPacket(packet));
  }
  if (packet.estimatedTokens > packet.budgetTokens && packet.buildSummary !== "") {
    packet.buildSummary = "";
    packet.trimmed.push("build-summary");
    packet.estimatedTokens = estimate(renderContextPacket(packet));
  }
  if (packet.estimatedTokens > packet.budgetTokens) packet.trimmed.push("over-budget");
}

export function factsFromPacket(packet: ContextPacket, base?: Facts): Facts {
  const answers = new Map<string, { value: string; status?: string }>();
  for (const answer of base?.answers ?? []) {
    const entry: { value: string; status?: string } = { value: answer.value };
    if (answer.status !== undefined && answer.status !== "") entry.status = answer.status;
    answers.set(answer.id, entry);
  }
  for (const record of packet.decisions) {
    if (!ANSWER_SOURCES.has(record.source)) continue;
    if (record.questionId.trim() === "") continue;
    answers.set(record.questionId, { value: record.text });
  }
  const uploads = new Set<string>(base?.uploads ?? []);
  for (const asset of packet.assets) {
    const original = path.basename(asset.original);
    const saved = path.basename(asset.saved);
    if (original !== "") uploads.add(original);
    if (saved !== "") uploads.add(saved);
  }
  const facts: Facts = {
    answers: [...answers.entries()].map(([id, entry]) =>
      entry.status === undefined ? { id, value: entry.value } : { id, value: entry.value, status: entry.status },
    ),
    uploads: [...uploads],
    crawlNotes: [...(base?.crawlNotes ?? [])],
  };
  if (base?.industry !== undefined && base.industry !== "") facts.industry = base.industry;
  return facts;
}

export function applyContextFacts(projectDir: string, facts: Facts): Facts {
  const packet = emptyContextPacket("facts");
  if (decisionsFileExists(projectDir)) packet.decisions = loadDecisions(projectDir).filter(isLive);
  if (assetsFileExists(projectDir)) packet.assets = loadAssets(projectDir).filter((asset) => asset.status === "live");
  const logo = readLogoAsset(projectDir);
  if (logo !== null && !packet.assets.some((asset) => asset.saved === logo.saved)) packet.assets.push(logo);
  if (packet.decisions.length === 0 && packet.assets.length === 0 && !decisionsFileExists(projectDir) && !assetsFileExists(projectDir)) {
    if (logo === null) return facts;
  }
  return factsFromPacket(packet, facts);
}

function writeAudit(projectDir: string, purpose: string, packet: ContextPacket): void {
  if (projectDir.trim() === "") return;
  const audit: ContextAudit = {
    purpose,
    sections: [...PACKET_SECTIONS],
    trimmed: [...packet.trimmed],
    at: new Date().toISOString(),
  };
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "context-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}

export function readAudit(projectDir: string): ContextAudit | null {
  const file = path.join(projectDir, ".hitchhiker", "context-audit.json");
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as { purpose?: unknown; sections?: unknown; trimmed?: unknown; at?: unknown };
    if (typeof record.purpose !== "string" || !Array.isArray(record.sections) || !Array.isArray(record.trimmed)) return null;
    return {
      purpose: record.purpose,
      sections: record.sections.filter((item): item is string => typeof item === "string"),
      trimmed: record.trimmed.filter((item): item is string => typeof item === "string"),
      at: typeof record.at === "string" ? record.at : "",
    };
  } catch {
    return null;
  }
}

function withPacketText(input: string, packetText: string): string {
  if (input.includes("## Context packet")) return input;
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return JSON.stringify({ ...parsed, contextPacket: packetText });
      }
    } catch {
      // Prose that starts with a brace stays prose, with the packet after it.
    }
  }
  return `${input}\n\n${packetText}`;
}

export async function withContextPacket<T>(
  projectDir: string,
  purpose: string,
  req: ThinkRequest<T>,
  packet?: ContextPacket,
  options?: PacketOptions,
): Promise<ThinkRequest<T>> {
  const resolved = packet ?? (projectDir.trim() !== "" ? buildContextPacket(projectDir, purpose, options ?? {}) : undefined);
  if (resolved === undefined) throw new Error("A context packet is required.");
  const input = withPacketText(req.input, redact(renderContextPacket(resolved)));
  if (projectDir.trim() !== "") {
    const dir = projectDir;
    const why = purpose;
    const body = resolved;
    setTimeout(() => {
      try {
        writeAudit(dir, why, body);
      } catch {
        // The audit file must not sit in front of the model call.
      }
    }, 0);
  }
  return { ...req, input };
}

export function bindPacket(
  thinkFn: typeof think,
  projectDir: string,
  purpose: string,
  options?: PacketOptions,
): typeof think {
  if (projectDir.trim() === "") return thinkFn;
  const wrapped: typeof think = async (req, deps) => {
    // The summary call builds its own incremental prompt. A second packet would paste the history back on.
    if (req.task === "context-summary") return thinkFn(req, deps);
    // Judge and other callers already pasted a packet. Building another one does not change the prompt.
    if (req.input.includes("## Context packet")) return thinkFn(req, deps);
    const next = await withContextPacket(projectDir, purpose, req, undefined, options);
    return thinkFn(next, deps);
  };
  return wrapped;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

export function missingSummaryFacts(summary: string, decisions: readonly DecisionRecord[], assets: readonly AssetRecord[]): string[] {
  const missing: string[] = [];
  for (const record of decisions) {
    if (!summary.includes(record.id)) missing.push(record.id);
  }
  for (const asset of assets) {
    const original = path.basename(asset.original);
    const saved = path.basename(asset.saved);
    if (original !== "" && !summary.includes(original)) missing.push(original);
    if (saved !== "" && saved !== original && !summary.includes(saved)) missing.push(saved);
  }
  return missing;
}

export function summaryAccepts(summary: string, decisions: readonly DecisionRecord[], assets: readonly AssetRecord[]): boolean {
  if (summary.trim() === "") return false;
  if (wordCount(summary) > SUMMARY_WORD_CAP) return false;
  return missingSummaryFacts(summary, decisions, assets).length === 0;
}

export function fallbackSummary(previous: string, decisions: readonly DecisionRecord[], assets: readonly AssetRecord[]): string {
  const ids = decisions.map((record) => record.id).join(", ");
  const names = assets.map((asset) => path.basename(asset.original)).filter((name) => name !== "").join(", ");
  const head = `Live decisions: ${ids === "" ? "none" : ids}. Assets: ${names === "" ? "none" : names}.`;
  if (summaryAccepts(previous, decisions, assets)) return previous.trim();
  const combined = `${head}\n${previous.trim()}`.trim();
  const words = combined.split(/\s+/);
  if (words.length <= SUMMARY_WORD_CAP) return combined;
  return words.slice(0, SUMMARY_WORD_CAP).join(" ");
}

function summaryText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null && "summary" in value) {
    const summary = (value as { summary?: unknown }).summary;
    if (typeof summary === "string") return summary.trim();
  }
  return "";
}

const summaryChains = new Map<string, Promise<string>>();

/** Wait for a summary already started for this project. A settled or missing job waits for nothing. */
export function awaitPendingSummary(projectDir: string): Promise<void> {
  const pending = summaryChains.get(path.resolve(projectDir));
  if (pending === undefined) return Promise.resolve();
  return pending.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * One summary write at a time per project. The answer turn starts this and
 * does not wait. The next turn waits, then reads whatever file is still good.
 */
export async function refreshSummary(projectDir: string, thinkFn?: typeof think): Promise<string> {
  const key = path.resolve(projectDir);
  const previous = summaryChains.get(key) ?? Promise.resolve("");
  const run = previous.then(
    () => summarizeOnce(projectDir, thinkFn),
    () => summarizeOnce(projectDir, thinkFn),
  );
  summaryChains.set(key, run);
  try {
    return await run;
  } finally {
    if (summaryChains.get(key) === run) summaryChains.delete(key);
  }
}

async function summarizeOnce(projectDir: string, thinkFn?: typeof think): Promise<string> {
  try {
    return await writeRunningSummary(projectDir, thinkFn);
  } catch (error) {
    await logSummaryFailure(projectDir, error);
    try {
      return loadSummary(projectDir);
    } catch {
      return "";
    }
  }
}

async function writeRunningSummary(projectDir: string, thinkFn?: typeof think): Promise<string> {
  if (!existsSync(projectDir)) return "";
  const decisions = loadDecisions(projectDir).filter(isLive);
  const assets = liveAssets(projectDir);
  const previous = loadSummary(projectDir);
  let candidate = "";
  if (thinkFn !== undefined) {
    try {
      const result = await thinkFn(
        {
          task: "context-summary",
          schema: SUMMARY_SCHEMA,
          input: redact(summaryPrompt(previous, decisions, assets)),
        },
        { projectDir },
      );
      candidate = summaryText(result.value);
    } catch (error) {
      await logSummaryFailure(projectDir, error);
      return previous;
    }
  }
  if (!existsSync(projectDir)) return previous;
  const next = summaryAccepts(candidate, decisions, assets) ? candidate : fallbackSummary(previous, decisions, assets);
  await writeSummaryFile(projectDir, next);
  return next;
}

function summaryPrompt(previous: string, decisions: readonly DecisionRecord[], assets: readonly AssetRecord[]): string {
  const known = previous.trim();
  const freshDecisions = known === "" ? [...decisions] : decisions.filter((record) => !known.includes(record.id));
  const freshAssets = assets.filter((asset) => assetIsNew(known, asset));
  const lines: string[] = [];
  for (const record of freshDecisions) {
    lines.push(`- ${record.id} ${record.questionId} ${record.source}: ${record.text}`);
  }
  for (const asset of freshAssets) {
    const original = path.basename(asset.original);
    const saved = path.basename(asset.saved);
    lines.push(`- ${original} saved ${saved} role ${asset.role} question ${asset.questionId}`);
  }
  return [
    "Previous summary:",
    known === "" ? "none" : known,
    "",
    "New turn:",
    lines.length === 0 ? "none" : lines.join("\n"),
    "",
    "Write a summary of at most 400 words. Keep every decision id and every asset file name.",
  ].join("\n");
}

function assetIsNew(known: string, asset: AssetRecord): boolean {
  if (known === "") return true;
  const original = path.basename(asset.original);
  const saved = path.basename(asset.saved);
  if (original !== "" && !known.includes(original)) return true;
  return saved !== "" && saved !== original && !known.includes(saved);
}

async function logSummaryFailure(projectDir: string, error: unknown): Promise<void> {
  if (!existsSync(projectDir)) return;
  const message = error instanceof Error ? error.message : "summary failed";
  try {
    await appendAiOutcome(projectDir, {
      task: "context-summary",
      outcome: "error",
      error: message,
      model: INTERVIEW_MODEL,
      effort: INTERVIEW_EFFORT_DEFAULT,
    });
  } catch {
    // A log problem must not lose the answer.
  }
}
