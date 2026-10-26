/**
 * BUG-044: a turn cap is a stream event, not a phrase in tool output.
 * end_turn with exit 0 goes to the gate. A real cap names the turns,
 * keeps the previous log, and auto-retries once.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BILLING_TOP_UP,
  judgeTurnCap,
  prepareSiteBuild,
  readBuildRun,
  readPromptTasks,
  retrySiteBuild,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  clearProjectBuildRunner,
  ensureSiteBuild,
  loadQueue,
  resetSiteBuildWatch,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-044-"));
}

function result(code: number, stdout = "", stderr = ""): BuildSpawnResult {
  return { code, stdout, stderr, errorCode: null };
}

const NOISE = [
  JSON.stringify({
    type: "tool_call",
    toolName: "read_file",
    rawInput: { target_file: "docs/limits.md" },
    output: 'The notes mention "type":"max_turns_reached" and max turns reached.',
  }),
  'File text says "type":"max_turns_reached" and max turns reached.',
  JSON.stringify({ type: "assistant", text: "max turns reached is only a phrase here." }),
].join("\n");

const END_TURN = JSON.stringify({ type: "end", stopReason: "end_turn", sessionId: "desk-ok" });

function capStream(marker: string, sessionId: string): string {
  return [
    marker,
    JSON.stringify({ type: "max_turns_reached", stopReason: "cancelled", num_turns: 80 }),
    JSON.stringify({ type: "end", stopReason: "cancelled", num_turns: 80, sessionId }),
  ].join("\n");
}

async function twoPromptProject(dir: string): Promise<void> {
  await prepareSiteBuild(dir, "The site helps a visitor book a visit.");
  await saveQueue(dir, {
    items: [
      { id: "001", kind: "build", status: "queued" },
      { id: "002", kind: "build", status: "queued" },
    ],
  });
}

async function cleanup(dir: string): Promise<void> {
  await siteBuildSettled(dir);
  setSiteBuildGate(dir, null);
  clearProjectBuildRunner(dir);
  resetSiteBuildWatch(dir);
  removeTempDir(dir);
}

test("end_turn with the cap words inside tool output passes the gate", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  let gated = 0;
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.args.includes("--max-turns"), false);
    assert.equal(request.args.includes("--resume"), false);
    const stdout = `${NOISE}\n${END_TURN}\n`;
    request.onOutput?.(stdout);
    return { pid: 424242, done: Promise.resolve(result(0, stdout, "Error: max turns reached")) };
  };
  setProjectBuildRunner(dir, spawn);
  setSiteBuildGate(dir, () => {
    gated += 1;
  });
  try {
    await twoPromptProject(dir);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "passed");
    assert.deepEqual(seen, ["001", "002"]);
    assert.equal(gated, 2);
    const reason = readBuildRun(dir)?.reason ?? "";
    assert.equal(/desk sets no cap|turn limit/i.test(reason), false);
    assert.equal(reason.includes("!"), false);
  } finally {
    await cleanup(dir);
  }
});

test("a gate failure and a 402 do not auto-retry", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    const stdout = request.promptId === "001" ? `${NOISE}\n${END_TURN}\n` : `${END_TURN}\n`;
    request.onOutput?.(stdout);
    if (seen.length === 1) {
      return { pid: 424242, done: Promise.resolve(result(0, stdout, "")) };
    }
    return { pid: 424242, done: Promise.resolve(result(0, stdout, "")) };
  };
  setProjectBuildRunner(dir, spawn);
  setSiteBuildGate(dir, () => {
    throw new Error("gate broke");
  });
  try {
    await twoPromptProject(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001"]);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "failed");
    assert.equal((await loadQueue(dir))?.items[1]?.status, "queued");
    const reason = readBuildRun(dir)?.reason ?? "";
    assert.match(reason, /gate broke/);
    assert.equal(/desk sets no cap/.test(reason), false);
    assert.equal(reason.includes("!"), false);
  } finally {
    await cleanup(dir);
  }

  const billed = tempDir();
  const billedSeen: string[] = [];
  const billSpawn: BuildSpawn = (request) => {
    billedSeen.push(request.promptId);
    const stdout = `${NOISE}\n402 Payment Required\n`;
    request.onOutput?.(stdout);
    return { pid: 424242, done: Promise.resolve(result(1, stdout, "402 Payment Required")) };
  };
  setProjectBuildRunner(billed, billSpawn);
  try {
    await twoPromptProject(billed);
    await ensureSiteBuild(billed);
    assert.deepEqual(billedSeen, ["001"]);
    assert.equal((await loadQueue(billed))?.items[0]?.status, "failed");
    assert.equal((await loadQueue(billed))?.items[1]?.status, "paused");
    assert.equal(readBuildRun(billed)?.reason, BILLING_TOP_UP);
    assert.equal(readBuildRun(billed)?.autoRetried, false);
  } finally {
    await cleanup(billed);
  }
});

test("a real cap retries once with resume, then fails and halts", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const argSets: string[][] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    argSets.push([...request.args]);
    const marker = seen.length === 1 ? "attempt-one" : seen.length === 2 ? "attempt-two" : "attempt-three";
    const stdout = capStream(marker, "desk044");
    request.onOutput?.(stdout);
    return { pid: 424242, done: Promise.resolve(result(0, stdout, "")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await twoPromptProject(dir);
    const tasksBefore = readPromptTasks(dir).map((task) => task.promptId);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001", "001"]);
    assert.equal(argSets[0]?.includes("--resume"), false);
    assert.equal(argSets[1]?.includes("--resume"), true);
    assert.equal(argSets[1]?.[argSets[1].indexOf("--resume") + 1], "desk044");
    assert.equal(argSets[1]?.includes("--fork-session"), false);
    assert.equal(argSets[1]?.includes("--restore-code"), false);
    assert.equal(argSets[1]?.includes("--max-turns"), false);
    const continuePath = path.join(dir, ".hitchhiker", "continue", "001.md");
    assert.equal(argSets[1]?.includes(continuePath), true);
    const continuation = readFileSync(continuePath, "utf8");
    assert.match(continuation, /stopped at the turn limit/);
    assert.equal(continuation.includes("!"), false);
    assert.deepEqual(
      readPromptTasks(dir).map((task) => task.promptId),
      tasksBefore,
    );
    assert.equal(readdirSync(path.join(dir, ".hitchhiker", "prompts")).some((name) => name.includes("continue")), false);
    const prev = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-001.prev.log"), "utf8");
    const current = readFileSync(path.join(dir, ".hitchhiker", "logs", "build-001.log"), "utf8");
    assert.match(prev, /attempt-one/);
    assert.equal(prev.includes("attempt-two"), false);
    assert.match(current, /attempt-two/);
    assert.equal(current.includes("attempt-one"), false);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    const run = readBuildRun(dir);
    assert.equal(run?.turns, 80);
    assert.equal(run?.turnCap, null);
    assert.equal(run?.stopReason, "cancelled");
    assert.equal(run?.autoRetried, true);
    assert.equal(run?.turnLimited, true);
    assert.equal(run?.sessionId, "desk044");
    const raw = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "build-run.json"), "utf8")) as {
      turns: number;
      turnCap: number | null;
      stopReason: string;
    };
    assert.equal(raw.turns, 80);
    assert.equal(raw.turnCap, null);
    assert.equal(raw.stopReason, "cancelled");
    const reason = run?.reason ?? "";
    assert.match(reason, /after 80 turns/);
    assert.match(reason, /desk sets no cap/);
    assert.match(reason, /Retry/);
    assert.equal(reason.includes("!"), false);
    assert.equal(reason.includes("{"), false);

    await retrySiteBuild(dir, "001");
    await siteBuildSettled(dir);
    assert.deepEqual(seen, ["001", "001", "001"]);
    assert.equal(argSets[2]?.includes("--resume"), true);
    assert.equal(argSets[2]?.[argSets[2].indexOf("--resume") + 1], "desk044");
    assert.equal((await loadQueue(dir))?.items[0]?.status, "failed");
    assert.equal((await loadQueue(dir))?.items[1]?.status, "queued");
  } finally {
    await cleanup(dir);
  }
});

test("a cap while the queue is paused does not auto-retry", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    const stdout = capStream("paused-attempt", "desk044");
    writeFileSync(
      path.join(dir, ".hitchhiker", "queue.json"),
      `${JSON.stringify(
        {
          items: [
            { id: "001", kind: "build", status: "queued" },
            { id: "002", kind: "build", status: "queued" },
          ],
          pause: { at: "2026-10-19T00:00:00.000Z", after: "" },
        },
        null,
        2,
      )}\n`,
    );
    request.onOutput?.(stdout);
    return { pid: 424242, done: Promise.resolve(result(0, stdout, "")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await twoPromptProject(dir);
    await ensureSiteBuild(dir);
    assert.deepEqual(seen, ["001"]);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "failed");
    assert.equal((await loadQueue(dir))?.items[1]?.status, "queued");
    assert.equal(readBuildRun(dir)?.autoRetried, false);
    assert.match(readBuildRun(dir)?.reason ?? "", /desk sets no cap/);
  } finally {
    await cleanup(dir);
  }
});

test("stderr cap needs a non-zero exit, and an old run file still loads", () => {
  const hit = judgeTurnCap({
    stdout: "",
    stderr: "note\nError: max turns reached\n",
    log: "",
    code: 1,
    turnCap: null,
  });
  assert.ok(hit);
  assert.equal(hit.turns, null);
  assert.equal(hit.turnCap, null);
  assert.equal(
    judgeTurnCap({
      stdout: `${NOISE}\n${END_TURN}\n`,
      stderr: "Error: max turns reached",
      log: NOISE,
      code: 0,
      turnCap: null,
    }),
    null,
  );

  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "build-run.json"),
      `${JSON.stringify({
        promptId: "001",
        status: "passed",
        model: "grok-4.7-build-fast",
        effort: "xhigh",
        startedAt: "2026-10-19T00:00:00.000Z",
        elapsedMs: 1,
        lastLines: [],
        filesWritten: [],
        reason: "",
        pid: null,
        recovery: "",
        recoveryRerun: false,
      })}\n`,
    );
    const run = readBuildRun(dir);
    assert.equal(run?.turns, null);
    assert.equal(run?.turnCap, null);
    assert.equal(run?.stopReason, "");
    assert.equal(run?.sessionId, "");
    assert.equal(run?.autoRetried, false);
    assert.equal(run?.turnLimited, false);
  } finally {
    removeTempDir(dir);
  }
});
