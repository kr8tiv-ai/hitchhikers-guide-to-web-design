/**
 * 247b. The towel sample on the desk at a phone width and a desk width.
 * Discovery shows its progress. After the fixture walk, Drive and Launch
 * say what happens next, and nothing runs off the screen.
 * This spec does not call a host and does not bind port 4175.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hiddenChildOptions, packagedModule, restoreProject } from "@hitchhiker/engine";
import { expect, test, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = path.resolve(here, "../../../samples/towel-day.hhproject");
const WIDTHS = [375, 1440] as const;

/** Public orchestrator entry. A relative import of that package is an escape. */
async function runGoldenPath(input: { projectDir: string; samplePath: string }): Promise<void> {
  const href = pathToFileURL(packagedModule("orchestrator", "src/index.ts")).href;
  const loaded: unknown = await import(href);
  if (loaded === null || typeof loaded !== "object" || !("runGoldenPath" in loaded)) {
    throw new Error("The golden path is not on the orchestrator entry.");
  }
  const run = loaded.runGoldenPath;
  if (typeof run !== "function") {
    throw new Error("The golden path is not on the orchestrator entry.");
  }
  await run(input);
}

test.describe("golden path on the desk", () => {
  test.describe.configure({ timeout: 300_000 });

  test("discovery shows the question count at 375 and 1440", async ({ page }) => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-golden-desk-"));
    await restoreProject(sample, { projectDir, prefer: "file" });
    const child = startDesk(projectDir);
    try {
      const url = await readUrl(child);
      assertPort(url);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width === 375 ? 700 : 900 });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await dismissTour(page);
        await expect(page.locator("[data-card-progress]")).toContainText(/Question \d+ of \d+/);
        await expect(page.locator("[data-card-progress]")).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        if (width === 375) {
          const summary = page.locator(".hh-map-fold > summary");
          await expect(summary).toBeVisible();
          const summaryBox = await summary.boundingBox();
          expect(summaryBox).not.toBeNull();
          expect(summaryBox?.right ?? 0).toBeLessThanOrEqual(width + 1);
          await summary.click();
        }
        const phase = page.locator(".hh-map__name", { hasText: "So Long and Thanks for All the Fish" });
        await expect(phase).toBeVisible();
        const box = await phase.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.right ?? 0).toBeLessThanOrEqual(width + 1);
        const note = page.locator(".hh-map__note").first();
        await expect(note).toBeVisible();
        const noteBox = await note.boundingBox();
        expect(noteBox?.right ?? 0).toBeLessThanOrEqual(width + 1);
      }
    } finally {
      await stopChild(child);
      await removeTempDir(projectDir);
    }
  });

  test("Drive and Launch name the next step at 375 and 1440", async ({ page }) => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "hh-golden-walk-"));
    const childRef: { child?: ChildProcess } = {};
    try {
      await runGoldenPath({ projectDir, samplePath: sample });
      const child = startDesk(projectDir);
      childRef.child = child;
      const url = await readUrl(child);
      assertPort(url);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width === 375 ? 700 : 900 });
        await page.goto(new URL("/approve", url).href, { waitUntil: "domcontentloaded" });
        const launch = page.locator("[data-launch-card] [data-journey]");
        await expect(launch).toBeVisible();
        const launchText = await launch.innerText();
        expect(launchText).toContain("quality check");
        expect(launchText).toContain("preview");
        expect(launchText.includes("!")).toBe(false);
        expect(launchText.includes("\u2014")).toBe(false);
        expect(await overflow(page)).toBeLessThanOrEqual(1);

        await page.goto(new URL("/hh-dashboard", url).href, { waitUntil: "domcontentloaded" });
        const drive = page.locator("[data-journey]");
        await expect(drive).toBeVisible();
        const driveText = await drive.innerText();
        expect(driveText).toContain("quality check");
        expect(driveText).toContain("keep or undo");
        expect(driveText.includes("!")).toBe(false);
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        const button = page.locator(".hh-status .hh-btn").first();
        if ((await button.count()) > 0) {
          const buttonBox = await button.boundingBox();
          expect(buttonBox?.right ?? 0).toBeLessThanOrEqual(width + 1);
        }
      }
    } finally {
      if (childRef.child !== undefined) await stopChild(childRef.child);
      await removeTempDir(projectDir);
    }
  });
});

function assertPort(url: string): void {
  const port = new URL(url).port;
  expect(port).not.toBe("4175");
}

async function dismissTour(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip tour" });
  try {
    await skip.click({ timeout: 2_000 });
  } catch {
    // A restored sample can open past the tour.
  }
}

function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function childEnv(projectDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "HH_LIVE" || key === "HH_CASSETTE") continue;
    env[key] = value;
  }
  env.HH_E2E_PROJECT = projectDir;
  env.HH_E2E_SERVER = pathToFileURL(path.resolve(here, "../src/server/server.ts")).href;
  return env;
}

function startDesk(projectDir: string): ChildProcess {
  return spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    hiddenChildOptions({
      env: childEnv(projectDir),
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
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
