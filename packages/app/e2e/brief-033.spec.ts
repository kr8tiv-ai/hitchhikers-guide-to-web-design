/**
 * BUG-033: an over-length draft still renders the brief, without the stopped-early alert.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("an over-length brief renders complete without the stopped-early alert", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-033-e2e-"));
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
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const url = await readUrl(child);
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();
    await page.locator("#hh-card-draft").fill("The site helps a visitor book a visit.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.getByRole("link", { name: "Review the Site Brief" })).toBeVisible();
    await page.goto(`${url.replace(/\/$/, "")}/approve`);
    await expect(page.getByRole("heading", { name: "Limits" })).toBeVisible();
    await expect(page.locator("body")).toContainText("The limits stay on the brief.");
    await expect(page.locator("body")).toContainText("The pages stay on the brief.");
    await expect(page.locator("body")).toContainText("The features stay on the brief.");
    await expect(page.locator("body")).not.toContainText("stopped early");
    await expect(page.locator("body")).not.toContainText("Source :");
  } finally {
    child.kill();
    await rm(projectDir, { recursive: true, force: true });
  }
});

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const line = "The site helps a visitor book a visit.";
    function over(label, length) {
      const bit = "The " + label.toLowerCase() + " stay on the brief. ";
      let text = "";
      while (text.length < length) text += bit;
      return text.slice(0, length);
    }
    const brief = {
      goal: line, visitor: line, action: line, offer: line, vibe: line,
      references: line, exists: line, protected: line, motion: line,
      limits: over("Limits", 565), hosting: line, pages: over("Pages", 528),
      features: over("Features", 534), coverage: line,
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
