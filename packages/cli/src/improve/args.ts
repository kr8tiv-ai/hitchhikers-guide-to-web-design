import path from "node:path";
import { resolveMaxExperiments } from "@hitchhiker/engine";

export interface ImproveArgs {
  program: string;
  maxExperiments: number;
  dryRun: boolean;
  branch?: string;
  minutes?: number;
  turns?: number;
}

function needValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.length === 0 || value.startsWith("-")) {
    throw new Error(`Missing ${flag}.`);
  }
  return value;
}

function wholeNumber(raw: string, flag: string): number {
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${flag} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${flag} must be an integer.`);
  return value;
}

/** `hh improve` flags. Unknown flags throw. Max experiments defaults to 5. */
export function parseImproveArgs(argv: readonly string[]): ImproveArgs {
  let program = path.join("improve", "program.md");
  let max: number | undefined;
  let branch: string | undefined;
  let minutes: number | undefined;
  let turns: number | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      if (dryRun) throw new Error("Unexpected argument.");
      dryRun = true;
      continue;
    }
    if (arg === "--program") {
      program = needValue(argv, index + 1, "--program");
      index += 1;
      continue;
    }
    if (arg === "--max-experiments") {
      if (max !== undefined) throw new Error("Unexpected argument.");
      max = wholeNumber(needValue(argv, index + 1, "--max-experiments"), "--max-experiments");
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      if (branch !== undefined) throw new Error("Unexpected argument.");
      branch = needValue(argv, index + 1, "--branch");
      index += 1;
      continue;
    }
    if (arg === "--minutes") {
      if (minutes !== undefined) throw new Error("Unexpected argument.");
      minutes = wholeNumber(needValue(argv, index + 1, "--minutes"), "--minutes");
      index += 1;
      continue;
    }
    if (arg === "--turns") {
      if (turns !== undefined) throw new Error("Unexpected argument.");
      turns = wholeNumber(needValue(argv, index + 1, "--turns"), "--turns");
      index += 1;
      continue;
    }
    throw new Error("Unexpected argument.");
  }
  return {
    program,
    maxExperiments: resolveMaxExperiments(max),
    dryRun,
    ...(branch === undefined ? {} : { branch }),
    ...(minutes === undefined ? {} : { minutes }),
    ...(turns === undefined ? {} : { turns }),
  };
}
