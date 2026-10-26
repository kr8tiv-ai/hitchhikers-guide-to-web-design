/**
 * PERF-001. A slow answer shows the stage and the elapsed seconds
 * before the next question arrives. No percentage.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("a slow answer shows the stage and elapsed seconds before the next question", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-progress-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await page.locator("#hh-card-draft").fill("For myself.");
    await page.locator('[data-action="answer"]').click();
    const reading = page.locator("[data-guide-reading]");
    await expect(reading).toContainText("Checking your answer");
    await expect(reading).toContainText(/· [1-9]\d*s/);
    await expect(reading).not.toContainText("%");
    await expect(page.locator('[data-question-id="DP-0.2"]')).toHaveCount(0);
    await expect(page.locator('[data-question-id="DP-0.2"]')).toBeVisible();
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

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
        if (req.task === "pushback-judge") {
          await new Promise((resolve) => setTimeout(resolve, 2200));
          return hit({ vague: false, quote: "", sharperChoice: "" });
        }
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
