/**
 * Record one finished drive prompt in the queue and in `.hitchhiker/STATE.md`.
 *
 * Both project files are replaced inside one `withStateLock` callback. That
 * lock is not reentrant, and `saveState` takes it, so the heading document is
 * rendered by `saveState` in a scratch directory and then written here. The
 * scratch file is removed before `advance` returns. There is no second status
 * file.
 *
 * A queue with any item whose status is `paused` is paused. `advance` throws
 * and writes nothing. Resume the drive before advancing.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadState,
  replaceViaTemp,
  saveState,
  withStateLock,
  type GuideState,
} from "@hitchhiker/engine";
import type { QueueFile, QueueStatus } from "./queue-file.ts";

export class ProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgressError";
  }
}

const SHA = /^[0-9a-f]{7,40}$/;
const IDLE = "Drive idle";
const ID_PATTERN = /^[a-z0-9-]+$/;

const SECRET_PATTERN =
  /(?:^|-)(?:sk|pk|rk|xai)-[a-z0-9-]{8,}|(?:secret|apikey|api-key|password|bearer|access-token)/;

type Outcome = "passed" | "escalated";

interface AdvanceInput {
  projectDir: string;
  finishedId: string;
  outcome: Outcome;
  commit: string | null;
}

export async function advance(input: AdvanceInput): Promise<{ nextId: string | null }> {
  assertInput(input);
  return withStateLock(input.projectDir, async () => {
    const queue = await readQueue(input.projectDir);
    const updatedAt = new Date().toISOString();
    const applied = applyAdvance(queue, loadState(input.projectDir), input, updatedAt);
    const markdown = await renderStateMarkdown(applied.state);
    await replaceViaTemp(queuePath(input.projectDir), renderQueue(applied.items));
    await replaceViaTemp(statePath(input.projectDir), markdown);
    return { nextId: applied.nextId };
  });
}

function assertInput(input: AdvanceInput): void {
  if (typeof input.projectDir !== "string" || input.projectDir.length === 0) {
    throw new ProgressError("Project directory is missing.");
  }
  if (typeof input.finishedId !== "string" || input.finishedId.length === 0) {
    throw new ProgressError("Finished id is missing.");
  }
  if (input.outcome !== "passed" && input.outcome !== "escalated") {
    throw new ProgressError("Outcome must be passed or escalated.");
  }
  if (input.commit !== null && (typeof input.commit !== "string" || !SHA.test(input.commit))) {
    throw new ProgressError("Commit sha must match /^[0-9a-f]{7,40}$/ or be null.");
  }
}

function applyAdvance(
  queue: QueueFile,
  existing: GuideState | null,
  input: AdvanceInput,
  updatedAt: string,
): { items: QueueFile["items"]; state: GuideState; nextId: string | null } {
  if (queue.items.some((item) => item.status === "paused")) {
    throw new ProgressError("Queue is paused. Resume the drive before advancing.");
  }
  const index = queue.items.findIndex((item) => item.id === input.finishedId);
  if (index < 0) {
    throw new ProgressError("Unknown queue id.");
  }
  const items = queue.items.map((item, itemIndex) =>
    itemIndex === index
      ? { id: item.id, kind: item.kind, status: input.outcome }
      : { id: item.id, kind: item.kind, status: item.status },
  );
  const next = items.slice(index + 1).find((item) => item.status === "queued");
  const nextId = next === undefined ? null : next.id;
  const base = existing ?? emptyState(input.finishedId, updatedAt);
  const state =
    input.outcome === "escalated"
      ? escalatedState(base, input.finishedId, updatedAt)
      : passedState(base, input, nextId, updatedAt);
  return { items, state, nextId };
}

function emptyState(finishedId: string, updatedAt: string): GuideState {
  return {
    phase: "Improbability Drive",
    slice: "Eddie",
    promptId: finishedId,
    lastGoodCommit: "",
    blockers: [],
    nextAction: finishedId,
    updatedAt,
  };
}

function passedState(
  base: GuideState,
  input: AdvanceInput,
  nextId: string | null,
  updatedAt: string,
): GuideState {
  return {
    phase: base.phase,
    slice: base.slice,
    promptId: base.promptId,
    lastGoodCommit: input.commit === null ? base.lastGoodCommit : input.commit,
    blockers: [...base.blockers],
    nextAction: nextId === null ? IDLE : nextId,
    updatedAt,
  };
}

function escalatedState(base: GuideState, finishedId: string, updatedAt: string): GuideState {
  return {
    phase: base.phase,
    slice: base.slice,
    promptId: base.promptId,
    lastGoodCommit: base.lastGoodCommit,
    blockers: [...base.blockers, finishedId],
    nextAction: base.nextAction,
    updatedAt,
  };
}

function queuePath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "queue.json");
}

function statePath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "STATE.md");
}

function renderQueue(items: QueueFile["items"]): string {
  return `${JSON.stringify({ items }, null, 2)}\n`;
}

/**
 * `saveState` writes the heading document the interview and the map read.
 * Rendering it in a scratch project avoids taking the project lock twice.
 */
async function renderStateMarkdown(state: GuideState): Promise<string> {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "hh-progress-state-"));
  try {
    await saveState(scratch, state);
    return await readFile(path.join(scratch, ".hitchhiker", "STATE.md"), "utf8");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function readQueue(projectDir: string): Promise<QueueFile> {
  let raw: string;
  try {
    raw = await readFile(queuePath(projectDir), "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      throw new ProgressError("Queue file is missing.");
    }
    throw error;
  }
  return parseQueue(raw);
}

function parseQueue(raw: string): QueueFile {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProgressError("queue.json is not valid JSON.");
  }
  if (!isRecord(value)) {
    throw new ProgressError("Queue file must be an object.");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "items" || !Array.isArray(value.items)) {
    throw new ProgressError("Queue file needs an items array.");
  }
  const seen = new Set<string>();
  const items: QueueFile["items"] = [];
  for (const item of value.items) {
    items.push(parseItem(item, seen));
  }
  return { items };
}

function parseItem(value: unknown, seen: Set<string>): QueueFile["items"][number] {
  if (!isRecord(value)) {
    throw new ProgressError("Queue item must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (key !== "id" && key !== "kind" && key !== "status") {
      throw new ProgressError("Queue item has an unknown field.");
    }
  }
  const id = value.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new ProgressError("Id must match /^[a-z0-9-]+$/.");
  }
  if (SECRET_PATTERN.test(id.toLowerCase())) {
    throw new ProgressError("Id looks like a secret.");
  }
  if (seen.has(id)) {
    throw new ProgressError("Duplicate queue id.");
  }
  seen.add(id);
  const kind = value.kind;
  if (kind !== "build" && kind !== "review") {
    throw new ProgressError("Queue kind must be build or review.");
  }
  if (!isStatus(value.status)) {
    throw new ProgressError("Queue status is not a known value.");
  }
  return { id, kind, status: value.status };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
