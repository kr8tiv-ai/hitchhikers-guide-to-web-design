import { rmSync } from "node:fs";

/** Lock errors that must not fail a test once teardown has retried. */
const LOCK_CODES = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

export interface TempRmOptions {
  recursive: true;
  force: true;
  maxRetries: number;
  retryDelay: number;
}

export type TempRm = (target: string, options: TempRmOptions) => void;

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const nodeRm: TempRm = (target, options) => {
  rmSync(target, options);
};

/**
 * Delete a temp file or directory.
 * Calls fs.rmSync with recursive, force, maxRetries 10, and retryDelay 100.
 * That call retries EPERM, EBUSY, and ENOTEMPTY. EACCES is retried here
 * because fs.rmSync does not. A missing path is fine. If a lock error
 * remains, log one line and return. Any other error is thrown.
 * A stub that throws lock errors is retried here so the loop can be tested.
 */
export function removeTempDir(
  target: string,
  rm: TempRm = nodeRm,
  wait: (ms: number) => void = sleepSync,
): void {
  const options: TempRmOptions = {
    recursive: true,
    force: true,
    maxRetries: MAX_RETRIES,
    retryDelay: RETRY_DELAY_MS,
  };
  const usesNodeRetry = rm === nodeRm;
  for (let attempt = 0; ; attempt += 1) {
    try {
      rm(target, options);
      return;
    } catch (error: unknown) {
      const code = errnoCode(error);
      if (code === "ENOENT") return;
      if (code === undefined || !LOCK_CODES.has(code)) throw error;
      const nodeAlreadyRetried = usesNodeRetry && code !== "EACCES";
      if (nodeAlreadyRetried || attempt >= MAX_RETRIES) {
        console.error(`removeTempDir: giving up on ${target} (${code})`);
        return;
      }
      wait(RETRY_DELAY_MS);
    }
  }
}
