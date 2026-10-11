import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Suggest and a weak answer offer pick-on-the-spot choices on the question
 * card. The transcript below the card does not carry them.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, "fixtures", "suggestion-choices");
const GOOD = path.join(fixtureDir, "good.json");
const BAD = path.join(fixtureDir, "bad.json");
const OTHER = "Other: I'll write my own";
const CHOICE_A = "A quiet order page for the shop.";
const CHOICE_B = "Show the tin photo large on the page.";
const CHOICE_C = "Keep the menu note from the crawl.";
const FALLBACK = "Yourself, or one named client.";
const DRAFT = "A shop for myself, still a draft.";
const OWN = "The site is for my own tea shop.";
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`suggest shows choices on the card at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const handle = await card.elementHandle();
      if (handle === null) throw new Error("the opening card was not mounted");
      const before = page.url();

      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();

      await expectChoices(card, [CHOICE_A, CHOICE_B, CHOICE_C]);
      await expect(page.locator("#transcript [data-suggest-option]")).toHaveCount(0);
      await expect(page.locator("#transcript").getByRole("radiogroup")).toHaveCount(0);
      await expectInView(card.getByRole("radio", { name: /^A\./ }));
      await expectInView(card.getByRole("radio", { name: OTHER }));
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);
      await expect(page.locator('[data-region="question"] .hh-error')).toHaveCount(0);
      await expectNoHorizontalScroll(page);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`a weak answer shows choices on the same card at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-weak-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const handle = await card.elementHandle();
      if (handle === null) throw new Error("the opening card was not mounted");
      const before = page.url();

      await page.locator("#hh-card-draft").fill("it's fine");
      await page.locator('[data-action="answer"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="answer"]').click();

      await expect(card).toBeVisible();
      await expect(page.locator("#hh-card-ask")).toContainText("one concrete detail the shop site should keep");
      await expectChoices(card, [
        "What is one concrete detail the shop site should keep?",
        "A menu page is the one page to keep.",
        "Show the tin photo as the concrete detail.",
      ]);
      await expect(page.locator("#transcript [data-suggest-option]")).toHaveCount(0);
      await expectInView(card.getByRole("radio", { name: /^A\./ }));
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);
      await expect(page.locator('[data-region="question"] .hh-error')).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`a tap picks a choice and the next card shows it assumed at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-tap-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const before = page.url();
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();
      const card = page.locator("[data-question-id='DP-0.1']");
      await expectChoices(card, [CHOICE_A, CHOICE_B, CHOICE_C]);

      await card.getByRole("radio", { name: /^B\./ }).click();

      const next = page.locator("[data-question-id='DP-0.2']");
      await expect(next).toBeVisible();
      await expect(next.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${CHOICE_B}`);
      expect(page.url()).toBe(before);
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`the A key picks a choice at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-key-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const before = page.url();
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();
      const group = page.locator("[data-question-id='DP-0.1']").getByRole("radiogroup");
      await expect(group).toBeVisible();
      await group.focus();
      await page.keyboard.press("a");

      const next = page.locator("[data-question-id='DP-0.2']");
      await expect(next).toBeVisible();
      await expect(next.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${CHOICE_A}`);
      expect(page.url()).toBe(before);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`arrow keys then Enter pick a choice at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-arrow-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const before = page.url();
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();
      const group = page.locator("[data-question-id='DP-0.1']").getByRole("radiogroup");
      await expect(group).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      const next = page.locator("[data-question-id='DP-0.2']");
      await expect(next).toBeVisible();
      await expect(next.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${CHOICE_B}`);
      expect(page.url()).toBe(before);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`Other stores the user's own words at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-other-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const handle = await card.elementHandle();
      if (handle === null) throw new Error("the opening card was not mounted");
      const before = page.url();
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();
      await expectChoices(card, [CHOICE_A, CHOICE_B, CHOICE_C]);

      await card.getByRole("radio", { name: OTHER }).click();

      const field = page.locator("#hh-card-draft");
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("");
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);

      await field.fill(OWN);
      await page.locator('[data-action="answer"]').click();
      const next = page.locator("[data-question-id='DP-0.2']");
      await expect(next).toBeVisible();
      await expect(next.locator("[data-assumed]")).toHaveCount(0);
      await expect(page.locator("#transcript")).toContainText(OWN);
      expect(page.url()).toBe(before);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`a failed suggest keeps the draft and Retry works at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-fail-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, GOOD);
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
      const notice = page.locator('[data-region="question"] [data-card-notice]');
      await expect(notice).toContainText("The suggestion did not save.");
      await expect(notice).not.toHaveAttribute("role", "alert");
      await expect(page.locator('[data-region="question"] .hh-error')).toHaveCount(0);
      const fieldBox = await page.locator("#hh-card-draft").boundingBox();
      const noticeBox = await notice.boundingBox();
      expect(fieldBox).not.toBeNull();
      expect(noticeBox).not.toBeNull();
      if (fieldBox !== null && noticeBox !== null) expect(noticeBox.y).toBeGreaterThan(fieldBox.y);
      const retry = page.locator('[data-retry="suggest"]');
      await expect(retry).toBeVisible();

      await page.unroute("**/api/suggest");
      await retry.click();
      await expectChoices(card, [CHOICE_A, CHOICE_B, CHOICE_C]);
      expect(await handle.evaluate((node) => node.isConnected)).toBe(true);
      expect(page.url()).toBe(before);
      expect(errors).toEqual([
        "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
      ]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test(`bad model JSON falls back to one choice at ${viewport.width}`, async ({ page }) => {
    const errors = trackErrors(page);
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-choices-bad-"));
    await seedFacts(projectDir);
    const child = startDesk(projectDir, BAD);
    try {
      const url = await readUrl(child);
      await openCard(page, url, viewport);
      const card = page.locator("[data-question-id='DP-0.1']");
      const before = page.url();
      await page.locator('[data-action="suggest"]').scrollIntoViewIfNeeded();
      await page.locator('[data-action="suggest"]').click();

      await expect(card.getByRole("radiogroup")).toBeVisible();
      await expect(card.getByRole("radio", { name: /^A\./ })).toContainText(FALLBACK);
      await expect(card.getByRole("radio", { name: /^B\./ })).toHaveCount(0);
      await expect(card.getByRole("radio", { name: OTHER })).toBeVisible();
      await expect(card.locator("[data-choices-origin='fallback']")).toBeVisible();
      await expect(page.locator('[data-region="question"] [role="alert"]')).toHaveCount(0);
      await expect(page.locator('[data-region="question"] .hh-error')).toHaveCount(0);
      expect(page.url()).toBe(before);
      expect(errors).toEqual([]);
    } finally {
      await stopChild(child);
      await rm(projectDir, { recursive: true, force: true });
    }
  });
}

