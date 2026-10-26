import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  buildInstallPlan,
  defaultConfig,
  deskPreflight as engineDeskPreflight,
  installHints,
  loadConfig,
  managersOnPath,
  playwrightBrowsersCache,
  probePathTools as engineProbePathTools,
  saveConfig,
  spawnProbe,
  type CommandResult,
  type CommandRunner,
  type DeskPreflightReport,
  type GuideConfig,
  explainDoctor,
  formatProbeNotes,
  type HintContext,
  type InstallPlan,
  type PathProbe,
  type SessionIdMode,
} from "@hitchhiker/engine";
import { cassetteLabel, formatCassetteLine } from "./cassette-guard.ts";
import { classifyAuthStatus, classifyHelp } from "./session-probe.ts";

export type { CommandResult, CommandRunner, DeskPreflightReport, PathProbe, PathProbeName } from "@hitchhiker/engine";
export { PATH_PROBE_NAMES } from "@hitchhiker/engine";

export type AuthProbe = "skipped" | "no-flag" | "signed-in" | "signed-out" | "unknown";

/** Chromium and WebKit. The device gate opens both. */
export const GATE_BROWSER_NAMES = ["chromium", "webkit"] as const;

export type GateBrowserName = (typeof GATE_BROWSER_NAMES)[number];

export interface GateBrowserSnapshot {
  cacheDir: string;
  chromium: boolean;
  webkit: boolean;
}

export interface GateBrowserReport extends GateBrowserSnapshot {
  /** True when the caller passed `--yes`. */
  yes: boolean;
  /** True when an install command was spawned. */
  installAttempted: boolean;
  /** True when that command exited 0. */
  installOk: boolean;
  /** Browsers that were missing before the install attempt. */
  missing: readonly GateBrowserName[];
}

export interface DoctorReport {
  nodeOk: boolean;
  nodeVersion: string;
  gitOk: boolean;
  grokOnPath: boolean;
  grokVersion: string | null;
  auth: AuthProbe;
  sessionIdMode: "unknown" | "uuid" | "alias";
  effortFlag: boolean;
  /** `off`, or the raw HH_CASSETTE value when the shell set one. */
  cassette: string;
  warnings: string[];
  /**
   * Quality-gate browsers. Omitted only when a caller formats an older
   * report that did not run this check.
   */
  gateBrowsers?: GateBrowserReport;
}

export interface DoctorOptions {
  projectDir?: string;
  nodeVersion?: string;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  /**
   * Install missing Chromium or WebKit. Omitted and false only describe them.
   * Doctor never prompts, so a non-interactive run cannot download by accident.
   */
  yes?: boolean;
  /** Stand-in for the Playwright browser cache. The default reads that cache. */
  readGateBrowsers?: (env: NodeJS.ProcessEnv) => GateBrowserSnapshot;
}

/**
 * grok, playwright, whisper, and pdftotext. One implementation for `hh doctor`
 * and the desk. No login, no network, shell off. The runner is the only spawn.
 */
export function probePathTools(runner: CommandRunner): PathProbe[] {
  return engineProbePathTools(runner);
}

/** Structured preflight for the desk. `grokOk` is the grok probe, not the other three. */
export function deskPreflight(runner: CommandRunner): DeskPreflightReport {
  return engineDeskPreflight(runner);
}

/**
 * Node is supported at major 22 and above. `version` is a string such as `v22.0.0`.
 */
export function nodeIsSupported(version: string): boolean {
  const parsed = readNodeVersion(version);
  return parsed !== null && parsed.major >= 22;
}

export function formatDoctor(report: DoctorReport, context?: HintContext): string {
  const lines = [
    `node: ${report.nodeVersion} ${report.nodeOk ? "ok" : "too old"}`,
    report.gitOk ? "git: ok" : "git: not on PATH",
    report.grokOnPath
      ? `grok: ${report.grokVersion ?? "on PATH"}`
      : "grok: not on PATH",
    formatAuth(report.auth),
    `session-id: ${report.sessionIdMode}`,
    `effort: ${report.effortFlag ? "present" : "absent"}`,
    formatCassetteLine(report.cassette),
  ];
  for (const warning of report.warnings) {
    if (isToolLine(warning)) lines.push(warning);
    else lines.push(`warning: ${warning}`);
  }
  for (const hint of installHints(report, context)) lines.push(hint);
  lines.push(...formatProbeNotes(explainDoctor(report, context)));
  lines.push("");
  lines.push(nodeSentence(report));
  lines.push(gitSentence(report));
  lines.push(grokSentence(report));
  if (report.gateBrowsers !== undefined) lines.push(browserSentence(report.gateBrowsers));
  return lines.join("\n");
}

