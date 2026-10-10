import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assertImproveBranch,
  dirtyPaths,
  improveBranchName,
  isMainBranch,
  parseProgram,
  parseProtected,
  resolveBudget,
  resolveGrokCommand,
  MINUTE_CEILING,
  TURN_CEILING,
  type EvalResult,
  type ImproveProgram,
  type ProtectedList,
} from "@hitchhiker/engine";
import { parseImproveArgs } from "./args.ts";
import { runEvaluation } from "./evaluate.ts";
import { readEvaluationFiles } from "./files.ts";
import { runGit } from "./git.ts";
import { runExperimentLoop } from "./loop.ts";
import { STOP_REL } from "./loop.ts";
import { runGrokSession, type SessionRequest, type SessionResult } from "./session.ts";

export interface ImproveRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  runSession?: (request: SessionRequest) => Promise<SessionResult>;
  evaluate?: () => Promise<EvalResult>;
}

const PROTECTED_REL = path.join("improve", "protected.json");

function calm(text: string): string {
  return text.replace(/!/g, ".").replace(/\u2014/g, "-");
}

function localDate(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function finish(exitCode: number, lines: readonly string[]): { exitCode: number; stdout: string } {
  const text = lines.map((line) => calm(line)).join("\n");
  return { exitCode, stdout: text.length === 0 ? "\n" : `${text}\n` };
}

function inspectGit(cwd: string): { branch: string } | { error: string } {
  const branch = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.status !== 0) return { error: "not a git repository" };
  const name = branch.stdout.trim();
  if (name === "HEAD") return { error: "HEAD is detached" };
  if (isMainBranch(name)) return { error: `branch is ${name}` };
  const status = runGit(cwd, ["status", "--porcelain"]);
  if (status.status !== 0) return { error: "not a git repository" };
  const dirty = dirtyPaths(status.stdout, ["improve/results.tsv", STOP_REL]);
  if (dirty.length > 0) return { error: "the work tree is dirty" };
  return { branch: name };
}

function ensureBranch(cwd: string, name: string): void {
  assertImproveBranch(name);
  const current = runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current.status !== 0) throw new Error(current.stderr.trim() || "git rev-parse failed");
  if (current.stdout.trim() === name) return;
  const listed = runGit(cwd, ["branch", "--list", name]);
  if (listed.status !== 0) throw new Error(listed.stderr.trim() || "git branch failed");
  const exists = listed.stdout.trim().length > 0;
  const checked = runGit(cwd, exists ? ["checkout", name] : ["checkout", "-b", name]);
  if (checked.status !== 0) throw new Error(checked.stderr.trim() || "git checkout failed");
}

function branchName(now: Date, program: ImproveProgram, requested: string | undefined): string {
  const name = requested ?? improveBranchName(localDate(now), program.tag);
  assertImproveBranch(name);
  return name;
}

/**
 * `hh improve`. A live run refuses main and a dirty tree.
 * `--dry-run` prints the plan and does not spawn grok or move HEAD.
 */
export async function runImprove(
  argv: readonly string[],
  options: ImproveRunOptions = {},
): Promise<{ exitCode: number; stdout: string }> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  let args;
  try {
    args = parseImproveArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected argument.";
    return finish(2, [message]);
  }

  const programPath = path.resolve(cwd, args.program);
  if (!existsSync(programPath)) {
    return finish(2, [`Refusing to start: missing program.md at ${args.program}.`]);
  }
  const protectedPath = path.resolve(cwd, PROTECTED_REL);
  if (!existsSync(protectedPath)) {
    return finish(2, ["Refusing to start: missing improve/protected.json."]);
  }

  let program: ImproveProgram;
  let protectedList: ProtectedList;
  let minutes: number;
  let turns: number;
  let branch: string;
  try {
    program = parseProgram(readFileSync(programPath, "utf8"));
    protectedList = parseProtected(readFileSync(protectedPath, "utf8"));
    minutes = resolveBudget(program.minutes, args.minutes, MINUTE_CEILING, "--minutes");
    turns = resolveBudget(program.turns, args.turns, TURN_CEILING, "--turns");
    branch = branchName(now(), program, args.branch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "program.md could not be read.";
    return finish(2, [message]);
  }

  const git = inspectGit(cwd);
  const stop = existsSync(path.join(cwd, "improve", "STOP"));
  if (args.dryRun) {
    const live = "error" in git
      ? `live: refused, ${git.error}`
      : stop
        ? "live: stopped, improve/STOP exists"
        : "live: ready";
    const lines = [
      "hh improve dry-run",
      `program: ${args.program}`,
      `branch: ${branch}`,
      `max-experiments: ${args.maxExperiments}`,
      `minutes: ${minutes}`,
      `turns: ${turns}`,
      `model: ${program.model}`,
      `effort: ${program.effort}`,
      "targets:",
      ...program.targets.map((target) => `  ${target}`),
      `protected: ${protectedList.paths.length}`,
      live,
    ];
    return finish(0, lines);
  }

  if ("error" in git) return finish(2, [`Refusing to start: ${git.error}.`]);
  if (stop) return finish(0, ["Stopped: improve/STOP exists."]);
  if (options.runSession === undefined) {
    try {
      resolveGrokCommand(env);
    } catch {
      return finish(1, ["Refusing to start: grok is not on PATH."]);
    }
  }

  try {
    ensureBranch(cwd, branch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The improve branch was not created.";
    return finish(1, [message]);
  }

  const outcome = await runExperimentLoop({
    cwd,
    branch,
    programPath,
    program,
    protectedList,
    maxExperiments: args.maxExperiments,
    minutes,
    turns,
    hooks: {
      now,
      runSession: options.runSession ?? ((request: SessionRequest) => runGrokSession(resolveGrokCommand(env), request)),
      evaluate: options.evaluate ?? (() => runEvaluation(cwd, program.targets)),
      readEvaluation: () => readEvaluationFiles(cwd, protectedList.evaluation),
    },
  });
  return finish(outcome.exitCode, outcome.lines);
}
