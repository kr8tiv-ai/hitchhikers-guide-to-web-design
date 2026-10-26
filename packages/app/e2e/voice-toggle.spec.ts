import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  TALK_NEEDS_CHROMIUM,
  VOICE_CAP_NOTICE,
  VOICE_NO_TRANSCRIPT,
  VOICE_RESTART_BASE_MS,
  VOICE_RESTART_CAP,
  VOICE_STOP_WAIT_MS,
} from "../src/client/desk.ts";
import { removeTempDir } from "../test/remove-temp.ts";

/**
 * Click to talk. The fake recognizer can deliver a final after stop(), and it
 * can end itself during a long session the way Chrome does. Nothing here posts
 * /api/answer unless a test clicks Answer or presses Enter.
 *
 * Stop orders model Chrome: the final can win the race and leave onend unhooked,
 * onend can win, the final can be the only event, or onend can be the only event.
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
  if (projectDir !== "") await removeTempDir(projectDir);
});

// These tests share one project and each opens a new page. The desk restores a saved draft.
// An answer returns a job id and publishes the next session when that job ends.
// The next page must not open while that publish is still pending.
test.beforeEach(async ({ request }) => {
  if (projectDir !== "") await removeTempDir(path.join(projectDir, ".hitchhiker", "drafts.json"));
  if (deskUrl === "") return;
  await expect
    .poll(async () => {
      const response = await request.get(new URL("/api/session", deskUrl).href);
      const body = (await response.json()) as { guideJob?: { status?: string } | null };
      return body.guideJob?.status === "running" ? "running" : "idle";
    })
    .toBe("idle");
});

const HEARD = "Heard you. Check the words, then press Answer.";
const PUSH_LINE = "Name one concrete detail.";
const KEPT_SENTENCE = "Yourself, or one named client.";

test("197 pushback: words stay and Answer is enabled after stop", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await showPushback(page);
  await dictateOnto(page, "", "for", "for me");
  await expectHeard(page, "for me");
  expect(answers).toEqual([]);
});

test("197 pushback: typed text plus a final stays and Answer is enabled", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await showPushback(page);
  await page.locator("#hh-card-draft").fill("Typed.");
  await dictateOnto(page, "Typed.", "for", "for me");
  await expectHeard(page, "Typed. for me");
  expect(answers).toEqual([]);
});

test("197 pushback: a silent stop keeps typed text and says nothing was heard", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await showPushback(page);
  const draft = page.locator("#hh-card-draft");
  await draft.fill("Typed.");
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await draft.inputValue()).toBe("Typed.");
  await button.click();
  await end(page);
  await expect(button).toHaveText("Click to talk");
  expect(await draft.inputValue()).toBe("Typed.");
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await expect(page.locator("#hh-card-error")).toHaveText(NOTHING);
  await expect(page.locator("[data-card-notice]")).toHaveCount(0);
  expect(answers).toEqual([]);
});

test("197 plain: typed suggest text is never cleared and words append once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await page.locator("#hh-card-draft").fill(KEPT_SENTENCE);
  await dictateOnto(page, KEPT_SENTENCE, "today", "today please");
  await expectHeard(page, `${KEPT_SENTENCE} today please`);
  expect(await page.locator("#hh-card-draft").inputValue()).toBe(`${KEPT_SENTENCE} today please`);
  expect(answers).toEqual([]);
});

test("197 plain: an empty box keeps the placeholder out and leaves Answer off", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const draft = page.locator("#hh-card-draft");
  const placeholder = await draft.getAttribute("placeholder");
  expect(placeholder).toBe(KEPT_SENTENCE);
  expect(await draft.inputValue()).toBe("");
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await draft.inputValue()).toBe("");
  await button.click();
  await end(page);
  await expect(button).toHaveText("Click to talk");
  expect(await draft.inputValue()).toBe("");
  expect(await draft.inputValue()).not.toBe(placeholder);
  await expect(page.locator('[data-action="answer"]')).toBeDisabled();
  await expect(page.locator("#hh-card-error")).toHaveText(NOTHING);
  await expect(page.locator("[data-card-notice]")).toHaveCount(0);
  expect(await draft.getAttribute("placeholder")).toBe(placeholder);
  expect(answers).toEqual([]);
});

test("197 late: a final at 400ms stays on a plain card and a pushback card", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await runLate(page, 400);
  await showPushback(page);
  await runLate(page, 400);
  expect(answers).toEqual([]);
});

test("197 late: a final at 900ms stays on a plain card and a pushback card", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await runLate(page, 900);
  await showPushback(page);
  await runLate(page, 900);
  expect(answers).toEqual([]);
});

test("197 late: after the stop wait the box still holds the text and the late words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await runLateSurvives(page);
  await showPushback(page);
  await runLateSurvives(page);
  expect(answers).toEqual([]);
});

test("197 repaint: a banner and a view update keep the box and Answer", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await showPushback(page);
  await page.locator("#hh-card-draft").fill("Typed.");
  await dictateOnto(page, "Typed.", "for", "for me");
  await expectHeard(page, "Typed. for me");
  await paintFromStream(page);
  await expectHeard(page, "Typed. for me");
  await repaintSameView(page);
  await expectHeard(page, "Typed. for me");
  expect(answers).toEqual([]);
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

test("multi-cycle: three dictations append one, then one two, then one two three", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-then-end", ["one", "two", "three"]);
  expect(answers).toEqual([]);
});

test("multi-cycle: three dictations append when the final arrives and then onend", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-then-end", ["one", "two", "three"]);
  expect(answers).toEqual([]);
});

test("multi-cycle: three dictations append when onend arrives and then the final", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "end-then-final", ["one", "two", "three"]);
  expect(answers).toEqual([]);
});

test("multi-cycle: three dictations append when the final arrives and onend never fires", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-only", ["one", "two", "three"]);
  expect(answers).toEqual([]);
});

test("multi-cycle: three dictations append when only onend fires", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "end-only", ["one", "two", "three"]);
  expect(answers).toEqual([]);
});

test("multi-cycle: text typed between dictations stays, then the next words append once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-then-end", ["one"]);
  await page.locator("#hh-card-draft").fill("one typed in the middle");
  await dictateCycles(page, "final-then-end", ["two"], "one typed in the middle");
  await expect(page.locator("#hh-card-draft")).toHaveValue("one typed in the middle two");
  expect(answers).toEqual([]);
});

test("multi-cycle: text typed during the second dictation stays with the spoken words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-then-end", ["one"]);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  await page.locator("#hh-card-draft").fill("one friend");
  await setStopOrder(page, "final-then-end", "two");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(page.locator("#hh-card-draft")).toHaveValue("one friend two");
  expect(answers).toEqual([]);
});

test("multi-cycle: a late final from the first recognizer does not erase or duplicate the second", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  await emit(page, "alpha", false);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("alpha");
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  await emit(page, "beta", true);
  await expect(draft).toHaveValue("alpha beta");
  await emitAt(page, 0, "alpha expanded", true);
  await expect(draft).toHaveValue("alpha expanded beta");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("alpha expanded beta");
  expect(answers).toEqual([]);
});

test("multi-cycle: a stale onend and onerror from the first recognizer are ignored", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  await setStopOrder(page, "final-then-end", "one");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(page.locator("#hh-card-draft")).toHaveValue("one");
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  const starts = (await counts(page)).starts;
  await page.evaluate(() => {
    const host = window as Window & {
      __hhHandlers?: { onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null }[];
    };
    const saved = host.__hhHandlers?.[0];
    saved?.onend?.();
    saved?.onerror?.({ error: "network" });
  });
  await page.waitForTimeout(VOICE_RESTART_BASE_MS + 80);
  expect(await counts(page)).toMatchObject({ starts });
  await expect(button).toHaveText("Stop listening");
  await expect(page.locator("#hh-card-error")).not.toContainText("could not reach");
  await emit(page, "two", true);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(page.locator("#hh-card-draft")).toHaveValue("one two");
  expect(answers).toEqual([]);
});

test("multi-cycle: a dictation that hears nothing keeps the earlier text and says so", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-then-end", ["one"]);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(page.locator("#hh-card-draft")).toHaveValue("one");
  await expect(page.locator("#hh-card-error")).toHaveText(NOTHING);
  expect(answers).toEqual([]);
});

test("multi-cycle: the next click after a final-only stop starts one recognizer immediately", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-only", ["one"]);
  const before = await counts(page);
  const button = page.locator('[data-voice="hold"]');
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  const started = await counts(page);
  expect(started.starts).toBe(before.starts + 1);
  expect(await maxLive(page)).toBe(1);
  await button.click();
  expect((await counts(page)).starts).toBe(before.starts + 1);
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  expect(answers).toEqual([]);
});

test("multi-cycle: ten dictations then Answer submits every word in order once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const words = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"];
  await dictateCycles(page, "final-then-end", words);
  const settled = watchAnswer(page);
  await page.locator('[data-action="answer"]').click();
  await expect.poll(async () => (await fetchMark(page)).draft).toBe(words.join(" "));
  expect((await fetchMark(page)).url).toContain("/api/answer");
  expect(answers).toHaveLength(1);
  await settled;
});

test("multi-cycle: a paint between dictations still appends the later words", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await dictateCycles(page, "final-only", ["one"]);
  await paintFromStream(page);
  await expect(page.locator("#hh-card-draft")).toHaveValue("one");
  await dictateCycles(page, "final-only", ["two", "three"], "one");
  expect(answers).toEqual([]);
});

test("197 suggest: a kept suggestion stays through dictation", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await page.locator('[data-action="suggest"]').click();
  await expect(page.locator("[data-assumed='suggested']")).toBeVisible();
  const suggestion = (await page.locator("#hh-card-draft").inputValue()).trim();
  expect(suggestion.length).toBeGreaterThan(0);
  await dictateOnto(page, suggestion, "today", "today please");
  await expectHeard(page, `${suggestion} today please`);
  expect(answers).toEqual([]);
});

test("197 choice: Other, then edited text, stays through dictation", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  await page.locator('[data-action="suggest"]').click();
  const card = page.locator("[data-question-id]");
  await expect(card.getByRole("radio", { name: "Other: I'll write my own" })).toBeVisible();
  await card.getByRole("radio", { name: "Other: I'll write my own" }).click();
  const edited = `${KEPT_SENTENCE} today`;
  await page.locator("#hh-card-draft").fill(edited);
  await dictateOnto(page, edited, "spoken", "spoken once");
  await expectHeard(page, `${edited} spoken once`);
  expect(answers).toEqual([]);
});

test("197 answer: a stop does not submit, and Answer sends the box once", async ({ page }) => {
  const bodies: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/answer") bodies.push(request.postData() ?? "");
  });
  await openDesk(page, "manual");
  await showPushback(page);
  await page.locator("#hh-card-draft").fill("Typed.");
  await dictateOnto(page, "Typed.", "for", "for me");
  await expectHeard(page, "Typed. for me");
  expect(bodies).toEqual([]);
  const settled = watchAnswer(page);
  await page.locator('[data-action="answer"]').click();
  await expect.poll(() => bodies.length).toBe(1);
  const payload = JSON.parse(bodies[0] ?? "{}") as { text?: string };
  expect(payload.text).toBe("Typed. for me");
  expect(bodies).toHaveLength(1);
  await settled;
});

test("ten cycles keep one live recognizer and one late result handler", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  let expected = "";
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const word = `w${cycle}`;
    await button.click();
    await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
    const started = await voiceStats(page);
    expect(started.live).toBe(1);
    expect(started.maxLive).toBe(1);
    const withResult = started.recognizers.filter((item) => item.onresult);
    expect(withResult.filter((item) => item.live)).toHaveLength(1);
    expect(withResult.filter((item) => !item.live).length).toBeLessThanOrEqual(1);
    await emit(page, word, false);
    await emit(page, word, true);
    await setStopOrder(page, "final-then-end", word);
    await button.click();
    expected = expected === "" ? word : `${expected} ${word}`;
    await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
    await expect(draft).toHaveValue(expected);
    expect((await voiceStats(page)).live).toBe(0);
  }
  await page.waitForTimeout(VOICE_STOP_WAIT_MS + 100);
  const done = await voiceStats(page);
  expect(done.live).toBe(0);
  expect(done.maxLive).toBe(1);
  expect(done.onresult).toBe(0);
  expect(done.onerror).toBe(0);
  expect(done.onend).toBe(0);
  expect(done.onstart).toBe(0);
  expect(done.onspeechstart).toBe(0);
  expect(done.constructed).toBe(10);
});

test("a stop without onend retires the first recognizer before the next start", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emit(page, "alpha beta gamma", true);
  await setStopOrder(page, "final-only", "alpha beta gamma");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("alpha beta gamma");
  await button.click();
  await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
  const stats = await voiceStats(page);
  expect(stats.live).toBe(1);
  const first = stats.recognizers[0];
  expect(first).toBeDefined();
  const cleared = first !== undefined && !first.onstart && !first.onspeechstart && !first.onresult && !first.onerror && !first.onend;
  expect(first?.aborted === true || cleared).toBe(true);
  await emitList(page, 0, [{ text: "should not land", final: true }], 0);
  await expect(draft).toHaveValue("alpha beta gamma");
});

test("a cumulative resend with resultIndex 0 is the sentence once", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [{ text: "one two", final: true }], 0);
  await expect(draft).toHaveValue("one two");
  await emitList(page, -1, [
    { text: "one two", final: true },
    { text: "three four", final: true },
  ], 1);
  await expect(draft).toHaveValue("one two three four");
  await emitList(page, -1, [
    { text: "one two", final: true },
    { text: "three four", final: true },
    { text: "five six", final: true },
  ], 0);
  await expect(draft).toHaveValue("one two three four five six");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("one two three four five six");
});

test("a growing sentence at resultIndex 0 appears once", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [{ text: "turn on", final: false }], 0);
  await expect(draft).toHaveValue("turn on");
  await emitList(page, -1, [
    { text: "turn on", final: false },
    { text: "turn on the", final: false },
  ], 0);
  await expect(draft).toHaveValue("turn on the");
  await emitList(page, -1, [
    { text: "turn on", final: false },
    { text: "turn on the", final: false },
    { text: "turn on the light", final: true },
  ], 0);
  await expect(draft).toHaveValue("turn on the light");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("turn on the light");
});

test("one event with a final and an interim shows both once", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [
    { text: "one two", final: true },
    { text: "three", final: false },
  ], 0);
  await expect(draft).toHaveValue("one two three");
  await emitList(page, -1, [
    { text: "one two", final: true },
    { text: "three", final: true },
  ], 0);
  await expect(draft).toHaveValue("one two three");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(draft).toHaveValue("one two three");
});

test("a late cumulative resend does not append a repeat", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [{ text: "turn on the", final: false }], 0);
  await expect(draft).toHaveValue("turn on the");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("turn on the");
  await emitList(page, 0, [
    { text: "turn on", final: true },
    { text: "turn on the", final: true },
    { text: "turn on the light", final: true },
  ], 0);
  await expect(draft).toHaveValue("turn on the light");
});

test("a restart replays old results once and keeps one live recognizer", async ({ page }) => {
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [
    { text: "alpha", final: true },
    { text: "beta", final: true },
    { text: "gamma", final: true },
  ], 0);
  await expect(draft).toHaveValue("alpha beta gamma");
  const before = await counts(page);
  await end(page);
  await page.waitForTimeout(VOICE_RESTART_BASE_MS + 80);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(before.starts + 1);
  const started = await voiceStats(page);
  expect(started.live).toBe(1);
  expect(started.maxLive).toBe(1);
  await emitList(page, -1, [
    { text: "alpha", final: true },
    { text: "beta", final: true },
    { text: "gamma", final: true },
  ], 0);
  await expect(draft).toHaveValue("alpha beta gamma");
});

/** The utterance from the Chrome screenshot, without the revised last word. */
const UTTERANCE =
  "this web page is for myself to operate I'm creating a page where people can buy";

