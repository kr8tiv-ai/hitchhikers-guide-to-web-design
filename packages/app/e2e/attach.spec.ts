import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2v2H0z"/></svg>');

test("drop, attach, paste, and a failed upload keep the draft", async ({ page }) => {
  test.setTimeout(120_000);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-attach-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(url);
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    await expect(page.locator("[data-attach-zone]")).toHaveCount(0);
    await expect(page.locator("[data-attach-button]")).toHaveCount(0);

    await page.locator("#hh-card-draft").fill("For myself.");
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("[data-attach-zone]")).toBeVisible();
    await expect(page.locator("[data-attach-button]")).toBeVisible();
    await expect(page.locator("[data-attach-zone] .hh-attach__fine")).toHaveText("Paste a link, or drop one here.");
    await expect(page.locator("[data-attach-zone] .hh-attach__coarse")).toHaveText("Paste a link");
    await expect(page.locator("[data-attach-file]")).toHaveAttribute("multiple", "");
    await expect(page.locator("[data-attach-file]")).not.toHaveAttribute("capture", /.+/);

    await page.locator("#hh-card-draft").focus();
    for (let step = 0; step < 8; step += 1) {
      if (await page.locator("[data-attach-button]").evaluate((node) => node === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.locator("[data-attach-button]")).toBeFocused();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("[data-attach-button]").press("Enter");
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([]);

    await page.locator("[data-attach-url]").fill("example.com/old");
    await page.locator("[data-attach-url]").press("Enter");
    await expect(page.locator("[data-attach-live]")).toContainText("Added link example.com/old");
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "example.com/old" })).toBeVisible();

    await dropText(page, "text/uri-list", "https://example.com/work");
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "example.com/work" })).toBeVisible();

    await dropFile(page, {
      name: "site.url",
      type: "text/plain",
      bytes: Array.from(Buffer.from("[InternetShortcut]\r\nURL=https://example.com/shortcut\r\n")),
    });
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "example.com/shortcut" })).toBeVisible();

    const shortcut = page.locator("[data-attach-chip]", { hasText: "example.com/shortcut" });
    await shortcut.locator("[data-attach-remove]").click();
    await expect(page.locator("[data-attach-live]")).toContainText("Removed example.com/shortcut");
    await expect(shortcut).toHaveCount(0);

    const draft = "I built one site before, with a page builder, and the old address is attached.";
    await page.locator("#hh-card-draft").fill(draft);
    await dropFile(page, { name: "logo.exe", type: "application/octet-stream", bytes: [0x4d, 0x5a] });
    await expect(page.locator("[data-attach-zone] .hh-attach__error")).toContainText("logo.exe is not a type the Guide takes");
    await expect(page.locator("#hh-card-draft")).toHaveValue(draft);
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "example.com/old" })).toBeVisible();

    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toHaveCount(0);

    await skipUntil(page, "DP-1.1");
    await expect(page.locator("[data-attach-zone] .hh-attach__fine")).toHaveText("Drop images here, or use Attach.");
    await expect(page.locator("[data-attach-zone] .hh-attach__coarse")).toHaveText("Attach images");

    let releaseUpload: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    await page.route("**/api/attach/**", async (route) => {
      await gate;
      await route.continue();
    });
    await dropFile(page, { name: "tins.png", type: "image/png", bytes: Array.from(PNG) });
    await expect(page.locator("[data-attach-live]")).toContainText("Uploading 1 of 1");
    await expect(page.locator('[data-action="answer"]')).toBeDisabled();
    releaseUpload();
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "tins.png" })).toBeVisible();
    await expect(page.locator("[data-attach-live]")).toContainText("Added 1 file");
    await page.unroute("**/api/attach/**");

    await page.locator("[data-attach-file]").setInputFiles([
      { name: "side.png", mimeType: "image/png", buffer: PNG },
      { name: "logo.svg", mimeType: "image/svg+xml", buffer: SVG },
    ]);
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "side.png" })).toBeVisible();
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "logo.svg" })).toBeVisible();

    await pasteImage(page);
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: /^pasted-image-/ })).toBeVisible();
    await expect(page.locator("[data-attach-zone] .hh-attach__thumb").first()).toHaveAttribute("src", /^blob:/);

    const names = await savedFiles(projectDir, "DP-1.1");
    expect(names.some((name) => name.endsWith(".png"))).toBe(true);
    expect(names.some((name) => name.endsWith(".svg"))).toBe(true);

    const logoDraft = "A wordmark in two colors, and the mark should stay as drawn.";
    await page.locator("#hh-card-draft").fill(logoDraft);
    await page.route("**/api/attach/**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"no"}' }),
    );
    await dropFile(page, { name: "again.png", type: "image/png", bytes: Array.from(PNG) });
    await expect(page.locator("[data-attach-zone] .hh-attach__error")).toContainText("again.png did not save. Try again.");
    await expect(page.locator("#hh-card-draft")).toHaveValue(logoDraft);
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "tins.png" })).toBeVisible();
    await expect(page.locator('[data-action="answer"]')).toBeEnabled();
    await page.unroute("**/api/attach/**");

    await page.setViewportSize({ width: 390, height: 800 });
    const attachButton = page.locator("[data-attach-button]");
    await expect(attachButton).toBeVisible();
    const box = await attachButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(fits).toBe(true);
    const css = await page.evaluate(async () => {
      const response = await fetch("/src/card.css");
      return response.text();
    });
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain(".hh-attach__coarse");

    await page.locator('[data-action="answer"]').click();
    await expect.poll(async () => readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")).toContain(
      "Attached:",
    );
    const interview = await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
    expect(interview).toContain("tins.png");
    expect(interview).toContain("Links: example.com/old");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await removeProject(projectDir);
  }
});

