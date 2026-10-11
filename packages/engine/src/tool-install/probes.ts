/**
 * grok, playwright, whisper, and pdftotext.
 * One implementation for `hh doctor`, the desk, and the post-install re-check.
 * No login, no network, shell off. The runner is the only spawn.
 */

import { spawnSync } from "node:child_process";
import os from "node:os";
import { hiddenChildOptions } from "../hidden-child.ts";

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

export function probePathTools(runner: CommandRunner): PathProbe[] {
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
    const ok = commandFound(runner.run(tool, args));
    probes.push({
      name: tool,
      ok,
      detail: ok ? `${tool}: installed` : `${tool}: not installed`,
      version: null,
    });
  }
  return probes;
}

/** Structured preflight for the desk. `grokOk` is the grok probe, not the other three. */
export function deskPreflight(runner: CommandRunner): DeskPreflightReport {
  const probes = probePathTools(runner);
  return {
    grokOk: probes.some((probe) => probe.name === "grok" && probe.ok),
    probes: probes.map((probe) => ({ name: probe.name, ok: probe.ok, detail: probe.detail })),
  };
}

/** Spawn with shell off, stdin ignored, and a 10 second timeout. PATH is the process PATH. */
export function spawnProbe(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], hiddenChildOptions({
    shell: false,
    timeout: SPAWN_TIMEOUT_MS,
    encoding: "utf8",
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
