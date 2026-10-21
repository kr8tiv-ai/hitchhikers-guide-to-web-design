/**
 * Desk Run 9. Escape closes the tour from the body. Enter the Guide
 * scrolls the tour into view. Phone widths do not clip links or icons.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const PHONES = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

test.describe("desk run 9", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-run9-"));
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
    if (projectDir.length > 0) await rm(projectDir, { recursive: true, force: true });
  });

  test("Enter the Guide scrolls the tour into view at 375 and 1440", async ({ page }) => {
    test.setTimeout(90_000);
    for (const size of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await enterGuide(page);
      await expectTourInView(page);
    }
  });

  test("phone widths keep links and icons inside their clip and the viewport", async ({ page }) => {
    test.setTimeout(120_000);
    for (const size of PHONES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await enterGuide(page);
      await expectTourInView(page);
      await page.locator("#desk-heading").evaluate((node) => {
        node.scrollIntoView({ block: "start", inline: "nearest" });
      });
      expect(await clippedControls(page), `${size.width} first screen`).toEqual([]);
      await page.locator(".hh-desk-menu > summary").click();
      expect(await clippedControls(page), `${size.width} menu`).toEqual([]);
      await page.locator("[data-tour]").evaluate((node) => {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      expect(await clippedControls(page), `${size.width} tour`).toEqual([]);
      await page.locator("[data-tour-spot='project']").evaluate((node) => {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      expect(await clippedControls(page), `${size.width} project bar`).toEqual([]);
    }
  });

  // Escape submits the skip form and stores tourSeen. Keep it last so earlier
  // loads in this file still render the plate.
  test("Escape with focus on the body closes the tour and leaves the splash key alone", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("[data-splash-booted]").waitFor();
    await page.locator("[data-tour]").waitFor();
    await focusBody(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("html")).toHaveAttribute("data-splash-cover", "");
    await expect(page.locator("[data-tour]")).toHaveCount(1);

    await enterGuide(page);
    await expectTourInView(page);
    await focusBody(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-tour]")).toHaveCount(0);
  });
});

async function enterGuide(page: Page): Promise<void> {
  await page.locator("[data-splash-booted]").waitFor();
  await page.locator("[data-hh-ready]").waitFor();
  await page.getByRole("button", { name: "Enter the Guide" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-splash-cover", "");
}

async function expectTourInView(page: Page): Promise<void> {
  let last = "unread";
  try {
    await expect.poll(async () => {
      last = await page.evaluate(() => {
        const node = document.querySelector("[data-tour]");
        if (node === null) return "missing";
        const box = node.getBoundingClientRect();
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const visibleH = Math.min(box.bottom, viewH) - Math.max(box.top, 0);
        const fits = box.height <= viewH + 1;
        const placed = box.width >= 1 && box.height >= 1 && (
          fits
            ? box.top >= -1 && box.bottom <= viewH + 1 && box.left >= -1 && box.right <= viewW + 1
            : box.top >= -1 && box.top < viewH * 0.35 && visibleH > 48
        );
        if (placed) return "ok";
        return `top ${box.top.toFixed(0)} bottom ${box.bottom.toFixed(0)} h ${box.height.toFixed(0)} left ${box.left.toFixed(0)} right ${box.right.toFixed(0)} view ${viewW}x${viewH} scroll ${window.scrollY.toFixed(0)}`;
      });
      return last;
    }, { timeout: 5_000 }).toBe("ok");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`tour not in view (${last}). ${reason}`);
  }
}

async function focusBody(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
}

async function clippedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const desk = document.querySelector(".hh-shell");
    if (desk === null) return ["missing .hh-shell"];
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const problems: string[] = [];
    const nodes = desk.querySelectorAll("a, button, svg");
    for (const node of nodes) {
      if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue;
      if (!shown(node)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const hitsX = box.right > 1 && box.left < viewW - 1;
      const hitsY = box.bottom > 1 && box.top < viewH - 1;
      if (!hitsX || !hitsY) continue;
      const name = label(node);
      if (box.left < -1 || box.right > viewW + 1) {
        problems.push(`${name} extends past the viewport horizontally`);
      }
      const fixed = getComputedStyle(node).position === "fixed" || getComputedStyle(node).position === "sticky";
      if (fixed && (box.top < -1 || box.bottom > viewH + 1)) {
        problems.push(`${name} is fixed and extends past the viewport`);
      }
      let parent: Element | null = node.parentElement;
      while (parent !== null) {
        const style = getComputedStyle(parent);
        const clipsX = clips(style.overflowX);
        const clipsY = clips(style.overflowY);
        if (clipsX || clipsY) {
          const edge = padBox(parent);
          if (clipsX && (box.left < edge.left - 1 || box.right > edge.right + 1)) {
            problems.push(`${name} is clipped horizontally by ${ancestorName(parent)}`);
            break;
          }
          if (clipsY && (box.top < edge.top - 1 || box.bottom > edge.bottom + 1)) {
            problems.push(`${name} is clipped vertically by ${ancestorName(parent)}`);
            break;
          }
        }
        parent = parent.parentElement;
      }
    }
    return problems;

    function clips(value: string): boolean {
      return value === "hidden" || value === "clip" || value === "scroll" || value === "auto";
    }

    function shown(node: Element): boolean {
      if (node.closest("[hidden]") !== null) return false;
      const closed = node.closest("details:not([open])");
      if (closed !== null && node.closest("summary") === null) return false;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      return true;
    }

    function padBox(node: Element): { left: number; right: number; top: number; bottom: number } {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const left = Number.parseFloat(style.borderLeftWidth) || 0;
      const right = Number.parseFloat(style.borderRightWidth) || 0;
      const top = Number.parseFloat(style.borderTopWidth) || 0;
      const bottom = Number.parseFloat(style.borderBottomWidth) || 0;
      return {
        left: rect.left + left,
        right: rect.right - right,
        top: rect.top + top,
        bottom: rect.bottom - bottom,
      };
    }

    function label(node: Element): string {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const tag = node.tagName.toLowerCase();
      return text.length > 0 ? `${tag} "${text}"` : tag;
    }

    function ancestorName(node: Element): string {
      const id = node.id === "" ? "" : `#${node.id}`;
      const cls = node.className && typeof node.className === "string" ? `.${node.className.split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    }
  });
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
