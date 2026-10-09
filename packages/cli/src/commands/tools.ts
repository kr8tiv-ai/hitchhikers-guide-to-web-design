/**
 * hh tools search and hh tools install.
 *
 * Search reads the MCP Registry and npm. Install runs only after a yes.
 * --yes is that yes in a non-interactive shell. A secret is named in the
 * environment or the OS keychain, never written into the project.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { think } from "@hitchhiker/engine";
import { cassetteRefusal } from "../cassette-guard.ts";

const USAGE = [
  "Usage: hh tools <search|install> --project <dir>",
  "       hh tools search --project <dir> --feature <text>",
  "       hh tools install --project <dir> --name <package> --yes",
  "       --cassette keeps HH_CASSETTE=replay or record. HH_ALLOW_CASSETTE=1 does the same.",
].join("\n");

const COMMANDS = ["search", "install"] as const;
type CommandName = (typeof COMMANDS)[number];
const KINDS = ["mcp", "npm", "api"] as const;
type ToolKind = (typeof KINDS)[number];

export interface ToolOption {
  name: string;
  kind: ToolKind;
  why: string;
  licence: string;
  costNote: string;
  maintenance: string;
  blocked: boolean;
  blockReasons: string[];
  repositoryUrl: string;
  publishedAt: string;
  weeklyDownloads: number;
  hasInstallScript: boolean;
  installScriptExplanation: string;
  packageName: string;
  secretEnv: string[];
  command: string;
  args: string[];
  url: string;
  registryNote: string;
  userAsk: string;
}

export interface ToolsCommandDeps {
  fetchImpl?: typeof fetch;
  think?: typeof think;
  cwd?: string;
  confirm?: (option: ToolOption) => Promise<boolean>;
  run?: (cmd: string, args: string[]) => Promise<number>;
}

interface SearchArgs {
  command: "search";
  projectDir: string;
  feature: string;
}

interface InstallArgs {
  command: "install";
  projectDir: string;
  name: string;
  yes: boolean;
  manual: ManualFacts | null;
}

interface ManualFacts {
  kind: ToolKind;
  licence: string;
  repositoryUrl: string;
  publishedAt: string;
  weeklyDownloads: number;
  installScriptExplanation: string;
  secretEnv: string[];
  command: string;
  args: string[];
  url: string;
  packageName: string;
}

type Parsed =
  | { ok: true; help: true }
  | ({ ok: true; help: false } & (SearchArgs | InstallArgs))
  | { ok: false; error: string };

interface ToolsApi {
  discoverTools: (
    feature: string,
    deps: { fetchImpl: typeof fetch; think: typeof think },
  ) => Promise<ToolOption[]>;
  installTool: (
    option: ToolOption,
    projectDir: string,
    deps: {
      confirm: (option: ToolOption) => Promise<boolean>;
      run: (cmd: string, args: string[]) => Promise<number>;
    },
  ) => Promise<"installed" | "declined" | "blocked">;
  unreachable: new (sources: readonly string[]) => Error;
}

/** `hh tools search|install`. */
export async function runToolsCommand(
  argv: readonly string[],
  deps: ToolsCommandDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  const parsed = parseToolsArgs(argv, deps.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 2, stdout: `${parsed.error}\n${USAGE}\n` };
  if (parsed.help) return { exitCode: 0, stdout: `${USAGE}\n` };
  if (parsed.command === "search") {
    const refusal = cassetteRefusal(process.env, argv);
    if (refusal !== null) return { exitCode: 2, stdout: "", stderr: refusal };
  }

  try {
    const api = await loadTools();
    if (parsed.command === "search") return await runSearch(api, parsed, deps);
    return await runInstall(api, parsed, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tool command failed.";
    return { exitCode: 1, stdout: `${message}\n` };
  }
}

export function parseToolsArgs(argv: readonly string[], cwd: string): Parsed {
  let command: CommandName | undefined;
  let project: string | undefined;
  let feature = "";
  let name = "";
  let yes = false;
  let sawYes = false;
  let sawCassette = false;
  let sawProject = false;
  let sawFeature = false;
  let sawName = false;
  const manual: ManualFacts = {
    kind: "npm",
    licence: "",
    repositoryUrl: "",
    publishedAt: "",
    weeklyDownloads: 0,
    installScriptExplanation: "",
    secretEnv: [],
    command: "",
    args: [],
    url: "",
    packageName: "",
  };
  let sawKind = false;
  let sawDownloads = false;

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
    const valueFlag = takeValue(argv, index, arg);
    if (valueFlag === "bad") return fail(`Missing ${arg}.`);
    if (valueFlag !== null) {
      if (arg === "--project") {
        if (sawProject) return fail("Flag --project was given twice.");
        sawProject = true;
        project = valueFlag.value;
      } else if (arg === "--feature") {
        if (sawFeature) return fail("Flag --feature was given twice.");
        sawFeature = true;
        feature = valueFlag.value;
      } else if (arg === "--name") {
        if (sawName) return fail("Flag --name was given twice.");
        sawName = true;
        name = valueFlag.value;
      } else if (arg === "--kind") {
        if (sawKind) return fail("Flag --kind was given twice.");
        if (!isKind(valueFlag.value)) return fail("Kind must be mcp, npm, or api.");
        sawKind = true;
        manual.kind = valueFlag.value;
      } else if (arg === "--licence" || arg === "--license") {
        manual.licence = valueFlag.value;
      } else if (arg === "--repo") {
        manual.repositoryUrl = valueFlag.value;
      } else if (arg === "--published") {
        manual.publishedAt = valueFlag.value;
      } else if (arg === "--downloads") {
        const downloads = Number(valueFlag.value);
        if (!Number.isInteger(downloads) || downloads < 0) return fail("Downloads must be a whole number.");
        sawDownloads = true;
        manual.weeklyDownloads = downloads;
      } else if (arg === "--explain") {
        manual.installScriptExplanation = valueFlag.value;
      } else if (arg === "--secret") {
        manual.secretEnv.push(valueFlag.value);
      } else if (arg === "--command") {
        manual.command = valueFlag.value;
      } else if (arg === "--arg") {
        manual.args.push(valueFlag.value);
      } else if (arg === "--url") {
        manual.url = valueFlag.value;
      } else if (arg === "--package") {
        manual.packageName = valueFlag.value;
      } else {
        return fail("Unexpected argument.");
      }
      index = valueFlag.next;
      continue;
    }
    if (arg.startsWith("-")) return fail("Unexpected argument.");
    if (command !== undefined) return fail("Unexpected argument.");
    if (!isCommand(arg)) return fail("Unknown tools command.");
    command = arg;
  }

  if (command === undefined) return fail("Missing tools command.");
  if (project === undefined) return fail("Missing --project.");
  const projectDir = path.resolve(cwd, project);
  if (command === "search") {
    const stray = yes
      || sawName
      || sawKind
      || manual.licence !== ""
      || manual.repositoryUrl !== ""
      || manual.publishedAt !== ""
      || sawDownloads
      || manual.command !== ""
      || manual.url !== ""
      || manual.args.length > 0
      || manual.secretEnv.length > 0;
    if (stray) return fail("Unexpected argument.");
    if (!sawFeature || feature.trim() === "") return fail("Missing --feature.");
    return { ok: true, help: false, command, projectDir, feature: feature.trim() };
  }
  if (!sawName || name.trim() === "") return fail("Missing --name.");
  if (sawFeature) return fail("Unexpected argument.");
  const manualRequested = sawKind
    || manual.licence !== ""
    || manual.repositoryUrl !== ""
    || manual.publishedAt !== ""
    || sawDownloads
    || manual.command !== ""
    || manual.url !== "";
  return {
    ok: true,
    help: false,
    command,
    projectDir,
    name: name.trim(),
    yes,
    manual: manualRequested ? manual : null,
  };
}