test("a revised interim keeps a fixed base and never repeats the sentence", async ({ page }) => {
  const answers = trackAnswers(page);
  await installInputCounter(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await replaceDraft(draft, "Intro.");
  const bindsAtStart = await inputBinds(page);
  await button.click();
  await expect(button).toHaveText("Stop listening");
  const seen: string[] = [];
  for (const word of ["fire", "Farm", "firewood"]) {
    await emitList(page, -1, [{ text: `${UTTERANCE} ${word}`, final: false }], 0);
    seen.push(await draft.inputValue());
  }
  await emitList(page, -1, [{ text: `${UTTERANCE} firewood`, final: true }], 0);
  seen.push(await draft.inputValue());
  expect(seen).toEqual([
    `Intro. ${UTTERANCE} fire`,
    `Intro. ${UTTERANCE} Farm`,
    `Intro. ${UTTERANCE} firewood`,
    `Intro. ${UTTERANCE} firewood`,
  ]);
  for (const value of seen) expect(value.split(UTTERANCE).length - 1).toBe(1);
  const sameFinal = [
    { text: "one two", final: true },
    { text: "three four", final: true },
  ];
  await emitList(page, -1, sameFinal, 0);
  await emitList(page, -1, sameFinal, 0);
  await emitList(page, -1, sameFinal, 0);
  await expect(draft).toHaveValue("Intro. one two three four");
  expect((await draft.inputValue()).split("one two three four").length - 1).toBe(1);

  await emitList(page, -1, [{ text: `${UTTERANCE} fire`, final: false }], 0);
  await expect(draft).toHaveValue(`Intro. ${UTTERANCE} fire`);
  await expect.poll(async () => storedDraftText(page), { timeout: 2_000 }).toBe(`Intro. ${UTTERANCE} fire`);
  await paintFromStream(page);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pageshow"));
  });
  await expect(draft).toHaveValue(`Intro. ${UTTERANCE} fire`);
  await page.evaluate(() => {
    const field = document.querySelector("#hh-card-draft");
    if (field instanceof HTMLTextAreaElement) field.value = "Intro. STALE COPY";
  });
  await emitList(page, -1, [{ text: `${UTTERANCE} Farm`, final: false }], 0);
  await expect(draft).toHaveValue(`Intro. ${UTTERANCE} Farm`);
  expect((await draft.inputValue()).split(UTTERANCE).length - 1).toBe(1);
  await draft.evaluate((el) => {
    const field = el as HTMLTextAreaElement;
    field.value = `${field.value} please`;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await emitList(page, -1, [{ text: `${UTTERANCE} firewood`, final: false }], 0);
  const heardOnce = `Intro. please ${UTTERANCE} firewood`;
  await expect(draft).toHaveValue(heardOnce);
  expect((await draft.inputValue()).split("please").length - 1).toBe(1);
  expect((await draft.inputValue()).split(UTTERANCE).length - 1).toBe(1);
  await expect.poll(async () => storedDraftText(page), { timeout: 2_000 }).toBe(heardOnce);
  const bindsAfter = await inputBinds(page);
  expect(bindsAfter).toEqual(bindsAtStart);
  expect(bindsAfter.document).toBe(1);
  expect(bindsAfter.textarea).toBe(0);
  const stats = await voiceStats(page);
  expect(stats.live).toBe(1);
  expect(stats.onresult).toBe(1);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue(heardOnce);
  expect(answers).toEqual([]);
});

test("Chrome cumulative results from an empty box land once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await expect(draft).toHaveValue("");
  await emitList(page, -1, [{ text: "for my", final: false }], 0);
  await expectOnce(draft, "for my", ["for my"]);
  await emitList(page, -1, [{ text: "for my own", final: true }], 0);
  await expectOnce(draft, "for my own", ["for my own"]);
  await emitList(page, -1, [
    { text: "for my own", final: true },
    { text: "bakery", final: false },
  ], 1);
  await expectOnce(draft, "for my own bakery", ["for my own bakery", "bakery"]);
  await emitList(page, -1, [
    { text: "for my own", final: true },
    { text: "bakery", final: true },
  ], 1);
  await expectOnce(draft, "for my own bakery", ["for my own bakery", "for my own", "bakery"]);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expectOnce(draft, "for my own bakery", ["for my own bakery"]);
  expect(answers).toEqual([]);
});

