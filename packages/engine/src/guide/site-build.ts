/**
 * Site build runner. Approve writes the prompt files and this module
 * consumes the queue one prompt at a time. Tests inject a spawn function.
 * The live spawn is installed only when a desk or CLI command asks for it.
 */
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GrokMissingError, resolveGrokCommand } from "../ai/grok-cli.ts";
import {
  BILLING_TOP_UP,
  classifyGrokFailure,
  isRawJsonLine,
  sanitizeFailureReason,
} from "../ai/grok-failure.ts";
import { buildContextPacket, renderContextPacket } from "../context/packet.ts";
import { hiddenChildOptions } from "../hidden-child.ts";
import { LockHeld } from "../lock.ts";
import { loadQueue, saveQueue, type QueueFile, type QueueStatus } from "../queue-file.ts";
import { generateBriefPlan } from "../spec/brief-plan.ts";
import { PlanCoverageError, checkPlanCoverage } from "../spec/plan-coverage.ts";
import { SITE_RULES, type SitePromptSkeleton } from "../spec/site-prompts.ts";

export const BUILD_MODEL = "grok-4.7-build-fast";
export const BUILD_EFFORT = "xhigh";
/** How often a live build looks for a running row whose process is gone. */
export const BUILD_WATCHDOG_INTERVAL_MS = 30_000;
/** A live child with no stream output for this long is settled. */
export const BUILD_IDLE_MS = 30 * 60 * 1000;
/** After a stream `end` event, wait this long for the child to exit. */
export const BUILD_EXIT_GRACE_MS = 5_000;

const TURN_LIMIT_REASON =
  "The build stopped because it hit a turn limit. Press Retry to run this prompt again.";

const GUIDE_ENTRY_ID = "guide-entry";
const PROMPT_ID = /^\d{3}$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".hitchhiker"]);
const LINE_CAP = 6;
const LINE_CHARS = 180;
const FILE_CAP = 40;

export interface BuildSpawnRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  promptId: string;
  model: string;
  effort: string;
  onOutput?: (chunk: string) => void;
}

export interface BuildSpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  errorCode: string | null;
}

export interface BuildSpawnHandle {
  pid: number;
  /** Resolves on stdio `close` or spawn error. May never resolve if the pipes stay open. */
  done: Promise<BuildSpawnResult>;
  /**
   * Resolves on child `exit`, which can arrive before `close`.
   * When omitted, `done` is the only exit signal.
   */
  exited?: Promise<number | null>;
  /** Stop a child that is still alive after the stream has ended. */
  stop?: () => void;
}

export type BuildSpawn = (request: BuildSpawnRequest) => BuildSpawnHandle;

export interface SiteBuildGateInfo {
  projectDir: string;
  promptId: string;
  files: readonly string[];
}

/** Runs after a clean exit, before the row is marked passed. Throw to fail the row. */
export type SiteBuildGate = (info: SiteBuildGateInfo) => Promise<void> | void;

export interface SiteBuildWatch {
  intervalMs: number;
  idleMs: number;
  exitGraceMs: number;
}

export interface BuildRunView {
  promptId: string;
  status: "queued" | "running" | "passed" | "failed" | "interrupted";
  model: string;
  effort: string;
  startedAt: string;
  elapsedMs: number;
  lastLines: string[];
  filesWritten: string[];
  reason: string;
  pid: number | null;
  /** What restart recovery did. Empty when this run was not recovered. */
  recovery: string;
  /** True after a billing failure. The queue does not start the next prompt. */
  paused?: boolean;
  /** Plain escalation for the drive. Empty when there is none. */
  escalation?: string;
}

export interface BuildRecoveryInput {
  promptId: string;
  cleanEnd: boolean;
  outputsExist: boolean;
  rerunAlready: boolean;
}

export type BuildRecoveryDecision =
  | { action: "verify" }
  | { action: "rerun"; reason: string }
  | { action: "interrupt"; reason: string };

export type BuildContinueOutcome = "started" | "live" | "idle" | "rejected";

interface RunFile {
  promptId: string;
  status: BuildRunView["status"];
  model: string;
  effort: string;
  startedAt: string;
  elapsedMs: number;
  lastLines: string[];
  filesWritten: string[];
  reason: string;
  pid: number | null;
  recovery: string;
  /** True after an automatic restart rerun has been issued for this prompt. */
  recoveryRerun: boolean;
  paused?: boolean;
  escalation?: string;
}

let runner: BuildSpawn | null = null;
const projectRunners = new Map<string, BuildSpawn | null>();
const jobs = new Map<string, Promise<void>>();
const watchOverrides = new Map<string, SiteBuildWatch>();
const buildGates = new Map<string, SiteBuildGate>();

interface LiveBuild {
  projectDir: string;
  promptId: string;
  pid: number | null;
  intervalMs: number;
  idleMs: number;
  lastActivity: number;
  lastScan: number;
  force: (result: BuildSpawnResult) => void;
}

const liveBuilds = new Map<string, LiveBuild>();
let watchTimer: ReturnType<typeof setInterval> | null = null;
/** Serializes adopt and resume so two clicks share one spawn. */
const controlChains = new Map<string, Promise<unknown>>();
const continueJobs = new Map<string, Promise<BuildContinueOutcome>>();
const recoveries = new Map<string, Promise<void>>();

const DEFAULT_WATCH: SiteBuildWatch = {
  intervalMs: BUILD_WATCHDOG_INTERVAL_MS,
  idleMs: BUILD_IDLE_MS,
  exitGraceMs: BUILD_EXIT_GRACE_MS,
};

export function setBuildRunner(next: BuildSpawn | null): void {
  runner = next;
}

export function getBuildRunner(): BuildSpawn | null {
  return runner;
}

/** Per-project override so two desks in one process do not share a spawn. */
export function setProjectBuildRunner(projectDir: string, next: BuildSpawn | null): void {
  projectRunners.set(path.resolve(projectDir), next);
}

