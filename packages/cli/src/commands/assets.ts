/**
 * hh assets plan, run, diy, and import.
 *
 * The CLI package cannot depend on the sibling assets package, so these
 * modules load by file URL. One confirm covers a batch. --yes is that
 * confirm in a non-interactive shell. A batch over the cap stops before
 * the key is read and before any request.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@hitchhiker/engine";
import { cassetteRefusal } from "../cassette-guard.ts";

const USAGE = [
  "Usage: hh assets <plan|run|diy|import> --project <dir>",
  "       hh assets run --project <dir> --yes",
  "       hh assets import --project <dir> --file <path>",
  "       --cassette keeps HH_CASSETTE=replay or record. HH_ALLOW_CASSETTE=1 does the same.",
].join("\n");

const COMMANDS = ["plan", "run", "diy", "import"] as const;

type CommandName = (typeof COMMANDS)[number];

export interface AssetsCommandDeps {
  env?: Record<string, string | undefined>;
  keychain?: {
    getPassword(service: string, account: string): Promise<string | null>;
  } | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  cwd?: string;
}

interface ParsedAssets {
  ok: true;
  help: false;
  command: CommandName;
  projectDir: string;
  yes: boolean;
  files: string[];
}

type Parsed =
  | { ok: true; help: true }
  | ParsedAssets
  | { ok: false; error: string };

interface AssetSlot {
  id: string;
  kind: "still" | "video";
  prompt: string;
  subjectIsReal: boolean;
  realPersonYes?: boolean;
  gradeScore?: number;
  file?: string;
  status?: "pending" | "done" | "failed";
  jobId?: string;
  error?: string;
  replaces?: string;
}

interface BatchQuote {
  usd: number;
  lines: string[];
}

interface SpendLedger {
  spentUsd: number;
  entries: Array<{ slot: string; usd: number; at: string; jobId?: string }>;
}

interface RunModule {
  planBatch(slots: readonly AssetSlot[]): BatchQuote;
  runBatch(
    slots: readonly AssetSlot[],
    deps: {
      confirm: (quote: BatchQuote) => Promise<boolean>;
      cap: number;
      spent: number;
      client: ImagineClient;
      projectDir: string;
      key: string;
      fetchImpl: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => string;
    },
  ): Promise<{ done: AssetSlot[]; spent: number }>;
  readSpend(projectDir: string): Promise<SpendLedger>;
}

interface HttpModule {
  createImagineClient(): ImagineClient;
}

interface ImagineClient {
  generateImage: unknown;
  startVideo: unknown;
  pollVideo: unknown;
}

interface KeyModule {
  readApiKey(deps: {
    env?: Record<string, string | undefined>;
    keychain?: AssetsCommandDeps["keychain"];
  }): Promise<string>;
}

interface SlotsModule {
  loadSlots(projectDir: string): Promise<AssetSlot[]>;
  proposeReplacement(input: {
    id: string;
    subjectIsReal: boolean;
    realPersonYes?: boolean;
    gradeScore?: number;
  }): { propose: boolean; needsYes: boolean; reason: string };
  refusesRealReplacement(slot: AssetSlot): boolean;
}

interface PackModule {
  writeDiyPack(projectDir: string, slots: readonly AssetSlot[]): Promise<string>;
}

interface ImportModule {
  importDiyFiles(
    projectDir: string,
    slots: readonly AssetSlot[],
    dropped: readonly string[],
  ): Promise<AssetSlot[]>;
}

interface AssetsApi {
  run: RunModule;
  http: HttpModule;
  keys: KeyModule;
  slots: SlotsModule;
  pack: PackModule;
  importer: ImportModule;
}

/** `hh assets plan|run|diy|import`. */
export async function runAssetsCommand(
  argv: readonly string[],
  deps: AssetsCommandDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const parsed = parseAssetsArgs(argv, deps.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 2, stdout: `${parsed.error}\n${USAGE}\n` };
  if (parsed.help) return { exitCode: 0, stdout: `${USAGE}\n` };
  if (parsed.command === "run") {
    const refusal = cassetteRefusal(process.env, argv);
    if (refusal !== null) return { exitCode: 2, stdout: "", stderr: refusal };
  }

  try {
    const api = await loadAssets();
    if (parsed.command === "plan") return await runPlan(api, parsed.projectDir);
    if (parsed.command === "diy") return await runDiy(api, parsed.projectDir);
    if (parsed.command === "import") return await runImport(api, parsed.projectDir, parsed.files);
    return await runJobs(api, parsed, deps);
  } catch (error: unknown) {
    return { exitCode: 1, stdout: `${messageOf(error)}\n` };
  }
}

