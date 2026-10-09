import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Hold to talk against the served /client/desk.js. Chromium has no microphone
 * here: addInitScript installs a fake webkitSpeechRecognition before the module
 * runs. The desk must not post /api/answer. HH_E2E_PROJECT keeps the Guide quiet,
 * the same gate answer-one uses, so a stray turn cannot call Grok.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTE = "Chrome sends this audio to its speech service.";
const RELEASE_EMPTY = "Hold the button while you speak.";
const BLOCKED = "The microphone is blocked.";
const UNSUPPORTED = "Voice input needs Chrome or Edge";

type VoiceMode = "words" | "restart" | "stuck" | "fast" | "denied" | "missing";

let child: ChildProcess | null = null;
let projectDir = "";
let deskUrl = "";

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-voice-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  child = spawn(
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
  deskUrl = await readUrl(child);
});

test.afterAll(async () => {
  if (child !== null) await stopChild(child);
  if (projectDir !== "") await rm(projectDir, { recursive: true, force: true });
});

test("mouse and keyboard holds fill the draft and do not submit", async ({ page }) => {
  const errors = trackErrors(page);
  const answers: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/answer") answers.push(request.url());
  });
  await openDesk(page, "words");

  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await expect(page.locator("[data-voice-note]")).toHaveCount(0);

  await draft.fill("Hello");
  await draft.evaluate((el) => {
    const field = el as HTMLTextAreaElement;
    field.setSelectionRange(1, 1);
  });
  const draftHandle = await draft.elementHandle();
  const buttonHandle = await button.elementHandle();
  expect(draftHandle).not.toBeNull();
  expect(buttonHandle).not.toBeNull();

  await pointerDown(page, button);
  await expect(button).toHaveText("Listening. Release to stop");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(draft).toHaveValue("Hello testing one two");
  await expect(page.locator("[data-voice-note]")).toHaveText(NOTE);
  const sameNodes = await page.evaluate(() => {
    const field = document.querySelector("#hh-card-draft");
    const held = document.querySelector('[data-voice="hold"]');
    const active = document.activeElement;
    const captured = (window as Window & { __hhVoiceCaptureEl?: Element }).__hhVoiceCaptureEl ?? null;
    return {
      field: field !== null,
      held: held !== null,
      focus: active === field || active === held,
      capture: captured !== null && captured === held,
    };
  });
  expect(sameNodes.focus).toBe(true);
  expect(sameNodes.capture).toBe(true);
  expect(await draftHandle?.evaluate((el, other) => el === other, await draft.elementHandle())).toBe(true);
  expect(await buttonHandle?.evaluate((el, other) => el === other, await button.elementHandle())).toBe(true);

  await page.mouse.up();
  await expect(draft).toHaveValue("Hello testing one two");
  await expect(page.locator("[data-card-notice]")).toHaveText(/Heard you/);
  await expect(button).toHaveText("Hold to talk");
  await expect(page.locator("[data-voice-note]")).toHaveText(NOTE);
  expect(answers).toEqual([]);

  await draft.fill("");
  const keyboardButton = await button.elementHandle();
  await button.focus();
  await page.keyboard.down(" ");
  await expect(button).toHaveText("Listening. Release to stop");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toBeFocused();
  expect(await keyboardButton?.evaluate((el, other) => el === other, await button.elementHandle())).toBe(true);
  await page.keyboard.up(" ");
  await expect(draft).toHaveValue("testing one two");
  await expect(page.locator("[data-card-notice]")).toHaveText(/Heard you/);
  await expect(button).toHaveText("Hold to talk");
  expect(answers).toEqual([]);
  expect(errors).toEqual([]);
});

test("recognition that ends while the button is held starts again", async ({ page }) => {
  const errors = trackErrors(page);
  await openDesk(page, "restart");
  const button = page.locator('[data-voice="hold"]');
  const handle = await button.elementHandle();
  await pointerDown(page, button);
  await expect.poll(() => page.evaluate(() => (window as Window & { __hhVoiceStarts?: number }).__hhVoiceStarts ?? 0)).toBeGreaterThanOrEqual(2);
  await expect(button).toHaveText("Listening. Release to stop");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await handle?.evaluate((el, other) => el === other, await button.elementHandle())).toBe(true);
  await page.mouse.up();
  await expect(page.locator("#hh-card-draft")).toHaveValue("testing one two");
  await expect(page.locator("[data-card-notice]")).toHaveText(/Heard you/);
  expect(errors).toEqual([]);
});

test("a stop before onstart still releases the button", async ({ page }) => {
  const errors = trackErrors(page);
  await openDesk(page, "stuck");
  const button = page.locator('[data-voice="hold"]');
  await pointerDown(page, button);
  await expect(button).toHaveText("Listening. Release to stop");
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as Window & { __hhVoiceAborts?: number }).__hhVoiceAborts ?? 0), {
    timeout: 2_000,
  }).toBeGreaterThanOrEqual(1);
  await expect(button).toHaveText("Hold to talk");
  await expect(page.locator("#hh-card-error")).toHaveText(RELEASE_EMPTY);
  await expect(page.locator('[data-region="question"]')).not.toContainText("press Allow");
  await expect(page.locator('[data-region="question"]')).not.toContainText("allow the microphone");

  await pointerDown(page, button);
  await expect.poll(() => page.evaluate(() => (window as Window & { __hhVoiceStarts?: number }).__hhVoiceStarts ?? 0)).toBeGreaterThanOrEqual(2);
  await expect(button).toHaveText("Listening. Release to stop");
  await page.mouse.up();
  await expect(page.locator("#hh-card-draft")).toHaveValue("testing one two");
  await expect(button).toHaveText("Hold to talk");
  expect(errors).toEqual([]);
});