export function clearProjectBuildRunner(projectDir: string): void {
  projectRunners.delete(path.resolve(projectDir));
}

export function hasProjectBuildRunner(projectDir: string): boolean {
  return projectRunners.has(path.resolve(projectDir));
}

export function siteBuildWatchConfig(projectDir?: string): SiteBuildWatch {
  if (projectDir === undefined) return { ...DEFAULT_WATCH };
  return { ...(watchOverrides.get(path.resolve(projectDir)) ?? DEFAULT_WATCH) };
}

export function configureSiteBuildWatch(projectDir: string, options: Partial<SiteBuildWatch>): void {
  const key = path.resolve(projectDir);
  const prev = watchOverrides.get(key) ?? DEFAULT_WATCH;
  watchOverrides.set(key, {
    intervalMs: finiteMs(options.intervalMs, prev.intervalMs),
    idleMs: finiteMs(options.idleMs, prev.idleMs),
    exitGraceMs: finiteMs(options.exitGraceMs, prev.exitGraceMs),
  });
  rearmWatch();
}

export function setSiteBuildGate(projectDir: string, gate: SiteBuildGate | null): void {
  const key = path.resolve(projectDir);
  if (gate === null) buildGates.delete(key);
  else buildGates.set(key, gate);
}

export function resetSiteBuildWatch(projectDir: string): void {
  const key = path.resolve(projectDir);
  watchOverrides.delete(key);
  buildGates.delete(key);
  liveBuilds.delete(key);
  rearmWatch();
}

/**
 * Settle a running row whose child is gone or whose stream has gone quiet.
 * Pass a project directory to scan that build immediately. The interval
 * uses each build's own period so a short test interval cannot fail another build.
 */
export function runBuildWatchdog(projectDir?: string): void {
  const now = Date.now();
  const only = projectDir === undefined ? null : path.resolve(projectDir);
  for (const job of liveBuilds.values()) {
    if (only !== null && job.projectDir !== only) continue;
    if (only === null && now - job.lastScan < job.intervalMs) continue;
    job.lastScan = now;
    const dead = !pidAlive(job.pid);
    const idle = now - job.lastActivity >= job.idleMs;
    if (!dead && !idle) continue;
    job.force(watchResult());
  }
  if (projectDir !== undefined) void recoverSiteBuild(projectDir);
}

/**
 * Clean `end` with `stopReason: end_turn` in a run log.
 * Split chunks are fine. Any other stop reason is not a clean end.
 */
export function logHasCleanEnd(log: string): boolean {
  return readEndReason(log) === "end_turn";
}

/** Pure recovery choice. Gates and the queue stay with the caller. */
export function decideBuildRecovery(input: BuildRecoveryInput): BuildRecoveryDecision {
  if (input.cleanEnd && input.outputsExist) return { action: "verify" };
  const reason = rerunReason(input.promptId);
  if (input.rerunAlready) return { action: "interrupt", reason };
  return { action: "rerun", reason };
}

/**
 * Desk start and the watchdog. A running row whose child is gone is
 * verified from its log or rerun once. A live in-process job is left alone.
 */
export function recoverSiteBuild(projectDir: string): Promise<void> {
  const key = path.resolve(projectDir);
  const existing = recoveries.get(key);
  if (existing) return existing;
  const job = recoverBody(projectDir);
  recoveries.set(key, job);
  void job.finally(() => {
    if (recoveries.get(key) === job) recoveries.delete(key);
  });
  return job;
}

/**
 * Continue from the first prompt that has not passed.
 * Two callers share one run. A live child makes this a no-op success.
 */
export function continueSiteBuild(projectDir: string, promptId?: string): Promise<BuildContinueOutcome> {
  const key = path.resolve(projectDir);
  if (jobs.has(key)) return Promise.resolve("live");
  const existing = continueJobs.get(key);
  if (existing) return existing;
  const job = continueBody(projectDir, promptId);
  continueJobs.set(key, job);
  void job.finally(() => {
    if (continueJobs.get(key) === job) continueJobs.delete(key);
  });
  return job;
}

/**
 * grok --help lists --max-turns with no default, so omitting it leaves the
 * run uncapped. A site build stops on a real blocker, not a turn count.
 */
export function buildSpawnArgs(cwd: string, promptPath: string): string[] {
  return [
    "--no-auto-update",
    "--no-alt-screen",
    "--prompt-file",
    promptPath,
    "-m",
    BUILD_MODEL,
    "--cwd",
    cwd,
    "--output-format",
    "streaming-json",
    "--effort",
    BUILD_EFFORT,
  ];
}

export function installLiveBuildRunner(env: NodeJS.ProcessEnv = process.env): void {
  setBuildRunner((request) => {
    let command = request.command;
    try {
      command = resolveGrokCommand(env);
    } catch (error: unknown) {
      const message = error instanceof GrokMissingError ? error.message : "grok is not on PATH. Run hh doctor.";
      return {
        pid: 0,
        done: Promise.resolve({ code: 127, stdout: "", stderr: message, errorCode: "ENOENT" }),
      };
    }
    return spawnLive(command, request, env);
  });
}

