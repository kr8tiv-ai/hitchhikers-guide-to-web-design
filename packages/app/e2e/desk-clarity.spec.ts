import { type ChildProcess, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromQa = createRequire(path.resolve(here, "../../qa/package.json"));

interface AxeNode {
  target: string[];
}

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: AxeNode[];
}

interface AxeResults {
  violations: AxeViolation[];
}

type AxeBuilderLike = { analyze(): Promise<AxeResults> };
type AxeBuilderCtor = new (options: { page: Page }) => AxeBuilderLike;

const { AxeBuilder } = requireFromQa("@axe-core/playwright") as { AxeBuilder: AxeBuilderCtor };

const VIEWS = ["/", "/brand", "/approve", "/hh-dashboard", "/settings", "/tools", "/gallery", "/motion", "/not-a-desk-page"] as const;

test.describe("desk clarity", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-clarity-"));
    const serverFile = path.resolve(here, "../src/server/server.ts");
    child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    url = await readUrl(child);
  });

  test.afterAll(async () => {
    if (child !== undefined) await stopChild(child);
    if (projectDir.length > 0) await rm(projectDir, { recursive: true, force: true });
  });

  test("the interview leads, the project bar is one row, and the composer is pinned", async ({ page }) => {
    test.setTimeout(120_000);
    await prepare(page, url);
    for (const width of [375, 1440]) {
      const height = width === 375 ? 812 : 900;
      await page.setViewportSize({ width, height });
      await showApp(page);
      const askLocator = page.locator("#hh-card-ask");
      const restartLocator = page.locator("[data-restart-open]");
      // Windows can report empty content quads for one frame after a resize.
      // Measure the frame that has both boxes. The next frame can be empty again.
      let ask = await askLocator.boundingBox();
      let restart = await restartLocator.boundingBox();
      await expect.poll(async () => {
        ask = await askLocator.boundingBox();
        restart = await restartLocator.boundingBox();
        return ask !== null && restart !== null;
      }).toBe(true);
      expect(ask, `ask at ${width}`).not.toBeNull();
      expect(restart, `restart at ${width}`).not.toBeNull();
      expect(ask!.y).toBeGreaterThanOrEqual(0);
      expect(ask!.y + ask!.height).toBeLessThanOrEqual(height);
      expect(restart!.y).toBeGreaterThanOrEqual(0);
      expect(restart!.y + restart!.height).toBeLessThanOrEqual(height);
      if (width === 375) {
        const composerLocator = page.locator(".hh-qcard__composer");
        await expect(composerLocator).toBeVisible();
        const composer = await composerLocator.boundingBox();
        expect(composer, "composer at 375").not.toBeNull();
        expect(ask!.y + ask!.height).toBeLessThanOrEqual(composer!.y + 1);
        expect(restart!.y + restart!.height).toBeLessThanOrEqual(composer!.y + 1);
        expect(composer!.y + composer!.height).toBeGreaterThan(height - 48);
        expect(composer!.y + composer!.height).toBeLessThanOrEqual(height + 1);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await showApp(page);
    const bar = page.locator("[data-tour-spot='project']");
    await expect(bar.getByRole("button", { name: "Save project" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Resume project" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Open project folder" })).toBeVisible();
    expect(await page.locator(".hh-btn--primary").count()).toBe(1);
  });

  test("tooltips follow hover and focus, and Escape closes them", async ({ page }) => {
    await prepare(page, url);
    await page.locator("html[data-tips='ready']").waitFor({ state: "attached" });
    const trigger = page.locator("[data-restart-open]");
    await trigger.hover();
    const described = await trigger.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    const tipId = described!.split(/\s+/).filter((part) => part.startsWith("hh-tip-")).at(-1);
    expect(tipId).toBeTruthy();
    const tip = page.locator(`[id="${tipId}"]`);
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute("role", "tooltip");
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();

    await trigger.focus();
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Restart the interview confirms, cancel keeps the question, and confirm returns to the first", async ({ page }) => {
    test.setTimeout(90_000);
    await prepare(page, url);
    await page.locator("#hh-card-draft").fill("Keep this answer.");
    await page.locator("[data-restart-open]").click();
    const dialog = page.locator("[data-restart-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Progress is saved");
    await expect(page.locator("[data-restart-cancel]")).toBeFocused();
    await page.locator("[data-restart-cancel]").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("Keep this answer.");

    await page.locator("#hh-card-draft").fill("For a client who sells towels.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await page.locator("[data-restart-open]").click();
    await expect(dialog).toContainText("The interview returns to the first question.");
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    const state = await readFile(path.join(projectDir, ".hitchhiker", "STATE.md"), "utf8");
    expect(state).toContain("interview:DP-0.1");
  });

  test("axe reports no serious or critical violations in light and dark", async ({ page }) => {
    test.setTimeout(180_000);
    await prepare(page, url);
    const notes: string[] = [];
    for (const route of VIEWS) {
      await page.goto(`${url}${route.replace(/^\//, "")}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-hh-ready]").first().waitFor({ state: "attached" });
      const primaries = await page.locator(".hh-btn--primary").count();
      if (route !== "/gallery" && route !== "/motion") expect(primaries, route).toBe(1);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        const results = await new AxeBuilder({ page }).analyze();
        for (const violation of results.violations) {
          if (violation.impact !== "serious" && violation.impact !== "critical") continue;
          const target = violation.nodes[0]?.target.join(" ") ?? "";
          notes.push(`${route} ${theme} ${violation.impact} ${violation.id} ${target} ${violation.help}`);
        }
      }
    }
    expect(notes).toEqual([]);
  });
});

async function showApp(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const splash = document.querySelector("[data-splash]");
    if (splash === null) return true;
    return splash.hasAttribute("data-splash-booted") && document.documentElement.hasAttribute("data-desk-ready");
  });
  const skip = page.getByRole("link", { name: "Skip to the app" });
  if (await skip.count()) {
    // Translated above the viewport, so a Playwright click cannot scroll it in.
    await skip.evaluate((link) => {
      if (link instanceof HTMLAnchorElement) link.focus();
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("#desk-heading")).toBeFocused();
  }
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-splash-cover");
    document.querySelector("[data-splash]")?.removeAttribute("data-splash-cover");
    const shell = document.querySelector(".hh-shell");
    if (shell instanceof HTMLElement) shell.scrollIntoView({ block: "start" });
  });
}

async function prepare(page: Page, url: string): Promise<void> {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-hh-ready]").first().waitFor({ state: "attached" });
  await showApp(page);
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.count()) {
    await skip.click();
    await page.locator("[data-tour]").waitFor({ state: "detached" });
  }
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
