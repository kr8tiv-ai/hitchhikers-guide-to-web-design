/**
 * BUG-067. After Create project and after Replay tour, the tour sits in the viewport
 * and focus is inside it. 1440x900 and 390x844. The model is stubbed.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

test("the tour is in view and focused after create and replay", async ({ page }) => {
  test.setTimeout(120_000);
  const sandbox = await mkdtemp(path.join(tmpdir(), "hh-tour-243a-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const env = { ...process.env };
  delete env.HH_CASSETTE;
  delete env.HH_GUIDE_CASSETTE;
  env.HH_DESK_DIR = repo;
  env.HH_E2E_PROJECT = sandbox;
  env.HH_PROJECT_HOME = path.join(sandbox, ".hh-save-home");
  env.HH_E2E_SERVER = pathToFileURL(serverFile).href;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const url = await readUrl(child);
    const viewports: { width: number; height: number; name: string; reduced: boolean }[] = [
      { width: 1440, height: 900, name: "Wide Desk", reduced: false },
      { width: 390, height: 844, name: "Phone Desk", reduced: true },
    ];
    for (const [index, viewport] of viewports.entries()) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ reducedMotion: viewport.reduced ? "reduce" : "no-preference" });
      if (index === 0) await page.goto(url);
      else await page.locator(".hh-project__new > summary").click();
      const dest = path.join(sandbox, "sites", viewport.name.toLowerCase().replace(/\s+/g, "-"));
      await page.locator("#hh-new-name").fill(viewport.name);
      await page.locator("#hh-new-dir").fill(dest);
      await page.getByRole("button", { name: "Create project" }).click();
      await page.waitForURL(/[?&]tour=1(?:&|$)/);
      await expectTourLanded(page);

      await page.locator(".hh-desk-menu > summary").click();
      await page.getByRole("button", { name: "Replay tour" }).click();
      await page.waitForURL(/[?&]tour=1(?:&|$)/);
      await expectTourLanded(page);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-tour]")).toHaveCount(0);
  } finally {
    await stopChild(child);
    await removeTempDir(sandbox);
  }
});

async function expectTourLanded(page: Page): Promise<void> {
  let last = "unread";
  try {
    await expect.poll(async () => {
      last = await page.evaluate(() => {
        const node = document.querySelector("[data-tour]");
        if (node === null) return "missing";
        const box = node.getBoundingClientRect();
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const inside =
          box.width >= 1 &&
          box.height >= 1 &&
          box.top >= -1 &&
          box.left >= -1 &&
          box.bottom <= viewH + 1 &&
          box.right <= viewW + 1;
        const active = document.activeElement;
        const focused = active instanceof Element && active.closest("[data-tour]") !== null;
        if (inside && focused) return "ok";
        const name = active instanceof Element ? active.tagName : "none";
        return `top ${box.top.toFixed(0)} bottom ${box.bottom.toFixed(0)} h ${box.height.toFixed(0)} left ${box.left.toFixed(0)} right ${box.right.toFixed(0)} view ${viewW}x${viewH} scroll ${window.scrollY.toFixed(0)} focus ${name} focused ${focused}`;
      });
      return last;
    }, { timeout: 8_000 }).toBe("ok");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`tour not landed (${last}). ${reason}`);
  }
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_DESK_DIR;
    const loaded = await import(specifier);
    const think = async () => {
      throw new Error("this tour test does not call a model");
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
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
  child.kill();
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
