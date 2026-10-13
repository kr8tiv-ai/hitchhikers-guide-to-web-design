/**
 * BUG-007. After load and after resume the question heading is in view.
 * The first-five-minutes tour does not receive focus.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("load and resume keep the question in view", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-focus-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openAndCheck(page, url, { width: 1024, height: 640 });
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expectQuestionInView(page, 640);
    await openAndCheck(page, url, { width: 390, height: 640 });
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function openAndCheck(page: Page, url: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  await expectQuestionInView(page, viewport.height);
}

async function expectQuestionInView(page: Page, height: number): Promise<void> {
  const box = await page.locator("#hh-card-ask").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(height);
  const placed = await page.evaluate(() => {
    const heading = document.querySelector("#hh-card-ask");
    const active = document.activeElement;
    const top = heading === null ? 0 : heading.getBoundingClientRect().top + window.scrollY;
    return {
      scrollY: window.scrollY,
      top,
      tour: active?.closest("[data-tour]") != null,
      id: active instanceof HTMLElement ? active.id : "",
    };
  });
  expect(placed.scrollY).toBeLessThanOrEqual(placed.top + 1);
  expect(placed.scrollY + height).toBeGreaterThan(placed.top);
  expect(placed.tour).toBe(false);
  expect(placed.id === "hh-card-ask" || placed.id === "hh-card-draft").toBe(true);
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
