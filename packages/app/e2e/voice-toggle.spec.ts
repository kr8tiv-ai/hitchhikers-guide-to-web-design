import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  TALK_NEEDS_CHROMIUM,
  VOICE_CAP_NOTICE,
  VOICE_RESTART_BASE_MS,
  VOICE_RESTART_CAP,
  VOICE_STOP_WAIT_MS,
} from "../src/client/desk.ts";

/**
 * Click to talk. The fake recognizer can deliver a final after stop(), and it
 * can end itself during a long session the way Chrome does. Nothing here posts
 * /api/answer unless a test clicks Answer or presses Enter.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const NOTHING = "Nothing was heard. Click the voice button and try again.";
const BLOCKED = "The microphone is blocked.";
type VoiceMode = "manual" | "auto" | "missing" | "denied";

let child: ChildProcess | null = null;
let projectDir = "";
let deskUrl = "";

test.beforeAll(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), "hh-e2e-toggle-"));
  const serverFile = path.resolve(here, "../src/server/server.ts");
  child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env: {
      ...process.env,
      HH_E2E_PROJECT: projectDir,
      HH_E2E_SERVER: pathToFileURL(serverFile).href,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  deskUrl = await readUrl(child);
});

test.afterAll(async () => {
  if (child !== null) await stopChild(child);
  if (projectDir !== "") await rm(projectDir, { recursive: true, force: true });
});

test("interim then a final after stop stays in the draft", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "hot tea", false);
  await stop(page);
  await page.waitForTimeout(30);
  await emit(page, "hot tea on the counter", true);
  await end(page);
  await expectIdle(page, "hot tea on the counter");
  expect(answers).toEqual([]);
});

test("interim only, with onend and no final, stays in the draft", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "just the interim", false);
  await stop(page);
  await end(page);
  await expectIdle(page, "just the interim");
  expect(answers).toEqual([]);
});

test("a final later than 400ms after stop is not discarded", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "hot tea", false);
  await stop(page);
  await page.waitForTimeout(900);
  await emit(page, "hot tea on the counter", true);
  await end(page);
  await expectIdle(page, "hot tea on the counter");
  await expect(page.locator("#hh-card-draft")).not.toHaveValue(/hot tea hot tea/);
  expect(answers).toEqual([]);
});

test("a short phrase whose only result arrives after stop stays in the draft", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await page.locator("#hh-card-draft").fill("Hello");
  await page.locator('[data-voice="hold"]').click();
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Stop listening");
  await page.locator('[data-voice="hold"]').click();
  await page.waitForTimeout(900);
  await emit(page, "short phrase", true);
  await end(page);
  await expectIdle(page, "Hello short phrase");
  await paintFromStream(page);
  await expect(page.locator("#hh-card-draft")).toHaveValue("Hello short phrase");
  expect(answers).toEqual([]);
});

test("onend before the final still keeps the words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "hot tea", false);
  await stop(page);
  await end(page);
  await page.waitForTimeout(50);
  await emit(page, "hot tea on the counter", true);
  await expect(page.locator("#hh-card-draft")).toHaveValue("hot tea on the counter");
  await expect(page.locator("#hh-card-draft")).not.toHaveValue(/hot tea hot tea/);
  expect(answers).toEqual([]);
});

test("a stuck recognizer times out and keeps the interim", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "still here", false);
  await stop(page);
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk", {
    timeout: VOICE_STOP_WAIT_MS + 1_500,
  });
  await expect(page.locator("#hh-card-draft")).toHaveValue("still here");
  expect(await counts(page)).toMatchObject({ aborts: 0 });
  expect(answers).toEqual([]);
});

test("zero results restores the prior text and says nothing was heard", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await page.locator("#hh-card-draft").fill("Hello");
  await page.locator('[data-voice="hold"]').click();
  await page.locator('[data-voice="hold"]').click();
  await end(page);
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
  await expect(page.locator("#hh-card-draft")).toHaveValue("Hello");
  await expect(page.locator("#hh-card-error")).toHaveText(NOTHING);
  expect(answers).toEqual([]);
});

test("text typed before and during listening stays with the spoken words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const draft = page.locator("#hh-card-draft");
  await draft.fill("Hello");
  await page.locator('[data-voice="hold"]').click();
  await draft.fill("Hello friend");
  await emit(page, "tea", true);
  await stop(page);
  await end(page);
  await expectIdle(page, "Hello friend tea");
  expect(answers).toEqual([]);
});

test.describe("touch toggle", () => {
  test.use({ hasTouch: true });

test("click, tap, space, and enter toggle, and pointercancel does not", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "auto");
  const button = page.locator('[data-voice="hold"]');
  await button.dispatchEvent("pointerdown");
  await button.dispatchEvent("pointercancel");
  expect(await counts(page)).toMatchObject({ starts: 0 });

  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await counts(page)).toMatchObject({ starts: 1, continuous: true, interim: true });
  await button.click();
  await expect(button).toHaveText("Click to talk");
  await expect(page.locator("#hh-card-draft")).toHaveValue("spoken once");

  await button.tap();
  await expect(button).toHaveText("Stop listening");
  await button.tap();
  await expect(button).toHaveText("Click to talk");

  await button.focus();
  await page.keyboard.press(" ");
  await expect(button).toHaveText("Stop listening");
  await page.keyboard.press(" ");
  await expect(button).toHaveText("Click to talk");

  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveText("Stop listening");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await expect(button).toHaveText("Click to talk");
  expect(await counts(page)).toMatchObject({ starts: 4 });
  expect(answers).toEqual([]);
});
});

test("a key repeat and keyup do not toggle twice", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  await button.focus();
  await page.evaluate(() => {
    const target = document.querySelector('[data-voice="hold"]');
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, repeat: true }));
    target?.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
  });
  await expect(button).toHaveText("Stop listening");
  expect(await counts(page)).toMatchObject({ starts: 1, stops: 0 });
});

test("a long session restarts after onend and keeps every segment", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual", true);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await page.clock.fastForward(180_000);
  await expect(button).toHaveText("Stop listening");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await counts(page)).toMatchObject({ starts: 1 });
  const segments = ["alpha", "beta", "gamma", "delta"];
  for (const segment of segments) {
    await emit(page, segment, true);
    await end(page);
    await page.clock.fastForward(VOICE_RESTART_BASE_MS);
    await expect.poll(() => counts(page).then((item) => item.starts)).toBeGreaterThanOrEqual(segments.indexOf(segment) + 2);
    await expect(button).toHaveText("Stop listening");
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await button.click();
  await end(page);
  await expect(page.locator("#hh-card-draft")).toHaveValue("alpha beta gamma delta");
  await expect(button).toHaveText("Click to talk");
  expect(answers).toEqual([]);
});

test("empty restarts back off, then a result resets the delay", async ({ page }) => {
  await openDesk(page, "manual", true);
  await page.locator('[data-voice="hold"]').click();
  await end(page);
  await page.clock.fastForward(VOICE_RESTART_BASE_MS - 1);
  expect(await counts(page)).toMatchObject({ starts: 1 });
  await page.clock.fastForward(1);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(2);
  await end(page);
  await page.clock.fastForward(VOICE_RESTART_BASE_MS * 2 - 1);
  expect(await counts(page)).toMatchObject({ starts: 2 });
  await page.clock.fastForward(1);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(3);
  await emit(page, "reset", true);
  await end(page);
  await page.clock.fastForward(VOICE_RESTART_BASE_MS - 1);
  expect(await counts(page)).toMatchObject({ starts: 3 });
  await page.clock.fastForward(1);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(4);
});

test("the restart cap stops cleanly and keeps the words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual", true);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await emit(page, "kept words", true);
  await end(page);
  await page.clock.fastForward(VOICE_RESTART_BASE_MS);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(2);
  for (let empty = 1; empty < VOICE_RESTART_CAP; empty += 1) {
    await end(page);
    await page.clock.fastForward(2_000);
    await expect.poll(() => counts(page).then((item) => item.starts)).toBe(empty + 2);
    await expect(button).toHaveText("Stop listening");
  }
  await end(page);
  await expect(button).toHaveText("Click to talk");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#hh-card-draft")).toHaveValue("kept words");
  await expect(page.locator("[data-card-notice]")).toHaveText(VOICE_CAP_NOTICE);
  expect(await counts(page)).toMatchObject({ starts: VOICE_RESTART_CAP + 1, aborts: 0 });
  expect(answers).toEqual([]);
});

test("a click to stop waits for a late final and does not repeat the interim", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "hot tea", false);
  await stop(page);
  await page.waitForTimeout(900);
  await emit(page, "hot tea on the counter", true);
  await expectIdle(page, "hot tea on the counter");
  expect(answers).toEqual([]);
});

test("typing during listening and across a restart is kept", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const draft = page.locator("#hh-card-draft");
  await page.locator('[data-voice="hold"]').click();
  await draft.fill("Hello");
  await emit(page, "tea", true);
  await end(page);
  await page.waitForTimeout(VOICE_RESTART_BASE_MS + 80);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(2);
  await draft.fill("Hello friend tea");
  await emit(page, "shop", true);
  await stop(page);
  await end(page);
  const value = await draft.inputValue();
  expect(value.includes("Hello friend")).toBe(true);
  expect(value.includes("tea")).toBe(true);
  expect(value.includes("shop")).toBe(true);
  expect(answers).toEqual([]);
});

test("listening state, the pulse, and the live region", async ({ page }) => {
  await openDesk(page, "auto");
  const button = page.locator('[data-voice="hold"]');
  const live = page.locator("[data-voice-live]");
  await expect(button).toHaveText("Click to talk");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const pulse = button.locator("[data-voice-pulse]");
  await expect(pulse).toBeVisible();
  const reduced = await pulse.evaluate((el) => {
    const style = getComputedStyle(el);
    return { name: style.animationName, background: style.backgroundColor };
  });
  expect(reduced.name === "none" || reduced.name === "").toBe(true);
  expect(reduced.background).not.toBe("rgba(0, 0, 0, 0)");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(/Listening started/);
  const inside = await page.evaluate(() => {
    return document.querySelector('[data-region="question"] [data-voice-live]') !== null;
  });
  expect(inside).toBe(false);
  await button.click();
  await expect(live).toHaveText(/Listening stopped/);
  await expect(button).toHaveText("Click to talk");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await button.click();
  await expect(button.locator("[data-voice-pulse]")).toBeVisible();
  await expect
    .poll(() =>
      button.locator("[data-voice-pulse]").evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("hh-voice-pulse");
  await button.click();
});

test("escape stops from the button and the draft, and idle escape leaves the draft", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await speak(page, "from escape", true);
  await page.keyboard.press("Escape");
  await end(page);
  await expectIdle(page, "from escape");

  await button.click();
  await emit(page, "from the field", true);
  await draft.focus();
  await page.keyboard.press("Escape");
  await end(page);
  await expect(draft).toHaveValue(/from the field/);
  await expect(button).toHaveText("Click to talk");

  await draft.fill("Stay put");
  await draft.focus();
  await page.keyboard.press("Escape");
  await expect(draft).toHaveValue("Stay put");
  expect(answers).toEqual([]);
});

test("answer, enter, skip, and suggest settle before they run", async ({ page }) => {
  await openDesk(page, "manual");
  await page.route("**/api/skip", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "The desk could not reach hh app. Your draft is still here. Try again." }),
    }),
  );
  await page.route("**/api/suggest", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "The desk could not reach hh app. Your draft is still here. Try again." }),
    }),
  );

  await speak(page, "for myself please", true);
  await page.locator('[data-action="answer"]').click();
  await end(page);
  await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
  const answered = await fetchMark(page);
  expect(answered.stops).toBeGreaterThanOrEqual(1);
  expect(answered.draft).toContain("for myself please");
  expect(answered.url).toContain("/api/answer");

  await page.locator('[data-voice="hold"]').click();
  await emit(page, "second line", true);
  await page.locator("#hh-card-draft").focus();
  await page.keyboard.press("Enter");
  await end(page);
  // DP-0.2 is followed by DP-0.2a in the interview tree, then DP-0.3.
  await expect(page.locator("[data-question-id='DP-0.2a']")).toBeVisible();
  const entered = await fetchMark(page);
  expect(entered.stops).toBeGreaterThanOrEqual(1);
  expect(entered.draft).toContain("second line");
  expect(entered.url).toContain("/api/answer");

  await page.locator('[data-voice="hold"]').click();
  await emit(page, "skip these words", true);
  await page.locator('[data-action="skip"]').click();
  await end(page);
  await expect(page.locator("#hh-card-draft")).toHaveValue(/skip these words/);
  expect((await fetchMark(page)).stops).toBeGreaterThanOrEqual(1);
  expect((await fetchMark(page)).url).toContain("/api/skip");

  await page.locator('[data-voice="hold"]').click();
  await emit(page, "suggest these words", true);
  await page.locator('[data-action="suggest"]').click();
  await end(page);
  const suggested = await fetchMark(page);
  expect(suggested.stops).toBeGreaterThanOrEqual(1);
  expect(suggested.draft).toContain("suggest these words");
  expect(suggested.url).toContain("/api/suggest");
  await expect(page.locator("#hh-card-draft")).toHaveValue(/suggest these words/);
});

