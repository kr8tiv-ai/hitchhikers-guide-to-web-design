/**
 * BUG-003. A concrete answer advances. A cited soft gap asks once, then advances.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const CITED = "Which part is missing from that month?";

test("a concrete answer advances and a cited gap asks only once", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-judge-003-"));
  await mkdir(path.join(projectDir, "interview"), { recursive: true });
  await writeFile(path.join(projectDir, "interview", "tree.yaml"), TREE);
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
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    const skip = page.getByRole("button", { name: "Skip tour" });
    if (await skip.count()) await skip.click();

    await answer(page, "30 qualified inquiries a month");
    await expect(page.locator("[data-question-id='DP-4.5']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("still soft");

    await answer(page, "Yes.");
    await expect(page.locator("[data-question-id='DP-8.8']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("still soft");

    await answer(page, "30 qualified inquiries a month");
    await expect(page.locator("#hh-card-ask")).toContainText(CITED);
    await expect(page.locator("[data-question-id='DP-8.8']")).toBeVisible();

    await answer(page, "30 qualified inquiries a month");
    await expect(page.locator("[data-question-id='DP-2.1']")).toBeVisible();
    await expect(page.locator("#hh-card-ask")).not.toContainText("missing");
  } finally {
    child.kill();
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function answer(page: import("@playwright/test").Page, text: string): Promise<void> {
  await page.locator("#hh-card-draft").fill(text);
  await page.locator('[data-action="answer"]').click();
}

const TREE = `questions:
  - id: DP-2.4
    topic: outcomes
    module: the-question
    depth: [express, standard, deep]
    ask: "How many calls, bookings, or sales a month would make you happy?"
    why: "A number with a period is enough."
    input: [text]
    skip_default: "KPIs not set."
    writes:
      - "KPIS.md"
  - id: DP-4.5
    topic: answer-engines
    module: vogon-neighbors
    depth: [express, standard, deep]
    ask: "Do you want AI assistants to recommend the business?"
    why: "Yes or no is a full answer."
    input: [choice, text]
    skip_default: "No answer-engine goal."
    writes:
      - "SITE-BRIEF.md"
  - id: DP-8.8
    topic: outcomes
    module: the-question
    depth: [express, standard, deep]
    ask: "How many visits a month would make the shop happy?"
    why: "One number is enough."
    input: [text]
    skip_default: "Visits not set."
    writes:
      - "KPIS.md"
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`;

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const hit = (value) => ({ value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" });
    const cited = "Which part is missing from that month?";
    const think = async (req) => {
      if (req.task === "pushback-judge") {
        const input = String(req.input);
        if (input.includes("Question id: DP-8.8")) {
          return hit({ vague: true, quote: "30", sharperChoice: cited });
        }
        return hit({ vague: true, quote: "answer", sharperChoice: "" });
      }
      if (req.task === "guide-message") {
        return hit({ message: "What should the next page keep?", explanationLevel: "beginner", joke: false });
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
