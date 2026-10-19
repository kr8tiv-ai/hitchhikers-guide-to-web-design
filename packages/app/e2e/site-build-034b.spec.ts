/**
 * BUG-034b: kill the desk after prompt 003, restart, and continue the queue.
 * BUG-042: restart holds the interrupted run until Resume. The stub never launches grok.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("restart after prompt 003 ends passes it and starts 004", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-034b-end-"));
  let child = startDesk(projectDir, "end");
  try {
    const first = await readUrl(child);
    await finishInterview(page, first);
    await approve(page, first);
    await waitForRunningEnd(projectDir);
    await stopDesk(child);
    child = startDesk(projectDir, "end");
    const next = await readUrl(child);
    await page.goto(`${rootOf(next)}/hh-dashboard`);
    await expectHeld(page, projectDir);
    await resumeQueue(page);
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    await expect(page.locator('[data-id="004"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    await expect(page.locator("[data-recovery]")).toContainText("003 recovered: output verified, passed");
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
    const ids = await spawnIds(projectDir);
    expect(ids.filter((id) => id === "003").length).toBe(1);
    expect(ids).toContain("004");
  } finally {
    await stopDesk(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("restart before prompt 003 ends reruns it and 004 passes", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-034b-cut-"));
  let child = startDesk(projectDir, "cut");
  try {
    const first = await readUrl(child);
    await finishInterview(page, first);
    await approve(page, first);
    await waitForRunningCut(projectDir);
    await stopDesk(child);
    child = startDesk(projectDir, "cut");
    const next = await readUrl(child);
    await page.goto(`${rootOf(next)}/hh-dashboard`);
    await expectHeld(page, projectDir);
    await resumeQueue(page);
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    await expect(page.locator('[data-id="004"]')).toHaveAttribute("data-status", "passed", { timeout: 30_000 });
    await expect(page.locator("[data-recovery]")).toContainText("003 rerun after restart");
    const ids = await spawnIds(projectDir);
    expect(ids.filter((id) => id === "003").length).toBeGreaterThanOrEqual(2);
    expect(ids).toContain("004");
  } finally {
    await stopDesk(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("Resume continues an interrupted prompt once and then runs 004", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-build-034b-resume-"));
  const child = startDesk(projectDir, "resume");
  try {
    const url = await readUrl(child);
    const root = rootOf(url);
    await page.goto(`${root}/hh-dashboard`);
    const resume = page.locator('[data-action="resume"][data-prompt="003"]');
    await expect(resume).toBeEnabled();
    await resume.click();
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "running", { timeout: 15_000 });
    const during = page.locator('[data-action="resume"][data-prompt="003"]');
    if ((await during.count()) > 0) await expect(during).toBeDisabled();
    await page.evaluate(async () => {
      const token = document.querySelector('meta[name="hh-csrf"]')?.getAttribute("content") ?? "";
      await fetch("/api/drive/resume", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": token },
        body: JSON.stringify({ id: "003" }),
      });
    });
    expect((await spawnIds(projectDir)).filter((id) => id === "003")).toEqual(["003"]);
    await writeFile(path.join(projectDir, "release-003"), "go\n", "utf8");
    await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "passed", { timeout: 20_000 });
    await expect(page.locator('[data-id="004"]')).toHaveAttribute("data-status", "passed", { timeout: 20_000 });
    await expect(page.locator("[data-recovery]")).toContainText("003 rerun after restart");
    expect((await spawnIds(projectDir)).filter((id) => id === "003")).toEqual(["003"]);
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
  } finally {
    await writeFile(path.join(projectDir, "release-003"), "go\n", "utf8").catch(() => undefined);
    await stopDesk(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function rootOf(url: string): string {
  return url.replace(/\/$/, "");
}

async function expectHeld(page: Page, projectDir: string): Promise<void> {
  await expect(page.locator("#queue")).toHaveAttribute("data-queue-state", "paused");
  await expect(page.locator('[data-id="003"]')).toHaveAttribute("data-status", "running");
  await expect(page.getByText("Paused after 002", { exact: true })).toBeVisible();
  await expect(page.locator("#drive-resume")).toBeEnabled();
  await page.waitForTimeout(400);
  const ids = await spawnIds(projectDir);
  expect(ids.filter((id) => id === "003")).toEqual(["003"]);
  expect(ids).not.toContain("004");
  const queue = await readJson(path.join(projectDir, ".hitchhiker", "queue.json"));
  expect(pauseAfter(queue)).toBe("002");
  expect(itemStatus(queue, "003")).toBe("running");
}

async function resumeQueue(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const token = document.querySelector('meta[name="hh-csrf"]')?.getAttribute("content") ?? "";
    const response = await fetch("/api/drive/resume-queue", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: "{}",
    });
    return response.status;
  });
  expect(status).toBe(200);
}

function pauseAfter(queue: unknown): string {
  if (typeof queue !== "object" || queue === null || !("pause" in queue)) return "";
  const pause = queue.pause;
  return typeof pause === "object" && pause !== null && "after" in pause && typeof pause.after === "string" ? pause.after : "";
}

async function approve(page: Page, url: string): Promise<void> {
  const root = rootOf(url);
  await page.goto(`${root}/approve`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
}

async function spawnIds(projectDir: string): Promise<string[]> {
  const order = await readFile(path.join(projectDir, "spawn-order.txt"), "utf8").catch(() => "");
  return order.split(/\r?\n/).filter((line) => line.trim() !== "");
}

async function promptFiles(projectDir: string, id: string): Promise<string[]> {
  const text = await readFile(path.join(projectDir, ".hitchhiker", "prompts", `${id}.md`), "utf8");
  const line = text.split(/\r?\n/).find((item) => item.startsWith("Files:"));
  if (line === undefined) return [];
  return line
    .slice("Files:".length)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "" && item.toLowerCase() !== "none");
}

async function waitForRunningEnd(projectDir: string): Promise<void> {
  const expected = await promptFiles(projectDir, "003");
  await waitFor(async () => {
    const queue = await readJson(path.join(projectDir, ".hitchhiker", "queue.json"));
    const run = await readJson(path.join(projectDir, ".hitchhiker", "build-run.json"));
    const item = itemStatus(queue, "003");
    const log = await readFile(path.join(projectDir, ".hitchhiker", "logs", "build-003.log"), "utf8").catch(() => "");
    return (
      item === "running" &&
      recordStatus(run) === "running" &&
      log.includes("end_turn") &&
      expected.length > 0 &&
      expected.every((rel) => existsSync(path.join(projectDir, rel))) &&
      !existsSync(path.join(projectDir, ".hitchhiker", "STATE.md.lock"))
    );
  }, projectDir);
}

async function waitForRunningCut(projectDir: string): Promise<void> {
  await waitFor(async () => {
    const queue = await readJson(path.join(projectDir, ".hitchhiker", "queue.json"));
    const run = await readJson(path.join(projectDir, ".hitchhiker", "build-run.json"));
    return (
      itemStatus(queue, "003") === "running" &&
      recordStatus(run) === "running" &&
      existsSync(path.join(projectDir, "003-hung.txt")) &&
      !existsSync(path.join(projectDir, ".hitchhiker", "STATE.md.lock"))
    );
  }, projectDir);
}

async function waitFor(ready: () => Promise<boolean>, projectDir: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const queue = await readFile(path.join(projectDir, ".hitchhiker", "queue.json"), "utf8").catch(() => "");
  const run = await readFile(path.join(projectDir, ".hitchhiker", "build-run.json"), "utf8").catch(() => "");
  throw new Error(`prompt 003 did not settle into a running row\n${queue}\n${run}`);
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function itemStatus(queue: unknown, id: string): string {
  if (typeof queue !== "object" || queue === null || !("items" in queue) || !Array.isArray(queue.items)) return "";
  const item = queue.items.find((entry) => typeof entry === "object" && entry !== null && "id" in entry && entry.id === id);
  return typeof item === "object" && item !== null && "status" in item && typeof item.status === "string" ? item.status : "";
}

function recordStatus(run: unknown): string {
  return typeof run === "object" && run !== null && "status" in run && typeof run.status === "string" ? run.status : "";
}

async function finishInterview(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.count()) await skip.click();
  await page.locator("#hh-card-draft").fill("The site helps a visitor book a visit.");
  await page.locator('[data-action="answer"]').click();
  await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
}

function startDesk(projectDir: string, mode: "end" | "cut" | "resume"): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
      HH_E2E_MODE: mode,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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

function childSource(): string {
  return `
    import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
    import path from "node:path";
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const mode = process.env.HH_E2E_MODE;
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
    if (mode === "resume") {
      mkdirSync(path.join(projectDir, ".hitchhiker", "prompts"), { recursive: true });
      mkdirSync(path.join(projectDir, ".hitchhiker", "logs"), { recursive: true });
      writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "003.md"), "Files: public/logo.svg, src/components/Logo.astro\\n");
      writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "004.md"), "Files: none\\n");
      writeFileSync(path.join(projectDir, ".hitchhiker", "logs", "build-003.log"), "still writing\\n");
      writeFileSync(path.join(projectDir, ".hitchhiker", "queue.json"), JSON.stringify({
        items: [
          { id: "001", kind: "build", status: "passed" },
          { id: "002", kind: "build", status: "passed" },
          { id: "003", kind: "build", status: "interrupted" },
          { id: "004", kind: "build", status: "queued" },
        ],
      }, null, 2));
    }
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
    const priorCount = (id) => {
      try {
        return readOrder().filter((item) => item === id).length;
      } catch {
        return 0;
      }
    };
    const readOrder = () => {
      try {
        return readFileSync(path.join(projectDir, "spawn-order.txt"), "utf8").split("\\n").map((item) => item.trim()).filter(Boolean);
      } catch {
        return [];
      }
    };
    const buildSpawn = (request) => {
      const seen = priorCount(request.promptId);
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      if (!request.args.includes("grok-4.7-build-fast") || !request.args.includes("xhigh")) {
        writeFileSync(path.join(projectDir, "model-miss.txt"), "miss\\n");
      }
      if (request.promptId === "003" && seen === 0 && (mode === "end" || mode === "cut")) {
        if (mode === "end") {
          const logs = path.join(projectDir, ".hitchhiker", "logs");
          mkdirSync(logs, { recursive: true });
          writeFileSync(path.join(logs, "build-003.log"), '{"type":"end","stopReason":"end_turn"}\\n');
          const prompt = readFileSync(path.join(projectDir, ".hitchhiker", "prompts", "003.md"), "utf8");
          const filesLine = prompt.split("\\n").find((item) => item.startsWith("Files:")) || "";
          for (const rel of filesLine.slice(6).split(",").map((item) => item.trim()).filter((item) => item && item.toLowerCase() !== "none")) {
            const abs = path.join(projectDir, rel);
            mkdirSync(path.dirname(abs), { recursive: true });
            writeFileSync(abs, "/* e2e */\\n");
          }
        }
        writeFileSync(path.join(projectDir, "003-hung.txt"), "1\\n");
        return { pid: 999999, done: new Promise(() => {}) };
      }
      if (request.promptId === "003" && mode === "resume") {
        const release = path.join(projectDir, "release-003");
        const done = new Promise((resolve) => {
          const timer = setInterval(() => {
            if (existsSync(release)) {
              clearInterval(timer);
              resolve({ code: 0, stdout: "", stderr: "", errorCode: null });
            }
          }, 40);
        });
        return { pid: 999999, done };
      }
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}
