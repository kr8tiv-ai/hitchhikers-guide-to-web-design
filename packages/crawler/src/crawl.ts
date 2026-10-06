import { allowed, ROBOTS_MAX_CHARS } from "./robots.ts";

/** Sent on robots.txt and on the document fetch. Also passed to allowed(). */
export const USER_AGENT = "HitchhikerGuideBot/0.1";

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

/** Excerpt cap. clip() is the only place this limit is applied. */
export const EXCERPT_LIMIT = 4_000;

/** Follow at most this many redirects. A reported count above it throws. */
export const MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * The page surface tests fake. goto and close are optional so a unit fake
 * only has to return a title, HTML, and a screenshot buffer.
 */
export interface FakePage {
  title(): Promise<string>;
  content(): Promise<string>;
  screenshot(): Promise<Buffer>;
  goto?(url: string): Promise<void>;
  close?(): Promise<void>;
}

export interface CrawlDeps {
  fetchImpl: typeof fetch;
  openPage: (viewport: Viewport) => Promise<FakePage>;
}

export interface CrawlResult {
  finalUrl: string;
  title: string;
  description: string;
  h1: string[];
  excerpt: string;
  stackHint: "shopify" | "webflow" | "next" | "unknown";
  screenshots: { desktop: Buffer; mobile: Buffer };
}

export interface BrowserSession {
  openPage(viewport: Viewport): Promise<FakePage>;
  close(): Promise<void>;
}

export class BadUrlError extends Error {
  readonly code = "BAD_URL";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BadUrlError";
  }
}

export class RobotsDenied extends Error {
  readonly code = "ROBOTS_DENIED";
  readonly url: string;

  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDenied";
    this.url = url;
  }
}

export class NetworkError extends Error {
  readonly code = "NETWORK";
  readonly status: number | undefined;

  constructor(message: string, status: number | undefined, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
    this.status = status;
  }
}

export class RedirectError extends Error {
  readonly code = "TOO_MANY_REDIRECTS";
  readonly count: number;

  constructor(url: string, count: number) {
    super(`More than ${MAX_REDIRECTS} redirects for ${url}`);
    this.name = "RedirectError";
    this.count = count;
  }
}

export function clip(text: string, limit = EXCERPT_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit);
}

/**
 * Pure stack hint. Order is shopify, then webflow, then next.
 * No other fingerprints.
 */
export function sniffStack(html: string): CrawlResult["stackHint"] {
  const hay = html.toLowerCase();
  if (hay.includes("cdn.shopify.com")) return "shopify";
  if (hay.includes("webflow")) return "webflow";
  if (hay.includes("/_next/static")) return "next";
  return "unknown";
}

/**
 * One URL in, one result out. robots.txt is checked before any document
 * fetch and before openPage. No cookie jar and no login.
 */
export async function crawl(url: string, deps: CrawlDeps): Promise<CrawlResult> {
  const target = parseHttpUrl(url);
  const robotsBody = await fetchRobotsBody(target, deps.fetchImpl);
  if (!allowed(target.href, robotsBody, USER_AGENT)) {
    throw new RobotsDenied(target.href);
  }

  const document = await fetchDocument(target.href, deps.fetchImpl);
  const desktop = await capture(deps.openPage, DESKTOP_VIEWPORT, document.finalUrl, true);
  const mobile = await capture(deps.openPage, MOBILE_VIEWPORT, document.finalUrl, false);
  const html = desktop.html.length > 0 ? desktop.html : document.html;

  return {
    finalUrl: document.finalUrl,
    title: desktop.title.length > 0 ? desktop.title : extractTitle(html),
    description: extractDescription(html),
    h1: extractH1(html),
    excerpt: clip(visibleText(html)),
    stackHint: sniffStack(html),
    screenshots: { desktop: desktop.shot, mobile: mobile.shot },
  };
}

/**
 * Production browser factory. Dynamic import so unit tests never load or
 * download Playwright. Not called by the test suite.
 */
