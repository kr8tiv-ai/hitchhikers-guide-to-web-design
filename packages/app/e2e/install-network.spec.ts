import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("install dialog covers redirect, checksum, offline, and a rejected host", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-install-net-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const stubFile = path.resolve(here, "install-net-stub.ts");
  await writeFile(path.join(projectDir, "managers.txt"), "npm\n");
  await writeFile(path.join(projectDir, "scenario.txt"), "success\n");
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
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return route.continue();
    }
    return route.abort();
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await page.getByRole("button", { name: "Install whisper" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const run = dialog.getByRole("button", { name: "Run these steps" });
    await expect(run).toBeDisabled();
    await expect(run).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.locator("[data-install-run-reason]")).toContainText("tar is not on PATH");
    await expect(dialog.getByRole("button", { name: "Check again" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Retry" })).toBeHidden();
    await expect(dialog.locator("[data-install-logs]")).toBeVisible();
    expect(await dialog.locator("[data-install-logs]").evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    await expect(brandedDocs(dialog)).toBeVisible();
    expect(await inkColor(brandedDocs(dialog))).toBe(true);
    expect(await overflows(page)).toBe(false);
    await dialog.getByRole("button", { name: "Check again" }).click();
    await expect(dialog).toBeVisible();

    await writeFile(path.join(projectDir, "managers.txt"), "npm,pnpm,scoop,tar\n");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Install pdftotext" }).click();
    await expect(run).toBeEnabled();
    await expect(run).toHaveClass(/hh-btn--primary/);
    expect(await filled(run)).toBe(true);
    await expect(dialog.getByRole("button", { name: "Retry" })).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Check again" })).toBeHidden();
    await expect(dialog.locator(".hh-install__actions").getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(dialog.locator(".hh-install__actions").getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(await dialog.locator("[data-install-logs]").evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    expect(await overflows(page)).toBe(false);
    await page.keyboard.press("Tab");
    expect(await insideDialog(page)).toBe(true);

    await writeFile(path.join(projectDir, "scenario.txt"), "checksum\n");
    await run.click();
    await expect(dialog.locator("[data-install-error]")).toContainText("did not match the checksum");
    await expect(dialog.locator("[data-install-error]")).toContainText("Nothing was installed");
    await expect(dialog.getByRole("button", { name: "Retry" })).toBeVisible();
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(run).toBeEnabled();
    await run.click();
    await expect(page.locator("[data-probe='pdftotext']")).toHaveAttribute("data-probe-state", "ok");

    await writeFile(path.join(projectDir, "scenario.txt"), "offline\n");
    await page.getByRole("button", { name: "Install grok" }).click();
    await run.click();
    await expect(dialog.locator("[data-install-error]")).toContainText("could not reach the server");
    await expect(dialog.locator("[data-install-error]")).toContainText("Nothing was installed");
    await dialog.getByRole("button", { name: "Retry" }).click();
    await run.click();
    await expect(page.locator("[data-probe='grok']")).toHaveAttribute("data-probe-state", "ok");

    await writeFile(path.join(projectDir, "scenario.txt"), "rejected\n");
    await page.getByRole("button", { name: "Install playwright" }).click();
    await run.click();
    await expect(dialog.locator("[data-install-error]")).toContainText("evilhf.co");
    await expect(dialog.locator("[data-install-error]")).toContainText("Nothing was installed");
    await dialog.getByRole("button", { name: "Retry" }).click();
    await run.click();
    await expect(page.locator("[data-probe='playwright']")).toHaveAttribute("data-probe-state", "ok");

    await writeFile(path.join(projectDir, "scenario.txt"), "redirect\n");
    await page.getByRole("button", { name: "Install whisper" }).click();
    await expect(dialog.locator("[data-install-source]")).toContainText("us.aws.cdn.hf.co");
    await expect(dialog.locator("[data-install-source]")).toContainText("huggingface.co");
    await expect(run).toBeEnabled();
    await run.click();
    await expect(page.locator("[data-probe='whisper']")).toHaveAttribute("data-probe-state", "ok");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function brandedDocs(dialog: Locator): Locator {
  return dialog.getByRole("link", { name: "Open docs" });
}

function inkColor(link: Locator): Promise<boolean> {
  return link.evaluate((el) => {
    const color = getComputedStyle(el).color;
    return color !== "rgb(0, 0, 238)" && color !== "rgb(0, 0, 255)" && !color.startsWith("rgb(0, 0, 2");
  });
}

function filled(button: Locator): Promise<boolean> {
  return button.evaluate((el) => {
    const color = getComputedStyle(el).backgroundColor;
    return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
  });
}

function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
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
