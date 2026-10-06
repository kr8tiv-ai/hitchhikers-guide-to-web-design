import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BadUrlError, MAX_REDIRECTS, RedirectError, RobotsDenied, USER_AGENT } from "./crawl.ts";
import { allowed, ROBOTS_MAX_CHARS } from "./robots.ts";

/**
 * Above-the-fold gallery shots.
 *
 * crawl() in 026 pins the desktop viewport at 1440x900 and also takes a
 * mobile shot. This prompt asks for 1280x800, so the shot uses the 026
 * robots check (allowed, USER_AGENT, RobotsDenied) and createBrowser's
 * page shape, then opens one page at 1280x800. A denied robots.txt never
 * opens the page and never fetches the document.
 */

export const THUMB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const THUMB_VIEWPORT = { width: 1280, height: 800 } as const;

export const ROBOTS_NOTE = "This site asks crawlers to stay out, so the shot is a stand-in.";
export const FAIL_NOTE = "The shot could not be captured, so this is a stand-in.";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * A 2x2 designed tile (ink and brass) encoded as a real WebP.
 * Used only when capture fails. The card CSS is the stand-in the visitor sees.
 */
const PLACEHOLDER_WEBP = Buffer.from(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
  "base64",
);

export interface CrawlLike {
  (url: string): Promise<{ png: Buffer }>;
}

export interface ThumbnailDeps {
  crawl: CrawlLike;
  cacheDir: string;
  now: () => number;
}

export interface ThumbnailResult {
  path: string;
  placeholder: boolean;
  note: string;
}

interface ThumbMeta {
  at: number;
  placeholder: boolean;
  note: string;
}

export interface ThumbnailPage {
  screenshot(): Promise<Buffer>;
  goto?: (url: string) => Promise<void>;
  close?: () => Promise<void>;
}

export interface ThumbnailCrawlDeps {
  fetchImpl: typeof fetch;
  openPage: (viewport: { width: number; height: number }) => Promise<ThumbnailPage>;
}

/** Same cache names as galleryCachePaths in the engine: sha1(url) + .webp. */
export function thumbnailPaths(cacheDir: string, url: string): { image: string; meta: string } {
  const hash = createHash("sha1").update(url).digest("hex");
  return {
    image: path.join(cacheDir, `${hash}.webp`),
    meta: path.join(cacheDir, `${hash}.json`),
  };
}

export function defaultThumbnailCacheDir(): string {
  return path.join(os.homedir(), ".hitchhiker", "cache", "gallery");
}

/**
 * Capture one shot, or return the cached file when it is younger than 30 days.
 * Tests pass crawl and now. A robots denial is cached as a placeholder and
 * is not fetched again until the cache expires.
 */
export async function captureThumbnail(url: string, deps: ThumbnailDeps): Promise<ThumbnailResult> {
  const paths = thumbnailPaths(deps.cacheDir, url);
  await mkdir(deps.cacheDir, { recursive: true });
  const cached = await readFresh(paths.meta, paths.image, deps.now());
  if (cached !== null) {
    return { path: paths.image, placeholder: cached.placeholder, note: cached.note };
  }

  if (!isPublicHttp(url)) {
    return writeResult(paths, deps.now(), true, FAIL_NOTE, PLACEHOLDER_WEBP);
  }

  try {
    const shot = await deps.crawl(url);
    const bytes = Buffer.isBuffer(shot.png) ? shot.png : Buffer.from(shot.png);
    if (bytes.length === 0) {
      return writeResult(paths, deps.now(), true, FAIL_NOTE, PLACEHOLDER_WEBP);
    }
    return writeResult(paths, deps.now(), false, "", bytes);
  } catch (error: unknown) {
    const note = isRobotsDenied(error) ? ROBOTS_NOTE : FAIL_NOTE;
    return writeResult(paths, deps.now(), true, note, PLACEHOLDER_WEBP);
  }
}

/**
 * Robots-respecting shot for a caller that has a browser. Not used by the
 * unit tests' injected crawl. openPage is not called when robots.txt denies.
 */