test("a fast release with nothing heard does not ask for the microphone", async ({ page }) => {
  const errors = trackErrors(page);
  await openDesk(page, "fast");
  const button = page.locator('[data-voice="hold"]');
  await pointerDown(page, button);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(page.locator("#hh-card-error")).toHaveText(RELEASE_EMPTY);
  await expect(page.locator('[data-region="question"]')).not.toContainText("press Allow");
  await expect(page.locator('[data-region="question"]')).not.toContainText("allow the microphone");
  await expect(button).toHaveText("Hold to talk");
  expect(errors).toEqual([]);
});

test("a blocked microphone shows the alert", async ({ page }) => {
  const errors = trackErrors(page);
  await openDesk(page, "denied");
  await pointerDown(page, page.locator('[data-voice="hold"]'));
  await expect(page.locator("#hh-card-error")).toContainText(BLOCKED);
  await expect(page.locator('[role="alert"]')).toContainText(BLOCKED);
  await page.mouse.up();
  await expect(page.locator("#hh-card-error")).toContainText(BLOCKED);
  expect(errors).toEqual([]);
});

test("no speech recognition shows the unsupported message", async ({ page }) => {
  const errors = trackErrors(page);
  await openDesk(page, "missing");
  await pointerDown(page, page.locator('[data-voice="hold"]'));
  await expect(page.locator('[role="alert"]')).toContainText(UNSUPPORTED);
  await expect(page.locator("[data-voice-note]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function openDesk(page: Page, mode: VoiceMode): Promise<void> {
  await page.addInitScript(installVoice, mode);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(deskUrl);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  await expect(page.locator('script[src="/client/desk.js"]')).toHaveCount(1);
  const boot = await page.evaluate(() => {
    const host = window as Window & {
      __hhVoiceBoot?: string;
      SpeechRecognition?: { name?: string };
      webkitSpeechRecognition?: { name?: string };
    };
    return {
      boot: host.__hhVoiceBoot ?? "",
      speech: host.SpeechRecognition?.name ?? typeof host.SpeechRecognition,
      webkit: host.webkitSpeechRecognition?.name ?? typeof host.webkitSpeechRecognition,
    };
  });
  expect(boot.boot).toBe(mode);
  if (mode === "missing") {
    expect(boot.speech).toBe("undefined");
    expect(boot.webkit).toBe("undefined");
  } else {
    expect(boot.speech).toBe("FakeSpeech");
    expect(boot.webkit).toBe("FakeSpeech");
  }
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Hold to talk");
}

function installVoice(mode: VoiceMode): void {
  const host = window as Window & {
    __hhVoiceBoot?: string;
    __hhVoiceStarts?: number;
    __hhVoiceAborts?: number;
    __hhVoiceCaptureEl?: Element;
    webkitSpeechRecognition?: new () => unknown;
    SpeechRecognition?: new () => unknown;
  };
  host.__hhVoiceBoot = `enter:${mode}`;
  const original = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function capture(this: Element, pointerId: number) {
    host.__hhVoiceCaptureEl = this;
    return original.call(this, pointerId);
  };

  const define = (name: "SpeechRecognition" | "webkitSpeechRecognition", value: unknown): void => {
    Object.defineProperty(window, name, { configurable: true, writable: true, value });
  };
  if (mode === "missing") {
    define("SpeechRecognition", undefined);
    define("webkitSpeechRecognition", undefined);
    host.__hhVoiceBoot = mode;
    return;
  }

  const speechEvent = (text: string, isFinal: boolean) => ({
    resultIndex: 0,
    results: {
      length: 1,
      0: { isFinal, length: 1, 0: { transcript: text } },
    },
  });

  class FakeSpeech {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    start(): void {
      host.__hhVoiceStarts = (host.__hhVoiceStarts ?? 0) + 1;
      const starts = host.__hhVoiceStarts;
      if (mode === "stuck" && starts === 1) return;
      if (mode === "denied") {
        this.onerror?.({ error: "not-allowed" });
        this.onend?.();
        return;
      }
      if (mode === "restart" && starts === 1) {
        this.onstart?.();
        const rec = this;
        setTimeout(() => rec.onend?.(), 30);
        return;
      }
      this.onstart?.();
      if (mode === "fast") return;
      if (mode === "words") this.onresult?.(speechEvent("test", false));
      this.onresult?.(speechEvent("testing one two", true));
    }

    stop(): void {
      if (mode === "stuck") return;
      this.onend?.();
    }

    abort(): void {
      host.__hhVoiceAborts = (host.__hhVoiceAborts ?? 0) + 1;
      if (mode === "stuck") return;
      this.onend?.();
    }
  }

  define("SpeechRecognition", FakeSpeech);
  define("webkitSpeechRecognition", FakeSpeech);
  host.__hhVoiceBoot = mode;
}

async function pointerDown(page: Page, button: ReturnType<Page["locator"]>): Promise<void> {
  // The card sits below a 720px viewport. A press outside the viewport hits <html>.
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
