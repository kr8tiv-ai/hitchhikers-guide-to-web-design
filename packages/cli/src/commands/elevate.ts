/**
 * hh elevate, hh elevate detail, and hh elevate copy.
 *
 * The CLI package cannot depend on the QA package, so the round, the detail
 * pass, the copy cards, and the bounded loop load by file URL. One round
 * plans ranked upgrades with no fixed count. `--rounds N` repeats that round
 * until a stop rule fires. `--pick all|none|1,2` is the yes. A pick with no
 * preview URL still needs the four review shots on disk when more than one
 * round is asked for. Copy is printed as approve or reject cards and is
 * written only when --approve names the ids.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnGrok, think, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { cassetteRefusal } from "../cassette-guard.ts";

/** Exact usage text. The Elevate skill must include this string unchanged. */
export const ELEVATE_USAGE = [
  "Usage: hh elevate --project <dir> [--url <url>] [--rounds N] [--pick all|none|1,2]",
  "       hh elevate detail --project <dir> --url <url>",
  "       hh elevate copy --project <dir> [--approve id,id]",
  "       --cassette keeps HH_CASSETTE=replay or record. HH_ALLOW_CASSETTE=1 does the same.",
].join("\n");

const USAGE = ELEVATE_USAGE;

const REVIEW_SHOT_WIDTHS = [375, 768, 1440, 1920] as const;

const MEASUREMENTS_MISSING = "The quality check needs its measurements before a round can finish.";
const SCORES_MISSING = "Each round needs a design score, a jury score, and a review result.";

const SOURCE_EXT = new Set([".astro", ".css", ".html", ".md", ".svelte", ".ts", ".tsx", ".vue"]);

interface Item {
  file: string;
  change: string;
}

interface GateResult {
  lh: "PASS" | "BLOCKER";
  a11y: "PASS" | "BLOCKER";
  console: "PASS" | "BLOCKER";
  links: "PASS" | "BLOCKER";
  weight: "PASS" | "BLOCKER";
}

interface CopyProposal {
  id: string;
  before: string;
  after: string;
  why: string;
}

interface RoundResult {
  applied: string[];
  refused: Array<{ id: string; reason: string }>;
}

interface DetailRow {
  area: string;
  ok: boolean;
  note: string;
}

type Mode = "round" | "detail" | "copy";

interface ParsedRound {
  ok: true;
  help: false;
  mode: "round";
  projectDir: string;
  url: string | null;
  pick: string;
  /** Null keeps the single round. A number runs the bounded loop. */
  rounds: number | null;
}

interface ScorePoint {
  beauty: number;
  jury: number;
}

interface ParsedDetail {
  ok: true;
  help: false;
  mode: "detail";
  projectDir: string;
  url: string;
}

interface ParsedCopy {
  ok: true;
  help: false;
  mode: "copy";
  projectDir: string;
  approve: string[] | null;
}

type Parsed =
  | { ok: true; help: true }
  | ParsedRound
  | ParsedDetail
  | ParsedCopy
  | { ok: false; error: string };

export interface ElevateCommandDeps {
  cwd?: string;
  think?: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>;
  /** Test double for gateProblems. Omitted on a real round, so the full gates run. */
  qualityGates?: object;
  /** Spec 01 runners for `--rounds`. Omitted, the loop stops instead of inventing a pass. */
  runners?: object;
  /** Design score and jury score after each round of `--rounds`. */
  scores?: (round: number) => ScorePoint | Promise<ScorePoint>;
  /** Review result after each round of `--rounds`. */
  verdict?: (round: number) => string | Promise<string>;
  /** Replaces the drive for one pick. Tests use this so a round does not spawn. */
  runPrompt?: (file: string) => Promise<void>;
  /** Replaces the live gate read. Tests use this so a round does not open a browser. */
  gates?: () => Promise<GateResult>;
}

