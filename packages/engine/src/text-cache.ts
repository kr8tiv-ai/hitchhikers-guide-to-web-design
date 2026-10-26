/**
 * UTF-8 reads of small project files.
 * Desk routes and Guide turns read the same files several times before a
 * response is sent. The bytes are cached when that is safe.
 *
 * Size and mtime are not enough on their own. Node on Windows can report one
 * mtime for two writes a few milliseconds apart. ext3's tick is 1 s and FAT's
 * last-write tick is 2 s. A same-size rewrite inside that tick changes neither
 * field, so a cache keyed only on them serves stale text. An entry is trusted
 * only when its mtime is more than 2 s older than the moment it was read and
 * cached: that tick has closed, and a later write has to move mtime. A newer
 * mtime is racy. The call reads the file again and does not keep an entry
 * until the mtime is old enough. An unchanged file older than the window still
 * hits the cache. A missing path is dropped. A file over the size limit is
 * not cached.
 */

import { readFileSync, statSync } from "node:fs";

const MAX_CACHED = 1_500_000;
/** FAT's last-write tick. Trust an entry only when its mtime is strictly older. */
const RACY_WINDOW_NS = 2_000_000_000n;

interface Entry {
  mtimeNs: bigint;
  size: number;
  text: string;
  readAtNs: bigint;
}

const cache = new Map<string, Entry>();

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function wallNowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function mtimeSettled(mtimeNs: bigint, readAtNs: bigint): boolean {
  return readAtNs - mtimeNs > RACY_WINDOW_NS;
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
  const nowNs = wallNowNs();
  const hit = cache.get(filePath);
  if (hit !== undefined && hit.mtimeNs === mtimeNs && hit.size === size && mtimeSettled(hit.mtimeNs, hit.readAtNs)) {
    return hit.text;
  }
  const text = readFileSync(filePath, "utf8");
  if (size <= MAX_CACHED && mtimeSettled(mtimeNs, nowNs)) {
    cache.set(filePath, { mtimeNs, size, text, readAtNs: nowNs });
  } else cache.delete(filePath);
  return text;
}
