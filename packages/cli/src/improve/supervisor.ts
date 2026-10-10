import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appendHookLog,
  appendSuperviseResults,
  assertSupervisorBranch,
  assertSupervisorReset,
  decide,
  dirtyPaths,
  formatSuperviseHeader,
  hashFiles,
  isSupervisorArtifact,
  isUnsafeRepoPath,
  logUsesNoVerify,
  matchProtected,
  nextResultIndex,
  parseAgentBriefs,
  parseProgram,
  parseProtected,
  pathOutsideTargets,
  resolveBudget,
  resolveConsecutiveFailures,
  resolveGrokCommand,
  resolveMaxExperiments,
  resolveWallMinutes,
  score,
  wallClockExceeded,
  MINUTE_CEILING,
  TURN_CEILING,
  type AgentBrief,
  type EvalResult,
  type HookLogRow,
  type ImproveProgram,
  type ProtectedList,
  type ResultStatus,
  type SuperviseResultRow,
  type YesNo,
} from "@hitchhiker/engine";
import { agentPrompt, ensureFindingsFile, runTestAgent, type AgentRunRequest, type AgentRunResult } from "./agents.ts";
import { runSupervisorEvaluation } from "./evaluate.ts";
import { readEvaluationFiles } from "./files.ts";
import { HOOK_LOG_REL, PUSH_FAILED_REL, agentCommandFailed, agentHookFailed, observeCommand, rowsFromAgentLog } from "./hooks.ts";
import { RESULTS_REL, STOP_REL } from "./loop.ts";
import { runSupervisorGit, verifyKeptCommit, type GitText, type PushCheck } from "./pushcheck.ts";

export interface SuperviseHooks {
  now: () => Date;
  runAgent: (request: AgentRunRequest) => Promise<AgentRunResult>;
  evaluate: () => Promise<EvalResult>;
  readEvaluation: () => { path: string; body: string }[];
  verifyPush: (commit: string) => PushCheck;
}

export interface SuperviseLoopInput {
  cwd: string;
  branch: string;
  programPath: string;
  program: ImproveProgram;
  briefs: readonly AgentBrief[];
  protectedList: ProtectedList;
  maxExperiments: number;
  maxFailures: number;
  wallMinutes: number;
  minutes: number;
  turns: number;
  hooks: SuperviseHooks;
}

interface SuperviseArgs {
  program: string;
  maxExperiments: number;
  dryRun: boolean;
  branch: string;
  minutes?: number;
  turns?: number;
  maxFailures: number;
  wallMinutes: number;
}

function calm(text: string): string {
  return text.replace(/!/g, ".").replace(/\u2014/g, "-");
}

function finish(exitCode: number, lines: readonly string[]): { exitCode: number; stdout: string } {
  const text = lines.map((line) => calm(line)).join("\n");
  return { exitCode, stdout: text.length === 0 ? "\n" : `${text}\n` };
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

/** Flags for `hh improve supervise`. Unknown flags throw. */
export function parseSuperviseArgs(argv: readonly string[]): SuperviseArgs {
  let program = path.join("improve", "program.md");
  let max: number | undefined;
  let branch = "main";
  let minutes: number | undefined;
  let turns: number | undefined;
  let failures: number | undefined;
  let wall: number | undefined;
  let dryRun = false;
  let sawApprove = false;
  let sawBranch = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      if (dryRun) throw new Error("Unexpected argument.");
      dryRun = true;
      continue;
    }
    if (arg === "--always-approve") {
      if (sawApprove) throw new Error("Unexpected argument.");
      sawApprove = true;
      continue;
    }
    if (arg === "--no-verify") throw new Error("Refusing --no-verify.");
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
    if (arg === "--max-failures") {
      if (failures !== undefined) throw new Error("Unexpected argument.");
      failures = wholeNumber(needValue(argv, index + 1, "--max-failures"), "--max-failures");
      index += 1;
      continue;
    }
    if (arg === "--wall-minutes") {
      if (wall !== undefined) throw new Error("Unexpected argument.");
      wall = wholeNumber(needValue(argv, index + 1, "--wall-minutes"), "--wall-minutes");
      index += 1;
      continue;
    }
    if (arg === "--branch") {
      if (sawBranch) throw new Error("Unexpected argument.");
      sawBranch = true;
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
  assertSupervisorBranch(branch);
  return {
    program,
    maxExperiments: resolveMaxExperiments(max),
    dryRun,
    branch,
    maxFailures: resolveConsecutiveFailures(failures),
    wallMinutes: resolveWallMinutes(wall),
    ...(minutes === undefined ? {} : { minutes }),
    ...(turns === undefined ? {} : { turns }),
  };
}

function gitText(cwd: string, args: readonly string[]): GitText {
  return runSupervisorGit(cwd, args);
}

function gitOk(cwd: string, args: readonly string[]): string {
  const result = gitText(cwd, args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/\\/g, "/");
    if (line.length > 0) lines.push(line);
  }
  return lines;
}

