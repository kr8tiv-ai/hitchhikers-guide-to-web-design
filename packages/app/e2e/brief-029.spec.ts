/**
 * BUG-029: an empty Change something stays on /approve with an inline message.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

test("an empty change stays on the approve page and focuses the field", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-brief-029-e2e-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: { ...process.env, HH_E2E_PROJECT: projectDir, HH_E2E_SERVER: pathToFileURL(serverFile).href },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const root = (await readUrl(child)).replace(/\/$/, "");
    await page.goto(`${root}/`);
    const drafted = await page.evaluate(async () => {
      const token = document.querySelector('meta[name="hh-csrf"]')?.getAttribute("content") ?? "";
      const response = await fetch("/api/brief/draft", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": token },
        body: "{}",
      });
      return { status: response.status, body: await response.text() };
    });
    expect(drafted.status, drafted.body).toBe(200);
    await expect.poll(async () => {
      return page.evaluate(async () => {
        const response = await fetch("/api/brief", { cache: "no-store" });
        const payload: unknown = await response.json();
        return typeof payload === "object" && payload !== null ? (payload as { status?: string }).status ?? "" : "";
      });
    }).toBe("pending");
    await page.goto(`${root}/approve`);
    const field = page.locator("textarea[name='correction']");
    await field.fill("   ");
    await page.getByRole("button", { name: "Change something" }).click();
    await expect(page).toHaveURL(/\/approve$/);
    await expect(page.locator("[data-change-error]")).toBeVisible();
    await expect(page.locator("[data-change-error]")).toContainText("Write the change.");
    await expect(field).toBeFocused();
    await expect(page.locator("body")).not.toContainText('{"error"');
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
    const brief = {
      goal: line, visitor: line, action: line, offer: line, vibe: line, references: line,
      exists: line, protected: line, motion: line, limits: line, hosting: line,
      pages: line, features: line, coverage: line,
    };
    const think = async (req) => {
      if (req.task === "brief-draft") return { value: brief, raw: "{}", durationMs: 0, cassette: "live" };
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
