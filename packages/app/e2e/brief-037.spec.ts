/**
 * BUG-037: the approval page shows Languages, Imagery, and Budget,
 * and no field is longer than its target.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { BRIEF_HEADINGS, briefFieldTarget, type BriefKey } from "@hitchhiker/engine";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const LONG_GOAL = [
  "The site helps neighbors find a quiet farm stay beside the ocean.",
  "Visitors read the buying steps before they write.",
  "The farms stay listed with plain words and a lawyer at the front.",
  "Photos stay large and the type stays calm.",
  "The owner approves every line before it goes up.",
  "A calm page is enough for the first visit.",
].join(" ");

const headingKey = new Map<string, BriefKey>(
  (Object.entries(BRIEF_HEADINGS) as Array<[BriefKey, string]>).map(([key, heading]) => [heading, key]),
);

test("the approval page shows languages, imagery, and budget within each target", async ({ page }) => {
  expect(LONG_GOAL.length).toBeGreaterThan(briefFieldTarget("goal"));
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-037-e2e-"));
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
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href, HH_E2E_GOAL: LONG_GOAL },
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
    await expect(page.getByRole("heading", { name: "Languages" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Imagery" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Budget" })).toBeVisible();
    await expect(page.locator("body")).toContainText("The site is English first and Spanish second.");
    await expect(page.locator("body")).toContainText("The photos are stock, with no video.");
    await expect(page.locator("body")).toContainText("The spend cap is zero dollars.");
    const sections = page.locator("section");
    const count = await sections.count();
    expect(count).toBeGreaterThan(3);
    for (let index = 0; index < count; index += 1) {
      const section = sections.nth(index);
      const heading = (await section.locator("h2").innerText()).trim();
      const key = headingKey.get(heading);
      expect(key, heading).toBeTruthy();
      const text = (await section.locator("p").first().innerText()).trim();
      expect(text.length, heading).toBeLessThanOrEqual(briefFieldTarget(key ?? "goal"));
    }
    const goal = (await page.locator("section", { has: page.getByRole("heading", { name: "Goal" }) }).locator("p").first().innerText()).trim();
    expect(goal.startsWith("The site helps neighbors")).toBe(true);
    expect(goal.length).toBeLessThanOrEqual(briefFieldTarget("goal"));
    expect(goal.length).toBeLessThan(LONG_GOAL.length);
  } finally {
    child.kill();
    await removeTempDir(projectDir);
  }
});

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const goal = process.env.HH_E2E_GOAL;
    const loaded = await import(specifier);
    const line = "The site helps a visitor book a visit.";
    const brief = {
      goal,
      visitor: line, action: line, offer: line, vibe: line,
      references: line, exists: line, protected: line, motion: line,
      limits: line, hosting: line, maintainer: line, pages: line, features: line,
      cadence: line,
      languages: "The site is English first and Spanish second.",
      imagery: "The photos are stock, with no video.",
      budget: "The spend cap is zero dollars.",
      session: line, logo: line, palette: line,
      coverage: line,
    };
    const think = async (req) => {
      if (req.task === "pushback-judge") {
        return { value: { vague: false, quote: "visit", sharperChoice: "What should the site do for a visitor?" }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "guide-message") {
        return { value: { message: "The questions on this desk are finished. What comes next?", explanationLevel: "beginner", joke: false }, raw: "{}", durationMs: 0, cassette: "live" };
      }
      if (req.task === "brief-draft" || req.task === "brief-revise") {
        if (req.model !== "grok-4.7-build-fast" || req.effort !== "xhigh") throw new Error(req.model + " " + req.effort);
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
