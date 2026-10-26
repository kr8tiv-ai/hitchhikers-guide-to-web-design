/**
 * 244d. Before and after cards on the desk. A yes is a record only.
 * The page stays inside a 375px screen. Nothing is applied.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { expect, test, type Page } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("before and after pick cards", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-pick-cards-"));
    writeFileSync(path.join(projectDir, "marker.txt"), "site-marker\n", "utf8");
    const shots = path.join(projectDir, ".hitchhiker", "elevate", "shots");
    mkdirSync(shots, { recursive: true });
    writeFileSync(path.join(shots, "r1-01-before.png"), PNG);
    writeFileSync(path.join(shots, "r1-01-after.png"), PNG);
    writeFileSync(path.join(shots, "r1-02-before.png"), PNG);
    writeFileSync(path.join(shots, "r1-02-after.png"), PNG);
    writeFileSync(
      path.join(projectDir, ".hitchhiker", "elevate", "cards.json"),
      `${JSON.stringify(
        {
          picks: [
            {
              id: "r1-01",
              file: "src/hero.tsx",
              change: "Open the tracking on the display line",
              before: "r1-01-before.png",
              after: "r1-01-after.png",
            },
            {
              id: "r1-02",
              file: "src/footer.tsx",
              change: "Give the closing line more air",
              before: "r1-02-before.png",
              after: "r1-02-after.png",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    child = startDesk(projectDir);
    url = await readUrl(child);
  });

  test.afterAll(async () => {
    if (child !== undefined) await stopChild(child);
    if (projectDir.length > 0) await removeTempDir(projectDir);
  });

  test("approve and reject record a yes and stay inside 375", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(new URL("/approve/picks", url).href, { waitUntil: "domcontentloaded" });
    const decisions = path.join(projectDir, ".hitchhiker", "elevate", "decisions.json");
    expect(existsSync(decisions)).toBe(false);
    await expect(page.locator("[data-shot-pair]")).toHaveCount(2);
    await expect(page.locator("img[data-before]")).toHaveCount(2);
    await expect(page.locator("img[data-after]")).toHaveCount(2);
    await expect(page.getByText("Nothing changes until you approve a pick.")).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text.includes("!")).toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    const boxes = await page.locator("img[data-before], img[data-after]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { right: box.right, left: box.left };
      }),
    );
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(376);
    }

    await page.locator('[data-item-id="r1-01"] [data-approve]').click();
    await expect(page.locator('[data-item-id="r1-01"]')).toHaveAttribute("data-status", "approved");
    await page.locator('[data-item-id="r1-02"] [data-reject]').click();
    await expect(page.locator('[data-item-id="r1-02"]')).toHaveAttribute("data-status", "rejected");

    const saved = JSON.parse(readFileSync(decisions, "utf8")) as { decisions: Record<string, string> };
    expect(saved.decisions["r1-01"]).toBe("approved");
    expect(saved.decisions["r1-02"]).toBe("rejected");
    expect(readFileSync(path.join(projectDir, "marker.txt"), "utf8")).toBe("site-marker\n");
    expect(existsSync(path.join(projectDir, ".hitchhiker", "prompts"))).toBe(false);
  });

  test("a shot name that leaves the folder is refused", async ({ page }) => {
    const response = await page.request.get(new URL("/approve/picks/shot?name=../package.json", url).href);
    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("That shot is not on the desk.");
  });
});

test("an empty project shows the waiting plate and writes nothing", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-pick-empty-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(new URL("/approve/picks", url).href, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Nothing is waiting for a yes. When a pick has a before shot and an after shot, it lands here."),
    ).toBeVisible();
    expect(existsSync(path.join(projectDir, ".hitchhiker", "elevate", "decisions.json"))).toBe(false);
    const text = await page.locator("body").innerText();
    expect(text.includes("!")).toBe(false);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
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
