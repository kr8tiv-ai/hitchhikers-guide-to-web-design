/**
 * One drive loop against a fixture spawn.
 *
 * CI exercises Eddie without a live model: three site prompts, the review
 * schedule inserts, a stub build process, then the queue and STATE on disk.
 * The review reads fixture gate results in the registry shape and calls
 * decideReview. A blocker escalates. A pass reaches the ship gate.
 * The program name is fixture-spawn. This module does not open a socket,
 * push, deploy, or start Mostly Harmless.
 *
 * The approval object is `.hitchhiker/drive-approval.json`. The test writes
 * it. runFixture's signature has no approval argument, so that file is the
 * object. Only `approved: true` passes preflight. Hash checks stay in the
 * engine gate. This file does not copy them.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { runGate } from "@hitchhiker/engine";
import { decideReview, gatesJsonPath, type GateStatus } from "@hitchhiker/qa";
import { effortForTier } from "./effort.ts";
import { evaluateCommand } from "./policy.ts";
import { preflight } from "./preflight.ts";
import { advance } from "./progress.ts";
import { loadQueue, saveQueue, type QueueFile, type QueueStatus } from "./queue-file.ts";
import { DEFAULT_MODEL, RunFailed, runPrompt, type RunRequest, type SpawnImpl } from "./runner.ts";
import { insertReviews } from "./schedule.ts";
import { classifyRun } from "./sensors.ts";
import { shipGate, type ShipGateResult } from "./ship-gate.ts";
import { decideTriage } from "./triage.ts";

export class FixtureRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureRunError";
  }
}

const FIXTURE_DATE = "2026-10-07";
const FIXTURE_BIN = "fixture-spawn";
/** Commit a green fixture build records. The gate file head must match it. */
export const FIXTURE_COMMIT = "abc1234";

/** Three prompts times the four-attempt cap. A fifth wave means the loop is stuck. */
const SPAWN_CAP = 12;

const PROMPTS: Array<{ id: string; phase: string }> = [
  { id: "001", phase: "improbability-drive" },
  { id: "002", phase: "improbability-drive" },
  { id: "003", phase: "improbability-drive" },
];

interface Tally {
  passed: number;
  retried: number;
}

function approvalPath(dir: string): string {
  return path.join(dir, ".hitchhiker", "drive-approval.json");
}

function readApproved(dir: string): boolean {
  const file = approvalPath(dir);
  if (!existsSync(file)) {
    throw new FixtureRunError("Missing drive approval. A missing file is not a yes.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (error: unknown) {
    if (error instanceof FixtureRunError) throw error;
    throw new FixtureRunError("drive-approval.json is not JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new FixtureRunError("Drive approval must be an object.");
  }
  return (raw as { approved?: unknown }).approved === true;
}

interface FixtureGateRow {
  id: string;
  status: GateStatus;
  reason: string;
}

type LoadedGates =
  | { ok: true; fixRound: 0 | 1 | 2; results: FixtureGateRow[] }
  | { ok: false; reason: string };

/**
 * Registry-shaped results from `.hitchhiker/qa/GATES.json`.
 * decideReview is the verdict. A missing or unreadable file cannot pass.
 */
function loadFixtureGates(dir: string): LoadedGates {
  const file = gatesJsonPath(dir);
  if (!existsSync(file)) {
    return {
      ok: false,
      reason: "The quality check for this site is missing, so the fixture review is ESCALATE.",
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return {
      ok: false,
      reason: "The quality check could not be read, so the fixture review is ESCALATE.",
    };
  }
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return {
      ok: false,
      reason: "The quality check could not be read, so the fixture review is ESCALATE.",
    };
  }
  const fixRound = readFixRound(value.fixRound);
  if (fixRound === null) {
    return {
      ok: false,
      reason: "The quality check does not say which repair round this is, so the fixture review is ESCALATE.",
    };
  }
  const results: FixtureGateRow[] = [];
  for (const item of value.results) {
    const row = readGateRow(item);
    if (row === null) {
      return {
        ok: false,
        reason: "The quality check has a result we cannot read, so the fixture review is ESCALATE.",
      };
    }
    results.push(row);
  }
  return { ok: true, fixRound, results };
}

function reviewFromGates(results: readonly FixtureGateRow[], fixRound: 0 | 1 | 2) {
  let worst: "PASS" | "FIX" | "BLOCKER" = "PASS";
  for (const row of results) {
    if (row.status === "BLOCKER") {
      worst = "BLOCKER";
      break;
    }
    if (row.status === "FIX") worst = "FIX";
  }
  return decideReview({
    truthStatuses: ["FOUND"],
    worstPillar: worst,
    slopHits: 0,
    fixRound,
    boots: true,
  });
}

function escalateLine(results: readonly FixtureGateRow[]): string {
  const reasons = results.filter((row) => row.status === "BLOCKER").map((row) => oneLine(row.reason));
  const lead = "The fixture review is ESCALATE.";
  if (reasons.length === 0) return `${lead} Launch stays closed.`;
  return `${lead} ${reasons.join(" ")}`;
}

function initialQueue(items: ReturnType<typeof insertReviews>): QueueFile {
  return {
    items: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: "queued",
    })),
  };
}

