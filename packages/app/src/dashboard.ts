/**
 * Local drive desk for /hh-dashboard.
 *
 * Reads a queue object and returns HTML. It does not fetch, read disk,
 * or open a model session. Pause is one control for the whole drive.
 * Cost is a subscription count. Imagine prices stay in the Imagine client.
 * The served page may pass a CSRF token and a local script URL.
 */

import { formatCost } from "@hitchhiker/engine";
import {
  DRIVE_MAX_ROWS,
  costText,
  isDriveKind,
  isDriveStatus,
  renderDriveDocument,
  renderDriveReadError,
  type DriveItem,
  type DriveKind,
  type DrivePageOptions,
} from "./drive-markup.ts";

export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardError";
  }
}

export type { DrivePageOptions };

const SCRIPT_URL = /^\/client\/[a-z0-9.-]+\.js$/;

function assertId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new DashboardError("Id is empty.");
  }
  if (/[\u0000\r\n]/.test(id)) {
    throw new DashboardError("Id must be a single line.");
  }
  return id;
}

function assertKind(kind: unknown): DriveKind {
  if (typeof kind === "string" && isDriveKind(kind)) return kind;
  throw new DashboardError("Queue kind must be build or review.");
}

function assertItem(value: unknown): DriveItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardError("Queue item must be an object.");
  }
  const record = value as { id?: unknown; kind?: unknown; status?: unknown };
  const id = assertId(record.id);
  const kind = assertKind(record.kind);
  if (typeof record.status !== "string" || !isDriveStatus(record.status)) {
    throw new DashboardError("Unknown dashboard status.");
  }
  return { id, kind, status: record.status };
}

function assertQueue(queue: { items: Array<{ id: string; kind: string; status: string }> }): DriveItem[] {
  if (typeof queue !== "object" || queue === null || !Array.isArray(queue.items)) {
    throw new DashboardError("Queue needs an items array.");
  }
  if (queue.items.length > DRIVE_MAX_ROWS) {
    throw new DashboardError("Dashboard refuses more than 200 rows.");
  }
  const items: DriveItem[] = [];
  for (const item of queue.items) {
    items.push(assertItem(item));
  }
  return items;
}

function checkOptions(options: DrivePageOptions | undefined): void {
  const url = options?.scriptUrl;
  if (url === undefined) return;
  if (!SCRIPT_URL.test(url)) {
    throw new DashboardError("Script URL must be a local client path.");
  }
}

/** A prompt has run once it leaves the queue. An empty queue has no total to ratio. */
function costLine(items: readonly DriveItem[]): string {
  const local = costText(items);
  if (items.length === 0) return local;
  const promptsRun = items.filter((item) => item.status !== "queued").length;
  const formatted = formatCost({
    mode: "subscription",
    promptsRun,
    promptsTotal: items.length,
  });
  if (formatted !== local) {
    throw new DashboardError("Cost line does not match the subscription count.");
  }
  return formatted;
}

function safeMessage(message: string): string {
  const trimmed = message.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 200 ||
    /[<>&!]/.test(trimmed) ||
    trimmed.includes("\n") ||
    trimmed.includes("\r")
  ) {
    return "The queue file could not be read.";
  }
  return trimmed;
}

export function renderDashboard(
  queue: { items: Array<{ id: string; kind: string; status: string }> },
  options?: DrivePageOptions,
): string {
  checkOptions(options);
  const items = assertQueue(queue);
  return renderDriveDocument(items, costLine(items), options);
}

export function renderQueueReadError(message: string, options?: DrivePageOptions): string {
  checkOptions(options);
  const page: DrivePageOptions = {};
  if (options?.token !== undefined) page.token = options.token;
  return renderDriveReadError(safeMessage(message), page);
}
