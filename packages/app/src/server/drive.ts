/**
 * Drive dashboard reads `.hitchhiker/queue.json` and pauses rows on disk.
 * It does not launch a model session or the drive runner.
 */

import { access } from "node:fs/promises";
import path from "node:path";
import {
  QueueFileError,
  loadQueue,
  pauseQueue,
  saveQueue,
  type QueueFile,
} from "@hitchhiker/engine";
import { DashboardError, renderDashboard, renderQueueReadError } from "../dashboard.ts";

const DRIVE_SCRIPT = "/client/drive.js";

export type DriveResult =
  | { kind: "html"; status: number; html: string }
  | { kind: "json"; status: number; body: QueueFile | { error: string } };

export async function readDashboard(projectDir: string, token: string): Promise<DriveResult> {
  try {
    const queue = await loadQueue(projectDir);
    return {
      kind: "html",
      status: 200,
      html: renderDashboard(queue ?? { items: [] }, { token, scriptUrl: DRIVE_SCRIPT }),
    };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { kind: "html", status: 500, html: renderQueueReadError(message, { token }) };
  }
}

export async function readDriveJson(projectDir: string): Promise<DriveResult> {
  try {
    const queue = await loadQueue(projectDir);
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
    const queue = await loadQueue(projectDir);
    if (queue === null) {
      return { kind: "json", status: 409, body: { error: "No queue file is on disk." } };
    }
    const paused = pauseQueue(queue);
    await saveQueue(projectDir, paused);
    return { kind: "json", status: 200, body: paused };
  } catch (error: unknown) {
    const message = readError(error);
    if (message === null) throw error;
    return { kind: "json", status: 500, body: { error: message } };
  }
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