function spawnLive(command: string, request: BuildSpawnRequest, env: NodeJS.ProcessEnv): BuildSpawnHandle {
  const child = spawn(
    command,
    [...request.args],
    hiddenChildOptions({
      cwd: request.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    }),
  );
  let stdout = "";
  let stderr = "";
  const take = (chunk: string, which: "out" | "err"): void => {
    const text = String(chunk);
    if (which === "out") stdout = tailText(stdout, text);
    else stderr = tailText(stderr, text);
    request.onOutput?.(text);
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => take(chunk, "out"));
  child.stderr?.on("data", (chunk: string) => take(chunk, "err"));
  child.stdout?.on("error", () => undefined);
  child.stderr?.on("error", () => undefined);
  let settled = false;
  let resolveExit: (code: number | null) => void = () => undefined;
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });
  let exitNotified = false;
  const notifyExit = (code: number | null): void => {
    if (exitNotified) return;
    exitNotified = true;
    resolveExit(code);
  };
  const done = new Promise<BuildSpawnResult>((resolve) => {
    const finish = (result: BuildSpawnResult): void => {
      if (settled) return;
      settled = true;
      notifyExit(result.code);
      resolve(result);
    };
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        code: 127,
        stdout,
        stderr: tailText(stderr, error.message),
        errorCode: error.code ?? "SPAWN",
      });
    });
    // `exit` fires when the process is gone. `close` waits for stdio, which can
    // hang after grok has already ended the turn and left the queue running.
    child.on("exit", (code) => {
      notifyExit(code ?? null);
      finish({ code: code ?? null, stdout, stderr, errorCode: null });
      child.stdout?.destroy();
      child.stderr?.destroy();
    });
    child.on("close", (code) => {
      finish({ code: code ?? null, stdout, stderr, errorCode: null });
    });
  });
  return {
    pid: child.pid ?? 0,
    done,
    exited,
    stop: () => {
      try {
        child.kill();
      } catch {
        // The process is already gone.
      }
    },
  };
}

function runnerFor(projectDir: string): BuildSpawn | null {
  const key = path.resolve(projectDir);
  if (projectRunners.has(key)) return projectRunners.get(key) ?? null;
  return runner;
}

export async function prepareSiteBuild(projectDir: string, briefMarkdown: string): Promise<string[]> {
  const { prompts, planned } = generateBriefPlan(briefMarkdown);
  const coverage = checkPlanCoverage(planned.requirements, prompts);
  if (!coverage.ok) throw new PlanCoverageError(coverage.uncovered);
  const packet = renderContextPacket(buildContextPacket(projectDir, "site-prompt"));
  const dir = path.join(projectDir, ".hitchhiker", "prompts");
  mkdirSync(dir, { recursive: true });
  const ids: string[] = [];
  for (const prompt of prompts) {
    writeFileSync(path.join(dir, `${prompt.id}.md`), renderPrompt(prompt, briefMarkdown, packet), "utf8");
    ids.push(prompt.id);
  }
  const queue = (await loadBuildQueue(projectDir)) ?? { items: [] };
  const kept = queue.items.filter((item) => item.id !== GUIDE_ENTRY_ID);
  const seen = new Set(kept.map((item) => item.id));
  for (const id of ids) {
    if (seen.has(id)) continue;
    kept.push({ id, kind: "build", status: "queued" });
    seen.add(id);
  }
  await saveBuildQueue(projectDir, { items: kept });
  return ids;
}

export function ensureSiteBuild(projectDir: string): Promise<void> {
  const key = path.resolve(projectDir);
  const existing = jobs.get(key);
  if (existing) return existing;
  const spawnFn = runnerFor(projectDir);
  if (spawnFn === null) return Promise.resolve();
  const job = runJob(projectDir, spawnFn);
  jobs.set(key, job);
  void job.finally(() => {
    if (jobs.get(key) === job) jobs.delete(key);
  });
  return job;
}

export function siteBuildSettled(projectDir: string): Promise<void> {
  return jobs.get(path.resolve(projectDir)) ?? Promise.resolve();
}

/**
 * A running row whose process is gone is recovered when a runner is installed.
 * With no runner, the row becomes interrupted and other running rows stay.
 * Returns true when this call changed that row or started recovery.
 */
export async function reconcileSiteBuild(projectDir: string): Promise<boolean> {
  const key = path.resolve(projectDir);
  if (jobs.has(key)) return false;
  const run = readRunFile(projectDir);
  if (run === null || run.status !== "running") return false;
  if (pidAlive(run.pid)) return false;
  if (runnerFor(projectDir) !== null) {
    await recoverSiteBuild(projectDir);
    return true;
  }
  await setStatus(projectDir, run.promptId, "interrupted");
  writeRun(projectDir, {
    ...run,
    status: "interrupted",
    reason: "The build stopped before it finished.",
    pid: null,
    elapsedMs: elapsed(run),
  });
  return true;
}

export async function retrySiteBuild(projectDir: string, promptId: string): Promise<void> {
  const billing = readRunFile(projectDir)?.paused === true;
  await requeue(projectDir, promptId, "failed");
  if (billing) await unpausePrompts(projectDir);
  if (billing) clearBillingPause(projectDir);
  void ensureSiteBuild(projectDir);
}

export async function resumeSiteBuild(projectDir: string, promptId: string): Promise<void> {
  const outcome = await continueSiteBuild(projectDir, promptId);
  if (outcome === "rejected" || outcome === "idle") throw new Error("That prompt is not waiting.");
}

export function readBuildRun(projectDir: string): BuildRunView | null {
  const run = readRunFile(projectDir);
  if (run === null) return null;
  return { ...run, elapsedMs: run.status === "running" ? elapsed(run) : run.elapsedMs };
}

async function runJob(projectDir: string, spawnFn: BuildSpawn): Promise<void> {
  const current = readRunFile(projectDir);
  if (current?.status === "running" && pidAlive(current.pid)) return;
  try {
    await runQueue(projectDir, spawnFn);
  } catch (error: unknown) {
    const run = readRunFile(projectDir);
    if (run?.status !== "running") return;
    const reason = error instanceof Error ? publicText(error.message) : "The build did not finish.";
    await settleItem(
      projectDir,
      run.promptId,
      "failed",
      reason === "" ? "The build did not finish." : reason,
      run.lastLines,
      run.filesWritten,
      run.startedAt,
    );
  }
}