/**
 * Check node, git, and grok, then classify session-id help.
 * grok is spawned for `--version`, `--help`, and a bare auth status flag when
 * help documents one. No login, no subcommand guess, and stdin is ignored.
 * Missing git, grok, playwright, whisper, or pdftotext are warnings.
 * Chromium and WebKit are checked for the quality gates and stay warnings.
 * They are installed only when `yes` is true. There is no prompt.
 * Exit 1 only when the node version is older than 22.
 */
export async function doctor(
  options: DoctorOptions = {},
): Promise<{ report: DoctorReport; exitCode: number }> {
  const runner = options.runner ?? { run: spawnCommand };
  const env = options.env ?? process.env;
  const parsed = readNodeVersion(options.nodeVersion ?? process.version);
  const nodeOk = parsed !== null && parsed.major >= 22;
  const nodeVersion = parsed?.text ?? (options.nodeVersion ?? process.version).trim();
  const warnings: string[] = [];

  const git = runner.run("git", ["--version"]);
  const gitOk = git.status === 0;
  if (!gitOk) warnings.push("git is not on PATH");

  const pathProbes = probePathTools(runner);
  const grokProbe = pathProbes.find((probe) => probe.name === "grok");
  const grokOnPath = grokProbe?.ok === true;
  const grokVersion = grokProbe?.version ?? null;
  let sessionIdMode: SessionIdMode = "unknown";
  let effortFlag = false;
  let auth: AuthProbe = "skipped";
  if (!grokOnPath) {
    warnings.push("session probe skipped");
  } else {
    const help = runner.run("grok", ["--help"]);
    const classified = classifyHelp(`${help.stdout}\n${help.stderr}`);
    sessionIdMode = classified.sessionIdMode;
    effortFlag = classified.effortFlag;
    if (help.status !== 0) warnings.push("grok --help exited non-zero");
    if (sessionIdMode === "unknown") {
      warnings.push("session-id mode is unknown. Pass an explicit flag later.");
    }
    auth = readAuth(runner, classified.authStatusFlag, warnings);
  }

  for (const probe of pathProbes) {
    if (probe.name === "grok" || probe.ok) continue;
    warnings.push(`${probe.name}: not installed`);
  }

  if (options.projectDir !== undefined) {
    await persistSessionMode(options.projectDir, sessionIdMode);
  }

  const report: DoctorReport = {
    nodeOk,
    nodeVersion,
    gitOk,
    grokOnPath,
    grokVersion,
    auth,
    sessionIdMode,
    effortFlag,
    cassette: cassetteLabel(env),
    warnings,
    gateBrowsers: resolveGateBrowsers(env, options.yes === true, runner, options.readGateBrowsers),
  };
  return { report, exitCode: nodeOk ? 0 : 1 };
}

/** Spawn with shell off and stdin ignored. The timeout is 10 seconds unless HH_PROBE_TIMEOUT_MS is a positive integer. PATH is the process PATH. */
export function spawnCommand(
  command: string,
  args: readonly string[],
): CommandResult {
  return spawnProbe(command, args);
}

function formatAuth(auth: AuthProbe): string {
  switch (auth) {
    case "skipped":
      return "auth: skipped";
    case "no-flag":
      return "auth: no non-interactive status flag in grok --help";
    case "signed-in":
      return "auth: signed-in";
    case "signed-out":
      return "auth: signed-out";
    case "unknown":
      return "auth: unknown";
  }
}

/**
 * Run the help-documented status flag with no extra arguments.
 * A null flag is reported. The flag is never `login` and never a project slug.
 */
function readAuth(
  runner: CommandRunner,
  flag: string | null,
  warnings: string[],
): AuthProbe {
  if (flag === null || !isStatusFlag(flag)) return "no-flag";
  const status = runner.run("grok", [flag]);
  const verdict = classifyAuthStatus(`${status.stdout}\n${status.stderr}`);
  if (verdict === "unknown") {
    warnings.push("auth status probe did not say signed-in or signed-out");
  }
  return verdict;
}

