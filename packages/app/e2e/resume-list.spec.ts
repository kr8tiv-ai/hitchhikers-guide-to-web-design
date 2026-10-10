import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { saveProjectFile, saveState, upsertRecentProject } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the first screen lists a save, opens the file, and drops a missing row", async ({ page }) => {
  test.setTimeout(90_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-resume-e2e-"));
  const home = path.join(projectDir, ".hh-save-home");
  const desktop = path.join(home, "Desktop");
  const filePath = path.join(desktop, "Towel Desk.hhproject");
  const missing = path.join(desktop, "Gone Desk.hhproject");
  const kept = path.join(desktop, "keep-me.hhproject");
  const serverFile = path.resolve(here, "../src/server/server.ts");
  await mkdir(desktop, { recursive: true });
  await saveState(projectDir, {
    phase: "Don't Panic",
    slice: "Towel",
    promptId: "interview:DP-0.2",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-0.2.",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  await writeFile(
    path.join(projectDir, ".hitchhiker", "interview.json"),
    `${JSON.stringify({
      version: 1,
      answers: [{ id: "DP-0.1", status: "ANSWERED", value: "For myself." }],
      cursor: 1,
      pushedIds: [],
    }, null, 2)}\n`,
  );
  await saveProjectFile(projectDir, {
    homeDir: home,
    projectName: "Towel Desk",
    now: new Date("2026-01-02T00:00:00.000Z"),
  });
  await writeFile(kept, "{}\n");
  await upsertRecentProject(
    {
      projectId: "p-gone",
      name: "Gone Desk",
      filePath: missing,
      sourceDir: path.join(projectDir, "gone"),
      savedAt: "2020-01-01T00:00:00.000Z",
      progress: "question 1 of 40",
      ok: true,
      reason: null,
    },
    home,
  );
  await saveState(projectDir, {
    phase: "Don't Panic",
    slice: "Towel",
    promptId: "interview:DP-0.3",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-0.3.",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
  await writeFile(
    path.join(projectDir, ".hitchhiker", "interview.json"),
    `${JSON.stringify({
      version: 1,
      answers: [
        { id: "DP-0.1", status: "ANSWERED", value: "For myself." },
        { id: "DP-0.2", status: "ANSWERED", value: "A previous site." },
      ],
      cursor: 2,
      pushedIds: [],
    }, null, 2)}\n`,
  );

  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
        HH_PROJECT_HOME: home,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await expect(page.locator("[data-question-id='DP-0.3']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resume a project" })).toBeVisible();
    await expect(page.getByText("Towel Desk")).toBeVisible();
    await expect(page.locator("[data-missing='true']")).toContainText("Missing");
    await expect(page.locator("[data-save-status]")).toContainText("Saved ·");
    await expect(page.locator("[data-save-status]")).toContainText("Desktop");
    await expect(page.locator("[data-save-status]")).toHaveAttribute("title", filePath);
    expect(await overflows(page)).toBe(false);
    await page.screenshot({ path: path.join(here, "screens", "resume-375.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("[data-question-id='DP-0.3']")).toBeVisible();
    expect(await overflows(page)).toBe(false);
    await page.screenshot({ path: path.join(here, "screens", "resume-1440.png"), fullPage: true });

    await page.locator("[data-copy]").first().click();
    await expect(page.locator("[data-copied='true']")).toHaveText("Copied");

    await page.locator("[data-missing='true']").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Gone Desk")).toHaveCount(0);
    await expect(page.getByText("Towel Desk")).toBeVisible();
    expect(await readFile(kept, "utf8")).toBe("{}\n");
    await expect(page.locator("[data-question-id='DP-0.3']")).toBeVisible();

    await page.locator("#hh-open-file").fill(filePath);
    await page.getByRole("button", { name: "Open project file" }).click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("[data-save-status]")).toContainText("Saved ·");
    const restored = await readFile(path.join(projectDir, ".hitchhiker", "STATE.md"), "utf8");
    expect(restored).toContain("interview:DP-0.2");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function overflows(page: { evaluate: (fn: () => boolean) => Promise<boolean> }): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const handle = await loaded.startServer({ projectDir, open: false });
    process.stdout.write(handle.url + "\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not print a URL\n${stderr}`));
    }, 20_000);
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
  child.kill();
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
