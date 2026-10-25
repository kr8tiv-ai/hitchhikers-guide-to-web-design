/**
 * Drive dashboard reads `.hitchhiker/queue.json` and pauses rows on disk.
 * Pause does not launch a model session. Retry and resume continue the
 * site build through the engine runner. A queue-wide pause is the `pause`
 * object on queue.json. Item rows stay beside it.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import {
  LockHeld,
  QueueFileError,
  designLibraryArtDirection,
  loadQueue,
  pauseQueue,
  readBuildRun,
  reconcileSiteBuild,
  resumePausedQueue,
  resumeSiteBuild,
  retrySiteBuild,
  saveQueue,
  type QueueFile,
} from "@hitchhiker/engine";
import { DashboardError, renderDashboard, renderQueueReadError } from "../dashboard.ts";
import type { DriveRun } from "../drive-markup.ts";

const DRIVE_SCRIPT = "/client/drive.js";

export type DriveResult =
  | { kind: "html"; status: number; html: string }
  | { kind: "json"; status: number; body: QueueFile | { error: string } };

export async function readDashboard(projectDir: string, token: string): Promise<DriveResult> {
  try {
    await reconcileSiteBuild(projectDir);
    const queue = await loadQueueRetry(projectDir);
    const run = driveRun(readBuildRun(projectDir));
    return {
      kind: "html",
      status: 200,
      html: renderDashboard(queue ?? { items: [] }, {
        token,
        scriptUrl: DRIVE_SCRIPT,
        run,
        pause: queue?.pause ?? null,
        artDirection: designLibraryArtDirection(projectDir),
      }),
    };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { kind: "html", status: 500, html: renderQueueReadError(message, { token }) };
  }
}

export async function readDriveProgress(projectDir: string): Promise<{ status: number; body: { run: DriveRun | null } | { error: string } }> {
  try {
    await reconcileSiteBuild(projectDir);
    return { status: 200, body: { run: driveRun(readBuildRun(projectDir)) } };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { status: 500, body: { error: message } };
  }
}

export async function retryDrive(projectDir: string, promptId: string): Promise<DriveResult> {
  return continueDrive(projectDir, promptId, "retry");
}

export async function resumeDrive(projectDir: string, promptId: string): Promise<DriveResult> {
  return continueDrive(projectDir, promptId, "resume");
}

/** Explicit Resume. Clears the queue-wide pause and starts the next prompt. */
export async function resumeQueueDrive(projectDir: string): Promise<DriveResult> {
  try {
    await resumePausedQueue(projectDir);
    const queue = await loadQueueRetry(projectDir);
    return { kind: "json", status: 200, body: queue ?? { items: [] } };
  } catch (error: unknown) {
    const message = readError(error) ?? (error instanceof Error ? safeDriveError(error.message) : null);
    return { kind: "json", status: 400, body: { error: message ?? "The queue is not paused." } };
  }
}

async function continueDrive(projectDir: string, promptId: string, action: "retry" | "resume"): Promise<DriveResult> {
  try {
    if (action === "retry") await retrySiteBuild(projectDir, promptId);
    else await resumeSiteBuild(projectDir, promptId);
    const queue = await loadQueueRetry(projectDir);
    return { kind: "json", status: 200, body: queue ?? { items: [] } };
  } catch (error: unknown) {
    const message = readError(error) ?? (error instanceof Error ? safeDriveError(error.message) : null);
    return { kind: "json", status: 400, body: { error: message ?? "That prompt is not waiting." } };
  }
}

function driveRun(run: ReturnType<typeof readBuildRun>): DriveRun | null {
  if (run === null) return null;
  const view: DriveRun = {
    promptId: run.promptId,
    status: run.status,
    model: run.model,
    effort: run.effort,
    elapsedMs: run.elapsedMs,
    lastLines: run.lastLines,
    filesWritten: run.filesWritten,
    reason: run.reason,
    recovery: run.recovery,
    paused: run.paused === true,
    escalation: run.escalation ?? "",
  };
  if (run.turnLimited) view.turnLimited = true;
  if (run.stopReason !== "") view.stopReason = run.stopReason;
  view.live = pidAlive(run.pid);
  return view;
}

function pidAlive(pid: number | null): boolean {
  if (pid === null || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : "";
    return code === "EPERM";
  }
}

function safeDriveError(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed === "" || trimmed.length > 200 || /[<>&!]/.test(trimmed) || trimmed.includes("\n")) return null;
  return trimmed;
}

export async function readDriveJson(projectDir: string): Promise<DriveResult> {
  try {
    const queue = await loadQueueRetry(projectDir);
    return { kind: "json", status: 200, body: queue ?? { items: [] } };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { kind: "json", status: 500, body: { error: message } };
  }
}

/**
 * Pause requires a queue file already on disk. A missing file is 409 and
 * this function does not create one. Callers check the CSRF token first.
 */
export async function pauseDrive(projectDir: string): Promise<DriveResult> {
  if ((await queuePresence(projectDir)) === "missing") {
    return { kind: "json", status: 409, body: { error: "No queue file is on disk." } };
  }
  try {
    const queue = await loadQueueRetry(projectDir);
    if (queue === null) {
      return { kind: "json", status: 409, body: { error: "No queue file is on disk." } };
    }
    const paused = pauseQueue(queue);
    await saveQueueRetry(projectDir, paused);
    return { kind: "json", status: 200, body: paused };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { kind: "json", status: 500, body: { error: message } };
  }
}

async function loadQueueRetry(projectDir: string): Promise<QueueFile | null> {
  return retryLock(() => loadQueue(projectDir));
}

async function saveQueueRetry(projectDir: string, queue: QueueFile): Promise<void> {
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

function readError(error: unknown): string | null {
  if (error instanceof QueueFileError || error instanceof DashboardError) return error.message;
  return null;
}

async function queuePresence(projectDir: string): Promise<"missing" | "present"> {
  try {
    await access(path.join(projectDir, ".hitchhiker", "queue.json"));
    return "present";
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return "missing";
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
