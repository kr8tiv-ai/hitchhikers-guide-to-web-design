import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appendResults,
  assertResetAllowed,
  decide,
  hashFiles,
  isMainBranch,
  isUnsafeRepoPath,
  matchProtected,
  nextResultIndex,
  pathOutsideTargets,
  score,
  type EvalResult,
  type ImproveProgram,
  type ProtectedList,
  type ResultRow,
  type ResultStatus,
} from "@hitchhiker/engine";
import { runGit } from "./git.ts";
import { experimentPrompt, type SessionRequest, type SessionResult } from "./session.ts";

export const RESULTS_REL = "improve/results.tsv";
export const STOP_REL = "improve/STOP";

export interface LoopHooks {
  now: () => Date;
  runSession: (request: SessionRequest) => Promise<SessionResult>;
  evaluate: () => Promise<EvalResult>;
  readEvaluation: () => { path: string; body: string }[];
}

export interface LoopInput {
  cwd: string;
  branch: string;
  programPath: string;
  program: ImproveProgram;
  protectedList: ProtectedList;
  maxExperiments: number;
  minutes: number;
  turns: number;
  hooks: LoopHooks;
}

function gitOk(cwd: string, args: readonly string[]): string {
  const result = runGit(cwd, args);
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

function fullHead(cwd: string): string {
  return gitOk(cwd, ["rev-parse", "HEAD"]).trim().toLowerCase();
}

function shortHead(cwd: string): string {
  return gitOk(cwd, ["rev-parse", "--short=12", "HEAD"]).trim();
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
      if (line === RESULTS_REL || line === STOP_REL) continue;
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

function displayPath(cwd: string, file: string): string {
  const rel = path.relative(cwd, path.resolve(cwd, file));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return file;
  return rel.split(path.sep).join("/");
}

function isResetRefusal(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Refusing to reset");
}

function readOptional(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Put the runner's log and stop file back after a session or a reset. */
function restoreFile(file: string, body: string | null): void {
  if (body === null) return;
  if (readOptional(file) === body) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
}

/**
 * Baseline, then up to maxExperiments sessions.
 * A keep requires a strictly higher score. Anything else resets this branch only.
 */
export async function runExperimentLoop(input: LoopInput): Promise<{ exitCode: number; lines: string[] }> {
  const lines: string[] = [];
  const resultsPath = path.join(input.cwd, "improve", "results.tsv");
  const stopPath = path.join(input.cwd, "improve", "STOP");
  const existing = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8") : "";
  let n = nextResultIndex(existing);
  let stopCode: number | null = null;

  const record = (partial: Omit<ResultRow, "n">): void => {
    const row: ResultRow = { n, ...partial };
    n += 1;
    const priorText = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8") : "";
    mkdirSync(path.dirname(resultsPath), { recursive: true });
    writeFileSync(resultsPath, appendResults(priorText, row), "utf8");
    lines.push(`experiment ${row.n} ${row.status} score ${row.score} best ${row.best}`);
  };

  const baselineHash = hashFiles(input.hooks.readEvaluation());
  const sameHash = (): boolean => hashFiles(input.hooks.readEvaluation()) === baselineHash;

  const removeNew = (before: ReadonlySet<string>): void => {
    for (const rel of untracked(input.cwd)) {
      if (before.has(rel) || rel === RESULTS_REL || rel === STOP_REL) continue;
      if (isUnsafeRepoPath(rel)) continue;
      const abs = path.resolve(input.cwd, rel);
      const relative = path.relative(input.cwd, abs);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      rmSync(abs, { force: true });
    }
  };

  const resetTo = (
    commit: string,
    before: ReadonlySet<string>,
    saved: { results: string | null; stop: string | null },
  ): boolean => {
    try {
      const current = gitOk(input.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      assertResetAllowed({
        currentBranch: current,
        improveBranch: input.branch,
        targetCommit: commit,
      });
      gitOk(input.cwd, ["reset", "--hard", commit]);
      removeNew(before);
      restoreFile(resultsPath, saved.results);
      restoreFile(stopPath, saved.stop);
      return true;
    } catch (error: unknown) {
      if (isResetRefusal(error)) {
        lines.push(error.message);
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
      started: input.hooks.now().toISOString(),
      commit: shortHead(input.cwd),
      score: 0,
      best: 0,
      status: "crash",
      seconds: 0,
      note,
    });
    return { exitCode: 1, lines };
  }

  let best = score(baseline);
  record({
    started: input.hooks.now().toISOString(),
    commit: shortHead(input.cwd),
    score: best,
    best,
    status: "keep",
    seconds: 0,
    note: "baseline",
  });

  for (let made = 0; made < input.maxExperiments; made += 1) {
    if (stopCode !== null) return { exitCode: stopCode, lines };
    if (existsSync(stopPath)) {
      lines.push("Stopped: improve/STOP exists.");
      return { exitCode: 0, lines };
    }
    const prior = fullHead(input.cwd);
    const before = new Set(untracked(input.cwd));
    const saved = {
      results: readOptional(resultsPath),
      stop: readOptional(stopPath),
    };
    const startedAt = input.hooks.now();
    let session: SessionResult;
    try {
      session = await input.hooks.runSession({
        prompt: experimentPrompt({
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
      });
    } catch (error: unknown) {
      session = {
        timedOut: false,
        exitCode: 1,
        note: error instanceof Error ? error.message : "session failed",
      };
    }
    const seconds = Math.max(0, Math.round((input.hooks.now().getTime() - startedAt.getTime()) / 1000));
    const started = startedAt.toISOString();

    const write = (status: ResultStatus, value: number, note: string, reset: boolean): void => {
      if (reset) {
        if (!resetTo(prior, before, saved)) return;
      } else {
        restoreFile(resultsPath, saved.results);
        restoreFile(stopPath, saved.stop);
      }
      const shownBest = status === "keep" ? value : best;
      record({
        started,
        commit: shortHead(input.cwd),
        score: value,
        best: shownBest,
        status,
        seconds,
        note,
      });
      if (status === "keep") best = value;
    };

    try {
      const currentBranch = gitOk(input.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      if (currentBranch !== input.branch) {
        lines.push(
          isMainBranch(currentBranch)
            ? "Refusing to reset main."
            : "Refusing to reset a branch that is not the improve branch.",
        );
        return { exitCode: 2, lines };
      }
      const paths = changedPaths(input.cwd, prior);
      const blocked = violationReason(paths, input.program, input.protectedList);
      if (blocked !== null || !sameHash()) {
        write("violation", 0, blocked ?? "evaluation hash changed", true);
        continue;
      }
      if (session.timedOut || session.exitCode !== 0) {
        const note = session.timedOut
          ? "minute budget killed the grok process"
          : session.note || "grok exited non-zero";
        write("crash", 0, note, true);
        continue;
      }
      const head = fullHead(input.cwd);
      if (head === prior && paths.length === 0) {
        write("discard", best, "no changes", false);
        continue;
      }
      if (head === prior) {
        write("crash", 0, "no commit", true);
        continue;
      }
      let result: EvalResult;
      try {
        result = await input.hooks.evaluate();
      } catch (error: unknown) {
        const note = error instanceof Error ? error.message : "evaluation failed";
        write("crash", 0, note, true);
        continue;
      }
      if (!sameHash()) {
        write("violation", 0, "evaluation hash changed", true);
        continue;
      }
      const value = score(result);
      const subject = gitOk(input.cwd, ["log", "-1", "--format=%s"]).trim();
      const kept = decide(value, best) === "keep";
      const note = subject.length > 0 ? subject : kept ? "score improved" : "score did not improve";
      write(kept ? "keep" : "discard", value, note, !kept);
    } catch (error: unknown) {
      if (isResetRefusal(error)) {
        lines.push(error.message);
        return { exitCode: 2, lines };
      }
      const note = error instanceof Error ? error.message : "experiment failed";
      if (!resetTo(prior, before, saved)) return { exitCode: stopCode ?? 2, lines };
      record({
        started,
        commit: shortHead(input.cwd),
        score: 0,
        best,
        status: "crash",
        seconds,
        note,
      });
    }
  }

  return { exitCode: stopCode ?? 0, lines };
}
