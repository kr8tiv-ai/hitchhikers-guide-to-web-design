/**
 * BUG-038: prompt 003 hits a 402. Drive shows the top-up, the escalation,
 * and a paused queue. Retry runs 003 again, then 004. The stub never launches grok.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOP_UP = "Your Grok Build usage balance is used up. Top up your balance, then press Retry.";

test("a 402 at prompt 003 pauses the drive and Retry resumes", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-038-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await finishInterview(page, url);
    await page.goto(`${root}/approve`);
    await approveBriefThenPlan(page);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "failed", { timeout: 30_000 });
    await expect(page.locator('[data-id="004"]')).toHaveAttribute("data-status", "paused");
    await expect(page.locator('[data-status="running"]')).toHaveCount(0);
    await expect(page.getByText(TOP_UP).first()).toBeVisible();
    await expect(page.locator('[data-escalation="billing"]')).toBeVisible();
    await expect(page.locator('[data-queue-state="paused"]').first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("exited with code 1");
    await expect(page.locator("body")).not.toContainText("costUsdTicks");
    await expect(page.locator("body")).not.toContainText("No escalations");
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
    const before = await spawnIds(projectDir);
    expect(before).toContain("003");
    expect(before).not.toContain("004");
    expect(await readFile(path.join(projectDir, "model-miss.txt"), "utf8").catch(() => "")).toBe("");
    await page.locator('[data-action="retry"][data-prompt="003"]').click();
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    await expect(page.locator('[data-id="004"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    const after = await spawnIds(projectDir);
    expect(after.filter((id) => id === "003").length).toBe(2);
    expect(after).toContain("004");
    expect(after.indexOf("004")).toBeGreaterThan(after.lastIndexOf("003"));
  } finally {
    await stopDesk(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function finishInterview(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.count()) await skip.click();
  await page.locator("#hh-card-draft").fill("The site helps a visitor book a visit.");
  await page.locator('[data-action="answer"]').click();
  await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
}

async function approveBriefThenPlan(page: Page): Promise<void> {
  const box = page.locator('input[name="confirmFallback"]');
  if (await box.count()) await box.check();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const plan = page.getByRole("button", { name: "Approve plan", exact: true });
  await expect(plan).toBeEnabled();
  if (await box.count()) await box.check();
  await plan.click();
}

async function spawnIds(projectDir: string): Promise<string[]> {
  const order = await readFile(path.join(projectDir, "spawn-order.txt"), "utf8").catch(() => "");
  return order.split(/\r?\n/).filter((line) => line.trim() !== "");
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
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
      const line = stdout.split(/\r?\n/).find((item) => item.startsWith("http://127.0.0.1:"));
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

async function stopDesk(child: ChildProcess): Promise<void> {
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

function childSource(): string {
  return `
    import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
    import path from "node:path";
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
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
      if (req.task === "context-summary") {
        return { value: { summary: "A site that books a visit." }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      throw new Error(req.task);
    };
    const priorCount = (id) => {
      try {
        return readFileSync(path.join(projectDir, "spawn-order.txt"), "utf8").split("\\n").map((item) => item.trim()).filter(Boolean).filter((item) => item === id).length;
      } catch {
        return 0;
      }
    };
    const buildSpawn = (request) => {
      const seen = priorCount(request.promptId);
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      if (!request.args.includes("grok-4.7-build-fast") || !request.args.includes("xhigh")) {
        writeFileSync(path.join(projectDir, "model-miss.txt"), "miss\\n");
      }
      if (request.promptId === "003" && seen === 0) {
        const line402 = "API error (status 402 Payment Required): Grok Build usage balance exhausted";
        request.onOutput?.(line402 + "\\n");
        request.onOutput?.('"costUsdTicks": 9514179200 } }, "numTurns": 33 } }\\n');
        return { pid: 999999, done: Promise.resolve({ code: 1, stdout: "", stderr: line402, errorCode: null }) };
      }
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}
