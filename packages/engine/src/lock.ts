import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export interface LockInfo {
  pid: number;
  acquiredAt: string;
}

export class LockHeld extends Error {
  readonly pid: number;

  constructor(pid: number) {
    super(`Lock held by pid ${pid}.`);
    this.name = "LockHeld";
    this.pid = pid;
  }
}

/**
 * Pid-reuse floor: a dead lock younger than 30s stays put so a slow crash cannot be stolen mid-write.
 */
export const STALE_LOCK_MS = 30_000;

export const STATE_LOCK_NAME = "STATE.md.lock";

/** Pre-v2 filename. Not the lock we take. */
const LEGACY_STATE_LOCK_NAME = "state.lock";

type Clock = () => number;

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function isPidAlive(pid: number): boolean {
  // pid 0 and negative pids address a process group. Never signal them.
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // ESRCH means dead on Windows and POSIX. EPERM means the process is alive.
    return errorCode(error) !== "ESRCH";
  }
}

function parseLock(raw: string): LockInfo | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { pid, acquiredAt } = record;
  if (typeof pid !== "number" || !Number.isInteger(pid)) return null;
  if (typeof acquiredAt !== "string" || acquiredAt.length === 0) return null;
  return { pid, acquiredAt };
}

type ReadLock =
  | { status: "ok"; info: LockInfo }
  | { status: "missing" }
  | { status: "corrupt" };

async function readLock(lockPath: string): Promise<ReadLock> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return { status: "missing" };
    throw error;
  }
  const info = parseLock(raw);
  if (info === null) return { status: "corrupt" };
  return { status: "ok", info };
}

async function createLock(lockPath: string, info: LockInfo): Promise<void> {
  const handle = await open(lockPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(info)}\n`, "utf8");
  } catch (error) {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
}

async function removeLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error: unknown) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

type StaleDecision =
  | { action: "steal" }
  | { action: "retry" }
  | { action: "held"; pid: number };

async function classify(lockPath: string, now: Clock): Promise<StaleDecision> {
  const read = await readLock(lockPath);
  if (read.status === "missing") return { action: "retry" };
  if (read.status === "corrupt") return { action: "held", pid: 0 };
  if (isPidAlive(read.info.pid)) return { action: "held", pid: read.info.pid };
  const acquiredMs = Date.parse(read.info.acquiredAt);
  const age = now() - acquiredMs;
  if (Number.isFinite(acquiredMs) && age > STALE_LOCK_MS) {
    return { action: "steal" };
  }
  return { action: "held", pid: read.info.pid };
}

async function heldError(lockPath: string): Promise<LockHeld> {
  const read = await readLock(lockPath);
  const pid = read.status === "ok" ? read.info.pid : 0;
  return new LockHeld(pid);
}

async function attempt(
  lockPath: string,
  now: Clock,
  retried: boolean,
): Promise<LockInfo> {
  const info: LockInfo = {
    pid: process.pid,
    acquiredAt: new Date(now()).toISOString(),
  };
  try {
    await createLock(lockPath, info);
    return info;
  } catch (error: unknown) {
    if (errorCode(error) !== "EEXIST") throw error;
    if (retried) throw await heldError(lockPath);
    const decision = await classify(lockPath, now);
    if (decision.action === "held") throw new LockHeld(decision.pid);
    if (decision.action === "steal") await removeLock(lockPath);
    return attempt(lockPath, now, true);
  }
}

/**
 * A project from before the v2 name may still have `state.lock` beside
 * `STATE.md.lock`. A live pid refuses the write. A dead pid is removed
 * with no 30s floor: that file is not the lock we take. A file we cannot
 * parse has no live pid, so it is removed too.
 */
async function settleLegacyStateLock(dir: string): Promise<void> {
  const legacyPath = path.join(dir, LEGACY_STATE_LOCK_NAME);
  const read = await readLock(legacyPath);
  if (read.status === "missing") return;
  if (read.status === "ok" && isPidAlive(read.info.pid)) {
    throw new LockHeld(read.info.pid);
  }
  await removeLock(legacyPath);
}

/**
 * Exclusive-create `lockPath`. A dead holder is stolen once, and only when
 * `acquiredAt` is older than {@link STALE_LOCK_MS}. `now` defaults to Date.now.
 * Acquiring `STATE.md.lock` settles a sibling `state.lock` first.
 */
export async function acquire(
  lockPath: string,
  now: Clock = Date.now,
): Promise<LockInfo> {
  if (path.basename(lockPath) === STATE_LOCK_NAME) {
    await settleLegacyStateLock(path.dirname(lockPath));
  }
  return attempt(lockPath, now, false);
}

/** Delete `lockPath` only when the recorded pid is still `pid`. */
export async function release(lockPath: string, pid: number): Promise<void> {
  const read = await readLock(lockPath);
  if (read.status !== "ok" || read.info.pid !== pid) return;
  await removeLock(lockPath);
}

/**
 * Hold `.hitchhiker/STATE.md.lock` around `fn`. The directory is created first.
 * The lock is released when `fn` returns or throws, and only if the pid still matches.
 */
export async function withStateLock<T>(
  projectDir: string,
  fn: () => Promise<T> | T,
  now: Clock = Date.now,
): Promise<T> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const lockPath = path.join(dir, STATE_LOCK_NAME);
  const info = await acquire(lockPath, now);
  try {
    return await fn();
  } finally {
    await release(lockPath, info.pid);
  }
}

export interface ReplaceOptions {
  /** Runs after the temp file is flushed and before the rename. */
  beforeRename?: () => Promise<void>;
}

/**
 * Write `body` to a temp file in the same directory, flush it, then rename it over `targetPath`.
 * The temp file stays in place until the rename, including when the target already exists.
 * `sync` pushes the bytes to disk before the rename so a kill mid-write leaves the previous file.
 */
export async function replaceViaTemp(
  targetPath: string,
  body: string,
  options?: ReplaceOptions,
): Promise<void> {
  const tempPath = path.join(
    path.dirname(targetPath),
    `${path.basename(targetPath)}.tmp-${process.pid}`,
  );
  const handle = await open(tempPath, "w");
  try {
    await handle.writeFile(body, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  if (options?.beforeRename !== undefined) await options.beforeRename();
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}
