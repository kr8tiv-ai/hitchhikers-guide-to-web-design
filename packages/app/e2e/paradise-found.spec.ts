/**
 * BUG-004. The Logo file slot is listed after reload, and DP-1.1 does not offer the hero as the logo.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test("a logo in the slot survives reload and DP-1.1 does not offer the hero", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-211-"));
  const logoPath = path.join(projectDir, "paradise-found-logo.png");
  const heroPath = path.join(projectDir, "paradise-found-hero.jpg");
  await writeFile(logoPath, PNG);
  await writeFile(heroPath, JPEG);
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await skipTo(page, "DP-0.4");
    await page.locator("#hh-logo-file").setInputFiles(logoPath);
    await expect(page.locator("[data-logo-status]")).toContainText("paradise-found-logo.png");
    await page.locator("[data-attach-file]").setInputFiles(heroPath);
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "paradise-found-hero.jpg" })).toBeVisible();
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-question-id='DP-0.4']")).toBeVisible();
    await expect(page.locator("[data-logo-status]")).toContainText("Saved as paradise-found-logo.png");
    await skipTo(page, "DP-1.1");
    const ask = page.locator("#hh-card-ask");
    await expect(ask).toContainText("paradise-found-logo.png");
    await expect(ask).not.toContainText("paradise-found-hero.jpg");
    await page.locator('[data-action="suggest"]').click();
    await expect(page.locator("[data-choices]")).toBeVisible();
    await expect(page.locator("[data-choices] [role='radio'][aria-checked='true']")).toHaveCount(0);
    const radios = page.locator("[data-choices] [role='radio']");
    const count = await radios.count();
    for (let index = 0; index < count; index += 1) {
      const label = (await radios.nth(index).innerText()).replace(/\s+/g, " ");
      expect(label.includes("paradise-found-hero.jpg")).toBe(false);
    }
    await expect(page.locator("[data-choices]")).toContainText("paradise-found-logo.png");
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

async function skipTo(page: Page, id: string): Promise<void> {
  await enterGuide(page);
  const question = page.locator("[data-region='question']");
  for (let step = 0; step < 16; step += 1) {
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
        if (req.task === "pushback-judge") {
          return hit({ vague: false, quote: "", sharperChoice: "" });
        }
        if (req.task === "suggest") {
          return hit({
            choices: [
              {
                id: "A",
                label: "The header logo is paradise-found-hero.jpg",
                why: "It is a photo, not the mark.",
                source: "upload:paradise-found-hero.jpg",
              },
              {
                id: "B",
                label: "The logo is paradise-found-logo.png",
                why: "It is the logo on file.",
                source: "upload:paradise-found-logo.png",
              },
            ],
          });
        }
        return hit({
          message: "What is one concrete detail this page should keep?",
          explanationLevel: "beginner",
          joke: false,
        });
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