async function mark(dir: string, id: string, status: QueueStatus): Promise<void> {
  const queue = await loadQueue(dir);
  if (queue === null) {
    throw new FixtureRunError("Queue file is missing.");
  }
  const items = queue.items.map((item) =>
    item.id === id
      ? { id: item.id, kind: item.kind, status }
      : { id: item.id, kind: item.kind, status: item.status },
  );
  await saveQueue(dir, { items });
}

/**
 * Deny list runs before the stub. A push never reaches spawnImpl.
 * The program name is refused when it is the live client.
 */
function guardSpawn(dir: string, spawnImpl: SpawnImpl): SpawnImpl {
  let calls = 0;
  return async (argv) => {
    calls += 1;
    if (calls > SPAWN_CAP) {
      throw new FixtureRunError("Spawn cap reached. The drive stops.");
    }
    const decision = evaluateCommand({ argv: [...argv], projectRoot: dir });
    if (decision.decision === "deny") {
      throw new FixtureRunError(decision.reason);
    }
    const bin = argv[0];
    if (bin === undefined || bin === "" || bin === "grok") {
      throw new FixtureRunError("Fixture spawn must not be grok.");
    }
    return spawnImpl(argv);
  };
}

function buildRequest(dir: string, id: string, effort: RunRequest["effort"]): RunRequest {
  return {
    model: DEFAULT_MODEL,
    cwd: dir,
    promptText: `Build fixture prompt ${id}.`,
    bin: FIXTURE_BIN,
    promptPath: path.join(dir, "prompts", `${id}.md`),
    effort,
    maxTurns: 24,
    sessionMode: "alias",
    approved: true,
  };
}

async function stopFailed(
  dir: string,
  id: string,
  action: { type: "rollback"; ref: string } | { type: "escalate"; reason: string } | { type: "stop"; note: string },
): Promise<never> {
  if (action.type === "stop") {
    throw new FixtureRunError(action.note);
  }
  await advance({
    projectDir: dir,
    finishedId: id,
    outcome: "escalated",
    commit: null,
  });
  if (action.type === "rollback") {
    throw new FixtureRunError(`Rollback to ${action.ref}. The drive stops.`);
  }
  throw new FixtureRunError(action.reason);
}