async function runQueue(projectDir: string, spawnFn: BuildSpawn): Promise<void> {
  const key = path.resolve(projectDir);
  for (;;) {
    if (readRunFile(projectDir)?.paused === true) return;
    const queue = await loadBuildQueue(projectDir);
    const next = queue?.items.find((item) => item.status === "queued" && PROMPT_ID.test(item.id));
    if (next === undefined) return;
    const promptPath = path.join(projectDir, ".hitchhiker", "prompts", `${next.id}.md`);
    let exists = false;
    try {
      exists = statSync(promptPath).isFile();
    } catch {
      exists = false;
    }
    if (!exists) {
      await settleItem(projectDir, next.id, "failed", "The prompt file is missing.", [], []);
      return;
    }
    const startedAt = new Date().toISOString();
    const lines: string[] = [];
    const before = snapshot(projectDir);
    resetBuildLog(projectDir, next.id);
    const pidBox = { pid: null as number | null };
    const buffered: string[] = [];
    let rawTail = "";
    let feed: ((chunk: string) => void) | null = null;
    let sealed = false;
    let handle: BuildSpawnHandle;
    try {
      handle = spawnFn({
        command: "grok",
        args: buildSpawnArgs(projectDir, promptPath),
        cwd: projectDir,
        promptId: next.id,
        model: BUILD_MODEL,
        effort: BUILD_EFFORT,
        onOutput: (chunk) => {
          if (sealed) return;
          appendBuildLog(projectDir, next.id, chunk);
          rawTail = tailText(rawTail, chunk);
          if (feed) feed(chunk);
          else buffered.push(chunk);
          pushLines(lines, chunk);
          try {
            writeRun(projectDir, liveRun(next.id, startedAt, lines, diffSnapshots(before, snapshot(projectDir)), pidBox.pid));
          } catch {
            // A progress write must not skip settlement.
          }
        },
      });
      pidBox.pid = handle.pid > 0 ? handle.pid : null;
    } catch (error: unknown) {
      const reason = error instanceof Error ? publicText(error.message) : "The build did not start.";
      await settleItem(projectDir, next.id, "failed", reason === "" ? "The build did not start." : reason, lines, []);
      return;
    }
    const watch = siteBuildWatchConfig(projectDir);
    const control = trackSettlement(handle, watch.exitGraceMs);
    if (pidBox.pid !== null) {
      registerLive({
        projectDir: key,
        promptId: next.id,
        pid: pidBox.pid,
        intervalMs: watch.intervalMs,
        idleMs: watch.idleMs,
        lastActivity: Date.now(),
        lastScan: Date.now(),
        force: control.force,
      });
    }
    feed = (chunk) => {
      control.feed(chunk);
      const job = liveBuilds.get(key);
      if (job !== undefined && job.promptId === next.id) job.lastActivity = Date.now();
    };
    for (const chunk of buffered) feed(chunk);
    if (pidBox.pid !== null) {
      try {
        await setStatus(projectDir, next.id, "running");
        writeRun(projectDir, liveRun(next.id, startedAt, lines, diffSnapshots(before, snapshot(projectDir)), pidBox.pid));
      } catch (error: unknown) {
        control.force({
          code: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : "The build did not start.",
          errorCode: "SETTLE",
        });
        sealed = true;
        if (liveBuilds.get(key)?.promptId === next.id) unregisterLive(key);
        const reason = error instanceof Error ? publicText(error.message) : "The build did not start.";
        await settleItem(projectDir, next.id, "failed", reason === "" ? "The build did not start." : reason, lines, []);
        return;
      }
    }
    let result: BuildSpawnResult;
    try {
      result = await control.done;
    } finally {
      sealed = true;
      if (liveBuilds.get(key)?.promptId === next.id) unregisterLive(key);
    }
    const files = diffSnapshots(before, snapshot(projectDir));
    const evidence = `${result.stdout}\n${result.stderr}\n${rawTail}\n${readBuildLog(projectDir, next.id)}`;
    if (logHitTurnLimit(evidence)) {
      const kind = classifyGrokFailure({
        stdout: result.stdout,
        stderr: result.stderr,
        stream: evidence,
        code: result.code,
      }).kind;
      if (kind !== "billing") {
        await settleItem(projectDir, next.id, "failed", TURN_LIMIT_REASON, lines, files, startedAt);
        return;
      }
    }
    if (result.code === 0 && result.errorCode === null) {
      try {
        const gate = buildGates.get(key);
        if (gate !== undefined) await gate({ projectDir, promptId: next.id, files });
        await settleItem(projectDir, next.id, "passed", "", lines, files, startedAt);
      } catch (error: unknown) {
        const reason = error instanceof Error ? publicText(error.message) : "The build did not finish.";
        await settleItem(projectDir, next.id, "failed", reason === "" ? "The build did not finish." : reason, lines, files, startedAt);
        return;
      }
      continue;
    }
    const kind = classifyGrokFailure({
      stdout: result.stdout,
      stderr: result.stderr,
      stream: rawTail,
      code: result.code,
    }).kind;
    await settleItem(projectDir, next.id, "failed", failureReason(result, rawTail), lines, files, startedAt);
    if (kind === "billing") {
      await pauseQueuedPrompts(projectDir);
      stampBilling(projectDir);
    }
    return;
  }
}

async function recoverBody(projectDir: string): Promise<void> {
  try {
    if (runnerFor(projectDir) === null) return;
    await enqueueControl(projectDir, async () => {
      if (jobs.has(path.resolve(projectDir))) return;
      const adopted = await adoptDeadRun(projectDir);
      if (adopted === "continue") void ensureSiteBuild(projectDir);
    });
  } catch {
    // The row stays on disk. Resume can try again.
  }
}

async function continueBody(projectDir: string, promptId?: string): Promise<BuildContinueOutcome> {
  const key = path.resolve(projectDir);
  return enqueueControl(projectDir, async () => {
    if (jobs.has(key)) return "live";
    const live = readRunFile(projectDir);
    if (live?.status === "running" && pidAlive(live.pid)) return "live";
    if (runnerFor(projectDir) === null) return promptId === undefined ? "idle" : "rejected";
    if (live?.status === "running") {
      const adopted = await adoptDeadRun(projectDir);
      if (adopted === "continue") {
        void ensureSiteBuild(projectDir);
        return "started";
      }
    }
    const explicit = await planExplicit(projectDir, promptId);
    if (explicit === "start") {
      void ensureSiteBuild(projectDir);
      return "started";
    }
    return explicit;
  });
}

