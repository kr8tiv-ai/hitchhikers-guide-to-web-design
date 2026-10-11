/**
 * HTTPS download for an install step.
 * Redirects are bounded. Every hop is checked against the source the URL
 * started on. http is rejected. Userinfo is stripped before the next request.
 * A dropped connection resumes with Range when the server accepts it,
 * otherwise the partial file is rewritten. Cancel deletes the partial file.
 */

import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { sha256File } from "./checksum.ts";
import { assertRecipeUrl, assertRedirectUrl, insecureHopMessage } from "./hosts.ts";
import { formatMegabytes } from "./plan.ts";

const MAX_REDIRECTS = 5;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [400, 800, 1600];

export class InstallCancelled extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "InstallCancelled";
  }
}

export interface DownloadRequester {
  (target: URL, headers: Record<string, string>, signal: AbortSignal): Promise<IncomingMessage>;
}

export interface VerifiedDownload {
  sha256: string;
  bytes: number;
  finalHost: string;
  hops: readonly string[];
}

export interface DownloadOptions {
  signal: AbortSignal;
  expectedSha256?: string | null;
  expectedBytes?: number | null;
  onProgress?: (received: number, total: number | null) => void;
  request?: DownloadRequester;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
  freeBytes?: (dir: string) => Promise<number>;
}

export async function freeBytesAt(dir: string): Promise<number> {
  const { statfs } = await import("node:fs/promises");
  const stats = await statfs(dir);
  return Number(stats.bavail) * Number(stats.bsize);
}

export function diskSpaceMessage(need: number, free: number): string {
  return `This disk does not have enough free space for the download (need ${formatMegabytes(need)}, ${formatMegabytes(free)} free). Free some space and try again. Nothing was installed.`;
}

export function offlineMessage(): string {
  return "The download could not reach the server, so we stopped. Nothing was installed. Check the connection and try again, or install by hand with the steps below.";
}

export function checksumMessage(expected: string, actual: string): string {
  return `The download did not match the checksum we expected, so we deleted it. Nothing was installed. Try again, or install by hand with the steps below. SHA-256 mismatch. Expected ${expected}. Actual ${actual}.`;
}

export function sizeMessage(actual: number, expected: number): string {
  return `The download was the wrong size (got ${actual} bytes, expected ${expected}), so we deleted it. Nothing was installed. Try again, or install by hand with the steps below.`;
}

/**
 * Download `url` to `dest`. The partial file is `${dest}.partial`.
 * A mismatch or a cancel removes the partial file and `dest`.
 */
export async function downloadVerifiedFile(
  url: string,
  dest: string,
  options: DownloadOptions,
): Promise<VerifiedDownload> {
  assertRecipeUrl(url);
  const partial = `${dest}.partial`;
  await mkdir(path.dirname(dest), { recursive: true });
  const expectedBytes = options.expectedBytes ?? null;
  if (expectedBytes !== null && expectedBytes > 0) {
    const free = options.freeBytes !== undefined
      ? await options.freeBytes(path.dirname(dest))
      : await freeBytesAt(path.dirname(dest));
    if (free < expectedBytes) {
      await rm(partial, { force: true });
      throw new Error(diskSpaceMessage(expectedBytes, free));
    }
  }
  const request = options.request ?? defaultRequest;
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown = null;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (options.signal.aborted) throw new InstallCancelled();
      try {
        const fetched = await fetchBody(url, partial, options, request);
        const info = await stat(partial);
        if (expectedBytes !== null && info.size !== expectedBytes) {
          throw new Error(sizeMessage(info.size, expectedBytes));
        }
        const sha256 = await sha256File(partial);
        const expected = options.expectedSha256 ?? null;
        if (expected !== null && sha256.toLowerCase() !== expected.toLowerCase()) {
          throw new Error(checksumMessage(expected, sha256));
        }
        await rm(dest, { force: true });
        await rename(partial, dest);
        return { sha256, bytes: info.size, finalHost: fetched.finalHost, hops: fetched.hops };
      } catch (error: unknown) {
        if (error instanceof InstallCancelled || options.signal.aborted) throw new InstallCancelled();
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) throw asPlain(error);
        await delay(BACKOFF_MS[attempt] ?? 1600, options.signal);
      }
    }
  } catch (error: unknown) {
    await rm(partial, { force: true });
    if (error instanceof Error && (error.message.includes("SHA-256") || error.message.includes("wrong size"))) {
      await rm(dest, { force: true });
    }
    if (error instanceof InstallCancelled || options.signal.aborted) throw new InstallCancelled();
    throw error;
  }
  await rm(partial, { force: true });
  throw asPlain(lastError ?? new Error(offlineMessage()));
}

async function fetchBody(
  url: string,
  partial: string,
  options: DownloadOptions,
  request: DownloadRequester,
): Promise<{ finalHost: string; hops: string[] }> {
  let offset = await partialSize(partial);
  const expected = options.expectedBytes ?? null;
  if (expected !== null && offset > expected) {
    await rm(partial, { force: true });
    offset = 0;
  }
  if (expected !== null && offset === expected && offset > 0) {
    options.onProgress?.(offset, expected);
    return { finalHost: new URL(url).hostname, hops: [new URL(url).hostname] };
  }
  const followed = await follow(url, offset, options.signal, request);
  const status = followed.response.statusCode ?? 0;
  if (status === 416) {
    followed.response.resume();
    await rm(partial, { force: true });
    const again = await follow(url, 0, options.signal, request);
    await writeResponse(again.response, partial, false, 0, options);
    return { finalHost: again.finalHost, hops: again.hops };
  }
  if (status < 200 || status >= 300) {
    followed.response.resume();
    throw new Error(`Download failed with HTTP ${status} from ${followed.finalHost}.`);
  }
  const append = status === 206 && offset > 0;
  const start = append ? offset : 0;
  if (!append && offset > 0) {
    await rm(partial, { force: true });
  }
  await writeResponse(followed.response, partial, append, start, options);
  return { finalHost: followed.finalHost, hops: followed.hops };
}

