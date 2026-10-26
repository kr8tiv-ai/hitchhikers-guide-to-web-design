/**
 * Resolve a PATH command and, on Windows, start a .cmd or .bat through
 * cmd.exe /d /s /c. CreateProcess cannot start a batch shim. shell stays off.
 * Arguments stay an array until the one cmd.exe command line is quoted.
 */

import path from "node:path";
import { findNamedFile } from "../path-names.ts";

export interface LaunchSpec {
  file: string;
  args: string[];
  verbatim: boolean;
}

export function launchSpec(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): LaunchSpec {
  if (platform !== "win32") return { file: command, args: [...args], verbatim: false };
  const resolved = resolveOnPath(command, env);
  if (/\.(cmd|bat)$/i.test(resolved)) {
    const commandLine = [resolved, ...args].map((arg) => quoteCmdArg(arg)).join(" ");
    const comspec = comSpecFrom(env);
    return {
      file: comspec,
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      verbatim: true,
    };
  }
  return { file: resolved, args: [...args], verbatim: false };
}

/**
 * `.EXE` wins over `.CMD` when PATHEXT lists EXE first.
 * A missing command is returned unchanged so the spawn reports ENOENT.
 */
export function resolveOnPath(command: string, env: NodeJS.ProcessEnv): string {
  if (command.length === 0) return command;
  if (path.win32.isAbsolute(command) || command.includes("\\") || command.includes("/")) return command;
  const pathValue = env.Path ?? env.PATH ?? "";
  const dirs = pathValue.split(";").map((dir) => dir.trim()).filter((dir) => dir.length > 0);
  const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim())
    .filter((ext) => ext.length > 0);
  for (const dir of dirs) {
    for (const ext of exts) {
      const suffix = ext.startsWith(".") ? ext : `.${ext}`;
      // Host join. path.win32.join rewrites `/tmp/shim` to `\tmp\shim`, which
      // stat misses on Linux and macOS. On Windows, path.join is path.win32.join.
      const found = findNamedFile(dir, `${command}${suffix}`);
      if (found !== null) return found;
    }
  }
  return command;
}

/**
 * cmd expands %VAR% even inside quotes. End the quote, emit a caret-escaped
 * percent, and reopen the quote. The caller wraps the joined line in quotes
 * for cmd.exe /s /c, which strips that outer pair.
 */
export function quoteCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^()%!`]/.test(arg)) return arg;
  let out = '"';
  let slashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      slashes += 1;
      continue;
    }
    if (char === "%") {
      if (slashes > 0) out += "\\".repeat(slashes * 2);
      slashes = 0;
      out += '"^%"';
      continue;
    }
    if (char === '"') {
      out += `${"\\".repeat(slashes * 2)}\\"`;
      slashes = 0;
      continue;
    }
    if (slashes > 0) {
      out += "\\".repeat(slashes);
      slashes = 0;
    }
    out += char;
  }
  if (slashes > 0) out += "\\".repeat(slashes * 2);
  return `${out}"`;
}

/** ComSpec, COMSPEC, or any other case. An empty value is kept. */
function comSpecFrom(env: NodeJS.ProcessEnv): string {
  if (typeof env.ComSpec === "string") return env.ComSpec;
  if (typeof env.COMSPEC === "string") return env.COMSPEC;
  const key = Object.keys(env).find((name) => name.toLowerCase() === "comspec");
  if (key !== undefined) {
    const value = env[key];
    if (typeof value === "string") return value;
  }
  return "cmd.exe";
}