function inspectTree(cwd: string, branch: string): { ok: true } | { ok: false; error: string } {
  const current = gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current.status !== 0) return { ok: false, error: "not a git repository" };
  const name = current.stdout.trim();
  if (name === "HEAD") return { ok: false, error: "HEAD is detached" };
  const status = gitText(cwd, ["status", "--porcelain"]);
  if (status.status !== 0) return { ok: false, error: "not a git repository" };
  const dirty = dirtyPaths(status.stdout, []).filter((file) => !isSupervisorArtifact(file));
  if (dirty.length > 0) return { ok: false, error: "the work tree is dirty" };
  if (name !== branch) return { ok: false, error: `branch is ${name}` };
  return { ok: true };
}

function displayPath(cwd: string, file: string): string {
  const rel = path.relative(cwd, path.resolve(cwd, file));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return file;
  return rel.split(path.sep).join("/");
}

function readOptional(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function restoreFile(file: string, body: string | null, removeIfMissing: boolean): void {
  if (body === null) {
    if (removeIfMissing && existsSync(file)) rmSync(file, { force: true });
    return;
  }
  if (readOptional(file) === body) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
}

function snapshotFindings(cwd: string): Map<string, string> {
  const dir = path.join(cwd, "improve", "findings");
  const snap = new Map<string, string>();
  if (!existsSync(dir)) return snap;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (!statSync(abs).isFile()) continue;
    snap.set(name, readFileSync(abs, "utf8"));
  }
  return snap;
}

function restoreFindings(cwd: string, snap: ReadonlyMap<string, string>): void {
  const dir = path.join(cwd, "improve", "findings");
  if (!existsSync(dir) && snap.size === 0) return;
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (!snap.has(name)) rmSync(path.join(dir, name), { force: true });
  }
  for (const [name, body] of snap) writeFileSync(path.join(dir, name), body, "utf8");
}

function untracked(cwd: string): string[] {
  return splitLines(gitOk(cwd, ["ls-files", "--others", "--exclude-standard"]));
}

function changedPaths(cwd: string, fromCommit: string): string[] {
  const chunks = [
    gitOk(cwd, ["diff", "--name-only", fromCommit, "HEAD"]),
    gitOk(cwd, ["diff", "--name-only", "--cached"]),
    gitOk(cwd, ["diff", "--name-only"]),
    gitOk(cwd, ["ls-files", "--others", "--exclude-standard"]),
  ];
  const found = new Set<string>();
  for (const chunk of chunks) {
    for (const line of splitLines(chunk)) {
      if (isSupervisorArtifact(line)) continue;
      found.add(line);
    }
  }
  return [...found];
}

function violationReason(
  paths: readonly string[],
  program: ImproveProgram,
  list: ProtectedList,
): string | null {
  for (const file of paths) {
    if (isUnsafeRepoPath(file)) return `unsafe path ${file}`;
    if (matchProtected(file, list.paths)) return `protected path ${file}`;
  }
  for (const file of paths) {
    if (pathOutsideTargets(file, program.targets)) return `outside target ${file}`;
  }
  return null;
}

