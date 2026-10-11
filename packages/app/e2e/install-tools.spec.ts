import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("install confirms, streams, cancels, retries, and refreshes the desk", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-install-e2e-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const stubFile = path.resolve(here, "install-stub.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
        HH_E2E_STUB: pathToFileURL(stubFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Install grok" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Install playwright" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Install whisper" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Install pdftotext" })).toBeVisible();
    expect(await overflows(page)).toBe(false);
    const grokBox = await page.getByRole("button", { name: "Install grok" }).boundingBox();
    expect(grokBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const whisper = page.getByRole("button", { name: "Install whisper" });
    await whisper.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-install-commands]")).toContainText("github.com/ggml-org/whisper.cpp");
    await expect(dialog.locator("[data-install-size]")).toContainText("MB");
    await expect(dialog.locator("[data-install-location]")).toContainText("Hitchhiker");
    await expect(dialog.locator("[data-install-source]")).toContainText("github.com");
    await expect(dialog.locator("[data-install-source]")).toContainText("huggingface.co");
    await expect(dialog.locator("[data-install-admin]")).toContainText("Admin is not required.");
    await expect(dialog.locator("[data-install-live]")).toHaveAttribute("aria-live", "polite");
    await expect(dialog.locator("[data-install-track]")).toBeHidden();
    expect(await overflows(page)).toBe(false);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(whisper).toBeFocused();

    await whisper.click();
    await dialog.getByRole("button", { name: "Run these steps" }).click();
    await expect(dialog.getByRole("progressbar")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog.locator("[data-install-status]")).toHaveText("Cancelled.");
    await expect(dialog.locator("[data-install-error]")).toBeHidden();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Install pdftotext" }).click();
    await expect(dialog.locator("[data-install-commands]")).toContainText("scoop install poppler");
    await dialog.getByRole("button", { name: "Run these steps" }).click();
    await expect(dialog.locator("[data-install-error]")).toContainText("poppler exit 3: package missing from the stub");
    await expect(dialog.locator("[data-install-manual]")).toHaveValue("scoop install poppler");
    await dialog.getByRole("button", { name: "Copy" }).click();
    await expect(dialog.locator("[data-copied='true']")).toHaveText("Copied");
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(dialog.getByRole("button", { name: "Run these steps" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Run these steps" }).click();
    await expect(page.locator("[data-probe='pdftotext']")).toHaveAttribute("data-probe-state", "ok");
    await expect(page.locator("[data-probe='pdftotext']").getByRole("button")).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await overflows(page)).toBe(false);
    await page.getByRole("button", { name: "Install playwright" }).click();
    await expect(dialog.locator("[data-install-commands]")).toContainText("pnpm exec playwright install chromium");
    await expect(dialog.locator("[data-install-location]")).toContainText("ms-playwright");
    await page.keyboard.press("Tab");
    expect(await insideDialog(page)).toBe(true);
    await dialog.getByRole("button", { name: "Run these steps" }).click();
    await expect(page.locator("[data-probe='playwright']")).toHaveAttribute("data-probe-state", "ok");

    await page.evaluate(() => {
      (globalThis as { hhMark?: number }).hhMark = 1;
    });
    await page.getByRole("button", { name: "Install grok" }).click();
    await expect(dialog.locator("[data-install-commands]")).toContainText("npm install -g @xai-official/grok");
    await expect(dialog.getByRole("link", { name: "Open docs" })).toHaveAttribute("href", /x\.ai\/docs\/build\/overview/);
    await expect(dialog.locator("[data-install-signin]")).toContainText("sign in yourself");
    await expect(dialog.locator("[data-install-manual]")).toHaveValue(/irm https:\/\/x\.ai\/cli\/install\.ps1/);
    await dialog.getByRole("button", { name: "Run these steps" }).click();
    await expect(page.locator("[data-region='status']")).toContainText("Ready.");
    await expect(page.locator("[data-probe='grok']")).toHaveAttribute("data-probe-state", "ok");
    await expect(page.locator("[data-probe='whisper']")).toHaveAttribute("data-probe-state", "missing");
    expect(await page.evaluate(() => (globalThis as { hhMark?: number }).hhMark)).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

function insideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector("[data-install-dialog]");
    return dialog !== null && dialog.contains(document.activeElement);
  });
}

function childSource(): string {
  return `
    const server = await import(process.env.HH_E2E_SERVER);
    const stub = await import(process.env.HH_E2E_STUB);
    const handle = await server.startServer({
      projectDir: process.env.HH_E2E_PROJECT,
      open: false,
      preflight: stub.missingPreflight(),
      tools: stub.tools(),
    });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not start\n${buffer}`));
    }, 30_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const line = buffer.split(/\r?\n/).find((item) => item.startsWith("http"));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`desk exited ${code ?? "null"}\n${buffer}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    setTimeout(() => resolve(), 2_000);
  });
}