function isStatusFlag(flag: string): boolean {
  return /^--[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(flag);
}

async function persistSessionMode(
  projectDir: string,
  mode: SessionIdMode,
): Promise<void> {
  if (mode !== "uuid" && mode !== "alias") return;
  const file = path.join(projectDir, ".hitchhiker", "config.json");
  const fresh = !existsSync(file);
  const base: GuideConfig = fresh ? defaultConfig() : loadConfig(projectDir);
  // A new project starts at extra high. The factory default stays medium so
  // recorded cassettes and non-interview calls keep their build effort.
  const next: GuideConfig = fresh
    ? {
        ...base,
        sessionIdMode: mode,
        effort: "xhigh",
        ai: { ...base.ai, effort: { ...base.ai.effort, default: "xhigh" } },
      }
    : { ...base, sessionIdMode: mode };
  await saveConfig(projectDir, next);
}

function isToolLine(warning: string): boolean {
  return (
    warning.startsWith("playwright:") ||
    warning.startsWith("whisper:") ||
    warning.startsWith("pdftotext:")
  );
}

const CHROMIUM_FILES = [
  "chrome-win64/chrome.exe",
  "chrome-win/chrome.exe",
  "chrome-linux64/chrome",
  "chrome-linux/chrome",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
];

const WEBKIT_FILES = [
  "Playwright.exe",
  "pw_run.sh",
  "minibrowser-gtk/MiniBrowser",
  "minibrowser-wpe/MiniBrowser",
  "Playwright.app/Contents/MacOS/Playwright",
];

/**
 * Chromium and WebKit in Playwright's browser cache.
 * A headless-shell directory does not count as Chromium. The device gate
 * launches the full browser. This function does not download anything.
 */
export function readGateBrowsers(env: NodeJS.ProcessEnv = process.env): GateBrowserSnapshot {
  const cacheDir = playwrightBrowsersCache(process.platform, env);
  return {
    cacheDir,
    chromium: cacheHasBrowser(cacheDir, "chromium"),
    webkit: cacheHasBrowser(cacheDir, "webkit"),
  };
}

function cacheHasBrowser(cacheDir: string, name: GateBrowserName): boolean {
  let entries: string[] = [];
  try {
    entries = readdirSync(cacheDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return false;
  }
  const relatives = name === "chromium" ? CHROMIUM_FILES : WEBKIT_FILES;
  for (const entry of entries) {
    if (!isGateBrowserDir(entry, name)) continue;
    const root = path.join(cacheDir, entry);
    for (const relative of relatives) {
      if (existsSync(path.join(root, ...relative.split("/")))) return true;
    }
  }
  return false;
}

function isGateBrowserDir(entry: string, name: GateBrowserName): boolean {
  if (name === "webkit") return entry.startsWith("webkit-");
  if (!entry.startsWith("chromium-")) return false;
  return !entry.includes("headless");
}

function missingGateBrowsers(snapshot: GateBrowserSnapshot): GateBrowserName[] {
  const missing: GateBrowserName[] = [];
  if (!snapshot.chromium) missing.push("chromium");
  if (!snapshot.webkit) missing.push("webkit");
  return missing;
}

function resolveGateBrowsers(
  env: NodeJS.ProcessEnv,
  yes: boolean,
  runner: CommandRunner,
  read: DoctorOptions["readGateBrowsers"],
): GateBrowserReport {
  const snapshot = (read ?? readGateBrowsers)(env);
  const missing = missingGateBrowsers(snapshot);
  let installAttempted = false;
  let installOk = false;
  if (yes && missing.length > 0) {
    const plan = gateInstallPlan(env);
    if (plan !== null && plan.canRun) {
      const spec = installCommand(plan, missing);
      const result = runner.run(spec.command, spec.args);
      installAttempted = true;
      installOk = result.status === 0;
    }
  }
  return {
    cacheDir: snapshot.cacheDir,
    chromium: snapshot.chromium || (installOk && missing.includes("chromium")),
    webkit: snapshot.webkit || (installOk && missing.includes("webkit")),
    yes,
    installAttempted,
    installOk,
    missing,
  };
}

function gateInstallPlan(env: NodeJS.ProcessEnv): InstallPlan | null {
  try {
    return buildInstallPlan("playwright", null, {
      platform: process.platform,
      arch: process.arch,
      managers: managersOnPath(env, process.platform),
      dataDir: "",
      browsersDir: playwrightBrowsersCache(process.platform, env),
      workspaceDir: "",
    });
  } catch {
    return null;
  }
}

function installCommand(
  plan: InstallPlan,
  missing: readonly GateBrowserName[],
): { command: string; args: string[] } {
  const step = plan.runSteps.find((item) => item.kind === "spawn" && item.argv.includes("install"));
  const argv = step === undefined ? ["pnpm", "exec", "playwright", "install"] : [...step.argv];
  const at = argv.lastIndexOf("install");
  const head = at >= 0 ? argv.slice(0, at + 1) : ["pnpm", "exec", "playwright", "install"];
  const command = head[0];
  if (command === undefined || command.length === 0) {
    return { command: "pnpm", args: ["exec", "playwright", "install", ...missing] };
  }
  return { command, args: [...head.slice(1), ...missing] };
}

function nodeSentence(report: DoctorReport): string {
  if (report.nodeOk) {
    return `Node.js ${report.nodeVersion} is new enough. The Guide needs Node.js 22 or newer.`;
  }
  return `Node.js ${report.nodeVersion} is too old. Install Node.js 22 or newer, then run hh doctor again.`;
}

function gitSentence(report: DoctorReport): string {
  if (report.gitOk) return "Git is on this computer.";
  return "Git is not on this computer. Saves and the queue need it. The Guide still starts.";
}

function grokSentence(report: DoctorReport): string {
  if (!report.grokOnPath) {
    return "Grok is not on this computer. Install the Grok Build CLI, then sign in with grok login. This check does not sign you in.";
  }
  if (report.auth === "signed-in") return "Grok is on this computer, and you are signed in.";
  if (report.auth === "signed-out") {
    return "Grok is on this computer, and you are signed out. Run grok login in a terminal, then run hh doctor again. This check does not sign you in.";
  }
  if (report.auth === "no-flag") {
    return "Grok is on this computer. Its help text has no status check this program can run, so it cannot tell whether you are signed in. This check does not sign you in.";
  }
  if (report.auth === "skipped") {
    return "Grok is on this computer. The sign-in check was skipped. This check does not sign you in.";
  }
  return "Grok is on this computer. The status check did not say whether you are signed in. Run grok login if you have not, then run hh doctor again. This check does not sign you in.";
}

function browserSentence(browsers: GateBrowserReport): string {
  const ready = browsers.chromium && browsers.webkit;
  if (ready && !browsers.installAttempted) {
    return "Chromium and WebKit are installed. The quality gates can open a phone and a desktop browser. Nothing was downloaded.";
  }
  if (ready && browsers.installOk) {
    return "You said yes. The missing browsers are installed. Chromium and WebKit are ready for the quality gates.";
  }
  const command = `pnpm exec playwright install ${browsers.missing.join(" ")}`;
  const missingText = describeMissingBrowsers(browsers.missing);
  if (!browsers.yes) {
    return `The quality gates need Chromium and WebKit. ${missingText} Nothing was downloaded. Run hh doctor --yes to install them, or run ${command} yourself.`;
  }
  if (browsers.installAttempted && !browsers.installOk) {
    return `You said yes, and the browser install did not finish. ${missingText} Run ${command}, then run hh doctor again.`;
  }
  return `You said yes. pnpm is not on this machine, so the browsers were not downloaded. ${missingText} Run ${command} when pnpm is available.`;
}

function describeMissingBrowsers(missing: readonly GateBrowserName[]): string {
  if (missing.length === 2) return "Chromium and WebKit are missing.";
  if (missing[0] === "chromium") return "Chromium is missing.";
  if (missing[0] === "webkit") return "WebKit is missing.";
  return "Chromium and WebKit are missing.";
}

function readNodeVersion(version: string): { major: number; text: string } | null {
  const match = /(?:^|\bv)(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (match === null) return null;
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) return null;
  const parsedMajor = Number(major);
  if (!Number.isInteger(parsedMajor)) return null;
  return { major: parsedMajor, text: `${major}.${minor}.${patch}` };
}