async function runSearch(
  api: ToolsApi,
  parsed: SearchArgs,
  deps: ToolsCommandDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const thinkImpl = deps.think ?? think;
  try {
    const options = await api.discoverTools(parsed.feature, { fetchImpl, think: thinkImpl });
    writeShortlist(parsed.projectDir, parsed.feature, options);
    return { exitCode: 0, stdout: formatSearch(parsed.feature, options) };
  } catch (error: unknown) {
    if (error instanceof api.unreachable) {
      const manual = manualLines(error);
      return { exitCode: 1, stdout: `${error.message}\n${manual}` };
    }
    throw error;
  }
}

async function runInstall(
  api: ToolsApi,
  parsed: InstallArgs,
  deps: ToolsCommandDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const stored = readShortlist(parsed.projectDir).find((option) => option.name === parsed.name);
  const option = stored ?? (parsed.manual === null ? null : manualOption(parsed.name, parsed.manual));
  if (option === null) {
    return {
      exitCode: 2,
      stdout: `No shortlist entry for ${parsed.name}. Search first, or pass --kind, --licence, --repo, --published, and --downloads.\n${USAGE}\n`,
    };
  }
  if (stored === undefined && parsed.manual !== null && !manualComplete(parsed.manual)) {
    return {
      exitCode: 2,
      stdout: `Name the licence, repository URL, publish date, and weekly downloads for ${parsed.name}.\n${USAGE}\n`,
    };
  }
  const confirm = deps.confirm ?? (async () => parsed.yes);
  const run = deps.run ?? defaultRun;
  const outcome = await api.installTool(option, parsed.projectDir, { confirm, run });
  if (outcome === "declined") {
    return {
      exitCode: 1,
      stdout: `${formatOption(option)}\nNothing was installed. Pass --yes to confirm this package.\n`,
    };
  }
  if (outcome === "blocked") {
    const reasons = option.blockReasons.length > 0 ? option.blockReasons.join("\n") : "blocked";
    return { exitCode: 1, stdout: `${option.name} is blocked.\n${reasons}\n` };
  }
  const ask = option.userAsk === "" ? "" : `${option.userAsk}\n`;
  return { exitCode: 0, stdout: `Installed ${option.name}.\n${ask}` };
}