function enqueueControl<T>(projectDir: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectDir);
  const previous = controlChains.get(key) ?? Promise.resolve();
  const run = previous.then(() => fn());
  controlChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/**
 * A running row with a dead child. Verify a clean end, or queue one rerun.
 * Does not spawn. The caller starts the queue outside any nested lock.
 */
async function adoptDeadRun(projectDir: string): Promise<"continue" | "halt" | "idle"> {
  if (jobs.has(path.resolve(projectDir))) return "idle";
  const run = readRunFile(projectDir);
  if (run === null || run.status !== "running") return "idle";
  if (pidAlive(run.pid)) return "idle";
  const log = `${readBuildLog(projectDir, run.promptId)}\n${run.lastLines.join("\n")}`;
  if (classifyGrokFailure({ stream: log }).kind === "billing") {
    await settleItem(projectDir, run.promptId, "failed", BILLING_TOP_UP, run.lastLines, run.filesWritten, run.startedAt);
    await pauseQueuedPrompts(projectDir);
    stampBilling(projectDir);
    return "halt";
  }
  if (logHitTurnLimit(log)) {
    await settleItem(projectDir, run.promptId, "failed", TURN_LIMIT_REASON, run.lastLines, run.filesWritten, run.startedAt);
    return "halt";
  }
  const expected = expectedOutputFiles(projectDir, run.promptId);
  const outputsExist = expected.every((file) => outputExists(projectDir, file));
  const decision = decideBuildRecovery({
    promptId: run.promptId,
    cleanEnd: logHasCleanEnd(log),
    outputsExist,
    rerunAlready: run.recoveryRerun,
  });
  if (decision.action === "verify") {
    const files = [...new Set([...run.filesWritten, ...expected])];
    try {
      const gate = buildGates.get(path.resolve(projectDir));
      if (gate !== undefined) await gate({ projectDir, promptId: run.promptId, files });
      const reason = recoveredReason(run.promptId);
      await settleItem(projectDir, run.promptId, "passed", reason, run.lastLines, files, run.startedAt);
      stampRecovery(projectDir, reason, false);
      return "continue";
    } catch (error: unknown) {
      const text = error instanceof Error ? publicText(error.message) : "";
      const reason = text === "" ? "The build did not finish." : text;
      await settleItem(projectDir, run.promptId, "failed", reason, run.lastLines, files, run.startedAt);
      return "halt";
    }
  }
  if (decision.action === "interrupt") {
    await setStatus(projectDir, run.promptId, "interrupted");
    writeRun(projectDir, {
      ...run,
      status: "interrupted",
      reason: decision.reason,
      recovery: decision.reason,
      recoveryRerun: true,
      pid: null,
      elapsedMs: elapsed(run),
    });
    return "halt";
  }
  await setStatus(projectDir, run.promptId, "queued");
  writeRun(projectDir, {
    ...run,
    status: "interrupted",
    reason: decision.reason,
    recovery: decision.reason,
    recoveryRerun: true,
    pid: null,
    elapsedMs: elapsed(run),
  });
  return "continue";
}

async function planExplicit(
  projectDir: string,
  promptId: string | undefined,
): Promise<"start" | "idle" | "rejected"> {
  if (readRunFile(projectDir)?.paused === true) {
    return promptId === undefined ? "idle" : "rejected";
  }
  const queue = await loadBuildQueue(projectDir);
  if (promptId !== undefined) {
    if (!PROMPT_ID.test(promptId)) return "rejected";
    if (queue?.items.some((item) => item.id === promptId) !== true) return "rejected";
  }
  const next = queue?.items.find(
    (item) =>
      PROMPT_ID.test(item.id) &&
      (item.status === "interrupted" || item.status === "failed" || item.status === "queued" || item.status === "running"),
  );
  if (next === undefined) return promptId === undefined ? "idle" : "rejected";
  if (next.status === "interrupted") {
    noteRerun(projectDir, next.id);
    await requeue(projectDir, next.id, "interrupted");
  } else if (next.status === "failed") {
    await requeue(projectDir, next.id, "failed");
  } else if (next.status === "running") {
    noteRerun(projectDir, next.id);
    await setStatus(projectDir, next.id, "queued");
  }
  return "start";
}

function noteRerun(projectDir: string, promptId: string): void {
  const reason = rerunReason(promptId);
  const current = readRunFile(projectDir);
  const startedAt = current?.promptId === promptId ? current.startedAt : new Date().toISOString();
  writeRun(projectDir, {
    promptId,
    status: "interrupted",
    model: current?.model && current.model !== "" ? current.model : BUILD_MODEL,
    effort: current?.effort && current.effort !== "" ? current.effort : BUILD_EFFORT,
    startedAt,
    elapsedMs: current?.promptId === promptId ? elapsed(current) : 0,
    lastLines: current?.promptId === promptId ? current.lastLines : [],
    filesWritten: current?.promptId === promptId ? current.filesWritten : [],
    reason,
    pid: null,
    recovery: reason,
    recoveryRerun: current?.promptId === promptId ? current.recoveryRerun : false,
  });
}

function stampRecovery(projectDir: string, recovery: string, rerun: boolean): void {
  const run = readRunFile(projectDir);
  if (run === null) return;
  writeRun(projectDir, { ...run, recovery, recoveryRerun: rerun });
}

function recoveredReason(promptId: string): string {
  return `${promptId} recovered: output verified, passed`;
}

function rerunReason(promptId: string): string {
  return `${promptId} rerun after restart`;
}

function buildLogPath(projectDir: string, promptId: string): string {
  return path.join(projectDir, ".hitchhiker", "logs", `build-${promptId}.log`);
}

function readBuildLog(projectDir: string, promptId: string): string {
  try {
    return readFileSync(buildLogPath(projectDir, promptId), "utf8");
  } catch {
    return "";
  }
}

