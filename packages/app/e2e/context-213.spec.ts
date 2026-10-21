/**
 * Context view. Facts survive a reload, a correction writes a new decision,
 * and the audit names the packet sections.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
const COLOURS = "ink, paper, lime, void, silver";

test("the context view keeps answers, the logo, and a correction", async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-context-"));
  const logoPath = path.join(projectDir, "paradise-found-logo.png");
  await writeFile(logoPath, PNG);
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await skipTo(page, "DP-0.2", 8);
    await answer(page, "no prior site");
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expectFacts(page, url, ["no prior site"]);

    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await skipTo(page, "DP-0.4", 12);
    await page.locator("#hh-logo-file").setInputFiles(logoPath);
    await expect(page.locator("[data-logo-drop] .hh-attach__name")).toHaveText("paradise-found-logo.png");
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expectFacts(page, url, ["no prior site", "paradise-found-logo.png", "role logo"]);

    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await skipTo(page, "DP-1.2", 16);
    await answer(page, COLOURS);
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expectFacts(page, url, ["no prior site", "paradise-found-logo.png", "role logo", COLOURS]);

    const context = new URL("/context", url).href;
    await page.goto(context);
    const known = page.getByRole("region", { name: "What the Guide knows" });
    await expect(known).toBeVisible();
    const field = known.locator("input[name='text']").filter({ hasValue: /no prior site/ }).first();
    await field.focus();
    await expect(field).toBeFocused();
    await field.fill("no prior site, a new shop");
    await field.locator("xpath=ancestor::form").locator("button", { hasText: "Save correction" }).click();
    await page.waitForURL(/\/context$/);
    await expect(known).toContainText("no prior site, a new shop");
    await expect(known).toContainText("superseded");
    await page.reload();
    await expect(page.getByRole("region", { name: "What the Guide knows" })).toContainText("no prior site, a new shop");

    await page.getByRole("link", { name: "Context audit" }).click();
    const audit = page.locator("#hh-context-audit");
    await expect(audit).toContainText("Sections:");
    await expect(audit).toContainText("Decisions");
    await expect(audit).toContainText("Assets");
    await expect(page.locator("[data-router-status]")).toBeVisible();

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    await expect(page.getByRole("region", { name: "What the Guide knows" })).toContainText(COLOURS);
    await expect(page.getByRole("region", { name: "What the Guide knows" })).toContainText("paradise-found-logo.png");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function expectFacts(page: Page, url: string, facts: readonly string[]): Promise<void> {
  await page.goto(new URL("/context", url).href);
  const known = page.getByRole("region", { name: "What the Guide knows" });
  await expect(known).toBeVisible();
  for (const fact of facts) await expect(known).toContainText(fact);
}

async function answer(page: Page, text: string): Promise<void> {
  const question = page.locator("[data-region='question']");
  const before = await question.locator("[data-question-id]").first().getAttribute("data-question-id");
  await question.locator("#hh-card-draft").fill(text);
  await question.locator('[data-action="answer"]').click();
  await expect(question.locator(`[data-question-id="${before}"]`)).toHaveCount(0);
}

async function skipTo(page: Page, id: string, limit: number): Promise<void> {
  await enterGuide(page);
  const question = page.locator("[data-region='question']");
  for (let step = 0; step < limit; step += 1) {
    const current = question.locator("[data-question-id]").first();
    const before = await current.getAttribute("data-question-id");
    if (before === id) return;
    await question.locator('[data-action="skip"]').click();
    const confirm = question.locator("[data-skip-confirm]");
    if (await confirm.isVisible()) await question.locator('[data-action="skip"]').click();
    await expect(question.locator(`[data-question-id="${before}"]`)).toHaveCount(0);
  }
  throw new Error(`did not reach ${id}`);
}

/** The splash sits above the desk. Enter it before the question is used. */
async function enterGuide(page: Page): Promise<void> {
  const cover = page.locator("html[data-splash-cover]");
  if (await cover.count() === 0) return;
  await page.locator("[data-splash-booted]").waitFor();
  await page.evaluate(() => {
    const skip = document.querySelector('a.hh-skip[href="#desk-heading"]');
    if (skip instanceof HTMLAnchorElement) skip.click();
    document.querySelector(".hh-shell")?.scrollIntoView({ block: "start" });
  });
  await expect(cover).toHaveCount(0);
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
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
        if (req.task === "context-summary") return hit({ summary: "Known so far. paradise-found-logo.png stays with the colours." });
        if (req.task === "suggest") return hit({ choices: [] });
        return hit({ message: "Noted for the next question.", explanationLevel: "beginner", joke: false });
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
      const line = stdout.split(/\r?\n/).find((item) => item.startsWith("http://127.0.0.1:"));
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
