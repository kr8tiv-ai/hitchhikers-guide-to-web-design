/**
 * Desk Run 6: a new project lives outside the desk repo, then brief, plan,
 * coverage, and the design stages, including a real direction pick.
 * The model and media are stubbed. No billed call.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { isInsideDeskRepo } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const LINE = "The site helps a visitor book a visit.";
const LIMITS =
  'Never promise title, price, residency or returns. Asking price, set by the seller. By November 10, 2026. Yes, that is right. Pages: Yes, price, residency, or returns, set by the seller", 2026, that is right.';
const PHANTOMS = [
  "REQ-PAGE-yes",
  "REQ-PAGE-price",
  "REQ-PAGE-residency",
  "REQ-PAGE-returns",
  "REQ-PAGE-set-by-the-seller",
  "REQ-PAGE-2026",
  "REQ-PAGE-that-is-right",
];

test("a new project approves the brief, the plan, and each design stage", async ({ page }) => {
  test.setTimeout(180_000);
  const sandbox = await mkdtemp(path.join(tmpdir(), "hh-new-project-242a-"));
  const dest = path.join(sandbox, "sites", "visit-book");
  await mkdir(path.join(dest, "interview"), { recursive: true });
  await mkdir(path.join(dest, ".hitchhiker"), { recursive: true });
  await writeFile(
    path.join(dest, ".hitchhiker", "facts.json"),
    `${JSON.stringify({ crawlNotes: ["November 10, 2026"] })}\n`,
  );
  await writeFile(
    path.join(dest, "interview", "tree.yaml"),
    `questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  const hitchhiker = path.join(repo, ".hitchhiker");
  const before = existsSync(hitchhiker) ? (await stat(hitchhiker)).mtimeMs : null;
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const env = { ...process.env };
  delete env.HH_CASSETTE;
  delete env.HH_GUIDE_CASSETTE;
  env.HH_DESK_DIR = repo;
  env.HH_E2E_PROJECT = sandbox;
  env.HH_PROJECT_HOME = path.join(sandbox, ".hh-save-home");
  env.HH_E2E_SERVER = pathToFileURL(serverFile).href;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    expect(isInsideDeskRepo(repo)).toBe(true);
    expect(isInsideDeskRepo(dest)).toBe(false);

    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Start a project" })).toBeVisible();
    await expect(page.locator("#hh-new-name")).toBeVisible();
    await expect(page.locator("#hh-new-dir")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Question 1 of");
    await expect(page.locator('[data-question-id="DP-0.1"]')).toHaveCount(0);

    await page.locator("#hh-new-name").fill("Visit Book");
    await page.locator("#hh-new-dir").fill(dest);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.locator('[data-region="question"][data-live="true"]').waitFor({ timeout: 30_000 });
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();
    await expect(page.locator("[data-question-id]")).toBeVisible();
    await expect(page.locator("[data-first-run]")).toHaveCount(0);

    await page.locator("#hh-card-draft").fill(LINE);
    await page.locator('[data-action="answer"]').click();
    await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible({ timeout: 60_000 });

    await page.goto(`${root}/approve`);
    await expect(page.locator("[data-next-action]")).toContainText("Draft the plan");
    await expect(page.locator("[data-plan-coverage]")).toHaveCount(0);
    await expect(page.locator("[data-brief-fallback]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Limits" }).locator("xpath=..")).toContainText("residency");
    await expect(page.getByRole("heading", { name: "Limits" }).locator("xpath=..")).toContainText("2026");
    const approve = page.getByRole("button", { name: "Approve", exact: true });
    await expect(approve).toBeEnabled();
    await expect(page.locator('input[name="confirmFallback"]')).toHaveCount(0);
    await approve.click();

    await expect(page.locator("[data-plan-coverage]")).toBeVisible({ timeout: 60_000 });
    for (const id of PHANTOMS) {
      await expect(page.locator(`[data-coverage-id="${id}"]`)).toHaveCount(0);
    }
    await expect(page.locator("[data-plan-coverage]")).not.toContainText('set by the seller"');
    await expect(page.locator('[data-coverage-id="REQ-PAGE-home"]')).toBeVisible();
    await expect(page.locator('[data-coverage-id="REQ-FEAT-contact-form"]')).toBeVisible();
    await expect(page.locator("[data-plan-coverage] tbody tr")).toHaveCount(2);
    await expect(page.locator('[data-plan-coverage] [data-covered="no"]')).toHaveCount(0);
    await expect(page.locator('input[name="confirmFallback"]')).toHaveCount(0);
    const approvePlan = page.getByRole("button", { name: "Approve plan", exact: true });
    await expect(approvePlan).toBeEnabled();
    await approvePlan.click();
    await expect(page.locator("[data-build-status]")).toContainText("The build is started.", { timeout: 60_000 });

    await expect(page.getByRole("button", { name: "Approve sitemap" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Approve sitemap" }).click();
    await expect(page.getByRole("button", { name: "Approve wireframe" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Approve wireframe" }).click();
    await expect(page.locator("[data-design-stage='style-guide']")).toContainText("The style guide is in.", {
      timeout: 30_000,
    });

    await page.locator("[data-direction-reason]").fill("This direction matches the visit.");
    await page.locator("[data-pick-direction]").first().click();
    await expect(page.locator("[data-direction-desk]")).toContainText("Picked", { timeout: 30_000 });

    expect(existsSync(path.join(dest, ".hitchhiker", "sitemap.md"))).toBe(true);
    expect(existsSync(path.join(dest, ".hitchhiker", "wireframe.md"))).toBe(true);
    expect(existsSync(path.join(dest, ".hitchhiker", "design-stages.json"))).toBe(true);
    expect(existsSync(path.join(dest, ".hitchhiker", "directions.json"))).toBe(true);
    expect(existsSync(path.join(dest, "DESIGN.md"))).toBe(true);
    const after = existsSync(hitchhiker) ? (await stat(hitchhiker)).mtimeMs : null;
    expect(after).toBe(before);
  } finally {
    child.kill();
    await rm(sandbox, { recursive: true, force: true });
  }
});

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_DESK_DIR;
    const loaded = await import(specifier);
    const line = ${JSON.stringify(LINE)};
    const limits = ${JSON.stringify(LIMITS)};
    const brief = {
      goal: line, visitor: line, action: line, offer: line, vibe: line, references: line,
      exists: line, protected: line, motion: line, limits, hosting: line, maintainer: line,
      pages: "Home", features: "contact form", cadence: line, languages: line, imagery: line,
      budget: line, session: line, logo: line, palette: line, coverage: line,
    };
    const think = async (req) => {
      if (req.task === "pushback-judge") {
        return { value: { vague: false, quote: "visit", sharperChoice: "What should the site do for a visitor?" }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "guide-message") {
        return { value: { message: "The questions on this desk are finished. What comes next?", explanationLevel: "beginner", joke: false }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "brief-draft" || req.task === "brief-revise") {
        return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
      }
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
    const timer = setTimeout(() => reject(new Error(`desk did not print a URL\\n${stderr}`)), 20_000);
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
      reject(new Error(`desk exited ${code ?? "null"}\\n${stderr}\\n${stdout}`));
    });
  });
}