export function parseAssetsArgs(argv: readonly string[], cwd: string): Parsed {
  let command: CommandName | undefined;
  let project: string | undefined;
  let yes = false;
  let sawYes = false;
  let sawCassette = false;
  let sawProject = false;
  const files: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") return { ok: true, help: true };
    if (arg === "--cassette") {
      if (sawCassette) return fail("Flag --cassette was given twice.");
      sawCassette = true;
      continue;
    }
    if (arg === "--yes") {
      if (sawYes) return fail("Flag --yes was given twice.");
      sawYes = true;
      yes = true;
      continue;
    }
    if (arg === "--project") {
      if (sawProject) return fail("Flag --project was given twice.");
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return fail("Missing --project.");
      }
      project = value;
      sawProject = true;
      index += 1;
      continue;
    }
    if (arg === "--file") {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return fail("Missing --file.");
      }
      files.push(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) return fail("Unexpected argument.");
    if (command !== undefined) return fail("Unexpected argument.");
    if (!isCommand(arg)) return fail("Unknown assets command.");
    command = arg;
  }

  if (command === undefined) return fail("Missing assets command.");
  if (project === undefined) return fail("Missing --project.");
  if (command !== "run" && yes) return fail("Unexpected argument.");
  if (command !== "import" && files.length > 0) return fail("Unexpected argument.");
  if (command === "import" && files.length === 0) return fail("Missing --file.");

  return {
    ok: true,
    help: false,
    command,
    projectDir: path.resolve(cwd, project),
    yes,
    files: files.map((file) => path.resolve(cwd, file)),
  };
}

async function runPlan(api: AssetsApi, projectDir: string): Promise<{ exitCode: number; stdout: string }> {
  const slots = await api.slots.loadSlots(projectDir);
  const quoted = api.run.planBatch(slots);
  const spent = (await api.run.readSpend(projectDir)).spentUsd;
  const cap = loadConfig(projectDir).imagineBudgetUsd;
  const prompts = slots.map((slot) => slot.prompt);
  const blocked = capMessage(quoted.usd, cap, spent, quoted.lines);
  const notes = proposalLines(api, slots);
  if (blocked !== null) {
    return { exitCode: 1, stdout: redact(`${blocked}${notes}`, "", prompts) };
  }
  return { exitCode: 0, stdout: redact(`${formatQuote(cap, spent, quoted)}${notes}`, "", prompts) };
}

async function runDiy(api: AssetsApi, projectDir: string): Promise<{ exitCode: number; stdout: string }> {
  const slots = await api.slots.loadSlots(projectDir);
  const file = await api.pack.writeDiyPack(projectDir, slots);
  return { exitCode: 0, stdout: `${showPath(projectDir, file)}\n` };
}