function formatSearch(feature: string, options: readonly ToolOption[]): string {
  const lines = [`Tools for "${feature}".`];
  const note = options.find((option) => option.registryNote !== "")?.registryNote;
  if (note !== undefined && note !== "") lines.push(note);
  if (options.length === 0) {
    lines.push("No matching tools in the registries.");
    lines.push("");
    return lines.join("\n");
  }
  options.forEach((option, index) => {
    lines.push("");
    lines.push(formatOption(option, index + 1));
  });
  lines.push("");
  return lines.join("\n");
}

function formatOption(option: ToolOption, index?: number): string {
  const head = index === undefined ? option.name : `${index}. ${option.name}`;
  const lines = [
    head,
    `   kind: ${option.kind}`,
    `   why: ${option.why}`,
    `   licence: ${option.licence}`,
    `   cost: ${option.costNote}`,
    `   maintenance: ${option.maintenance}`,
  ];
  if (option.blocked) {
    const reasons = option.blockReasons.length > 0 ? option.blockReasons.join("; ") : "blocked";
    lines.push(`   blocked: ${reasons}`);
  }
  if (option.userAsk !== "") lines.push(`   ${option.userAsk}`);
  return lines.join("\n");
}

function manualLines(error: Error): string {
  const record = error as Error & { manualOptions?: readonly string[] };
  const lines = record.manualOptions ?? [];
  if (lines.length === 0) return "";
  return `${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

function manualOption(name: string, facts: ManualFacts): ToolOption {
  return {
    name,
    kind: facts.kind,
    why: "Named by hand because the registry was not used.",
    licence: facts.licence,
    costNote: "No price listed by the registry.",
    maintenance: "Supplied with the install command.",
    blocked: false,
    blockReasons: [],
    repositoryUrl: facts.repositoryUrl,
    publishedAt: facts.publishedAt,
    weeklyDownloads: facts.weeklyDownloads,
    hasInstallScript: facts.installScriptExplanation.trim() !== "",
    installScriptExplanation: facts.installScriptExplanation,
    packageName: facts.packageName === "" ? name : facts.packageName,
    secretEnv: facts.secretEnv,
    command: facts.command,
    args: facts.args,
    url: facts.url,
    registryNote: "",
    userAsk: "",
  };
}

function manualComplete(facts: ManualFacts): boolean {
  return facts.licence.trim() !== ""
    && facts.repositoryUrl.trim() !== ""
    && facts.publishedAt.trim() !== "";
}

function shortlistPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "tools", "shortlist.json");
}

function writeShortlist(projectDir: string, feature: string, options: readonly ToolOption[]): void {
  const file = shortlistPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ feature, options }, null, 2), "utf8");
}

function readShortlist(projectDir: string): ToolOption[] {
  const file = shortlistPath(projectDir);
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const record = asRecord(parsed);
    if (!Array.isArray(record?.options)) return [];
    const options: ToolOption[] = [];
    for (const item of record.options) {
      const option = asOption(item);
      if (option !== null) options.push(option);
    }
    return options;
  } catch {
    return [];
  }
}

function defaultRun(cmd: string, args: string[]): Promise<number> {
  const bin = cmd === "pnpm" && process.platform === "win32" ? "pnpm.cmd" : cmd;
  return new Promise((resolve) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, stdio: "inherit" });
    child.once("error", () => resolve(127));
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function takeValue(
  argv: readonly string[],
  index: number,
  arg: string,
): { value: string; next: number } | "bad" | null {
  const flags = new Set([
    "--project",
    "--feature",
    "--name",
    "--kind",
    "--licence",
    "--license",
    "--repo",
    "--published",
    "--downloads",
    "--explain",
    "--secret",
    "--command",
    "--arg",
    "--url",
    "--package",
  ]);
  if (!flags.has(arg)) return null;
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("-")) return "bad";
  return { value, next: index + 1 };
}

function fail(error: string): Parsed {
  return { ok: false, error };
}

function isCommand(value: string): value is CommandName {
  return (COMMANDS as readonly string[]).includes(value);
}

function isKind(value: string): value is ToolKind {
  return (KINDS as readonly string[]).includes(value);
}

async function loadTools(): Promise<ToolsApi> {
  const discover = asRecord(await import(pathToFileURL(toolsPath("discover.ts")).href));
  const install = asRecord(await import(pathToFileURL(toolsPath("install.ts")).href));
  const unreachable = discover?.RegistryUnreachableError;
  if (
    discover === null
    || install === null
    || typeof discover.discoverTools !== "function"
    || typeof install.installTool !== "function"
    || typeof unreachable !== "function"
  ) {
    throw new Error("The tool modules did not load.");
  }
  return {
    discoverTools: discover.discoverTools as ToolsApi["discoverTools"],
    installTool: install.installTool as ToolsApi["installTool"],
    unreachable: unreachable as ToolsApi["unreachable"],
  };
}

function toolsPath(fileName: string): string {
  return path.resolve(import.meta.dirname, "..", "..", "..", "engine", "src", "tools", fileName);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asOption(value: unknown): ToolOption | null {
  const row = asRecord(value);
  if (row === null) return null;
  if (typeof row.name !== "string" || !isKind(String(row.kind))) return null;
  return {
    name: row.name,
    kind: row.kind as ToolKind,
    why: stringField(row.why),
    licence: stringField(row.licence),
    costNote: stringField(row.costNote),
    maintenance: stringField(row.maintenance),
    blocked: row.blocked === true,
    blockReasons: stringList(row.blockReasons),
    repositoryUrl: stringField(row.repositoryUrl),
    publishedAt: stringField(row.publishedAt),
    weeklyDownloads: typeof row.weeklyDownloads === "number" ? row.weeklyDownloads : 0,
    hasInstallScript: row.hasInstallScript === true,
    installScriptExplanation: stringField(row.installScriptExplanation),
    packageName: stringField(row.packageName),
    secretEnv: stringList(row.secretEnv),
    command: stringField(row.command),
    args: stringList(row.args),
    url: stringField(row.url),
    registryNote: stringField(row.registryNote),
    userAsk: stringField(row.userAsk),
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    if (typeof item === "string") items.push(item);
  }
  return items;
}
