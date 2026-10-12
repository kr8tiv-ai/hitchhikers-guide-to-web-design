/**
 * Prompt 209 regression tests. These assert the post-209 contract and fail on 208.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildGrokArgv } from "../src/ai/grok-cli.ts";
import { defaultConfig, parseConfig } from "../src/config.ts";
import { followUpChoices } from "../src/guide/pushback-judge.ts";
import type { Facts } from "../src/guide/schemas.ts";
import { loadTree, questionsForDepth, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");

const facts: Facts = {
  answers: [{ id: "DP-2.1", value: "The neighbor orders tea." }],
  uploads: ["tins.jpg"],
  crawlNotes: ["menu"],
  industry: "tea",
};

const FLAGS = new Set([
  "--no-auto-update",
  "--no-alt-screen",
  "--permission-mode",
  "--tools",
  "--max-turns",
  "--output-format",
  "--json-schema",
  "-m",
  "--model",
  "--effort",
  "--reasoning-effort",
  "-p",
  "--single",
  "--prompt-file",
  "--prompt-json",
]);

function byId(all: readonly Question[], id: string): Question {
  const found = all.find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

test("the tree drops the mic question and asks time once", () => {
  const all = loadTree(treeFile);
  assert.equal(all.some((question) => question.id === "DP-0.6"), false);
  assert.equal(
    all.some((question) => /mic|keyboard/i.test(question.ask)),
    false,
  );
  const first = all[0];
  assert.ok(first);
  assert.equal(first.id, "DP-0.1");
  assert.match(first.tip ?? "", /Type or click to talk, whatever's faster\. You can switch anytime\./);
  const time = byId(all, "DP-0.7");
  assert.match(time.ask, /Roughly how much time do you have today\?/);
  assert.match(time.ask, /Under 30 minutes/);
  const deep = questionsForDepth(all, "deep").filter((question) => question.surface !== "default");
  assert.equal(deep.length, all.filter((question) => question.depth.includes("deep") && question.surface !== "default").length);
  assert.ok(deep.length < 63);
  assert.equal(deep.filter((question) => question.topic === "depth-time").length, 1);
});

test("a sharper-only judge result renders no choices", () => {
  const sharper = "When you are at the desk, do you want the mic live the whole time, or only when you tap to talk?";
  const only = followUpChoices(
    {
      choices: [{ id: "A", label: sharper, why: "A sharper question.", source: "question:suggest" }],
    },
    sharper,
    facts,
    "en",
    "How do you want to answer: hold the mic, or use the keyboard?",
  );
  assert.equal(only.choices.length, 0);
});

test("a choice that repeats the ask is dropped", () => {
  const ask = "Do you have a logo?";
  const set = followUpChoices(
    {
      choices: [
        { id: "A", label: "Do you have a logo.", why: "Same question.", source: "industry:tea" },
        { id: "B", label: "Show the tin on the page.", why: "The shop can use this.", source: "upload:tins.jpg" },
      ],
    },
    "What is the one concrete detail?",
    facts,
    "en",
    ask,
  );
  assert.equal(
    set.choices.some((choice) => choice.label.toLowerCase().includes("do you have a logo")),
    false,
  );
  assert.ok(set.choices.some((choice) => choice.label.includes("tin")));
});

test("interview calls plan grok-4.7-build-fast and do not pass a leading-dash prompt as a flag", () => {
  const prompt = "---\nYou are the Guide.\nStay inside the project.";
  const tasks = ["pushback-judge", "suggest", "guide-message", "mirror", "prefetch"] as const;
  const configs = [
    defaultConfig(),
    parseConfig({ model: "grok-4.7", effort: "medium", ai: { model: "grok-4.7", effort: { default: "medium" } } }),
  ];
  for (const cfg of configs) {
    for (const task of tasks) {
      const argv = buildGrokArgv({ task, input: prompt, effort: "medium" }, cfg, FLAGS);
      const modelAt = argv.indexOf("-m");
      assert.equal(argv[modelAt + 1], "grok-4.7-build-fast", task);
      assert.equal(argv.includes("--tools"), false, task);
      assert.equal(argv.includes("-p"), false, task);
      assert.ok(argv.includes("--prompt-file") || argv.some((arg) => arg.startsWith("-p=")), task);
      const effortAt = argv.indexOf("--effort");
      assert.ok(effortAt >= 0, task);
      assert.ok(["medium", "high", "xhigh"].includes(argv[effortAt + 1] ?? ""), task);
    }
  }
  const fresh = buildGrokArgv({ task: "pushback-judge", input: prompt }, defaultConfig(), FLAGS);
  assert.equal(fresh[fresh.indexOf("--effort") + 1], "xhigh");
  const high = parseConfig({ ai: { model: "grok-4.7", effort: { default: "high" } } });
  const saved = buildGrokArgv({ task: "suggest", input: prompt, effort: "medium" }, high, FLAGS);
  assert.equal(saved[saved.indexOf("--effort") + 1], "high");
  assert.equal(saved[saved.indexOf("-m") + 1], "grok-4.7-build-fast");
});

test("an old project with a removed mic answer still maps the other answers", async () => {
  const { openInterview } = await import("../src/interview.ts");
  const dir = mkdtempSync(path.join(tmpdir(), "hh-209-old-"));
  try {
    const hh = path.join(dir, ".hitchhiker");
    mkdirSync(hh, { recursive: true });
    writeFileSync(
      path.join(hh, "interview.json"),
      JSON.stringify({
        version: 1,
        cursor: 0,
        pushedIds: [],
        answers: [
          { id: "DP-0.1", status: "ANSWERED", value: "For myself." },
          { id: "DP-0.6", status: "SKIPPED", value: "Keyboard." },
          { id: "DP-0.7", status: "ANSWERED", value: "About an hour." },
        ],
      }),
      "utf8",
    );
    const session = await openInterview(dir, "deep");
    const next = session.next();
    assert.ok(next);
    assert.equal(next.id, "DP-0.2");
    assert.notEqual(next.id, "DP-0.6");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