async function runImport(
  api: AssetsApi,
  projectDir: string,
  files: readonly string[],
): Promise<{ exitCode: number; stdout: string }> {
  const slots = await api.slots.loadSlots(projectDir);
  const done = await api.importer.importDiyFiles(projectDir, slots, files);
  const lines = done
    .filter((slot) => slot.file !== undefined && slot.file.length > 0)
    .map((slot) => `${slot.id}: ${showPath(projectDir, slot.file ?? "")}`);
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function runJobs(
  api: AssetsApi,
  parsed: ParsedAssets,
  deps: AssetsCommandDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const slots = await api.slots.loadSlots(parsed.projectDir);
  const prompts = slots.map((slot) => slot.prompt);
  const ledger = await api.run.readSpend(parsed.projectDir);
  const cap = loadConfig(parsed.projectDir).imagineBudgetUsd;
  const quoted = quoteForRun(api, slots, ledger);
  const blocked = capMessage(quoted.usd, cap, ledger.spentUsd, quoted.lines);
  if (blocked !== null) {
    return { exitCode: 1, stdout: redact(blocked, "", prompts) };
  }
  for (const slot of slots) {
    if (isFinished(slot)) continue;
    if (!api.slots.refusesRealReplacement(slot)) continue;
    return {
      exitCode: 1,
      stdout: redact(`Slot ${slot.id} replaces a real subject. A replacement needs a recorded yes.\n`, "", prompts),
    };
  }
  if (quoted.lines.length === 0) {
    return { exitCode: 0, stdout: "Nothing left to run.\n" };
  }
  const quoteText = formatQuote(cap, ledger.spentUsd, quoted);
  if (!parsed.yes) {
    return {
      exitCode: 1,
      stdout: redact(`${quoteText}Nothing was spent. Pass --yes to confirm this batch.\n`, "", prompts),
    };
  }

  let key = "";
  try {
    const keyDeps: { env?: Record<string, string | undefined>; keychain?: AssetsCommandDeps["keychain"] } = {};
    if (deps.env !== undefined) keyDeps.env = deps.env;
    if (deps.keychain !== undefined) keyDeps.keychain = deps.keychain;
    key = await api.keys.readApiKey(keyDeps);
    const batch: {
      confirm: (quote: BatchQuote) => Promise<boolean>;
      cap: number;
      spent: number;
      client: ImagineClient;
      projectDir: string;
      key: string;
      fetchImpl: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => string;
    } = {
      confirm: async () => true,
      cap,
      spent: ledger.spentUsd,
      client: api.http.createImagineClient(),
      projectDir: parsed.projectDir,
      key,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch,
    };
    if (deps.sleep !== undefined) batch.sleep = deps.sleep;
    if (deps.now !== undefined) batch.now = deps.now;
    const result = await api.run.runBatch(slots, batch);
    return { exitCode: result.done.some((slot) => slot.status === "failed") ? 1 : 0, stdout: redact(resultText(parsed.projectDir, quoteText, result), key, prompts) };
  } catch (error: unknown) {
    return { exitCode: 1, stdout: redact(`${messageOf(error)}\n`, key, prompts) };
  }
}

function quoteForRun(api: AssetsApi, slots: readonly AssetSlot[], ledger: SpendLedger): BatchQuote {
  const pending = slots.filter((slot) => !isFinished(slot));
  const billable = pending.filter((slot) => !isResume(slot, ledger));
  const quoted = billable.length > 0 ? api.run.planBatch(billable) : { usd: 0, lines: [] as string[] };
  for (const slot of pending) {
    if (!isResume(slot, ledger)) continue;
    quoted.lines.push(`${slot.id}: resume job ${slot.jobId ?? ""}`);
  }
  return quoted;
}

function proposalLines(api: AssetsApi, slots: readonly AssetSlot[]): string {
  const lines: string[] = [];
  for (const slot of slots) {
    const input: { id: string; subjectIsReal: boolean; realPersonYes?: boolean; gradeScore?: number } = {
      id: slot.id,
      subjectIsReal: slot.subjectIsReal,
    };
    if (slot.realPersonYes !== undefined) input.realPersonYes = slot.realPersonYes;
    if (slot.gradeScore !== undefined) input.gradeScore = slot.gradeScore;
    const proposal = api.slots.proposeReplacement(input);
    if (!proposal.propose && !proposal.needsYes) continue;
    lines.push(`${slot.id}: ${proposal.reason}`);
  }
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}

function resultText(
  projectDir: string,
  quoteText: string,
  result: { done: AssetSlot[]; spent: number },
): string {
  const lines = [quoteText.trimEnd(), `Spent ${money(result.spent)}.`];
  let pending = false;
  for (const slot of result.done) {
    if (slot.status === "failed") {
      lines.push(`${slot.id} failed: ${slot.error ?? "Imagine request failed."}`);
      continue;
    }
    if (slot.file !== undefined && slot.file.length > 0 && slot.status === "done") {
      lines.push(`${slot.id}: ${showPath(projectDir, slot.file)}`);
      continue;
    }
    if (!isFinished(slot)) pending = true;
  }
  if (pending) lines.push("Later slots were not started.");
  return `${lines.join("\n")}\n`;
}

function formatQuote(cap: number, spent: number, quoted: BatchQuote): string {
  const lines = [`Cap ${money(cap)}. Spent ${money(spent)}. This batch ${money(quoted.usd)}.`, ...quoted.lines];
  return `${lines.join("\n")}\n`;
}

function capMessage(usd: number, cap: number, spent: number, lines: readonly string[]): string | null {
  if (!(usd > 0)) return null;
  const remaining = cents(cap) - cents(spent);
  if (remaining >= 0 && cents(usd) <= remaining) return null;
  const left = Math.max(0, remaining) / 100;
  const detail = lines.length > 0 ? ` ${lines.join("; ")}` : "";
  return `Cap exceeded: estimate ${usd.toFixed(2)} is above remaining ${left.toFixed(2)}.${detail}\n`;
}

function isFinished(slot: AssetSlot): boolean {
  return slot.status === "done" && slot.file !== undefined && slot.file.length > 0;
}

function isResume(slot: AssetSlot, ledger: SpendLedger): boolean {
  if (slot.kind !== "video" || slot.status !== "failed" || slot.jobId === undefined) return false;
  return ledger.entries.some((entry) => entry.slot === slot.id && entry.jobId === slot.jobId);
}

function showPath(projectDir: string, file: string): string {
  const relative = path.relative(projectDir, file);
  const picked = relative.startsWith("..") || path.isAbsolute(relative) ? file : relative;
  return picked.split(path.sep).join("/");
}

function money(usd: number): string {
  return (Math.round(usd * 100) / 100).toFixed(2);
}

function cents(usd: number): number {
  return Math.round(usd * 100);
}

function redact(text: string, key: string, prompts: readonly string[]): string {
  let safe = text;
  if (key.length >= 8) safe = safe.split(key).join("[redacted]");
  for (const prompt of prompts) {
    if (prompt.length >= 8) safe = safe.split(prompt).join("[prompt]");
  }
  return safe;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Asset command failed.";
}

function fail(error: string): Parsed {
  return { ok: false, error };
}

function isCommand(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

async function loadAssets(): Promise<AssetsApi> {
  const entry = assetPath("imagine-run.ts");
  if (!existsSync(entry)) {
    throw new Error("The asset modules are not next to the CLI. Run hh assets from the Guide repo.");
  }
  const run = asRun(await loadModule("imagine-run.ts"));
  const http = asHttp(await loadModule("imagine-http.ts"));
  const keys = asKeys(await loadModule("keychain.ts"));
  const slots = asSlots(await loadModule("slots.ts"));
  const pack = asPack(await loadModule("diy-pack.ts"));
  const importer = asImport(await loadModule("diy-import.ts"));
  if (run === null || http === null || keys === null || slots === null || pack === null || importer === null) {
    throw new Error("The asset modules did not load.");
  }
  return { run, http, keys, slots, pack, importer };
}

function assetPath(fileName: string): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "assets", "src", fileName);
}

