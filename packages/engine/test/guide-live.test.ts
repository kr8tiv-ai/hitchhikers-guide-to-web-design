import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CassetteMissError } from "../src/ai/cassette.ts";
import { GrokUnavailableError } from "../src/ai/grok-cli.ts";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { briefLoop } from "../src/guide/brief-loop.ts";
import {
  CALM_MESSAGE,
  guideThinkFromScript,
  runTurn,
  seedExpressAssumptions,
  type GuideSession,
  type GuideTurn,
} from "../src/guide/live-turn.ts";
import { mirrorCue } from "../src/guide/mirror.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import type { Facts } from "../src/guide/schemas.ts";
import {
  defaultGalleryFile,
  loadFacts,
  loadGallery,
  referenceCards,
  suggest,
} from "../src/guide/suggest.ts";
import { validateGuideMessage } from "../src/guide/validators.ts";
import { openInterview } from "../src/interview.ts";
import { pushbackFor } from "../src/pushback.ts";
import type { Question } from "../src/tree.ts";

const cassetteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "cassettes", "guide");

const towelQuestion: Question = {
  id: "DP-0.2",
  module: "towel-check",
  depth: ["deep"],
  ask: "What came before this shop site?",
  why: "A prior page tells us what to keep.",
  input: ["text"],
  skipDefault: "No prior site.",
  writes: ["PROJECT.md#history"],
  pushbackIf: ["it's fine"],
};

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(
  fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>,
): typeof think {
  return fn as typeof think;
}

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-guide-"));
}

function writeTree(projectDir: string, file = path.join(cassetteDir, "tree.yaml")): void {
  const dir = path.join(projectDir, "interview");
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, path.join(dir, "tree.yaml"));
}

function sessionFor(projectDir: string, depth: GuideSession["depth"] = "deep"): GuideSession {
  return { projectDir, depth, language: "en", pushes: {} };
}

test("mirror cadence is every eight, and module end is a different next module", () => {
  assert.equal(mirrorCue(8, "towel-check", "towel-check"), "cadence");
  assert.equal(mirrorCue(3, "towel-check", "taste"), "module");
  assert.equal(mirrorCue(8, "towel-check", null), "both");
  assert.equal(mirrorCue(7, "towel-check", "towel-check"), null);
});

test("the phrase floor pushes even when the model says the answer is concrete", async () => {
  const model = asThink(async () => hit({ vague: false, quote: "", sharperChoice: "" }));
  const judgement = await judgePushback(towelQuestion, "it's fine", 0, { think: model });
  assert.equal(judgement.action, "push");
  assert.equal(judgement.floor, true);
  assert.equal(judgement.count, 1);
});

test("a model failure still pushes on the phrase floor", async () => {
  const model = asThink(async () => {
    throw new Error("down");
  });
  const judgement = await judgePushback(towelQuestion, "it's fine", 0, { think: model });
  assert.equal(judgement.action, "push");
  assert.equal(judgement.count, 1);
});

test("a concrete answer is accepted", async () => {
  const model = asThink(async () => hit({ vague: false, quote: "", sharperChoice: "" }));
  const judgement = await judgePushback(towelQuestion, "A tin shop on the corner.", 0, { think: model });
  assert.equal(judgement.action, "accept");
  assert.equal(judgement.count, 0);
});

test("soft, soft, soft gives two pushes and then SOFT", async () => {
  const model = asThink(async () =>
    hit({
      vague: true,
      quote: "it's fine",
      sharperChoice: "You wrote that it is fine. What is one concrete detail the shop site should keep?",
    }),
  );
  let count = 0;
  const actions: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const judgement = await judgePushback(towelQuestion, "it's fine", count, { think: model });
    actions.push(judgement.action);
    count = judgement.count;
  }
  assert.deepEqual(actions, ["push", "push", "soft"]);
  assert.equal(count, 2);
});

