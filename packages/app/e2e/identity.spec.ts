import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Browser, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface InstallabilityReport {
  installabilityErrors: { errorId: string }[];
}

interface AppManifestReport {
  url?: string;
  data?: string;
  errors?: { message?: string }[];
}

/**
 * Boxes recorded from HEAD before the identity head change.
 * Tour left open, scroll reset to the top, reduced motion, animations finished.
 * A later head tag must stay inside 1px of these. Do not re-record to go green.
 * Question height is the card after the empty "Read this in" row left questions
 * with no translation (2026-10-12). Mast and dashboard boxes were not re-recorded.
 */
const BASELINE: Record<"phone" | "desk", { desk: Record<string, Box>; dash: Record<string, Box> }> = {
  phone: {
    desk: {
      "header.hh-mast": { x: 23, y: 12, w: 336, h: 142.98 },
      "[data-region='question']": { x: 23, y: 214.98, w: 336, h: 464.05 },
    },
    dash: {
      "header.hh-mast": { x: 23, y: 12, w: 336, h: 267.94 },
      "#drive-main": { x: 23, y: 311.94, w: 336, h: 1777.78 },
      "#drive-empty": { x: 23, y: 593.5, w: 336, h: 218.38 },
    },
  },
  desk: {
    desk: {
      "header.hh-mast": { x: 71, y: 64, w: 1305, h: 155.52 },
      "[data-region='question']": { x: 71, y: 287.52, w: 640, h: 770.88 },
    },
    dash: {
      "header.hh-mast": { x: 71, y: 64, w: 1305, h: 331.17 },
      "#drive-main": { x: 71, y: 443.17, w: 1305, h: 1356.56 },
      "#drive-empty": { x: 71, y: 626.95, w: 640, h: 233.97 },
    },
  },
};

test.describe("desk identity", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-identity-"));
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

  test("the desk head, favicon, and manifest resolve", async ({ page }) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/The Hitchhiker's Guide to Web Design/);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    const favicon = await page.request.get(new URL("/favicon.svg", url).href);
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()["content-type"]).toContain("image/svg+xml");

    const manifestResponse = await page.request.get(new URL("/manifest.webmanifest", url).href);
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
    const manifest: { name?: string; short_name?: string; display?: string; icons?: { sizes?: string }[] } =
      await manifestResponse.json();
    expect(manifest.name).toBe("The Hitchhiker's Guide to Web Design");
    expect(manifest.short_name).toBe("Guide");
    expect(manifest.display).toBe("standalone");
    const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  test("Chrome reports no installability errors on localhost", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("[data-hh-ready]").first().waitFor({ state: "attached" });
    const session = await page.context().newCDPSession(page);
    let last = "not-checked";
    await expect
      .poll(async () => {
        const report = (await session.send("Page.getInstallabilityErrors")) as InstallabilityReport;
        last = report.installabilityErrors.map((item) => item.errorId).join(",") || "none";
        return last;
      }, { timeout: 20_000 })
      .toBe("none");
    const manifest = (await session.send("Page.getAppManifest")) as AppManifestReport;
    expect(manifest.errors ?? []).toEqual([]);
    expect((manifest.data ?? "").length > 0 || (manifest.url ?? "").length > 0).toBe(true);
    expect(last).toBe("none");
  });

  test("theme-color and the favicon follow the color scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(await activeTheme(page)).toBe("#8e2f1a");
    await page.goto(new URL("/favicon.svg", url).href, { waitUntil: "domcontentloaded" });
    expect(await paperFill(page)).toBe("rgb(243, 235, 221)");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(await activeTheme(page)).toBe("#e6a15c");
    await page.goto(new URL("/favicon.svg", url).href, { waitUntil: "domcontentloaded" });
    expect(await paperFill(page)).toBe("rgb(18, 16, 14)");
  });

  test("desk and dashboard boxes stay within 1px of the pre-identity baseline", async ({ browser }) => {
    test.setTimeout(120_000);
    const sizes = [
      { name: "phone", width: 375, height: 812 },
      { name: "desk", width: 1440, height: 900 },
    ] as const;
    for (const theme of ["light", "dark"] as const) {
      for (const size of sizes) {
        const found = await measure(browser, url, size.width, size.height, theme);
        const expected = BASELINE[size.name];
        assertClose(`${theme} ${size.name} desk`, found.desk, expected.desk);
        assertClose(`${theme} ${size.name} dash`, found.dash, expected.dash);
      }
    }
  });
});

function assertClose(label: string, actual: Record<string, Box>, expected: Record<string, Box>): void {
  for (const [selector, box] of Object.entries(expected)) {
    const got = actual[selector];
    expect(got, `${label} ${selector}`).toBeTruthy();
    if (got === undefined) continue;
    for (const key of ["x", "y", "w", "h"] as const) {
      expect(Math.abs(got[key] - box[key]), `${label} ${selector} ${key} ${got[key]} vs ${box[key]}`).toBeLessThanOrEqual(1);
    }
  }
}

async function measure(
  browser: Browser,
  url: string,
  width: number,
  height: number,
  theme: "light" | "dark",
): Promise<{ desk: Record<string, Box>; dash: Record<string, Box> }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await settle(page);
    const desk = await boxes(page, ["header.hh-mast", "[data-region='question']"]);
    await page.goto(new URL("/hh-dashboard", url).href, { waitUntil: "networkidle" });
    await settle(page);
    const dash = await boxes(page, ["header.hh-mast", "#drive-main", "#drive-empty"]);
    return { desk, dash };
  } finally {
    await context.close();
  }
}

async function settle(page: Page): Promise<void> {
  await page.locator("[data-hh-ready]").first().waitFor({ state: "attached" });
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    window.scrollTo(0, 0);
  });
}

async function boxes(page: Page, selectors: string[]): Promise<Record<string, Box>> {
  return page.evaluate((sels) => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el === null) continue;
      const rect = el.getBoundingClientRect();
      out[sel] = {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        w: Math.round(rect.width * 100) / 100,
        h: Math.round(rect.height * 100) / 100,
      };
    }
    return out;
  }, selectors);
}

async function activeTheme(page: Page): Promise<string> {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('meta[name="theme-color"]');
    for (const node of nodes) {
      const media = node.getAttribute("media");
      if (media !== null && window.matchMedia(media).matches) return node.getAttribute("content") ?? "";
    }
    return "";
  });
}

async function paperFill(page: Page): Promise<string> {
  return page.locator("rect.paper").first().evaluate((el) => getComputedStyle(el).fill);
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
