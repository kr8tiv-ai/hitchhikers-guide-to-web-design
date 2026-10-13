/**
 * Persistent context. Answers, uploads, and decisions stay on disk,
 * and every later Guide call reads the same packet.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { think } from "../src/ai/think.ts";
import { draftVoiceKit } from "../src/brand/live/voice-kit.ts";
import { aggregatePhaseCosts } from "../src/cost.ts";
import {
  assertCanAdvance,
  auditContext,
  buildContextPacket,
  loadAssets,
  loadDecisions,
  loadNotes,
  loadSummary,
  phaseNames,
  promoteDiscuss,
  promoteLookahead,
  readStatus,
  recordAsset,
  recordDiscussNote,
  recordLookahead,
  recordVerification,
  refreshSummary,
  renderContextPacket,
  repairAssets,
  repairCursor,
  repairDecisions,
  runGate,
  syncAnswer,
  undoLast,
  withContextPacket,
  writePhaseAdvisories,
} from "../src/context/index.ts";
import { runTurn, type GuideSession } from "../src/guide/live-turn.ts";
import { judgePushback } from "../src/guide/pushback-judge.ts";
import type { Facts } from "../src/guide/schemas.ts";
import { suggestOffer } from "../src/guide/suggest.ts";
import { saveProjectFile, restoreProject } from "../src/project-file/index.ts";
import { beforeWeJump } from "../src/spec/before-jump.ts";
import { saveState, type GuideState } from "../src/state.ts";
import { loadTree, type Question } from "../src/tree.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const treeFile = path.join(repoRoot, "interview", "tree.yaml");
const COLOURS = "ink, paper, lime, void, silver";
const LOGO = "paradise-found-logo.png";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-context-213-"));
}

function stateFor(phase: string, promptId = "interview:DP-0.1"): GuideState {
  return {
    phase,
    slice: "",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Continue ${phase}.`,
    updatedAt: "2026-10-12T00:00:00.000Z",
  };
}

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function asThink(fn: (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>>): typeof think {
  return fn as typeof think;
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function byId(id: string): Question {
  const found = loadTree(treeFile).find((question) => question.id === id);
  assert.ok(found, id);
  return found;
}

function assertFacts(input: string): void {
  assert.match(input, /## Context packet/);
  assert.match(input, /no prior site/);
  assert.match(input, /paradise-found-logo\.png/);
  assert.match(input, /role logo/);
  assert.match(input, new RegExp(COLOURS.replace(/[ ,]/g, "\\$&")));
}

async function seedMemory(dir: string): Promise<void> {
  await saveState(dir, stateFor("Don't Panic"));
  await syncAnswer(dir, {
    questionId: "DP-0.2",
    text: "no prior site",
    source: "answer",
    date: "2026-10-12",
    moveCursor: true,
    summarize: true,
  });
  await recordAsset(dir, {
    saved: "hh-98860ac8-paradise-found-logo.png",
    original: LOGO,
    role: "logo",
    questionId: "DP-0.4",
  });
  await syncAnswer(dir, {
    questionId: "DP-1.2",
    text: COLOURS,
    source: "answer",
    date: "2026-10-12",
    moveCursor: true,
    summarize: true,
  });
  await syncAnswer(dir, {
    questionId: "brief",
    text: "Brief approved.",
    source: "approval",
    date: "2026-10-12",
    moveCursor: false,
    summarize: true,
  });
  await writePhaseAdvisories(dir, "2026-10-12");
  await saveState(dir, stateFor("Babel Fish", "interview:DP-1.2"));
}

async function recordCalls(dir: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const model = asThink(async (req) => {
    seen.set(req.task, req.input);
    if (req.task === "pushback-judge") return hit({ vague: false, quote: "", sharperChoice: "" });
    if (req.task === "context-summary") return hit({ summary: `D-001 ${LOGO} ${COLOURS}` });
    if (req.task === "suggest") {
      return hit({
        choices: [{ id: "A", label: "Keep the logo.", why: "It is on file.", source: "upload:paradise-found-logo.png" }],
      });
    }
    if (req.task === "brand-voice") return hit({ message: "not a voice kit" });
    return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
  });
  const session: GuideSession = { projectDir: dir, depth: "standard", language: "en", pushes: {} };
  await runTurn(session, { kind: "skip" }, { think: model });
  const facts: Facts = { answers: [], uploads: [], crawlNotes: [] };
  await suggestOffer("DP-1.2", facts, { think: model, projectDir: dir });
  await judgePushback(byId("DP-1.2"), COLOURS, 0, { think: model, projectDir: dir });
  await draftVoiceKit({ name: "Paradise Found", answers: [], projectDir: dir }, { think: model }).catch(() => undefined);
  return seen;
}

test("each write kind lands in the context files", async () => {
  const dir = tempDir();
  try {
    const answer = await syncAnswer(dir, {
      questionId: "DP-0.2",
      text: "no prior site",
      source: "answer",
      date: "2026-10-12",
      summarize: false,
    });
    assert.equal(answer?.id, "D-001");
    assert.equal(answer?.source, "answer");
    const again = await syncAnswer(dir, {
      questionId: "DP-0.2",
      text: "no prior site",
      source: "answer",
      date: "2026-10-13",
      summarize: false,
    });
    assert.equal(again, null);
    assert.equal(loadDecisions(dir)[0]?.date, "2026-10-12");
    await syncAnswer(dir, { questionId: "DP-0.1", text: "Skipped the audience.", source: "skip", date: "2026-10-12", summarize: false });
    await syncAnswer(dir, {
      questionId: "DP-0.5",
      text: "Use the quiet mark.",
      source: "suggestion accepted",
      date: "2026-10-12",
      summarize: false,
    });
    await syncAnswer(dir, {
      questionId: "brief",
      text: "Brief approved.",
      source: "approval",
      date: "2026-10-12",
      summarize: false,
    });
    await syncAnswer(dir, {
      questionId: "DP-9.2",
      text: "Hostinger.",
      source: "before-jump",
      date: "2026-10-12",
      summarize: false,
    });
    const asset = await recordAsset(dir, {
      saved: "hh-98860ac8-paradise-found-logo.png",
      original: LOGO,
      role: "logo",
      questionId: "DP-0.4",
    });
    assert.equal(asset?.source, "upload");
    assert.equal(loadAssets(dir)[0]?.role, "logo");
    assert.match(readFileSync(path.join(dir, ".hitchhiker", "PROJECT.md"), "utf8"), /no prior site/);
    assert.equal(loadDecisions(dir).some((row) => row.source === "skip"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a changed answer supersedes the old decision and a hand edit is read next", async () => {
  const dir = tempDir();
  try {
    await syncAnswer(dir, { questionId: "DP-0.2", text: "no prior site", source: "answer", date: "2026-10-12", summarize: false });
    await syncAnswer(dir, { questionId: "DP-0.2", text: "one old page", source: "answer", date: "2026-10-12", summarize: false });
    const rows = loadDecisions(dir);
    const old = rows.find((row) => row.text === "no prior site");
    const live = rows.find((row) => row.text === "one old page");
    assert.equal(old?.supersededBy, live?.id);
    assert.equal(live?.supersededBy, "");
    const file = path.join(dir, ".hitchhiker", "DECISIONS.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("one old page", "a hand edit of the prior site"));
    const packet = buildContextPacket(dir, "interview");
    assert.match(renderContextPacket(packet), /a hand edit of the prior site/);
    assert.equal(packet.decisions.some((row) => row.text === "no prior site"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the packet trims old answers, redacts secrets, and rejects a summary that drops a decision", async () => {
  const dir = tempDir();
  try {
    for (let index = 0; index < 4; index += 1) {
      await syncAnswer(dir, {
        questionId: `DP-8.${index}`,
        text: `fact ${index} ${"detail ".repeat(80)}`,
        source: "answer",
        date: "2026-10-12",
        summarize: false,
      });
    }
    await syncAnswer(dir, {
      questionId: "DP-0.3",
      text: "Write the owner at owner@example.com",
      source: "answer",
      date: "2026-10-12",
      summarize: false,
    });
    await recordAsset(dir, { saved: "hh-logo.png", original: LOGO, role: "logo", questionId: "DP-0.4" });
    const tight = buildContextPacket(dir, "judge", { budgetTokens: 220 });
    assert.ok(tight.trimmed.length > 0);
    assert.equal(tight.decisions.length, 6);
    assert.equal(tight.assets.length, 1);
    assert.equal(tight.trimmed.includes("over-budget") || tight.recent.length < 4, true);
    const rendered = renderContextPacket(buildContextPacket(dir, "judge"));
    assert.match(rendered, /owner@example.com/);
    const outgoing = await withContextPacket(dir, "judge", { task: "pushback-judge", input: "Check the answer." });
    assert.match(outgoing.input, /## Context packet/);
    assert.doesNotMatch(outgoing.input, /owner@example.com/);
    assert.match(outgoing.input, /\[REDACTED\]/);
    assert.match(loadDecisions(dir).map((row) => row.text).join("\n"), /owner@example.com/);
    const summary = await refreshSummary(
      dir,
      asThink(async () => hit({ summary: "A note that names neither the decision nor the file." })),
    );
    assert.match(summary, /D-001/);
    assert.match(summary, /paradise-found-logo\.png/);
    assert.equal(loadSummary(dir), summary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("context survives a project-file restore and the next calls still name the facts", async () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  try {
    await seedMemory(dir);
    const first = await recordCalls(dir);
    for (const task of ["guide-message", "suggest", "pushback-judge", "brand-voice"]) {
      const input = first.get(task);
      assert.ok(input, task);
      assertFacts(input);
    }
    const names = ["PROJECT.md", "STATE.md", "DECISIONS.md", "ASSETS.md", "CONTEXT-SUMMARY.md"];
    const before = names.map((name) => normalize(readFileSync(path.join(dir, ".hitchhiker", name), "utf8")));
    const saved = await saveProjectFile(dir, { homeDir: home, to: path.join(dir, "out"), projectName: "Context Desk" });
    await rm(path.join(dir, ".hitchhiker"), { recursive: true, force: true });
    const restored = await restoreProject(saved.filePath, { projectDir: dir, prefer: "file" });
    assert.equal(restored.kept, "file");
    assert.equal(names.every((name) => restored.file?.snapshot.some((item) => item.path === name)), true);
    const after = ["PROJECT.md", "STATE.md", "DECISIONS.md", "ASSETS.md", "CONTEXT-SUMMARY.md"].map((name) =>
      normalize(readFileSync(path.join(dir, ".hitchhiker", name), "utf8")),
    );
    assert.deepEqual(after, before);
    const second = await recordCalls(dir);
    for (const task of ["guide-message", "suggest", "pushback-judge", "brand-voice"]) {
      const input = second.get(task);
      assert.ok(input, task);
      assertFacts(input);
    }
    assert.equal(readStatus(dir).phase, "Babel Fish");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the router names the phase and refuses an open gate", async () => {
  const dir = tempDir();
  try {
    for (const phase of phaseNames()) {
      await saveState(dir, stateFor(phase));
      assert.equal(readStatus(dir).phase, phase);
    }
    const blocked = assertCanAdvance(dir);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reasons.join(" "), /DP-2\.1/);
    await writePhaseAdvisories(dir, "2026-10-12");
    const open = assertCanAdvance(dir);
    assert.match(open.reasons.join(" "), /Open decisions: D-/);
    const jump = beforeWeJump({
      answers: [],
      approvals: {},
      hasLegalPage: true,
      openDecisions: loadDecisions(dir).filter((row) => row.open).map((row) => ({ id: row.id, text: row.text })),
    });
    assert.match(jump.questions[0] ?? "", /^Decision D-\d+ is still open\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("approval writes ADR entries linked to the driving questions", async () => {
  const dir = tempDir();
  try {
    await syncAnswer(dir, { questionId: "DP-4.1", text: "Astro", source: "answer", date: "2026-10-12", summarize: false });
    const rows = await writePhaseAdvisories(dir, "2026-10-12");
    const stack = rows.find((row) => row.questionId === "adr:stack");
    assert.equal(stack?.kind, "adr");
    assert.equal(stack?.open, false);
    assert.match(stack?.choice ?? "", /Astro/);
    assert.match(stack?.text ?? "", /DP-4\.1/);
    const second = await writePhaseAdvisories(dir, "2026-10-12");
    assert.equal(second.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("discuss leaves the cursor alone until the note is promoted", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("Deep Thought", "interview:DP-0.2"));
    await recordDiscussNote(dir, "Talk through the logo without answering.", "DP-0.4", "2026-10-12");
    assert.equal(readStatus(dir).questionId, "DP-0.2");
    assert.equal(loadDecisions(dir).length, 0);
    assert.equal(loadNotes(dir).length, 1);
    const created = await promoteDiscuss(dir, "N-001", "2026-10-12");
    assert.equal(created?.source, "discuss");
    assert.equal(loadDecisions(dir).length, 1);
    assert.equal(readStatus(dir).questionId, "DP-0.2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctor names each inconsistency and undo keeps the history", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, stateFor("Don't Panic", "007"));
    writeFileSync(
      path.join(dir, ".hitchhiker", "interview.json"),
      `${JSON.stringify({ version: 1, answers: [{ id: "DP-0.2", status: "ANSWERED", value: "no prior site" }] })}\n`,
    );
    await recordAsset(dir, { saved: "missing-logo.png", original: LOGO, role: "logo", questionId: "DP-0.4" });
    const findings = auditContext(dir);
    assert.match(findings.map((row) => row.fix).join("\n"), /hh context repair --decisions/);
    assert.match(findings.map((row) => row.fix).join("\n"), /hh context repair --assets/);
    assert.match(findings.map((row) => row.fix).join("\n"), /hh context repair --cursor/);
    await repairDecisions(dir);
    await repairAssets(dir);
    await repairCursor(dir);
    assert.equal(auditContext(dir).length, 0);
    await syncAnswer(dir, { questionId: "DP-1.2", text: COLOURS, source: "answer", date: "2026-10-12", summarize: false });
    const undone = await undoLast(dir, "answer");
    assert.match(undone?.text ?? "", /^Withdrawn\. /);
    assert.equal(loadDecisions(dir).some((row) => row.text === COLOURS && row.supersededBy !== ""), true);
    const upload = await undoLast(dir, "upload");
    assert.match(upload?.text ?? "", /Withdrawn/);
    assert.equal(loadAssets(dir).every((asset) => asset.status === "withdrawn"), true);
    assert.match(readFileSync(path.join(dir, ".hitchhiker", "DECISIONS.md"), "utf8"), /no prior site/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a passing gate is reused and the summary is in the next packet", async () => {
  const dir = tempDir();
  try {
    await recordVerification(dir, { sha: "abc123", passed: true, summary: "Shipped the towel page.", at: "2026-10-12T00:00:00.000Z" });
    let calls = 0;
    const gate = await runGate(dir, "abc123", async () => {
      calls += 1;
      return { passed: true, summary: "again" };
    });
    assert.equal(gate.reused, true);
    assert.equal(calls, 0);
    const packet = buildContextPacket(dir, "build");
    assert.match(packet.buildSummary, /Shipped the towel page/);
    assert.match(renderContextPacket(packet), /Build summaries/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("phase stats sum without inventing a price, and lookahead promotes once", async () => {
  const dir = tempDir();
  try {
    const totals = aggregatePhaseCosts([
      { phase: "Babel Fish", inputTokens: 10, outputTokens: 4, durationMs: 5 },
      { phase: "Babel Fish", inputTokens: 3, outputTokens: 1, durationMs: 2 },
    ]);
    assert.equal(totals.length, 1);
    assert.equal(totals[0]?.inputTokens, 13);
    assert.equal(totals[0]?.outputTokens, 5);
    assert.equal(totals[0]?.durationMs, 7);
    assert.equal(totals[0]?.cost, null);
    await recordLookahead(dir, [{ questionId: "DP-2.1", text: "Sell towels." }]);
    assert.equal(await promoteLookahead(dir, "2026-10-12"), 1);
    assert.equal(await promoteLookahead(dir, "2026-10-12"), 0);
    assert.match(loadDecisions(dir)[0]?.text ?? "", /Sell towels/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
