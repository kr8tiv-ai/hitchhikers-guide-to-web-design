import { createHash } from "node:crypto";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const WHY_NUDGE =
  "Love and hate need a reason. One line on the thinking is enough. If there is truly nothing to say, send it blank once more.";
const THREAD = "Quiet type, one product gesture, and no second pitch.";
const WHYS = [
  "The type stays quiet and the product is the gesture.",
  "One move carries the page, and the rest stays still.",
  "The headline is the only loud thing, and it is still quiet.",
  "The grid holds one idea and does not add a second pitch.",
  "The nav stays out of the way of the work.",
  "Colour is a material here, not a decoration.",
  "The scroll reveals the product, then stops.",
  "The type size does the hierarchy without a badge.",
  "A single photograph is enough to explain the offer.",
  "The footer does not start a new argument.",
];

test("walks a fixture pack to 10 loves and a 4 site shortlist at 375 and 1440", async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-gallery-walk-"));
  const cacheDir = await mkdtemp(path.join(tmpdir(), "hh-gallery-cache-"));
  const packFile = path.join(projectDir, "gallery.json");
  await writeFile(packFile, JSON.stringify(fixturePack()));
  await seedRobotsPlaceholder(cacheDir, "https://example.com/godly/1");

  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_GALLERY_FILE: packFile,
        HH_GALLERY_CACHE: cacheDir,
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
    await page.goto(`${url}gallery?industry=saas&styleWorld=editorial`);
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-phase", "walking");
    await expect(page.locator("#hh-gallery .hh-site")).toHaveCount(4);
    await expect(page.locator('[data-gallery="godly"]')).toHaveCount(2);
    await expect(page.locator('[data-gallery="awwwards"]')).toHaveCount(2);
    await expect(page.locator(".hh-site__shot")).toHaveCount(4);
    await expect(page.locator(".hh-site__title")).toHaveCount(4);
    await expect(page.locator(".hh-site__note")).toHaveCount(4);
    await expect(page.locator(".hh-vote")).toHaveCount(12);
    await expect(page.locator(".hh-site__title").first()).toHaveText("Godly 1");
    await expect(page.locator(".hh-site").first().locator(".hh-shot-note")).toHaveText(
      "This site asks crawlers to stay out, so the shot is a stand-in.",
    );
    const opener = page.locator('a[href="https://example.com/godly/1"]');
    await expect(opener).toHaveAttribute("target", "_blank");
    await expect(opener).toHaveAttribute("rel", /noopener/);
    await expect(page.locator('img[src*="example.com"]')).toHaveCount(0);
    await expect(page.locator("#hh-gallery img")).toHaveCount(0);
    expect(await columnCount(page)).toBe(1);
    expect(await fits(page)).toBe(true);
    expect(errors).toEqual([]);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await columnCount(page)).toBe(2);
    expect(await fits(page)).toBe(true);

    const first = page.locator("#hh-gallery .hh-site").first();
    await first.focus();
    await page.keyboard.press("l");
    await expect(first.locator('[data-vote="love"]')).toHaveAttribute("aria-pressed", "true");
    await first.locator("[data-keep]").click();
    await expect(first.locator("[data-nudge]")).toHaveText(WHY_NUDGE);
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-loves", "0");
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-phase", "walking");

    await keepLove(page, WHYS[0] ?? "", true);
    for (let index = 1; index < WHYS.length; index += 1) {
      await keepLove(page, WHYS[index] ?? "", false);
    }
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-phase", "narrowing");
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-loves", "10");

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await columnCount(page)).toBe(1);
    expect(await fits(page)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await columnCount(page)).toBe(2);
    expect(await fits(page)).toBe(true);

    const picks = page.locator("[data-pick]");
    await expect(picks).toHaveCount(10);
    for (let index = 0; index < 4; index += 1) {
      await picks.nth(index).check();
    }
    await page.locator("#hh-thread").fill(THREAD);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await fits(page)).toBe(true);
    await page.locator("[data-shortlist]").click();
    await expect(page.locator("#hh-gallery")).toHaveAttribute("data-phase", "done");
    await expect(page.locator("#hh-gallery .hh-log li")).toHaveCount(5);
    expect(await fits(page)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await fits(page)).toBe(true);

    const html = await page.content();
    expect(html.replace("<!DOCTYPE html>", "").includes("!")).toBe(false);
    expect(html.includes("\u2014")).toBe(false);
    expect(errors).toEqual([]);

    const dir = path.join(projectDir, ".hitchhiker", "references");
    const names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
    expect(names.filter((name) => name !== "INDEX.md")).toHaveLength(4);
    expect(names).toContain("INDEX.md");
    const index = await readFile(path.join(dir, "INDEX.md"), "utf8");
    expect(index).toContain(THREAD);
    expect(index).toContain("Babel Fish and Deep Thought");
    expect(index).toContain("https://example.com/godly/1");
    for (const why of WHYS.slice(0, 4)) expect(index).toContain(why);
    for (const name of names) {
      const body = await readFile(path.join(dir, name), "utf8");
      expect(body.includes("![")).toBe(false);
      if (name !== "INDEX.md") {
        expect(body).toContain("## Why");
        expect(body).toContain("https://example.com/");
      }
    }
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
    await rm(cacheDir, { recursive: true, force: true });
  }
});

function fixturePack(): unknown[] {
  const rows: unknown[] = [
    row("godly", "fashion", "playful", "Fashion Outlier", "https://example.com/godly/fashion"),
  ];
  for (let index = 1; index <= 8; index += 1) {
    rows.push(row("godly", "saas", "editorial", `Godly ${index}`, `https://example.com/godly/${index}`));
  }
  for (let index = 1; index <= 8; index += 1) {
    rows.push(row("awwwards", "saas", "editorial", `Awwwards ${index}`, `https://example.com/awwwards/${index}`));
  }
  return rows;
}

function row(source: string, industry: string, styleWorld: string, name: string, url: string): unknown {
  return {
    industry,
    styleWorld,
    motionLevel: 3,
    name,
    url,
    source,
    award: "none",
    noted: `Look at the thinking in ${name}.`,
  };
}

async function seedRobotsPlaceholder(cacheDir: string, url: string): Promise<void> {
  const hash = createHash("sha1").update(url).digest("hex");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    path.join(cacheDir, `${hash}.json`),
    JSON.stringify({
      at: Date.now(),
      placeholder: true,
      note: "This site asks crawlers to stay out, so the shot is a stand-in.",
    }),
  );
}

async function keepLove(page: Page, why: string, alreadyChosen: boolean): Promise<void> {
  const card = page.locator("#hh-gallery .hh-site").first();
  await card.waitFor();
  if (!alreadyChosen) await card.locator('[data-vote="love"]').click();
  await expect(card.locator('[data-vote="love"]')).toHaveAttribute("aria-pressed", "true");
  await card.locator("textarea").fill(why);
  await card.locator("[data-keep]").click();
  await page.locator("#hh-gallery").waitFor();
}

async function columnCount(page: Page): Promise<number> {
  return page.locator(".hh-sites").evaluate((element) => {
    const value = getComputedStyle(element).gridTemplateColumns;
    return value.split(" ").filter((part) => part.trim() !== "" && part !== "none").length;
  });
}

async function fits(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
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
    }, 30_000);
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
