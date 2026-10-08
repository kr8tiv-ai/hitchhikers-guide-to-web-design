import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

const SETTLED_HOST =
  "Hostinger. Domain owned at Namecheap. DNS records are at Cloudflare. Email is on the domain.";

test("Deep Thought answers two open items at both viewports", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-before-jump-"));
  seed(projectDir, { legal: false, logo: false });
  const child = startChild(projectDir);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await expect(page.locator("body")).toHaveAttribute("data-phase", "deep-thought");
    await expect(page.locator("#hh-card-ask")).toContainText("Brand section logo is unapproved");
    await expect(page.locator("#hh-card-progress")).toHaveText("Question 1 of 2");
    await expect(page.locator(".hh-map__item--current")).toContainText("Deep Thought");
    await fits(page);
    await expectNoBang(page);
    const wordmark = await page.locator(".hh-wordmark").evaluate((el) => el.getBoundingClientRect().width);
    expect(wordmark).toBeGreaterThan(40);

    await page.locator("#hh-card-draft").fill("A brass wordmark, drawn once.");
    await expect(page.locator('[data-action="answer"]')).toBeEnabled();
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("#hh-card-ask")).toContainText("There is no legal page yet");
    await expect(page.locator("#hh-card-progress")).toHaveText("Question 2 of 2");

    await page.setViewportSize({ width: 1440, height: 900 });
    await fits(page);
    await expectNoBang(page);

    await page.locator("#hh-card-draft").fill("Privacy and terms, both.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("#hh-card-ask")).toHaveText("The phase can start.");

    await expect.poll(async () => {
      const brand = await readFile(path.join(projectDir, ".hitchhiker", "BRAND.md"), "utf8").catch(() => "");
      const brief = await readFile(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8").catch(() => "");
      return brand.includes("A brass wordmark, drawn once.") && brief.includes("Privacy and terms, both.");
    }).toBe(true);

    const flags = JSON.parse(await readFile(path.join(projectDir, ".hitchhiker", "brand-approval.json"), "utf8")) as {
      logo: boolean;
    };
    expect(flags.logo).toBe(false);
    const interview = JSON.parse(await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      cursor: number;
    };
    expect(interview.cursor).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("zero open items shows the jump card and asks nothing", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-before-jump-"));
  seed(projectDir, { legal: true, logo: true });
  const before = await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
  const child = startChild(projectDir);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      if (viewport.width === 375) await page.goto(url);
      await expect(page.locator("[data-jump='true'] #hh-card-ask")).toHaveText("Nothing open. Jumping.");
      await expect(page.locator("#hh-card-draft")).toHaveCount(0);
      await fits(page);
      await expectNoBang(page);
    }
    const after = await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
    expect(after).toBe(before);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function seed(projectDir: string, opts: { legal: boolean; logo: boolean }): void {
  const hitch = path.join(projectDir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  const answers = [
    ["DP-2.1", "A night stall for regulars."],
    ["DP-2.6", "Night stall regulars."],
    ["DP-2.2", "Reserve a seat."],
    ["DP-5.3", "paper, ink, night"],
    ["DP-6.2", "4"],
    ["DP-9.2", SETTLED_HOST],
    ["DP-3.8", "Plausible. No cookie banner."],
    ["DP-9.1", "2026-11-01"],
    ["DP-8.4", "Privacy and terms."],
  ].map(([id, value]) => ({ id, status: "ANSWERED", value }));
  writeFileSync(
    path.join(hitch, "interview.json"),
    `${JSON.stringify({ version: 1, answers, cursor: 3, pushedIds: ["DP-0.1"] }, null, 2)}\n`,
  );
  const flags = {
    purpose: true,
    voice: true,
    tokens: true,
    imagery: true,
    logo: opts.logo,
    neighbors: true,
  };
  writeFileSync(path.join(hitch, "brand-approval.json"), `${JSON.stringify(flags, null, 2)}\n`);
  if (opts.legal) writeFileSync(path.join(hitch, "LEGAL.md"), "# LEGAL\n\nPrivacy and terms.\n");
}

function startChild(projectDir: string): ChildProcess {
  const cards = path.resolve(here, "../src/before-jump/cards.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_PHASE: "deep-thought",
      HH_E2E_CARDS: pathToFileURL(cards).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_CARDS;
    const projectDir = process.env.HH_E2E_PROJECT;
    const phase = process.env.HH_E2E_PHASE;
    const loaded = await import(specifier);
    const handle = await loaded.startBeforeJumpServer({ projectDir, phase });
    process.stdout.write(handle.url + "\\n");
    const shutdown = () => {
      handle.close().then(() => process.exit(0), () => process.exit(1));
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    await new Promise(() => {});
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`before we jump did not print a URL\n${stderr}`));
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
      reject(new Error(`before we jump exited ${code ?? "null"}\n${stderr}\n${stdout}`));
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

async function fits(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
  expect(ok).toBe(true);
}

async function expectNoBang(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text.includes("!")).toBe(false);
  expect(text.includes("！")).toBe(false);
}
