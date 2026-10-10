/**
 * Debounced save. Bursts share one write. The last call is never dropped.
 * A failure is recorded as a notice and does not reject, so an answer still lands.
 */

import path from "node:path";
import { writeSaveNotice } from "./locate.ts";
import { saveProjectFile, type SaveOptions } from "./save.ts";

const DELAY_MS = 45;

interface Waiter {
  resolve: () => void;
}

interface Slot {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  trailed: boolean;
  waiters: Waiter[];
  options: SaveOptions;
}

const slots = new Map<string, Slot>();

async function run(key: string): Promise<void> {
  const slot = slots.get(key);
  if (slot === undefined) return;
  slot.timer = null;
  slot.running = true;
  const waiters = slot.waiters;
  slot.waiters = [];
  const options = slot.options;
  try {
    await saveProjectFile(key, options);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "The project file did not save.";
    await writeSaveNotice({
      projectDir: key,
      ok: false,
      savedAt: null,
      filePath: null,
      reason,
    }).catch(() => undefined);
  }
  for (const waiter of waiters) waiter.resolve();
  slot.running = false;
  if (slot.trailed || slot.waiters.length > 0) {
    slot.trailed = false;
    await run(key);
    return;
  }
  if (slot.waiters.length === 0 && slot.timer === null) slots.delete(key);
}

/** Schedule a save. Resolves after the write that includes this call, even when that write fails. */
export function autosaveProject(projectDir: string, options: SaveOptions = {}): Promise<void> {
  const key = path.resolve(projectDir);
  return new Promise((resolve) => {
    let slot = slots.get(key);
    if (slot === undefined) {
      slot = { timer: null, running: false, trailed: false, waiters: [], options };
      slots.set(key, slot);
    }
    slot.options = { ...slot.options, ...options };
    slot.waiters.push({ resolve });
    if (slot.running) {
      slot.trailed = true;
      return;
    }
    if (slot.timer !== null) clearTimeout(slot.timer);
    slot.timer = setTimeout(() => {
      void run(key);
    }, DELAY_MS);
  });
}
