/**
 * One place for atomic renames.
 * Windows refuses rename while a reader, indexer, or scanner still has the
 * destination open (EPERM, EACCES, EBUSY). Callers close their own handle,
 * then come here. Retries stay in this file.
 */
import { open, rename as renameFile, unlink } from "node:fs/promises";
import path from "node:path";
import { evictUtf8Cache, primeUtf8Cache } from "./text-cache.ts";

const stagedTemps = new Map<string, string>();

/** Five tries. The gaps below sum to 600ms, under a one second budget. */
export const RENAME_ATTEMPTS = 5;

export const RENAME_BACKOFF_MS = [40, 80, 160, 320] as const;

const RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

const tails = new Map<string, Promise<void>>();

export interface RenameReplacingOptions {
  rename?: (from: string, to: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

function fileKey(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Queue `fn` behind any in-flight write to the same target.
 * A second writer waits instead of sharing one temp path or renaming over a file
 * this process still has open.
 */
export async function withExclusiveFile<T>(targetPath: string, fn: () => Promise<T>): Promise<T> {
  const key = fileKey(targetPath);
  const previous = tails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(
    () => gate,
    () => gate,
  );
  tails.set(key, tail);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/**
 * Write `body`, flush it, and close the handle before the caller renames.
 * A throw removes the temp so the next writer does not rename a partial file.
 */
export async function writeClosedTemp(tempPath: string, body: string): Promise<void> {
  const handle = await open(tempPath, "w");
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  stagedTemps.set(fileKey(tempPath), body);
}

/**
 * Rename `from` onto `to`. EPERM, EACCES, and EBUSY retry with backoff.
 * Any other error fails on the first attempt. The temp file is left for the caller.
 */
export async function renameReplacing(
  from: string,
  to: string,
  options?: RenameReplacingOptions,
): Promise<void> {
  const rename = options?.rename ?? renameFile;
  const sleep = options?.sleep ?? delay;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(from, to);
      const staged = stagedTemps.get(fileKey(from));
      stagedTemps.delete(fileKey(from));
      if (!options?.rename) {
        if (staged !== undefined) primeUtf8Cache(to, staged);
        else evictUtf8Cache(to);
      }
      return;
    } catch (error: unknown) {
      const code = errnoCode(error);
      if (code === undefined || !RETRY_CODES.has(code) || attempt === RENAME_ATTEMPTS - 1) throw error;
      const wait = RENAME_BACKOFF_MS[attempt] ?? RENAME_BACKOFF_MS[RENAME_BACKOFF_MS.length - 1] ?? 0;
      await sleep(wait);
    }
  }
}
