/**
 * 260d. Pick a sketch, ask for a change, and approve motion on a narrow screen.
 * The provider is local. Nothing is downloaded and nothing calls the network.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { addCompCandidate, renderSiteBrief, writeDesignLock, type SiteBrief } from "@hitchhiker/engine";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("the owner picks a sketch, asks for a change, and approves motion at 375 wide", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-260d-e2e-"));
  const logFile = path.join(projectDir, "comp-log.txt");
  writeFileSync(logFile, "");
  seed(projectDir);
  const child = startDesk(projectDir, logFile);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${url.replace(/\/$/, "")}/approve`);
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();
    const look = page.locator("[data-design-stage='look']");
    await expect(look).toBeVisible();
    await expect(look).toContainText("These are sketches of your pages. Pick the one that feels right.");
    await expect(look).toContainText("The words are added later, so ignore the grey bars.");
    await expect(look.locator("[data-comp-view='desktop']")).toBeVisible();
    await expect(look.locator("[data-comp-view='mobile']")).toBeVisible();
    await expect(look.locator("[data-comp-view='desktop-long']")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);

    const radio = page.getByRole("radio", { name: "Home desktop sketch 1" });
    await radio.focus();
    await page.keyboard.press("Space");
    await expect(radio).toBeChecked();
    await look.locator("[data-comp-view='desktop']").getByRole("button", { name: "Use this one" }).click();
    await expect(look.locator("[data-comp-view='desktop'] [data-comp-status]")).toHaveText("Approved");

    const words = "Make the header calmer";
    await look.locator("[data-comp-view='mobile'] textarea").fill(words);
    await look.locator("[data-comp-view='mobile']").getByRole("button", { name: "Try again with these changes" }).click();
    await expect(look).toBeVisible();
    const lines = readFileSync(logFile, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    expect(lines.length).toBe(2);
    for (const line of lines) {
      const row = JSON.parse(line) as { aspect: string; prompt: string };
      expect(row.aspect).toBe("9:19.5");
      expect(row.prompt).toContain(words);
    }

    const video = page.locator("[data-comp-motion] video");
    await expect(video).toHaveJSProperty("muted", true);
    await page.getByRole("button", { name: "Use this motion" }).click();
    await expect(page.locator("[data-comp-motion]")).toContainText("Approved");
    await expect(page.locator("[data-comp-motion] video")).toHaveCount(1);
    const still = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(still).toBe(true);
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

function briefDraft(): SiteBrief {
  const line = "The site helps a visitor book a visit.";
  return {
    goal: line,
    visitor: line,
    action: line,
    offer: line,
    vibe: line,
    references: line,
    exists: line,
    protected: line,
    motion: line,
    limits: line,
    hosting: line,
    pages: line,
    features: line,
    maintainer: line,
    cadence: line,
    languages: line,
    imagery: line,
    budget: line,
    session: line,
    logo: line,
    palette: line,
    coverage: line,
  };
}

function seed(projectDir: string): void {
  const hitch = path.join(projectDir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  const draft = briefDraft();
  writeFileSync(
    path.join(hitch, "sitemap.md"),
    "# Sitemap\n\n## Primary\n\n- Home at /\n  - Hero\n\n## Footer\n\n- Privacy at /privacy\n",
  );
  writeFileSync(path.join(hitch, "wireframe.md"), "# Wireframe\n\n## Home\n", "utf8");
  writeFileSync(path.join(hitch, "SITE-BRIEF.md"), renderSiteBrief(draft));
  writeFileSync(path.join(projectDir, "DESIGN.md"), "# Design\n\nA quiet page.\n", "utf8");
  writeFileSync(
    path.join(hitch, "directions.json"),
    `${JSON.stringify({
      pickedId: "dir-sample",
      directions: [
        {
          id: "dir-sample",
          name: "Sample",
          description: "A quiet direction.",
          citationId: "sample",
          title: "Sample",
          url: "https://example.com/sample",
          display: "General Sans",
          body: "General Sans",
          sectionOrder: ["hero"],
          hue: "#1f6b4a",
        },
      ],
    })}\n`,
  );
  writeFileSync(
    path.join(hitch, "design-stages.json"),
    `${JSON.stringify({
      sitemap: "Approved.",
      wireframe: "Approved.",
      styleGuide: "Approved.",
      direction: "Approved.",
    })}\n`,
  );
  writeFileSync(
    path.join(hitch, "brief-pending.json"),
    `${JSON.stringify({
      status: "approved",
      draft,
      buildStarted: false,
      planApproved: true,
      error: "",
      note: "",
      fallback: false,
    })}\n`,
  );
  writeFileSync(path.join(hitch, "config.json"), `${JSON.stringify({ design: { comps: { candidates: 2 } } })}\n`);
  writeDesignLock(projectDir, "dir-sample");
  for (const view of ["desktop", "mobile", "desktop-long"] as const) {
    addCompCandidate(projectDir, "/", view, PNG, ".png");
  }
  const clip = path.join(projectDir, "reference", "comps", "home", "motion", "hero.mp4");
  mkdirSync(path.dirname(clip), { recursive: true });
  writeFileSync(clip, Buffer.from("fake-mp4"));
  const comps = path.join(hitch, "comps.json");
  const doc = JSON.parse(readFileSync(comps, "utf8")) as {
    pages: { sections: { id: string; motion?: string }[] }[];
  };
  const hero = doc.pages[0]?.sections.find((item) => item.id === "hero");
  if (hero === undefined) throw new Error("Home has no hero section.");
  hero.motion = "reference/comps/home/motion/hero.mp4";
  writeFileSync(comps, `${JSON.stringify(doc, null, 2)}\n`);
}

function startDesk(projectDir: string, logFile: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const providerFile = path.resolve(here, "comp-provider-260d.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
      HH_E2E_COMP_PROVIDER: pathToFileURL(providerFile).href,
      HH_E2E_COMP_LOG: logFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const providerUrl = process.env.HH_E2E_COMP_PROVIDER;
    const loaded = await import(specifier);
    const mod = await import(providerUrl);
    loaded.setDeskCompProvider(projectDir, mod.provider);
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
      const line = stdout.split(/\n/).find((item) => item.startsWith("http://127.0.0.1:"));
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
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
