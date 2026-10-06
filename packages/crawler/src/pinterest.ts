import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { allowed, ROBOTS_MAX_CHARS } from "./robots.ts";
import { BadUrlError, NetworkError, RobotsDenied, USER_AGENT } from "./crawl.ts";

/**
 * Public Pinterest boards only. The flag defaults off.
 * This module never signs in and never sends a cookie.
 * Pin files are the bitmap at displayed size, not the original upload.
 */

export const SCROLL_DELAY_MS = 1_500;
export const PIN_CAP = 60;

export const CAPTURE_OFF_MESSAGE =
  "Pinterest capture is off. Drop exported images or screenshots.";

export const LOGIN_WALL_MESSAGE =
  "This board is private or behind a login. Drop exported images or screenshots.";

export const EMPTY_BOARD_MESSAGE =
  "No pin images were visible. Drop exported images or screenshots.";

/**
 * Structural slice of the engine config. The crawler does not import the engine.
 * A caller may pass the full engine GuideConfig.
 */
export interface GuideConfig {
  integrations: {
    pinterestCapture: boolean;
  };
}

export interface PinBytes {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number;
  height: number;
}

export interface OpenOptions {
  userAgent: string;
  credentials: "omit";
}

/** One public board. `loginWall` is the page we landed on, before any scroll. */
export interface BoardSession {
  readonly finalUrl: string;
  readonly loginWall: boolean;
  pins(): Promise<readonly PinBytes[]>;
  scroll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Injected stand-in for the 026 crawler.
 * `robots` returns the body only. Set-Cookie on that response is not part of the result.
 * `open` must not send cookies or a login.
 */
export interface CrawlLike {
  robots(url: string): Promise<{ status: number; body: string }>;
  open(url: string, options: OpenOptions): Promise<BoardSession>;
}

export interface CaptureDeps {
  crawl: CrawlLike;
  config: GuideConfig;
  sleep: (ms: number) => Promise<void>;
  /** Project directory. Defaults to the current working directory. */
  root?: string;
}

interface PinHandle {
  getAttribute(name: string): Promise<string | null>;
  boundingBox(): Promise<{ width: number; height: number } | null>;
  screenshot(options: { type: "png" }): Promise<Uint8Array>;
}

interface PinPage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  url(): string;
  content(): Promise<string>;
  locator(selector: string): { all(): Promise<PinHandle[]> };
  evaluate(script: string): Promise<unknown>;
  close(): Promise<void>;
}

interface PinContext {
  newPage(): Promise<PinPage>;
  route(
    pattern: string,
    handler: (route: {
      request(): { headers(): Record<string, string> };
      continue(options: { headers: Record<string, string> }): Promise<void>;
    }) => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
}

interface PinBrowser {
  newContext(options: {
    userAgent: string;
    viewport: { width: number; height: number };
  }): Promise<PinContext>;
  close(): Promise<void>;
}

interface PlaywrightModule {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PinBrowser>;
  };
}

function finish(paths: string[], message: string): string[] {
  const list = paths.slice();
  Object.defineProperty(list, "message", {
    value: message,
    enumerable: false,
    configurable: true,
  });
  return list;
}

/** Message attached to a captureBoard array. Empty when pins were saved. */
export function boardMessage(paths: readonly string[]): string {
  const value: unknown = Reflect.get(paths, "message");
  return typeof value === "string" ? value : "";
}

function extensionFor(contentType: PinBytes["contentType"]): string {
  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
  }
}

function parseBoardUrl(input: string): URL {
  let target: URL;
  try {
    target = new URL(input);
  } catch (cause) {
    throw new BadUrlError("URL constructor rejected the input", { cause });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new BadUrlError("Only http and https URLs can be captured");
  }
  if (target.username.length > 0 || target.password.length > 0) {
    throw new BadUrlError("URLs with user info are refused");
  }
  return target;
}

function isLoginUrl(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().includes("/login");
  } catch {
    return false;
  }
}

function captureEnabled(config: GuideConfig): boolean {
  const integrations = config.integrations;
  return integrations !== undefined && integrations.pinterestCapture === true;
}

async function discard(response: Response): Promise<void> {
  if (response.body === null) return;
  try {
    await response.body.cancel();
  } catch {
    // A fake body may already be consumed.
  }
}

function isPlaywright(value: unknown): value is PlaywrightModule {
  if (typeof value !== "object" || value === null) return false;
  const chromium: unknown = Reflect.get(value, "chromium");
  if (typeof chromium !== "object" || chromium === null) return false;
  return typeof Reflect.get(chromium, "launch") === "function";
}

function pageWantsLogin(finalUrl: string, html: string): boolean {
  if (isLoginUrl(finalUrl)) return true;
  return html.slice(0, 80_000).toLowerCase().includes("log in to see");
}

/**
 * Production board reader. Dynamic import so unit tests never load Playwright.
 * The context is memory-only and closed before this function's session ends.
 * Every request has its cookie header removed. Nothing is written to disk as a jar.
 */
