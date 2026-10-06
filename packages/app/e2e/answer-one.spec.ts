import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("answers DP-0.1 at 375 and shows the next question at 1440", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-"));
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
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    await expect(page.locator("#hh-card-ask")).toContainText("Is this site for you, or for a client?");
    const fits = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth <= root.clientWidth + 1;
    });
    expect(fits).toBe(true);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.screenshot({
      path: path.join(here, "screens", "desk-375.png"),
      fullPage: true,
    });

    await page.locator("#hh-card-draft").fill("For myself.");
    await expect(page.locator('[data-action="answer"]')).toBeEnabled();
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("#hh-card-ask")).toContainText("Have you built a website before");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.finish();
    });
    await page.screenshot({
      path: path.join(here, "screens", "desk-1440.png"),
      fullPage: true,
    });

    const state = await readFile(path.join(projectDir, ".hitchhiker", "STATE.md"), "utf8");
    expect(state).toContain("interview:DP-0.2");
    expect(state).toContain("Answer DP-0.2.");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

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