interface Followed {
  response: IncomingMessage;
  finalHost: string;
  hops: string[];
}

async function follow(
  url: string,
  offset: number,
  signal: AbortSignal,
  request: DownloadRequester,
): Promise<Followed> {
  let current = stripUserinfo(new URL(url));
  const hops: string[] = [];
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (signal.aborted) throw new InstallCancelled();
    if (current.protocol !== "https:") throw new Error(insecureHopMessage());
    current = stripUserinfo(current);
    if (hop === 0) assertRecipeUrl(current.href);
    else assertRedirectUrl(current.href, url);
    hops.push(current.hostname.toLowerCase());
    const headers: Record<string, string> = { "user-agent": "hitchhiker-tool-install" };
    if (offset > 0) headers.range = `bytes=${offset}-`;
    const response = await request(current, headers, signal);
    const status = response.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.resume();
      if (typeof location !== "string" || location.length === 0) {
        throw new Error(`Download redirect from ${current.hostname} had no location.`);
      }
      const next = stripUserinfo(new URL(location, current));
      if (next.protocol !== "https:") throw new Error(insecureHopMessage());
      current = next;
      continue;
    }
    return { response, finalHost: current.hostname.toLowerCase(), hops };
  }
  throw new Error("Download followed too many redirects.");
}

function writeResponse(
  response: IncomingMessage,
  partial: string,
  append: boolean,
  start: number,
  options: DownloadOptions,
): Promise<void> {
  const total = totalBytes(response, options.expectedBytes ?? null);
  const stream = createWriteStream(partial, { flags: append ? "a" : "w" });
  let received = start;
  return new Promise((resolve, reject) => {
    let onAbort: () => void = () => {};
    const fail = (error: Error): void => {
      options.signal.removeEventListener("abort", onAbort);
      response.destroy();
      stream.destroy();
      reject(error);
    };
    onAbort = (): void => {
      fail(new InstallCancelled());
    };
    if (options.signal.aborted) {
      fail(new InstallCancelled());
      return;
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
    response.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      received += buf.length;
      if (!stream.write(buf)) response.pause();
      options.onProgress?.(received, total);
    });
    stream.on("drain", () => {
      response.resume();
    });
    response.on("error", fail);
    stream.on("error", fail);
    response.on("end", () => {
      options.signal.removeEventListener("abort", onAbort);
      stream.end(() => {
        resolve();
      });
    });
  });
}

function totalBytes(response: IncomingMessage, expected: number | null): number | null {
  if (expected !== null && expected > 0) return expected;
  const range = response.headers["content-range"];
  if (typeof range === "string") {
    const match = /\/(\d+)\s*$/.exec(range);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  const length = response.headers["content-length"];
  if (typeof length === "string" && /^\d+$/.test(length)) return Number(length);
  return null;
}

function stripUserinfo(target: URL): URL {
  if (target.username === "" && target.password === "") return target;
  const clean = new URL(target.href);
  clean.username = "";
  clean.password = "";
  return clean;
}

async function partialSize(file: string): Promise<number> {
  try {
    const info = await stat(file);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

function defaultRequest(target: URL, headers: Record<string, string>, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(target, { method: "GET", headers }, resolve);
    const onAbort = (): void => {
      req.destroy(new InstallCancelled());
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    req.on("close", () => {
      signal.removeEventListener("abort", onAbort);
    });
    req.end();
  });
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = (): void => {
      if (timer !== null) clearTimeout(timer);
      reject(new InstallCancelled());
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryable(error: unknown): boolean {
  if (error instanceof InstallCancelled) return false;
  if (!(error instanceof Error)) return false;
  if (error.message.includes("do not recognize")) return false;
  if (error.message.includes("insecure http")) return false;
  if (error.message.includes("SHA-256 mismatch")) return false;
  if (error.message.includes("wrong size")) return false;
  if (error.message.includes("free space")) return false;
  if (error.message.includes("too many redirects")) return false;
  if (error.message.includes("rejected path")) return false;
  if (error.message.includes("userinfo")) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EAI_AGAIN" || code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EPIPE" || code === "ENETUNREACH") {
    return true;
  }
  if (/HTTP (408|429|500|502|503|504) /.test(error.message)) return true;
  if (/socket hang up|network|timed out/i.test(error.message)) return true;
  return false;
}

function asPlain(error: unknown): Error {
  if (error instanceof InstallCancelled) return error;
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "EAI_AGAIN" || code === "ENETUNREACH" || code === "ETIMEDOUT") {
      return new Error(offlineMessage());
    }
    if (error.message.includes("do not recognize") || error.message.includes("insecure http") || error.message.includes("SHA-256") || error.message.includes("wrong size") || error.message.includes("free space")) {
      return error;
    }
    return error;
  }
  return new Error(offlineMessage());
}
