/**
 * BUG-042: a legacy paused queue shows "Paused after 007" and Resume.
 * Nothing starts until Resume. The stub never launches grok.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { removeTempDir } from "../test/remove-temp.ts";

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
    await removeTempDir(projectDir);
  }
});

test("a pause while 001 is still running names that prompt", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-pause-238-"));
  const child = startRunningDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Pause set. 001 is still running and will finish first.", { exact: true })).toBeVisible();
    await expect(page.locator("#drive-resume")).toBeEnabled();
    await expect(page.getByText("Paused before the first prompt.", { exact: true })).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.getByText("Pause set. 001 is still running and will finish first.", { exact: true })).toBeVisible();
    expect(await spawnIds(projectDir)).toEqual([]);
  } finally {
    await stopDesk(child);
    await removeTempDir(projectDir);
  }
});

test("a paused drive shows a turn-cap failure and Retry keeps the partial work", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-pause-044-"));
  const child = startNoteDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Paused after 001", { exact: true })).toBeVisible();
    await expect(page.locator('[data-id="001"]')).toHaveAttribute("data-status", "failed");
    await expect(page.locator("[data-build-reason]")).toContainText("desk sets no cap");
    await expect(page.locator("[data-retry-note]")).toHaveText("Partial work is kept.");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.locator("#drive-resume")).toBeEnabled();
    await page.waitForTimeout(400);
    expect(await spawnIds(projectDir)).toEqual([]);
  } finally {
    await stopDesk(child);
    await removeTempDir(projectDir);
  }
});

function startRunningDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", runningChild()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function runningChild(): string {
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
    writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "001.md"), "Prompt 001\\n");
    writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "002.md"), "Prompt 002\\n");
    writeFileSync(path.join(projectDir, ".hitchhiker", "queue.json"), JSON.stringify({
      items: [
        { id: "001", kind: "build", status: "paused" },
        { id: "002", kind: "build", status: "paused" },
      ],
      pause: { at: "2026-10-19T00:00:00.000Z", after: "" },
    }, null, 2));
    writeFileSync(path.join(projectDir, ".hitchhiker", "build-run.json"), JSON.stringify({
      promptId: "001",
      status: "running",
      model: "grok-4.7-build-fast",
      effort: "xhigh",
      startedAt: "2026-10-19T00:00:00.000Z",
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid: process.pid,
      recovery: "",
      recoveryRerun: false,
    }));
    const loaded = await import(specifier);
    const think = async () => {
      throw new Error("the pause desk must not ask the model");
    };
    const buildSpawn = (request) => {
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}

function startNoteDesk(projectDir: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", noteChild()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function noteChild(): string {
  const reason =
    "Grok stopped after 80 turns; the desk sets no cap, so Grok's own limit applied. Press Retry to run this prompt again.";
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
    writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", "002.md"), "Prompt 002\\n");
    writeFileSync(path.join(projectDir, ".hitchhiker", "queue.json"), JSON.stringify({
      items: [
        { id: "001", kind: "build", status: "failed" },
        { id: "002", kind: "build", status: "queued" },
      ],
      pause: { at: "2026-10-19T00:00:00.000Z", after: "001" },
    }, null, 2));
    writeFileSync(path.join(projectDir, ".hitchhiker", "build-run.json"), JSON.stringify({
      promptId: "001",
      status: "failed",
      model: "grok-4.7-build-fast",
      effort: "xhigh",
      startedAt: "2026-10-19T00:00:00.000Z",
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: ${JSON.stringify(reason)},
      pid: null,
      recovery: "",
      recoveryRerun: false,
      turns: 80,
      turnCap: null,
      stopReason: "cancelled",
      sessionId: "desk044",
      autoRetried: true,
      turnLimited: true,
    }));
    const loaded = await import(specifier);
    const think = async () => {
      throw new Error("the pause desk must not ask the model");
    };
    const buildSpawn = (request) => {
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      request.onOutput?.('{"type":"end","stopReason":"end_turn"}');
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}

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

test("Retry on a paused queue clears the pause", async ({ page }) => {
  test.setTimeout(60_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-pause-046-"));
  const child = startFixedDesk(projectDir, {
    items: [
      { id: "001", kind: "build", status: "failed" },
      { id: "002", kind: "build", status: "queued" },
    ],
    pause: { at: "2026-10-19T00:00:00.000Z", after: "001" },
    run: { promptId: "001", status: "failed" },
  });
  try {
    const url = await readUrl(child);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Paused after 001", { exact: true })).toBeVisible();
    await expect(page.locator("[data-queue-retry]")).toHaveText(
      "The queue is paused. Retry clears the pause and runs this prompt.",
    );
    await page.locator('[data-action="retry"][data-prompt="001"]').click();
    await expect(page.locator("[data-queue-state='paused']")).toHaveCount(0, { timeout: 20_000 });
    expect(await spawnIds(projectDir)).toContain("001");
  } finally {
    await stopDesk(child);
    await removeTempDir(projectDir);
  }
});

test("a pause while 064 is running names 064, then the settled line", async ({ page }) => {
  test.setTimeout(60_000);
  const runningDir = await mkdtemp(path.join(tmpdir(), "hh-pause-047-"));
  const running = startFixedDesk(runningDir, {
    items: [
      { id: "063", kind: "build", status: "passed" },
      { id: "064", kind: "build", status: "running" },
    ],
    pause: { at: "2026-10-19T00:00:00.000Z", after: "063" },
    run: { promptId: "064", status: "running" },
  });
  try {
    const url = await readUrl(running);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Pause set. 064 is still running and will finish first.", { exact: true })).toBeVisible();
    await expect(page.getByText("Paused after 063", { exact: true })).toHaveCount(0);
  } finally {
    await stopDesk(running);
    await removeTempDir(runningDir);
  }

  const settledDir = await mkdtemp(path.join(tmpdir(), "hh-pause-047b-"));
  const settled = startFixedDesk(settledDir, {
    items: [
      { id: "063", kind: "build", status: "passed" },
      { id: "064", kind: "build", status: "passed" },
    ],
    pause: { at: "2026-10-19T00:00:00.000Z", after: "064" },
    run: { promptId: "064", status: "passed" },
  });
  try {
    const url = await readUrl(settled);
    await page.goto(`${url.replace(/\/$/, "")}/hh-dashboard`);
    await expect(page.getByText("Paused after 064", { exact: true })).toBeVisible();
    await expect(page.getByText("still running")).toHaveCount(0);
  } finally {
    await stopDesk(settled);
    await removeTempDir(settledDir);
  }
});

function startFixedDesk(
  projectDir: string,
  seed: {
    items: { id: string; kind: string; status: string }[];
    pause: { at: string; after: string };
    run: { promptId: string; status: string };
  },
): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", fixedChild(seed)], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function fixedChild(seed: {
  items: { id: string; kind: string; status: string }[];
  pause: { at: string; after: string };
  run: { promptId: string; status: string };
}): string {
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
    for (const item of ${JSON.stringify(seed.items)}) {
      writeFileSync(path.join(projectDir, ".hitchhiker", "prompts", item.id + ".md"), "Prompt " + item.id + "\\n");
    }
    writeFileSync(path.join(projectDir, ".hitchhiker", "queue.json"), JSON.stringify({
      items: ${JSON.stringify(seed.items)},
      pause: ${JSON.stringify(seed.pause)},
    }, null, 2));
    writeFileSync(path.join(projectDir, ".hitchhiker", "build-run.json"), JSON.stringify({
      promptId: ${JSON.stringify(seed.run.promptId)},
      status: ${JSON.stringify(seed.run.status)},
      model: "grok-4.7-build-fast",
      effort: "xhigh",
      startedAt: "2026-10-19T00:00:00.000Z",
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid: ${seed.run.status === "running" ? "process.pid" : "null"},
      recovery: "",
      recoveryRerun: false,
    }));
    const loaded = await import(specifier);
    const think = async () => {
      throw new Error("the pause desk must not ask the model");
    };
    const buildSpawn = (request) => {
      appendFileSync(path.join(projectDir, "spawn-order.txt"), request.promptId + "\\n");
      request.onOutput?.('{"type":"end","stopReason":"end_turn"}');
      return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
    };
    const handle = await loaded.startServer({ projectDir, open: false, guideThink: think, buildSpawn });
    process.stdout.write(handle.url + "\\n");
    await new Promise(() => {});
  `;
}
