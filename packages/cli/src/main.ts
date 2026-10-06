#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doctor, formatDoctor, type CommandRunner, type DoctorOptions } from "./doctor.ts";

const HELP = "hh doctor [--project <dir>]";

export type ParsedArgs =
  | { ok: true; projectDir?: string }
  | { ok: false };

/** `hh doctor` and `hh doctor --project <dir>` are the only successful forms. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 1 && argv[0] === "doctor") return { ok: true };
  if (argv.length === 3 && argv[0] === "doctor" && argv[1] === "--project") {
    const dir = argv[2];
    if (dir === undefined || dir.length === 0 || dir.startsWith("-")) {
      return { ok: false };
    }
    return { ok: true, projectDir: dir };
  }
  return { ok: false };
}

export async function runCli(
  argv: readonly string[],
  runner?: CommandRunner,
): Promise<{ exitCode: number; stdout: string }> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return { exitCode: 2, stdout: `${HELP}\n` };
  const options: DoctorOptions = {
    ...(parsed.projectDir === undefined ? {} : { projectDir: parsed.projectDir }),
    ...(runner === undefined ? {} : { runner }),
  };
  const outcome = await doctor(options);
  return { exitCode: outcome.exitCode, stdout: `${formatDoctor(outcome.report)}\n` };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry.length === 0) return false;
  return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  runCli(process.argv.slice(2))
    .then((outcome) => {
      process.stdout.write(outcome.stdout);
      process.exitCode = outcome.exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "doctor failed";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
