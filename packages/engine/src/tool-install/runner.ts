/**
 * Run a confirmed plan one step at a time.
 * shell is off. Admin and sudo never start. Cancel kills the process tree
 * and deletes partial downloads.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, readdirSync, type Dirent } from "node:fs";
import { chmod, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { finished } from "node:stream/promises";
import { hiddenChildOptions } from "../hidden-child.ts";
import { assertRecipeUrl, assertRedirectUrl } from "./hosts.ts";
import type { InstallEvent, InstallPlan, PlanStep, RunResult } from "./types.ts";

const ELEVATION = new Set(["sudo", "su", "runas", "gsudo", "pkexec", "doas"]);
const MAX_REDIRECTS = 5;

export interface DownloadContext {
  signal: AbortSignal;
  emit: (event: InstallEvent) => void;
  track: (file: string) => void;
  untrack: (file: string) => void;
}

export interface ExecuteOptions {
  signal: AbortSignal;
  emit: (event: InstallEvent) => void;
  download?: (step: PlanStep, ctx: DownloadContext) => Promise<void>;
  spawnImpl?: typeof spawn;
}

class InstallCancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "InstallCancelled";
  }
}

export function stepIsBlocked(argv: readonly string[]): string | null {
  const command = (argv[0] ?? "").toLowerCase();
  if (ELEVATION.has(command)) return "The desk does not run admin or sudo steps.";
  const joined = argv.join(" ");
  if (joined.includes("|") || joined.includes("\n") || joined.includes("\r")) {
    return "The desk does not run a piped command.";
  }
  const lower = argv.map((part) => part.toLowerCase());
  const pipesRemote =
    (lower.includes("curl") && (lower.includes("bash") || lower.includes("sh"))) ||
    lower[0] === "irm" ||
    lower.includes("iex") ||
    (lower[0] === "powershell" && lower.some((part) => part === "iex" || part.includes("invoke-expression"))) ||
    (lower[0] === "pwsh" && lower.some((part) => part === "iex" || part.includes("invoke-expression")));
  if (pipesRemote) return "The desk does not pipe a remote script into a shell.";
  return null;
}

export async function executePlan(plan: InstallPlan, options: ExecuteOptions): Promise<RunResult> {
  const base: RunResult = {
    status: "failed",
    error: null,
    installPath: null,
    versionLine: null,
    manualCommand: plan.manualCommand,
    modelPath: null,
  };
  if (!plan.canRun || plan.runSteps.length === 0) {
    return { ...base, error: "Nothing runs from the desk." };
  }
  for (const step of plan.runSteps) {
    if (step.needsElevation) {
      throw new Error("The desk does not run admin or sudo steps.");
    }
    const blocked = stepIsBlocked(step.argv);
    if (blocked !== null && step.kind !== "download") throw new Error(blocked);
  }
  const tracked = new Set<string>();
  const children = new Set<ChildProcess>();
  const ctx: DownloadContext = {
    signal: options.signal,
    emit: options.emit,
    track(file) {
      tracked.add(file);
    },
    untrack(file) {
      tracked.delete(file);
    },
  };
  const download = options.download ?? downloadStep;
  const spawnImpl = options.spawnImpl ?? spawn;
  let installPath: string | null = null;
  let modelPath: string | null = null;
  try {
    for (const step of plan.runSteps) {
      if (options.signal.aborted) throw new InstallCancelled();
      options.emit({ type: "step", text: step.label, received: null, total: null });
      if (step.kind === "download") {
        await download(step, ctx);
        if (step.id === "whisper-model" && step.dest !== null) modelPath = step.dest;
      } else if (step.kind === "extract") {
        await runSpawn(step, options, spawnImpl, children);
        installPath = await placeBinary(step);
      } else {
        const outcome = await runSpawn(step, options, spawnImpl, children);
        if (installPath === null) installPath = outcome.installPath;
      }
    }
    return {
      status: "ok",
      error: null,
      installPath,
      versionLine: null,
      manualCommand: plan.manualCommand,
      modelPath,
    };
  } catch (error: unknown) {
    await removeTracked(tracked);
    if (error instanceof InstallCancelled || options.signal.aborted) {
      return { ...base, status: "cancelled", error: "Cancelled.", installPath, modelPath };
    }
    const message = error instanceof Error ? error.message : "The install failed.";
    return { ...base, error: message, installPath, modelPath };
  }
}

export function killProcessTree(pid: number | undefined): void {
  if (pid === undefined || pid <= 0) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], hiddenChildOptions({ stdio: "ignore" as const }));
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The child already exited.
    }
  }
}

async function runSpawn(
  step: PlanStep,
  options: ExecuteOptions,
  spawnImpl: typeof spawn,
  children: Set<ChildProcess>,
): Promise<{ installPath: string | null }> {
  const blocked = stepIsBlocked(step.argv);
  if (blocked !== null) throw new Error(blocked);
  const command = step.argv[0];
  const args = step.argv.slice(1);
  if (command === undefined || command.length === 0) throw new Error("A step had an empty command.");
  const extra: {
    stdio: ["ignore", "pipe", "pipe"];
    detached: boolean;
    cwd?: string;
  } = {
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  };
  if (step.cwd !== undefined && step.cwd.length > 0) extra.cwd = step.cwd;
  const child = spawnImpl(command, [...args], hiddenChildOptions(extra));
  children.add(child);
  let stderr = "";
  const stdoutChunks: string[] = [];
  child.stdout?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    stdoutChunks.push(text);
    options.emit({ type: "stdout", text, received: null, total: null });
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    stderr += text;
    options.emit({ type: "stderr", text, received: null, total: null });
  });
  const onAbort = (): void => {
    killProcessTree(child.pid);
  };
  if (options.signal.aborted) onAbort();
  else options.signal.addEventListener("abort", onAbort, { once: true });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`The command could not start: ${command}`));
        return;
      }
      reject(error);
    });
    child.once("close", (exitCode) => {
      resolve(exitCode);
    });
  }).finally(() => {
    options.signal.removeEventListener("abort", onAbort);
    children.delete(child);
  });
  if (options.signal.aborted) throw new InstallCancelled();
  if (code !== 0) {
    throw new Error(`exit ${code ?? "null"}: ${tail(stderr)}`);
  }
  return { installPath: null };
}

async function downloadStep(step: PlanStep, ctx: DownloadContext): Promise<void> {
  if (step.url === null || step.dest === null || step.sha256 === null) {
    throw new Error("The download step is missing a source, destination, or checksum.");
  }
  assertRecipeUrl(step.url);
  const partial = `${step.dest}.partial`;
  await mkdir(path.dirname(step.dest), { recursive: true });
  const opened = createWriteStream(partial, { flags: "w" });
  opened.end();
  await finished(opened);
  ctx.track(partial);
  let actual = "";
  try {
    actual = await downloadUrl(step.url, partial, ctx.signal, (received, total) => {
      ctx.emit({ type: "download", text: "", received, total });
    });
  } catch (error: unknown) {
    await rm(partial, { force: true });
    ctx.untrack(partial);
    throw error;
  }
  if (actual.toLowerCase() !== step.sha256.toLowerCase()) {
    await rm(partial, { force: true });
    await rm(step.dest, { force: true });
    ctx.untrack(partial);
    throw new Error(`SHA-256 mismatch. Expected ${step.sha256}. Actual ${actual}.`);
  }
  await rename(partial, step.dest);
  ctx.untrack(partial);
}

async function downloadUrl(
  url: string,
  partial: string,
  signal: AbortSignal,
  onProgress: (received: number, total: number | null) => void,
): Promise<string> {
  let current = new URL(url);
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (signal.aborted) throw new InstallCancelled();
    if (hop === 0) assertRecipeUrl(current.href);
    else assertRedirectUrl(current.href);
    const response = await requestOnce(current, signal);
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.resume();
      if (typeof location !== "string" || location.length === 0) {
        throw new Error(`Download redirect from ${current.hostname} had no location.`);
      }
      current = new URL(location, current);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`Download failed with HTTP ${status} from ${current.hostname}.`);
    }
    const lengthHeader = response.headers["content-length"];
    const total = typeof lengthHeader === "string" && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    return await writeBody(response, partial, signal, total, onProgress);
  }
  throw new Error("Download followed too many redirects.");
}

function requestOnce(target: URL, signal: AbortSignal): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(target, { method: "GET", headers: { "user-agent": "hitchhiker-tool-install" } }, resolve);
    const onAbort = (): void => {
      req.destroy(new InstallCancelled());
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    req.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    req.on("close", () => {
      signal.removeEventListener("abort", onAbort);
    });
    req.end();
  });
}

function writeBody(
  response: import("node:http").IncomingMessage,
  partial: string,
  signal: AbortSignal,
  total: number | null,
  onProgress: (received: number, total: number | null) => void,
): Promise<string> {
  const hash = createHash("sha256");
  const stream = createWriteStream(partial, { flags: "w" });
  let received = 0;
  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      response.destroy();
      stream.destroy();
      reject(error);
    };
    const onAbort = (): void => {
      fail(new InstallCancelled());
    };
    if (signal.aborted) {
      fail(new InstallCancelled());
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    response.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      hash.update(buf);
      received += buf.length;
      if (!stream.write(buf)) response.pause();
      onProgress(received, total);
    });
    stream.on("drain", () => {
      response.resume();
    });
    response.on("error", fail);
    stream.on("error", fail);
    response.on("end", () => {
      signal.removeEventListener("abort", onAbort);
      stream.end(() => {
        resolve(hash.digest("hex"));
      });
    });
  });
}

async function placeBinary(step: PlanStep): Promise<string | null> {
  if (step.dest === null || step.placeAs === undefined) return step.placeAs ?? null;
  const found = findWhisperBinary(step.dest);
  if (found === null) {
    throw new Error(`The archive did not contain whisper-cli. Looked in ${step.dest}.`);
  }
  if (path.resolve(found) !== path.resolve(step.placeAs)) {
    await copyFile(found, step.placeAs);
    if (process.platform !== "win32") {
      const info = await stat(found);
      await chmod(step.placeAs, info.mode | 0o755);
    }
  }
  return step.placeAs;
}

function findWhisperBinary(root: string): string | null {
  const names = new Set(["whisper-cli", "whisper-cli.exe", "main", "main.exe"]);
  const stack = [root];
  const seen: string[] = [];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        seen.push(entry.name);
        if (names.has(entry.name)) return full;
      }
    }
  }
  if (seen.length > 0) {
    throw new Error(`The archive did not contain whisper-cli. Found: ${seen.slice(0, 12).join(", ")}.`);
  }
  return null;
}

async function removeTracked(tracked: Set<string>): Promise<void> {
  for (const file of tracked) {
    await rm(file, { force: true });
  }
  tracked.clear();
}

function tail(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const last = lines.slice(-12).join("\n");
  if (last.length === 0) return "the command wrote nothing to stderr";
  return last.length > 1500 ? last.slice(-1500) : last;
}