test("a model-only vague answer is stored as SOFT after two pushes", async () => {
  const projectDir = tempProject();
  const text = "The pages can wait until the audience is clearer.";
  const question: Question = {
    id: "DP-0.1",
    module: "towel-check",
    depth: ["express", "standard", "deep"],
    ask: "Is this shop yours?",
    why: "The desk needs the name on the door.",
    input: ["text"],
    skipDefault: "The shop is theirs.",
    writes: ["PROJECT.md#owner"],
  };
  try {
    writePair(projectDir);
    assert.equal(pushbackFor(question, text), null);
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") {
        return hit({
          vague: true,
          quote: "The pages can wait",
          sharperChoice: "What is the one page this shop site should publish first?",
        });
      }
      if (req.task === "guide-message") {
        return hit({
          message: "What came before this shop site?",
          explanationLevel: "beginner",
          joke: false,
        });
      }
      throw new Error(`unexpected ${req.task}`);
    });
    const statuses: string[] = [];
    const ids: Array<string | null> = [];
    for (let index = 0; index < 3; index += 1) {
      const result = await runTurn(sessionFor(projectDir), { kind: "answer", text }, { think: model });
      statuses.push(result.status);
      ids.push(result.questionId);
    }
    assert.deepEqual(statuses, ["pushed", "pushed", "soft"]);
    assert.deepEqual(ids, ["DP-0.1", "DP-0.1", "DP-0.2"]);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    const stored = saved.answers.filter((answer) => answer.id === "DP-0.1");
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.status, "SOFT");
    assert.equal(stored[0]?.value, text);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("suggest drops an option that cites an upload which does not exist", async () => {
  const facts: Facts = { answers: [], uploads: ["tins.jpg"], crawlNotes: [], industry: "tea" };
  const model = asThink(async () =>
    hit({
      options: [
        { label: "Show the tin", why: "The tin is uploaded.", source: "upload:tins.jpg" },
        { label: "Show the missing tray", why: "The tray is not here.", source: "upload:tray.jpg" },
      ],
    }),
  );
  const options = await suggest("DP-2.1", facts, { think: model });
  assert.equal(options.length, 1);
  assert.equal(options[0]?.source, "upload:tins.jpg");
});

test("taste cards are two Godly and two Awwwards, and a shown url is excluded", () => {
  const entries = loadGallery(path.join(cassetteDir, "gallery.json"));
  const first = referenceCards(entries, { industry: "tea", limit: 4, exclude: [] });
  assert.equal(first.length, 4);
  assert.equal(first.filter((card) => card.source === "godly").length, 2);
  assert.equal(first.filter((card) => card.source === "awwwards").length, 2);
  assert.equal(first.some((card) => card.url.indexOf("/other/") !== -1), false);
  const second = referenceCards(entries, {
    industry: "tea",
    limit: 4,
    exclude: first.map((card) => card.url),
  });
  assert.equal(second.length, 0);
});

test("the curated pack does not backfill source other when Godly rows are absent", () => {
  const picked = referenceCards(loadGallery(defaultGalleryFile()), { limit: 4, exclude: [] });
  assert.equal(picked.filter((card) => card.source === "godly").length, 0);
  assert.ok(picked.length > 0 && picked.length <= 2);
  assert.ok(picked.every((card) => card.source === "awwwards"));
});

