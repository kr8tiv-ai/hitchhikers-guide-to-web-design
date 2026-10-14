/**
 * BUG-036, BUG-025, BUG-035. Stubbed cards: a real question, no internal guidance, no colon join.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { loadTree, saveState } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "../../../interview/tree.yaml");

const DP71_ASK =
  "How much are you OK spending on AI-made stills and videos? $0, a little, a fair amount, or you name it.";
const DP71_RECAP =
  "You are brand new, this is the first site, and it is your own business: Paradise Found, Find your calm, connecting expats to ocean-view Costa Rican farms through a lawyer-led direct purchase.";
const DP71_GUIDANCE =
  "Show the model and the resolution on every line. Do not promise 1080p inside a small cap. Prices live on the cost meter, not in this question. Stop at the cap.";
const DP71_MESSAGE = `${DP71_RECAP} Change?`;

const DP27_MESSAGE =
  "Dana, on an iPad, still needs one clear thing to ask about. : What do you sell or give away, and why should anyone care?";
const DP27_ASK = "What do you sell or give away, and why should anyone care?";

test("DP-7.1 shows the budget question and hides model guidance", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await seedBefore("DP-6.6", "hh-e2e-226-budget");
  const child = startDesk(projectDir, DP71_MESSAGE);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-card-kicker]")).toContainText("DP-6.6");
    await page.locator("#hh-card-draft").fill("No one in the audience is sensitive to motion.");
    await page.locator('[data-region="question"] [data-action="answer"]').click();
    const heading = page.locator("#hh-card-ask");
    await expect(heading).toHaveText(DP71_ASK);
    await expect(page.locator("[data-card-kicker]")).toContainText("DP-7.1");
    await expect(page.locator("[data-card-lead]")).toContainText("Paradise Found");
    await expect(page.locator('[data-region="question"]')).not.toContainText(DP71_GUIDANCE);
    await expect(page.locator("#transcript")).not.toContainText("Show the model and the resolution on every line");
    const text = await heading.innerText();
    expect(text.includes(" : ")).toBe(false);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("DP-2.7 heading is only the question", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await seedBefore("DP-2.6", "hh-e2e-226-offer");
  const child = startDesk(projectDir, DP27_MESSAGE);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await page.locator("#hh-card-draft").fill("Dana, on an iPad, wants one clear next step.");
    await page.locator('[data-region="question"] [data-action="answer"]').click();
    const heading = page.locator("#hh-card-ask");
    await expect(heading).toHaveText(DP27_ASK);
    await expect(page.locator("[data-card-lead]")).toContainText("Dana, on an iPad");
    const text = await heading.innerText();
    expect(text.includes(" : ")).toBe(false);
    const labelled = await page.locator("article.hh-qcard").getAttribute("aria-labelledby");
    expect(labelled).toBe("hh-card-ask");
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("DP-1.5 shows the six font examples", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await seedAt("DP-1.5", "hh-e2e-226-fonts");
  const child = startDesk(projectDir, "Do you have fonts you use? If not, pick a style from these examples.");
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-card-kicker]")).toContainText("DP-1.5");
    const samples = page.locator("[data-font-sample]");
    await expect(samples).toHaveCount(6);
    await expect(samples.nth(0)).toContainText("Bebas Neue + Barlow");
    await expect(samples.nth(0)).toContainText("Find your calm");
    await expect(page.locator("#hh-card-ask")).toContainText("pick a style from these examples");
    const heading = await page.locator("#hh-card-ask").innerText();
    expect(heading.includes(" : ")).toBe(false);
    await samples.nth(2).click();
    await expect(page.locator("#hh-card-draft")).toHaveValue("DM Serif Display + DM Sans");
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function seedBefore(id: string, prefix: string): Promise<string> {
  const projectDir = path.join(tmpdir(), `${prefix}-${Date.now()}`);
  await mkdir(path.join(projectDir, ".hitchhiker"), { recursive: true });
  const all = loadTree(treeFile);
  const cut = all.findIndex((question) => question.id === id);
  if (cut < 0) throw new Error(`${id} is missing from the tree`);
  const answers = all.slice(0, cut).map((question) => ({
    id: question.id,
    status: "ANSWERED" as const,
    value: "Yes.",
  }));
  await writeFile(
    path.join(projectDir, ".hitchhiker", "interview.json"),
    `${JSON.stringify({ version: 1, answers, cursor: cut, pushedIds: [] }, null, 2)}\n`,
  );
  await saveState(projectDir, {
    phase: "Don't Panic",
    slice: "The Guide",
    promptId: `interview:${id}`,
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Answer ${id}.`,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return projectDir;
}

async function seedAt(id: string, prefix: string): Promise<string> {
  return seedBefore(id, prefix);
}

function startDesk(projectDir: string, message: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource(message)], {
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(message: string): string {
  const encoded = JSON.stringify(message);
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
        if (req.task === "context-summary") return hit({ summary: "A farm site." });
        return hit({ message: ${encoded}, explanationLevel: "beginner", joke: false });
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
