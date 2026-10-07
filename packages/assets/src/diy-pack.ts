/**
 * DIY pack. One block per slot, for people who would rather use their own
 * tool than spend on the API. Nothing here calls fetch.
 */

import path from "node:path";
import { type AssetSlot, assertSlotId, diyDir, writeTextAtomic } from "./slots.ts";

export const DIY_SUFFIX = "no text, no letters, no logos, no watermarks, no faces";

export async function writeDiyPack(projectDir: string, slots: readonly AssetSlot[]): Promise<string> {
  if (slots.length === 0) throw new Error("A DIY pack needs at least one slot.");
  const file = path.join(diyDir(projectDir), "PROMPTS.md");
  await writeTextAtomic(file, renderPack(slots));
  return file;
}

function renderPack(slots: readonly AssetSlot[]): string {
  const blocks = slots.map(renderBlock);
  return [
    "# DIY prompts",
    "",
    "Generate each block in your own tool. Nothing on this page calls an API.",
    "Drop the files back and import them. Name a file after the slot id, or drop them in slot order.",
    "",
    blocks.join("\n\n"),
    "",
  ].join("\n");
}

function renderBlock(slot: AssetSlot): string {
  const id = assertSlotId(slot.id);
  const light = slot.light.trim().length > 0 ? slot.light.trim() : "not set";
  const lines = [
    `## ${id}`,
    "",
    `- Aspect: ${oneLine(slot.aspect)}`,
    `- Light: ${oneLine(light)}`,
    `- Kind: ${slot.kind}`,
  ];
  if (slot.kind === "video") {
    lines.push(`- Seconds: ${slot.seconds ?? ""}`);
    lines.push(`- Resolution: ${slot.resolution ?? ""}`);
  }
  lines.push("", withSuffix(slot.prompt));
  return lines.join("\n");
}

function withSuffix(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.toLowerCase().includes(DIY_SUFFIX)) return trimmed;
  return `${trimmed}\n\n${DIY_SUFFIX}`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
