/**
 * Map dropped files back onto slots. A file whose name matches a slot id
 * wins. Anything left is assigned in order. Copies land under the DIY
 * import folder, then ASSETS.md gains a diy row with a zero cost.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  type AssetSlot,
  assertSlotId,
  diyDir,
  rowFromSlot,
  updateAssetRows,
} from "./slots.ts";

export async function importDiyFiles(
  projectDir: string,
  slots: readonly AssetSlot[],
  dropped: readonly string[],
): Promise<AssetSlot[]> {
  if (slots.length === 0) throw new Error("Import needs at least one slot.");
  const pairs = matchFiles(slots, dropped);
  for (const pair of pairs) await assertFile(pair.dropped);
  const next = slots.map((slot) => cloneSlot(slot));
  const updated = new Set<string>();
  for (const pair of pairs) {
    const slot = next.find((item) => item.id === pair.slotId);
    if (slot === undefined) continue;
    const target = await copyIn(projectDir, slot.id, pair.dropped);
    slot.file = target;
    slot.source = "diy";
    slot.costUsd = 0;
    slot.approved = false;
    slot.status = "done";
    updated.add(slot.id);
  }
  const rows = next.filter((slot) => updated.has(slot.id)).map((slot) => rowFromSlot(slot, projectDir));
  if (rows.length > 0) await updateAssetRows(projectDir, rows);
  return next;
}

function matchFiles(
  slots: readonly AssetSlot[],
  dropped: readonly string[],
): Array<{ slotId: string; dropped: string }> {
  const usedSlots = new Set<string>();
  const usedFiles = new Set<number>();
  const pairs: Array<{ slotId: string; dropped: string }> = [];

  for (let index = 0; index < dropped.length; index += 1) {
    const file = dropped[index];
    if (file === undefined) continue;
    const name = path.basename(file, path.extname(file)).toLowerCase();
    const slot = slots.find((item) => !usedSlots.has(item.id) && item.id.toLowerCase() === name);
    if (slot === undefined) continue;
    usedSlots.add(slot.id);
    usedFiles.add(index);
    pairs.push({ slotId: slot.id, dropped: file });
  }

  const openSlots = slots.filter((slot) => !usedSlots.has(slot.id));
  const openFiles = dropped.filter((_, index) => !usedFiles.has(index));
  const count = Math.min(openSlots.length, openFiles.length);
  for (let index = 0; index < count; index += 1) {
    const slot = openSlots[index];
    const file = openFiles[index];
    if (slot === undefined || file === undefined) continue;
    pairs.push({ slotId: slot.id, dropped: file });
  }
  return pairs;
}

async function copyIn(projectDir: string, slotId: string, dropped: string): Promise<string> {
  const id = assertSlotId(slotId);
  const ext = path.extname(dropped);
  const safeExt = /^\.[A-Za-z0-9]+$/.test(ext) ? ext.toLowerCase() : "";
  const target = path.join(diyDir(projectDir), "imported", `${id}${safeExt}`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(dropped, target);
  return target;
}

async function assertFile(file: string): Promise<void> {
  let info;
  try {
    info = await stat(file);
  } catch {
    throw new Error(`Import could not read ${path.basename(file)}.`);
  }
  if (!info.isFile()) throw new Error(`Import expects a file, and ${path.basename(file)} is not one.`);
}

function cloneSlot(slot: AssetSlot): AssetSlot {
  return structuredClone(slot);
}