test("shift+enter is a newline and does not answer", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const draft = page.locator("#hh-card-draft");
  await draft.fill("Hello");
  await draft.focus();
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("next");
  await expect(draft).toHaveValue("Hello\nnext");
  expect(answers).toEqual([]);
});

test("a question change and pagehide and a hidden tab settle first", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await speak(page, "keep every word", true);
  await page.evaluate(() => {
    const host = window as Window & { __hhPush?: (data: string) => void };
    host.__hhPush?.(
      JSON.stringify({
        question: {
          id: "DP-9.9",
          module: "towel",
          depth: ["deep"],
          ask: "What is next?",
          why: "The stream moved on.",
          input: ["text"],
          skipDefault: "Tea.",
          writes: [],
        },
        pushback: null,
        done: false,
        mapHtml: "",
        transcriptHtml: "",
        statusHtml: "",
      }),
    );
  });
  await end(page);
  await expect(page.locator("[data-question-id='DP-9.9']")).toBeVisible();
  await expect(page.locator("#hh-card-draft")).toHaveValue(/keep every word/);
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");

  await page.locator('[data-voice="hold"]').click();
  await emit(page, "still on the page", true);
  await page.evaluate(() => {
    window.addEventListener("pagehide", () => {
      const field = document.querySelector("#hh-card-draft");
      sessionStorage.setItem("hh-voice-draft", field instanceof HTMLTextAreaElement ? field.value : "");
    });
    window.dispatchEvent(new Event("pagehide"));
  });
  const hidden = await page.evaluate(() => sessionStorage.getItem("hh-voice-draft"));
  expect(hidden).toContain("still on the page");
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");

  await page.locator('[data-voice="hold"]').click();
  await emit(page, "hidden tab", true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#hh-card-draft")).toHaveValue(/hidden tab/);
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
  expect(answers).toEqual([]);
});

