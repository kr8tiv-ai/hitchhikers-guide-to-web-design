/**
 * 245d. The Launch card on Approvals says what will happen, what it costs,
 * and that Hostinger is the suggested host. The yes button records a yes.
 * It does not publish. The card fits a phone.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the launch card records a yes and stays inside a phone screen", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-launch-card-"));
  writeFileSync(path.join(projectDir, "marker.txt"), "site-marker\n", "utf8");
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(new URL("/approve", url).href, { waitUntil: "domcontentloaded" });
    const card = page.locator("[data-launch-card]");
    await expect(card).toBeVisible();
    await expect(card.locator("[data-launch-happens]")).toContainText("quality check");
    await expect(card.locator("[data-launch-cost]")).toContainText("none");
    await expect(card.locator("[data-launch-cost]")).toContainText("host plan");
    await expect(card.locator("[data-launch-host]")).toContainText("Hostinger is the suggested host.");
    const button = card.locator("[data-launch-yes]");
    await expect(button).toHaveText("Yes, record the launch");
    const text = await page.locator("body").innerText();
    expect(text.includes("!")).toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.left ?? 0).toBeGreaterThanOrEqual(-1);
    expect(box?.right ?? 0).toBeLessThanOrEqual(376);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 375, height: 800 });

    await button.click();
    await expect(page.locator("[data-launch-state]")).toHaveText("Yes recorded. Nothing has been sent.");
    await expect(page.locator("[data-launch-yes]")).toBeDisabled();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "deploy", "launch-yes.json"), "utf8")) as {
      yes: boolean;
      host: string;
      cost: string;
      previewCost: string;
    };
    expect(saved.yes).toBe(true);
    expect(saved.host).toBe("hostinger");
    expect(saved.cost).toBe("host plan");
    expect(saved.previewCost).toBe("none");
    expect(existsSync(path.join(projectDir, ".hitchhiker", "deploy", "DEPLOYS.md"))).toBe(false);
    expect(readFileSync(path.join(projectDir, "marker.txt"), "utf8")).toBe("site-marker\n");
    const after = await page.locator("body").innerText();
    expect(after.includes("!")).toBe(false);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function childEnv(projectDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "HH_LIVE") continue;
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
