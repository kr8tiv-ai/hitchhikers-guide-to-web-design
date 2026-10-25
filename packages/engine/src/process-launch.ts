/**
 * Spawn a resolved command. On Windows a .cmd or .bat shim goes through
 * cmd.exe /d /s /c with each argument quoted. shell stays off.
 * Callers choose stdio, detached, and how the child is killed.
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { hiddenChildOptions } from "./hidden-child.ts";
import { launchSpec } from "./tool-install/win-spawn.ts";

export interface LaunchProcessOptions {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  stdio: SpawnOptions["stdio"];
  detached?: boolean;
}

export function launchProcess(
  file: string,
  args: readonly string[],
  options: LaunchProcessOptions,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): ChildProcess {
  const spec = launchSpec(file, args, options.env, platform);
  const base: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    stdio: SpawnOptions["stdio"];
    detached?: boolean;
    windowsVerbatimArguments?: true;
  } = {
    env: options.env,
    stdio: options.stdio,
  };
  if (options.cwd !== undefined) base.cwd = options.cwd;
  if (options.detached !== undefined) base.detached = options.detached;
  if (spec.verbatim) base.windowsVerbatimArguments = true;
  if (spawnImpl !== spawn) return spawnImpl(spec.file, spec.args, hiddenChildOptions(base));
  return spawn(spec.file, spec.args, hiddenChildOptions(base));
}
