/**
 * Drive queue on disk, re-exported from `@hitchhiker/engine`.
 *
 * The implementation lives in the engine so the desk can load
 * `.hitchhiker/queue.json` without depending on this package.
 * This file does not start a model session or the drive runner.
 *
 * `enqueueElevatePicks` appends accepted Elevate prompts as build rows.
 * An empty list does not create a queue and does not change one that
 * is already there. Nothing here commits.
 */
import {
  QueueFileError as QueueReadError,
  loadQueue as readQueue,
  saveQueue as writeQueue,
  type QueueFile as QueueBody,
} from "@hitchhiker/engine";

export {
  QueueFileError,
  loadQueue,
  pauseQueue,
  resumeQueue,
  saveQueue,
  type QueueFile,
  type QueuePause,
  type QueueStatus,
} from "@hitchhiker/engine";

/**
 * Append one queued build row per accepted Elevate pick.
 * An empty list returns without writing.
 */
export async function enqueueElevatePicks(
  projectDir: string,
  picks: readonly { id: string }[],
): Promise<{ enqueued: number }> {
  if (!Array.isArray(picks)) {
    throw new QueueReadError("Elevate picks must be a list.");
  }
  if (picks.length === 0) return { enqueued: 0 };

  const existing = await readQueue(projectDir);
  const items = existing === null ? [] : existing.items.map((item) => ({ ...item }));
  for (const pick of picks) {
    const id = typeof pick === "object" && pick !== null ? pick.id : "";
    items.push({ id, kind: "build", status: "queued" });
  }
  const next: QueueBody = existing?.pause === undefined ? { items } : { items, pause: existing.pause };
  await writeQueue(projectDir, next);
  return { enqueued: picks.length };
}