test("Chrome cumulative results keep a fixed Intro base once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await replaceDraft(draft, "Intro.");
  await expect(draft).toHaveValue("Intro.");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await expect(draft).toHaveValue("Intro.");
  await emitList(page, -1, [{ text: "hello fire", final: false }], 0);
  await expectOnce(draft, "Intro. hello fire", ["hello fire", "Intro."]);
  await emitList(page, -1, [{ text: "hello firewood", final: false }], 0);
  await expectOnce(draft, "Intro. hello firewood", ["hello firewood", "Intro."]);
  await emitList(page, -1, [{ text: "hello firewood bakery", final: true }], 0);
  await expectOnce(draft, "Intro. hello firewood bakery", ["hello firewood bakery", "Intro."]);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expectOnce(draft, "Intro. hello firewood bakery", ["hello firewood bakery"]);
  expect(answers).toEqual([]);
});

test("a restart joins the next recognizer's final once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await expect(draft).toHaveValue("");
  await emitList(page, -1, [{ text: "we bake bread", final: true }], 0);
  await expectOnce(draft, "we bake bread", ["we bake bread"]);
  const before = await counts(page);
  await end(page);
  await expectOnce(draft, "we bake bread", ["we bake bread"]);
  await page.waitForTimeout(VOICE_RESTART_BASE_MS + 80);
  await expect.poll(() => counts(page).then((item) => item.starts)).toBe(before.starts + 1);
  await expect(button).toHaveText("Stop listening");
  await expectOnce(draft, "we bake bread", ["we bake bread"]);
  await emitList(page, -1, [{ text: "every morning", final: true }], 0);
  await expectOnce(draft, "we bake bread every morning", ["we bake bread", "every morning"]);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expectOnce(draft, "we bake bread every morning", ["we bake bread every morning"]);
  expect(answers).toEqual([]);
});

