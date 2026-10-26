/**
 * BUG-034: a stub that emits stream end and then exits, without ever closing
 * stdio, still advances the queue. Prompt 003 is that shape.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { approveDesignAndStart } from "./design-then-build.ts";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("queue advances through an end-then-exit prompt that never closes", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-034-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await finishInterview(page, url);
    await page.goto(`${root}/approve`);
    await approveBriefThenPlan(page);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
    for (const id of ["001", "002", "003", "004"]) {
      await expect(page.locator(`[data-id="${id}"]`)).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    }
    const order = await readFile(path.join(projectDir, "spawn-order.txt"), "utf8");
    assertOrder(order);
    const logo = await readFile(path.join(projectDir, "logo.svg"), "utf8");
    expect(logo).toContain("<svg");
    await expect(page.locator("[data-files-written]")).toContainText("logo.svg");
    await expect(page.locator("[data-id='004']")).toHaveAttribute("data-status", "passed");
  } finally {
    child.kill();
    await removeTempDir(projectDir);
  }
});

async function resumeLines(projectDir: string): Promise<number> {
  const text = await readFile(path.join(projectDir, "spawn-args.txt"), "utf8").catch(() => "");
  return text.split(/\r?\n/).filter((line) => line.includes("--resume desk044")).length;
}

function assertOrder(order: string): void {
  const ids = order.split(/\r?\n/).filter((line) => line.trim() !== "");
  expect(ids.slice(0, 4)).toEqual(["001", "002", "003", "004"]);
}

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

test("a turn cap fails the row, names the desk cap, and Retry keeps the partial work", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-044-"));
  const child = startDesk(projectDir, true);
  try {
    const url = await readUrl(child);
    const root = url.replace(/\/$/, "");
    await finishInterview(page, url);
    await page.goto(`${root}/approve`);
    await approveBriefThenPlan(page);
    await page.goto(`${root}/hh-dashboard`);
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "failed", { timeout: 30_000 });
    await expect(page.locator("[data-build-reason]")).toContainText("desk sets no cap");
    await expect(page.locator("[data-retry-note]")).toHaveText("Partial work is kept.");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect.poll(async () => resumeLines(projectDir)).toBe(1);
    await page.locator('[data-action="retry"][data-prompt="001"]').click();
    await expect.poll(async () => resumeLines(projectDir)).toBe(2);
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "failed", { timeout: 20_000 });
    await expect(page.locator('[data-id="002"]')).toHaveAttribute("data-status", "queued");
  } finally {
    child.kill();
    await removeTempDir(projectDir);
  }
});

function startDesk(projectDir: string, turnCap = false): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
      HH_E2E_TURN_CAP: turnCap ? "1" : "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  return `
    import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
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
      throw new Error(req.task);
    };
    const buildSpawn = (request) => {
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      appendFileSync(path.join(projectDir, "spawn-args.txt"), request.args.join(" ") + "\\n");
      if (process.env.HH_E2E_TURN_CAP === "1") {
        const stream = '{"type":"max_turns_reached","num_turns":80}\\n{"type":"end","stopReason":"cancelled","num_turns":80,"sessionId":"desk044"}\\n';
        request.onOutput?.(stream);
        return { pid: 999999, done: Promise.resolve({ code: 0, stdout: stream, stderr: "", errorCode: null }) };
      }
      request.onOutput?.('{"type":"end","stopReason":"end_turn"}');
      if (request.promptId === "003") {
        writeFileSync(path.join(projectDir, "logo.svg"), "<svg></svg>\\n");
        let resolveExit;
        const exited = new Promise((resolve) => { resolveExit = resolve; });
        setTimeout(() => resolveExit(0), 40);
        return { pid: 999999, done: new Promise(() => {}), exited };
      }
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
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
