import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { TALK_NEEDS_CHROMIUM } from "../src/client/desk.ts";
import { VOICE_FALLBACK, isPaidSttUrl } from "../src/client/voice-engine.ts";

/**
 * Default voice must not call a paid speech host. Web Speech is stubbed.
 * HH_E2E_PROJECT keeps the Guide off the live model. Whisper paths are missing
 * on purpose, so a machine that has whisper.cpp cannot hide the fallback.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

let child: ChildProcess | null = null;
let projectDir = "";
let deskUrl = "";

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-nospend-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
        WHISPER_CPP_BIN: path.join(projectDir, "no-whisper-cli"),
        WHISPER_CPP_MODEL: path.join(projectDir, "no-model.bin"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  deskUrl = await readUrl(child);
});

test.afterAll(async () => {
  if (child !== null) await stopChild(child);
  if (projectDir !== "") await rm(projectDir, { recursive: true, force: true });
});

test("default hold-to-talk and a conversational turn never call paid speech", async ({ page }) => {
  const errors = trackErrors(page);
  const seen = await watchPaid(page);
  await page.addInitScript(installSpeech, "For myself.");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(deskUrl);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  await expectEngine(page, "Voice: browser (free)");

  await page.emulateMedia({ colorScheme: "dark" });
  await expectEngine(page, "Voice: browser (free)");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectEngine(page, "Voice: browser (free)");
  await page.emulateMedia({ colorScheme: "light" });
  await expectEngine(page, "Voice: browser (free)");

  const button = page.locator('[data-voice="hold"]');
  await pointerDown(page, button);
  await expect(page.locator("#hh-card-draft")).toHaveValue("For myself.");
  await page.mouse.up();
  await expect(page.locator("[data-voice-engine]")).toHaveText("Voice: browser (free)");
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await page.locator('[data-action="answer"]').click();
  await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
  await expect(page.locator("[data-voice-engine]")).toHaveText("Voice: browser (free)");
  expect(seen.paid).toEqual([]);
  expect(seen.urls.filter((url) => isPaidSttUrl(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test("a browser without speech shows the fallback, still accepts typing, and spends nothing", async ({ page }) => {
  const errors = trackErrors(page);
  const seen = await watchPaid(page);
  await page.addInitScript(() => {
    const wipe = (name: "SpeechRecognition" | "webkitSpeechRecognition"): void => {
      Object.defineProperty(window, name, { configurable: true, writable: true, value: undefined });
    };
    wipe("SpeechRecognition");
    wipe("webkitSpeechRecognition");
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(deskUrl);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();

  const button = page.locator('[data-voice="hold"]');
  await expect(button).toHaveText(TALK_NEEDS_CHROMIUM);
  await expect(button).toBeDisabled();
  await expect(page.locator("[data-voice-fallback]")).toHaveText(VOICE_FALLBACK);
  await expect(page.locator("[data-voice-help]")).toContainText("may leave");
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expectEngine(page, "Voice: unavailable");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectEngine(page, "Voice: unavailable");

  await page.locator("#hh-card-draft").fill("For myself.");
  await expect(page.locator("#hh-card-draft")).toHaveValue("For myself.");
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await page.locator('[data-action="answer"]').click();
  await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
  await expect(page.locator("[data-voice-engine]")).toHaveText("Voice: unavailable");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("[data-voice-fallback]")).toBeVisible();
  await expectEngine(page, "Voice: unavailable");
  expect(seen.paid).toEqual([]);
  expect(seen.urls.filter((url) => isPaidSttUrl(url))).toEqual([]);
  expect(errors).toEqual([]);
});

async function expectEngine(page: Page, label: string): Promise<void> {
  await expect(page.locator("[data-voice-engine]")).toHaveText(label);
  await expect.poll(async () => page.evaluate((expected) => {
    const el = document.querySelector("[data-voice-engine]");
    if (el === null || (el.textContent ?? "") !== expected) return null;
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      line: el.scrollWidth <= el.clientWidth + 1,
      page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      help: document.querySelector("[data-voice-help]")?.textContent ?? "",
    };
  }, label)).toEqual(expect.objectContaining({
    line: true,
    page: true,
  }));
  const fit = await page.evaluate((expected) => {
    const el = document.querySelector("[data-voice-engine]");
    const rect = el?.getBoundingClientRect();
    return {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      help: document.querySelector("[data-voice-help]")?.textContent ?? "",
      text: el?.textContent ?? "",
    };
  }, label);
  expect(fit.text).toBe(label);
  expect(fit.width).toBeGreaterThan(40);
  expect(fit.height).toBeGreaterThan(8);
  expect(fit.help).toContain("Google");
  expect(fit.help).toContain("Microsoft");
  expect(fit.help).toContain("may leave");
  expect(fit.help.includes("!")).toBe(false);
}

async function watchPaid(page: Page): Promise<{ urls: string[]; paid: string[] }> {
  const urls: string[] = [];
  const paid: string[] = [];
  page.on("request", (request) => {
    urls.push(request.url());
  });
  page.on("websocket", (socket) => {
    urls.push(socket.url());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isPaidSttUrl(url)) {
      paid.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return { urls, paid };
}

function installSpeech(transcript: string): void {
  const host = window as Window & {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  class FakeSpeech {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start(): void {
      this.onstart?.();
      this.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript } } },
      });
    }
    stop(): void {
      this.onend?.();
    }
    abort(): void {
      this.onend?.();
    }
  }
  const define = (name: "SpeechRecognition" | "webkitSpeechRecognition"): void => {
    Object.defineProperty(host, name, { configurable: true, writable: true, value: FakeSpeech });
  };
  define("SpeechRecognition");
  define("webkitSpeechRecognition");
}

async function pointerDown(page: Page, button: ReturnType<Page["locator"]>): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (box === null) throw new Error("Hold to talk has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
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

function readUrl(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not print a URL\n${stderr}`));
    }, 20_000);
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((item) => item.startsWith("http://127.0.0.1:"));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    proc.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`desk exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

async function stopChild(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL");
      resolve();
    }, 2_000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
