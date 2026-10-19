import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadQueue, type QueueFile, type ThinkRequest } from "@hitchhiker/engine";
import {
  applyBeautyRound,
  captureSitePages,
  judgeBeauty,
  juryWithBeauty,
  scoreSections,
  writeBeautyRound,
  type SectionShot,
} from "../src/beauty-gate.ts";

const NOW = "2026-10-19T15:00:00.000Z";
const ART = "Editorial world, slow Lenis, warm film grade.";
const DESIGN = "This is direction and vocabulary, not a limit. Remix the references.";
const PILLARS = ["copy", "visuals", "color", "type", "spacing", "experience", "motion", "brand"] as const;

function shot(overrides: Partial<SectionShot> = {}): SectionShot {
  return {
    page: "home",
    section: "story",
    screenshot: ".hitchhiker/review/home-story.png",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    score: 9,
    reason: "Layered media and a real type scale.",
    slop: "",
    ...overrides,
  };
}

function queue(): QueueFile {
  return {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "010", kind: "build", status: "passed" },
      { id: "011", kind: "build", status: "passed" },
      { id: "012", kind: "build", status: "queued" },
    ],
  };
}

function round(base: QueueFile, failures: ReturnType<typeof judgeBeauty>["failures"], attempt: number) {
  return applyBeautyRound({
    queue: base,
    gateIds: ["010", "011"],
    round: attempt,
    failures,
    artDirection: ART,
    designLanguage: DESIGN,
    now: NOW,
  });
}