function resetBuildLog(projectDir: string, promptId: string): void {
  const file = buildLogPath(projectDir, promptId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "", "utf8");
}

function appendBuildLog(projectDir: string, promptId: string, chunk: string): void {
  try {
    const file = buildLogPath(projectDir, promptId);
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, chunk);
  } catch {
    // A log write must not skip settlement.
  }
}

function expectedOutputFiles(projectDir: string, promptId: string): string[] {
  let text = "";
  try {
    text = readFileSync(path.join(projectDir, ".hitchhiker", "prompts", `${promptId}.md`), "utf8");
  } catch {
    return [];
  }
  return parseExpectedFiles(text);
}

function parseExpectedFiles(markdown: string): string[] {
  const match = /^Files:\s*(.+)$/m.exec(markdown);
  if (match === null || match[1] === undefined) return [];
  const raw = match[1].trim();
  if (raw === "" || raw.toLowerCase() === "none") return [];
  const files: string[] = [];
  for (const part of raw.split(",")) {
    const rel = safeRelative(part.trim());
    if (rel !== null) files.push(rel);
  }
  return files;
}

function safeRelative(value: string): string | null {
  const norm = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (norm === "" || norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return null;
  if (norm.split("/").some((part) => part === ".." || part === "")) return null;
  return norm;
}

function outputExists(projectDir: string, rel: string): boolean {
  try {
    return statSync(path.join(projectDir, rel)).isFile();
  } catch {
    return false;
  }
}

function finiteMs(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return fallback;
  return value;
}

function watchResult(): BuildSpawnResult {
  return { code: null, stdout: "", stderr: "", errorCode: "WATCH" };
}

function rearmWatch(): void {
  if (watchTimer !== null) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
  if (liveBuilds.size === 0) return;
  let interval = DEFAULT_WATCH.intervalMs;
  for (const job of liveBuilds.values()) interval = Math.min(interval, job.intervalMs);
  watchTimer = setInterval(() => {
    runBuildWatchdog();
  }, Math.max(10, interval));
}

function registerLive(job: LiveBuild): void {
  liveBuilds.set(job.projectDir, job);
  rearmWatch();
}

function unregisterLive(projectDir: string): void {
  liveBuilds.delete(projectDir);
  rearmWatch();
}

interface Settlement {
  done: Promise<BuildSpawnResult>;
  force: (result: BuildSpawnResult) => void;
  feed: (chunk: string) => void;
}

/**
 * Settle on the first of child exit/close or a streaming-json `end` event.
 * An `end` event waits a bounded grace for the exit code so a late close
 * cannot leave the row running. The promise resolves exactly once.
 */
function trackSettlement(handle: BuildSpawnHandle, graceMs: number): Settlement {
  let resolveOut: (result: BuildSpawnResult) => void = () => undefined;
  const done = new Promise<BuildSpawnResult>((resolve) => {
    resolveOut = resolve;
  });
  let finished = false;
  let endReason: string | null = null;
  let buffer = "";
  let grace: ReturnType<typeof setTimeout> | null = null;

  const finish = (result: BuildSpawnResult): void => {
    if (finished) return;
    finished = true;
    if (grace !== null) {
      clearTimeout(grace);
      grace = null;
    }
    resolveOut(result);
  };

  const snapshotResult = (code: number | null, extra?: Partial<BuildSpawnResult>): BuildSpawnResult => ({
    code,
    stdout: extra?.stdout ?? "",
    stderr: extra?.stderr ?? "",
    errorCode: extra?.errorCode ?? null,
  });

  const armGrace = (): void => {
    if (finished || grace !== null) return;
    grace = setTimeout(() => {
      grace = null;
      if (finished) return;
      try {
        handle.stop?.();
      } catch {
        // Stopping a dead child is fine.
      }
      if (endReason === "end_turn") finish(snapshotResult(0));
      else finish({ code: null, stdout: "", stderr: "", errorCode: "ENDED" });
    }, graceMs);
  };

  if (handle.exited !== undefined) {
    void handle.exited.then(
      (code) => {
        // Let `done` (stdio close) win when it resolves in the same turn and carries stderr.
        queueMicrotask(() => {
          finish(snapshotResult(code));
        });
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "The build did not finish.";
        finish({ code: 1, stdout: "", stderr: message, errorCode: "SETTLE" });
      },
    );
  }
  void handle.done.then(
    (result) => {
      finish(result);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "The build did not finish.";
      finish({ code: 1, stdout: "", stderr: message, errorCode: "SETTLE" });
    },
  );

  return {
    done,
    force: finish,
    feed: (chunk) => {
      if (finished || endReason !== null) return;
      buffer = (buffer + chunk).slice(-32_000);
      const reason = readEndReason(buffer);
      if (reason === null) return;
      endReason = reason;
      if (!finished) armGrace();
    },
  };
}

function logHitTurnLimit(text: string): boolean {
  return /"type"\s*:\s*"max_turns_reached"/.test(text) || /\bmax turns reached\b/i.test(text);
}

function readEndReason(buffer: string): string | null {
  let found: string | null = null;
  for (const line of buffer.split(/\r?\n/)) {
    const start = line.indexOf("{");
    if (start < 0) continue;
    const slice = line.slice(start).trim();
    if (!/"type"\s*:\s*"end"/.test(slice)) continue;
    try {
      const parsed = JSON.parse(slice) as { type?: unknown; stopReason?: unknown };
      if (parsed.type !== "end") continue;
      found = typeof parsed.stopReason === "string" ? parsed.stopReason : "";
    } catch {
      continue;
    }
  }
  return found;
}

async function settleItem(
  projectDir: string,
  promptId: string,
  status: "passed" | "failed",
  reason: string,
  lines: readonly string[],
  files: readonly string[],
  startedAt = new Date().toISOString(),
): Promise<void> {
  try {
    await finishItem(projectDir, promptId, status, reason, lines, files, startedAt);
  } catch (error: unknown) {
    const fallback = error instanceof Error ? publicText(error.message) : "";
    const text = publicText(fallback === "" ? reason : fallback);
    try {
      await setStatus(projectDir, promptId, "failed");
    } catch {
      // The run file below is what the desk reads when the queue lock fails.
    }
    try {
      const previous = readRunFile(projectDir);
      const started = previous?.promptId === promptId ? previous.startedAt : startedAt;
      writeRun(projectDir, {
        promptId,
        status: "failed",
        model: BUILD_MODEL,
        effort: BUILD_EFFORT,
        startedAt: started,
        elapsedMs: Math.max(0, Date.now() - Date.parse(started)),
        lastLines: [...lines],
        filesWritten: [...files],
        reason: text === "" ? "The build did not finish." : text,
        pid: null,
        recovery: "",
        recoveryRerun: false,
      });
    } catch {
      // A second disk failure leaves the watchdog to catch a still-running row.
    }
  }
}

function liveRun(
  promptId: string,
  startedAt: string,
  lines: readonly string[],
  files: readonly string[],
  pid: number | null,
): RunFile {
  return {
    promptId,
    status: "running",
    model: BUILD_MODEL,
    effort: BUILD_EFFORT,
    startedAt,
    elapsedMs: Math.max(0, Date.now() - Date.parse(startedAt)),
    lastLines: [...lines],
    filesWritten: [...files],
    reason: "",
    pid,
    recovery: "",
    recoveryRerun: false,
  };
}

async function finishItem(
  projectDir: string,
  promptId: string,
  status: "passed" | "failed",
  reason: string,
  lines: readonly string[],
  files: readonly string[],
  startedAt = new Date().toISOString(),
): Promise<void> {
  await setStatus(projectDir, promptId, status);
  const previous = readRunFile(projectDir);
  const started = previous?.promptId === promptId ? previous.startedAt : startedAt;
  writeRun(projectDir, {
    promptId,
    status,
    model: BUILD_MODEL,
    effort: BUILD_EFFORT,
    startedAt: started,
    elapsedMs: Math.max(0, Date.now() - Date.parse(started)),
    lastLines: [...lines],
    filesWritten: [...files],
    reason: publicText(reason),
    pid: null,
    recovery: "",
    recoveryRerun: false,
  });
}

async function requeue(projectDir: string, promptId: string, from: "failed" | "interrupted"): Promise<void> {
  if (!PROMPT_ID.test(promptId)) throw new Error("Name the prompt.");
  const queue = await loadBuildQueue(projectDir);
  const item = queue?.items.find((entry) => entry.id === promptId);
  if (item === undefined || item.status !== from) throw new Error("That prompt is not waiting.");
  item.status = "queued";
  await saveBuildQueue(projectDir, queue ?? { items: [] });
}

async function setStatus(projectDir: string, id: string, status: QueueStatus): Promise<void> {
  const queue = await loadBuildQueue(projectDir);
  if (queue === null) return;
  let changed = false;
  for (const item of queue.items) {
    if (item.id !== id || item.status === status) continue;
    item.status = status;
    changed = true;
  }
  if (changed) await saveBuildQueue(projectDir, queue);
}

async function loadBuildQueue(projectDir: string): Promise<QueueFile | null> {
  return retryLock(() => loadQueue(projectDir));
}

async function saveBuildQueue(projectDir: string, queue: QueueFile): Promise<void> {
  await retryLock(() => saveQueue(projectDir, queue));
}

async function retryLock<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (!(error instanceof LockHeld) || attempt === 11) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new LockHeld(process.pid);
}