function assetHref(fileName: string): string {
  return pathToFileURL(assetPath(fileName)).href;
}

function loadModule(fileName: string): Promise<unknown> {
  return import(assetHref(fileName)) as Promise<unknown>;
}

function asRun(value: unknown): RunModule | null {
  if (!isRecord(value)) return null;
  if (typeof value.planBatch !== "function") return null;
  if (typeof value.runBatch !== "function") return null;
  if (typeof value.readSpend !== "function") return null;
  return value as unknown as RunModule;
}

function asHttp(value: unknown): HttpModule | null {
  if (!isRecord(value) || typeof value.createImagineClient !== "function") return null;
  return value as unknown as HttpModule;
}

function asKeys(value: unknown): KeyModule | null {
  if (!isRecord(value) || typeof value.readApiKey !== "function") return null;
  return value as unknown as KeyModule;
}

function asSlots(value: unknown): SlotsModule | null {
  if (!isRecord(value)) return null;
  if (typeof value.loadSlots !== "function") return null;
  if (typeof value.proposeReplacement !== "function") return null;
  if (typeof value.refusesRealReplacement !== "function") return null;
  return value as unknown as SlotsModule;
}

function asPack(value: unknown): PackModule | null {
  if (!isRecord(value) || typeof value.writeDiyPack !== "function") return null;
  return value as unknown as PackModule;
}

function asImport(value: unknown): ImportModule | null {
  if (!isRecord(value) || typeof value.importDiyFiles !== "function") return null;
  return value as unknown as ImportModule;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
