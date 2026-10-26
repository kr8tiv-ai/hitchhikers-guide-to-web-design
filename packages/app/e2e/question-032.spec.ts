/**
 * BUG-032. DP-9.3's heading is the question. The recap sits underneath it.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { loadTree, saveState } from "@hitchhiker/engine";
import { removeTempDir } from "../test/remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "../../../interview/tree.yaml");
const MESSAGE =
  "Once paradisefound.farm is live, someone still changes a price, a photo, a sold-out week, a harvest note, or the winter hours on the stall page, and that edit has to land without calling a studio back. Who will look after the site once it is live?";

test("DP-9.3 shows the question as the heading and the recap below", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdirTemp();
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("[data-card-kicker]")).toContainText("DP-9.2");
    const answer = page.locator('[data-region="question"] [data-action="answer"]');
    await expect(answer).toBeVisible();
    await expect(async () => {
      const kicker = page.locator("[data-card-kicker]");
      if ((await kicker.innerText()).includes("DP-9.2")) {
        await page.locator("#hh-card-draft").fill("Hostinger, and we already own paradisefound.farm.");
        await answer.click();
      }
      await expect(kicker).toContainText("DP-9.3", { timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    const heading = page.locator("#hh-card-ask");
    await expect(heading).toHaveText("Who will look after the site once it is live?");
    await expect(page.locator("[data-card-kicker]")).toContainText("DP-9.3");
    const help = page.locator("[data-card-help]");
    await expect(help).toContainText("changes a price");
    await expect(heading).toBeVisible();
    await expect(help).toBeVisible();
    const headingBox = await heading.boundingBox();
    const helpBox = await help.boundingBox();
    expect(headingBox).not.toBeNull();
    expect(helpBox).not.toBeNull();
    expect((helpBox?.y ?? 0) > (headingBox?.y ?? 0)).toBe(true);
  } finally {
    await stopChild(child);
    await removeTempDir(projectDir);
  }
});

async function mkdirTemp(): Promise<string> {
  const projectDir = path.join(tmpdir(), `hh-e2e-032-${Date.now()}`);
  await mkdir(path.join(projectDir, ".hitchhiker"), { recursive: true });
  const all = loadTree(treeFile);
  const cut = all.findIndex((question) => question.id === "DP-9.2");
  if (cut < 0) throw new Error("DP-9.2 is missing from the tree");
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
    promptId: "interview:DP-9.2",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-9.2.",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  return projectDir;
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function childSource(): string {
  const message = JSON.stringify(MESSAGE);
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
