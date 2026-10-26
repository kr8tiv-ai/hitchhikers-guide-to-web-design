/**
 * BUG-009. A reload while the Guide is still working reattaches to that job.
 * The answer is posted once.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("reload reattaches to the running Guide job and the answer is stored once", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-job-"));
  const hold = path.join(projectDir, "release-guide");
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
      HH_E2E_HOLD: hold,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let answers = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/answer") answers += 1;
  });
  try {
    const url = await readUrl(child);
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    const posted = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/api/answer"),
    );
    await page.locator("#hh-card-draft").fill("For myself.");
    await page.locator('[data-action="answer"]').click();
    const response = await posted;
    expect(response.status()).toBe(200);
    const accepted = (await response.json()) as { jobId?: string; status?: string };
    expect(typeof accepted.jobId).toBe("string");
    expect(accepted.status).toBe("running");
    await page.reload();
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    await expect(page.locator("[aria-busy='true']")).toBeVisible();
    expect(answers).toBe(1);
    await writeFile(hold, "go\n", "utf8");
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    expect(answers).toBe(1);
    const interview = await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
    const saved = JSON.parse(interview) as { answers: Array<{ id: string; value: string }> };
    const mine = saved.answers.filter((item) => item.id === "DP-0.1" && item.value === "For myself.");
    expect(mine).toHaveLength(1);
  } finally {
    await writeFile(hold, "go\n", "utf8").catch(() => undefined);
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

function childSource(): string {
  return `
    const fs = await import("node:fs");
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const hold = process.env.HH_E2E_HOLD ?? "";
    const loaded = await import(specifier);
    const guideThink = async (req) => {
      if (req.task === "pushback-judge") {
        const started = Date.now();
        while (Date.now() - started < 30000) {
          try {
            if (fs.readFileSync(hold, "utf8").includes("go")) break;
          } catch {
            // The file appears when the test lets the call finish.
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { value: { vague: false, quote: "", sharperChoice: "" }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "guide-message") {
        return { value: { message: "The next question is on the card.", explanationLevel: "beginner", joke: false }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "context-summary") {
        return { value: { summary: "A shop site." }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      throw new Error(String(req.task));
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not print a URL\\n${stderr}`));
    }, 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\\n").find((item) => item.startsWith("http://127.0.0.1:"));
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