test("a late final inside the stop window replaces the interim once", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await emitList(page, -1, [{ text: "for my", final: false }], 0);
  await expectOnce(draft, "for my", ["for my"]);
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expectOnce(draft, "for my", ["for my"]);
  await emitList(page, 0, [{ text: "for my own site", final: true }], 0);
  await expectOnce(draft, "for my own site", ["for my own site"]);
  expect(answers).toEqual([]);
});

test("speechstart with no result names the silent speech service", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual");
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await replaceDraft(draft, "Notes.");
  await expect(draft).toHaveValue("Notes.");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await expect(draft).toHaveValue("Notes.");
  await speechStart(page);
  await expect(draft).toHaveValue("Notes.");
  await setStopOrder(page, "end-only", "");
  await button.click();
  await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
  await expect(draft).toHaveValue("Notes.");
  await expect(page.locator("#hh-card-error")).toHaveText(VOICE_NO_TRANSCRIPT);
  await expect(page.getByText(NOTHING)).toHaveCount(0);
  expect(answers).toEqual([]);
});

test("speechstart and empty restarts name the service instead of the cap", async ({ page }) => {
  const answers = trackAnswers(page);
  await openDesk(page, "manual", true);
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  await replaceDraft(draft, "Notes.");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  await speechStart(page);
  await expect(draft).toHaveValue("Notes.");
  for (let empty = 0; empty < VOICE_RESTART_CAP - 1; empty += 1) {
    await end(page);
    await page.clock.fastForward(2_000);
    await expect.poll(() => counts(page).then((item) => item.starts)).toBe(empty + 2);
    await expect(button).toHaveText("Stop listening");
    await expect(draft).toHaveValue("Notes.");
  }
  await end(page);
  await expect(button).toHaveText("Click to talk");
  await expect(draft).toHaveValue("Notes.");
  await expect(page.locator("#hh-card-error")).toHaveText(VOICE_NO_TRANSCRIPT);
  await expect(page.getByText(VOICE_CAP_NOTICE)).toHaveCount(0);
  expect(answers).toEqual([]);
});