test("a stale onend does not restart, and two clicks run one recognizer", async ({ page }) => {
  await openDesk(page, "manual", true);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await page.evaluate(() => {
    const host = window as Window & {
      __hhCurrent?: { onend: (() => void) | null };
      __hhStale?: (() => void) | null;
    };
    host.__hhStale = host.__hhCurrent?.onend ?? null;
  });
  await end(page);
  await page.clock.fastForward(VOICE_RESTART_BASE_MS);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(2);
  await page.evaluate(() => {
    const host = window as Window & { __hhStale?: (() => void) | null };
    host.__hhStale?.();
  });
  await page.clock.fastForward(VOICE_RESTART_BASE_MS);
  expect(await counts(page)).toMatchObject({ starts: 2 });
  await expect(button).toHaveText("Stop listening");

  await openDesk(page, "auto");
  await page.locator('[data-voice="hold"]').click();
  await page.locator('[data-voice="hold"]').click();
  expect(await counts(page)).toMatchObject({ starts: 1 });
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
});

test("a denied microphone resets the toggle and keeps typed text", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "denied");
  await page.locator("#hh-card-draft").fill("Typed first");
  await page.locator('[data-voice="hold"]').click();
  await expect(page.locator("#hh-card-error")).toContainText(BLOCKED);
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
  await expect(page.locator('[data-voice="hold"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#hh-card-draft")).toHaveValue("Typed first");
  expect(answers).toEqual([]);
});

