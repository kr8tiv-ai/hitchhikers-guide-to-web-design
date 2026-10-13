import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * An unsent answer stays on this machine. Leaving the desk, reloading, and
 * starting the server again must bring the same question back with that text.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PUSH_LINE = "Name one concrete detail.";
const HELPER = "Yourself, or one named client.";
const TYPED = "The site is for my own tea shop.";
const CHOICE_B = "Show the tin photo large on the page.";
const STATIC_ANSWER = "That line is the question's helper, not an answer. Write your own.";
const CHOICE_CASSETTE = path.join(here, "fixtures", "suggestion-choices", "good.json");
const BLOCKED = "This browser would not save the draft. Your words are still here, and stay until you press Answer.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("typed text and the same question survive Brand and come back", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-nav-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    const id = await questionId(page);
    const step = await stepText(page);
    await page.locator("#hh-card-draft").fill("Draft one");
    await page.goto(new URL("/brand", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    expect(await questionId(page)).toBe(id);
    expect(await stepText(page)).toBe(step);
    await expect(page.getByTestId("draft-saved")).toHaveText("Draft restored");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a reload and a new server on the same project keep the draft", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-restart-"));
  let child: ChildProcess | null = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    const id = await questionId(page);
    const step = await stepText(page);
    await page.locator("#hh-card-draft").fill("Draft one");
    await page.reload();
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    expect(await questionId(page)).toBe(id);
    expect(await stepText(page)).toBe(step);
    await expect.poll(async () => draftFile(projectDir)).toContain("Draft one");
    const stored = await draftFile(projectDir);
    expect(stored.includes(projectDir)).toBe(false);
    expect(stored.includes("Users")).toBe(false);
    expect(stored.includes("Authorization")).toBe(false);
    await stopChild(child);
    child = null;
    child = startDesk(projectDir);
    const next = await readUrl(child);
    await page.goto(next);
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    expect(await questionId(page)).toBe(id);
    expect(await stepText(page)).toBe(step);
    expect(errors).toEqual([]);
  } finally {
    if (child !== null) await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("dictation is saved the same way after a stop", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-voice-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.addInitScript(installTalk);
    await openDesk(page, url);
    const id = await questionId(page);
    await page.locator('[data-voice="hold"]').click();
    await expect(page.locator('[data-voice="hold"]')).toHaveText("Stop listening");
    await emit(page, "spoken once", true);
    await page.locator('[data-voice="hold"]').click();
    await endTalk(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("spoken once");
    await page.goto(new URL("/gallery", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("spoken once");
    expect(await questionId(page)).toBe(id);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a pushback card returns with its line and the typed text", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-push-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.addInitScript(installTalk);
    await openDesk(page, url);
    await showPushback(page);
    await page.locator("#hh-card-draft").fill("Draft one");
    await expect.poll(async () => draftFile(projectDir)).toContain("Draft one");
    await expect.poll(async () => draftFile(projectDir)).toContain(PUSH_LINE);
    await page.goto(new URL("/approve", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("[data-pushback]")).toHaveAttribute("data-pushback", PUSH_LINE);
    await expect(page.locator(".hh-qcard__push")).toHaveText(PUSH_LINE);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    await expect(page.locator('[data-action="answer"]')).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("Other after a pushback stays empty instead of offering the saved draft", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-other-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.addInitScript(installTalk);
    await openDesk(page, url);
    await page.locator("#hh-card-draft").fill("Draft one");
    await page.evaluate(async (text) => {
      const response = await fetch("/api/session", { cache: "no-store" });
      const session = (await response.json()) as {
        pushback: string | null;
        question: { id: string } | null;
        choices: unknown;
      };
      const id = session.question?.id ?? "";
      session.pushback = text;
      session.choices = {
        forId: id,
        origin: "fallback",
        items: [{ id: "A", label: "A quiet page", why: "Clear", source: "tree" }],
      };
      const host = window as Window & { __hhPush?: (data: string) => void };
      host.__hhPush?.(JSON.stringify(session));
    }, PUSH_LINE);
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    await page.getByRole("radio", { name: "Other: I'll write my own" }).click();
    const field = page.locator("#hh-card-draft");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("");
    await expect(page.locator('[data-action="answer"]')).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a typed draft survives Suggest and does not come back as the helper", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-suggest-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await page.locator("#hh-card-draft").fill(TYPED);
    await expect.poll(async () => draftKeys(page)).toContain(TYPED);
    await page.locator('[data-action="suggest"]').click();
    await expect(page.locator("[data-question-id='DP-0.1']").getByRole("radiogroup")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue(TYPED);
    await expect(page.locator("[data-assumed='suggested']")).toHaveCount(0);
    expect(await questionId(page)).toBe("DP-0.1");
    const parked = await draftKeys(page);
    expect(parked.includes(TYPED)).toBe(true);
    expect(parked.includes(HELPER)).toBe(false);
    await page.reload();
    await ready(page);
    expect(await questionId(page)).toBe("DP-0.1");
    await expect(page.locator("#hh-card-draft")).toHaveValue(TYPED);
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    expect((await interviewFile(projectDir)).includes(HELPER)).toBe(false);
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    await expect(page.locator("#hh-card-draft")).not.toHaveValue(HELPER);
    const cleared = await draftKeys(page);
    expect(cleared.includes(TYPED)).toBe(false);
    expect(cleared.includes(HELPER)).toBe(false);
    expect(cleared.includes("DP-0.1")).toBe(false);
    await page.reload();
    await ready(page);
    expect(await questionId(page)).toBe("DP-0.2");
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    expect((await draftFile(projectDir)).includes(HELPER)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("Suggest does not store the helper, and posting it is rejected", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-helper-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await page.locator('[data-action="suggest"]').click();
    await expect(page.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${HELPER}`);
    await expect(page.locator("#hh-card-draft")).toHaveValue(HELPER);
    expect(await questionId(page)).toBe("DP-0.1");
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    expect((await draftFile(projectDir)).includes(HELPER)).toBe(false);
    expect((await interviewFile(projectDir)).includes(HELPER)).toBe(false);
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-card-error]")).toHaveText(STATIC_ANSWER);
    expect(await questionId(page)).toBe("DP-0.1");
    await expect(page.locator("#hh-card-draft")).toHaveValue(HELPER);
    const lines = await staticLines(page);
    for (const line of lines) {
      const status = await postAnswer(page, line);
      expect(status).toBe(400);
    }
    expect(await questionId(page)).toBe("DP-0.1");
    expect((await interviewFile(projectDir)).includes(HELPER)).toBe(false);
    await page.reload();
    await ready(page);
    expect(await questionId(page)).toBe("DP-0.1");
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    expect((await draftFile(projectDir)).includes(HELPER)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a picked choice is saved without writing the helper into the draft", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-choice-suggest-"));
  await seedChoiceFacts(projectDir);
  const child = startDesk(projectDir, CHOICE_CASSETTE);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await page.locator("#hh-card-draft").fill(TYPED);
    await expect.poll(async () => draftKeys(page)).toContain(TYPED);
    await page.locator('[data-action="suggest"]').click();
    const card = page.locator("[data-question-id='DP-0.1']");
    await expect(card.getByRole("radio", { name: /^B\./ })).toContainText(CHOICE_B);
    await expect(page.locator("#hh-card-draft")).toHaveValue(TYPED);
    await expect(page.locator("[data-assumed='suggested']")).toHaveCount(0);
    expect(await questionId(page)).toBe("DP-0.1");
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    await page.locator("#hh-card-draft").fill("");
    await card.getByRole("radio", { name: /^B\./ }).click();
    // BUG-012: a choice fills the draft. Answer sends it.
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("[data-assumed='suggested']")).toContainText(`Assumed: ${CHOICE_B}`);
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    await expect(page.locator("#hh-card-draft")).not.toHaveValue(HELPER);
    const saved = await interviewFile(projectDir);
    expect(saved.includes(CHOICE_B)).toBe(true);
    expect(saved.includes(HELPER)).toBe(false);
    const keys = await draftKeys(page);
    expect(keys.includes(HELPER)).toBe(false);
    expect(keys.includes(TYPED)).toBe(false);
    await page.reload();
    await ready(page);
    expect(await questionId(page)).toBe("DP-0.2");
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    expect((await draftKeys(page)).includes(HELPER)).toBe(false);
    expect((await draftFile(projectDir)).includes(HELPER)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a picked choice is saved with the choice set", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-choice-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    const token = await page.locator('meta[name="hh-csrf"]').getAttribute("content");
    expect(token).not.toBeNull();
    const posted = await page.evaluate(
      async ({ csrf }) => {
        const response = await fetch("/api/draft", {
          method: "POST",
          headers: { "content-type": "application/json", "x-hh-csrf": csrf },
          body: JSON.stringify({
            questionId: "DP-0.1",
            text: "A quiet page",
            step: 1,
            choices: {
              forId: "DP-0.1",
              origin: "fallback",
              items: [{ id: "A", label: "A quiet page", why: "It names the page.", source: "fallback" }],
            },
          }),
        });
        return response.status;
      },
      { csrf: token ?? "" },
    );
    expect(posted).toBe(200);
    await page.reload();
    await ready(page);
    expect(await questionId(page)).toBe("DP-0.1");
    await expect(page.locator("[data-choice-id='A']")).toContainText("A quiet page");
    await expect(page.locator("#hh-card-draft")).toHaveValue("A quiet page");
    await page.route("**/api/answer", async (route) => {
      await new Promise(() => undefined);
    });
    await page.locator("[data-choice-id='A']").click();
    await expect.poll(async () => draftKeys(page)).toContain("A quiet page");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("an attached file stays, and clearing the draft leaves the file", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-file-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await skipUntil(page, "DP-1.1");
    await page.locator("[data-attach-file]").setInputFiles({
      name: "mark.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "mark.png" })).toBeVisible();
    await page.locator("#hh-card-draft").fill("Keep this sentence.");
    await page.goto(new URL("/drive", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("[data-question-id='DP-1.1']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("Keep this sentence.");
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "mark.png" })).toBeVisible();
    await page.locator("#hh-card-draft").fill("");
    await expect(page.locator("[data-attach-zone] .hh-attach__name", { hasText: "mark.png" })).toBeVisible();
    const folder = path.join(projectDir, ".hitchhiker", "uploads", "DP-1.1");
    const names = (await readdir(folder)).filter((name) => name !== "manifest.json");
    expect(names.some((name) => name.endsWith(".png"))).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a successful Answer clears the draft and a failed Answer keeps it", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-answer-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await page.locator("#hh-card-draft").fill("Draft one");
    await expect.poll(async () => draftKeys(page)).toContain("Draft one");
    await page.route("**/api/answer", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "The answer did not save. Try again, or skip." }),
      }),
    );
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    await page.unroute("**/api/answer");
    await page.goto(new URL("/brand", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    await expect.poll(async () => draftKeys(page)).toContain("Draft one");
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    const keys = await draftKeys(page);
    expect(keys.includes("Draft one")).toBe(false);
    expect(keys.includes("DP-0.1")).toBe(false);
    await page.goto(new URL("/gallery", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("skip removes the draft and an empty box stores nothing", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-skip-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    await page.goto(new URL("/brand", url).href);
    await page.goto(new URL("/", url).href);
    await ready(page);
    expect(await draftKeys(page)).toBe("");
    const emptyFile = await draftFile(projectDir);
    expect(emptyFile.includes("DP-0.1")).toBe(false);
    await page.locator("#hh-card-draft").fill("Skip me");
    await expect.poll(async () => draftKeys(page)).toContain("Skip me");
    await page.locator('[data-action="skip"]').click();
    await expect(page.locator("[data-question-id='DP-0.2']")).toBeVisible();
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    const keys = await draftKeys(page);
    expect(keys.includes("Skip me")).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("blocked storage still accepts typing and shows the note", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-quota-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.addInitScript(installBlockedStorage);
    await openDesk(page, url);
    await page.locator("#hh-card-draft").fill("Draft one");
    await expect(page.locator("#hh-card-draft")).toHaveValue("Draft one");
    await expect(page.getByTestId("draft-saved")).toHaveText(BLOCKED);
    await expect(page.getByTestId("draft-saved")).toHaveAttribute("aria-live", "polite");
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("a stored draft for a question the interview is not asking is ignored and removed", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-stale-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await openDesk(page, url);
    const session = await page.evaluate(async () => {
      const response = await fetch("/api/session", { cache: "no-store" });
      return (await response.json()) as { projectKey?: string };
    });
    const projectKey = session.projectKey ?? "";
    expect(projectKey).toMatch(/^[a-f0-9]{32}$/);
    expect(projectKey.includes(projectDir)).toBe(false);
    await page.evaluate(
      ({ key }) => {
        localStorage.setItem(
          `hh.draft.v1:${key}:NO-SUCH`,
          JSON.stringify({ text: "Wrong question", savedAt: Date.now(), step: 9 }),
        );
        localStorage.setItem(
          "hh.draft.v1:0123456789abcdef0123456789abcdef:DP-0.1",
          JSON.stringify({ text: "Other project", savedAt: Date.now(), step: 1 }),
        );
      },
      { key: projectKey },
    );
    await page.reload();
    await ready(page);
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    await expect(page.locator("[data-question-id='DP-0.1']")).toBeVisible();
    const keys = await draftKeys(page);
    expect(keys.includes("Wrong question")).toBe(false);
    expect(keys.includes("NO-SUCH")).toBe(false);
    expect(keys.includes("Other project")).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("Draft saved is one polite line per batch and does not shift the box", async ({ page }) => {
  const errors = trackErrors(page);
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-draft-live-"));
  const child = startDesk(projectDir);
  try {
    const url = await readUrl(child);
    await page.addInitScript(countWrites);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDesk(page, url);
    const status = page.getByTestId("draft-saved");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    const box = page.locator("#hh-card-draft");
    await box.scrollIntoViewIfNeeded();
    const before = await box.boundingBox();
    await page.locator("#hh-card-draft").pressSequentially("Draft one", { delay: 20 });
    await expect(status).toHaveText("Draft saved");
    const writes = await page.evaluate(() => {
      const host = window as Window & { __hhDraftWrites?: number };
      return host.__hhDraftWrites ?? 0;
    });
    expect(writes).toBe(1);
    const after = await page.locator("#hh-card-draft").boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before !== null && after !== null) expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(errors).toEqual([]);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function openDesk(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url);
  await ready(page);
}

async function ready(page: Page): Promise<void> {
  await page.locator('[data-region="question"][data-live="true"]').waitFor();
}

async function questionId(page: Page): Promise<string> {
  return (await page.locator("[data-question-id]").getAttribute("data-question-id")) ?? "";
}

async function stepText(page: Page): Promise<string> {
  return (await page.locator("[data-progress]").first().innerText()).trim();
}

async function draftKeys(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null || !key.startsWith("hh.draft.v1:")) continue;
      parts.push(`${key}=${localStorage.getItem(key) ?? ""}`);
    }
    return parts.join("\n");
  });
}

async function draftFile(projectDir: string): Promise<string> {
  try {
    return await readFile(path.join(projectDir, ".hitchhiker", "drafts.json"), "utf8");
  } catch {
    return "";
  }
}

async function interviewFile(projectDir: string): Promise<string> {
  try {
    return await readFile(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8");
  } catch {
    return "";
  }
}

async function staticLines(page: Page): Promise<string[]> {
  const lines = await page.evaluate(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const session = (await response.json()) as { question?: { suggest?: string; why?: string; tip?: string } | null };
    const question = session.question;
    return [question?.suggest ?? "", question?.why ?? "", question?.tip ?? ""];
  });
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== "" && !kept.includes(trimmed)) kept.push(trimmed);
  }
  expect(kept.includes(HELPER)).toBe(true);
  return kept;
}

async function postAnswer(page: Page, text: string): Promise<number> {
  const token = await page.locator('meta[name="hh-csrf"]').getAttribute("content");
  expect(token).not.toBeNull();
  return page.evaluate(
    async ({ csrf, text: line }) => {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": csrf },
        body: JSON.stringify({ questionId: "DP-0.1", text: line }),
      });
      return response.status;
    },
    { csrf: token ?? "", text },
  );
}

async function seedChoiceFacts(projectDir: string): Promise<void> {
  const hitch = path.join(projectDir, ".hitchhiker", "uploads");
  await mkdir(hitch, { recursive: true });
  await writeFile(path.join(hitch, "tins.jpg"), "");
  await writeFile(
    path.join(projectDir, ".hitchhiker", "facts.json"),
    JSON.stringify({ industry: "tea", crawlNotes: ["menu"] }),
  );
}

async function skipUntil(page: Page, target: string): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    const id = await page.locator("[data-question-id]").getAttribute("data-question-id");
    if (id === target) return;
    const token = await page.locator('meta[name="hh-csrf"]').getAttribute("content");
    expect(id).not.toBeNull();
    expect(token).not.toBeNull();
    const status = await page.evaluate(
      async ({ questionId: current, csrf }) => {
        const response = await fetch("/api/skip", {
          method: "POST",
          headers: { "content-type": "application/json", "x-hh-csrf": csrf },
          body: JSON.stringify({ questionId: current }),
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

async function showPushback(page: Page): Promise<void> {
  await page.evaluate(async (text) => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const session = (await response.json()) as { pushback: string | null };
    session.pushback = text;
    const host = window as Window & { __hhPush?: (data: string) => void };
    host.__hhPush?.(JSON.stringify(session));
  }, PUSH_LINE);
  await expect(page.locator("[data-pushback]")).toHaveAttribute("data-pushback", PUSH_LINE);
  await expect(page.locator("#hh-card-draft")).toHaveValue("");
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

async function endTalk(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as Window & { __hhEnd?: () => void };
    host.__hhEnd?.();
  });
}

function installTalk(): void {
  const host = window as Window & {
    __hhCurrent?: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null };
    __hhEmit?: (text: string, isFinal: boolean) => void;
    __hhEnd?: () => void;
    __hhPush?: (data: string) => void;
    __hhEvents?: EventSource;
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
  class FakeSpeech {
    lang = "";
    continuous = false;
    interimResults = false;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start(): void {
      host.__hhCurrent = this;
      this.onstart?.();
    }
    stop(): void {
      // The test ends the recognizer, the same way the voice spec does.
    }
    abort(): void {
      this.onend?.();
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
  const define = (name: "SpeechRecognition" | "webkitSpeechRecognition", value: unknown): void => {
    Object.defineProperty(window, name, { configurable: true, writable: true, value });
  };
  define("SpeechRecognition", FakeSpeech);
  define("webkitSpeechRecognition", FakeSpeech);
}

function installBlockedStorage(): void {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key: string, value: string): void {
    if (String(key).startsWith("hh.draft.v1:")) {
      throw new DOMException("quota", "QuotaExceededError");
    }
    original.call(this, key, value);
  };
}

function countWrites(): void {
  const host = window as Window & { __hhDraftWrites?: number };
  host.__hhDraftWrites = 0;
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function setItem(key: string, value: string): void {
    if (String(key).startsWith("hh.draft.v1:")) host.__hhDraftWrites = (host.__hhDraftWrites ?? 0) + 1;
    original.call(this, key, value);
  };
}

function startDesk(projectDir: string, cassette?: string): ChildProcess {
  const serverFile = path.resolve(here, "../src/server/server.ts");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HH_E2E_PROJECT: projectDir,
    HH_E2E_SERVER: pathToFileURL(serverFile).href,
  };
  if (cassette !== undefined) {
    env.HH_GUIDE_REPLAY = "1";
    env.HH_GUIDE_CASSETTE = cassette;
  }
  return spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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
