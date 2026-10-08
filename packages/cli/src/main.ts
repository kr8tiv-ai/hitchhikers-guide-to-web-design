#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { runAssetsCommand } from "./commands/assets.ts";
import { runElevateCommand } from "./commands/elevate.ts";
import { runToolsCommand } from "./commands/tools.ts";
import { closeActiveApp, runApp } from "./commands/app.ts";
import { doctor, formatDoctor, type CommandRunner, type DoctorOptions } from "./doctor.ts";
import { runInstall } from "./install.ts";

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

const ELEVATE_NEEDS_YES = "Elevate does not run without --yes.";

export interface QaReportInput {
  phone: { status: "PASS" | "BLOCKER"; reasons: string[] };
  a11y: { status: "PASS" | "BLOCKER"; notes: string[] };
  weight: { status: "PASS" | "BLOCKER"; reasons: string[] };
  juryStatus: "PASS" | "FAIL";
  juryTotal: number;
}

export interface RunQaDeps {
  cwd?: string;
  report?: (project: string) => QaReportInput | Promise<QaReportInput>;
  render?: (input: QaReportInput) => string | Promise<string>;
  beforeWeJump?: (project: string) => { questions: string[] } | Promise<{ questions: string[] }>;
  planned?: (project: string) => readonly string[] | Promise<readonly string[]>;
  apply?: (project: string) => void | Promise<void>;
}

/**
 * `hh mostly-harmless` and `hh elevate`.
 * `--yes` is false unless that flag is present. mostly-harmless rejects it.
 * Unknown flags throw. A missing project throws a message that names `--project`.
 */
