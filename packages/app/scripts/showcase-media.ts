/**
 * Drive the desk through the sample and write README media.
 * Playwright only. No ffmpeg and no new package.
 *
 *   node --experimental-strip-types packages/app/scripts/showcase-media.ts
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { decodePng, encodeShowcaseGif, fitWidth, padHeight, type Raster } from "./gif.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const outDir = path.join(repoRoot, "docs", "assets");
const GIF_WIDTH = 640;

export const SHOWCASE_SHOTS = [
  { id: "desk-empty", file: "desk-empty.png", width: 1440 },
  { id: "sample-open", file: "sample-open.png", width: 1440 },
  { id: "tour", file: "tour.png", width: 1440 },
  { id: "desk-phone", file: "desk-phone.png", width: 375 },
  { id: "demo", file: "demo.gif", width: GIF_WIDTH },
] as const;

async function main(): Promise<void> {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-showcase-media-"));
  const desk = await startDesk(projectDir);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.goto(desk.url, { waitUntil: "networkidle" });
    await page.locator("[data-tour]").focus();
    const frames: Raster[] = [];
    for (let step = 0; step < 6; step += 1) {
      await page.locator("[data-tour]").focus();
      frames.push(await frameOf(page));
      if (step < 5) await page.keyboard.press("ArrowRight");
    }
    await page.screenshot({ path: path.join(outDir, "tour.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(outDir, "desk-phone.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-tour]").focus();
    await page.keyboard.press("Escape");
    await page.waitForSelector("[data-tour]", { state: "detached" });
    await page.screenshot({ path: path.join(outDir, "desk-empty.png") });
    await page.getByRole("button", { name: "Open the sample" }).click();
    await page.locator("[data-answer-text]").filter({ hasText: "For a client who sells towels." }).waitFor();
    await page.screenshot({ path: path.join(outDir, "sample-open.png") });
    frames.push(await frameOf(page));
    const height = Math.max(...frames.map((item) => item.height));
    const gif = encodeShowcaseGif(frames.map((item) => padHeight(item, height)), 45);
    await writeFile(path.join(outDir, "demo.gif"), gif);
    let total = 0;
    for (const shot of SHOWCASE_SHOTS) {
      const info = await stat(path.join(outDir, shot.file));
      total += info.size;
      process.stdout.write(`${shot.file} ${info.size}\n`);
    }
    process.stdout.write(`total ${total}\n`);
    if (total > 8 * 1024 * 1024) throw new Error(`docs/assets showcase media is ${total} bytes.`);
  } finally {
    await browser.close();
    await desk.stop();
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function frameOf(page: Page): Promise<Raster> {
  const png = await page.screenshot({ type: "png" });
  return fitWidth(decodePng(png), GIF_WIDTH);
}

async function startDesk(projectDir: string): Promise<{ url: string; stop: () => Promise<void> }> {
  await mkdir(outDir, { recursive: true });
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
  const url = await readUrl(child);
  return {
    url,
    stop: async () => {
      await stopChild(child);
    },
  };
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

const entry = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) {
  await main();
}
