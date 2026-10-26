/**
 * Environment for a git child that must not inherit the desk's repo.
 * GIT_DIR, fsmonitor, and a credential helper can stall a temp repo
 * until the command timeout. An empty config and no hooks keep the
 * child on the directory it was given.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let emptyConfig: string | null = null;

function emptyConfigFile(): string {
  if (emptyConfig !== null) return emptyConfig;
  const file = path.join(os.tmpdir(), "hh-elevate-empty.gitconfig");
  if (!existsSync(file)) writeFileSync(file, "");
  emptyConfig = file;
  return file;
}

/** Hooks directory with nothing in it. A machine hook cannot run. */
export function emptyHooksPath(): string {
  const dir = path.join(os.tmpdir(), "hh-elevate-no-hooks");
  mkdirSync(dir, { recursive: true });
  return dir.replaceAll("\\", "/");
}

/** Author, no prompt, and no inherited GIT_* variables. */
export function isolatedGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  const blank = emptyConfigFile();
  env.GIT_AUTHOR_NAME = "Hitchhiker";
  env.GIT_AUTHOR_EMAIL = "hh@localhost";
  env.GIT_COMMITTER_NAME = "Hitchhiker";
  env.GIT_COMMITTER_EMAIL = "hh@localhost";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CONFIG_GLOBAL = blank;
  env.GIT_CONFIG_SYSTEM = blank;
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}
