/**
 * DON'T PANIC splash (242c). The hero sits above the desk. Entering it
 * scrolls to the app and focuses the first heading. Reduced motion keeps
 * the poster. Scrolling past pauses the video and the WebGL loop.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

test.describe("don't panic splash", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-splash-"));
    const serverFile = path.resolve(here, "../src/server/server.ts");
    child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    url = await readUrl(child);
  });

  test.afterAll(async () => {
    if (child !== undefined) await stopChild(child);
    if (projectDir.length > 0) await removeTempDir(projectDir);
  });

  test("the splash shows both lines and the cosmos loop by default", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "DON'T PANIC" })).toBeVisible();
      await expect(page.locator(".hh-splash__sub")).toHaveText("The Hitchhiker's Guide to Web Design");
      await expect(page.locator("[data-splash]")).toHaveAttribute("data-splash-loop", "cosmos");
      await expect(page.locator(".hh-splash__media img")).toHaveAttribute("src", /cosmos-poster/);
      const source = page.locator("[data-splash-video] source").first();
      await expect(source).toHaveAttribute("src", /cosmos-720/, { timeout: 20_000 });
    }
    expect(errors).toEqual([]);
  });

  test("the nebula query selects the alternate loop", async ({ page }) => {
    test.setTimeout(90_000);
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`${url}?splash=nebula`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-splash]")).toHaveAttribute("data-splash-loop", "nebula");
      await expect(page.locator(".hh-splash__media img")).toHaveAttribute("src", /nebula-poster/);
      await expect(page.locator("[data-splash-video] source").first()).toHaveAttribute("src", /nebula-720/, { timeout: 20_000 });
    }
  });

  test("Enter the Guide and the skip link move focus to the app heading", async ({ page }) => {
    test.setTimeout(90_000);
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("[data-splash-booted]").waitFor();
      await page.locator("[data-hh-ready]").waitFor();
      const cue = page.getByRole("button", { name: "Enter the Guide" });
      await cue.focus();
      await page.keyboard.press(size.width === 768 ? "Space" : "Enter");
      await expect(page.locator("#desk-heading")).toBeFocused();
      await expectHeadingInView(page);

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("[data-splash-booted]").waitFor();
      await page.locator("[data-hh-ready]").waitFor();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to the app" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#desk-heading")).toBeFocused();
      await expectHeadingInView(page);
    }
  });

  test("reduced motion shows the poster without video or WebGL", async ({ page }) => {
    test.setTimeout(90_000);
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("[data-splash-booted]").waitFor();
      await expect(page.locator("[data-splash]")).toHaveAttribute("data-splash-still", "");
      await expect(page.locator(".hh-splash__media img")).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(0);
      const playing = await page.locator("[data-splash-video]").evaluate((node) => {
        const video = node as HTMLVideoElement;
        return video.paused === false || video.currentSrc !== "";
      });
      expect(playing).toBe(false);
    }
  });

  test("scrolling past the splash pauses the video and the render loop", async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("[data-splash-gl]").waitFor({ timeout: 30_000 });
      await expect.poll(async () => page.locator("[data-splash-video]").evaluate((node) => {
        const video = node as HTMLVideoElement;
        return video.paused === false && video.readyState >= 2;
      }), { timeout: 30_000 }).toBe(true);
      await expect(page.locator("[data-splash-gl]")).toHaveAttribute("data-gl-state", "running");
      await page.evaluate(() => {
        document.querySelector(".hh-shell")?.scrollIntoView({ block: "start" });
      });
      await expect.poll(async () => page.locator("[data-splash-video]").evaluate((node) => (node as HTMLVideoElement).paused), { timeout: 5_000 }).toBe(true);
      await expect(page.locator("[data-splash-gl]")).toHaveAttribute("data-gl-state", "paused");
    }
  });
});

async function expectHeadingInView(page: Page): Promise<void> {
  await expect.poll(async () => {
    const box = await page.locator("#desk-heading").boundingBox();
    if (box === null) return -1;
    return box.y >= 0 && box.y < 240 ? box.y : -1;
  }).toBeGreaterThanOrEqual(0);
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
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