async function dropFile(page: Page, file: { name: string; type: string; bytes: number[] }): Promise<void> {
  await page.locator("[data-attach-zone]").evaluate((zone, item) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(item.bytes)], item.name, { type: item.type }));
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    zone.dispatchEvent(event);
  }, file);
}

async function dropText(page: Page, mime: string, value: string): Promise<void> {
  await page.locator("[data-attach-zone]").evaluate(
    (zone, item) => {
      const transfer = new DataTransfer();
      transfer.setData(item.mime, item.value);
      transfer.setData("text/plain", item.value);
      const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
      zone.dispatchEvent(event);
    },
    { mime, value },
  );
}

async function pasteImage(page: Page): Promise<void> {
  await page.locator("[data-region='question']").evaluate((card, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(bytes)], "clip.png", { type: "image/png" }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    card.dispatchEvent(event);
  }, Array.from(PNG));
}

async function skipUntil(page: Page, target: string): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    const id = await page.locator("[data-question-id]").getAttribute("data-question-id");
    if (id === target) return;
    const token = await page.locator('meta[name="hh-csrf"]').getAttribute("content");
    expect(id).not.toBeNull();
    expect(token).not.toBeNull();
    const status = await page.evaluate(
      async ({ questionId, csrf }) => {
        const response = await fetch("/api/skip", {
          method: "POST",
          headers: { "content-type": "application/json", "x-hh-csrf": csrf },
          body: JSON.stringify({ questionId }),
        });
        return response.status;
      },
      { questionId: id ?? "", csrf: token ?? "" },
    );
    expect(status).toBe(200);
    await expect(page.locator("[data-question-id]")).not.toHaveAttribute("data-question-id", id ?? "");
  }
  await expect(page.locator(`[data-question-id='${target}']`)).toBeVisible();
}

async function savedFiles(projectDir: string, questionId: string): Promise<string[]> {
  const folder = path.join(projectDir, ".hitchhiker", "uploads", questionId);
  let names: string[] = [];
  for (let step = 0; step < 50; step += 1) {
    try {
      names = (await readdir(folder)).filter((name) => name !== "manifest.json");
      if (names.some((name) => name.endsWith(".png")) && names.some((name) => name.endsWith(".svg"))) return names;
    } catch {
      // The folder appears when the first file finishes saving.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return names;
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
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Windows can keep the project directory locked for a moment after the desk exits. */
async function removeProject(dir: string): Promise<void> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      last = error;
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw last;
}
