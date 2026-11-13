/**
 * Plan approval opens the design stages. Start build is the billed step.
 * The style guide stays on screen until a direction is picked, so the pick
 * happens there. Six reference shots let that approval lock DESIGN.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { approveRequiredSketches } from "@hitchhiker/engine";
import { expect, type Page } from "@playwright/test";

const GATE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Approves the required page sketches after the sitemap has stopped changing. */
export function plantRequiredSketches(projectDir: string): void {
  approveRequiredSketches(projectDir, GATE_PNG);
}

export function writeGateShots(projectDir: string): void {
  const refs = path.join(projectDir, "reference", "refs");
  mkdirSync(refs, { recursive: true });
  for (let index = 0; index < 6; index += 1) {
    writeFileSync(path.join(refs, `shot-${index}.png`), GATE_PNG);
  }
}

export async function approveDesignAndStart(page: Page, projectDir: string): Promise<void> {
  writeGateShots(projectDir);
  await expect(page.locator("[data-design-stage='sitemap']")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Approve sitemap" }).click();
  await expect(page.locator("[data-design-stage='wireframe']")).toBeVisible();
  await page.getByRole("button", { name: "Approve wireframe" }).click();
  await expect(page.locator("[data-design-stage='style-guide']")).toBeVisible();
  await page.locator("[data-direction-reason]").fill("This direction matches the visit.");
  await page.locator("[data-pick-direction]").first().click();
  await expect(page.locator("[data-design-stage='style-guide']")).toBeVisible();
  await page.getByRole("button", { name: "Approve style guide" }).click();
  await expect(page.locator("[data-direction-desk]")).toContainText("Picked");
  plantRequiredSketches(projectDir);
  await page.getByRole("button", { name: "Approve direction" }).click();
  await expect(page.locator("[data-design-stage='prebuild']")).toBeVisible();
  await page.getByRole("button", { name: "Approve pre-build checks" }).click();
  await expect(page.locator("[data-start-build]")).toBeEnabled();
  await page.locator("[data-start-build]").click();
  await expect(page.locator("[data-build-status]")).toContainText("The build is started.");
}