export function createBoardCrawl(): CrawlLike {
  return {
    async robots(boardUrl: string): Promise<{ status: number; body: string }> {
      const target = new URL(boardUrl);
      const robotsUrl = new URL("/robots.txt", target.origin);
      let response: Response;
      try {
        response = await fetch(robotsUrl, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers: { "user-agent": USER_AGENT },
        });
      } catch (cause) {
        throw new NetworkError(`Fetch failed for ${robotsUrl.href}`, undefined, { cause });
      }
      if (response.status === 404) {
        await discard(response);
        return { status: 404, body: "" };
      }
      if (response.status !== 200) {
        await discard(response);
        return { status: response.status, body: "" };
      }
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > ROBOTS_MAX_CHARS) {
        await discard(response);
        return { status: 200, body: " ".repeat(ROBOTS_MAX_CHARS + 1) };
      }
      const body = await response.text();
      if (body.length > ROBOTS_MAX_CHARS) {
        return { status: 200, body: body.slice(0, ROBOTS_MAX_CHARS + 1) };
      }
      return { status: 200, body };
    },
    async open(boardUrl: string, options: OpenOptions): Promise<BoardSession> {
      if (options.credentials !== "omit") {
        throw new Error("Pinterest capture does not send credentials.");
      }
      const specifier: string = "playwright";
      let loaded: unknown;
      try {
        loaded = await import(specifier);
      } catch (cause) {
        throw new Error(
          "playwright is not installed. Pass crawl to captureBoard(), or install playwright.",
          { cause },
        );
      }
      if (!isPlaywright(loaded)) {
        throw new Error("playwright did not export chromium.launch");
      }
      const browser = await loaded.chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: options.userAgent,
        viewport: { width: 1280, height: 900 },
      });
      await context.route("**/*", async (route) => {
        const headers = { ...route.request().headers() };
        delete headers.cookie;
        await route.continue({ headers });
      });
      const page = await context.newPage();
      await page.goto(boardUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const finalUrl = page.url();
      const html = await page.content();
      const loginWall = pageWantsLogin(finalUrl, html);
      let closed = false;
      const closeAll = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await page.close();
        await context.close();
        await browser.close();
      };
      return {
        finalUrl,
        loginWall,
        pins: async () => collectPins(page),
        scroll: async () => {
          await page.evaluate("window.scrollBy(0, Math.max(window.innerHeight, 600))");
        },
        close: closeAll,
      };
    },
  };
}

async function collectPins(page: PinPage): Promise<PinBytes[]> {
  const handles = await page.locator("img").all();
  const pins: PinBytes[] = [];
  for (const handle of handles) {
    const src = (await handle.getAttribute("src")) ?? "";
    const srcset = (await handle.getAttribute("srcset")) ?? "";
    const hay = `${src} ${srcset}`.toLowerCase();
    if (!hay.includes("pinimg")) continue;
    const box = await handle.boundingBox();
    if (box === null || box.width < 40 || box.height < 40) continue;
    let bytes: Uint8Array;
    try {
      bytes = await handle.screenshot({ type: "png" });
    } catch {
      continue;
    }
    if (bytes.byteLength === 0) continue;
    pins.push({
      bytes,
      contentType: "image/png",
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    });
  }
  return pins;
}

/**
 * Scroll a public board when capture is enabled.
 * Returns saved file paths. The array carries `message` via boardMessage().
 * Login walls and an off flag return an empty list and do not write files.
 */
export async function captureBoard(url: string, deps: CaptureDeps): Promise<string[]> {
  if (!captureEnabled(deps.config)) {
    return finish([], CAPTURE_OFF_MESSAGE);
  }

  const target = parseBoardUrl(url);
  const robots = await deps.crawl.robots(target.href);
  if (robots.status !== 200 && robots.status !== 404) {
    throw new NetworkError(
      `robots.txt for ${target.origin} returned ${robots.status}`,
      robots.status,
    );
  }
  const body = robots.status === 404 ? "" : robots.body;
  if (!allowed(target.href, body, USER_AGENT)) {
    throw new RobotsDenied(target.href);
  }

  const session = await deps.crawl.open(target.href, {
    userAgent: USER_AGENT,
    credentials: "omit",
  });
  try {
    if (session.loginWall || isLoginUrl(session.finalUrl)) {
      return finish([], LOGIN_WALL_MESSAGE);
    }

    let latest: readonly PinBytes[] = [];
    for (let step = 0; step < PIN_CAP; step += 1) {
      const visible = (await session.pins()).slice(0, PIN_CAP);
      if (visible.length <= latest.length) break;
      latest = visible;
      if (latest.length >= PIN_CAP) break;
      await deps.sleep(SCROLL_DELAY_MS);
      await session.scroll();
    }

    const usable = latest.filter((pin) => pin.width >= 1 && pin.height >= 1 && pin.bytes.byteLength > 0);
    if (usable.length === 0) return finish([], EMPTY_BOARD_MESSAGE);

    const root = deps.root ?? process.cwd();
    const dir = path.join(root, ".hitchhiker", "uploads", "mood");
    await mkdir(dir, { recursive: true });
    const saved: string[] = [];
    for (const pin of usable) {
      const name = `pin-${String(saved.length + 1).padStart(2, "0")}${extensionFor(pin.contentType)}`;
      const file = path.join(dir, name);
      await writeFile(file, pin.bytes);
      saved.push(file);
    }
    return finish(saved, "");
  } finally {
    await session.close();
  }
}
