/**
 * BUG-042: a legacy paused queue shows "Paused after 007" and Resume.
 * Nothing starts until Resume. The stub never launches grok.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Drive shows Paused after 007 until Resume starts 008", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-pause-237-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Paused after 007", { exact: true })).toBeVisible();
    await expect(page.locator("#drive-resume")).toBeEnabled();
    await expect(page.locator('[data-id="008"]')).toHaveAttribute("data-status", "paused");
    await expect(page.locator("#queue")).toHaveAttribute("data-queue-state", "paused");
    await page.waitForTimeout(400);
    expect(await spawnIds(projectDir)).toEqual([]);
    expect(await readFile(path.join(projectDir, "model-miss.txt"), "utf8").catch(() => "")).toBe("");
    await page.locator("#drive-resume").click();
    await expect(page.locator('[data-id="008"]')).toHaveAttribute("data-status", "passed", { timeout: 20_000 });
    expect(await spawnIds(projectDir)).toContain("008");
    await expect(page.locator("[data-build-model]")).toHaveAttribute("data-build-model", "grok-4.7-build-fast");
    await expect(page.locator("[data-build-effort]")).toHaveAttribute("data-build-effort", "xhigh");
    expect(await readFile(path.join(projectDir, "model-miss.txt"), "utf8").catch(() => "")).toBe("");
    await expect(page.getByText("Paused after 007", { exact: true })).toHaveCount(0);
  } finally {
    await stopDesk(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function spawnIds(projectDir: string): Promise<string[]> {
  const order = await readFile(path.join(projectDir, "spawn-order.txt"), "utf8").catch(() => "");
  return order.split(/\r?\n/).filter((line) => line.trim() !== "");
}

function startDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
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
  const items = [];
  for (let index = 1; index <= 11; index += 1) {
    const id = String(index).padStart(3, "0");
    const status = index <= 7 ? "passed" : index === 8 ? "paused" : "queued";
    items.push({ id, kind: "build", status });
  }
  return `
    import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
    import path from "node:path";
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    mkdirSync(path.join(projectDir, "interview"), { recursive: true });
    mkdirSync(path.join(projectDir, ".hitchhiker", "prompts"), { recursive: true });
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
    writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "008.md"), "Prompt 008\\n");
    writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "009.md"), "Prompt 009\\n");
    writeFileSync(path.join(projectDir, ".hitchhiker", "queue.json"), JSON.stringify({ items: ${JSON.stringify(items)} }, null, 2));
    const loaded = await import(specifier);
    const think = async () => {
      throw new Error("the pause desk must not ask the model");
    };
    const buildSpawn = (request) => {
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      if (!request.args.includes("grok-4.7-build-fast") || !request.args.includes("xhigh")) {
        writeFileSync(path.join(projectDir, "model-miss.txt"), "miss\\n");
      }
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}
