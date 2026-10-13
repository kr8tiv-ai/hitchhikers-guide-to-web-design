/**
 * BUG-033: list fields fit a larger cap, a length miss keeps the draft,
 * and the fallback cites every answer that fed a field.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultConfig, think, validateJson, type SpawnLike, type ThinkDeps } from "../src/index.ts";
import { shortenAtBoundary } from "../src/ai/think.ts";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { draftSiteBrief, readBriefDesk } from "../src/guide/brief-desk.ts";
import { BRIEF_DRAFT_ERROR, deterministicBrief } from "../src/guide/brief-loop.ts";
import {
  BRIEF_DRAFT_SCHEMA,
  BRIEF_KEYS,
  BRIEF_LIST_MAX,
  BRIEF_PROSE_MAX,
  type Facts,
  type SiteBrief,
} from "../src/guide/schemas.ts";

const FLAGS = new Set([
  "-p",
  "--single",
  "--prompt-file",
  "--prompt-json",
  "-m",
  "--model",
  "--effort",
  "--reasoning-effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function overLength(label: string, length: number): string {
  const bit = `${label} stays recorded. `;
  let text = "";
  while (text.length < length) text += bit;
  return text.slice(0, length);
}

function filledBrief(goal = "The site helps a visitor book a visit."): SiteBrief {
  const brief = {} as SiteBrief;
  for (const key of BRIEF_KEYS) brief[key] = "The site helps a visitor book a visit.";
  brief.goal = goal;
  return brief;
}

function envelope(text: string): string {
  return JSON.stringify({ text, stopReason: "end_turn", sessionId: "test" });
}

function deps(dir: string, spawnImpl: SpawnLike): ThinkDeps {
  return {
    spawnImpl,
    projectDir: dir,
    cassetteDir: path.join(dir, "cassettes"),
    config: defaultConfig(),
    flags: FLAGS,
    env: { HH_CASSETTE: "off" },
  };
}

test("list fields allow 1200 characters and the prose cap stays 500", () => {
  const props = BRIEF_DRAFT_SCHEMA.properties ?? {};
  assert.equal(BRIEF_LIST_MAX, 1200);
  assert.equal(BRIEF_PROSE_MAX, 500);
  for (const key of ["pages", "features", "limits", "references", "cadence"]) {
    assert.equal(props[key]?.maxLength, BRIEF_LIST_MAX, key);
  }
  for (const key of ["goal", "motion", "maintainer", "coverage", "hosting"]) {
    assert.equal(props[key]?.maxLength, BRIEF_PROSE_MAX, key);
  }
  assert.ok(BRIEF_DRAFT_SCHEMA.required?.includes("maintainer"));
  assert.ok(BRIEF_DRAFT_SCHEMA.required?.includes("cadence"));
  const value = filledBrief();
  value.limits = overLength("Limits", 565);
  value.pages = overLength("Pages", 528);
  value.features = overLength("Features", 534);
  assert.equal(validateJson(value, BRIEF_DRAFT_SCHEMA).length, 0);
  value.limits = overLength("Limits", BRIEF_LIST_MAX + 1);
  const errors = validateJson(value, BRIEF_DRAFT_SCHEMA);
  assert.equal(errors.some((error) => error.includes("$.limits") && error.includes(`maxLength ${BRIEF_LIST_MAX}`)), true);
});

test("a length miss shortens only the failing fields and keeps the rest", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-len-"));
  const schema = {
    type: "object",
    required: ["goal", "limits", "pages", "features"],
    properties: {
      goal: { type: "string", maxLength: 500 },
      limits: { type: "string", maxLength: 500 },
      pages: { type: "string", maxLength: 500 },
      features: { type: "string", maxLength: 500 },
    },
  } as const;
  const goal = "The goal stays short.";
  const payload = {
    goal,
    limits: overLength("Limits", 565),
    pages: overLength("Pages", 528),
    features: overLength("Features", 534),
  };
  const prompts: string[] = [];
  const spawnImpl: SpawnLike = async (request) => {
    const fileIndex = request.args.indexOf("--prompt-file");
    const promptFile = fileIndex >= 0 ? request.args[fileIndex + 1] : undefined;
    prompts.push(promptFile === undefined ? "" : readFileSync(promptFile, "utf8"));
    return { status: 0, stdout: envelope(JSON.stringify(payload)), stderr: "", timedOut: false, errorCode: null };
  };
  try {
    const result = await think({ task: "brief-draft", input: "draft", schema }, deps(dir, spawnImpl));
    const value = result.value as typeof payload;
    assert.equal(prompts.length, 2);
    assert.match(prompts[1] ?? "", /Shorten only the fields/);
    assert.match(prompts[1] ?? "", /never mid-word/);
    assert.equal(value.goal, goal);
    for (const key of ["limits", "pages", "features"] as const) {
      assert.ok(value[key].length <= 500, `${key} ${value[key].length}`);
      assert.match(value[key], new RegExp(`^${key[0]?.toUpperCase()}${key.slice(1)} stays recorded`));
      assert.equal(value[key].endsWith("."), true, key);
      assert.equal(payload[key].startsWith(value[key]), true, key);
      assert.ok(value[key].length < payload[key].length, key);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shortenAtBoundary never cuts a word in half", () => {
  assert.equal(shortenAtBoundary("abcdefghij", 4), "abcdefghij");
  const cut = shortenAtBoundary("Who goes? The rest of this line is much longer than the cap.", 20);
  assert.equal(cut, "Who goes?");
  assert.ok(cut.length <= 20);
});

test("a non-JSON reply is repaired once", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-json-"));
  const prompts: string[] = [];
  const spawnImpl: SpawnLike = async (request) => {
    const fileIndex = request.args.indexOf("--prompt-file");
    const promptFile = fileIndex >= 0 ? request.args[fileIndex + 1] : undefined;
    prompts.push(promptFile === undefined ? "" : readFileSync(promptFile, "utf8"));
    const text = prompts.length === 1 ? "this is not json" : '{"ok":true}';
    return { status: 0, stdout: envelope(text), stderr: "", timedOut: false, errorCode: null };
  };
  try {
    const result = await think(
      { task: "repair", input: "answer", schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } } },
      deps(dir, spawnImpl),
    );
    assert.equal(prompts.length, 2);
    assert.match(prompts[1] ?? "", /response was not JSON/);
    assert.equal(result.value.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the draft prompt states the same limits as the schema", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-prompt-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    const brief = filledBrief();
    return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
  };
  try {
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(desk.error, "");
    const input = calls[0]?.input ?? "";
    assert.match(input, new RegExp(`at most ${BRIEF_PROSE_MAX} characters`));
    assert.match(input, /pages, features, limits, references, and cadence/);
    assert.match(input, new RegExp(`at most ${BRIEF_LIST_MAX} characters`));
    assert.equal(calls[0]?.model, "grok-4.7-build-fast");
    assert.equal(calls[0]?.effort, "xhigh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Paradise Found fallback maps each field to its own answers", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-map-"));
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  const rows = [
    { id: "DP-2.1", status: "ANSWERED", value: "Sell the farm stay." },
    { id: "DP-5.1", status: "ANSWERED", value: "Kinfolk's muted olive, close to our jungle green." },
    { id: "DP-5.2", status: "ANSWERED", value: "Aesop: love. Kinfolk: love. Patagonia: love. Cereal: meh, too cold." },
    { id: "DP-6.2", status: "ANSWERED", value: "4." },
    { id: "DP-3.5", status: "ANSWERED", value: "Yes, a small blog, written for me, one guide a month: buying with a lawyer." },
    { id: "DP-8.3", status: "SKIPPED", value: "No blog cadence." },
    { id: "DP-8.4", status: "ANSWERED", value: "Privacy and terms stay on the site. Never promise a return." },
    { id: "DP-9.1", status: "ANSWERED", value: "In 4 weeks: by November 10, 2026." },
    { id: "DP-9.3", status: "ANSWERED", value: "Me, on Cloudflare Pages. I fix technical breaks myself." },
    { id: "DP-9.4", status: "SKIPPED", value: "WCAG 2.2 AA. Nothing beyond that named." },
    { id: "DP-9.5", status: "ANSWERED", value: "Yes, that is right. Also: the caretaker program and a Spanish-first caretaker sign-up matter." },
  ];
  writeFileSync(path.join(hitch, "interview.json"), JSON.stringify(rows));
  const facts: Facts = {
    answers: rows.map((row) =>
      row.status === "SKIPPED" ? { id: row.id, value: row.value, status: row.status } : { id: row.id, value: row.value },
    ),
    uploads: [],
    crawlNotes: [],
  };
  const filled = deterministicBrief(facts, "en");
  assert.match(filled.limits, /Privacy and terms/);
  assert.match(filled.limits, /November 10, 2026/);
  assert.match(filled.limits, /caretaker program/);
  assert.equal(filled.limits.includes("Yes, that is right"), false);
  assert.equal(filled.limits.includes("Kinfolk"), false);
  assert.equal(filled.motion, "4 of 10, editorial");
  assert.equal(filled.motion.includes("4."), false);
  assert.match(filled.references, /Aesop/);
  assert.match(filled.references, /Kinfolk's muted olive/);
  assert.equal(filled.references.includes("November"), false);
  assert.match(filled.maintainer, /Cloudflare/);
  assert.match(filled.cadence, /one guide a month/);
  assert.equal(filled.cadence.includes("No blog cadence."), false);
  assert.match(filled.coverage, /Covered:/);
  assert.match(filled.coverage, /Uncovered:/);
  assert.match(filled.coverage, /DP-9\.4/);
  const think = async (): Promise<ThinkResult<unknown>> => {
    throw new Error("schema");
  };
  try {
    await draftSiteBrief(dir, think as never);
    const desk = readBriefDesk(dir);
    const source = (key: string) => desk.sources.find((item) => item.key === key);
    assert.equal(source("limits")?.questionId, "DP-8.4, DP-9.1, DP-9.5");
    assert.equal(source("motion")?.questionId, "DP-6.2");
    assert.equal(source("motion")?.answer, "4 of 10, editorial");
    assert.equal(source("references")?.questionId, "DP-5.2, DP-5.1");
    assert.match(source("maintainer")?.answer ?? "", /Cloudflare/);
    assert.equal(source("cadence")?.questionId, "DP-3.5");
    assert.equal(source("coverage")?.questionId, "");
    assert.equal(desk.sources.some((item) => item.questionId.trim() === ":" ), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retry feeds the failure back, then a good draft clears the alert", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-retry-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  let calls = 0;
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    if (calls < 3) throw new Error("max turns reached");
    assert.match(req.input, /The last draft failed/);
    assert.match(req.input, /stopped early/);
    const brief = filledBrief("A farm stay with a caretaker sign-up.");
    return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
  };
  try {
    const first = await draftSiteBrief(dir, think as never);
    assert.equal(first.error, BRIEF_DRAFT_ERROR);
    const second = await draftSiteBrief(dir, think as never);
    assert.equal(second.error, "");
    assert.match(second.draft?.goal ?? "", /farm stay/);
    assert.equal((second.draft?.goal ?? "").includes("not stated yet"), false);
    const again = readBriefDesk(dir);
    assert.equal(again.error, "");
    assert.match(again.draft?.goal ?? "", /farm stay/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a second retry failure names the reason and the time", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-033-again-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const think = async (): Promise<ThinkResult<unknown>> => {
    throw new Error("max turns reached");
  };
  try {
    const first = await draftSiteBrief(dir, think as never);
    assert.equal(first.error, BRIEF_DRAFT_ERROR);
    const second = await draftSiteBrief(dir, think as never);
    assert.match(second.error, /failed again at \d{4}-\d{2}-\d{2}T/);
    assert.match(second.error, /max turns reached/);
    assert.equal(second.error.includes("!"), false);
    assert.ok(second.draft);
    assert.equal(second.draft.goal.trim() === "", false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