async function expectChoices(card: Locator, labels: readonly string[]): Promise<void> {
  const group = card.getByRole("radiogroup");
  await expect(group).toBeVisible();
  const letters = ["A", "B", "C", "D"] as const;
  expect(labels.length).toBeGreaterThanOrEqual(2);
  expect(labels.length).toBeLessThanOrEqual(4);
  for (let index = 0; index < labels.length; index += 1) {
    const letter = letters[index];
    const label = labels[index];
    if (letter === undefined || label === undefined) throw new Error("choice index missing");
    const radio = card.getByRole("radio", { name: new RegExp(`^${letter}\\.`) });
    await expect(radio).toBeVisible();
    await expect(radio).toContainText(letter);
    await expect(radio).toContainText(label);
  }
  const absent = letters[labels.length];
  if (absent !== undefined) {
    await expect(card.getByRole("radio", { name: new RegExp(`^${absent}\\.`) })).toHaveCount(0);
  }
  await expect(card.getByRole("radio", { name: OTHER })).toBeVisible();
  await expect(card.locator("[data-choices-live]")).toContainText(`Options ready: ${labels.length} choices`);
}

async function expectInView(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(fits).toBe(true);
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

async function seedFacts(projectDir: string): Promise<void> {
  const hitch = path.join(projectDir, ".hitchhiker", "uploads");
  await mkdir(hitch, { recursive: true });
  await writeFile(path.join(hitch, "tins.jpg"), "");
  await writeFile(
    path.join(projectDir, ".hitchhiker", "facts.json"),
    JSON.stringify({ industry: "tea", crawlNotes: ["menu"] }),
  );
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

function startDesk(projectDir: string, cassette: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_GUIDE_REPLAY: "1",
        HH_GUIDE_CASSETTE: cassette,
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
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve(undefined);
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}