test("a text-only section fails and queues one remediation prompt", async () => {
  const judged = judgeBeauty([shot({ textOnly: true, reason: "The section is a column of text." })]);
  assert.equal(judged.pass, false);
  assert.equal(judged.failures.length, 1);
  assert.match(judged.failures[0]?.reason ?? "", /Text only/);
  const result = round(queue(), judged.failures, 1);
  assert.equal(result.brand, "FAIL");
  assert.equal(result.jury, "FAIL");
  assert.equal(result.stopped, false);
  assert.equal(result.prompts.length, 1);
  const prompt = result.prompts[0];
  assert.ok(prompt);
  assert.equal(prompt.id, "013");
  assert.match(prompt.body, /Editorial world/);
  assert.match(prompt.body, /\.hitchhiker\/review\/home-story\.png/);
  assert.match(prompt.body, /direction and vocabulary/);
  assert.match(prompt.body, /Text only/);
  assert.equal(/[A-Za-z]:\\/.test(prompt.body), false);
  const ids = result.queue.items.map((item) => item.id);
  assert.deepEqual(ids, ["001", "013", "010", "011", "012"]);
  assert.equal(result.queue.items.find((item) => item.id === "013")?.status, "queued");

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-beauty-239-"));
  try {
    await writeBeautyRound(dir, result);
    const saved = await loadQueue(dir);
    assert.equal(saved?.items.some((item) => item.id === "013" && item.status === "queued"), true);
    const body = readFileSync(path.join(dir, ".hitchhiker", "prompts", "013.md"), "utf8");
    assert.match(body, /model: grok-4.7-build-fast/);
    assert.match(body, /effort: xhigh/);
    assert.match(body, /## Design language/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a TODO image, a score of 7, and named slop fail, and a rich section passes", () => {
  const todo = judgeBeauty([shot({ todoImage: true })]);
  assert.equal(todo.pass, false);
  assert.match(todo.failures[0]?.reason ?? "", /TODO or placeholder/);

  const low = judgeBeauty([shot({ score: 7, reason: "The layout is plain." })]);
  assert.equal(low.pass, false);
  assert.match(low.failures[0]?.reason ?? "", /plain/);

  const slop = judgeBeauty([shot({ score: 9, slop: "warped text in an image" })]);
  assert.equal(slop.pass, false);
  assert.match(slop.failures[0]?.reason ?? "", /AI slop: warped text in an image/);

  const rich = judgeBeauty([
    shot({ section: "hero", score: 8 }),
    shot({ section: "farms", score: 9, page: "visit" }),
  ]);
  assert.equal(rich.pass, true);
  assert.equal(rich.failures.length, 0);
  const passed = round(queue(), rich.failures, 1);
  assert.equal(passed.brand, "PASS");
  assert.equal(passed.jury, "PASS");
  assert.equal(passed.prompts.length, 0);
});

test("the jury total cannot pass while a section fails", () => {
  const failed = judgeBeauty([shot({ textOnly: true })]);
  const blocked = juryWithBeauty({ brand: 10, craft: 10, clarity: 10, performance: 10 }, failed.failures);
  assert.equal(blocked.status, "FAIL");
  assert.ok(blocked.total >= 70);
  const open = juryWithBeauty({ brand: 10, craft: 10, clarity: 10, performance: 10 }, []);
  assert.equal(open.status, "PASS");
  assert.equal(open.total, 100);
});

test("a third failed round stops the queue", async () => {
  const judged = judgeBeauty([shot({ textOnly: true })]);
  const first = round(queue(), judged.failures, 1);
  const second = round(first.queue, judged.failures, 2);
  assert.equal(second.prompts.length, 1);
  assert.equal(second.stopped, false);
  const third = round(second.queue, judged.failures, 3);
  assert.equal(third.stopped, true);
  assert.equal(third.prompts.length, 0);
  assert.equal(third.queue.pause?.at, NOW);
  assert.equal(third.queue.items.find((item) => item.id === "010")?.status, "failed");
  assert.equal(third.queue.items.find((item) => item.id === "011")?.status, "failed");
  assert.equal(third.queue.items.find((item) => item.id === "012")?.status, "paused");
  assert.match(third.driveCopy, /Failed/);
  assert.match(third.driveCopy, /home story/);
  assert.match(third.driveCopy, /Text only/);
  assert.match(third.driveCopy, /stopped for a human/);

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-beauty-stop-"));
  try {
    await writeBeautyRound(dir, third);
    const note = readFileSync(path.join(dir, ".hitchhiker", "beauty.md"), "utf8");
    assert.match(note, /Failed/);
    const saved = await loadQueue(dir);
    assert.equal(saved?.pause?.after, "011");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("screenshots use every review width and vision stays on grok-4.7-build-fast xhigh", async () => {
  const seen: Array<{ page: string; width: number }> = [];
  const captured = await captureSitePages(["home", "visit"], async (page, width) => {
    seen.push({ page, width });
    return Buffer.from(`${page}-${width}`);
  });
  assert.deepEqual(captured, seen);
  assert.deepEqual(
    seen.map((row) => row.width),
    [375, 768, 1440, 1920, 375, 768, 1440, 1920],
  );

  const seenRequest: ThinkRequest<unknown>[] = [];
  const value = {
    truths: [{ truth: "home story is scored for visual richness.", note: "Scored from the screenshot." }],
    pillars: PILLARS.map((name) => ({ name, status: "PASS", note: `${name} holds.` })),
    jury: { brand: 9, craft: 9, clarity: 9, performance: 9 },
    boots: true,
    copy: "A quiet farm page.",
    sections: [
      {
        page: "home",
        section: "story",
        score: 9,
        reason: "The image has warped text.",
        textOnly: false,
        todoImage: false,
        placeholderImage: false,
        slop: "warped text in an image",
      },
    ],
  };
  const scored = await scoreSections(
    [{ page: "home", section: "story", screenshot: ".hitchhiker/review/home-story.png" }],
    [".hitchhiker/review/home-story.png"],
    async (request) => {
      seenRequest.push(request);
      return { value, raw: JSON.stringify(value), durationMs: 1, cassette: "hit" };
    },
  );
  assert.equal(seenRequest[0]?.task, "zaphod-vision");
  assert.equal(seenRequest[0]?.model, "grok-4.7-build-fast");
  assert.equal(seenRequest[0]?.effort, "xhigh");
  const judged = judgeBeauty(scored);
  assert.equal(judged.pass, false);
  assert.match(judged.failures[0]?.reason ?? "", /warped text/);
});