async function runBuild(
  dir: string,
  id: string,
  backup: string,
  spawnImpl: SpawnImpl,
  tally: Tally,
): Promise<void> {
  let attempt = 1;
  let effort = effortForTier("Heart of Gold");
  while (attempt <= 4) {
    await mark(dir, id, "running");
    try {
      await runPrompt(buildRequest(dir, id, effort), spawnImpl);
      const verdict = classifyRun([{ t: 0, kind: "exit", code: 0 }], 0);
      const action = decideTriage({
        verdict,
        attempt,
        rule: 1,
        packageFailed: false,
        promptId: id,
        tags: [],
        backup,
        effort,
      });
      if (action.type !== "stop") {
        throw new FixtureRunError("A green run did not stop.");
      }
      await runGate(dir, FIXTURE_COMMIT, async () => ({
        passed: true,
        summary: `Finished ${id}.`,
      }));
      await advance({
        projectDir: dir,
        finishedId: id,
        outcome: "passed",
        commit: FIXTURE_COMMIT,
      });
      tally.passed += 1;
      return;
    } catch (error: unknown) {
      if (!(error instanceof RunFailed)) throw error;
      const verdict = classifyRun([{ t: 0, kind: "exit", code: error.code, text: error.stderr }], 0);
      const action = decideTriage({
        verdict,
        attempt,
        rule: 1,
        packageFailed: false,
        promptId: id,
        tags: [],
        backup,
        effort,
      });
      if (action.type === "retry") {
        tally.retried += 1;
        effort = action.effort;
        attempt += 1;
        await mark(dir, id, "fixing");
        continue;
      }
      await stopFailed(dir, id, action);
    }
  }
  throw new FixtureRunError("The drive stopped after the attempt cap.");
}

export async function runFixture(
  dir: string,
  spawnImpl: SpawnImpl,
): Promise<{ passed: number; retried: number; ship: ShipGateResult }> {
  if (typeof dir !== "string" || dir.trim() === "") {
    throw new FixtureRunError("Project directory is missing.");
  }
  const approved = readApproved(dir);
  const gate = preflight({
    approved,
    statusPorcelain: "",
    date: FIXTURE_DATE,
    serverProbe: () => true,
    ...(approved ? { projectRoot: dir } : {}),
  });
  if (!gate.ok) {
    throw new FixtureRunError(gate.reasons.join(" "));
  }

  const scheduled = insertReviews(PROMPTS);
  await saveQueue(dir, initialQueue(scheduled));
  const guarded = guardSpawn(dir, spawnImpl);
  const tally: Tally = { passed: 0, retried: 0 };

  for (const item of scheduled) {
    if (item.kind === "review") {
      await reviewItem(dir, item.id, tally);
      continue;
    }
    await runBuild(dir, item.id, gate.backup, guarded, tally);
  }

  const ship = await shipGate(dir, FIXTURE_COMMIT);
  if (!ship.ok) {
    throw new FixtureRunError(ship.reasons.join(" "));
  }
  return { passed: tally.passed, retried: tally.retried, ship };
}

async function reviewItem(dir: string, id: string, tally: Tally): Promise<void> {
  const loaded = loadFixtureGates(dir);
  if (!loaded.ok) {
    await mark(dir, id, "running");
    await stopFailed(dir, id, { type: "escalate", reason: loaded.reason });
  }
  if (!loaded.ok) return;
  const decision = reviewFromGates(loaded.results, loaded.fixRound);
  if (decision.verdict === "ESCALATE") {
    await mark(dir, id, "running");
    await stopFailed(dir, id, { type: "escalate", reason: escalateLine(loaded.results) });
  }
  if (decision.verdict !== "PASS" && decision.verdict !== "PASS_WITH_KNOWN_ISSUES") {
    throw new FixtureRunError("The fixture reviewer did not pass.");
  }
  await mark(dir, id, "running");
  await advance({
    projectDir: dir,
    finishedId: id,
    outcome: "passed",
    commit: null,
  });
  tally.passed += 1;
}

function readFixRound(value: unknown): 0 | 1 | 2 | null {
  if (value === undefined) return 0;
  if (value === 0 || value === 1 || value === 2) return value;
  return null;
}

function readGateRow(value: unknown): FixtureGateRow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (!isStatus(value.status)) return null;
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) return null;
  return { id: value.id, status: value.status, reason: oneLine(value.reason) };
}

function isStatus(value: unknown): value is GateStatus {
  return value === "PASS" || value === "FIX" || value === "BLOCKER";
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
