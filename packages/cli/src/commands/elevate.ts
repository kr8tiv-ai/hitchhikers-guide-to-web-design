/**
 * hh elevate, hh elevate detail, and hh elevate copy.
 *
 * The CLI package cannot depend on the QA package, so the round, the detail
 * pass, and the copy cards load by file URL. One round plans at most eight
 * upgrades. A pick runs only when a preview URL is set. Copy is printed as
 * approve or reject cards and is written only when --approve names the ids.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, spawnGrok, think, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";

const USAGE = [
  "Usage: hh elevate --project <dir> [--url <url>] [--pick all|none|1,2]",
  "       hh elevate detail --project <dir> --url <url>",
  "       hh elevate copy --project <dir> [--approve id,id]",
].join("\n");

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
}

/** `hh elevate`. */
export async function runElevateCommand(
  argv: readonly string[],
  deps: ElevateCommandDeps = {},
): Promise<{ exitCode: number; stdout: string }> {
  const parsed = parseElevateArgs(argv, deps.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 2, stdout: `${parsed.error}\n${USAGE}\n` };
  if (parsed.help) return { exitCode: 0, stdout: `${USAGE}\n` };
  const model = deps.think ?? think;
  try {
    if (parsed.mode === "detail") return await runDetail(parsed);
    if (parsed.mode === "copy") return await runCopy(parsed, model);
    return await runRound(parsed, model);
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
  let sawPick = false;
  let sawApprove = false;
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
    if (sawPick || sawApprove) return fail("Unexpected argument.");
    if (url === null) return fail("Missing --url.");
    return { ok: true, help: false, mode, projectDir, url };
  }
  if (mode === "copy") {
    if (sawPick || url !== null) return fail("Unexpected argument.");
    return { ok: true, help: false, mode, projectDir, approve };
  }
  if (sawApprove) return fail("Unexpected argument.");
  if (pick !== "none" && url === null) return fail("A preview URL is required before a pick can run.");
  return { ok: true, help: false, mode, projectDir, url, pick };
}

async function runRound(
  parsed: ParsedRound,
  model: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>,
): Promise<{ exitCode: number; stdout: string }> {
  if (parsed.url !== null) {
    const file = path.join(parsed.projectDir, ".hitchhiker", "elevate", "preview-url");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${parsed.url}\n`, "utf8");
  }
  const api = await loadLoop();
  const lines: string[] = [];
  const result = await api.elevateRound(parsed.projectDir, {
    think: model,
    pick: async (items) => {
      if (items.length === 0) lines.push("No upgrades this round.");
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item === undefined) continue;
        lines.push(`${index + 1}. ${item.file}: ${item.change}`);
      }
      return choose(parsed.pick, items);
    },
    runPrompt: (file) => runLive(parsed.projectDir, file),
    gates: () => loadGates(parsed.projectDir, parsed.url),
  });
  for (const id of result.applied) lines.push(`Applied: ${id}`);
  for (const row of result.refused) lines.push(`Refused: ${row.id} ${row.reason}`);
  if (result.applied.length === 0 && result.refused.length === 0) {
    lines.push("No picks. This round changes nothing.");
  }
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
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

function runnerFile(): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "orchestrator", "src", "live-runner.ts");
}

async function loadLoop(): Promise<{
  elevateRound: (
    projectDir: string,
    deps: {
      think: (request: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>;
      pick: (items: Item[]) => Promise<Item[]>;
      runPrompt: (file: string) => Promise<void>;
      gates: () => Promise<GateResult>;
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
      },
    ) => Promise<RoundResult>,
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
  const mod = asRecord(await import(pathToFileURL(runnerFile()).href));
  const runLivePrompt = mod?.runLivePrompt;
  if (typeof runLivePrompt !== "function") throw new Error("The live runner did not load.");
  const result = await (
    runLivePrompt as (
      promptFile: string,
      deps: { spawnImpl: typeof spawnGrok; projectDir: string; config: ReturnType<typeof loadConfig> },
    ) => Promise<{ exitCode: number }>
  )(file, {
    spawnImpl: spawnGrok,
    projectDir,
    config: loadConfig(projectDir),
  });
  if (result.exitCode !== 0) throw new Error(`Prompt exited ${result.exitCode}.`);
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