/** `hh elevate`. */
export async function runElevateCommand(
  argv: readonly string[],
  deps: ElevateCommandDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const parsed = parseElevateArgs(argv, deps.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 2, stdout: `${parsed.error}\n${USAGE}\n` };
  if (parsed.help) return { exitCode: 0, stdout: `${USAGE}\n` };
  const refusal = cassetteRefusal(process.env, argv);
  if (refusal !== null) return { exitCode: 2, stdout: "", stderr: refusal };
  const model = deps.think ?? think;
  try {
    if (parsed.mode === "detail") return await runDetail(parsed);
    if (parsed.mode === "copy") return await runCopy(parsed, model);
    return await runRound(parsed, model, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Elevate failed.";
    return { exitCode: 1, stdout: `${message.replaceAll("!", ".")}\n` };
  }
}

export function parseElevateArgs(argv: readonly string[], cwd: string): Parsed {
  if (argv.length === 0) return fail("Missing --project.");
  if (argv.includes("--help") || argv.includes("-h")) return { ok: true, help: true };
  let mode: Mode = "round";
  let start = 0;
  const head = argv[0];
  if (head === "detail" || head === "copy") {
    mode = head;
    start = 1;
  }
  let project: string | undefined;
  let url: string | null = null;
  let pick = "none";
  let approve: string[] | null = null;
  let rounds: number | null = null;
  let sawPick = false;
  let sawApprove = false;
  let sawCassette = false;
  let sawRounds = false;
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      const value = readValue(argv, index);
      if (value === null) return fail("Missing --project.");
      project = value.value;
      index = value.next;
      continue;
    }
    if (arg === "--url") {
      const value = readValue(argv, index);
      if (value === null || !/^https?:\/\//i.test(value.value)) return fail("The preview URL must start with http:// or https://.");
      url = value.value;
      index = value.next;
      continue;
    }
    if (arg === "--pick") {
      const value = readValue(argv, index);
      if (value === null) return fail("Missing --pick.");
      pick = value.value;
      sawPick = true;
      index = value.next;
      continue;
    }
    if (arg === "--rounds") {
      if (sawRounds) return fail("Flag --rounds was given twice.");
      const value = readValue(argv, index);
      if (value === null) return fail("Missing --rounds.");
      if (!/^[1-9][0-9]{0,1}$/.test(value.value)) {
        return fail("Choose a whole number of rounds from 1 to 99.");
      }
      rounds = Number(value.value);
      sawRounds = true;
      index = value.next;
      continue;
    }
    if (arg === "--cassette") {
      if (sawCassette) return fail("Flag --cassette was given twice.");
      sawCassette = true;
      continue;
    }
    if (arg === "--approve") {
      const value = readValue(argv, index);
      if (value === null) return fail("Missing --approve.");
      approve = value.value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
      sawApprove = true;
      index = value.next;
      continue;
    }
    return fail("Unexpected argument.");
  }
  if (project === undefined) return fail("Missing --project.");
  const projectDir = path.resolve(cwd, project);
  if (mode === "detail") {
    if (sawPick || sawApprove || sawRounds) return fail("Unexpected argument.");
    if (url === null) return fail("Missing --url.");
    return { ok: true, help: false, mode, projectDir, url };
  }
  if (mode === "copy") {
    if (sawPick || url !== null || sawRounds) return fail("Unexpected argument.");
    return { ok: true, help: false, mode, projectDir, approve };
  }
  if (sawApprove) return fail("Unexpected argument.");
  if (rounds === null && pick !== "none" && url === null) {
    return fail("A preview URL is required before a pick can run.");
  }
  if (rounds !== null && pick !== "none" && url === null && !hasReviewShots(projectDir)) {
    return fail("A preview URL is required before a pick can run.");
  }
  return { ok: true, help: false, mode, projectDir, url, pick, rounds };
}