export async function createBrowser(): Promise<BrowserSession> {
  const specifier: string = "playwright";
  let loaded: unknown;
  try {
    loaded = await import(specifier);
  } catch (cause) {
    throw new Error(
      "playwright is not installed. Pass openPage to crawl(), or install playwright.",
      { cause },
    );
  }
  if (!isPlaywright(loaded)) {
    throw new Error("playwright did not export chromium.launch");
  }
  const browser = await loaded.chromium.launch({ headless: true });
  return {
    async openPage(viewport: Viewport): Promise<FakePage> {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      return {
        title: () => page.title(),
        content: () => page.content(),
        screenshot: async () => {
          const shot = await page.screenshot({ type: "png" });
          return Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
        },
        goto: async (next: string) => {
          await page.goto(next, { waitUntil: "load", timeout: 30_000 });
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

async function fetchRobotsBody(target: URL, fetchImpl: typeof fetch): Promise<string> {
  const robots = new URL("/robots.txt", target.origin);
  const { response } = await request(fetchImpl, robots.href);
  if (response.status === 404) {
    await discard(response);
    return "";
  }
  if (response.status !== 200) {
    await discard(response);
    throw new NetworkError(
      `robots.txt for ${target.origin} returned ${response.status}`,
      response.status,
    );
  }
  if (declaredLength(response) > ROBOTS_MAX_CHARS) {
    await discard(response);
    return " ".repeat(ROBOTS_MAX_CHARS + 1);
  }
  return response.text();
}

async function fetchDocument(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ finalUrl: string; html: string }> {
  const { response, url: landed } = await request(fetchImpl, url);
  if (response.status !== 200) {
    await discard(response);
    throw new NetworkError(`document ${url} returned ${response.status}`, response.status);
  }
  const html = await response.text();
  return { finalUrl: httpFinalUrl(response.url, landed), html };
}

interface Fetched {
  response: Response;
  url: string;
}

async function request(fetchImpl: typeof fetch, start: string): Promise<Fetched> {
  let current = start;
  let hops = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        headers: { "user-agent": USER_AGENT },
        redirect: "manual",
        credentials: "omit",
      });
    } catch (cause) {
      throw new NetworkError(`Fetch failed for ${current}`, undefined, { cause });
    }

    const reported = readRedirectCount(response);
    if (reported !== undefined && reported > MAX_REDIRECTS) {
      await discard(response);
      throw new RedirectError(start, reported);
    }

    if (!REDIRECT_STATUSES.has(response.status)) return { response, url: current };

    hops += 1;
    if (hops > MAX_REDIRECTS) {
      await discard(response);
      throw new RedirectError(start, hops);
    }
    const location = response.headers.get("location");
    await discard(response);
    if (location === null || location.length === 0) {
      throw new NetworkError(`Redirect from ${current} had no Location`, response.status);
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
  }
}

function readRedirectCount(response: Response): number | undefined {
  const value: unknown = Reflect.get(response, "redirectCount");
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function declaredLength(response: Response): number {
  const raw = response.headers.get("content-length");
  if (raw === null) return 0;
  const size = Number(raw);
  if (!Number.isFinite(size) || size < 0) return 0;
  return size;
}

function httpFinalUrl(reported: string, fallback: string): string {
  if (reported.length === 0) return fallback;
  try {
    const parsed = new URL(reported);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    return fallback;
  }
  return fallback;
}

async function discard(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // The body may already be consumed or not implemented on a fake.
  }
}

interface Capture {
  title: string;
  html: string;
  shot: Buffer;
}

async function capture(
  openPage: CrawlDeps["openPage"],
  viewport: Viewport,
  url: string,
  readHtml: boolean,
): Promise<Capture> {
  const page = await openPage(viewport);
  try {
    if (page.goto) await page.goto(url);
    const shot = Buffer.from(await page.screenshot());
    if (!readHtml) return { title: "", html: "", shot };
    const title = (await page.title()).trim();
    const html = await page.content();
    return { title, html, shot };
  } finally {
    if (page.close) await page.close();
  }
}

function extractTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? decode(stripTags(match[1])).replace(/\s+/g, " ").trim() : "";
}

function extractDescription(html: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = readAttr(tag, "name");
    if (name?.toLowerCase() !== "description") continue;
    const content = readAttr(tag, "content");
    if (content === undefined) continue;
    return decode(content).replace(/\s+/g, " ").trim();
  }
  return "";
}

function extractH1(html: string): string[] {
  const found: string[] = [];
  const pattern = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
  for (const match of html.matchAll(pattern)) {
    const text = decode(stripTags(match[1] ?? "")).replace(/\s+/g, " ").trim();
    if (text.length > 0) found.push(text);
  }
  return found;
}

function visibleText(html: string): string {
  const without = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(without).replace(/\s+/g, " ").trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function readAttr(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i");
  const match = pattern.exec(tag);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
}

interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: "load"; timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  content(): Promise<string>;
  screenshot(options?: { type?: "png" }): Promise<Uint8Array>;
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