test("express writes ASSUMED for ids the mode does not ask", async () => {
  const projectDir = tempProject();
  try {
    const ids = await seedExpressAssumptions(projectDir);
    assert.ok(ids.includes("DP-0.5"));
    assert.ok(ids.includes("DP-7.2"));
    assert.equal(ids.includes("DP-0.1"), false);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string; value: string }>;
    };
    const hidden = saved.answers.find((answer) => answer.id === "DP-0.5");
    const budget = saved.answers.find((answer) => answer.id === "DP-7.2");
    assert.equal(hidden?.status, "SKIPPED");
    assert.equal(budget?.status, "SKIPPED");
    assert.match(hidden?.value ?? "", /^ASSUMED: /);
    assert.match(budget?.value ?? "", /No custom 3D generation budget/);
    assert.equal(saved.answers.some((answer) => answer.id === "DP-0.1"), false);
    const flagged = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "before-we-jump.json"), "utf8")) as {
      ids: string[];
    };
    assert.ok(flagged.ids.includes("DP-0.5"));
    assert.ok(flagged.ids.includes("DP-7.2"));
    await seedExpressAssumptions(projectDir);
    const again = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string }>;
    };
    assert.equal(again.answers.filter((answer) => answer.id === "DP-0.5").length, 1);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("express run skips an assumed id and asks the next one", async () => {
  const projectDir = tempProject();
  try {
    writeTree(projectDir, expressTree(projectDir));
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      if (req.task === "guide-message") {
        return hit({
          message: "How do you want to answer the rest of this shop?",
          explanationLevel: "beginner",
          joke: false,
        });
      }
      throw new Error(`unexpected ${req.task}`);
    });
    const session = sessionFor(projectDir, "express");
    const result = await runTurn(session, { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(result.questionId, "DP-0.6");
    assert.equal(result.calm, undefined);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; value: string }>;
    };
    assert.match(saved.answers.find((answer) => answer.id === "DP-0.5")?.value ?? "", /^ASSUMED: /);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("two questions are asked again once, then the valid line is kept", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    let guides = 0;
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      guides += 1;
      if (guides === 1) {
        return hit({ message: "Is this yours? Or is it theirs?", explanationLevel: "beginner", joke: false });
      }
      return hit({
        message: "How do you want to answer the rest of this shop?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const result = await runTurn(sessionFor(projectDir), { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(guides, 2);
    assert.match(result.message, /rest of this shop/);
    assert.equal(result.calm, undefined);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("two invalid guide messages fall back to the tree ask", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    let guides = 0;
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      guides += 1;
      return hit({ message: "Is this yours? Or is it theirs?", explanationLevel: "beginner", joke: false });
    });
    const result = await runTurn(sessionFor(projectDir), { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(guides, 2);
    assert.equal(result.calm, true);
    assert.equal(result.message, CALM_MESSAGE);
    assert.equal(result.questionId, "DP-0.2");
    const next = (await openInterview(projectDir, "deep")).next();
    assert.equal(next?.ask, "What came before this shop site?");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a cassette miss keeps the answer and the tree ask", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      throw new CassetteMissError("guide-message");
    });
    const result = await runTurn(sessionFor(projectDir), { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(result.calm, true);
    assert.equal(result.message, CALM_MESSAGE);
    assert.equal(result.questionId, "DP-0.2");
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string }>;
    };
    assert.equal(saved.answers.find((answer) => answer.id === "DP-0.1")?.status, "ANSWERED");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a scripted cassette miss is quiet and keeps the answer", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      throw new Error("cassette miss: guide-message #0");
    });
    const result = await runTurn(sessionFor(projectDir), { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(result.calm, true);
    assert.equal(result.questionId, "DP-0.2");
    assert.equal(result.message, CALM_MESSAGE);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("Grok unavailable keeps the answer and the tree ask", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      throw new GrokUnavailableError("quiet");
    });
    const result = await runTurn(sessionFor(projectDir), { kind: "answer", text: "The shop is mine." }, { think: model });
    assert.equal(result.calm, true);
    assert.equal(result.questionId, "DP-0.2");
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string }>;
    };
    assert.equal(saved.answers.find((answer) => answer.id === "DP-0.1")?.status, "ANSWERED");
    const next = (await openInterview(projectDir, "deep")).next();
    assert.equal(next?.id, "DP-0.2");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("an ACP string is the guide message, including one re-ask, without a guide think", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    const tasks: string[] = [];
    let prompts = 0;
    const model = asThink(async (req) => {
      tasks.push(req.task);
      return hit({ vague: false, quote: "", sharperChoice: "" });
    });
    const acp = {
      async prompt(): Promise<string> {
        prompts += 1;
        if (prompts === 1) {
          return JSON.stringify({
            message: "Is this yours? Or is it theirs?",
            explanationLevel: "beginner",
            joke: false,
          });
        }
        return JSON.stringify({
          message: "What should the shop be called?",
          explanationLevel: "beginner",
          joke: false,
        });
      },
    };
    const result = await runTurn(
      sessionFor(projectDir),
      { kind: "answer", text: "The shop is mine." },
      { think: model, acp },
    );
    assert.deepEqual(tasks, ["pushback-judge"]);
    assert.equal(prompts, 2);
    assert.equal(result.message, "What should the shop be called?");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("a Spanish answer is answered in Spanish", async () => {
  const projectDir = tempProject();
  try {
    writePair(projectDir);
    const session = sessionFor(projectDir);
    const model = asThink(async (req) => {
      if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
      return hit({
        message: "Que tipo de sitio quieres para la tienda?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const result = await runTurn(
      session,
      { kind: "answer", text: "Quiero una tienda para el sitio de te." },
      { think: model },
    );
    assert.equal(session.language, "es");
    assert.match(result.message, /sitio/);
    assert.equal(result.calm, undefined);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("ten Towel and Tea turns push twice, suggest four cards, and approve the brief", async () => {
  const projectDir = tempProject();
  try {
    writeTree(projectDir);
    mkdirSync(path.join(projectDir, ".hitchhiker", "uploads"), { recursive: true });
    writeFileSync(path.join(projectDir, ".hitchhiker", "uploads", "tins.jpg"), "");
    writeFileSync(
      path.join(projectDir, ".hitchhiker", "facts.json"),
      JSON.stringify({ industry: "tea", crawlNotes: ["menu"] }),
    );
    const model = guideThinkFromScript(readFileSync(path.join(cassetteDir, "turns.json"), "utf8"));
    const gallery = loadGallery(path.join(cassetteDir, "gallery.json"));
    const session = sessionFor(projectDir);
    const inputs: Array<{ kind: "answer" | "suggest"; text?: string }> = [
      { kind: "answer", text: "The shop is mine, Towel and Tea." },
      { kind: "answer", text: "it's fine" },
      { kind: "answer", text: "it's fine" },
      { kind: "answer", text: "it's fine" },
      { kind: "answer", text: "I have used a site builder for a menu page." },
      { kind: "answer", text: "A logo sketch and a photo of the tins." },
      { kind: "answer", text: "The site exists so a neighbor can order tea without calling." },
      { kind: "suggest" },
      { kind: "answer", text: "Warm paper, steam, and a quiet counter. Never neon, never loud, never generic." },
      { kind: "answer", text: "Calm, about a three, enough to feel considered." },
    ];
    const results: GuideTurn[] = [];
    for (const input of inputs) {
      const result = await runTurn(session, input.text === undefined ? { kind: input.kind } : input, {
        think: model,
        gallery,
      });
      results.push(result);
      if (result.calm !== true) {
        const issues = validateGuideMessage(result.message, { language: "en", facts: loadFacts(projectDir) });
        assert.deepEqual(issues, [], result.message);
      }
    }
    assert.equal(results[1]?.status, "pushed");
    assert.equal(results[2]?.status, "pushed");
    assert.equal(results[1]?.questionId, "DP-0.2");
    assert.equal(results[2]?.questionId, "DP-0.2");
    assert.equal(session.pushes["DP-0.2"], 2);
    assert.equal(results[3]?.status, "soft");
    assert.equal(results[3]?.questionId, "DP-0.3");
    const suggestTurn = results[7];
    assert.equal(suggestTurn?.cards?.length, 4);
    assert.equal(suggestTurn?.cards?.filter((card) => card.source === "godly").length, 2);
    assert.equal(suggestTurn?.cards?.filter((card) => card.source === "awwwards").length, 2);
    assert.equal(suggestTurn?.options?.length, 4);
    const done = results[9];
    assert.equal(done?.status, "done");
    assert.match(done?.message ?? "", /Here is what I heard/);
    assert.match(done?.message ?? "", /What did I get wrong\?/);
    const saved = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; status: string }>;
    };
    assert.equal(saved.answers.find((answer) => answer.id === "DP-0.2")?.status, "SOFT");
    const guide = JSON.parse(readFileSync(path.join(projectDir, ".hitchhiker", "guide-session.json"), "utf8")) as {
      shown: string[];
    };
    assert.equal(guide.shown.length, 4);

    const loop = briefLoop(session, { think: model });
    const draft = await loop.next();
    assert.equal(draft.value?.approved, false);
    const goal = draft.value?.draft.goal ?? "";
    const revised = await loop.next("The vibe should say warm paper.");
    assert.equal(revised.value?.approved, false);
    assert.equal(revised.value?.draft.goal, goal);
    assert.match(revised.value?.draft.vibe ?? "", /quieter than before/);
    const approved = await loop.next("approve");
    assert.equal(approved.value?.approved, true);
    const brief = readFileSync(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
    assert.match(brief, /# Site Brief/);
    assert.match(brief, /quieter than before/);
    assert.equal(brief.includes("!"), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

function writePair(projectDir: string): void {
  const file = path.join(projectDir, "pair.yaml");
  writeFileSync(file, PAIR_TREE, "utf8");
  writeTree(projectDir, file);
}

function expressTree(projectDir: string): string {
  const file = path.join(projectDir, "express.yaml");
  writeFileSync(file, EXPRESS_TREE, "utf8");
  return file;
}

const PAIR_TREE = `questions:
  - id: DP-0.1
    module: towel-check
    depth: [express, standard, deep]
    ask: "Is this shop yours?"
    why: "The desk needs the name on the door."
    input: [text]
    skip_default: "The shop is theirs."
    writes:
      - "PROJECT.md#owner"
  - id: DP-0.2
    module: towel-check
    depth: [express, standard, deep]
    ask: "What came before this shop site?"
    why: "A prior page tells us what to keep."
    input: [text]
    skip_default: "No prior site."
    writes:
      - "PROJECT.md#history"
`;

const EXPRESS_TREE = `questions:
  - id: DP-0.1
    module: towel-check
    depth: [express, standard, deep]
    ask: "Is this shop yours?"
    why: "The desk needs the name on the door."
    input: [text]
    skip_default: "The shop is theirs."
    writes:
      - "PROJECT.md#owner"
  - id: DP-0.5
    module: towel-check
    depth: [standard, deep]
    ask: "Want to connect your account?"
    why: "Express does not ask this."
    input: [text]
    skip_default: "No X connection."
    writes:
      - "VOICE.md#x"
  - id: DP-0.6
    module: towel-check
    depth: [express, standard, deep]
    ask: "Keyboard or mic?"
    why: "Either way the reply is text."
    input: [text]
    skip_default: "Keyboard."
    writes:
      - "PROJECT.md#input-mode"
`;
