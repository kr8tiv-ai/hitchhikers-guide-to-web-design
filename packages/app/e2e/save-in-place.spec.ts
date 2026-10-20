import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Page, expect, test } from "@playwright/test";

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
    expect(shown.text.endsWith(shown.formatted)).toBe(true);
    expect(shown.text === `Today ${shown.formatted}` || /^\d{1,2} [A-Za-z]{3} \d{4} /.test(shown.text)).toBe(true);
    expect(shown.formatted).toMatch(/^\d{2}:\d{2}$/);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("guide effort fits a 360px screen and the choice survives a restart", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-effort-e2e-"));
  let child = startDesk(projectDir);
  try {
    let url = await readUrl(child);
    await page.setViewportSize({ width: 360, height: 740 });
    await openDesk(page, url);
    const control = page.locator("[data-effort-control]");
    await expect(control).toBeVisible();
    await expect(page.getByText("Higher is more thorough and slower.")).toBeVisible();
    await expect(page.locator('input[name="guide-effort"][value="xhigh"]')).toBeChecked();
    await assertFits(page, "[data-effort-control]");
    const options = page.locator(".hh-effort__opt");
    await expect(options).toHaveCount(3);
    for (const value of ["medium", "high", "xhigh"]) {
      await assertFits(page, `.hh-effort__opt:has(input[value="${value}"])`);
    }
    const labelFit = await options.evaluateAll((nodes) =>
      nodes.every((node) => node.scrollWidth <= node.clientWidth + 1 && node.getBoundingClientRect().height >= 44),
    );
    expect(labelFit).toBe(true);

    await page.locator('input[name="guide-effort"][value="xhigh"]').focus();
    const highPost = page.waitForResponse(
      (response) => response.url().includes("/api/effort") && response.request().method() === "POST",
    );
    await page.keyboard.press("ArrowLeft");
    expect((await highPost).ok()).toBe(true);
    await expect(page.locator('input[name="guide-effort"][value="high"]')).toBeChecked();
    await expectEffort(projectDir, "high");

    await page.reload();
    await openDesk(page, page.url());
    await expect(page.locator('input[name="guide-effort"][value="high"]')).toBeChecked();

    const mediumPost = page.waitForResponse(
      (response) => response.url().includes("/api/effort") && response.request().method() === "POST",
    );
    await page.locator('input[name="guide-effort"][value="medium"]').click();
    expect((await mediumPost).ok()).toBe(true);
    await expect(page.locator('input[name="guide-effort"][value="medium"]')).toBeChecked();
    await expectEffort(projectDir, "medium");

    await stopChild(child);
    child = startDesk(projectDir);
    url = await readUrl(child);
    await openDesk(page, url);
    await expect(page.locator('input[name="guide-effort"][value="medium"]')).toBeChecked();

    await page.goto(new URL("/settings", url).href);
    await expect(page.locator('[data-settings="effort"]')).toBeVisible();
    await expect(page.locator('[data-settings="effort"] input[value="medium"]')).toBeChecked();
    await assertFits(page, '[data-settings="effort"]');
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
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

async function openDesk(page: Page, url: string): Promise<void> {
  if (page.url() !== url) await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible()) await skip.click();
  await page.locator("[data-effort-control]").scrollIntoViewIfNeeded();
}

async function assertFits(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.width).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThanOrEqual(361);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(true);
}

async function expectEffort(projectDir: string, effort: string): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(projectDir, ".hitchhiker", "config.json"), "utf8")) as {
    effort?: string;
    ai?: { effort?: { default?: string; picked?: string } };
  };
  expect(raw.effort).toBe(effort);
  expect(raw.ai?.effort?.default).toBe(effort);
  expect(raw.ai?.effort?.picked).toBe("yes");
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
