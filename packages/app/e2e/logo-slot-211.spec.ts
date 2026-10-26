/**
 * BUG-005. The Logo file slot shows a thumbnail after upload and after reload.
 * The native file input stays clipped. The drop zone has an accessible name.
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

test("a logo upload shows a thumbnail, hides the native input, and survives reload", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-logo-slot-"));
  const logoPath = path.join(projectDir, "paradise-found-logo.png");
  await writeFile(logoPath, PNG);
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await skipTo(page, "DP-0.4");
    const zone = page.locator("[data-logo-drop]");
    await expect(zone).toHaveAttribute("aria-labelledby", "hh-logo-label");
    await expect(page.getByRole("group", { name: "Logo file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose logo" })).toHaveAccessibleName("Choose logo");
    await expect(zone).not.toContainText("No file chosen");
    await expect(zone).not.toContainText("Choose File");
    await expectClipped(page);

    await page.locator("#hh-logo-file").setInputFiles(logoPath);
    const thumb = zone.locator(".hh-attach__thumb");
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveAttribute("src", "/brand/logo");
    await expect(zone.locator(".hh-attach__name")).toHaveText("paradise-found-logo.png");
    await expect(zone.locator(".hh-attach__meta")).toHaveText("10 B");
    await expect(page.getByRole("button", { name: "Remove paradise-found-logo.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace" })).toBeVisible();
    await expect(zone).not.toContainText("No file chosen");
    await expectClipped(page);

    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-question-id='DP-0.4']")).toBeVisible();
    await expect(zone.locator(".hh-attach__thumb")).toBeVisible();
    await expect(zone.locator(".hh-attach__thumb")).toHaveAttribute("src", "/brand/logo");
    await expect(zone.locator(".hh-attach__name")).toHaveText("paradise-found-logo.png");
    await expect(zone).not.toContainText("No file chosen");
    await expect(page.getByRole("group", { name: "Logo file" })).toBeVisible();
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

async function expectClipped(page: Page): Promise<void> {
  const box = await page.locator("#hh-logo-file").boundingBox();
  expect(box === null || (box.width <= 2 && box.height <= 2)).toBe(true);
}

async function skipTo(page: Page, id: string): Promise<void> {
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
      guideThink: async () => hit({ message: "What is one concrete detail this page should keep?", explanationLevel: "beginner", joke: false }),
    });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`desk did not print a URL\\n${stderr}`)), 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\\n").find((item) => item.startsWith("http://127.0.0.1:"));
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
      reject(new Error(`desk exited ${code ?? "null"}\\n${stderr}\\n${stdout}`));
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
