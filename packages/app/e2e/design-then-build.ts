/**
 * Plan approval opens the design stages. Start build is the billed step.
 */
import { expect, type Page } from "@playwright/test";

export async function approveDesignAndStart(page: Page): Promise<void> {
  await expect(page.locator("[data-design-stage='sitemap']")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Approve sitemap" }).click();
  await expect(page.locator("[data-design-stage='wireframe']")).toBeVisible();
  await page.getByRole("button", { name: "Approve wireframe" }).click();
  await expect(page.locator("[data-design-stage='style-guide']")).toBeVisible();
  await page.getByRole("button", { name: "Approve style guide" }).click();
  await expect(page.locator("[data-design-stage='direction']")).toBeVisible();
  await page.locator("[data-direction-reason]").fill("This direction matches the visit.");
  await page.locator("[data-pick-direction]").first().click();
  await expect(page.locator("[data-direction-desk]")).toContainText("Picked");
  await page.getByRole("button", { name: "Approve direction" }).click();
  await expect(page.locator("[data-design-stage='prebuild']")).toBeVisible();
  await page.getByRole("button", { name: "Approve pre-build checks" }).click();
  await expect(page.locator("[data-start-build]")).toBeEnabled();
  await page.locator("[data-start-build]").click();
  await expect(page.locator("[data-build-status]")).toContainText("The build is started.");
}
