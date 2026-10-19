/**
 * Opt-in Imagine in the desk's own browser profile.
 * The user signs in. This file never reads cookies, storage state, or tokens.
 */

import path from "node:path";

export interface ImagineDriver {
  openImagine(projectDir: string): Promise<void>;
  submitStill(prompt: string): Promise<{ bytes: Uint8Array } | { handsBack: string }>;
  submitVideo(prompt: string): Promise<{ bytes: Uint8Array } | { handsBack: string }>;
}

const BLOCK = /captcha|sign in|log in|rate limit|too many requests|verify you are human/i;

interface PageLike {
  goto(url: string, options?: { waitUntil?: "domcontentloaded" }): Promise<unknown>;
  locator(selector: string): {
    innerText(): Promise<string>;
    count(): Promise<number>;
    first(): { fill(value: string): Promise<void>; press(key: string): Promise<void> };
    last(): { waitFor(options: { timeout: number }): Promise<void>; getAttribute(name: string): Promise<string | null> };
  };
  request: { get(url: string): Promise<{ ok(): boolean; body(): Promise<Buffer> }> };
}

interface ContextLike {
  pages(): PageLike[];
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

interface PlaywrightLike {
  chromium: {
    launchPersistentContext(dir: string, options: { headless: boolean }): Promise<ContextLike>;
  };
}

export async function driverFor(
  enabled: boolean,
  factory: () => Promise<ImagineDriver>,
): Promise<ImagineDriver | undefined> {
  if (!enabled) return undefined;
  return factory();
}

export async function embeddedImagineDriver(projectDir: string): Promise<ImagineDriver> {
  const playwright = (await import("@playwright/test")) as unknown as PlaywrightLike;
  return createEmbeddedDriver(projectDir, playwright);
}

export function createEmbeddedDriver(projectDir: string, playwright: PlaywrightLike): ImagineDriver {
  const profile = path.join(projectDir, ".hitchhiker", "browser-profile");
  const open = async (): Promise<{ context: ContextLike; page: PageLike; text: string }> => {
    const context = await playwright.chromium.launchPersistentContext(profile, { headless: false });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://grok.com/imagine", { waitUntil: "domcontentloaded" });
    const text = await page.locator("body").innerText();
    return { context, page, text };
  };
  const hands = "A captcha, sign-in, or limit is showing. Sign in yourself in the desk browser. Nothing was generated.";
  return {
    async openImagine() {
      const session = await open();
      await session.context.close();
    },
    async submitStill(prompt) {
      return submit(open, prompt, "img", hands);
    },
    async submitVideo(prompt) {
      return submit(open, prompt, "video", hands);
    },
  };
}

async function submit(
  open: () => Promise<{ context: ContextLike; page: PageLike; text: string }>,
  prompt: string,
  selector: "img" | "video",
  hands: string,
): Promise<{ bytes: Uint8Array } | { handsBack: string }> {
  const session = await open();
  try {
    if (BLOCK.test(session.text)) return { handsBack: hands };
    const box = session.page.locator("textarea");
    if ((await box.count()) === 0) return { handsBack: hands };
    await box.first().fill(prompt);
    await box.first().press("Enter");
    const media = session.page.locator(selector).last();
    try {
      await media.waitFor({ timeout: 120_000 });
    } catch {
      return { handsBack: hands };
    }
    const src = await media.getAttribute("src");
    if (src === null || src.length === 0) return { handsBack: hands };
    const response = await session.page.request.get(src);
    if (!response.ok()) return { handsBack: hands };
    return { bytes: new Uint8Array(await response.body()) };
  } finally {
    await session.context.close();
  }
}