test("safari and a missing speech API keep the disabled chrome or edge line", async ({ page }) => {
  await openDesk(page, "missing");
  const button = page.locator('[data-voice="hold"]');
  await expect(button).toBeDisabled();
  await expect(button).toHaveText(TALK_NEEDS_CHROMIUM);
  await page.locator("#hh-card-draft").fill("Still typed");
  await expect(page.locator("#hh-card-draft")).toHaveValue("Still typed");
});

async function openDesk(page: Page, mode: VoiceMode, clock = false): Promise<void> {
  await page.addInitScript(installVoice, mode);
  if (clock) await page.clock.install();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(deskUrl);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  // Pause after load so fastForward is the only thing that moves time.
  if (clock) {
    const pageNow = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(pageNow + 1_000);
  }
}

async function speak(page: Page, text: string, isFinal: boolean): Promise<void> {
  await page.locator('[data-voice="hold"]').click();
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Stop listening");
  await emit(page, text, isFinal);
  if (isFinal) await expect(page.locator("#hh-card-draft")).toHaveValue(new RegExp(text));
}

async function stop(page: Page): Promise<void> {
  await page.locator('[data-voice="hold"]').click();
}

async function emit(page: Page, text: string, isFinal: boolean): Promise<void> {
  await page.evaluate(
    ({ heard, final }) => {
      const host = window as Window & { __hhEmit?: (value: string, done: boolean) => void };
      host.__hhEmit?.(heard, final);
    },
    { heard: text, final: isFinal },
  );
}

async function end(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as Window & { __hhEnd?: () => void };
    host.__hhEnd?.();
  });
}