function renderPrompt(prompt: SitePromptSkeleton, briefMarkdown: string, packet: string): string {
  const brief = briefMarkdown.trim() === "" ? "The brief text was empty." : briefMarkdown.trim();
  const files = prompt.filesModified.length === 0 ? "none" : prompt.filesModified.join(", ");
  return [
    "---",
    `id: ${prompt.id}`,
    `title: ${prompt.title}`,
    `model: ${BUILD_MODEL}`,
    `effort: ${BUILD_EFFORT}`,
    "---",
    "",
    `# ${prompt.title}`,
    "",
    packet.trim(),
    "",
    "## Site Brief",
    "",
    brief,
    "",
    "## Rules",
    "",
    SITE_RULES,
    "",
    "## Task",
    "",
    `Prompt ${prompt.id}. ${prompt.title}`,
    `Files: ${files}`,
    ...(prompt.route === undefined ? [] : [`Route: ${prompt.route}`]),
    ...(prompt.contentSources === undefined || prompt.contentSources.length === 0
      ? []
      : [`Content sources: ${prompt.contentSources.join(", ")}`]),
    ...(prompt.acceptance === undefined || prompt.acceptance.length === 0
      ? []
      : [`Acceptance: ${prompt.acceptance.join(" ")}`]),
    ...(prompt.requirements.length === 0 ? [] : [`Requirements: ${prompt.requirements.join(", ")}`]),
    "",
  ].join("\n");
}

function failureReason(result: BuildSpawnResult, stream = ""): string {
  const classified = classifyGrokFailure({
    stdout: result.stdout,
    stderr: result.stderr,
    stream,
    code: result.code,
  });
  if (classified.kind === "billing") return BILLING_TOP_UP;
  if (result.errorCode === "WATCH" || result.errorCode === "ENDED") {
    return "The build process ended without reporting.";
  }
  if (result.errorCode === "SETTLE") {
    const text = presentReason(result.stderr);
    return text === "" ? "The build did not finish." : text;
  }
  const blob = `${result.stderr}\n${result.stdout}\n${stream}`;
  if (result.errorCode === "ENOENT" || /grok is not on PATH/i.test(blob)) {
    return "grok is not on PATH. Run hh doctor.";
  }
  if (
    classified.kind === "rate-limit" ||
    /usage limit|rate limit|too many requests|\b429\b|quota exceeded/i.test(blob)
  ) {
    return "The model hit a usage limit.";
  }
  if (/unauthorized|\b401\b|not logged in|authentication failed|sign in to grok/i.test(blob)) {
    return "The model needs a sign-in.";
  }
  const fallback =
    result.code === null ? "The build stopped before it finished." : `The build exited with code ${result.code}.`;
  return sanitizeFailureReason(blob, fallback);
}