async function expectOnce(
  draft: ReturnType<Page["locator"]>,
  value: string,
  phrases: string[],
): Promise<void> {
  await expect(draft).toHaveValue(value);
  const text = await draft.inputValue();
  for (const phrase of phrases) expect(text.split(phrase).length - 1).toBe(1);
}

async function speechStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as Window & { __hhSpeech?: () => void };
    host.__hhSpeech?.();
  });
}

async function installInputCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const host = window as Window & { __hhInputAdds?: { document: number; textarea: number } };
    host.__hhInputAdds = { document: 0, textarea: 0 };
    const docAdd = Document.prototype.addEventListener;
    Document.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
      if (type === "input") host.__hhInputAdds!.document += 1;
      docAdd.call(this, type, listener, options);
    };
    const areaAdd = HTMLTextAreaElement.prototype.addEventListener;
    HTMLTextAreaElement.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
      if (type === "input") host.__hhInputAdds!.textarea += 1;
      areaAdd.call(this, type, listener, options);
    };
  });
}

async function inputBinds(page: Page): Promise<{ document: number; textarea: number }> {
  return page.evaluate(() => {
    const host = window as Window & { __hhInputAdds?: { document: number; textarea: number } };
    return host.__hhInputAdds ?? { document: 0, textarea: 0 };
  });
}

