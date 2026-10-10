import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hiddenChildOptions, isUnsafeRepoPath } from "@hitchhiker/engine";
import type { AgentBrief } from "@hitchhiker/engine";
import { budgetMs, buildImproveArgv, killProcessTree } from "./session.ts";

/**
 * Extra deny rules for a test agent. The improve loop's deny list still applies.
 * `--deny` is grok configuration. The supervisor enforces the same limits in code
 * after the session returns.
 */
export const SUPERVISOR_DENY_RULES = [
  "Bash(*git reset --hard*)",
  "Bash(*git checkout *)",
  "Bash(*--no-verify*)",
  "Bash(*git push -f*)",
  "Bash(*git push --force-with-lease*)",
] as const;

export const FINDINGS_HEADER = "id\tstatus\tarea\tsummary";

export interface AgentRunRequest {
  briefId: string;
  prompt: string;
  model: string;
  effort: string;
  turns: number;
  minutes: number;
  cwd: string;
  branch: string;
  findingsPath: string;
  home: "repo" | "temporary";
}

export interface AgentRunResult {
  timedOut: boolean;
  exitCode: number | null;
  note: string;
  log: string;
}

export interface BoundedProcess {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}

export function agentEnv(
  home: "repo" | "temporary",
  base: NodeJS.ProcessEnv,
  temporaryHome: string,
): NodeJS.ProcessEnv {
  const env = { ...base };
  if (home === "temporary") {
    env.HOME = temporaryHome;
    env.USERPROFILE = temporaryHome;
  }
  return env;
}

/** Argv for one fresh grok test agent. Budgets match the program. */
export function buildAgentArgv(input: {
  prompt: string;
  model: string;
  effort: string;
  turns: number;
  cwd: string;
}): string[] {
  const args = buildImproveArgv(input);
  for (const rule of SUPERVISOR_DENY_RULES) args.push("--deny", rule);
  return args;
}

export function agentPrompt(input: {
  brief: AgentBrief;
  programPath: string;
  targets: readonly string[];
  branch: string;
  experiment: number;
  minutes: number;
  turns: number;
}): string {
  const targets = input.targets.map((target) => `- ${target}`).join("\n");
  return [
    `You are test agent ${input.brief.id} for experiment ${input.experiment} on branch ${input.branch}.`,
    `Read ${input.programPath} and docs/improve-runbook.md.`,
    input.brief.instructions,
    "Write findings to this file, one row per bug. Keep the header:",
    input.brief.findings,
    FINDINGS_HEADER,
    "status is open or fixed.",
    "When asked to fix, change only the target area:",
    targets,
    "One hypothesis. Commit on this branch with a one-line message, then stop.",
    "Do not edit protected paths. Do not push, force-push, deploy, publish, or install packages.",
    "Do not read or print secrets. Do not skip git hooks.",
    `Minute budget: ${input.minutes}. Turn budget: ${input.turns}.`,
    "",
  ].join("\n");
}

/** Create the findings file when it is missing. The path must stay inside the repo. */
export function ensureFindingsFile(cwd: string, relative: string): void {
  if (isUnsafeRepoPath(relative)) throw new Error("Findings path is not safe.");
  const abs = path.resolve(cwd, relative);
  const rel = path.relative(cwd, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Findings path escapes the repo.");
  mkdirSync(path.dirname(abs), { recursive: true });
  if (!existsSync(abs)) writeFileSync(abs, `${FINDINGS_HEADER}\n`, "utf8");
}

function cap(text: string, chunk: string): string {
  if (text.length >= 32_000) return text;
  return `${text}${chunk}`.slice(0, 32_000);
}

/**
 * Run a process and kill the tree when the timeout fires.
 * Tests pass a short timeout. Agents pass the minute budget.
 */
export async function runBoundedProcess(input: BoundedProcess): Promise<{
  timedOut: boolean;
  exitCode: number | null;
  log: string;
}> {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs < 1) {
    throw new Error("timeout must be a positive number.");
  }
  const child: ChildProcess = spawn(input.command, [...input.args], hiddenChildOptions({
    cwd: input.cwd,
    env: input.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  let timedOut = false;
  let log = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    log = cap(log, chunk);
  });
  child.stderr?.on("data", (chunk: string) => {
    log = cap(log, chunk);
  });
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid !== undefined) killProcessTree(child.pid);
  }, input.timeoutMs);
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code));
  });
  clearTimeout(timer);
  return { timedOut, exitCode, log };
}

/** Spawn one grok agent and kill it when the minute budget ends. */
export async function runTestAgent(command: string, request: AgentRunRequest): Promise<AgentRunResult> {
  const args = buildAgentArgv({
    prompt: request.prompt,
    model: request.model,
    effort: request.effort,
    turns: request.turns,
    cwd: request.cwd,
  });
  const temporary = request.home === "temporary"
    ? mkdtempSync(path.join(os.tmpdir(), "hh-agent-home-"))
    : "";
  try {
    const result = await runBoundedProcess({
      command,
      args,
      cwd: request.cwd,
      timeoutMs: budgetMs(request.minutes),
      env: agentEnv(request.home, process.env, temporary.length > 0 ? temporary : os.tmpdir()),
    });
    if (result.timedOut) {
      return { timedOut: true, exitCode: result.exitCode, note: "minute budget killed the grok process", log: result.log };
    }
    if (result.exitCode === null) {
      return { timedOut: false, exitCode: null, note: "grok did not start", log: result.log };
    }
    if (result.exitCode !== 0) {
      return { timedOut: false, exitCode: result.exitCode, note: "grok exited non-zero", log: result.log };
    }
    return { timedOut: false, exitCode: result.exitCode, note: "", log: result.log };
  } finally {
    if (temporary.length > 0) rmSync(temporary, { recursive: true, force: true });
  }
}
