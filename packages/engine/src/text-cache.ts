/**
 * UTF-8 reads reused until size or mtime changes.
 * Desk routes and Guide turns read the same small project files several times
 * before a response is sent. The bytes are cached. A write that changes the
 * file is visible on the next read.
 */

import { readFileSync, statSync } from "node:fs";

const MAX_CACHED = 1_500_000;

interface Entry {
  mtimeNs: bigint;
  size: number;
  text: string;
}

const cache = new Map<string, Entry>();

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

/** File text, or null when the path is missing or not a file. */
export function readUtf8Cached(filePath: string): string | null {
  let mtimeNs = 0n;
  let size = 0;
  try {
    const info = statSync(filePath, { bigint: true });
    if (!info.isFile()) return null;
    mtimeNs = info.mtimeNs;
    size = Number(info.size);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      cache.delete(filePath);
      return null;
    }
    throw error;
  }
  const hit = cache.get(filePath);
  if (hit !== undefined && hit.mtimeNs === mtimeNs && hit.size === size) return hit.text;
  const text = readFileSync(filePath, "utf8");
  if (size <= MAX_CACHED) cache.set(filePath, { mtimeNs, size, text });
  else cache.delete(filePath);
  return text;
}
