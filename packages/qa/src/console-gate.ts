/**
 * Console-error and failed-request gate (prompt 126).
 *
 * Zero console errors and zero failed requests, at 375, 768, 1440, and 1920.
 * A navigation crash counts as both, so a dead preview cannot pass.
 */

import type { Browser } from "playwright";
import { REVIEW_WIDTHS } from "./screenshots.ts";
import { withChromium } from "./playwright-opener.ts";

export interface ConsoleGateResult {
  errors: number;
  failedRequests: number;
  pass: boolean;
}

function sameOrigin(pageUrl: string, requestUrl: string): boolean {
  try {
    return new URL(requestUrl).origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

async function measure(browser: Browser, url: string): Promise<ConsoleGateResult> {
  let errors = 0;
  let failedRequests = 0;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    for (const width of REVIEW_WIDTHS) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") errors += 1;
      });
      page.on("pageerror", () => {
        errors += 1;
      });
      page.on("requestfailed", (request) => {
        if (sameOrigin(url, request.url())) failedRequests += 1;
      });
      page.on("response", (response) => {
        if (response.status() >= 400 && sameOrigin(url, response.url())) failedRequests += 1;
      });
      try {
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        const response = await page.goto(url, { waitUntil: "load", timeout: 8_000 });
        if (response === null || response.status() >= 400) {
          failedRequests += 1;
          errors += 1;
        }
      } catch {
        errors += 1;
        failedRequests += 1;
      }
      await page.close();
    }
  } finally {
    await context.close();
  }
  return { errors, failedRequests, pass: errors === 0 && failedRequests === 0 };
}

export async function runConsoleGate(url: string): Promise<ConsoleGateResult> {
  try {
    return await withChromium((browser) => measure(browser, url));
  } catch {
    return { errors: 1, failedRequests: 1, pass: false };
  }
}
