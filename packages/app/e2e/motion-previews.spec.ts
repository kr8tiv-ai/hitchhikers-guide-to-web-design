import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("motion previews, the appetite slider, and reduced-motion stills at 375 and 1440", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-motion-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  try {
    const url = await readUrl(child);
    await mkdir(path.join(here, "screens"), { recursive: true });
    await exercise(page, url, 375, path.join(here, "screens", "motion-375.png"), errors);
    await exercise(page, url, 1440, path.join(here, "screens", "motion-1440.png"), errors);
    await expectReduced(browser, url, errors);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
  }
});

async function exercise(
  page: Page,
  url: string,
  width: number,
  shot: string,
  errors: string[],
): Promise<void> {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
  await page.goto(`${url}motion`);
  await expect(page.locator("#hh-motion")).toBeVisible();
  await expect(page.getByText("Magnetic buttons are banned.")).toBeVisible();
  await expect(page.locator("[data-magnetic]")).toHaveCount(0);
  await expect(page.locator("[data-family]")).toHaveCount(10);
  await settlePreviews(page);
  await page.locator("#hh-appetite").fill("1");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-ceiling-level", "1");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-webgl", "false");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-max-js", "90");
  await expect(page.locator("[data-appetite-webgl]")).toHaveText("WebGL in the ceiling: no.");
  await page.locator("#hh-appetite").fill("10");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-ceiling-level", "10");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-webgl", "true");
  await expect(page.locator("#hh-appetite-panel")).toHaveAttribute("data-max-js", "250");
  await expect(page.locator("[data-appetite-webgl]")).toHaveText("WebGL in the ceiling: yes, one context.");
  await expect(page.locator("[data-family='tiny-fade']")).toHaveAttribute("data-in-range", "true");
  await expect(page.locator("[data-live='true']").first()).toBeVisible({ timeout: 20_000 });
  const liveWebgl = await page.locator("[data-webgl-live='true']").count();
  expect(liveWebgl).toBeLessThanOrEqual(1);
  const text = await page.locator("#hh-motion").innerText();
  expect(text.includes("!")).toBe(false);
  expect(text.includes("This preview stayed on the still.")).toBe(false);
  expect(text.includes("could not start")).toBe(false);
  expect(text.includes("The timeline state is missing.")).toBe(false);
  expect(await fits(page)).toBe(true);
  await reviveShader(page);
  await page.screenshot({ path: shot, fullPage: true });
  expect(errors).toEqual([]);
}

async function expectReduced(browser: Browser, url: string, errors: string[]): Promise<void> {
  const reduced = await browser.newPage();
  reduced.on("pageerror", (error) => {
    errors.push(error.message);
  });
  try {
    await reduced.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await reduced.setViewportSize({ width: 375, height: 812 });
    await reduced.goto(`${url}motion`);
    await expect(reduced.locator("[data-still='true']")).toHaveCount(10);
    await expect(reduced.locator("[data-live='true']")).toHaveCount(0);
    await expect(reduced.locator("[data-webgl-live='true']")).toHaveCount(0);
    await expect(reduced.getByText("Still. Motion is reduced.").first()).toBeVisible();
    expect(await fits(reduced)).toBe(true);
  } finally {
    await reduced.close();
  }
}

async function reviveShader(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const shader = document.querySelector("[data-family='shader']");
    shader?.scrollIntoView({ block: "center" });
    const frame = shader?.querySelector("[data-mount]");
    const start = performance.now();
    while (
      frame instanceof HTMLElement &&
      frame.dataset.webglLive !== "true" &&
      !(frame.dataset.still === "true" && (frame.textContent ?? "").includes("WebGL is not available")) &&
      performance.now() - start < 8000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
}

async function settlePreviews(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const cards = [...document.querySelectorAll("[data-family]")];
    for (const card of cards) {
      card.scrollIntoView({ block: "center" });
      const frame = card.querySelector("[data-mount]");
      const start = performance.now();
      while (
        frame instanceof HTMLElement &&
        frame.dataset.live !== "true" &&
        frame.dataset.still !== "true" &&
        performance.now() - start < 8000
      ) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    const shader = document.querySelector("[data-family='shader']");
    shader?.scrollIntoView({ block: "center" });
    const frame = shader?.querySelector("[data-mount]");
    const start = performance.now();
    while (
      frame instanceof HTMLElement &&
      frame.dataset.webglLive !== "true" &&
      !(frame.dataset.still === "true" && (frame.textContent ?? "").includes("WebGL is not available")) &&
      performance.now() - start < 8000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
  await expect(page.locator("[data-mount][data-live='true'], [data-mount][data-still='true']")).toHaveCount(10);
}

async function fits(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
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
    }, 30_000);
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
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
