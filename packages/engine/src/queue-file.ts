/**
 * Drive queue on disk: `.hitchhiker/queue.json`.
 *
 * The served drive dashboard loads this file on each request. Saving and
 * loading take the state lock and do not start a model session or the
 * drive runner.
 *
 * Two saves serialize on the engine state lock (`withStateLock`, file
 * `STATE.md.lock`). A second writer is refused while the first still holds
 * that lock. The body is written with `replaceViaTemp`: a temp file in the
 * same directory, then a rename over the target, so a reader does not see
 * a half-written queue.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "./lock.ts";

export type QueueStatus =
  | "queued"
  | "running"
  | "passed"
  | "fixing"
  | "escalated"
  | "paused";

export interface QueueFile {
  items: Array<{ id: string; kind: "build" | "review"; status: QueueStatus }>;
}

export class QueueFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueFileError";
  }
}

const ID_PATTERN = /^[a-z0-9-]+$/;

/** Key shapes that still fit the id charset, plus secret words. */
const SECRET_PATTERN =
  /(?:^|-)(?:sk|pk|rk|xai)-[a-z0-9-]{8,}|(?:secret|apikey|api-key|password|bearer|access-token)/;

type QueueItem = QueueFile["items"][number];

function queuePath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "queue.json");
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function looksLikeSecret(value: string): boolean {
  return SECRET_PATTERN.test(value.toLowerCase());
}

function assertId(id: unknown): string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new QueueFileError("Id must match /^[a-z0-9-]+$/.");
  }
  if (looksLikeSecret(id)) {
    throw new QueueFileError("Id looks like a secret.");
  }
  return id;
}

function isStatus(value: unknown): value is QueueStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "passed" ||
    value === "fixing" ||
    value === "escalated" ||
    value === "paused"
  );
}

function assertItem(value: unknown, seen: Set<string>): QueueItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new QueueFileError("Queue item must be an object.");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "id" && key !== "kind" && key !== "status") {
      throw new QueueFileError("Queue item has an unknown field.");
    }
  }
  const id = assertId(record.id);
  if (seen.has(id)) {
    throw new QueueFileError("Duplicate queue id.");
  }
  seen.add(id);
  const kind = record.kind;
  if (kind !== "build" && kind !== "review") {
    throw new QueueFileError("Queue kind must be build or review.");
  }
  if (!isStatus(record.status)) {
    throw new QueueFileError("Queue status is not a known value.");
  }
  return { id, kind, status: record.status };
}

function assertQueue(value: unknown): QueueFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new QueueFileError("Queue file must be an object.");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "items") {
      throw new QueueFileError("Queue file has an unknown field.");
    }
  }
  if (!Array.isArray(record.items)) {
    throw new QueueFileError("Queue file needs an items array.");
  }
  const seen = new Set<string>();
  const items: QueueItem[] = [];
  for (const item of record.items) {
    items.push(assertItem(item, seen));
  }
  return { items };
}

function renderQueue(queue: QueueFile): string {
  return `${JSON.stringify(queue, null, 2)}\n`;
}

function parseQueue(raw: string): QueueFile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new QueueFileError("queue.json is not valid JSON.");
  }
  return assertQueue(value);
}

function assertProjectDir(projectDir: string): void {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    throw new QueueFileError("Project directory is missing.");
  }
}

/**
 * Write the queue under `STATE.md.lock`. An empty items array is valid:
 * the drive has not been planned yet.
 */
export async function saveQueue(projectDir: string, queue: QueueFile): Promise<void> {
  assertProjectDir(projectDir);
  const clean = assertQueue(queue);
  await withStateLock(projectDir, async () => {
    await replaceViaTemp(queuePath(projectDir), renderQueue(clean));
  });
}

/** Read the queue. A missing file returns null. Corrupt JSON throws and is left in place. */
export async function loadQueue(projectDir: string): Promise<QueueFile | null> {
  assertProjectDir(projectDir);
  return withStateLock(projectDir, async () => {
    const filePath = queuePath(projectDir);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") return null;
      throw error;
    }
    return parseQueue(raw);
  });
}

/**
 * Flip every running item to paused. Passed, fixing, queued, paused, and
 * escalated rows stay, including their order. An escalated row is not
 * rewritten to queued, and nothing is removed.
 */
export function pauseQueue(queue: QueueFile): QueueFile {
  const clean = assertQueue(queue);
  return {
    items: clean.items.map((item) =>
      item.status === "running" ? { ...item, status: "paused" } : { ...item },
    ),
  };
}
