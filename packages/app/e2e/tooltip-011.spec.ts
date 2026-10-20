/**
 * BUG-011. The Suggest tooltip stays off the answer box and the options.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

test("the Suggest tooltip misses the answer and the options, and it closes", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-011-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.goto(url);
    await page.locator("html[data-tips='ready']").waitFor({ state: "attached" });
    await page.locator('[data-region="question"][data-live="true"]').waitFor();

    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      await openSuggestTip(page);
      await expectNoOverlap(page, "#hh-card-draft");
      await page.mouse.move(8, 8);
      await expect(openTip(page)).toBeHidden();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-action="suggest"]').click();
    await page.locator("[data-choices]").waitFor();

    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      await openSuggestTip(page);
      await expectNoOverlap(page, "#hh-card-draft");
      await expectNoOverlap(page, "[data-choices]");
      await page.mouse.move(8, 8);
      await expect(openTip(page)).toBeHidden();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const suggest = page.locator('[data-action="suggest"]');
    const draft = page.locator("#hh-card-draft");

    await openSuggestTip(page);
    const draftBox = await draft.boundingBox();
    expect(draftBox).not.toBeNull();
    await page.mouse.move(draftBox!.x + 12, draftBox!.y + 12);
    await expect(openTip(page)).toBeHidden();

    await suggest.focus();
    await expect(openTip(page)).toBeVisible();
    await suggest.blur();
    await expect(openTip(page)).toBeHidden();

    await suggest.focus();
    await expect(openTip(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(openTip(page)).toBeHidden();

    await suggest.blur();
    await suggest.focus();
    await expect(openTip(page)).toBeVisible();
    await draft.evaluate((node) => {
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: "a" }));
    });
    await expect(openTip(page)).toBeHidden();
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function openTip(page: Page): Locator {
  return page.locator(".hh-tip:not([hidden])");
}

async function openSuggestTip(page: Page): Promise<void> {
  const suggest = page.locator('[data-action="suggest"]');
  await suggest.scrollIntoViewIfNeeded();
  await suggest.hover();
  await expect(openTip(page)).toBeVisible();
  await expect(openTip(page)).toContainText("marked assumption");
}

async function expectNoOverlap(page: Page, selector: string): Promise<void> {
  const targetLocator = page.locator(selector);
  await expect(openTip(page)).toBeVisible();
  await expect(targetLocator).toBeVisible();
  const tip = await openTip(page).boundingBox();
  const target = await targetLocator.boundingBox();
  expect(tip, selector).not.toBeNull();
  expect(target, selector).not.toBeNull();
  expect(boxesOverlap(tip!, target!), `${selector} overlaps the tooltip`).toBe(false);
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const hit = (value) => ({ value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" });
    const handle = await loaded.startServer({
      projectDir,
      open: false,
      guideThink: async (req) => {
        if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
        if (req.task === "suggest") {
          return hit({
            choices: [
              { id: "A", label: "A farm stand on the home page", why: "The stall is the first thing a visitor needs.", source: "industry:farm" },
              { id: "B", label: "A weekly harvest note", why: "The season changes what is for sale.", source: "industry:farm" },
            ],
          });
        }
        return hit({ message: "What should the first page say?", explanationLevel: "beginner", joke: false });
      },
    });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`desk did not print a URL\n${stderr}`)), 20_000);
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
