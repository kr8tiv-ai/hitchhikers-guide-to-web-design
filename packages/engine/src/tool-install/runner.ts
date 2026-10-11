/**
 * Run a confirmed plan one step at a time.
 * shell is off. Admin and sudo never start. Cancel kills the process tree
 * and deletes partial downloads.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readdirSync, type Dirent } from "node:fs";
import { chmod, copyFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { hiddenChildOptions } from "../hidden-child.ts";
import { diskSpaceMessage, downloadVerifiedFile, freeBytesAt, InstallCancelled } from "./download.ts";
import type { InstallEvent, InstallPlan, PlanStep, RunResult } from "./types.ts";
import { launchSpec } from "./win-spawn.ts";

const ELEVATION = new Set(["sudo", "su", "runas", "gsudo", "pkexec", "doas"]);

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
  /** Test seam. Omitted, the check reads the filesystem. */
  freeBytes?: (dir: string) => Promise<number>;
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
  const download = options.download ?? ((step, downloadCtx) => downloadStep(step, downloadCtx, options));
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
        await ensureSpace(step, options);
        await runSpawn(step, options, spawnImpl, children);
        installPath = await placeBinary(step);
      } else {
        await ensureSpace(step, options);
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
  const child = startChild(command, args, extra, spawnImpl);
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
  if (step.id === "grok-npm" && spawnImpl === spawn) {
    return { installPath: npmGlobalBin() };
  }
  return { installPath: null };
}

function startChild(
  command: string,
  args: readonly string[],
  extra: { stdio: ["ignore", "pipe", "pipe"]; detached: boolean; cwd?: string },
  spawnImpl: typeof spawn,
): ChildProcess {
  if (spawnImpl !== spawn) return spawnImpl(command, [...args], hiddenChildOptions(extra));
  const spec = launchSpec(command, args, process.env, process.platform);
  return spawn(spec.file, spec.args, hiddenChildOptions({ ...extra, windowsVerbatimArguments: spec.verbatim }));
}

async function downloadStep(step: PlanStep, ctx: DownloadContext, options: ExecuteOptions): Promise<void> {
  if (step.url === null || step.dest === null || step.sha256 === null) {
    throw new Error("The download step is missing a source, destination, or checksum.");
  }
  const partial = `${step.dest}.partial`;
  ctx.track(partial);
  try {
    await downloadVerifiedFile(step.url, step.dest, {
      signal: ctx.signal,
      expectedSha256: step.sha256,
      expectedBytes: step.bytes,
      ...(options.freeBytes !== undefined ? { freeBytes: options.freeBytes } : {}),
      onProgress(received, total) {
        ctx.emit({ type: "download", text: "", received, total });
      },
    });
  } finally {
    ctx.untrack(partial);
  }
}

async function ensureSpace(step: PlanStep, options: ExecuteOptions): Promise<void> {
  const need = step.spaceBytes ?? null;
  if (need === null || need <= 0) return;
  const dir = step.cwd !== undefined && step.cwd.length > 0 ? step.cwd : process.cwd();
  let free = 0;
  try {
    free = options.freeBytes !== undefined ? await options.freeBytes(dir) : await freeBytesAt(dir);
  } catch {
    return;
  }
  if (free < need) throw new Error(diskSpaceMessage(need, free));
}

function npmGlobalBin(): string | null {
  const spec = launchSpec("npm", ["prefix", "-g"], process.env, process.platform);
  const result = spawnSync(spec.file, spec.args, hiddenChildOptions({
    encoding: "utf8",
    windowsVerbatimArguments: spec.verbatim,
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  const line = result.stdout.trim().split(/\r?\n/).pop()?.trim() ?? "";
  if (line.length === 0) return null;
  return process.platform === "win32" ? line : path.join(line, "bin");
}

async function placeBinary(step: PlanStep): Promise<string | null> {
  if (step.dest === null || step.placeAs === undefined) return step.placeAs ?? null;
  const found = findWhisperBinary(step.dest);
  if (found === null) {
    throw new Error(`The archive did not contain whisper-cli. Looked in ${step.dest}.`);
  }
  const home = path.dirname(found);
  const binaryName = process.platform === "win32" ? "whisper.exe" : "whisper";
  const placed = path.join(home, binaryName);
  if (path.resolve(found) !== path.resolve(placed)) {
    await copyFile(found, placed);
    if (process.platform !== "win32") {
      const info = await stat(found);
      await chmod(placed, info.mode | 0o755);
    }
  }
  const aliasName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const alias = path.join(home, aliasName);
  if (path.resolve(found) !== path.resolve(alias) && path.resolve(placed) !== path.resolve(alias)) {
    await copyFile(found, alias);
    if (process.platform !== "win32") {
      const info = await stat(found);
      await chmod(alias, info.mode | 0o755);
    }
  }
  return placed;
}

const WHISPER_BINARY_RANK = ["whisper-cli.exe", "whisper-cli", "whisper.exe", "whisper", "main.exe", "main"];

function findWhisperBinary(root: string): string | null {
  const found = new Map<string, string>();
  const seen: string[] = [];
  const stack = [root];
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
        const key = entry.name.toLowerCase();
        if (!found.has(key) && WHISPER_BINARY_RANK.includes(key)) found.set(key, full);
      }
    }
  }
  for (const name of WHISPER_BINARY_RANK) {
    const hit = found.get(name);
    if (hit !== undefined) return hit;
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
