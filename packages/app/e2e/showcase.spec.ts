import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the first screen is finished at 375 and 1440, and the tour and sample work", async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-showcase-e2e-"));
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
    await expect(page.locator("[data-tour]")).toBeVisible();
    await expect(page.getByRole("img", { name: "Don't Panic" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the sample" })).toBeVisible();
    expect(await overflows(page)).toBe(false);
    const phone = await colors(page);
    expect(phone.cream).toBe(true);
    expect(phone.rust).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await overflows(page)).toBe(false);
    await page.locator("[data-tour]").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-tour]")).toHaveAttribute("data-step", "1");
    await expect(page.getByRole("heading", { name: "The sample" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-tour]")).toHaveCount(0);
    await page.locator(".hh-desk-menu > summary").click();
    await page.getByRole("button", { name: "Replay tour" }).click();
    await expect(page.locator("[data-tour]")).toBeVisible();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.locator("[data-tour]")).toHaveCount(0);

    await page.getByRole("button", { name: "Open the sample" }).click();
    await expect(page.locator("[data-answer-text]")).toHaveText("For a client who sells towels.");
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    expect(await overflows(page)).toBe(false);

    const bad = path.join(projectDir, "bad.hhproject");
    await writeFile(bad, "{\n  \"schemaVersion\": 1,\n    at explode (bad.ts:2:1)\n}\n");
    await page.locator("#hh-open-file").fill(bad);
    await page.getByRole("button", { name: "Open project file" }).click();
    await expect(page.getByRole("heading", { name: "That file could not be opened" })).toBeVisible();
    await expect(page.getByText("Details")).toBeVisible();
    const visible = await page.locator(".hh-error").first().evaluate((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("details").forEach((item) => item.remove());
      return clone.textContent ?? "";
    });
    expect(visible.includes("at explode")).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function colors(page: Page): Promise<{ cream: boolean; rust: boolean }> {
  return page.evaluate(() => {
    const pageColor = getComputedStyle(document.documentElement).backgroundColor;
    const bodyColor = getComputedStyle(document.body).backgroundColor;
    const cream = pageColor === "rgb(243, 235, 221)" && bodyColor === "rgb(243, 235, 221)";
    const rule = document.querySelector(".hh-tour");
    const rustBorder = rule !== null && getComputedStyle(rule).borderLeftColor === "rgb(142, 47, 26)";
    const rustSpine = getComputedStyle(document.body).boxShadow.includes("rgb(142, 47, 26)");
    return { cream, rust: rustBorder && rustSpine };
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
