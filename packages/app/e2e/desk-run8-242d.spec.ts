/**
 * Desk Run 8 in the browser. Opening a saved project switches folders.
 * The design stages show every brief page, the brand kit, the picked pair,
 * and the pre-build checks. Start build is not pressed.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { createSiteProject, dealDirections, deterministicBrief, draftBriefPlan, projectPlanCoverage, renderSiteBrief, saveDirectionDeal, saveProjectFile } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const fixture = path.join(here, "../../engine/test/fixtures/project4-interview.json");
const MARK = "NORTH-WIND-ONLY-BRIEF";
const TITLES = [
  "Home",
  "Farms",
  "Farm detail",
  "Live on the Land",
  "How Buying Works",
  "Eco-Building and Food",
  "About",
  "Contact",
  "Blog",
  "Privacy",
  "Terms",
];

test("opening a saved project from Resume switches the desk and leaves the other folder alone", async ({ page }) => {
  test.setTimeout(180_000);
  const sandbox = await mkdtemp(path.join(tmpdir(), "hh-run8-open-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  const calm = path.join(sandbox, "sites", "paradise-calm");
  const wind = path.join(sandbox, "sites", "north-wind");
  await createSiteProject({ name: "Paradise Calm", dir: calm, homeDir: home });
  await createSiteProject({ name: "North Wind", dir: wind, homeDir: home });
  writeFileSync(path.join(wind, ".hitchhiker", "SITE-BRIEF.md"), `# Brief\n\n${MARK}\n`);
  writeFileSync(
    path.join(wind, ".hitchhiker", "brief-yes.json"),
    `${JSON.stringify({ approved: true, at: "2026-10-20T12:00:00.000Z" })}\n`,
  );
  const saved = await saveProjectFile(wind, { projectName: "North Wind", homeDir: home });
  const child = startChild(sandbox, calm);
  try {
    const url = await readUrl(child);
    await page.goto(url);
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();
    await expect(page.locator(".hh-project__name")).toHaveText("Paradise Calm");
    const before = fingerprint(calm);
    await page.getByRole("button", { name: "Resume project" }).click();
    await page.getByRole("button", { name: "Open North Wind" }).click();
    await expect(page.locator(".hh-project__name")).toHaveText("North Wind");
    await expect(page.locator("[data-project-root]")).toHaveAttribute("data-project-root", path.resolve(wind));
    await expect(page.locator("[data-save-status]")).toHaveAttribute("title", saved.filePath);
    expect(fingerprint(calm)).toBe(before);
    expect(existsSync(path.join(calm, ".hitchhiker", "brief-yes.json"))).toBe(false);
    expect(existsSync(path.join(calm, ".hitchhiker", "SITE-BRIEF.md"))).toBe(false);
    expect(readTree(calm).includes(MARK)).toBe(false);
    expect(readFileSync(path.join(wind, ".hitchhiker", "SITE-BRIEF.md"), "utf8").includes(MARK)).toBe(true);
  } finally {
    child.kill();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("the design stages keep the Run 8 pages, the kit, the pick, and the checks", async ({ page }) => {
  test.setTimeout(180_000);
  const sandbox = await mkdtemp(path.join(tmpdir(), "hh-run8-stages-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  const dir = path.join(sandbox, "sites", "paradise-found");
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const facts = JSON.parse(readFileSync(fixture, "utf8")) as {
    answers: Array<{ id: string; value: string; status?: string }>;
  };
  writeFileSync(path.join(dir, ".hitchhiker", "interview.json"), readFileSync(fixture));
  const draft = deterministicBrief({ answers: facts.answers, uploads: [], crawlNotes: [] }, "en");
  const markdown = renderSiteBrief(draft);
  writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), markdown);
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "pending",
      draft,
      buildStarted: false,
      planApproved: false,
      error: "",
      note: "",
      fallback: false,
    })}\n`,
  );
  await draftBriefPlan(dir, markdown);
  const coverage = projectPlanCoverage(dir, markdown);
  expect(coverage.ok, coverage.uncovered.map((row) => row.id).join(", ")).toBe(true);
  const deal = dealDirections();
  const first = deal.directions[0];
  expect(first).toBeTruthy();
  saveDirectionDeal(dir, {
    pickedId: null,
    directions: deal.directions.map((direction, index) =>
      index === 0 ? { ...direction, display: "Boska", body: "General Sans" } : direction,
    ),
  });
  const child = startChild(sandbox, dir);
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/approve`);
    const approvePlan = page.getByRole("button", { name: "Approve plan", exact: true });
    await expect(approvePlan).toBeEnabled();
    await approvePlan.click();
    const sitemap = page.locator("[data-design-stage='sitemap'] pre");
    await expect(sitemap).toBeVisible({ timeout: 30_000 });
    for (const title of TITLES) await expect(sitemap).toContainText(title);
    await page.locator("[data-design-stage='sitemap'] textarea[name='approval']").fill(
      "add a Volunteers page under About. remove Blog",
    );
    await page.getByRole("button", { name: "Change the sitemap" }).click();
    await expect(page.locator("[data-design-stage='sitemap']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve sitemap" })).toBeVisible();
    const revised = page.locator("[data-design-stage='sitemap'] pre");
    await expect(revised).toContainText("Volunteers");
    await expect(revised).not.toContainText("- Blog at");
    await expect(revised).not.toContainText("add a Volunteers");
    const stages = readFileSync(path.join(dir, ".hitchhiker", "design-stages.json"), "utf8");
    expect(stages.includes("add a Volunteers")).toBe(false);
    expect(JSON.parse(stages).sitemap).toBeUndefined();

    await page.getByRole("button", { name: "Approve sitemap" }).click();
    const wire = page.locator("[data-design-stage='wireframe'] pre");
    await expect(wire).toBeVisible();
    const expected = pageTitles(readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8"));
    const shown = [...(await wire.innerText()).matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? "");
    expect(shown).toEqual(expected);
    expect(shown).toContain("Volunteers");
    expect(shown).not.toContain("Blog");

    await page.getByRole("button", { name: "Approve wireframe" }).click();
    const guide = page.locator("[data-design-stage='style-guide'] pre");
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("#f3e6d0");
    await expect(guide).toContainText("#8a6a12");
    await expect(guide).toContainText("Syne");
    await expect(guide).toContainText("Spline Sans");
    await expect(guide).not.toContainText("Gambarino");
    await expect(guide).not.toContainText("Author");
    await expect(guide).not.toContainText("FOV");
    await page.getByRole("button", { name: "Approve style guide" }).click();
    await page.locator("[data-direction-reason]").fill("Boska fits the calm page.");
    await page.locator("[data-pick-direction]").first().click();
    await expect(page.locator("[data-design-stage='style-guide']")).toBeVisible({ timeout: 30_000 });
    const picked = page.locator("[data-design-stage='style-guide'] pre");
    await expect(picked).toContainText("Boska");
    await expect(picked).toContainText("General Sans");
    await expect(picked).toContainText("#f3e6d0");
    await expect(picked).toContainText("#8a6a12");
    await expect(picked).toContainText("picked direction");
    await expect(picked).not.toContainText("Gambarino");
    await expect(picked).not.toContainText("Author");
    await expect(picked).not.toContainText("FOV");
    await expect(picked).not.toContainText("bloom");
    await page.getByRole("button", { name: "Approve style guide" }).click();
    await expect(page.locator("[data-direction-desk]")).toContainText("Picked");
    await page.getByRole("button", { name: "Approve direction" }).click();
    const checks = page.locator("[data-design-stage='prebuild']");
    await expect(checks).toBeVisible();
    for (const id of ["critique", "devices", "phone", "webgl", "elevate", "ai-look", "type", "awwwards"]) {
      await expect(checks.locator(`[data-prebuild-check="${id}"]`)).toBeVisible();
      await expect(checks.locator(`[data-prebuild-check="${id}"]`)).not.toHaveAttribute("data-prebuild-status", "fail");
    }
    await expect(checks).toContainText("iOS Safari");
    await expect(checks).toContainText("Android Chrome");
    await expect(checks).toContainText("tablet");
    await expect(checks).toContainText("desktop");
    await expect(checks).toContainText("skipped: no 3D");
    await expect(checks).toContainText("Boska");
    await expect(checks).toContainText("General Sans");
    await expect(page.locator("[data-start-build]")).toHaveCount(0);
    const ack = page.locator("input[name='ack']");
    if (await ack.count()) await ack.check();
    await page.getByRole("button", { name: "Approve pre-build checks" }).click();
    await expect(page.locator("[data-start-build]")).toBeEnabled();
    expect(existsSync(path.join(dir, ".hitchhiker", "queue.json"))).toBe(false);
    await expect(page.locator("body")).not.toContainText("The build is started.");
  } finally {
    child.kill();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    await rm(sandbox, { recursive: true, force: true });
  }
});

function startChild(sandbox: string, projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const env = { ...process.env };
  delete env.HH_CASSETTE;
  delete env.HH_GUIDE_CASSETTE;
  env.HH_E2E_PROJECT = sandbox;
  env.HH_PROJECT_HOME = path.join(sandbox, ".hh-save-home");
  env.HH_E2E_SITE = projectDir;
  env.HH_E2E_SERVER = pathToFileURL(serverFile).href;
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_SITE;
    const loaded = await import(specifier);
    const think = async (req) => {
      throw new Error(req.task);
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
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

function pageTitles(markdown: string): string[] {
  const titles: string[] = [];
  for (const line of markdown.split(/\n/)) {
    const match = /^- (.+?) at \S+/.exec(line.trim());
    if (match?.[1] !== undefined && !titles.includes(match[1])) titles.push(match[1]);
  }
  return titles;
}

function fingerprint(dir: string): string {
  const hash = createHash("sha256");
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      const info = statSync(full);
      const relative = path.relative(dir, full);
      if (info.isDirectory()) {
        hash.update(`dir:${relative}\n`);
        walk(full);
      } else {
        hash.update(`file:${relative}\n`);
        hash.update(readFileSync(full));
        hash.update("\n");
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function readTree(dir: string): string {
  const chunks: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else chunks.push(readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return chunks.join("\n");
}
