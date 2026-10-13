import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test.use({ timezoneId: "America/Costa_Rica" });

test("save stays on question 3 with the draft and a local time", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-save-e2e-"));
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

  try {
    const url = await readUrl(child);
    await page.clock.install({ time: new Date("2026-06-15T18:30:00.000Z") });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await page.locator("[data-question-id='DP-0.1']").waitFor();
    await expect(page.locator("[data-tour]")).toHaveCount(0);

    await page.locator("#hh-card-draft").fill("For myself.");
    await page.locator('[data-action="answer"]').click();
    await page.locator("[data-question-id='DP-0.2']").waitFor();
    await page.locator("#hh-card-draft").fill("One old page, built in a site builder.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-card-progress]")).toContainText("Question 3 of");

    const questionId = await page.locator("[data-question-id]").getAttribute("data-question-id");
    const header = await page.locator("#hh-card-ask").innerText();
    const hereUrl = page.url();
    await page.locator("#hh-card-draft").fill("Keep this unsent.");
    await page.getByRole("button", { name: "Save project" }).click();
    await expect(page.locator("[data-save-status]")).toContainText("Saved ·");

    expect(page.url()).toBe(hereUrl);
    await expect(page.locator("[data-question-id]")).toHaveAttribute("data-question-id", questionId ?? "");
    await expect(page.locator("#hh-card-ask")).toHaveText(header);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Keep this unsent.");
    await expect(page.locator("[data-tour]")).toHaveCount(0);
    const status = await page.locator("[data-save-status]").innerText();
    expect(status.includes("UTC")).toBe(false);
    const shown = await page.locator("[data-save-status] time").evaluate((node) => {
      const iso = node.getAttribute("datetime") ?? "";
      const formatted = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso));
      return { formatted, text: node.textContent ?? "" };
    });
    expect(shown.text).toBe(shown.formatted);
    expect(shown.formatted).toMatch(/^\d{2}:\d{2}$/);
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