export function parseQaArgs(argv: string[]): { cmd: "mostly-harmless" | "elevate"; project: string; yes: boolean } {
  const cmd = argv[0];
  if (cmd !== "mostly-harmless" && cmd !== "elevate") {
    throw new Error("Unknown command.");
  }
  let project: string | undefined;
  let yes = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      if (project !== undefined) throw new Error("Unexpected argument.");
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new Error("Missing --project.");
      }
      project = value;
      index += 1;
      continue;
    }
    if (arg === "--yes") {
      if (yes) throw new Error("Unexpected argument.");
      if (cmd === "mostly-harmless") throw new Error("--yes is rejected for mostly-harmless.");
      yes = true;
      continue;
    }
    throw new Error("Unexpected argument.");
  }
  if (project === undefined) throw new Error("Missing --project.");
  return { cmd, project, yes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blockedReport(): QaReportInput {
  const reason = "No gate results were supplied.";
  return {
    phone: { status: "BLOCKER", reasons: [reason] },
    a11y: { status: "BLOCKER", notes: [reason] },
    weight: { status: "BLOCKER", reasons: [reason] },
    juryStatus: "FAIL",
    juryTotal: 0,
  };
}

function inputBlocks(input: QaReportInput): boolean {
  return (
    input.phone.status !== "PASS" ||
    input.a11y.status !== "PASS" ||
    input.weight.status !== "PASS" ||
    input.juryStatus !== "PASS"
  );
}

function markdownBlocks(markdown: string): boolean {
  const marker = "## Overall";
  const start = markdown.lastIndexOf(marker);
  if (start < 0) return true;
  return markdown.slice(start).includes("BLOCKER");
}

async function loadRender(): Promise<(input: QaReportInput) => string> {
  const file = path.resolve(import.meta.dirname, "..", "..", "qa", "src", "report.ts");
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (!isRecord(loaded) || typeof loaded.renderQaReport !== "function") {
    throw new Error("The report module did not load.");
  }
  return loaded.renderQaReport as (input: QaReportInput) => string;
}

async function loadQuestions(_project: string): Promise<string[]> {
  const file = path.resolve(import.meta.dirname, "..", "..", "engine", "src", "spec", "before-jump.ts");
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (!isRecord(loaded) || typeof loaded.beforeWeJump !== "function") {
    throw new Error("Before we jump did not load.");
  }
  const result: unknown = loaded.beforeWeJump({ answers: [], approvals: {}, hasLegalPage: false });
  if (!isRecord(result) || !Array.isArray(result.questions)) {
    throw new Error("Before we jump did not load.");
  }
  const questions: string[] = [];
  for (const question of result.questions) {
    if (typeof question === "string" && question.length > 0) questions.push(question);
  }
  return questions;
}

async function runElevatePlan(
  project: string,
  yes: boolean,
  deps: RunQaDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const raw = deps.planned === undefined ? [] : await deps.planned(project);
  const lines = raw.length === 0 ? ["No planned items."] : [...raw];
  if (!yes) {
    lines.push(ELEVATE_NEEDS_YES);
    return { exitCode: 2, stdout: `${lines.join("\n")}\n` };
  }
  if (deps.apply !== undefined) await deps.apply(project);
  lines.push(deps.apply === undefined ? "Nothing was written." : "Applied.");
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}

async function runMostlyHarmless(
  project: string,
  deps: RunQaDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const input = deps.report === undefined ? blockedReport() : await deps.report(project);
  const render = deps.render === undefined ? await loadRender() : deps.render;
  const markdown = await render(input);
  const asked =
    deps.beforeWeJump === undefined
      ? { questions: await loadQuestions(project) }
      : await deps.beforeWeJump(project);
  const reportPath = path.join(project, ".hitchhiker", "QA-REPORT.md");
  const lines = [`QA-REPORT.md: ${reportPath}`, ""];
  if (asked.questions.length === 0) lines.push("No open questions.");
  else for (const question of asked.questions) lines.push(question);
  lines.push("", markdown.trimEnd());
  const blocked = inputBlocks(input) || markdownBlocks(markdown);
  return { exitCode: blocked ? 1 : 0, stdout: `${lines.join("\n")}\n` };
}

/**
 * Run mostly-harmless or elevate and return the exit code.
 * Tests pass the report, the questions, the plan, and apply.
 * apply runs only for elevate with `--yes`.
 */
export async function runQa(
  argv: readonly string[],
  deps: RunQaDeps = {},
): Promise<{ exitCode: number; stdout: string }> {
  let parsed: { cmd: "mostly-harmless" | "elevate"; project: string; yes: boolean };
  try {
    parsed = parseQaArgs([...argv]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Command failed.";
    return { exitCode: 2, stdout: `${message}\n` };
  }
  const project = path.resolve(deps.cwd ?? process.cwd(), parsed.project);
  try {
    if (parsed.cmd === "elevate") return await runElevatePlan(project, parsed.yes, deps);
    return await runMostlyHarmless(project, deps);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Command failed.";
    return { exitCode: 1, stdout: `${message.replaceAll("!", ".")}\n` };
  }
}

function isRoundElevate(rest: readonly string[]): boolean {
  if (rest.length === 0) return false;
  const head = rest[0];
  if (head === "detail" || head === "copy" || head === "--help" || head === "-h") return true;
  for (const arg of rest) {
    if (arg === "--url" || arg === "--pick" || arg === "--approve") return true;
  }
  return false;
}

function roundWouldApply(rest: readonly string[]): boolean {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--approve") return true;
    if (arg !== "--pick") continue;
    if (rest[index + 1] !== "none") return true;
  }
  return false;
}

async function routeElevate(argv: readonly string[]): Promise<{ exitCode: number; stdout: string }> {
  const rest = argv.slice(1);
  if (!isRoundElevate(rest)) return runQa(argv);
  if (roundWouldApply(rest) && !rest.includes("--yes")) {
    return { exitCode: 2, stdout: `${ELEVATE_NEEDS_YES}\n` };
  }
  const forwarded: string[] = [];
  for (const arg of rest) {
    if (arg !== "--yes") forwarded.push(arg);
  }
  return runElevateCommand(forwarded);
}

/** Bare `hh` is the `npx hitchhikers-guide` entry. It starts the companion app. */
export function cliEntryArgs(argv: readonly string[]): string[] {
  if (argv.length === 0) return ["app"];
  return [...argv];
}

export async function runCli(
  argv: readonly string[],
  runner?: CommandRunner,
): Promise<{ exitCode: number; stdout: string }> {
  const command = argv[0];
  if (command === "install") return runInstall(argv.slice(1));
  if (command === "app") return runApp(argv.slice(1));
  if (command === "assets") return runAssetsCommand(argv.slice(1));
  if (command === "tools") return runToolsCommand(argv.slice(1));
  if (command === "mostly-harmless") return runQa(argv);
  if (command === "elevate") return routeElevate(argv);
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
  // pnpm's bin shim executes the workspace symlink. argv keeps that link.
  // import.meta.url is the real file under packages/cli.
  return sameFile(entry, fileURLToPath(import.meta.url));
}

function sameFile(left: string, right: string): boolean {
  if (samePath(path.resolve(left), path.resolve(right))) return true;
  try {
    return samePath(realpathSync(left), realpathSync(right));
  } catch {
    return false;
  }
}

function samePath(left: string, right: string): boolean {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

if (isDirectRun()) {
  const argv = cliEntryArgs(process.argv.slice(2));
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
