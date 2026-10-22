/**
 * hh so-long.
 *
 * The ship gate runs first. A red or stale check stops before a build,
 * a host, or a record. The plan is shown next. When --host is omitted,
 * Hostinger is the suggestion and a preview on this computer is the other
 * offer. Neither starts until the host is named and --yes is present.
 * A missing yes writes nothing. After that yes, the site build runs, then
 * the dispatcher, then the deploy record.
 *
 * The CLI package cannot depend on the orchestrator or the deploy package,
 * so those modules load by file URL, the same way elevate loads its modules.
 * Live host clients are only the ones the caller injects. This command does
 * not read a keychain and does not call a host API itself.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { runGit } from "../improve/git.ts";
import { buildPnpmInvocation, quoteCmdArg } from "../improve/pnpm-command.ts";

export const SO_LONG_USAGE =
  "hh so-long --project <dir> [--host preview|hostinger|vercel|netlify|cloudflare] [--yes]";

const HOSTS = ["preview", "hostinger", "vercel", "netlify", "cloudflare"] as const;

export type SoLongHost = (typeof HOSTS)[number];

export interface SoLongStaticClient {
  upload: () => Promise<{ id: string }>;
  poll: (id: string) => Promise<"queued" | "completed" | "failed">;
}

export interface SoLongHostingerClient {
  uploadStatic: () => Promise<{ id: string }>;
  uploadNode: () => Promise<{ id: string }>;
  poll: (id: string) => Promise<"queued" | "completed" | "failed">;
}

export interface SoLongPreviewClient {
  handoff: (input: {
    projectDir: string;
    pick: string;
    shape: string;
    outputDir: string;
  }) => Promise<{ url: string }>;
}

/** Injected fakes only. An omitted client is not connected. */
export interface SoLongClients {
  hostinger?: SoLongHostingerClient;
  vercel?: SoLongStaticClient;
  netlify?: SoLongStaticClient;
  cloudflare?: SoLongStaticClient;
  preview?: SoLongPreviewClient;
}

export interface SoLongDeps {
  cwd?: string;
  /** Replaces `git rev-parse HEAD`. */
  head?: string;
  /** Replaces the site build. Omitted, the project build script runs. */
  build?: (projectDir: string) => Promise<void>;
  /** Passed through to the dispatcher. */
  clients?: SoLongClients;
}

interface ParsedSoLong {
  projectDir: string;
  host: SoLongHost | null;
  yes: boolean;
}

interface Recommendation {
  reason: string;
  shape: "static" | "node";
  allowed: readonly string[];
}

interface GateResult {
  ok: boolean;
  reasons: string[];
}

interface DispatchRun {
  host: string;
  state: "completed" | "queued" | "failed";
  uploads: number;
  url: string | null;
}

type DispatchOutcome = DispatchRun | { declined: true };

interface RecordEntry {
  target: SoLongHost;
  shape: "static" | "node";
  state: string;
  url: string;
  via: string;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
}

const NO_VERSION = "This folder does not have a saved version to check, so launch stays closed.";
const UNCLEAR_STACK = "The stack record for this site is missing or unclear, so launch stays closed.";
const BUILD_FAILED = "The site did not build, so nothing was sent.";
const CLOSED = "Launch stays closed.";

function packageSource(pkg: string, file: string): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", pkg, "src", file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHost(value: string): value is SoLongHost {
  return (HOSTS as readonly string[]).includes(value);
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\u2014/g, ",").replace(/ {2,}/g, " ").trim();
}

function allowedMessage(message: string): boolean {
  if (message.includes("!") || message.includes("\u2014")) return false;
  if (message.endsWith("Nothing was sent.") || message.endsWith("Nothing was written.")) return true;
  if (message.endsWith("launch stays closed.") || message === CLOSED) return true;
  return false;
}

