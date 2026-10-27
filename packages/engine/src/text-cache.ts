/**
 * UTF-8 reads of small project files.
 * Desk routes and Guide turns read the same files several times before a
 * response is sent. The bytes are cached when that is safe.
 *
 * Size and mtime are not enough on their own for arbitrary in-place writes.
 * Node on Windows can report one mtime for two writes a few milliseconds apart.
 * ext3's tick is 1 s and FAT's last-write tick is 2 s. A same-size rewrite
 * inside that tick changes neither field, so a cache keyed only on them serves
 * stale text. Unprimed entries are trusted only when their mtime is more than
 * 2 s older than the moment they were read and cached: that tick has closed,
 * and a later write has to move mtime.
 *
 * Engine state files written through atomic temp-file replacement or engine
 * session writers prime the cache at write time via primeUtf8Cache(). Because
 * every engine mutation replaces or re-primes the entry, a primed entry whose
 * inode, ctime, mtime, and size still match statSync is safe to serve inside
 * the 2 s window without re-reading disk on every turn step.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const MAX_CACHED = 1_500_000;
/** FAT's last-write tick. Trust an unprimed entry only when its mtime is strictly older. */
const RACY_WINDOW_NS = 2_000_000_000n;

interface Entry {
  mtimeNs: bigint;
  ctimeNs: bigint;
  ino: bigint;
  size: number;
  text: string;
  readAtNs: bigint;
  primed: boolean;
}

const cache = new Map<string, Entry>();

function normalizeKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function wallNowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function mtimeSettled(mtimeNs: bigint, readAtNs: bigint): boolean {
  return readAtNs - mtimeNs > RACY_WINDOW_NS;
}

/** Prime the cache after an engine write so active-turn reads hit inside the 2 s window. */
export function primeUtf8Cache(filePath: string, text: string): void {
  const key = normalizeKey(filePath);
  try {
    const info = statSync(filePath, { bigint: true });
    const size = Number(info.size);
    if (!info.isFile() || size > MAX_CACHED) {
      cache.delete(key);
      return;
    }
    cache.set(key, {
      mtimeNs: info.mtimeNs,
      ctimeNs: info.ctimeNs,
      ino: info.ino,
      size,
      text,
      readAtNs: wallNowNs(),
      primed: true,
    });
  } catch {
    cache.delete(key);
  }
}

/** Drop a path from the UTF-8 cache. */
export function evictUtf8Cache(filePath: string): void {
  cache.delete(normalizeKey(filePath));
}

/** File text, or null when the path is missing or not a file. */
export function readUtf8Cached(filePath: string, maxBytes?: number): string | null {
  const key = normalizeKey(filePath);
  let mtimeNs = 0n;
  let ctimeNs = 0n;
  let ino = 0n;
  let size = 0;
  try {
    const info = statSync(filePath, { bigint: true });
    if (!info.isFile()) return null;
    mtimeNs = info.mtimeNs;
    ctimeNs = info.ctimeNs;
    ino = info.ino;
    size = Number(info.size);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      cache.delete(key);
      return null;
    }
    throw error;
  }
  if (maxBytes !== undefined && size > maxBytes) {
    return null;
  }
  const nowNs = wallNowNs();
  const hit = cache.get(key);
  if (
    hit !== undefined &&
    hit.mtimeNs === mtimeNs &&
    hit.size === size &&
    (mtimeSettled(hit.mtimeNs, hit.readAtNs) ||
      (hit.primed && hit.ctimeNs === ctimeNs && hit.ino === ino))
  ) {
    return hit.text;
  }
  const text = readFileSync(filePath, "utf8");
  if (size <= MAX_CACHED && mtimeSettled(mtimeNs, nowNs)) {
    cache.set(key, { mtimeNs, ctimeNs, ino, size, text, readAtNs: nowNs, primed: false });
  } else {
    cache.delete(key);
  }
  return text;
}