function logHeaderOk(file: string, header: string): boolean {
  if (!existsSync(file)) return true;
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (text.trim().length === 0) return true;
  return text.startsWith(`${header}\n`) || text.trim() === header;
}

/**
 * Baseline, then up to maxExperiments agents.
 * A keep requires a strictly higher score and a verified push to origin main.
 */
export async function runSuperviseLoop(
  input: SuperviseLoopInput,
): Promise<{ exitCode: number; lines: string[] }> {
  const lines: string[] = [];
  const resultsPath = path.join(input.cwd, "improve", "results.tsv");
  const stopPath = path.join(input.cwd, "improve", "STOP");
  const hookPath = path.join(input.cwd, "improve", "hook-log.tsv");
  const pushFailedPath = path.join(input.cwd, "improve", "PUSH-FAILED.txt");
  if (!logHeaderOk(resultsPath, formatSuperviseHeader())) {
    return { exitCode: 2, lines: ["Refusing to start: improve/results.tsv is not a supervisor log."] };
  }
  const existing = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8") : "";
  let n = nextResultIndex(existing);
  let stopCode: number | null = null;
  let streak = 0;
  const runStarted = input.hooks.now();

  const record = (partial: Omit<SuperviseResultRow, "n">): void => {
    const row: SuperviseResultRow = { n, ...partial };
    n += 1;
    const priorText = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8") : "";
    mkdirSync(path.dirname(resultsPath), { recursive: true });
    writeFileSync(resultsPath, appendSuperviseResults(priorText, row), "utf8");
    lines.push(
      `experiment ${row.n} ${row.status} score ${row.score} best ${row.best} pushed ${row.pushed}`,
    );
    if (row.status === "keep") streak = 0;
    else if (row.status !== "failed") streak += 1;
  };

  const flushHooks = (rows: readonly HookLogRow[]): void => {
    if (rows.length === 0) return;
    mkdirSync(path.dirname(hookPath), { recursive: true });
    let text = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : "";
    for (const row of rows) text = appendHookLog(text, row);
    writeFileSync(hookPath, text, "utf8");
  };

  const shortHead = (): string => gitOk(input.cwd, ["rev-parse", "--short=12", "HEAD"]).trim();
  const fullHead = (): string => gitOk(input.cwd, ["rev-parse", "HEAD"]).trim().toLowerCase();

  const baselineHash = hashFiles(input.hooks.readEvaluation());
  const sameHash = (): boolean => hashFiles(input.hooks.readEvaluation()) === baselineHash;

  const removeNew = (before: ReadonlySet<string>): void => {
    for (const rel of untracked(input.cwd)) {
      if (before.has(rel) || isSupervisorArtifact(rel)) continue;
      if (isUnsafeRepoPath(rel)) continue;
      const abs = path.resolve(input.cwd, rel);
      const relative = path.relative(input.cwd, abs);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      rmSync(abs, { force: true, recursive: true });
    }
  };

  const resetTo = (
    commit: string,
    before: ReadonlySet<string>,
    saved: { results: string | null; stop: string | null; hook: string | null },
    findings: ReadonlyMap<string, string>,
  ): boolean => {
    try {
      const current = gitOk(input.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      assertSupervisorReset({
        currentBranch: current,
        configuredBranch: input.branch,
        targetCommit: commit,
        experimentPrior: commit,
        startedClean: true,
      });
      gitOk(input.cwd, ["reset", "--hard", commit]);
      removeNew(before);
      restoreFile(resultsPath, saved.results, true);
      restoreFile(hookPath, saved.hook, true);
      restoreFile(stopPath, saved.stop, false);
      restoreFindings(input.cwd, findings);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "reset failed";
      if (message.startsWith("Refusing to reset")) {
        lines.push(message);
        stopCode = 2;
        return false;
      }
      throw error;
    }
  };

  let baseline: EvalResult;
  try {
    if (!sameHash()) throw new Error("evaluation hash changed before the baseline.");
    baseline = await input.hooks.evaluate();
    if (!sameHash()) throw new Error("evaluation hash changed before the baseline.");
  } catch (error: unknown) {
    const note = error instanceof Error ? error.message : "baseline evaluation failed";
    record({
      started: runStarted.toISOString(),
      commit: shortHead(),
      score: 0,
      best: 0,
      status: "crash",
      seconds: 0,
      note,
      pushed: "no",
      hooksOk: "yes",
    });
    return { exitCode: 1, lines };
  }

  let best = score(baseline);
  record({
    started: runStarted.toISOString(),
    commit: shortHead(),
    score: best,
    best,
    status: "keep",
    seconds: 0,
    note: "baseline",
    pushed: "no",
    hooksOk: "yes",
  });

  for (let made = 0; made < input.maxExperiments; made += 1) {
    if (stopCode !== null) return { exitCode: stopCode, lines };
    if (existsSync(stopPath)) {
      lines.push("Stopped: improve/STOP exists.");
      return { exitCode: 0, lines };
    }
    const at = input.hooks.now();
    if (wallClockExceeded(at.getTime() - runStarted.getTime(), input.wallMinutes)) {
      lines.push("FAILED: wall-clock cap reached.");
      return { exitCode: 2, lines };
    }
    if (streak >= input.maxFailures) {
      lines.push("FAILED: consecutive failure cap reached.");
      return { exitCode: 2, lines };
    }

    const prior = fullHead();
    const before = new Set(untracked(input.cwd));
    const findings = snapshotFindings(input.cwd);
    const saved = {
      results: readOptional(resultsPath),
      stop: readOptional(stopPath),
      hook: readOptional(hookPath),
    };
    const brief = input.briefs[made % input.briefs.length];
    if (brief === undefined) {
      lines.push("FAILED: program.md needs two test agents.");
      return { exitCode: 2, lines };
    }
    ensureFindingsFile(input.cwd, brief.findings);
    const startedAt = input.hooks.now();
    let session: AgentRunResult;
    try {
      session = await input.hooks.runAgent({
        briefId: brief.id,
        prompt: agentPrompt({
          brief,
          programPath: displayPath(input.cwd, input.programPath),
          targets: input.program.targets,
          branch: input.branch,
          experiment: n,
          minutes: input.minutes,
          turns: input.turns,
        }),
        model: input.program.model,
        effort: input.program.effort,
        turns: input.turns,
        minutes: input.minutes,
        cwd: input.cwd,
        branch: input.branch,
        findingsPath: brief.findings,
        home: brief.home,
      });
    } catch (error: unknown) {
      session = {
        timedOut: false,
        exitCode: 1,
        note: error instanceof Error ? error.message : "agent failed",
        log: "",
      };
    }
    const seconds = Math.max(0, Math.round((input.hooks.now().getTime() - startedAt.getTime()) / 1000));
    const started = startedAt.toISOString();
    const agentRows = rowsFromAgentLog(n, session.log);

    const settle = (reset: boolean): boolean => {
      if (!reset) {
        restoreFile(resultsPath, saved.results, true);
        restoreFile(hookPath, saved.hook, true);
        restoreFile(stopPath, saved.stop, false);
        return true;
      }
      return resetTo(prior, before, saved, findings);
    };

    const write = (
      status: ResultStatus,
      value: number,
      note: string,
      reset: boolean,
      pushed: YesNo,
      extraRows: readonly HookLogRow[],
    ): boolean => {
      if (!settle(reset)) return false;
      const rows = [...agentRows, ...extraRows];
      flushHooks(rows);
      const shownBest = status === "keep" ? value : best;
      record({
        started,
        commit: shortHead(),
        score: value,
        best: shownBest,
        status,
        seconds,
        note,
        pushed,
        hooksOk: agentHookFailed(rows) ? "no" : "yes",
      });
      if (status === "keep") best = value;
      return true;
    };

    try {
      const currentBranch = gitOk(input.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      if (currentBranch !== input.branch) {
        lines.push("Refusing to reset a branch that is not the supervisor branch.");
        return { exitCode: 2, lines };
      }
      const paths = changedPaths(input.cwd, prior);
      const blocked = violationReason(paths, input.program, input.protectedList);
      const noVerify = logUsesNoVerify(session.log);
      if (blocked !== null || !sameHash() || noVerify) {
        const note = blocked ?? (noVerify ? "refused --no-verify" : "evaluation hash changed");
        if (!write("violation", 0, note, true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      if (agentHookFailed(agentRows) || agentCommandFailed(agentRows)) {
        const failedHook = agentRows.find((row) => row.exit !== 0 && row.hook.length > 0);
        const note = failedHook !== undefined ? `hook failed: ${failedHook.hook}` : "command failed";
        if (!write("discard", 0, note, true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      if (session.timedOut || session.exitCode !== 0) {
        const note = session.timedOut ? "minute budget killed the grok process" : session.note || "agent exited non-zero";
        if (!write("crash", 0, note, true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      const head = fullHead();
      if (head === prior && paths.length === 0) {
        if (!write("discard", best, "no changes", false, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      if (head === prior) {
        if (!write("crash", 0, "no commit", true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      let result: EvalResult;
      try {
        result = await input.hooks.evaluate();
      } catch (error: unknown) {
        const note = error instanceof Error ? error.message : "evaluation failed";
        if (!write("crash", 0, note, true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      if (!sameHash()) {
        if (!write("violation", 0, "evaluation hash changed", true, "no", [])) {
          return { exitCode: stopCode ?? 2, lines };
        }
        continue;
      }
      const value = score(result);
      const subject = gitOk(input.cwd, ["log", "-1", "--format=%s"]).trim();
      const kept = decide(value, best) === "keep";
      if (!kept) {
        const note = subject.length > 0 ? subject : "score did not improve";
        if (!write("discard", value, note, true, "no", [])) return { exitCode: stopCode ?? 2, lines };
        continue;
      }
      const check = input.hooks.verifyPush(fullHead());
      const pushRows: HookLogRow[] = [];
      const observed = observeCommand(n, "git push origin main", {
        status: check.exit,
        stdout: check.output,
        stderr: check.hook,
      });
      if (observed !== null) pushRows.push(observed);
      if (!check.ok) {
        mkdirSync(path.dirname(pushFailedPath), { recursive: true });
        writeFileSync(pushFailedPath, `FAILED\n${check.reason}\n${check.output}\n`, "utf8");
        const note = `FAILED ${check.reason}`;
        if (!write("failed", value, note, false, "no", pushRows)) return { exitCode: stopCode ?? 2, lines };
        lines.push(`FAILED: ${check.reason}.`);
        return { exitCode: 1, lines };
      }
      const note = subject.length > 0 ? subject : "score improved";
      if (!write("keep", value, note, false, "yes", pushRows)) return { exitCode: stopCode ?? 2, lines };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "experiment failed";
      if (message.startsWith("Refusing to reset")) {
        lines.push(message);
        return { exitCode: 2, lines };
      }
      if (!resetTo(prior, before, saved, findings)) return { exitCode: stopCode ?? 2, lines };
      flushHooks(agentRows);
      record({
        started,
        commit: shortHead(),
        score: 0,
        best,
        status: "crash",
        seconds,
        note: message,
        pushed: "no",
        hooksOk: "yes",
      });
    }
  }

  return { exitCode: stopCode ?? 0, lines };
}

export interface SuperviseOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  runAgent?: (request: AgentRunRequest) => Promise<AgentRunResult>;
  evaluate?: () => Promise<EvalResult>;
  verifyPush?: (commit: string) => PushCheck;
}

/**
 * `hh improve supervise`. Always-approve is on for the agent.
 * A live run refuses a dirty tree, a detached HEAD, and the wrong branch.
 * `--dry-run` prints the plan and does not spawn or push.
 */
export async function runSupervise(
  argv: readonly string[],
  options: SuperviseOptions = {},
): Promise<{ exitCode: number; stdout: string }> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  let args: SuperviseArgs;
  try {
    args = parseSuperviseArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected argument.";
    return finish(2, [message]);
  }

  const programPath = path.resolve(cwd, args.program);
  if (!existsSync(programPath)) {
    return finish(2, [`Refusing to start: missing program.md at ${args.program}.`]);
  }
  const protectedPath = path.resolve(cwd, "improve", "protected.json");
  if (!existsSync(protectedPath)) {
    return finish(2, ["Refusing to start: missing improve/protected.json."]);
  }

  let program: ImproveProgram;
  let protectedList: ProtectedList;
  let briefs: AgentBrief[];
  let minutes: number;
  let turns: number;
  try {
    const markdown = readFileSync(programPath, "utf8");
    program = parseProgram(markdown);
    briefs = parseAgentBriefs(markdown);
    protectedList = parseProtected(readFileSync(protectedPath, "utf8"));
    minutes = resolveBudget(program.minutes, args.minutes, MINUTE_CEILING, "--minutes");
    turns = resolveBudget(program.turns, args.turns, TURN_CEILING, "--turns");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "program.md could not be read.";
    return finish(2, [message]);
  }

  let git: { ok: true } | { ok: false; error: string };
  try {
    git = inspectTree(cwd, args.branch);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "not a git repository";
    git = { ok: false, error: message };
  }
  const stop = existsSync(path.join(cwd, "improve", "STOP"));
  if (args.dryRun) {
    const live = briefs.length < 2
      ? "live: refused, program.md needs two test agents"
      : git.ok === false
        ? `live: refused, ${git.error}`
        : stop
          ? "live: stopped, improve/STOP exists"
          : "live: ready";
    const lines = [
      "hh improve supervise dry-run",
      `program: ${args.program}`,
      `branch: ${args.branch}`,
      `max-experiments: ${args.maxExperiments}`,
      `max-failures: ${args.maxFailures}`,
      `wall-minutes: ${args.wallMinutes}`,
      `minutes: ${minutes}`,
      `turns: ${turns}`,
      `model: ${program.model}`,
      `effort: ${program.effort}`,
      "always-approve: on",
      "push: git push origin main",
      "agents:",
      ...(briefs.length === 0 ? ["  none"] : briefs.map((brief) => `  ${brief.id}`)),
      "targets:",
      ...program.targets.map((target) => `  ${target}`),
      `protected: ${protectedList.paths.length}`,
      live,
    ];
    return finish(0, lines);
  }

  if (briefs.length < 2) return finish(2, ["Refusing to start: program.md needs two test agents."]);
  if (git.ok === false) return finish(2, [`Refusing to start: ${git.error}.`]);
  if (stop) return finish(0, ["Stopped: improve/STOP exists."]);
  if (options.runAgent === undefined) {
    try {
      resolveGrokCommand(env);
    } catch {
      return finish(1, ["Refusing to start: grok is not on PATH."]);
    }
  }

  const outcome = await runSuperviseLoop({
    cwd,
    branch: args.branch,
    programPath,
    program,
    briefs,
    protectedList,
    maxExperiments: args.maxExperiments,
    maxFailures: args.maxFailures,
    wallMinutes: args.wallMinutes,
    minutes,
    turns,
    hooks: {
      now,
      runAgent: options.runAgent ?? ((request: AgentRunRequest) => runTestAgent(resolveGrokCommand(env), request)),
      evaluate: options.evaluate ?? (() => runSupervisorEvaluation(cwd, program.targets)),
      readEvaluation: () => readEvaluationFiles(cwd, protectedList.evaluation),
      verifyPush: options.verifyPush ?? ((commit: string) => verifyKeptCommit(cwd, commit)),
    },
  });
  return finish(outcome.exitCode, outcome.lines);
}