async function runRound(
  parsed: ParsedRound,
  model: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>,
  deps: ElevateCommandDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const review = await loadReview(parsed.projectDir);
  if (!review.ok) return { exitCode: 1, stdout: `${review.message}\n` };
  if (parsed.url !== null) {
    const file = path.join(parsed.projectDir, ".hitchhiker", "elevate", "preview-url");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${parsed.url}\n`, "utf8");
  }
  if (parsed.rounds !== null) return runRounds(parsed, model, deps, review.project);
  const qualityGates = deps.qualityGates;
  const api = await loadLoop();
  const lines: string[] = [];
  const roundDeps = {
    think: model,
    pick: async (items: Item[]) => {
      if (items.length === 0) lines.push("No upgrades this round.");
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) continue;
        lines.push(`${index + 1}. ${item.file}: ${item.change}`);
      }
      return choose(parsed.pick, items);
    },
    runPrompt: (file: string) =>
      deps.runPrompt !== undefined ? deps.runPrompt(file) : runLive(parsed.projectDir, file),
    gates: () => (deps.gates !== undefined ? deps.gates() : loadGates(parsed.projectDir, parsed.url)),
    review: review.project,
    ...(qualityGates === undefined ? {} : { qualityGates }),
  };
  const result = await api.elevateRound(parsed.projectDir, roundDeps);
  for (const id of result.applied) lines.push(`Applied: ${id}`);
  for (const row of result.refused) lines.push(`Refused: ${row.id} ${row.reason}`);
  if (result.applied.length === 0 && result.refused.length === 0) {
    lines.push("No picks. This round changes nothing.");
  }
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function runRounds(
  parsed: ParsedRound,
  model: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>,
  deps: ElevateCommandDeps,
  review: object,
): Promise<{ exitCode: number; stdout: string }> {
  if (parsed.rounds === null) throw new Error("Choose at least one round of improvements.");
  if (deps.runners === undefined) return { exitCode: 1, stdout: `${MEASUREMENTS_MISSING}\n` };
  if (deps.scores === undefined || deps.verdict === undefined) return { exitCode: 1, stdout: `${SCORES_MISSING}\n` };
  const api = await loadRounds();
  const menus: string[][] = [];
  const roundDeps = {
    think: model,
    pick: async (items: Item[]) => {
      const block = [`Round ${menus.length + 1}`];
      if (items.length === 0) block.push("No upgrades this round.");
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) continue;
        block.push(`${index + 1}. ${item.file}: ${item.change}`);
      }
      menus.push(block);
      return choose(parsed.pick, items);
    },
    runPrompt: (file: string) =>
      deps.runPrompt !== undefined ? deps.runPrompt(file) : runLive(parsed.projectDir, file),
    gates: () => (deps.gates !== undefined ? deps.gates() : loadGates(parsed.projectDir, parsed.url)),
    review,
    ...(deps.qualityGates === undefined ? {} : { qualityGates: deps.qualityGates }),
  };
  const result = await api.runElevateLoop({
    projectDir: parsed.projectDir,
    maxRounds: parsed.rounds,
    deps: roundDeps,
    runners: deps.runners,
    scores: deps.scores,
    verdict: deps.verdict,
  });
  const lines: string[] = [];
  for (let index = 0; index < result.snapshots.length; index += 1) {
    const snap = result.snapshots[index];
    if (snap === undefined) continue;
    const menu = menus[index];
    if (menu !== undefined) lines.push(...menu);
    else lines.push(`Round ${index + 1}`);
    for (const id of snap.applied) lines.push(`Applied: ${id}`);
    for (const row of snap.refused) lines.push(`Refused: ${row.id} ${row.reason}`);
    if (snap.applied.length === 0 && snap.refused.length === 0) {
      lines.push("No picks. This round changes nothing.");
    }
  }
  lines.push(result.stop.reason);
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

function hasReviewShots(projectDir: string): boolean {
  const dir = path.join(projectDir, ".hitchhiker", "elevate", "shots");
  return REVIEW_SHOT_WIDTHS.every((width) => existsSync(path.join(dir, `full-${width}.png`)));
}

async function runDetail(parsed: ParsedDetail): Promise<{ exitCode: number; stdout: string }> {
  const api = await loadDetail();
  const report = await api.detailChecks(parsed.url);
  const files = await api.writeDetailPrompts(parsed.projectDir);
  const lines = report.map((row) => `${row.area}: ${row.ok ? "ok" : "gap"}. ${row.note}`);
  lines.push(`Prompts: ${files.length}`);
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function runCopy(
  parsed: ParsedCopy,
  model: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>,
): Promise<{ exitCode: number; stdout: string }> {
  const api = await loadCopy();
  const pages = readPages(parsed.projectDir);
  const voice = readVoice(parsed.projectDir);
  const proposals = await api.proposeCopy(pages, voice, { think: model });
  if (parsed.approve === null) {
    return {
      exitCode: 0,
      stdout: `${api.copyCards(proposals)}Nothing was written. Pass --approve with the ids to keep.\n`,
    };
  }
  const wanted = new Set(parsed.approve);
  const saved = await api.approveCopy(
    parsed.projectDir,
    proposals,
    proposals.map((item) => ({ id: item.id, approve: wanted.has(item.id) })),
  );
  const lines = [api.copyCards(proposals).trimEnd()];
  if (saved.file === null) lines.push("Nothing was written.");
  else lines.push(`Wrote ${saved.file}`);
  if (saved.approved.length > 0) lines.push(`Approved: ${saved.approved.join(", ")}`);
  if (saved.rejected.length > 0) lines.push(`Rejected: ${saved.rejected.join(", ")}`);
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

function choose(flag: string, items: readonly Item[]): Item[] {
  if (flag === "none") return [];
  if (flag === "all") return [...items];
  const wanted = new Set(flag.split(",").map((item) => item.trim()).filter((item) => item.length > 0));
  return items.filter((item, index) => wanted.has(String(index + 1)) || wanted.has(item.file));
}

function readValue(argv: readonly string[], index: number): { value: string; next: number } | null {
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) return null;
  return { value, next: index + 1 };
}

function fail(error: string): Parsed {
  return { ok: false, error };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function qaFile(name: string): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "qa", "src", name);
}

function driveFile(): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "orchestrator", "src", "elevate-drive.ts");
}

type ReviewLoad = { ok: true; project: object } | { ok: false; message: string };

async function loadReview(projectDir: string): Promise<ReviewLoad> {
  const mod = asRecord(await import(pathToFileURL(qaFile("review-project.ts")).href));
  const loadElevateReview = mod?.loadElevateReview;
  if (typeof loadElevateReview !== "function") throw new Error("The review project module did not load.");
  const loaded = asReviewLoad(await (loadElevateReview as (dir: string) => unknown)(projectDir));
  if (loaded === null) throw new Error("The review project module did not load.");
  return loaded;
}

function asReviewLoad(value: unknown): ReviewLoad | null {
  const record = asRecord(value);
  if (record === null || typeof record.ok !== "boolean") return null;
  if (record.ok) {
    const project = asRecord(record.project);
    if (project === null) return null;
    return { ok: true, project };
  }
  if (typeof record.message !== "string" || record.message.trim() === "") return null;
  return { ok: false, message: record.message };
}

async function loadLoop(): Promise<{
  elevateRound: (
    projectDir: string,
    deps: {
      think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>;
      pick: (items: Item[]) => Promise<Item[]>;
      runPrompt: (file: string) => Promise<void>;
      gates: () => Promise<GateResult>;
      review: object;
      qualityGates?: object;
    },
  ) => Promise<RoundResult>;
}> {
  const mod = asRecord(await import(pathToFileURL(qaFile("elevate-loop.ts")).href));
  const elevateRound = mod?.elevateRound;
  if (typeof elevateRound !== "function") throw new Error("The round module did not load.");
  return {
    elevateRound: elevateRound as (
      projectDir: string,
      deps: {
        think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>;
        pick: (items: Item[]) => Promise<Item[]>;
        runPrompt: (file: string) => Promise<void>;
        gates: () => Promise<GateResult>;
        review: object;
        qualityGates?: object;
      },
    ) => Promise<RoundResult>,
  };
}

interface LoopSnapshot {
  applied: string[];
  refused: Array<{ id: string; reason: string }>;
}

interface LoopOutcome {
  stop: { reason: string };
  snapshots: LoopSnapshot[];
}

async function loadRounds(): Promise<{
  runElevateLoop: (input: {
    projectDir: string;
    maxRounds: number;
    deps: {
      think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>;
      pick: (items: Item[]) => Promise<Item[]>;
      runPrompt: (file: string) => Promise<void>;
      gates: () => Promise<GateResult>;
      review: object;
      qualityGates?: object;
    };
    runners: object;
    scores: (round: number) => ScorePoint | Promise<ScorePoint>;
    verdict: (round: number) => string | Promise<string>;
  }) => Promise<LoopOutcome>;
}> {
  const mod = asRecord(await import(pathToFileURL(qaFile("elevate-rounds.ts")).href));
  const runElevateLoop = mod?.runElevateLoop;
  if (typeof runElevateLoop !== "function") throw new Error("The improvements could not start.");
  return {
    runElevateLoop: async (input) => {
      const value: unknown = await (runElevateLoop as (body: unknown) => Promise<unknown>)(input);
      const record = asRecord(value);
      const stop = asRecord(record?.stop);
      if (record === null || stop === null || typeof stop.reason !== "string" || !Array.isArray(record.snapshots)) {
        throw new Error("The improvements could not finish.");
      }
      const snapshots: LoopSnapshot[] = [];
      for (const row of record.snapshots) {
        const snap = asRecord(row);
        if (snap === null || !Array.isArray(snap.applied) || !Array.isArray(snap.refused)) {
          throw new Error("The improvements could not finish.");
        }
        const applied = snap.applied.filter((id): id is string => typeof id === "string");
        const refused: Array<{ id: string; reason: string }> = [];
        for (const item of snap.refused) {
          const refusal = asRecord(item);
          if (refusal === null || typeof refusal.id !== "string" || typeof refusal.reason !== "string") {
            throw new Error("The improvements could not finish.");
          }
          refused.push({ id: refusal.id, reason: refusal.reason });
        }
        snapshots.push({ applied, refused });
      }
      return { stop: { reason: stop.reason }, snapshots };
    },
  };
}

async function loadGates(projectDir: string, url: string | null): Promise<GateResult> {
  const blocked: GateResult = {
    lh: "BLOCKER",
    a11y: "BLOCKER",
    console: "BLOCKER",
    links: "BLOCKER",
    weight: "BLOCKER",
  };
  if (url === null) return blocked;
  const gates = asRecord(await import(pathToFileURL(qaFile("site-once-over.ts")).href));
  const loop = asRecord(await import(pathToFileURL(qaFile("elevate-loop.ts")).href));
  const runGates = gates?.runGates;
  const toGateResult = loop?.toGateResult;
  if (typeof runGates !== "function" || typeof toGateResult !== "function") {
    throw new Error("Gate runners did not load.");
  }
  const report: unknown = await (runGates as (target: string, routes: string[]) => Promise<unknown>)(
    url,
    readRoutes(projectDir),
  );
  const mapped = (toGateResult as (value: unknown) => GateResult)(report);
  if (mapped.lh !== "PASS" && mapped.lh !== "BLOCKER") return blocked;
  return mapped;
}

async function runLive(projectDir: string, file: string): Promise<void> {
  const mod = asRecord(await import(pathToFileURL(driveFile()).href));
  const driveElevateFile = mod?.driveElevateFile;
  if (typeof driveElevateFile !== "function") throw new Error("The drive did not load.");
  await (
    driveElevateFile as (
      projectDir: string,
      promptFile: string,
      deps: { spawnImpl: typeof spawnGrok },
    ) => Promise<unknown>
  )(projectDir, file, { spawnImpl: spawnGrok });
}

async function loadDetail(): Promise<{
  detailChecks: (url: string) => Promise<DetailRow[]>;
  writeDetailPrompts: (projectDir: string) => Promise<string[]>;
}> {
  const mod = asRecord(await import(pathToFileURL(qaFile("detail-pass.ts")).href));
  if (typeof mod?.detailChecks !== "function" || typeof mod.writeDetailPrompts !== "function") {
    throw new Error("The detail module did not load.");
  }
  return {
    detailChecks: mod.detailChecks as (url: string) => Promise<DetailRow[]>,
    writeDetailPrompts: mod.writeDetailPrompts as (projectDir: string) => Promise<string[]>,
  };
}

async function loadCopy(): Promise<{
  proposeCopy: (
    pages: string[],
    voice: string,
    deps: { think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>> },
  ) => Promise<CopyProposal[]>;
  approveCopy: (
    projectDir: string,
    proposals: readonly CopyProposal[],
    decisions: readonly { id: string; approve: boolean }[],
  ) => Promise<{ file: string | null; approved: string[]; rejected: string[] }>;
  copyCards: (proposals: readonly CopyProposal[]) => string;
}> {
  const mod = asRecord(await import(pathToFileURL(qaFile("copy-refine.ts")).href));
  if (
    typeof mod?.proposeCopy !== "function" ||
    typeof mod.approveCopy !== "function" ||
    typeof mod.copyCards !== "function"
  ) {
    throw new Error("The copy module did not load.");
  }
  return {
    proposeCopy: mod.proposeCopy as (
      pages: string[],
      voice: string,
      deps: { think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>> },
    ) => Promise<CopyProposal[]>,
    approveCopy: mod.approveCopy as (
      projectDir: string,
      proposals: readonly CopyProposal[],
      decisions: readonly { id: string; approve: boolean }[],
    ) => Promise<{ file: string | null; approved: string[]; rejected: string[] }>,
    copyCards: mod.copyCards as (proposals: readonly CopyProposal[]) => string,
  };
}

function readRoutes(projectDir: string): string[] {
  const file = path.join(projectDir, ".hitchhiker", "elevate", "routes.txt");
  if (!existsSync(file)) return ["/"];
  const routes = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/"));
  return routes.length > 0 ? routes : ["/"];
}

function readVoice(projectDir: string): string {
  const relatives = [
    path.join(".hitchhiker", "brand", "VOICE.md"),
    path.join(".hitchhiker", "VOICE.md"),
    "VOICE.md",
  ];
  for (const relative of relatives) {
    const full = path.join(projectDir, relative);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8").trim();
    if (text.length > 0) return text;
  }
  return "No voice file in this project.";
}

function readPages(projectDir: string): string[] {
  const root = existsSync(path.join(projectDir, "src")) ? path.join(projectDir, "src") : projectDir;
  const files: string[] = [];
  walk(root, files, 12);
  const pages: string[] = [];
  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8").trim();
      if (text.length > 0) pages.push(text);
    } catch {
      continue;
    }
  }
  return pages;
}

function walk(dir: string, into: string[], cap: number): void {
  if (into.length >= cap) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (into.length >= cap) return;
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".hitchhiker" || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, into, cap);
    else if (entry.isFile() && SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) into.push(full);
  }
}
