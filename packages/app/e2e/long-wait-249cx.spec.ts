/**
 * 249cx. The long-wait note and Try again must not change the question area's height.
 * The idle desk is the identity baseline. A pending check keeps that height when the
 * minutes counter passes 60s, the note appears at 120s, and Try again appears at 300s
 * after the server cap (600s) while the check is still running.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTE = "This one is taking longer than usual. Your answer is saved; you can wait or leave the desk open and come back.";

test("the question area stays the same height while the long-wait note and Try again appear", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const size of [
    { name: "phone", width: 375, height: 812 },
    { name: "desk", width: 1440, height: 900 },
  ]) {
    // A fresh project each time. The check leaves one request open, so a second
    // load of the same desk is no longer the idle card and never goes quiet.
    await runSize(browser, size);
  }
});

async function runSize(
  browser: Browser,
  size: { name: string; width: number; height: number },
): Promise<void> {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-249cx-"));
  const child = startDesk(projectDir);
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    const url = await readUrl(child);
    await page.goto(url, { waitUntil: "networkidle" });
    await settle(page);
    const idle = await regionHeight(page);
    await pauseClock(page);
    await page.locator("#hh-card-draft").fill("For myself.");
    await page.locator('[data-action="answer"]').click();
    const reading = page.locator(".hh-qcard__actions > [data-guide-reading]");
    await expect(reading).toContainText("Checking your answer");
    await expect(reading).toHaveAttribute("aria-live", "polite");
    await expectSameHeight(page, idle, `${size.name} reading`);
    await page.clock.fastForward(61_000);
    await expect(reading).toContainText(/1 min \d\d s/);
    await expect(page.locator("[data-long-wait='1']")).toHaveCount(0);
    await expectSameHeight(page, idle, `${size.name} minutes`);
    await page.clock.fastForward(64_000);
    await expect(reading).toContainText(/2 min \d\d s/);
    const note = page.locator("[data-long-wait='1']");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(NOTE);
    await expect(page.locator("[data-long-wait-retry]")).toHaveCount(0);
    await expectSameHeight(page, idle, `${size.name} note`);
    await expectNoCover(page, size.name);
    await page.clock.fastForward(480_000);
    const retry = page.locator("[data-long-wait-retry]");
    await expect(retry).toBeVisible();
    await expect(retry).toHaveText("Try again");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(NOTE);
    await expectSameHeight(page, idle, `${size.name} retry`);
    const box = await retry.boundingBox();
    expect(box, `${size.name} retry box`).toBeTruthy();
    expect(box!.width, `${size.name} retry width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${size.name} retry height`).toBeGreaterThanOrEqual(44);
    await retry.focus();
    await expect(retry).toBeFocused();
    await expectNoCover(page, size.name);
    expect(await horizontalScroll(page), `${size.name} horizontal scroll`).toBe(false);
    expect(await clipped(page), `${size.name} clipped note`).toBe(false);
  } finally {
    await context.close();
    await stopChild(child);
    await removeTempDir(projectDir);
  }
}

async function settle(page: Page): Promise<void> {
  await page.locator("[data-hh-ready]").first().waitFor({ state: "attached" });
  await page.waitForFunction(() => {
    const splash = document.querySelector("[data-splash]");
    if (splash === null) return true;
    return splash.hasAttribute("data-splash-booted") && document.documentElement.hasAttribute("data-desk-ready");
  });
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    document.documentElement.removeAttribute("data-splash-cover");
    document.querySelector("[data-splash]")?.removeAttribute("data-splash-cover");
    const shell = document.querySelector(".hh-shell");
    if (shell instanceof HTMLElement) shell.scrollIntoView({ block: "start" });
  });
}

async function pauseClock(page: Page): Promise<void> {
  try {
    await page.clock.install();
  } catch {
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now);
  }
}

async function regionHeight(page: Page): Promise<number> {
  return page.locator("[data-region='question']").evaluate((el) => el.getBoundingClientRect().height);
}

async function expectSameHeight(page: Page, idle: number, label: string): Promise<void> {
  const height = await regionHeight(page);
  expect(Math.abs(height - idle), `${label} h ${height} vs ${idle}`).toBeLessThanOrEqual(1);
}

async function horizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function clipped(page: Page): Promise<boolean> {
  return page.locator("[data-long-wait='1']").evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
}

async function expectNoCover(page: Page, label: string): Promise<void> {
  const hits = await page.evaluate(() => {
    const targets = [...document.querySelectorAll<HTMLElement>("[data-long-wait='1'], [data-long-wait-retry]")];
    const hidden = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return true;
      for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.visibility === "hidden" || parentStyle.display === "none") return true;
      }
      return false;
    };
    const intersects = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    const hits: string[] = [];
    const candidates = [...document.querySelectorAll<HTMLElement>("button, a, input, textarea, summary, select, p, h1, h2, h3, li, label, span")];
    for (const target of targets) {
      if (hidden(target)) continue;
      const targetName = target.hasAttribute("data-long-wait-retry") ? "retry" : "note";
      const targetBox = target.getBoundingClientRect();
      for (const candidate of candidates) {
        if (target === candidate || target.contains(candidate) || candidate.contains(target)) continue;
        if (hidden(candidate)) continue;
        const range = document.createRange();
        range.selectNodeContents(candidate);
        const rects = range.getClientRects();
        const boxes = rects.length > 0 ? [...rects] : [candidate.getBoundingClientRect()];
        for (const box of boxes) {
          if (box.width < 2 || box.height < 2 || !intersects(targetBox, box)) continue;
          const x = Math.min(Math.max(box.left, targetBox.left) + 1, box.right - 1);
          const y = Math.min(Math.max(box.top, targetBox.top) + 1, box.bottom - 1);
          const top = document.elementFromPoint(x, y);
          if (top === null || (top !== target && !target.contains(top))) continue;
          const outside = [...boxes].some((item) => {
            const cx = item.left + item.width / 2;
            const cy = item.top + item.height / 2;
            if (cx >= targetBox.left && cx <= targetBox.right && cy >= targetBox.top && cy <= targetBox.bottom) return false;
            const seen = document.elementFromPoint(cx, cy);
            return seen === candidate || candidate.contains(seen);
          });
          if (!outside && !candidate.matches("button, a, input, textarea, summary, select")) continue;
          hits.push(`${targetName} covers ${(candidate.getAttribute("class") || candidate.tagName).slice(0, 40)}`);
          break;
        }
      }
    }
    return hits;
  });
  expect(hits, `${label} overlap`).toEqual([]);
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
        if (req.task === "guide-message") return new Promise(() => {});
        if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
        return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
      },
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
      reject(new Error(`desk exited ${code ?? "null"}\\n${stderr}\\n${stdout}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
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
