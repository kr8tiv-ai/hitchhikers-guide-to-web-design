#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { runAssetsCommand } from "./commands/assets.ts";
import { runToolsCommand } from "./commands/tools.ts";
import { closeActiveApp, runApp } from "./commands/app.ts";
import { doctor, formatDoctor, type CommandRunner, type DoctorOptions } from "./doctor.ts";

const HELP = "hh doctor [--project <dir>]";

const USAGE =
  "Usage: hh progress --project <dir> | hh pause --project <dir> --message <text> | hh resume --project <dir>";

export type ParsedArgs =
  | { ok: true; projectDir?: string }
  | { ok: false };

export interface ParsedCli {
  cmd: "progress" | "pause" | "resume";
  project: string;
  message?: string;
}

/** `hh doctor` and `hh doctor --project <dir>` are the only successful doctor forms. */
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

/**
 * `hh progress`, `hh pause`, and `hh resume`. No parser library.
 * A missing project throws a usage string that names `--project`.
 * Pause rejects an empty message, a newline, or a body that would become a STATE.md heading.
 */
export function parseCli(argv: string[]): ParsedCli {
  const cmd = argv[0];
  if (cmd !== "progress" && cmd !== "pause" && cmd !== "resume") {
    throw new Error(`Unknown command. ${USAGE}`);
  }
  let project: string | undefined;
  let message: string | undefined;
  let sawMessage = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new Error(`Missing --project. ${USAGE}`);
      }
      project = value;
      index += 1;
      continue;
    }
    if (arg === "--message") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Pause message is empty. ${USAGE}`);
      }
      message = value;
      sawMessage = true;
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument. ${USAGE}`);
  }
  if (project === undefined) {
    throw new Error(`Missing --project. ${USAGE}`);
  }
  if (cmd === "pause") {
    if (!sawMessage || message === undefined) {
      throw new Error(`Pause message is empty. ${USAGE}`);
    }
    assertSafeMessage(message);
    return { cmd, project, message };
  }
  if (sawMessage) {
    throw new Error(`Unexpected argument. ${USAGE}`);
  }
  return { cmd, project };
}

function assertSafeMessage(message: string): void {
  // saveState writes the body on its own line. A newline, or a body that is itself
  // a "## " heading, would add a STATE.md heading.
  if (
    message.includes("\n") ||
    message.includes("\r") ||
    message.includes("\u2028") ||
    message.includes("\u2029")
  ) {
    throw new Error("Pause message cannot contain a newline.");
  }
  if (message.trim().length === 0) {
    throw new Error(`Pause message is empty. ${USAGE}`);
  }
  if (message.startsWith("## ")) {
    throw new Error("Pause message cannot be a STATE.md heading.");
  }
}

function formatProgress(state: GuideState): string {
  return [
    `phase: ${state.phase}`,
    `slice: ${state.slice}`,
    `prompt: ${state.promptId}`,
    `next: ${state.nextAction}`,
    "",
  ].join("\n");
}

async function runStateCommand(argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> {
  try {
    const parsed = parseCli([...argv]);
    const state = loadState(parsed.project);
    if (state === null) {
      return { exitCode: 1, stdout: "No project state yet.\n" };
    }
    if (parsed.cmd === "progress") {
      return { exitCode: 0, stdout: formatProgress(state) };
    }
    if (parsed.cmd === "resume") {
      return { exitCode: 0, stdout: `resume: ${state.promptId}\n` };
    }
    const message = parsed.message;
    if (message === undefined) {
      throw new Error(`Pause message is empty. ${USAGE}`);
    }
    assertSafeMessage(message);
    await saveState(parsed.project, {
      phase: state.phase,
      slice: state.slice,
      promptId: state.promptId,
      lastGoodCommit: state.lastGoodCommit,
      blockers: [...state.blockers],
      nextAction: message,
      updatedAt: new Date().toISOString(),
    });
    return { exitCode: 0, stdout: "Next action saved.\n" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Command failed.";
    return { exitCode: 1, stdout: `${message}\n` };
  }
}

export async function runCli(
  argv: readonly string[],
  runner?: CommandRunner,
): Promise<{ exitCode: number; stdout: string }> {
  const command = argv[0];
  if (command === "app") return runApp(argv.slice(1));
  if (command === "assets") return runAssetsCommand(argv.slice(1));
  if (command === "tools") return runToolsCommand(argv.slice(1));
  if (command === "progress" || command === "pause" || command === "resume") {
    return runStateCommand(argv);
  }
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
  const argv = process.argv.slice(2);
  runCli(argv)
    .then((outcome) => {
      process.stdout.write(outcome.stdout);
      if (argv[0] === "app" && outcome.exitCode === 0) {
        const stop = (): void => {
          void closeActiveApp().finally(() => {
            process.exit(0);
          });
        };
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
        return;
      }
      process.exitCode = outcome.exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "doctor failed";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
