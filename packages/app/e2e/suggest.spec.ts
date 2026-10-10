import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Suggest must leave the card on screen. The suggestion is written into that
 * card and marked assumed. A real failure stays under the field.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SUGGESTION = "Yourself, or one named client.";
const DRAFT = "A shop for myself, still a draft.";
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`suggest stays on the card at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-suggest-"));
    const child = startDesk(projectDir);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const handle = await card.elementHandle();
      if (handle === null) throw new Error("the opening card was not mounted");
      const before = page.url();

      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();

      await expect(card).toBeVisible();
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);
      await expect(page.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${SUGGESTION}`);
      await expect(page.locator("#hh-card-draft")).toHaveValue(SUGGESTION);
      await expect(page.locator("#hh-card-draft")).toBeEditable();
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);
      await expect(page.locator('[data-region="question"] .hh-error')).toHaveCount(0);

      await page.locator("#hh-card-draft").fill(`${SUGGESTION} Edited.`);
      await expect(page.locator("#hh-card-draft")).toHaveValue(`${SUGGESTION} Edited.`);
      await expect(page.locator("[data-assumed='suggested']")).toHaveCount(0);
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);

      const accept = page.locator('[data-action="answer"]');
      await accept.scrollIntoViewIfNeeded();
      await expect(accept).toBeEnabled();
      await accept.click();

      await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
      expect(page.url()).toBe(before);
      await expect(page.getByText("loading error", { exact: false })).toHaveCount(0);
      await expect(page.getByText("The desk could not load the session.")).toHaveCount(0);
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);

      await page.locator("#hh-card-draft").fill("I have used a site builder.");
      await page.locator('[data-action="answer"]').click();
      await expect(page.locator("[data-question-id='DP-0.2a']")).toBeVisible();
      await expect(page.getByText("loading error", { exact: false })).toHaveCount(0);
      await expect(page.getByText("The desk could not load the session.")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`a failed suggest keeps the draft at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-suggest-fail-"));
    const child = startDesk(projectDir);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const handle = await card.elementHandle();
      if (handle === null) throw new Error("the opening card was not mounted");
      const before = page.url();

      await page.locator("#hh-card-draft").fill(DRAFT);
      await page.route("**/api/suggest", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "The suggestion did not save." }),
        }),
      );
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();

      await expect(card).toBeVisible();
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);
      await expect(page.locator("#hh-card-draft")).toHaveValue(DRAFT);
      await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
      const alert = page.locator('[data-region="question"] [data-card-error][role="alert"]');
      await expect(alert).toContainText("The suggestion did not save.");
      await expect(page.locator("#hh-card-ask")).toContainText("Is this site for you, or for a client?");
      const fieldBox = await page.locator("#hh-card-draft").boundingBox();
      const alertBox = await alert.boundingBox();
      expect(fieldBox).not.toBeNull();
      expect(alertBox).not.toBeNull();
      if (fieldBox !== null && alertBox !== null) expect(alertBox.y).toBeGreaterThan(fieldBox.y);
      // Chromium logs the injected 500. Any other console or page error is a desk failure.
      expect(errors).toEqual([
        "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
      ]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function openCard(
  page: Page,
  url: string,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const handle = await loaded.startServer({ projectDir, open: false });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not print a URL\n${stderr}`));
    }, 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((item) => item.startsWith("http://127.0.0.1:"));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`desk exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
