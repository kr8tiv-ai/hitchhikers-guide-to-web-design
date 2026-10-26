/**
 * BUG-027: interview finish, draft, approve, and the build, with reloads.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("a finished interview drafts the brief, approves it, and starts one build", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-e2e-"));
  await mkdir(path.join(projectDir, "interview"), { recursive: true });
  await writeFile(
    path.join(projectDir, "interview", "tree.yaml"),
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
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();
    await page.locator("#hh-card-draft").fill("The site helps a visitor book a visit.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
    await page.goto(`${root}/approve`);
    await expect(page.getByRole("heading", { name: "Goal" })).toBeVisible();
    await expect(page.locator("body")).toContainText("The site helps a visitor book a visit.");
    await expect(page.locator("[data-next-action]")).toContainText("Draft the plan");
    await expect(page.locator("[data-plan-coverage]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Change something" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Nothing is waiting for a yes");
    await page.reload();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.locator("[data-plan-coverage]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Approve plan", exact: true }).click();
    await expect(page.locator("[data-design-stage='sitemap']")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).not.toContainText("The build is started.");
    await page.getByRole("button", { name: "Approve sitemap" }).click();
    await page.getByRole("button", { name: "Approve wireframe" }).click();
    await page.getByRole("button", { name: "Approve style guide" }).click();
    await page.locator("[data-direction-reason]").fill("This direction matches the visit.");
    await page.locator("[data-pick-direction]").first().click();
    await expect(page.locator("[data-design-stage='style-guide']")).toBeVisible();
    await page.getByRole("button", { name: "Approve style guide" }).click();
    await expect(page.locator("[data-direction-desk]")).toContainText("Picked");
    await page.getByRole("button", { name: "Approve direction" }).click();
    await page.getByRole("button", { name: "Approve pre-build checks" }).click();
    await expect(page.locator("[data-start-build]")).toBeEnabled();
    await page.locator("[data-start-build]").click();
    await expect(page.locator("[data-build-status]")).toContainText("The build is started.");
    await page.reload();
    await expect(page.locator("[data-build-status]")).toContainText("The build is started.");
    await page.goto(`${root}/brand`);
    await expect(page.locator("body")).toContainText("Babel Fish");
    await expect(page.locator("body")).toContainText("The site helps a visitor book a visit.");
    await expect(page.getByRole("link", { name: "The build is started." })).toBeVisible();
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator("body")).toContainText("Improbability Drive");
    await expect(page.locator("body")).toContainText("Babel Fish");
    await expect(page.locator('[data-id="001"]')).toHaveCount(1);
    await page.goto(`${root}/approve`);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toHaveCount(0);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator('[data-id="001"]')).toHaveCount(1);
  } finally {
    child.kill();
    await removeTempDir(projectDir);
  }
});

test("an incomplete plan shows the coverage table and keeps Approve off", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-e2e-gap-"));
  await mkdir(path.join(projectDir, "interview"), { recursive: true });
  await mkdir(path.join(projectDir, ".hitchhiker", "prompts"), { recursive: true });
  await writeFile(
    path.join(projectDir, "interview", "tree.yaml"),
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
  const line = "The site helps a visitor book a visit.";
  const draft = {
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
    pages: "Pages: Home; Eco-Building and Food; About.",
    features: line,
    coverage: line,
  };
  await writeFile(
    path.join(projectDir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, error: "" })}\n`,
  );
  await writeFile(
    path.join(projectDir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: line }]),
  );
  await writeFile(
    path.join(projectDir, ".hitchhiker", "prompts", "001.md"),
    "---\nid: 001\ntitle: Add the Home route.\n---\n\nRequirements: REQ-PAGE-home\n",
  );
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/approve`);
    await expect(page.locator("[data-plan-coverage]")).toBeVisible();
    await expect(page.locator('[data-coverage-id="REQ-PAGE-eco-building-and-food"][data-covered="no"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toBeDisabled();
    await expect(page.locator("body")).toContainText("Approve stays off until every row is covered.");
  } finally {
    child.kill();
    await removeTempDir(projectDir);
  }
});

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const line = "The site helps a visitor book a visit.";
    const brief = {
      goal: line, visitor: line, action: line, offer: line, vibe: line, references: line,
      exists: line, protected: line, motion: line, limits: line, hosting: line, pages: line, features: line, coverage: line,
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
    const buildSpawn = () => ({ pid: 4242, done: new Promise(() => {}) });
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
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
