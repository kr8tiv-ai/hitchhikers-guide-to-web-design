/**
 * BUG-031: approve, watch the drive, then see the stub's files or the failure.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { approveDesignAndStart } from "./design-then-build.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("approve shows a running build, then the stub file, then passed", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-e2e-"));
  const child = await startDesk(projectDir, false);
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await finishInterview(page, url);
    await page.goto(`${root}/approve`);
    await approveBriefThenPlan(page);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "running");
    await expect(page.locator("[data-build-log]")).toContainText("Writing the home page");
    await expect.poll(async () => readFile(path.join(projectDir, "index.html"), "utf8").catch(() => "")).toContain("Home");
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "passed", { timeout: 20_000 });
    await expect(page.locator("[data-files-written]")).toContainText("index.html", { timeout: 15_000 });
  } finally {
    child.kill();
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a failing stub shows the failure and a Retry control", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-e2e-fail-"));
  const child = await startDesk(projectDir, true);
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await finishInterview(page, url);
    await page.goto(`${root}/approve`);
    await approveBriefThenPlan(page);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "failed", { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.locator("[data-build-reason]")).toContainText("usage limit");
  } finally {
    child.kill();
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function approveBriefThenPlan(page: import("@playwright/test").Page): Promise<void> {
  const box = page.locator('input[name="confirmFallback"]');
  if (await box.count()) await box.check();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const plan = page.getByRole("button", { name: "Approve plan", exact: true });
  await expect(plan).toBeEnabled();
  if (await box.count()) await box.check();
  await plan.click();
  await approveDesignAndStart(page);
}

async function finishInterview(page: import("@playwright/test").Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.count()) await skip.click();
  await page.locator("#hh-card-draft").fill("The site helps a visitor book a visit.");
  await page.locator('[data-action="answer"]').click();
  await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
}

function startDesk(projectDir: string, fail: boolean): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
      HH_E2E_BUILD_FAIL: fail ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    import { mkdirSync, writeFileSync } from "node:fs";
    import path from "node:path";
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const fail = process.env.HH_E2E_BUILD_FAIL === "1";
    mkdirSync(path.join(projectDir, "interview"), { recursive: true });
    writeFileSync(path.join(projectDir, "interview", "tree.yaml"), ${JSON.stringify(`questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`)});
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
    const buildSpawn = (request) => {
      request.onOutput?.("Writing the home page");
      let resolve;
      const done = new Promise((settle) => { resolve = settle; });
      const delay = request.promptId === "001" ? 2000 : 0;
      setTimeout(() => {
        if (!fail && request.promptId === "001") {
          writeFileSync(path.join(projectDir, "index.html"), "<p>Home</p>\\n");
        }
        resolve({
          code: fail && request.promptId === "001" ? 1 : 0,
          stdout: "",
          stderr: fail && request.promptId === "001" ? "usage limit" : "",
          errorCode: null,
        });
      }, delay);
      return { pid: 424242, done };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
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
