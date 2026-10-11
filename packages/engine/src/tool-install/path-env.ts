/**
 * Windows keeps a user PATH and a machine PATH in the registry.
 * A new install updates those, not the desk process. Re-read them and
 * merge any directory that is not already on this process PATH.
 * The directories already on PATH stay first, including a folder this
 * process just prepended.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { hiddenChildOptions } from "../hidden-child.ts";
import { rememberInstallPath, type ToolInstallRecord } from "./record.ts";

const USER_KEY = "HKCU\\Environment";
const MACHINE_KEY = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";

export function refreshWindowsPath(
  env: NodeJS.ProcessEnv,
  read: (key: string) => string | null = readRegistryPath,
): void {
  if (process.platform !== "win32") return;
  const additions: string[] = [];
  const machine = read(MACHINE_KEY);
  const user = read(USER_KEY);
  if (machine !== null) additions.push(expandWindowsEnv(machine, env));
  if (user !== null) additions.push(expandWindowsEnv(user, env));
  if (additions.length === 0) return;
  const current = env.Path ?? env.PATH ?? "";
  const merged = mergePathEntries(current, additions);
  env.Path = merged;
  env.PATH = merged;
}

export function parseRegPath(stdout: string): string | null {
  const match = stdout.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+)$/im);
  if (match?.[1] === undefined) return null;
  const value = match[1].trim();
  return value.length === 0 ? null : value;
}

export function expandWindowsEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (_all, name: string) => {
    const direct = env[name];
    if (typeof direct === "string") return direct;
    const upper = env[name.toUpperCase()];
    if (typeof upper === "string") return upper;
    return "";
  });
}

export function mergePathEntries(current: string, additions: readonly string[]): string {
  const sep = path.delimiter;
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    for (const part of value.split(sep)) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      const key = process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(trimmed);
    }
  };
  push(current);
  for (const extra of additions) push(extra);
  return parts.join(sep);
}

export function readRegistryPath(key: string): string | null {
  if (process.platform !== "win32") return null;
  const result = spawnSync("reg.exe", ["query", key, "/v", "Path"], hiddenChildOptions({
    encoding: "utf8",
  }));
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return parseRegPath(result.stdout);
}

/** Put a saved install back on this process so a re-check does not need a restart. */
export function restoreInstallEnv(records: readonly ToolInstallRecord[], env: NodeJS.ProcessEnv): void {
  for (const record of records) {
    if (!path.isAbsolute(record.installPath)) continue;
    rememberInstallPath(env, record.installPath);
    if (record.tool !== "whisper") continue;
    const bin = whisperBin(record.installPath);
    if (bin !== null && (env.WHISPER_CPP_BIN === undefined || env.WHISPER_CPP_BIN.length === 0)) {
      env.WHISPER_CPP_BIN = bin;
    }
    if (env.WHISPER_CPP_MODEL === undefined || env.WHISPER_CPP_MODEL.length === 0) {
      const model = modelBeside(record.recipeId, path.dirname(bin ?? record.installPath));
      if (model !== null) env.WHISPER_CPP_MODEL = model;
    }
  }
}

function whisperBin(installPath: string): string | null {
  if (existsSync(installPath)) {
    const name = path.basename(installPath).toLowerCase();
    if (name.startsWith("whisper") || name.startsWith("main")) return installPath;
  }
  const dir = existsSync(installPath) ? installPath : path.dirname(installPath);
  const names = process.platform === "win32"
    ? ["whisper.exe", "whisper-cli.exe", "main.exe"]
    : ["whisper", "whisper-cli", "main"];
  for (const name of names) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function modelBeside(recipeId: string, dir: string): string | null {
  const known: readonly (readonly [string, string])[] = [
    ["baseen", "ggml-base.en.bin"],
    ["tinyen", "ggml-tiny.en.bin"],
    ["base", "ggml-base.bin"],
    ["tiny", "ggml-tiny.bin"],
  ];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const [key, file] of known) {
    if (!recipeId.endsWith(`-${key}`)) continue;
    const found = entries.find((entry) => entry.toLowerCase() === file);
    if (found !== undefined) return path.join(dir, found);
  }
  const any = entries.find((entry) => entry.toLowerCase().startsWith("ggml-") && entry.toLowerCase().endsWith(".bin"));
  return any === undefined ? null : path.join(dir, any);
}
