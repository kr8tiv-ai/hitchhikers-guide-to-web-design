/**
 * BUG-002. The heading is the question. Phase copy and button talk stay out of it.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const COMBINED =
  "Don't Panic. That is the name of this phase. Now back to your site. You said this is your first site, and that you are brand new to all of this. Do you already have a logo, colors, fonts, or photos? Drop whatever you have. PDFs, screenshots, and links all work. A logo is the mark. Colors, fonts, and photos set the light and rhythm before any layout exists. Three ways forward. Answer: drop the files or describe what you have. Suggest for me: I will offer a few concrete options. Skip: leave this for later. Skipping is allowed.";

test("the question heading is only the question", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-211-h-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await page.locator('[data-region="question"] [data-action="skip"]').click();
    const heading = page.locator("#hh-card-ask");
    await expect(heading).toContainText("Do you already have a logo");
    await expect(heading).not.toContainText("Don't Panic.");
    await expect(heading).not.toContainText("Skipping is allowed");
    await expect(heading).not.toContainText("Suggest for me");
    const text = (await heading.innerText()).trim();
    expect(text.length).toBeLessThanOrEqual(200);
    await expect(page.locator("[data-card-lead]")).toContainText("Don't Panic.");
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  const message = JSON.stringify(COMBINED);
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const hit = (value) => ({ value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" });
    const handle = await loaded.startServer({
      projectDir,
      open: false,
      guideThink: async (req) => {
        if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
        return hit({ message: ${message}, explanationLevel: "beginner", joke: false });
      },
    });
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
