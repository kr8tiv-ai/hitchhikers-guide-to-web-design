/**
 * Desk gate cards. The reason is plain language. Fix it for me only asks.
 * Yes does not change the site. The card stays inside a 375px screen.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test.describe("gate card 243f", () => {
  let child: ChildProcess;
  let url = "";
  let projectDir = "";
  let gatesFile = "";
  let gatesBefore = "";

  test.beforeAll(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "hh-gate-card-"));
    gatesFile = path.join(projectDir, ".hitchhiker", "qa", "GATES.json");
    mkdirSync(path.dirname(gatesFile), { recursive: true });
    gatesBefore = `${JSON.stringify(report(), null, 2)}\n`;
    writeFileSync(gatesFile, gatesBefore, "utf8");
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

  test("a font card asks before a fix and does not clip at 375", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(new URL("/gates", url).href, { waitUntil: "domcontentloaded" });
    const fonts = page.locator("[data-gate='fonts']");
    await expect(fonts).toContainText("Your headline font is 62 KB, the limit is 40 KB.");
    await expect(fonts.getByRole("button", { name: "Fix it for me" })).toBeVisible();
    await expect(page.locator("[data-gate='spacing']").getByRole("button", { name: "Fix it for me" })).toHaveCount(0);
    expect(await clipped(page), "cards").toEqual([]);
    expect(await pageOverflow(page), "page width").toBeLessThanOrEqual(1);

    await fonts.getByRole("button", { name: "Fix it for me" }).click();
    await expect(page).toHaveURL(/ask=fonts/);
    const ask = page.getByRole("region", { name: "Ask before a fix" });
    await expect(ask).toContainText("Nothing on the site changes.");
    await expect(ask.getByRole("button", { name: "Yes, ask" })).toBeVisible();
    expect(readFileSync(gatesFile, "utf8"), "ask leaves the file").toBe(gatesBefore);
    expect(await clipped(page), "ask").toEqual([]);
    expect(await pageOverflow(page), "ask width").toBeLessThanOrEqual(1);

    await ask.getByRole("link", { name: "Not now" }).click();
    await expect(fonts.getByRole("button", { name: "Fix it for me" })).toBeVisible();
    expect(readFileSync(gatesFile, "utf8"), "not now leaves the file").toBe(gatesBefore);

    await fonts.getByRole("button", { name: "Fix it for me" }).click();
    await ask.getByRole("button", { name: "Yes, ask" }).click();
    await expect(page).toHaveURL(/asked=fonts/);
    await expect(page.getByRole("status")).toContainText("Nothing on the site was changed.");
    await expect(fonts.getByRole("button", { name: "Fix it for me" })).toHaveCount(0);
    expect(readFileSync(gatesFile, "utf8"), "yes leaves the file").toBe(gatesBefore);
    expect(await clipped(page), "asked").toEqual([]);
    expect(await pageOverflow(page), "asked width").toBeLessThanOrEqual(1);
  });
});

function report(): unknown {
  return {
    head: "abc1234",
    ranAt: "2026-10-21T12:00:00.000Z",
    results: [
      {
        id: "fonts",
        status: "FIX",
        reason: "A font file is too large, or a backup font is missing its size match.",
        evidence: { problems: ["Headline font is 62000 bytes. Maximum is 40960."] },
      },
      {
        id: "spacing",
        status: "PASS",
        reason: "The spacing sits on the scale.",
        evidence: {},
      },
    ],
  };
}

async function clipped(page: Page): Promise<string[]> {
  return page.locator("[data-gate-cards]").evaluate((root) => {
    const viewW = window.innerWidth;
    const problems: string[] = [];
    const nodes = root.querySelectorAll("a, button, p, h1");
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!shown(node)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const name = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
      if (box.left < -1 || box.right > viewW + 1) {
        problems.push(`${name} extends past the viewport`);
      }
      let parent: Element | null = node.parentElement;
      while (parent !== null) {
        const style = getComputedStyle(parent);
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip" || style.overflowX === "scroll" || style.overflowX === "auto";
        if (clipsX) {
          const edge = parent.getBoundingClientRect();
          if (box.left < edge.left - 1 || box.right > edge.right + 1) {
            problems.push(`${name} is clipped by ${parent.tagName.toLowerCase()}`);
            break;
          }
        }
        parent = parent.parentElement;
      }
    }
    return problems;

    function shown(node: Element): boolean {
      if (node.closest("[hidden]") !== null) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    }
  });
}

function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
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
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