export async function crawlThumbnail(
  url: string,
  deps: ThumbnailCrawlDeps,
): Promise<{ png: Buffer }> {
  const target = parseHttpUrl(url);
  const robotsUrl = new URL("/robots.txt", target.origin);
  const robots = await fetchRobots(robotsUrl.href, deps.fetchImpl);
  const body = robots.length > ROBOTS_MAX_CHARS ? " ".repeat(ROBOTS_MAX_CHARS + 1) : robots;
  if (!allowed(target.href, body, USER_AGENT)) {
    throw new RobotsDenied(target.href);
  }

  const page = await deps.openPage(THUMB_VIEWPORT);
  try {
    if (page.goto) await page.goto(target.href);
    const shot = await page.screenshot();
    return { png: Buffer.isBuffer(shot) ? shot : Buffer.from(shot) };
  } finally {
    if (page.close) await page.close();
  }
}

async function fetchRobots(start: string, fetchImpl: typeof fetch): Promise<string> {
  let current = start;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        redirect: "manual",
        credentials: "omit",
      });
    } catch (cause) {
      throw new Error(`robots.txt fetch failed for ${current}`, { cause });
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await discard(response);
      if (hops === MAX_REDIRECTS || location === null || location.length === 0) {
        throw new RedirectError(start, hops + 1);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch (cause) {
        throw new BadUrlError("Redirect Location was rejected", { cause });
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new BadUrlError(`Redirect to ${next.protocol} is refused`);
      }
      if (next.username.length > 0 || next.password.length > 0) {
        throw new BadUrlError("Redirect with user info is refused");
      }
      current = next.href;
      continue;
    }

    if (response.status === 404) {
      await discard(response);
      return "";
    }
    if (response.status !== 200) {
      await discard(response);
      throw new Error(`robots.txt returned ${response.status}`);
    }
    const declared = declaredLength(response);
    if (declared > ROBOTS_MAX_CHARS) {
      await discard(response);
      return " ".repeat(ROBOTS_MAX_CHARS + 1);
    }
    return response.text();
  }
  throw new RedirectError(start, MAX_REDIRECTS);
}

function parseHttpUrl(input: string): URL {
  let target: URL;
  try {
    target = new URL(input);
  } catch (cause) {
    throw new BadUrlError("URL constructor rejected the input", { cause });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new BadUrlError("Only http and https URLs can be crawled");
  }
  if (target.username.length > 0 || target.password.length > 0) {
    throw new BadUrlError("URLs with user info are refused");
  }
  return target;
}

function isPublicHttp(input: string): boolean {
  try {
    parseHttpUrl(input);
    return true;
  } catch {
    return false;
  }
}

function isRobotsDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "ROBOTS_DENIED") return true;
  if ("name" in error && (error as { name?: unknown }).name === "RobotsDenied") return true;
  return false;
}

async function readFresh(metaPath: string, imagePath: string, now: number): Promise<ThumbMeta | null> {
  let raw: string;
  try {
    raw = await readFile(metaPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isMeta(parsed) || !fresh(parsed, now)) return null;
  try {
    await readFile(imagePath);
  } catch {
    return null;
  }
  return parsed;
}

function fresh(meta: ThumbMeta, now: number): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(meta.at)) return false;
  const age = now - meta.at;
  if (age < 0) return false;
  return age <= THUMB_MAX_AGE_MS;
}

function isMeta(value: unknown): value is ThumbMeta {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "number" &&
    typeof record.placeholder === "boolean" &&
    typeof record.note === "string"
  );
}

async function writeResult(
  paths: { image: string; meta: string },
  now: number,
  placeholder: boolean,
  note: string,
  bytes: Buffer,
): Promise<ThumbnailResult> {
  const meta: ThumbMeta = { at: now, placeholder, note };
  await writeFile(paths.image, bytes);
  await writeFile(paths.meta, JSON.stringify(meta), "utf8");
  return { path: paths.image, placeholder, note };
}

function declaredLength(response: Response): number {
  const raw = response.headers.get("content-length");
  if (raw === null) return 0;
  const size = Number(raw);
  if (!Number.isFinite(size) || size < 0) return 0;
  return size;
}

async function discard(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // A fake response may not have a cancelable body.
  }
}