function plainFailure(error: unknown): string {
  const message = error instanceof Error ? oneLine(error.message) : "";
  if (message === "Netlify template is not wired") return "Netlify cannot publish this site. Nothing was sent.";
  if (message === "Cloudflare template is not wired") return "Cloudflare cannot publish this site. Nothing was sent.";
  if (message === "file list is empty") return "There are no pages to send. Nothing was sent.";
  if (allowedMessage(message)) return message;
  return "Nothing was sent.";
}

function hostLabel(host: SoLongHost): string {
  switch (host) {
    case "preview":
      return "a preview on this computer";
    case "hostinger":
      return "Hostinger";
    case "vercel":
      return "Vercel";
    case "netlify":
      return "Netlify";
    case "cloudflare":
      return "Cloudflare";
    default: {
      const neverHost: never = host;
      return String(neverHost);
    }
  }
}

function viaFor(host: SoLongHost): string {
  if (host === "preview") return "preview on this computer";
  return hostLabel(host);
}

function parseSoLong(
  argv: readonly string[],
  cwd: string,
): { ok: true; value: ParsedSoLong } | { ok: false; error: string } {
  let project: string | undefined;
  let host: SoLongHost | null = null;
  let yes = false;
  let sawHost = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      if (project !== undefined) return { ok: false, error: "Unexpected argument." };
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return { ok: false, error: "Missing --project." };
      }
      project = value;
      index += 1;
      continue;
    }
    if (arg === "--host") {
      if (sawHost) return { ok: false, error: "Unexpected argument." };
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return { ok: false, error: "Missing --host." };
      }
      if (!isHost(value)) return { ok: false, error: "That host is not one of the choices." };
      host = value;
      sawHost = true;
      index += 1;
      continue;
    }
    if (arg === "--yes") {
      if (yes) return { ok: false, error: "Unexpected argument." };
      yes = true;
      continue;
    }
    return { ok: false, error: "Unexpected argument." };
  }
  if (project === undefined) return { ok: false, error: "Missing --project." };
  return { ok: true, value: { projectDir: path.resolve(cwd, project), host, yes } };
}

function readHead(projectDir: string): string {
  const result = runGit(projectDir, ["rev-parse", "HEAD"]);
  const head = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{7,64}$/i.test(head)) {
    throw new Error(NO_VERSION);
  }
  return head;
}

async function importNamed(file: string, name: string): Promise<unknown> {
  let loaded: unknown;
  try {
    loaded = await import(pathToFileURL(file).href);
  } catch {
    throw new Error(CLOSED);
  }
  const record = isRecord(loaded) ? loaded : null;
  if (record === null || !(name in record)) throw new Error(CLOSED);
  return record[name];
}

function asGate(value: unknown): GateResult | null {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !Array.isArray(value.reasons)) return null;
  const reasons: string[] = [];
  for (const reason of value.reasons) {
    if (typeof reason !== "string") return null;
    const line = oneLine(reason);
    if (line.length > 0) reasons.push(line);
  }
  return { ok: value.ok, reasons };
}

function asRecommendation(value: unknown): Recommendation | null {
  if (!isRecord(value)) return null;
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) return null;
  if (value.shape !== "static" && value.shape !== "node") return null;
  if (!Array.isArray(value.allowed)) return null;
  const allowed: string[] = [];
  for (const item of value.allowed) {
    if (typeof item !== "string") return null;
    allowed.push(item);
  }
  return { reason: oneLine(value.reason), shape: value.shape, allowed };
}

function asDispatch(value: unknown): DispatchOutcome | null {
  if (!isRecord(value)) return null;
  if (value.declined === true) return { declined: true };
  if (typeof value.host !== "string") return null;
  if (value.state !== "completed" && value.state !== "queued" && value.state !== "failed") return null;
  if (typeof value.uploads !== "number") return null;
  if (value.url !== null && typeof value.url !== "string") return null;
  return {
    host: value.host,
    state: value.state,
    uploads: value.uploads,
    url: typeof value.url === "string" ? value.url : null,
  };
}