async function storedDraftText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null || !key.startsWith("hh.draft.v1:")) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as { text?: unknown };
      return typeof parsed.text === "string" ? parsed.text : null;
    }
    return null;
  });
}

async function openDesk(page: Page, mode: VoiceMode, clock = false): Promise<void> {
  await page.addInitScript(installVoice, mode);
  // A paused clock freezes requestAnimationFrame. The splash promotes the
  // desk scripts on a frame, so a second visit on this page would never go live.
  await page.clock.resume().catch(() => undefined);
  if (clock) {
    try {
      await page.clock.install();
    } catch {
      // Installed by an earlier openDesk on this page. Time is already running.
    }
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(deskUrl);
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
  await page.evaluate(() => {
    const field = document.querySelector("#hh-card-draft");
    if (field === null || !("value" in field) || field.value === "") return;
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

/** The answer route returns before the Guide job publishes the next session. */
function watchAnswer(page: Page): Promise<void> {
  const pending = page.waitForResponse(
    (item) => new URL(item.url()).pathname === "/api/answer" && item.request().method() === "POST",
  );
  return pending.then(async (response) => {
    const payload = (await response.json()) as { jobId?: unknown };
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    if (jobId === "") return;
    await expect
      .poll(async () => {
        const job = await page.request.get(new URL(`/api/guide-job/${jobId}`, deskUrl).href);
        if (!job.ok()) return "gone";
        const body = (await job.json()) as { status?: string };
        return body.status ?? "";
      })
      .not.toBe("running");
  });
}

async function stop(page: Page): Promise<void> {
  await page.locator('[data-voice="hold"]').click();
}

async function setStopOrder(page: Page, order: string, pending: string): Promise<void> {
  await page.evaluate(
    ({ order, pending }) => {
      const host = window as Window & { __hhOrder?: string; __hhPending?: string };
      host.__hhOrder = order;
      host.__hhPending = pending;
    },
    { order, pending },
  );
}

async function emitAt(page: Page, index: number, text: string, isFinal: boolean): Promise<void> {
  await page.evaluate(
    ({ index, heard, final }) => {
      const host = window as Window & {
        __hhEmitAt?: (at: number, value: string, done: boolean) => void;
      };
      host.__hhEmitAt?.(index, heard, final);
    },
    { index, heard: text, final: isFinal },
  );
}

async function maxLive(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = window as Window & { __hhMaxLive?: number };
    return host.__hhMaxLive ?? 0;
  });
}

/** One or more click-to-talk cycles. `prefix` is text already in the box. */
async function dictateCycles(page: Page, order: string, words: string[], prefix = ""): Promise<void> {
  const button = page.locator('[data-voice="hold"]');
  const draft = page.locator("#hh-card-draft");
  let expected = prefix;
  for (const word of words) {
    await button.click();
    await expect(button).toHaveText("Stop listening", { timeout: 1_000 });
    if (order === "end-only") {
      await emit(page, word, false);
      await setStopOrder(page, "end-only", "");
    } else {
      await setStopOrder(page, order, word);
    }
    await button.click();
    expected = expected === "" ? word : `${expected} ${word}`;
    await expect(button).toHaveText("Click to talk", { timeout: 1_000 });
    await expect(draft).toHaveValue(expected);
  }
}

interface HeardPiece {
  text: string;
  final: boolean;
}

interface VoiceRecognizerStat {
  live: boolean;
  aborted: boolean;
  onresult: boolean;
  onerror: boolean;
  onend: boolean;
  onstart: boolean;
  onspeechstart: boolean;
}

interface VoiceStats {
  constructed: number;
  live: number;
  maxLive: number;
  onresult: number;
  onerror: number;
  onend: number;
  onstart: number;
  onspeechstart: number;
  recognizers: VoiceRecognizerStat[];
}

async function emitList(page: Page, index: number, entries: HeardPiece[], resultIndex: number): Promise<void> {
  await page.evaluate(
    ({ index: at, entries: pieces, resultIndex: from }) => {
      const host = window as Window & {
        __hhEmitList?: (
          index: number,
          entries: { text: string; final: boolean }[],
          resultIndex: number,
        ) => void;
      };
      host.__hhEmitList?.(at, pieces, from);
    },
    { index, entries, resultIndex },
  );
}

async function voiceStats(page: Page): Promise<VoiceStats> {
  return page.evaluate(() => {
    const host = window as Window & { __hhVoiceStats?: () => VoiceStats };
    return host.__hhVoiceStats?.() ?? {
      constructed: 0,
      live: 0,
      maxLive: 0,
      onresult: 0,
      onerror: 0,
      onend: 0,
      onstart: 0,
      onspeechstart: 0,
      recognizers: [],
    };
  });
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

/** Sets the box without a focus that would offer a saved draft back. */
async function replaceDraft(draft: ReturnType<Page["locator"]>, value: string): Promise<void> {
  await draft.evaluate((el, next) => {
    const field = el as HTMLTextAreaElement;
    field.value = next;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function showPushback(page: Page, line = PUSH_LINE): Promise<void> {
  await page.evaluate(async (text) => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const session = (await response.json()) as { pushback: string | null };
    session.pushback = text;
    const host = window as Window & { __hhPush?: (data: string) => void };
    host.__hhPush?.(JSON.stringify(session));
  }, line);
  await expect(page.locator("[data-pushback]")).toHaveAttribute("data-pushback", line);
  await expect(page.locator(".hh-qcard__push")).toHaveText(line);
  await expect(page.locator("#hh-card-draft")).toHaveValue("");
  await expect(page.locator('[data-action="answer"]')).toBeDisabled();
}

async function expectHeard(page: Page, value: string): Promise<void> {
  await expect(page.locator('[data-voice="hold"]')).toHaveText("Click to talk");
  await expect(page.locator("#hh-card-draft")).toHaveValue(value);
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await expect(page.locator("[data-card-notice]")).toHaveText(HEARD);
  expect(value.trim()).not.toBe("");
}

/** Talk, interim, final, stop, onend. The box is never blank when it already had text. */
async function dictateOnto(page: Page, prior: string, interim: string, final: string): Promise<void> {
  const draft = page.locator("#hh-card-draft");
  const button = page.locator('[data-voice="hold"]');
  const joined = (heard: string): string => {
    const head = prior.trim();
    const tail = heard.trim();
    if (head === "") return tail;
    if (tail === "") return head;
    return `${head} ${tail}`;
  };
  expect(await draft.inputValue()).toBe(prior);
  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await draft.inputValue()).toBe(prior);
  await emit(page, interim, false);
  expect(await draft.inputValue()).toBe(joined(interim));
  await emit(page, final, true);
  expect(await draft.inputValue()).toBe(joined(final));
  await button.click();
  await end(page);
  await expect(button).toHaveText("Click to talk");
  expect(await draft.inputValue()).toBe(joined(final));
}

async function runLate(page: Page, waitMs: number): Promise<void> {
  const draft = page.locator("#hh-card-draft");
  const button = page.locator('[data-voice="hold"]');
  await replaceDraft(draft, "Hello");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await draft.inputValue()).toBe("Hello");
  await button.click();
  await end(page);
  await page.waitForTimeout(waitMs);
  await emit(page, "late words", true);
  await expectHeard(page, "Hello late words");
  expect((await draft.inputValue()).split("late words").length - 1).toBe(1);
}

async function runLateSurvives(page: Page): Promise<void> {
  const draft = page.locator("#hh-card-draft");
  const button = page.locator('[data-voice="hold"]');
  await replaceDraft(draft, "Hello");
  await button.click();
  await expect(button).toHaveText("Stop listening");
  expect(await draft.inputValue()).toBe("Hello");
  await button.click();
  await end(page);
  await page.waitForTimeout(400);
  await emit(page, "late words", true);
  await expectHeard(page, "Hello late words");
  await page.waitForTimeout(VOICE_STOP_WAIT_MS);
  await expectHeard(page, "Hello late words");
  await emit(page, "too late", true);
  await expect(draft).toHaveValue("Hello late words");
  await expect(page.locator('[data-action="answer"]')).toBeEnabled();
  await expect(page.locator("[data-card-notice]")).toHaveText(HEARD);
  expect(await draft.inputValue()).not.toContain("too late");
}

async function repaintSameView(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const session = (await response.json()) as { pushback: string | null };
    const line = document.querySelector("[data-pushback]")?.getAttribute("data-pushback") ?? null;
    session.pushback = line;
    const host = window as Window & { __hhPush?: (data: string) => void };
    host.__hhPush?.(JSON.stringify(session));
  });
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
      onspeechstart: (() => void) | null;
      live: boolean;
    };
    __hhEmit?: (text: string, isFinal: boolean) => void;
    __hhEnd?: () => void;
    __hhEvents?: EventSource;
    __hhPush?: (data: string) => void;
    __hhFetchUrl?: string;
    __hhDraftAtFetch?: string;
    __hhStopsAtFetch?: number;
    __hhOrder?: string;
    __hhPending?: string;
    __hhList?: {
      onstart: (() => void) | null;
      onresult: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
      onspeechstart: (() => void) | null;
      started: boolean;
      stopped: boolean;
      aborted: boolean;
      live: boolean;
    }[];
    __hhHandlers?: {
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    }[];
    __hhMaxLive?: number;
    __hhEmitList?: (
      index: number,
      entries: { text: string; final: boolean }[],
      resultIndex: number,
    ) => void;
    __hhVoiceStats?: () => {
      constructed: number;
      live: number;
      maxLive: number;
      onresult: number;
      onerror: number;
      onend: number;
      onstart: number;
      onspeechstart: number;
      recognizers: {
        live: boolean;
        aborted: boolean;
        onresult: boolean;
        onerror: boolean;
        onend: boolean;
        onstart: boolean;
        onspeechstart: boolean;
      }[];
    };
    __hhSpeech?: () => void;
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

  host.__hhList = [];
  host.__hhHandlers = [];

  const recount = (): void => {
    let now = 0;
    for (const item of host.__hhList ?? []) {
      if (item.live) now += 1;
    }
    host.__hhMaxLive = Math.max(host.__hhMaxLive ?? 0, now);
  };

  class FakeSpeech {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onspeechstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    stopped = false;
    aborted = false;
    live = false;

    constructor() {
      host.__hhList?.push(this);
    }

    start(): void {
      this.started = true;
      this.live = true;
      recount();
      host.__hhStarts = (host.__hhStarts ?? 0) + 1;
      host.__hhCurrent = this;
      host.__hhContinuous = this.continuous;
      host.__hhInterim = this.interimResults;
      host.__hhHandlers?.push({ onend: this.onend, onerror: this.onerror });
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
      this.stopped = true;
      this.live = false;
      recount();
      host.__hhStops = (host.__hhStops ?? 0) + 1;
      if (mode === "auto" || mode === "denied") {
        this.onend?.();
        return;
      }
      const order = host.__hhOrder ?? "manual";
      const text = host.__hhPending ?? "";
      const deliverFinal = (): void => {
        if (text === "") return;
        this.onresult?.({
          resultIndex: 0,
          results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } },
        });
      };
      // The final is queued so it lands after the desk is already waiting on stop.
      if (order === "final-then-end" || order === "final-only") {
        queueMicrotask(() => {
          deliverFinal();
          if (order === "final-then-end") queueMicrotask(() => {
            this.onend?.();
          });
        });
        return;
      }
      if (order === "end-then-final") {
        queueMicrotask(() => {
          this.onend?.();
          queueMicrotask(() => {
            deliverFinal();
          });
        });
        return;
      }
      if (order === "end-only") {
        queueMicrotask(() => {
          this.onend?.();
        });
      }
    }

    abort(): void {
      this.stopped = true;
      this.aborted = true;
      this.live = false;
      recount();
      host.__hhAborts = (host.__hhAborts ?? 0) + 1;
      if (mode === "auto" || mode === "denied") this.onend?.();
    }
  }

  host.__hhSpeech = (): void => {
    host.__hhCurrent?.onspeechstart?.();
  };
  host.__hhEmit = (text: string, isFinal: boolean): void => {
    host.__hhCurrent?.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } },
    });
  };
  host.__hhEnd = (): void => {
    const current = host.__hhCurrent;
    if (current !== undefined) current.live = false;
    recount();
    current?.onend?.();
  };
  host.__hhEmitList = (index, entries, resultIndex): void => {
    const rec = index < 0 ? host.__hhCurrent : host.__hhList?.[index];
    const results = entries.map((entry) => ({
      isFinal: entry.final,
      length: 1,
      0: { transcript: entry.text },
    }));
    rec?.onresult?.({ resultIndex, results });
  };
  host.__hhVoiceStats = () => {
    const list = host.__hhList ?? [];
    return {
      constructed: list.length,
      live: list.filter((item) => item.live).length,
      maxLive: host.__hhMaxLive ?? 0,
      onresult: list.filter((item) => item.onresult !== null).length,
      onerror: list.filter((item) => item.onerror !== null).length,
      onend: list.filter((item) => item.onend !== null).length,
      onstart: list.filter((item) => item.onstart !== null).length,
      onspeechstart: list.filter((item) => item.onspeechstart !== null).length,
      recognizers: list.map((item) => ({
        live: item.live === true,
        aborted: item.aborted === true,
        onresult: item.onresult !== null,
        onerror: item.onerror !== null,
        onend: item.onend !== null,
        onstart: item.onstart !== null,
        onspeechstart: item.onspeechstart !== null,
      })),
    };
  };
  const emitOn = (index: number, text: string, isFinal: boolean): void => {
    host.__hhList?.[index]?.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: text } } },
    });
  };
  (host as Window & { __hhEmitAt?: typeof emitOn }).__hhEmitAt = emitOn;
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
