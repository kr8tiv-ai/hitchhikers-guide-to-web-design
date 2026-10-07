/**
 * Phone and desk checks for a generated blank page.
 * Set HH_QA_BASE to the built site. Default is the local preview.
 * Screenshots land in tests/screens at 375, 768, and 1440.
 */

import { expect, test } from "@playwright/test";

const baseURL = process.env.HH_QA_BASE ?? "http://127.0.0.1:4173";
const widths = [375, 768, 1440] as const;

test("blank page has no console errors or failed requests", async ({ page }) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failed.push(request.url());
  });
  await page.goto(baseURL);
  expect(errors, errors.join("\n")).toEqual([]);
  expect(failed, failed.join("\n")).toEqual([]);
});

for (const width of widths) {
  test(`screenshot at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL);
    await page.screenshot({ path: `tests/screens/${width}.png`, fullPage: true });
    await expect(page.locator("h1")).toBeVisible();
  });
}

test("reduced motion keeps the heading visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(baseURL);
  const opacity = await page.locator("h1").evaluate((node) => getComputedStyle(node).opacity);
  expect(opacity).toBe("1");
});