function planLines(parsed: ParsedSoLong, recommendation: Recommendation): string[] {
  const lines = [recommendation.reason];
  if (parsed.host === null) {
    lines.push("Hostinger is the suggested host.");
    lines.push("A preview on this computer is the other choice.");
    lines.push("Name the host and confirm before anything is sent.");
    lines.push(`hh so-long --project ${parsed.projectDir} --host hostinger --yes`);
    lines.push(`hh so-long --project ${parsed.projectDir} --host preview --yes`);
    return lines;
  }
  const label = hostLabel(parsed.host);
  lines.push(`Choice: ${label}.`);
  if (!parsed.yes) {
    if (parsed.host === "preview") {
      lines.push("A copy can open on this computer, and a zip of the pages can be saved.");
    } else {
      lines.push(`${label} will receive the site only after you confirm.`);
    }
    lines.push("Nothing is sent until you confirm.");
  }
  return lines;
}

function resultLines(host: SoLongHost, projectDir: string, outcome: DispatchRun): string[] {
  const lines: string[] = [];
  if (host === "preview" && outcome.state === "completed") {
    lines.push("The preview is open on this computer.");
    const zip = path.join(projectDir, ".hitchhiker", "deploy", "preview.zip");
    if (existsSync(zip)) lines.push("A zip of the pages is saved at .hitchhiker/deploy/preview.zip.");
  } else if (outcome.state === "failed") {
    lines.push("The publish did not finish.");
  } else if (outcome.state === "queued") {
    lines.push("The publish is still finishing.");
  } else {
    lines.push("The publish finished.");
  }
  if (outcome.url !== null && outcome.url.length > 0) lines.push(`Address: ${outcome.url}`);
  lines.push("Record: .hitchhiker/deploy/DEPLOYS.md");
  return lines;
}

