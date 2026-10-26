/**
 * grok, playwright, whisper, and pdftotext.
 * One implementation for `hh doctor`, the desk, and the post-install re-check.
 * No login, no network, shell off. The runner is the only spawn.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hiddenChildOptions } from "../hidden-child.ts";
import { launchSpec } from "./win-spawn.ts";

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  errorCode: string | null;
}

export interface CommandRunner {
  run(command: string, args: readonly string[]): CommandResult;
}

const SPAWN_TIMEOUT_MS = 10_000;

/** A positive HH_PROBE_TIMEOUT_MS shortens the probe. Anything else keeps 10 seconds. */
function probeTimeoutMs(env: NodeJS.ProcessEnv): number {
  const raw = env.HH_PROBE_TIMEOUT_MS;
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return SPAWN_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return SPAWN_TIMEOUT_MS;
  return parsed;
}

const OPTIONAL_TOOLS = ["playwright", "whisper", "pdftotext"] as const;

export const PATH_PROBE_NAMES = ["grok", ...OPTIONAL_TOOLS] as const;

export type PathProbeName = (typeof PATH_PROBE_NAMES)[number];

export interface PathProbe {
  name: PathProbeName;
  ok: boolean;
  detail: string;
  version: string | null;
}

/** The four PATH lines the desk prints. Same probes as `hh doctor`. */
export interface DeskPreflightReport {
  grokOk: boolean;
  probes: Array<{ name: PathProbeName; ok: boolean; detail: string }>;
}

export interface ProbeOptions {
  /** When set, whisper uses `WHISPER_CPP_BIN` if that file exists. */
  env?: NodeJS.ProcessEnv;
}

export function probePathTools(runner: CommandRunner, options: ProbeOptions = {}): PathProbe[] {
  const env = options.env ?? {};
  const grok = probeGrok(runner);
  const probes: PathProbe[] = [
    {
      name: "grok",
      ok: grok.onPath,
      detail: grok.onPath ? `grok: ${grok.version ?? "on PATH"}` : "grok: not on PATH",
      version: grok.version,
    },
  ];
  for (const tool of OPTIONAL_TOOLS) {
    const args = tool === "pdftotext" ? ["-v"] : ["--version"];
    const ok = tool === "whisper" ? whisperFound(runner, env, args) : commandFound(runner.run(tool, args));
    probes.push({
      name: tool,
      ok,
      detail: ok ? `${tool}: installed` : `${tool}: not installed`,
      version: null,
    });
  }
  return probes;
}

function whisperFound(runner: CommandRunner, env: NodeJS.ProcessEnv, args: readonly string[]): boolean {
  const configured = env.WHISPER_CPP_BIN;
  if (typeof configured === "string" && isExecutableFile(configured)) {
    if (commandFound(runner.run(configured, args))) return true;
  }
  return commandFound(runner.run("whisper", args));
}

function isExecutableFile(filePath: string): boolean {
  if (!path.isAbsolute(filePath) || !existsSync(filePath)) return false;
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Structured preflight for the desk. `grokOk` is the grok probe, not the other three. */
export function deskPreflight(runner: CommandRunner): DeskPreflightReport {
  const probes = probePathTools(runner);
  return {
    grokOk: probes.some((probe) => probe.name === "grok" && probe.ok),
    probes: probes.map((probe) => ({ name: probe.name, ok: probe.ok, detail: probe.detail })),
  };
}

/** Spawn with shell off and stdin ignored. The timeout is 10 seconds unless HH_PROBE_TIMEOUT_MS is a positive integer. PATH comes from `env`. */
export function spawnProbe(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): CommandResult {
  const spec = launchSpec(command, args, env, process.platform);
  const result = spawnSync(spec.file, spec.args, hiddenChildOptions({
    shell: false,
    timeout: probeTimeoutMs(env),
    encoding: "utf8",
    env,
    windowsVerbatimArguments: spec.verbatim,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    errorCode: errorCodeOf(result.error),
  };
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

function commandFound(result: CommandResult): boolean {
  if (result.status !== null) return true;
  return result.errorCode === "ETIMEDOUT";
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? "";
  return line.trim();
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}
