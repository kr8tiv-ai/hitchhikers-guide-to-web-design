/**
 * Screenshots of a reference home page and up to two inner pages.
 * 1440 wide, above the fold and the full page. Tests pass openPage.
 * Playwright loads only inside openReferenceBrowser.
 */

import { allowed } from "./robots.ts";
import { USER_AGENT, type Viewport } from "./crawl.ts";

export const REFERENCE_VIEWPORT = { width: 1440, height: 900 } as const;
export const REFERENCE_CAPTURE_TIMEOUT_MS = 8_000;
export const MAX_INNER_PAGES = 2;

const SKIP_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif|css|js|mjs|pdf|zip|mp4|woff2?|ico|xml|json)$/i;

export interface ReferenceShotBuffer {
  kind: "fold" | "full";
  pageUrl: string;
  bytes: Uint8Array;
}

export interface ReferenceShotPage {
  goto?(url: string): Promise<void>;
  content(): Promise<string>;
  screenshot(options?: { fullPage?: boolean }): Promise<Uint8Array>;
  close?(): Promise<void>;
}

export interface ReferenceBrowser {
  openPage(viewport: Viewport): Promise<ReferenceShotPage>;
  close(): Promise<void>;
}

export interface ReferenceShotDeps {
  openPage: (viewport: Viewport) => Promise<ReferenceShotPage>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function innerPageUrls(homeUrl: string, html: string, limit = MAX_INNER_PAGES): string[] {
  let home: URL;
  try {
    home = new URL(homeUrl);
  } catch {
    return [];
  }
  if (home.protocol !== "http:" && home.protocol !== "https:") return [];
  const homePath = normalizePath(home);
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (raw === "" || raw.startsWith("#") || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) continue;
    let next: URL;
    try {
      next = new URL(raw, home);
    } catch {
      continue;
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") continue;
    if (next.username.length > 0 || next.password.length > 0) continue;
    if (next.host !== home.host) continue;
    if (SKIP_EXT.test(next.pathname)) continue;
    const pathName = normalizePath(next);
    if (pathName === homePath) continue;
    next.hash = "";
    const href = next.href;
    if (seen.has(href)) continue;
    seen.add(href);
    found.push(href);
    if (found.length >= limit) break;
  }
  return found;
}

/**
 * Home page, then up to two same-site inner pages. Each page is an above-the-fold
 * shot and a full-page shot. A denied robots.txt throws. No search.
 */
export async function captureReferenceSite(url: string, deps: ReferenceShotDeps): Promise<ReferenceShotBuffer[]> {
  const target = parseHttpUrl(url);
  const timeoutMs = finiteTimeout(deps.timeoutMs);
  throwIfAborted(deps.signal);
  if (deps.fetchImpl !== undefined) {
    const body = await robotsBody(target, deps.fetchImpl, deps.signal, timeoutMs);
    if (!allowed(target.href, body, USER_AGENT)) {
      throw new Error(`robots.txt disallows ${target.href}`);
    }
  }
  const shots: ReferenceShotBuffer[] = [];
  const home = await shootPage(deps, target.href, timeoutMs);
  shots.push(...home.shots);
  for (const inner of innerPageUrls(target.href, home.html)) {
    throwIfAborted(deps.signal);
    const page = await shootPage(deps, inner, timeoutMs);
    shots.push(...page.shots);
  }
  return shots;
}

/** Headless Chromium at 1440. Unit tests do not call this. */
export async function openReferenceBrowser(): Promise<ReferenceBrowser> {
  const specifier: string = "playwright";
  let loaded: unknown;
  try {
    loaded = await import(specifier);
  } catch (cause) {
    throw new Error("playwright is not installed. Pass openPage to captureReferenceSite.", { cause });
  }
  if (!isPlaywright(loaded)) throw new Error("playwright did not export chromium.launch");
  const browser = await loaded.chromium.launch({ headless: true });
  return {
    async openPage(viewport: Viewport): Promise<ReferenceShotPage> {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      return {
        content: () => page.content(),
        screenshot: async (options) => {
          const shot = await page.screenshot({ type: "png", fullPage: options?.fullPage === true });
          return Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
        },
        goto: async (next: string) => {
          await page.goto(next, { waitUntil: "load", timeout: REFERENCE_CAPTURE_TIMEOUT_MS });
        },
        close: async () => {
          await page.close();
          await context.close();
        },
      };
    },
    close: () => browser.close(),
  };
}

function parseHttpUrl(input: string): URL {
  let target: URL;
  try {
    target = new URL(input);
  } catch (cause) {
    throw new Error("URL constructor rejected the input", { cause });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Only http and https URLs can be captured");
  }
  if (target.username.length > 0 || target.password.length > 0) {
    throw new Error("URLs with user info are refused");
  }
  return target;
}

function normalizePath(url: URL): string {
  const pathName = url.pathname.replace(/\/+$/, "");
  return pathName === "" ? "/" : pathName;
}

function finiteTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return REFERENCE_CAPTURE_TIMEOUT_MS;
  return Math.min(value, 30_000);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("Reference capture timed out.");
}