function packageManager(projectDir: string): "pnpm" | "npm" | "yarn" {
  if (existsSync(path.join(projectDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(projectDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function commandInvocation(
  bin: "npm" | "yarn",
  args: readonly string[],
): { command: string; args: string[]; verbatim: boolean } {
  if (process.platform !== "win32") return { command: bin, args: [...args], verbatim: false };
  const line = [`${bin}.cmd`, ...args.map(quoteCmdArg)].join(" ");
  const comspec = process.env.ComSpec;
  return {
    command: comspec !== undefined && comspec.length > 0 ? comspec : "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
  };
}

function hasBuildScript(projectDir: string): boolean {
  const file = path.join(projectDir, "package.json");
  if (!existsSync(file)) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(BUILD_FAILED);
  }
  if (!isRecord(parsed) || !isRecord(parsed.scripts)) return false;
  return typeof parsed.scripts.build === "string" && parsed.scripts.build.trim().length > 0;
}

async function buildSite(projectDir: string): Promise<void> {
  if (!hasBuildScript(projectDir)) return;
  const bin = packageManager(projectDir);
  const args = bin === "yarn" ? ["build"] : ["run", "build"];
  const invocation = bin === "pnpm" ? buildPnpmInvocation(args) : commandInvocation(bin, args);
  const result = spawnSync(
    invocation.command,
    invocation.args,
    hiddenChildOptions({
      cwd: projectDir,
      encoding: "utf8" as const,
      windowsVerbatimArguments: invocation.verbatim,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    }),
  );
  if (result.status !== 0) throw new Error(BUILD_FAILED);
}

function allowedHost(host: SoLongHost, allowed: readonly string[]): boolean {
  if (host === "preview") return true;
  return allowed.includes(host);
}

async function runParsed(parsed: ParsedSoLong, deps: SoLongDeps): Promise<CommandResult> {
  const head = deps.head !== undefined ? deps.head : readHead(parsed.projectDir);
  const shipGate = await importNamed(packageSource("orchestrator", "ship-gate.ts"), "shipGate");
  if (typeof shipGate !== "function") throw new Error(CLOSED);
  const gate = asGate(await (shipGate as (dir: string, version: string) => Promise<unknown>)(parsed.projectDir, head));
  if (gate === null) {
    return { exitCode: 1, stdout: "The quality check could not be read, so launch stays closed.\n" };
  }
  if (!gate.ok) {
    const reasons = gate.reasons.length > 0 ? gate.reasons : [CLOSED];
    return { exitCode: 1, stdout: `${reasons.join("\n")}\n` };
  }

  const recommendHost = await importNamed(packageSource("deploy", "dispatch.ts"), "recommendHost");
  if (typeof recommendHost !== "function") throw new Error(CLOSED);
  let recommendation: Recommendation;
  try {
    const raw = await (recommendHost as (dir: string) => Promise<unknown>)(parsed.projectDir);
    const parsedRecommendation = asRecommendation(raw);
    if (parsedRecommendation === null) throw new Error(UNCLEAR_STACK);
    recommendation = parsedRecommendation;
  } catch (error: unknown) {
    const message = error instanceof Error ? oneLine(error.message) : "";
    if (allowedMessage(message)) return { exitCode: 1, stdout: `${message}\n` };
    return { exitCode: 1, stdout: `${UNCLEAR_STACK}\n` };
  }

  const lines = planLines(parsed, recommendation);
  if (parsed.host === null || !parsed.yes) {
    lines.push("Nothing was written.");
    return { exitCode: 2, stdout: `${lines.join("\n")}\n` };
  }
  if (!allowedHost(parsed.host, recommendation.allowed)) {
    lines.push("Nothing was sent.");
    return { exitCode: 1, stdout: `${lines.join("\n")}\n` };
  }

  if (deps.build !== undefined) await deps.build(parsed.projectDir);
  else await buildSite(parsed.projectDir);

  const deploy = await importNamed(packageSource("deploy", "dispatch.ts"), "deploy");
  if (typeof deploy !== "function") throw new Error(CLOSED);
  const outcome = asDispatch(
    await (
      deploy as (
        host: string,
        dir: string,
        input: { yes: () => Promise<boolean>; clients: SoLongClients },
      ) => Promise<unknown>
    )(parsed.host, parsed.projectDir, {
      yes: () => Promise.resolve(true),
      clients: deps.clients ?? {},
    }),
  );
  if (outcome === null) {
    lines.push("Nothing was sent.");
    return { exitCode: 1, stdout: `${lines.join("\n")}\n` };
  }
  if ("declined" in outcome) {
    lines.push("Nothing was written.");
    return { exitCode: 2, stdout: `${lines.join("\n")}\n` };
  }

  const writeDeployRecord = await importNamed(packageSource("deploy", "cli-run.ts"), "writeDeployRecord");
  if (typeof writeDeployRecord !== "function") throw new Error(CLOSED);
  const entry: RecordEntry = {
    target: parsed.host,
    shape: recommendation.shape,
    state: outcome.state,
    url: outcome.url !== null && outcome.url.length > 0 ? outcome.url : "none",
    via: viaFor(parsed.host),
  };
  await (writeDeployRecord as (dir: string, row: RecordEntry) => Promise<unknown>)(parsed.projectDir, entry);
  lines.push(...resultLines(parsed.host, parsed.projectDir, outcome));
  return { exitCode: outcome.state === "failed" ? 1 : 0, stdout: `${lines.join("\n")}\n` };
}

/** Run `hh so-long`. A missing yes writes nothing and calls no host. */
export async function runSoLongCommand(argv: readonly string[], deps: SoLongDeps = {}): Promise<CommandResult> {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { exitCode: 0, stdout: `${SO_LONG_USAGE}\n` };
  }
  const parsed = parseSoLong(argv, deps.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 2, stdout: `${parsed.error}\n${SO_LONG_USAGE}\n` };
  try {
    return await runParsed(parsed.value, deps);
  } catch (error: unknown) {
    return { exitCode: 1, stdout: `${plainFailure(error)}\n` };
  }
}
