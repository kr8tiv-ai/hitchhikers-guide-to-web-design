/**
 * Babel Fish live modules. The model is a scripted think(), then a cassette
 * replay through the real think() adapter. Towel and Tea is the fixture.
 * Cassettes are written into a temp directory so the hash matches the prompt.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cassetteKey, writeCassette } from "../src/ai/cassette.ts";
import { think, type ThinkRequest, type ThinkResult } from "../src/ai/think.ts";
import { defaultConfig } from "../src/config.ts";
import { questionCount } from "../src/guide/validators.ts";
import type { GuideSession } from "../src/guide/live-turn.ts";
import type { AnswerRecord } from "../src/required.ts";
import { countWords } from "../src/brand/story.ts";
import { lintClaims, evidenceFromAnswers } from "../src/brand/truth.ts";
import { selectTaglines } from "../src/brand/voice.ts";
import { compileWhy } from "../src/brand/why.ts";
import {
  ApprovalError,
  readApprovals,
  recordDraftItems,
  redraftRejectedItem,
  setApproval,
} from "../src/brand/live/approve.ts";
import { runDiscovery } from "../src/brand/live/discovery.ts";
import { draftPositioning } from "../src/brand/live/positioning.ts";
import {
  CompetitorSloganError,
  LiveShapeError,
  TAGLINE_STYLES,
  type BrandFacts,
} from "../src/brand/live/schemas.ts";
import { StoryLengthError, draftStory, storyLimits } from "../src/brand/live/story.ts";
import { TaglineCountError, draftTaglines } from "../src/brand/live/taglines.ts";
import { draftVoiceKit } from "../src/brand/live/voice-kit.ts";
import { runWhyFinder } from "../src/brand/live/why-finder.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const WHY = "To keep a kettle on so that a night regular can sit down after the shift.";
const HOW = "Stay open late. Name the tea. Leave a seat.";
const WHAT = "The stall exists so a regular can find tea after a late shift.";
const VISITOR = "a night regular";
const OFFER = "a tin of tea";
const SLOGAN = "Just add water";
const STEAM = "Steam is the sign";
const INK = "#1c1612";
const PAPER = "#f3ebdd";

const NOUNS = [
  "Kettle",
  "Stall",
  "Seat",
  "Tin",
  "Steam",
  "Towel",
  "Cup",
  "Shift",
  "Pour",
  "Mug",
  "Leaf",
  "Pot",
  "Tray",
  "Bench",
  "Lamp",
  "Stool",
  "Door",
  "Sign",
  "Mat",
  "Jar",
  "Lid",
  "Spoon",
  "Bowl",
  "Cloth",
  "Wick",
  "Coaster",
  "Napkin",
  "Saucer",
  "Thermos",
  "Caddy",
] as const;

const BANK = ["The", "stall", "keeps", "tea", "for", "a", "night", "regular", "who", "sits"] as const;

interface Fixture {
  tagline: "ok" | "short" | "repair" | "slogan";
  story: "ok" | "long" | "short";
  positioning: "ok" | "slogan";
  origin: "ok" | "bad";
  whyQuestions: number;
  taglineCalls: number;
  rankCalls: number;
  storyCalls: number;
  positioningCalls: number;
  redraftInputs: string[];
  tasks: string[];
}

function fixture(partial: Partial<Fixture> = {}): Fixture {
  return {
    tagline: "ok",
    story: "ok",
    positioning: "ok",
    origin: "ok",
    whyQuestions: 0,
    taglineCalls: 0,
    rankCalls: 0,
    storyCalls: 0,
    positioningCalls: 0,
    redraftInputs: [],
    tasks: [],
    ...partial,
  };
}

function prose(count: number): string {
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    words.push(BANK[index % BANK.length] ?? "tea");
  }
  return words.join(" ");
}

function towelAnswers(extra: AnswerRecord[] = []): AnswerRecord[] {
  return [
    { id: "DP-2.1", status: "ANSWERED", value: WHAT },
    { id: "DP-2.6", status: "ANSWERED", value: VISITOR },
    { id: "DP-2.7", status: "ANSWERED", value: OFFER },
    { id: "DP-1.7", status: "ANSWERED", value: WHY },
    { id: "DP-5.3", status: "ANSWERED", value: "warm, quiet, specific, never loud, cute, corporate" },
    ...extra,
  ];
}

function crawlReport(): string {
  return ["No shared title pattern", `- H1: ${SLOGAN}`, "- Title: Night stall tea", "A long menu note about leaves."].join("\n");
}

function facts(dir: string, answers: AnswerRecord[], extra: Partial<BrandFacts> = {}): BrandFacts {
  return {
    name: "Towel & Tea",
    answers,
    competitorSlogans: [SLOGAN],
    competitorReport: crawlReport(),
    hasStory: true,
    ink: INK,
    paper: PAPER,
    projectDir: dir,
    ...extra,
  };
}

function session(dir: string): GuideSession {
  return { projectDir: dir, depth: "deep", language: "en", pushes: {} };
}

function tempProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brand-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  return dir;
}

function writeInterview(dir: string, answers: AnswerRecord[]): void {
  const file = path.join(dir, ".hitchhiker", "interview.json");
  writeFileSync(file, `${JSON.stringify({ version: 1, answers, cursor: 0, pushedIds: [] }, null, 2)}\n`, "utf8");
}

function taglineText(index: number, sloganAt: number | null): string {
  if (sloganAt === index) return SLOGAN;
  if (index === 1) return STEAM;
  const noun = NOUNS[index] ?? "Tea";
  return `${noun} stays late`;
}

function taglinePayload(count: number, sloganAt: number | null): { taglines: { style: string; text: string }[] } {
  const taglines: { style: string; text: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const style = TAGLINE_STYLES[Math.floor(index / 5)] ?? TAGLINE_STYLES[0];
    taglines.push({ style, text: taglineText(index, sloganAt) });
  }
  return { taglines };
}

function topFive(lines: readonly { text: string }[]): { top5: { text: string; reason: string }[] } {
  const picks = [0, 2, 4, 6, 8];
  return {
    top5: picks.map((index) => {
      const text = lines[index]?.text ?? "";
      return { text, reason: "It names the stall and stays plain." };
    }),
  };
}

function storyPayload(mode: Fixture["story"]): { s25: string; s100: string; s300: string } {
  const s25 = mode === "long" ? prose(40) : mode === "short" ? prose(5) : prose(25);
  return { s25, s100: prose(100), s300: prose(300) };
}

function positioningPayload(mode: Fixture["positioning"]): unknown {
  const positioning =
    mode === "slogan"
      ? SLOGAN
      : "For a night regular, Towel and Tea is the a tin of tea that stays warm after the shift.";
  return {
    archetype: "Caregiver",
    positioning,
    persona: {
      name: "Nia",
      summary: "Nia finishes a late shift and wants a tin of tea before the walk home.",
    },
    nonCustomers: ["A morning commuter", "A cafe owner", "A tea wholesaler"],
  };
}

function briefPayload(): unknown {
  return {
    business: "The stall keeps tea for a night regular who sits after the shift.",
    why: WHY,
    customer: "A night regular who wants a tin of tea and a place to sit.",
    competitors: "Nearby stalls pour the same pale cup and share one title shape.",
    personality: "Warm, quiet, and specific.",
    visual: "Paper, ink, and a small lamp on the counter.",
    musts: "Say the tea. Leave a seat. Skip the hype.",
    open: "The hours after midnight are still open.",
    risks: [
      "The kettle can go cold before the shift ends.",
      "A regular can miss the stall in the dark.",
      "The tin can sit unsold on a quiet night.",
    ],
  };
}

function voicePayload(): unknown {
  return {
    traits: [
      { this: "Warm", not: "loud" },
      { this: "Quiet", not: "cute" },
      { this: "Specific", not: "seamless" },
    ],
    use: ["kettle", "tin", "stall"],
    never: ["loud", "cute", "corporate"],
    microcopy: {
      button: "Order the tin",
      error: "That did not send. Try again.",
      empty: "Nothing is listed yet.",
      notFound: "This page is not here.",
    },
  };
}

function answerFor(fx: Fixture, req: ThinkRequest<unknown>): unknown {
  fx.tasks.push(req.task);
  if (req.task === "brand-why-question") {
    const circle = (["why", "how", "what"] as const)[fx.whyQuestions % 3] ?? "why";
    fx.whyQuestions += 1;
    return {
      question: `What does the ${circle} look like on a late night at the stall?`,
      circle,
    };
  }
  if (req.task === "brand-why-compile") return { why: WHY, how: HOW, what: WHAT };
  if (req.task === "brand-discovery-question") {
    return { question: "What is still unknown about this field?" };
  }
  if (req.task === "brand-discovery-brief") return briefPayload();
  if (req.task === "brand-positioning") {
    fx.positioningCalls += 1;
    return positioningPayload(fx.positioning);
  }
  if (req.task === "brand-story-origin") {
    if (fx.origin === "bad") return { questions: ["No question here", "Still none"] };
    return {
      questions: [
        "What specific moment made the kettle matter?",
        "Who was in the stall on that first late night?",
      ],
    };
  }
  if (req.task === "brand-story") {
    fx.storyCalls += 1;
    return storyPayload(fx.story);
  }
  if (req.task === "brand-voice") return voicePayload();
  if (req.task === "brand-taglines") {
    fx.taglineCalls += 1;
    const sloganAt = fx.tagline === "slogan" ? 4 : null;
    if (fx.tagline === "short") return taglinePayload(29, null);
    if (fx.tagline === "repair" && fx.taglineCalls === 1) return taglinePayload(29, null);
    return taglinePayload(30, sloganAt);
  }
  if (req.task === "brand-tagline-rank") {
    fx.rankCalls += 1;
    return topFive(taglinePayload(30, null).taglines);
  }
  if (req.task === "brand-item-redraft") {
    fx.redraftInputs.push(req.input);
    return { text: "Kettle stays on" };
  }
  throw new Error(`Unexpected think task: ${req.task}`);
}

function scripted(fx: Fixture): typeof think {
  const wrapped = async <T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    const value = answerFor(fx, req) as T;
    return { value, raw: JSON.stringify(value), durationMs: 1, cassette: "live" };
  };
  return wrapped as typeof think;
}

function replayThink(fx: Fixture, projectDir: string, cassetteDir: string): typeof think {
  const wrapped = async <T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    const value = answerFor(fx, req);
    const model = defaultConfig().ai.model;
    const key = cassetteKey({
      task: req.task,
      model,
      effort: "medium",
      schema: req.schema ?? null,
      input: req.input,
    });
    writeCassette(cassetteDir, {
      task: req.task,
      model,
      effort: "medium",
      key,
      result: value,
      raw: JSON.stringify(value),
      durationMs: 4,
    });
    return think(req, {
      projectDir,
      cassetteDir,
      config: defaultConfig(),
      env: { HH_CASSETTE: "replay", PATH: "" },
      spawnImpl: () => {
        throw new Error("replay must not spawn grok");
      },
      now: () => 1_000,
    });
  };
  return wrapped as typeof think;
}

function assertNoClaims(text: string, answers: readonly AnswerRecord[]): void {
  const lint = lintClaims(text, evidenceFromAnswers([...answers]));
  assert.equal(lint.ok, true, JSON.stringify(lint.hits));
}

function sequentialAsk(into: string[]): (q: string) => Promise<string> {
  let busy = false;
  return async (q: string) => {
    assert.equal(busy, false, "a second question was asked before the first answer");
    assert.equal(questionCount(q), 1);
    busy = true;
    into.push(q);
    await Promise.resolve();
    busy = false;
    return "The kettle stays on for the night regular.";
  };
}

test("Why Finder asks at least 12 questions, one at a time, then compileWhy shapes the why", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  writeInterview(dir, answers);
  const before = readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8");
  const fx = fixture();
  const asked: string[] = [];
  try {
    const result = await runWhyFinder(session(dir), { think: scripted(fx), ask: sequentialAsk(asked) });
    assert.ok(asked.length >= 12);
    assert.equal(asked.length, 12);
    assert.equal(result.transcript.length, 24);
    assert.deepEqual(
      fx.tasks.slice(0, 12),
      Array.from({ length: 12 }, () => "brand-why-question"),
    );
    assert.equal(fx.tasks[12], "brand-why-compile");
    assert.equal(fx.whyQuestions, 12);
    assert.ok(asked.some((question) => question.includes("why")));
    assert.ok(asked.some((question) => question.includes("how")));
    assert.ok(asked.some((question) => question.includes("what")));
    assert.match(result.why, /\bso that\b/i);
    assert.equal(result.why, compileWhy([...answers, { id: "DP-1.7", status: "ANSWERED", value: WHY }]).brandWhy);
    assert.equal(result.how, HOW);
    assert.equal(result.what, WHAT);
    assertNoClaims([result.why, result.how, result.what].join("\n"), answers);
    const saved = await readApprovals(dir);
    for (const id of ["why", "how", "what"]) {
      const item = saved.items.find((entry) => entry.itemId === id);
      assert.ok(item, id);
      assert.equal(item.status, "pending");
    }
    assert.equal(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discovery asks only SOFT and ASSUMED fields, one at a time", async () => {
  const dir = tempProject();
  const answers = towelAnswers([
    { id: "DP-3.2", status: "SKIPPED", value: "ASSUMED: the late hours" },
    { id: "DP-5.9", status: "SOFT", value: "maybe quiet" },
    { id: "DP-6.1", status: "ANSWERED", value: prose(20) },
  ]);
  writeInterview(dir, answers);
  const before = readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8");
  const fx = fixture();
  const asked: string[] = [];
  try {
    const result = await runDiscovery(session(dir), { think: scripted(fx), ask: sequentialAsk(asked) });
    assert.deepEqual(result.askedIds, ["DP-3.2", "DP-5.9"]);
    assert.equal(result.askedIds.includes("DP-6.1"), false);
    assert.equal(result.askedIds.includes("DP-1.7"), false);
    assert.equal(result.askedIds.includes("DP-2.1"), false);
    assert.equal(asked.length, 2);
    assert.equal(fx.tasks.filter((task) => task === "brand-discovery-question").length, 2);
    assert.equal(fx.tasks.filter((task) => task === "brand-discovery-brief").length, 1);
    assert.match(result.markdown, /so that/i);
    assert.equal(result.risks.length, 3);
    assertNoClaims(result.markdown, answers);
    const saved = await readApprovals(dir);
    for (const id of ["discovery", "risk:1", "risk:2", "risk:3"]) {
      assert.equal(saved.items.find((item) => item.itemId === id)?.status, "pending");
    }
    assert.equal(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("positioning keeps the grounded line, the 12-archetype label, and rejects a competitor slogan", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  try {
    const ok = fixture();
    const draft = await draftPositioning(facts(dir, answers), { think: scripted(ok) });
    assert.equal(draft.archetype, "caretaker");
    assert.equal(draft.archetypeStatus, "ASSUMED");
    assert.match(draft.positioning.toLowerCase(), /a night regular/);
    assert.match(draft.positioning.toLowerCase(), /a tin of tea/);
    assert.equal(draft.nonCustomers.length, 3);
    assert.match(draft.teardownMarkdown, /Sameness/);
    assertNoClaims(
      [draft.archetype, draft.positioning, draft.persona.name, draft.persona.summary, draft.teardownMarkdown].join("\n"),
      answers,
    );
    assert.equal(ok.positioningCalls, 1);

    const bad = fixture({ positioning: "slogan" });
    await assert.rejects(
      () => draftPositioning(facts(dir, answers, { projectDir: undefined }), { think: scripted(bad) }),
      (error: unknown) => {
        assert.ok(error instanceof CompetitorSloganError);
        assert.match(error.message, /Just add water/);
        return true;
      },
    );
    assert.equal(bad.positioningCalls, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("story lengths stay inside the window, clip overflow, and ask two origin questions", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  const brand = facts(dir, answers);
  try {
    const limits25 = storyLimits(25);
    const limits100 = storyLimits(100);
    const limits300 = storyLimits(300);
    assert.equal(limits25.min, 23);
    assert.equal(limits25.max, 27);
    assert.equal(limits100.min, 90);
    assert.equal(limits100.max, 110);
    assert.equal(limits300.min, 270);
    assert.equal(limits300.max, 315);

    const ok = fixture();
    const story = await draftStory(brand, { think: scripted(ok) });
    assert.equal(countWords(story.s25), 25);
    assert.equal(countWords(story.s100), 100);
    assert.equal(countWords(story.s300), 300);
    assertNoClaims([story.s25, story.s100, story.s300].join("\n"), answers);
    assert.equal(ok.tasks.includes("brand-story-origin"), false);

    const long = fixture({ story: "long" });
    const clipped = await draftStory(brand, { think: scripted(long) });
    assert.equal(countWords(clipped.s25), limits25.max);
    assert.equal(clipped.s25, prose(40).split(/\s+/).slice(0, limits25.max).join(" "));
    assert.equal(long.storyCalls, 2);

    const short = fixture({ story: "short" });
    await assert.rejects(
      () => draftStory(brand, { think: scripted(short) }),
      (error: unknown) => {
        assert.ok(error instanceof StoryLengthError);
        assert.equal(error.target, 25);
        assert.equal(error.count, 5);
        return true;
      },
    );
    assert.equal(short.storyCalls, 2);

    const originFx = fixture();
    const originAsked: string[] = [];
    const withOrigin = await draftStory(facts(dir, answers, { hasStory: false }), {
      think: scripted(originFx),
      ask: sequentialAsk(originAsked),
    });
    assert.equal(originAsked.length, 2);
    assert.equal(questionCount(originAsked[0] ?? ""), 1);
    assert.equal(questionCount(originAsked[1] ?? ""), 1);
    assert.equal(originFx.tasks[0], "brand-story-origin");
    assert.equal(originFx.tasks[1], "brand-story");
    assert.equal(countWords(withOrigin.s25), 25);

    const missing = fixture();
    await assert.rejects(
      () => draftStory(facts(dir, answers, { hasStory: false }), { think: scripted(missing) }),
      (error: unknown) => {
        assert.ok(error instanceof LiveShapeError);
        assert.match(error.message, /two origin/);
        return true;
      },
    );
    assert.equal(missing.tasks.includes("brand-story"), false);

    const fallback = fixture({ origin: "bad" });
    const fallbackAsked: string[] = [];
    await draftStory(facts(dir, answers, { hasStory: false }), {
      think: scripted(fallback),
      ask: async (q: string) => {
        fallbackAsked.push(q);
        return "A kettle on the first late night.";
      },
    });
    assert.deepEqual(fallbackAsked, [
      "What specific moment made you start, and who was there?",
      "What was the turning point, in one concrete day?",
    ]);
    assert.equal(fallback.tasks.filter((task) => task === "brand-story-origin").length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("voice kit is shaped by renderVoice and still passes lintClaims", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  const fx = fixture();
  try {
    const kit = await draftVoiceKit(facts(dir, answers), { think: scripted(fx) });
    assert.match(kit.markdown, /Warm/);
    assert.match(kit.markdown, /## Banned words/);
    assert.match(kit.markdown, /unlock/);
    assert.match(kit.markdown, /Order a tin of tea/);
    assert.equal(kit.banned.includes("unlock"), true);
    assert.equal(kit.assumed, false);
    assert.equal(kit.traits.length, 3);
    assertNoClaims(kit.markdown, answers);
    assert.equal(fx.tasks.filter((task) => task === "brand-voice").length, 1);
    const saved = await readApprovals(dir);
    for (const id of ["voice:trait:1", "voice:banned", "voice:microcopy:button"]) {
      assert.equal(saved.items.find((item) => item.itemId === id)?.status, "pending");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("taglines return 30 across 6 styles, cut to a top 5, and repair a short list once", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  try {
    const ok = fixture();
    const cut = await draftTaglines(facts(dir, answers), { think: scripted(ok) });
    assert.equal(cut.all.length, 30);
    for (const style of TAGLINE_STYLES) {
      assert.equal(cut.all.filter((line) => line.style === style).length, 5);
    }
    const seen = new Set<string>();
    for (const line of cut.all) {
      const kept = selectTaglines([line.text]);
      assert.equal(kept.taglines.length, 1);
      assert.equal(kept.taglines[0], line.text);
      assert.equal(seen.has(line.text.toLowerCase()), false);
      seen.add(line.text.toLowerCase());
    }
    assert.equal(cut.top5.length, 5);
    const pool = new Set(cut.all.map((line) => line.text.toLowerCase()));
    for (const line of cut.top5) {
      assert.equal(pool.has(line.text.toLowerCase()), true);
      assert.ok(line.reason.trim() !== "");
    }
    const ranked = selectTaglines(cut.top5.map((line) => line.text));
    assert.equal(ranked.shortfall, false);
    assert.equal(ranked.taglines.length, 5);
    assertNoClaims(
      [...cut.all.map((line) => line.text), ...cut.top5.map((line) => line.reason)].join("\n"),
      answers,
    );
    assert.equal(ok.taglineCalls, 1);
    assert.equal(ok.rankCalls, 1);
    const saved = await readApprovals(dir);
    const taglineItems = saved.items.filter((item) => item.kind === "tagline");
    const topItems = saved.items.filter((item) => item.kind === "tagline-top");
    assert.equal(taglineItems.length, 30);
    assert.equal(topItems.length, 5);
    assert.equal(new Set(saved.items.map((item) => item.itemId)).size, saved.items.length);

    const repaired = fixture({ tagline: "repair" });
    const afterRepair = await draftTaglines(facts(dir, answers), { think: scripted(repaired) });
    assert.equal(afterRepair.all.length, 30);
    assert.equal(repaired.taglineCalls, 2);
    assert.equal(repaired.rankCalls, 1);

    const short = fixture({ tagline: "short" });
    await assert.rejects(
      () => draftTaglines(facts(dir, answers, { projectDir: undefined }), { think: scripted(short) }),
      (error: unknown) => {
        assert.ok(error instanceof TaglineCountError);
        assert.match(error.message, /29/);
        assert.match(error.message, /30/);
        return true;
      },
    );
    assert.equal(short.taglineCalls, 2);
    assert.equal(short.rankCalls, 0);

    const slogan = fixture({ tagline: "slogan" });
    await assert.rejects(
      () =>
        draftTaglines(
          facts(dir, answers, { projectDir: undefined, competitorSlogans: [], competitorReport: crawlReport() }),
          { think: scripted(slogan) },
        ),
      (error: unknown) => {
        assert.ok(error instanceof CompetitorSloganError);
        assert.match(error.message, /Just add water/);
        return true;
      },
    );
    assert.equal(slogan.taglineCalls, 2);
    assert.equal(slogan.rankCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejecting one tagline re-drafts only that item", async () => {
  const dir = tempProject();
  const answers = towelAnswers();
  const fx = fixture();
  try {
    const cut = await draftTaglines(facts(dir, answers), { think: scripted(fx) });
    const target = cut.all.find((line) => line.text !== STEAM);
    assert.ok(target);
    const targetId = (await readApprovals(dir)).items.find((item) => item.kind === "tagline" && item.text === target.text)?.itemId;
    assert.ok(targetId);
    assert.notEqual(target.text, STEAM);
    const steam = (await readApprovals(dir)).items.find((item) => item.text === STEAM);
    assert.ok(steam);

    await assert.rejects(
      () => setApproval(dir, "missing-line", "rejected", "Say the steam."),
      (error: unknown) => error instanceof ApprovalError,
    );

    await setApproval(dir, targetId, "rejected");
    await assert.rejects(
      () => redraftRejectedItem(dir, targetId, facts(dir, answers), { think: scripted(fx) }),
      (error: unknown) => {
        assert.ok(error instanceof ApprovalError);
        assert.match(error.message, /note/);
        return true;
      },
    );
    assert.equal(fx.redraftInputs.length, 0);

    await setApproval(dir, steam.itemId, "approved");
    await recordDraftItems(dir, [{ itemId: steam.itemId, kind: "tagline", text: STEAM, style: steam.style, status: "pending" }]);
    assert.equal((await readApprovals(dir)).items.find((item) => item.itemId === steam.itemId)?.status, "approved");

    const note = "Say the kettle, not the stall.";
    await setApproval(dir, targetId, "rejected", note);
    const before = await readApprovals(dir);
    const updated = await redraftRejectedItem(dir, targetId, facts(dir, answers), { think: scripted(fx) });
    assert.equal(updated.itemId, targetId);
    assert.equal(updated.text, "Kettle stays on");
    assert.equal(updated.status, "pending");
    assert.equal(updated.note, note);
    assert.equal(fx.redraftInputs.length, 1);
    const input = fx.redraftInputs[0] ?? "";
    assert.match(input, new RegExp(targetId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(input, /Say the kettle, not the stall/);
    assert.equal(input.includes(STEAM), false);
    const after = await readApprovals(dir);
    for (const item of before.items) {
      const next = after.items.find((entry) => entry.itemId === item.itemId);
      assert.ok(next);
      if (item.itemId === targetId) {
        assert.equal(next.text, "Kettle stays on");
        assert.equal(next.status, "pending");
        continue;
      }
      assert.equal(next.text, item.text);
      assert.equal(next.status, item.status);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("low contrast fails before a model call", async () => {
  const fx = fixture();
  await assert.rejects(
    () =>
      draftTaglines(
        facts("", towelAnswers(), { projectDir: undefined, ink: "#ffffff", paper: "#ffffff" }),
        { think: scripted(fx) },
      ),
    (error: unknown) => error instanceof LiveShapeError,
  );
  assert.equal(fx.tasks.length, 0);
});

test("cassette replay on Towel and Tea runs every live module with zero lintClaims hits", async () => {
  const dir = tempProject();
  const cassetteDir = mkdtempSync(path.join(tmpdir(), "hh-brand-cassette-"));
  const answers = towelAnswers([{ id: "DP-9.1", status: "SOFT", value: "hours are still soft" }]);
  writeInterview(dir, answers);
  const fx = fixture();
  const asked: string[] = [];
  const thinkFn = replayThink(fx, dir, cassetteDir);
  try {
    const why = await runWhyFinder(session(dir), { think: thinkFn, ask: sequentialAsk(asked) });
    const discovery = await runDiscovery(session(dir), { think: thinkFn, ask: sequentialAsk(asked) });
    const positioning = await draftPositioning(facts(dir, answers), { think: thinkFn });
    const story = await draftStory(facts(dir, answers), { think: thinkFn });
    const voice = await draftVoiceKit(facts(dir, answers), { think: thinkFn });
    const taglines = await draftTaglines(facts(dir, answers), { think: thinkFn });

    assert.ok(asked.length >= 12);
    assert.equal(why.transcript.length / 2 >= 12, true);
    assert.match(why.why, /\bso that\b/i);
    assert.deepEqual(discovery.askedIds, ["DP-9.1"]);
    assert.equal(positioning.archetype, "caretaker");
    assert.equal(positioning.archetypeStatus, "ASSUMED");
    assert.equal(countWords(story.s25) >= storyLimits(25).min && countWords(story.s25) <= storyLimits(25).max, true);
    assert.equal(countWords(story.s100) >= storyLimits(100).min && countWords(story.s100) <= storyLimits(100).max, true);
    assert.equal(countWords(story.s300) >= storyLimits(300).min && countWords(story.s300) <= storyLimits(300).max, true);
    assert.equal(taglines.all.length, 30);
    assert.equal(taglines.top5.length, 5);
    assert.match(voice.markdown, /## Banned words/);

    const blob = [
      why.why,
      why.how,
      why.what,
      discovery.markdown,
      positioning.positioning,
      positioning.persona.summary,
      positioning.teardownMarkdown,
      story.s25,
      story.s100,
      story.s300,
      voice.markdown,
      ...taglines.all.map((line) => line.text),
      ...taglines.top5.map((line) => `${line.text} ${line.reason}`),
    ].join("\n");
    assertNoClaims(blob, answers);

    const saved = await readApprovals(dir);
    for (const id of ["why", "how", "what", "discovery", "archetype", "positioning", "persona", "story:25", "story:100", "story:300", "voice:trait:1", "tagline-top:1"]) {
      const item = saved.items.find((entry) => entry.itemId === id);
      assert.ok(item, id);
      assert.equal(item.status, "pending");
    }
    assert.equal(saved.items.filter((item) => item.kind === "tagline").length, 30);
    assert.equal(fx.tasks.includes("brand-story-origin"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cassetteDir, { recursive: true, force: true });
  }
});

test("approve cards give every item its own approve and reject", () => {
  const dir = tempProject();
  const script = path.join(dir, "cards-check.ts");
  const appFile = path.resolve(here, "..", "..", "app", "src", "brand", "approve-cards.ts");
  writeFileSync(path.join(dir, "package.json"), `${JSON.stringify({ type: "module" })}\n`, "utf8");
  writeFileSync(
    script,
    [
      'import { pathToFileURL } from "node:url";',
      "const target = process.argv[2];",
      "if (typeof target !== 'string' || target === '') throw new Error('missing module');",
      "const mod = await import(pathToFileURL(target).href);",
      "const items = [",
      "  { itemId: 'tagline:plain-and-true:1', kind: 'tagline', body: 'Kettle <script> stays', status: 'pending', note: 'Say steam' },",
      "  { itemId: 'why', kind: 'why', body: 'To keep a kettle on so that a night regular can sit.', status: 'approved' },",
      "  { itemId: 'how', kind: 'how', body: 'Stay open late.', status: 'rejected', note: 'Name the tea.' },",
      "];",
      "const html = mod.renderApproveCards(items);",
      "const empty = mod.renderApproveCards([]);",
      "const approve = html.split('data-approve=').length - 1;",
      "const reject = html.split('data-reject=').length - 1;",
      "if (approve !== 3 || reject !== 3) throw new Error('button count ' + approve + ' ' + reject);",
      "if (!html.includes('&lt;script&gt;')) throw new Error('script was not escaped');",
      "if (html.includes('<script')) throw new Error('raw script tag');",
      "if (!html.includes('Pending') || !html.includes('Approved') || !html.includes('Rejected')) throw new Error('status labels');",
      "if (!empty.includes('Nothing is waiting for a yes. When a line is drafted, it lands on this desk.')) throw new Error('empty copy');",
      "if (html.includes('!') || empty.includes('!')) throw new Error('exclamation');",
      "const decisions = [];",
      "const notes = new Map([['tagline:plain-and-true:1', 'too loud']]);",
      "const root = {",
      "  innerHTML: '',",
      "  querySelector(selector) {",
      "    const match = /data-note=\"([^\"]+)\"/.exec(selector);",
      "    const id = match?.[1] ?? '';",
      "    return { getAttribute() { return null; }, value: notes.get(id) ?? '' };",
      "  },",
      "  addEventListener(type, listener) { this.listener = listener; },",
      "  removeEventListener() { this.listener = undefined; },",
      "};",
      "const unbind = mod.bindApproveDeck(root, items, (itemId, status, note) => decisions.push({ itemId, status, note }));",
      "root.listener({ target: { getAttribute(name) { return name === 'data-approve' ? 'why' : null; } }, preventDefault() {} });",
      "root.listener({ target: { getAttribute(name) { return name === 'data-reject' ? 'tagline:plain-and-true:1' : null; } }, preventDefault() {} });",
      "unbind();",
      "if (decisions.length !== 2) throw new Error('decisions ' + decisions.length);",
      "if (decisions[0].status !== 'approved' || decisions[0].itemId !== 'why') throw new Error('approve path');",
      "if (decisions[1].status !== 'rejected' || decisions[1].note !== 'too loud') throw new Error('reject path');",
      "const page = [",
      "'<!doctype html><html><head><meta charset=\"utf-8\">',",
      "'<link rel=\"stylesheet\" href=\"' + " + JSON.stringify(pathToFileUrlCss(path.resolve(here, "..", "..", "app", "src", "design", "tokens.css"))) + " + '\">',",
      "'<link rel=\"stylesheet\" href=\"' + " + JSON.stringify(pathToFileUrlCss(path.resolve(here, "..", "..", "app", "src", "design", "components.css"))) + " + '\">',",
      "'</head><body style=\"margin:0;background:var(--color-surface);color:var(--color-ink)\">' + html + empty + '</body></html>',",
      "].join('');",
      "process.stdout.write(JSON.stringify({ ok: true, html, empty, page }));",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", script, appFile], {
      encoding: "utf8",
      cwd: dir,
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; page: string };
    assert.equal(parsed.ok, true);
    writeFileSync(path.join(dir, "approve-cards.html"), parsed.page, "utf8");
    const kept = path.join(tmpdir(), "hh-approve-cards.html");
    writeFileSync(kept, parsed.page, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function pathToFileUrlCss(file: string): string {
  return pathToFileURL(file).href;
}