async function robotsBody(
  target: URL,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<string> {
  const robots = new URL("/robots.txt", target.origin);
  const init: RequestInit = {
    method: "GET",
    headers: { "user-agent": USER_AGENT },
    redirect: "manual",
  };
  if (signal !== undefined) init.signal = signal;
  const response = await withTimeout(fetchImpl(robots.href, init), timeoutMs, signal);
  if (response.status === 404) {
    await discard(response);
    return "";
  }
  if (response.status !== 200) {
    await discard(response);
    throw new Error(`robots.txt for ${target.origin} returned ${response.status}`);
  }
  return withTimeout(response.text(), timeoutMs, signal);
}

async function shootPage(
  deps: ReferenceShotDeps,
  pageUrl: string,
  timeoutMs: number,
): Promise<{ html: string; shots: ReferenceShotBuffer[] }> {
  throwIfAborted(deps.signal);
  const page = await withTimeout(deps.openPage(REFERENCE_VIEWPORT), timeoutMs, deps.signal);
  try {
    if (page.goto !== undefined) await withTimeout(page.goto(pageUrl), timeoutMs, deps.signal);
    const html = await withTimeout(page.content(), timeoutMs, deps.signal);
    const fold = await withTimeout(page.screenshot({ fullPage: false }), timeoutMs, deps.signal);
    const full = await withTimeout(page.screenshot({ fullPage: true }), timeoutMs, deps.signal);
    return {
      html,
      shots: [
        { kind: "fold", pageUrl, bytes: toBytes(fold) },
        { kind: "full", pageUrl, bytes: toBytes(full) },
      ],
    };
  } finally {
    if (page.close !== undefined) await page.close().catch(() => undefined);
  }
}

function toBytes(value: Uint8Array): Uint8Array {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, signal: AbortSignal | undefined): Promise<T> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Reference capture timed out.")), timeoutMs);
  });
  const racers: Array<Promise<T>> = [work, timeout];
  if (signal !== undefined) {
    racers.push(
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("Reference capture timed out."));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    );
  }
  try {
    return await Promise.race(racers);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal !== undefined && onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

async function discard(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // The body may already be consumed.
  }
}

interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: "load"; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  screenshot(options?: { type?: "png"; fullPage?: boolean }): Promise<Uint8Array>;
  close(): Promise<void>;
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}

interface PlaywrightBrowser {
  newContext(options: { userAgent: string; viewport: { width: number; height: number } }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
}

function isPlaywright(value: unknown): value is PlaywrightModule {
  if (typeof value !== "object" || value === null) return false;
  const chromium: unknown = Reflect.get(value, "chromium");
  if (typeof chromium !== "object" || chromium === null) return false;
  return typeof Reflect.get(chromium, "launch") === "function";
}
