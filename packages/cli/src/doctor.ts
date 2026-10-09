import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultConfig,
  loadConfig,
  saveConfig,
  type GuideConfig,
  type SessionIdMode,
} from "@hitchhiker/engine";
import { cassetteLabel, formatCassetteLine } from "./cassette-guard.ts";
import { classifyAuthStatus, classifyHelp } from "./session-probe.ts";

export type AuthProbe = "skipped" | "no-flag" | "signed-in" | "signed-out" | "unknown";

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
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  errorCode: string | null;
}

export interface CommandRunner {
  run(command: string, args: readonly string[]): CommandResult;
}

export interface DoctorOptions {
  projectDir?: string;
  nodeVersion?: string;
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
}

const SPAWN_TIMEOUT_MS = 10_000;

const OPTIONAL_TOOLS = ["playwright", "whisper", "pdftotext"] as const;

/**
 * Node is supported at major 22 and above. `version` is a string such as `v22.0.0`.
 */
export function nodeIsSupported(version: string): boolean {
  const parsed = readNodeVersion(version);
  return parsed !== null && parsed.major >= 22;
}

export function formatDoctor(report: DoctorReport): string {
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
  return lines.join("\n");
}

/**
 * Check node, git, and grok, then classify session-id help.
 * grok is spawned for `--version`, `--help`, and a bare auth status flag when
 * help documents one. No login, no subcommand guess, and stdin is ignored.
 * Missing git, grok, playwright, whisper, or pdftotext are warnings.
 * Exit 1 only when the node version is older than 22.
 */
export async function doctor(
  options: DoctorOptions = {},
): Promise<{ report: DoctorReport; exitCode: number }> {
  const runner = options.runner ?? { run: spawnCommand };
  const parsed = readNodeVersion(options.nodeVersion ?? process.version);
  const nodeOk = parsed !== null && parsed.major >= 22;
  const nodeVersion = parsed?.text ?? (options.nodeVersion ?? process.version).trim();
  const warnings: string[] = [];

  const git = runner.run("git", ["--version"]);
  const gitOk = git.status === 0;
  if (!gitOk) warnings.push("git is not on PATH");

  const grokProbe = probeGrok(runner);
  let sessionIdMode: SessionIdMode = "unknown";
  let effortFlag = false;
  let auth: AuthProbe = "skipped";
  if (!grokProbe.onPath) {
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

  for (const tool of OPTIONAL_TOOLS) {
    const args = tool === "pdftotext" ? ["-v"] : ["--version"];
    if (!commandFound(runner.run(tool, args))) {
      warnings.push(`${tool}: not installed`);
    }
  }

  if (options.projectDir !== undefined) {
    await persistSessionMode(options.projectDir, sessionIdMode);
  }

  const report: DoctorReport = {
    nodeOk,
    nodeVersion,
    gitOk,
    grokOnPath: grokProbe.onPath,
    grokVersion: grokProbe.version,
    auth,
    sessionIdMode,
    effortFlag,
    cassette: cassetteLabel(options.env ?? process.env),
    warnings,
  };
  return { report, exitCode: nodeOk ? 0 : 1 };
}

/** Spawn with shell off, stdin ignored, and a 10 second timeout. PATH is the process PATH. */
export function spawnCommand(
  command: string,
  args: readonly string[],
): CommandResult {
  const result = spawnSync(command, [...args], {
    shell: false,
    timeout: SPAWN_TIMEOUT_MS,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    errorCode: errorCodeOf(result.error),
  };
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

function probeGrok(runner: CommandRunner): { onPath: boolean; version: string | null } {
  const versionRun = runner.run("grok", ["--version"]);
  if (versionRun.status === 0) {
    const line = firstLine(versionRun.stdout);
    return { onPath: true, version: line.length > 0 ? line : null };
  }
  if (commandFound(versionRun)) {
    return { onPath: true, version: null };
  }
  // `--version` missed. On Windows, where.exe is a real binary.
  // `which` is not required. `command -v` is a shell builtin and cannot run with shell off.
  if (os.platform() === "win32") {
    const where = runner.run("where.exe", ["grok"]);
    const onPath = where.status === 0 && where.stdout.trim().length > 0;
    return { onPath, version: null };
  }
  return { onPath: false, version: null };
}

async function persistSessionMode(
  projectDir: string,
  mode: SessionIdMode,
): Promise<void> {
  if (mode !== "uuid" && mode !== "alias") return;
  const file = path.join(projectDir, ".hitchhiker", "config.json");
  const base: GuideConfig = existsSync(file) ? loadConfig(projectDir) : defaultConfig();
  await saveConfig(projectDir, { ...base, sessionIdMode: mode });
}

function commandFound(result: CommandResult): boolean {
  if (result.status !== null) return true;
  return result.errorCode === "ETIMEDOUT";
}

function isToolLine(warning: string): boolean {
  return (
    warning.startsWith("playwright:") ||
    warning.startsWith("whisper:") ||
    warning.startsWith("pdftotext:")
  );
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  return line.trim();
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

function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}