async function counts(page: Page): Promise<{ starts: number; stops: number; aborts: number; continuous: boolean; interim: boolean }> {
  return page.evaluate(() => {
    const host = window as Window & {
      __hhStarts?: number;
      __hhStops?: number;
      __hhAborts?: number;
      __hhContinuous?: boolean;
      __hhInterim?: boolean;
    };
    return {
      starts: host.__hhStarts ?? 0,
      stops: host.__hhStops ?? 0,
      aborts: host.__hhAborts ?? 0,
      continuous: host.__hhContinuous === true,
      interim: host.__hhInterim === true,
    };
  });
}

async function fetchMark(page: Page): Promise<{ url: string; draft: string; stops: number }> {
  return page.evaluate(() => {
    const host = window as Window & { __hhFetchUrl?: string; __hhDraftAtFetch?: string; __hhStopsAtFetch?: number };
    return {
      url: host.__hhFetchUrl ?? "",
      draft: host.__hhDraftAtFetch ?? "",
      stops: host.__hhStopsAtFetch ?? 0,
    };
  });
}

async function expectIdle(page: Page, value: string): Promise<void> {
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
  await expect(page.locator("#hh-card-draft")).toHaveValue(value);
  await expect(page.locator("[data-card-notice]")).toHaveText(/Heard you\. Check the words, then press Answer\./);
}

async function paintFromStream(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as Window & { __hhEvents?: EventSource };
    host.__hhEvents?.dispatchEvent(new Event("error"));
    host.__hhEvents?.dispatchEvent(new Event("error"));
    host.__hhEvents?.dispatchEvent(new Event("error"));
  });
  await expect(page.locator('[data-region="status"]')).toContainText("lost its connection");
}

function trackAnswers(page: Page): string[] {
  const answers: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/answer") answers.push(request.url());
  });
  return answers;
}

function installVoice(mode: VoiceMode): void {
  const host = window as Window & {
    __hhStarts?: number;
    __hhStops?: number;
    __hhAborts?: number;
    __hhContinuous?: boolean;
    __hhInterim?: boolean;
    __hhCurrent?: {
      onresult: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    };
    __hhEmit?: (text: string, isFinal: boolean) => void;
    __hhEnd?: () => void;
    __hhEvents?: EventSource;
    __hhPush?: (data: string) => void;
    __hhFetchUrl?: string;
    __hhDraftAtFetch?: string;
    __hhStopsAtFetch?: number;
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const RealEventSource = window.EventSource;
  class WatchingSource extends RealEventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init);
      host.__hhEvents = this;
    }
  }
  window.EventSource = WatchingSource;
  host.__hhPush = (data: string): void => {
    host.__hhEvents?.dispatchEvent(new MessageEvent("session", { data }));
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/answer") || url.includes("/api/skip") || url.includes("/api/suggest")) {
      const field = document.querySelector("#hh-card-draft");
      host.__hhFetchUrl = url;
      host.__hhDraftAtFetch = field instanceof HTMLTextAreaElement ? field.value : "";
      host.__hhStopsAtFetch = host.__hhStops ?? 0;
    }
    return originalFetch(input, init);
  };

  const define = (name: "SpeechRecognition" | "webkitSpeechRecognition", value: unknown): void => {
    Object.defineProperty(window, name, { configurable: true, writable: true, value });
  };
  if (mode === "missing") {
    define("SpeechRecognition", undefined);
    define("webkitSpeechRecognition", undefined);
    return;
  }

  class FakeSpeech {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    start(): void {
      host.__hhStarts = (host.__hhStarts ?? 0) + 1;
      host.__hhCurrent = this;
      host.__hhContinuous = this.continuous;
      host.__hhInterim = this.interimResults;
      this.onstart?.();
      if (mode === "denied") {
        this.onerror?.({ error: "not-allowed" });
        this.onend?.();
        return;
      }
      if (mode === "auto") {
        this.onresult?.({
          resultIndex: 0,
          results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: "spoken once" } } },
        });
      }
    }

    stop(): void {
      host.__hhStops = (host.__hhStops ?? 0) + 1;
      if (mode === "auto" || mode === "denied") this.onend?.();
    }

    abort(): void {
      host.__hhAborts = (host.__hhAborts ?? 0) + 1;
      if (mode === "auto" || mode === "denied") this.onend?.();
    }
  }

  host.__hhEmit = (text: string, isFinal: boolean): void => {
    host.__hhCurrent?.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } },
    });
  };
  host.__hhEnd = (): void => {
    host.__hhCurrent?.onend?.();
  };
  define("SpeechRecognition", FakeSpeech);
  define("webkitSpeechRecognition", FakeSpeech);
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