async function pauseQueuedPrompts(projectDir: string): Promise<void> {
  const queue = await loadBuildQueue(projectDir);
  if (queue === null) return;
  let changed = false;
  for (const item of queue.items) {
    if (item.status !== "queued" || !PROMPT_ID.test(item.id)) continue;
    item.status = "paused";
    changed = true;
  }
  if (changed) await saveBuildQueue(projectDir, queue);
}

async function unpausePrompts(projectDir: string): Promise<void> {
  const queue = await loadBuildQueue(projectDir);
  if (queue === null) return;
  let changed = false;
  for (const item of queue.items) {
    if (item.status !== "paused" || !PROMPT_ID.test(item.id)) continue;
    item.status = "queued";
    changed = true;
  }
  if (changed) await saveBuildQueue(projectDir, queue);
}

function stampBilling(projectDir: string): void {
  const run = readRunFile(projectDir);
  if (run === null) return;
  writeRun(projectDir, {
    ...run,
    status: "failed",
    reason: BILLING_TOP_UP,
    paused: true,
    escalation: BILLING_TOP_UP,
    pid: null,
  });
}

function clearBillingPause(projectDir: string): void {
  const run = readRunFile(projectDir);
  if (run === null) return;
  writeRun(projectDir, { ...run, paused: false, escalation: "" });
}

function runPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "build-run.json");
}

function readRunFile(projectDir: string): RunFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(runPath(projectDir), "utf8"));
    if (!isRun(parsed)) return null;
    const record = parsed as RunFile & { recovery?: unknown; recoveryRerun?: unknown };
    return {
      ...record,
      recovery: typeof record.recovery === "string" ? record.recovery : "",
      recoveryRerun: record.recoveryRerun === true,
      paused: record.paused === true,
      escalation: typeof record.escalation === "string" ? record.escalation : "",
    };
  } catch {
    return null;
  }
}

function writeRun(projectDir: string, run: RunFile): void {
  const previous = readRunFile(projectDir);
  const files = new Set([...(previous?.filesWritten ?? []), ...run.filesWritten]);
  const same = previous?.promptId === run.promptId;
  const recovery = run.recovery !== "" ? run.recovery : (previous?.recovery ?? "");
  const recoveryRerun = run.recoveryRerun || (same && previous?.recoveryRerun === true);
  const next: RunFile = {
    ...run,
    filesWritten: [...files].sort().slice(0, FILE_CAP),
    lastLines: visibleLines(run.lastLines),
    reason: presentReason(run.reason),
    recovery,
    recoveryRerun,
    paused: run.paused === true,
    escalation: typeof run.escalation === "string" ? run.escalation : "",
  };
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(runPath(projectDir), `${JSON.stringify(next)}\n`, "utf8");
}

function isRun(value: unknown): value is RunFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const status = record.status;
  const known =
    status === "queued" ||
    status === "running" ||
    status === "passed" ||
    status === "failed" ||
    status === "interrupted";
  return (
    known &&
    typeof record.promptId === "string" &&
    typeof record.model === "string" &&
    typeof record.effort === "string" &&
    typeof record.startedAt === "string" &&
    typeof record.elapsedMs === "number" &&
    Array.isArray(record.lastLines) &&
    Array.isArray(record.filesWritten) &&
    typeof record.reason === "string" &&
    (record.pid === null || typeof record.pid === "number")
  );
}

function elapsed(run: RunFile): number {
  const started = Date.parse(run.startedAt);
  if (!Number.isFinite(started)) return run.elapsedMs;
  return Math.max(0, Date.now() - started);
}

function pidAlive(pid: number | null): boolean {
  if (pid === null || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : "";
    return code === "EPERM";
  }
}

function pushLines(lines: string[], chunk: string): void {
  lines.push(...visibleLines(chunk.split(/\r?\n/)));
  if (lines.length > LINE_CAP) lines.splice(0, lines.length - LINE_CAP);
}

function visibleLines(lines: readonly string[]): string[] {
  const next: string[] = [];
  for (const line of lines) {
    if (isRawJsonLine(line)) continue;
    const clean = publicText(line).replace(/[{}]/g, "").trim();
    if (clean === "") continue;
    next.push(clean.slice(0, LINE_CHARS));
  }
  return next.slice(-LINE_CAP);
}

function presentReason(reason: string): string {
  const plain = publicText(reason);
  if (plain === "" || !/[{}]/.test(plain)) return plain;
  return sanitizeFailureReason(plain, "The build did not finish.");
}

function publicText(value: string): string {
  return value.replace(/!/g, ".").replace(/\u2014/g, ",").replace(/[\u0000-\u001f]/g, " ").trim();
}

function tailText(current: string, chunk: string): string {
  const next = `${current}${chunk}`;
  return next.length > 8_000 ? next.slice(next.length - 8_000) : next;
}

function snapshot(root: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string, prefix: string): void => {
    let entries: { name: string; directory: boolean; file: boolean }[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
        name: String(entry.name),
        directory: entry.isDirectory(),
        file: entry.isFile(),
      }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.directory) {
        walk(abs, rel);
        continue;
      }
      if (!entry.file) continue;
      try {
        const stat = statSync(abs);
        found.set(rel.split("\\").join("/"), `${stat.size}:${stat.mtimeMs}`);
      } catch {
        continue;
      }
    }
  };
  walk(root, "");
  return found;
}

function diffSnapshots(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  const files: string[] = [];
  for (const [file, signature] of after) {
    if (before.get(file) === signature) continue;
    files.push(file);
    if (files.length >= FILE_CAP) break;
  }
  files.sort();
  return files;
}
