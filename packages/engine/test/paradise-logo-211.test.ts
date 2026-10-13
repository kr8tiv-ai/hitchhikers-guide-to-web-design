/**
 * BUG-004. A file saved through the Logo file slot is a project asset with role logo.
 * Later interview, suggestion, and judge context name it by the original filename.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { loadFacts, suggest, suggestOffer } from "../src/guide/suggest.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import {
  assetDisplayName,
  assetNamedIn,
  choiceAllowed,
  gateQuestion,
  loadSessionState,
  offersForeignImageAsLogo,
  sessionBlock,
} from "../src/guide/session-state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

function writeLogoSlot(dir: string): void {
  const uploads = path.join(dir, ".hitchhiker", "uploads");
  mkdirSync(path.join(uploads, "DP-0.4"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker", "brand"), { recursive: true });
  writeFileSync(path.join(uploads, "hh-98860ac8-paradise-found-logo.png"), "logo");
  writeFileSync(
    path.join(uploads, "DP-0.4", "manifest.json"),
    JSON.stringify([
      { storedName: "paradise-found-mark.png", originalName: "paradise-found-mark.png" },
      { storedName: "paradise-found-hero.jpg", originalName: "paradise-found-hero.jpg" },
    ]),
    "utf8",
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "brand", "logo-intake.json"),
    JSON.stringify({
      safeName: "hh-98860ac8-paradise-found-logo.png",
      questionId: "DP-0.4",
      originalName: "paradise-found-logo.png",
      bytes: 4,
    }),
    "utf8",
  );
}

test("a logo-slot file is role logo under its original filename", () => {
  const all = loadTree(treeFile);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-logo-"));
  try {
    writeLogoSlot(dir);
    const state = loadSessionState(dir, all);
    const logo = state.uploads.find((file) => file.role === "logo");
    assert.ok(logo);
    assert.equal(logo.originalName, "paradise-found-logo.png");
    assert.equal(logo.questionId, "DP-0.4");
    assert.equal(assetDisplayName(logo.safeName, logo.originalName), "paradise-found-logo.png");
    const block = sessionBlock(state);
    assert.match(block, /paradise-found-logo\.png/);
    assert.match(block, /role logo/);
    const facts = loadFacts(dir);
    assert.equal(facts.uploads.includes("paradise-found-logo.png"), true);
    const gate = gateQuestion(byId(all, "DP-1.1"), state, all);
    assert.equal(gate.action, "confirm");
    assert.equal(gate.ask, "Using the logo you gave earlier (paradise-found-logo.png). Change?");
    const heroChoice = "A. Header logo is paradise-found-hero.jpg; favicon is paradise-found-mark.png";
    assert.equal(offersForeignImageAsLogo(heroChoice, state), true);
    assert.equal(choiceAllowed(heroChoice, state, all, false), false);
    assert.equal(
      assetNamedIn("Neither. Use paradise-found-logo.png, the full logo.", state)?.role,
      "logo",
    );
    assert.equal(
      assetNamedIn("Use hh-98860ac8-paradise-found-logo.png.", state)?.originalName,
      "paradise-found-logo.png",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an asset row that calls the hero a logo does not replace the logo slot", () => {
  const all = loadTree(treeFile);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-hero-"));
  try {
    writeLogoSlot(dir);
    writeFileSync(
      path.join(dir, ".hitchhiker", "ASSETS.md"),
      [
        "# Assets",
        "",
        "| Saved | Original | Role | Question | Status |",
        "| --- | --- | --- | --- | --- |",
        "| hh-98860ac8-paradise-found-logo.png | paradise-found-logo.png | logo | DP-0.4 | live |",
        "| DP-0.4/paradise-found-hero.jpg | paradise-found-hero.jpg | logo | DP-0.4 | live |",
        "",
      ].join("\n"),
      "utf8",
    );
    const state = loadSessionState(dir, all);
    const logos = state.uploads.filter((file) => file.role === "logo");
    assert.equal(logos.length, 1);
    assert.equal(logos[0]?.originalName, "paradise-found-logo.png");
    const gate = gateQuestion(byId(all, "DP-1.1"), state, all);
    assert.equal(gate.ask, "Using the logo you gave earlier (paradise-found-logo.png). Change?");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hashed logo slot without originalName still shows the leaf filename", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-peel-"));
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "brand"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "brand", "logo-intake.json"),
      JSON.stringify({ safeName: "hh-98860ac8-paradise-found-logo.png", questionId: "DP-0.4" }),
      "utf8",
    );
    const state = loadSessionState(dir);
    const logo = state.uploads.find((file) => file.role === "logo");
    assert.ok(logo);
    assert.equal(logo.originalName, "paradise-found-logo.png");
    assert.match(sessionBlock(state), /paradise-found-logo\.png \(paradise-found-logo\.png\) role logo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interview, suggest, and judge prompts name the logo-slot file", async () => {
  const all = loadTree(treeFile);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-prompt-"));
  try {
    writeLogoSlot(dir);
    const seen: string[] = [];
    const model = asThink(async (req) => {
      seen.push(`${req.task}\n${String(req.input)}`);
      if (req.task === "pushback-judge") {
        return hit({ vague: false, quote: "", sharperChoice: "" });
      }
      if (req.task === "suggest") {
        return hit({
          choices: [
            {
              id: "A",
              label: "Use paradise-found-logo.png",
              why: "It is the logo on file.",
              source: "upload:paradise-found-logo.png",
            },
            {
              id: "B",
              label: "Use paradise-found-mark.png",
              why: "It is the mark on file.",
              source: "upload:paradise-found-mark.png",
            },
          ],
        });
      }
      return hit({
        message: "Using the logo you gave earlier (paradise-found-logo.png). Change?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const session: GuideSession = { projectDir: dir, depth: "deep", language: "en", pushes: {} };
    await runTurn(session, { kind: "skip" }, { think: model });
    await suggest("DP-1.1", loadFacts(dir), { think: model, projectDir: dir });
    await judgePushback(byId(all, "DP-1.1"), "Use the logo.", 0, {
      think: model,
      projectDir: dir,
      facts: loadFacts(dir),
      session: loadSessionState(dir, all),
      questions: all,
    });
    for (const task of ["guide-message", "suggest", "pushback-judge"]) {
      const prompt = seen.find((item) => item.startsWith(task));
      assert.ok(prompt, task);
      assert.match(prompt, /paradise-found-logo\.png/);
      assert.match(prompt, /role logo/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a suggestion that names the hero as the logo keeps the logo file as choice A", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-choices-"));
  try {
    writeLogoSlot(dir);
    const offer = await suggestOffer("DP-1.1", loadFacts(dir), {
      think: asThink(async () =>
        hit({
          choices: [
            {
              id: "A",
              label: "The header logo is paradise-found-hero.jpg",
              why: "It is a photo, not the mark.",
              source: "upload:paradise-found-hero.jpg",
            },
            {
              id: "B",
              label: "The logo is paradise-found-logo.png",
              why: "It is the logo on file.",
              source: "upload:paradise-found-logo.png",
            },
          ],
        }),
      ),
      projectDir: dir,
      fallbackLabel: "Three directions: wordmark, symbol, or combination.",
    });
    assert.equal(offer.choices.length, 1);
    assert.equal(offer.choices[0]?.id, "A");
    assert.match(offer.choices[0]?.label ?? "", /paradise-found-logo\.png/);
    assert.equal(offer.choices.some((item) => item.label.includes("paradise-found-hero.jpg")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("naming the logo file does not ask mark versus hero again", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-bind-"));
  try {
    writeLogoSlot(dir);
    const answers = ["DP-0.1", "DP-0.2", "DP-0.2a", "DP-0.3", "DP-0.4", "DP-0.5", "DP-0.7"].map((id) => ({
      id,
      status: "ANSWERED",
      value: "A concrete answer is already stored.",
    }));
    writeFileSync(
      path.join(dir, ".hitchhiker", "interview.json"),
      JSON.stringify({ version: 1, answers, cursor: answers.length, pushedIds: [] }),
      "utf8",
    );
    const seen: string[] = [];
    const model = asThink(async (req) => {
      seen.push(`${req.task}\n${String(req.input)}`);
      if (req.task === "pushback-judge") {
        return hit({
          vague: true,
          quote: "Neither",
          sharperChoice: "Header logo is paradise-found-hero.jpg and favicon is paradise-found-mark.png?",
          choices: [
            {
              id: "A",
              label: "Header logo is paradise-found-hero.jpg; favicon is paradise-found-mark.png",
              why: "A guess.",
              source: "upload:paradise-found-hero.jpg",
            },
            {
              id: "B",
              label: "Use paradise-found-logo.png",
              why: "The logo on file.",
              source: "upload:paradise-found-logo.png",
            },
          ],
        });
      }
      return hit({
        message: "What color should the page use from the photos you already shared?",
        explanationLevel: "beginner",
        joke: false,
      });
    });
    const session: GuideSession = { projectDir: dir, depth: "deep", language: "en", pushes: {} };
    const turn = await runTurn(
      session,
      { kind: "answer", text: "Neither. Use paradise-found-logo.png, the full logo I put in the Logo file slot." },
      { think: model },
    );
    assert.equal(turn.status, "asked");
    assert.equal(turn.questionId, "DP-1.2");
    assert.equal(turn.message.includes("paradise-found-hero.jpg"), false);
    const judge = seen.find((item) => item.startsWith("pushback-judge"));
    assert.ok(judge);
    assert.match(judge, /role logo/);
    assert.match(judge, /paradise-found-logo\.png/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
