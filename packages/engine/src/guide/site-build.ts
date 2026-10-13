/**
 * Site build runner. Approve writes the prompt files and this module
 * consumes the queue one prompt at a time. Tests inject a spawn function.
 * The live spawn is installed only when a desk or CLI command asks for it.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GrokMissingError, resolveGrokCommand } from "../ai/grok-cli.ts";
import { buildContextPacket, renderContextPacket } from "../context/packet.ts";
import { hiddenChildOptions } from "../hidden-child.ts";
import { LockHeld } from "../lock.ts";
import { loadQueue, saveQueue, type QueueFile, type QueueStatus } from "../queue-file.ts";
import { generateSkeleton, SITE_RULES, type SitePromptSkeleton } from "../spec/site-prompts.ts";

export const BUILD_MODEL = "grok-4.7-build-fast";
export const BUILD_EFFORT = "xhigh";

const GUIDE_ENTRY_ID = "guide-entry";
const PROMPT_ID = /^\d{3}$/;
const SKIP_DIRS = new Set(["node_modules", ".git", ".hitchhiker"]);
const LINE_CAP = 6;
const LINE_CHARS = 180;
const FILE_CAP = 40;

const SKELETON_INPUT = {
  pages: [{ id: "home", title: "Home", sections: ["hero"] }],
  effects: [],
  features: ["contact form"],
  integrations: [],
  seoItems: [],
  stack: "astro" as const,
  protectedPaths: [],
};

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
  done: Promise<BuildSpawnResult>;
}

export type BuildSpawn = (request: BuildSpawnRequest) => BuildSpawnHandle;

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
}

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
}

let runner: BuildSpawn | null = null;
const projectRunners = new Map<string, BuildSpawn | null>();
const jobs = new Map<string, Promise<void>>();

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
    "--max-turns",
    "80",
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
      stdio: ["ignore", "pipe", "pipe"] as const,
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
  let settled = false;
  const done = new Promise<BuildSpawnResult>((resolve) => {
    const finish = (result: BuildSpawnResult): void => {
      if (settled) return;
      settled = true;
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
    child.on("close", (code) => {
      finish({ code: code ?? null, stdout, stderr, errorCode: null });
    });
  });
  return { pid: child.pid ?? 0, done };
}

function runnerFor(projectDir: string): BuildSpawn | null {
  const key = path.resolve(projectDir);
  if (projectRunners.has(key)) return projectRunners.get(key) ?? null;
  return runner;
}

export async function prepareSiteBuild(projectDir: string, briefMarkdown: string): Promise<string[]> {
  const { prompts } = generateSkeleton(SKELETON_INPUT);
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
 * A running row whose process is gone becomes interrupted.
 * Other running rows, including an orchestrator queue with no build-run file, stay as they are.
 * Returns true when this call made that change.
 */
export async function reconcileSiteBuild(projectDir: string): Promise<boolean> {
  const key = path.resolve(projectDir);
  if (jobs.has(key)) return false;
  const run = readRunFile(projectDir);
  if (run === null || run.status !== "running") return false;
  if (pidAlive(run.pid)) return false;
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
  await requeue(projectDir, promptId, "failed");
  void ensureSiteBuild(projectDir);
}

export async function resumeSiteBuild(projectDir: string, promptId: string): Promise<void> {
  await requeue(projectDir, promptId, "interrupted");
  void ensureSiteBuild(projectDir);
}

export function readBuildRun(projectDir: string): BuildRunView | null {
  const run = readRunFile(projectDir);
  if (run === null) return null;
  return { ...run, elapsedMs: run.status === "running" ? elapsed(run) : run.elapsedMs };
}

async function runJob(projectDir: string, spawnFn: BuildSpawn): Promise<void> {
  const before = readRunFile(projectDir);
  const stale = before?.status === "running" && !pidAlive(before.pid);
  await reconcileSiteBuild(projectDir);
  if (stale) return;
  const current = readRunFile(projectDir);
  if (current?.status === "running" && pidAlive(current.pid)) return;
  await runQueue(projectDir, spawnFn);
}

async function runQueue(projectDir: string, spawnFn: BuildSpawn): Promise<void> {
  for (;;) {
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
      await finishItem(projectDir, next.id, "failed", "The prompt file is missing.", [], []);
      return;
    }
    const startedAt = new Date().toISOString();
    const lines: string[] = [];
    const before = snapshot(projectDir);
    let pid: number | null = null;
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
          pushLines(lines, chunk);
          const files = diffSnapshots(before, snapshot(projectDir));
          writeRun(projectDir, liveRun(next.id, startedAt, lines, files, pid));
        },
      });
      pid = handle.pid > 0 ? handle.pid : null;
    } catch (error: unknown) {
      const reason = error instanceof Error ? publicText(error.message) : "The build did not start.";
      await finishItem(projectDir, next.id, "failed", reason === "" ? "The build did not start." : reason, lines, []);
      return;
    }
    if (handle.pid > 0) {
      await setStatus(projectDir, next.id, "running");
      writeRun(
        projectDir,
        liveRun(next.id, startedAt, lines, diffSnapshots(before, snapshot(projectDir)), handle.pid),
      );
    }
    const result = await handle.done;
    const files = diffSnapshots(before, snapshot(projectDir));
    if (result.code === 0 && result.errorCode === null) {
      await finishItem(projectDir, next.id, "passed", "", lines, files, startedAt);
      continue;
    }
    await finishItem(projectDir, next.id, "failed", failureReason(result), lines, files, startedAt);
    return;
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
    "",
  ].join("\n");
}

function failureReason(result: BuildSpawnResult): string {
  const blob = `${result.stderr}\n${result.stdout}`;
  if (result.errorCode === "ENOENT" || /grok is not on PATH/i.test(blob)) {
    return "grok is not on PATH. Run hh doctor.";
  }
  if (/usage limit|rate limit|too many requests|\b429\b|quota exceeded/i.test(blob)) {
    return "The model hit a usage limit.";
  }
  if (/unauthorized|\b401\b|not logged in|authentication failed|sign in to grok/i.test(blob)) {
    return "The model needs a sign-in.";
  }
  if (result.code === null) return "The build stopped before it finished.";
  return `The build exited with code ${result.code}.`;
}

function runPath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "build-run.json");
}

function readRunFile(projectDir: string): RunFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(runPath(projectDir), "utf8"));
    if (!isRun(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRun(projectDir: string, run: RunFile): void {
  const previous = readRunFile(projectDir);
  const files = new Set([...(previous?.filesWritten ?? []), ...run.filesWritten]);
  const next: RunFile = { ...run, filesWritten: [...files].sort().slice(0, FILE_CAP) };
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
  for (const part of chunk.split(/\r?\n/)) {
    const clean = publicText(part);
    if (clean === "") continue;
    lines.push(clean.slice(0, LINE_CHARS));
  }
  if (lines.length > LINE_CAP) lines.splice(0, lines.length - LINE_CAP);
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
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!entry.isFile()) continue;
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
