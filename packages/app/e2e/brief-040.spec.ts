/**
 * BUG-040: the approve page keeps the fallback label through a named change,
 * and Approve starts the build only after the confirmation.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const LINE = "The site helps a visitor book a visit.";

test("a fallback stays labelled, a named change lands, and Approve asks first", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-040-e2e-"));
  await mkdir(path.join(projectDir, "interview"), { recursive: true });
  await mkdir(path.join(projectDir, ".hitchhiker"), { recursive: true });
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
  await writeFile(
    path.join(projectDir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: LINE }]),
  );
  const draft: Record<string, string> = {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    maintainer: "The owner types the raw answer.",
    pages: LINE,
    features: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: "Not applicable: 3D is none, so the custom generation budget is not asked.",
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
  await writeFile(
    path.join(projectDir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "pending",
      draft,
      buildStarted: false,
      error: "The brief draft stopped early. These fields stay filled from the interview. Use Retry to ask again.",
      note: "",
      fallback: true,
    })}\n`,
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
    const marker = page.locator("[data-brief-fallback]");
    await expect(marker).toBeVisible();
    await expect(marker).toContainText("filled from the interview");
    await expect(page.locator("[data-brief-error]")).toContainText("stopped early");
    await expect(page.getByRole("heading", { name: "Budget" }).locator("xpath=following-sibling::p[1]")).toContainText(
      "Not applicable",
    );
    await expect(page.getByRole("checkbox", { name: "I am approving the interview fallback, not a model draft." })).toBeVisible();

    await page.locator("#brief-correction").fill(
      "Budget: Up to 50 dollars for AI stills. Maintainer: The owner approves every change.",
    );
    await page.getByRole("button", { name: "Change something" }).click();
    await expect(page.getByRole("heading", { name: "Budget" }).locator("xpath=following-sibling::p[1]")).toContainText(
      "Up to 50 dollars for AI stills",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("heading", { name: "Maintainer" }).locator("xpath=following-sibling::p[1]")).toContainText(
      "approves every change",
    );
    await expect(marker).toBeVisible();
    await expect(page.locator("[data-brief-error]")).toContainText("stopped early");
    await expect(page.locator("body")).not.toContainText("The build is started.");

    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const confirm = page.locator("[data-fallback-confirm]");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("Confirm the interview fallback before approving.");
    await expect(page.locator("[data-brief-error]")).toContainText("stopped early");
    await expect(page.locator("[data-brief-error]")).not.toContainText("Confirm the interview fallback");
    await expect(marker).toBeVisible();
    await expect(page.locator("body")).not.toContainText("The build is started.");

    await page.getByRole("checkbox", { name: "I am approving the interview fallback, not a model draft." }).check();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Approve plan", exact: true })).toBeEnabled();
    await expect(page.locator("body")).not.toContainText("The build is started.");
    await page.getByRole("checkbox", { name: "I am approving the interview fallback, not a model draft." }).check();
    await page.getByRole("button", { name: "Approve plan", exact: true }).click();
    await expect(page.locator("[data-design-stage='sitemap']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("The build is started.");
    await expect(page.locator("[data-brief-fallback]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Budget" }).locator("xpath=following-sibling::p[1]")).toContainText(
      "Up to 50 dollars for AI stills",
    );
    await expect(page.locator("[data-brief-error]")).toHaveCount(0);
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
    const think = async (req) => {
      if (req.task === "brief-revise") {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { value: { budget: "Quiero una tienda para el sitio." }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "context-summary") {
        return { value: { summary: "Brief approved." }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "pushback-judge" || req.task === "guide-message" || req.task === "brief-draft") {
        const line = "The site helps a visitor book a visit.";
        return { value: { message: "The questions on this desk are finished.", explanationLevel: "beginner", joke: false, vague: false, quote: "visit", sharperChoice: "What should the site do for a visitor?", goal: line }, raw: "{}", durationMs: 0, cassette: "live" };
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
