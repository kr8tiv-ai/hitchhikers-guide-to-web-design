/**
 * Bounded Elevate loop (spec 243-02, E1).
 *
 * Wraps one elevateRound. That round already sends each accepted pick
 * through runElevate. After every round, runAllGates rewrites GATES.json
 * for the current commit. The loop then stops or continues.
 *
 * Stop rules, in order: any ESCALATE, no accepted picks, a score plateau,
 * then the round limit. A plateau is a gain under 0.3 on both the design
 * score and the jury score across the last two rounds. A gain of 0.3
 * keeps going. One climbing score keeps going. Reasons are sentences a
 * non-programmer can read.
 *
 * Runners, scores, and the verdict are injected. This file does not open
 * a browser and does not spawn a process.
 */

import path from "node:path";
import type { ElevateItem } from "./elevate.ts";
import { elevateRound, type ElevateRoundDeps, type ElevateRoundResult } from "./elevate-loop.ts";
import { runAllGates, type GateReport, type GateRunners } from "./gates/registry.ts";

/** Default round limit. */
export const DEFAULT_ELEVATE_ROUNDS = 3;

/**
 * Smallest gain that is still progress. Anything under this, on both
 * scores, over the last two rounds, is a plateau.
 */
export const ELEVATE_SCORE_GAIN = 0.3;

export type ElevateStopRule = "no-picks" | "max-rounds" | "plateau" | "escalate" | "caller";

export interface ElevateScores {
  beauty: number;
  jury: number;
}

export interface ElevateStop {
  rule: ElevateStopRule;
  reason: string;
}

export interface ElevateLoopSnapshot {
  round: number;
  maxRounds: number;
  /** Planned upgrades the caller accepted this round. */
  accepted: number;
  applied: readonly string[];
  refused: ElevateRoundResult["refused"];
  scores: ElevateScores;
  /** Scores after each finished round, including this one. */
  history: readonly ElevateScores[];
  verdict: string;
  /** Commit runAllGates wrote into GATES.json. */
  head: string;
}

export interface RunElevateLoopInput {
  projectDir: string;
  /** How many rounds to allow. The default is 3. */
  maxRounds?: number;
  /**
   * Extra stop after the four built-in rules. Return a stop to end the
   * loop, or null to keep going.
   */
  stopWhen?: (snapshot: ElevateLoopSnapshot) => ElevateStop | null;
  /** Deps for one elevateRound. */
  deps: ElevateRoundDeps;
  /** Spec 01 runners. Injected. */
  runners: GateRunners;
  /** Design score and jury score after this round. */
  scores: (round: number) => ElevateScores | Promise<ElevateScores>;
  /** Review verdict after this round. The word ESCALATE stops the loop. */
  verdict: (round: number) => string | Promise<string>;
}

export interface ElevateLoopResult {
  roundsRun: number;
  stop: ElevateStop;
  snapshots: readonly ElevateLoopSnapshot[];
  gates: GateReport;
}

const RUNNER_KEYS = [
  "typeAudit",
  "palette",
  "spacing",
  "contrast",
  "imagery",
  "motion",
  "copyText",
  "device",
  "console",
  "links",
  "a11y",
  "lighthouse",
  "weight",
] as const satisfies readonly (keyof GateRunners)[];

const STOP_RULES = new Set<ElevateStopRule>(["no-picks", "max-rounds", "plateau", "escalate", "caller"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calm(value: string): string {
  return value.replaceAll("!", ".").replaceAll("\u2014", "-").replace(/[\r\n]+/g, " ").trim();
}

function pairKey(file: string, change: string): string {
  return `${file.trim()}\0${change.trim()}`;
}

/** Planned upgrades the caller actually said yes to. Strangers do not count. */
function countAccepted(planned: readonly ElevateItem[], chosen: readonly ElevateItem[]): number {
  const keys = new Set(planned.map((item) => pairKey(item.file, item.change)));
  const seen = new Set<string>();
  for (const item of chosen) {
    if (typeof item.file !== "string" || typeof item.change !== "string") continue;
    const key = pairKey(item.file, item.change);
    if (!keys.has(key) || seen.has(key)) continue;
    seen.add(key);
  }
  return seen.size;
}

function escalated(verdict: string): boolean {
  return verdict.split(/[^A-Za-z_]+/).includes("ESCALATE");
}

/** Round tenths. Float noise around 0.3 still counts as 0.3. */
function roundedGain(later: number, earlier: number): number {
  return Math.round((later - earlier) * 10_000) / 10_000;
}

function gainUnder(later: number, earlier: number): boolean {
  return roundedGain(later, earlier) < ELEVATE_SCORE_GAIN;
}

/**
 * Both scores flat across the last two rounds. One round is too soon
 * to call. A gain of 0.3 on either score is still progress.
 */
function plateaued(history: readonly ElevateScores[]): boolean {
  if (history.length < 2) return false;
  const latest = history[history.length - 1];
  const earlier = history[history.length - 2];
  if (latest === undefined || earlier === undefined) return false;
  return gainUnder(latest.beauty, earlier.beauty) && gainUnder(latest.jury, earlier.jury);
}

/**
 * The four stop rules. Null means the loop may run another round.
 * ESCALATE wins, then no accepted picks, then a plateau, then the limit.
 */
export function elevateStopWhen(snapshot: ElevateLoopSnapshot): ElevateStop | null {
  if (escalated(snapshot.verdict)) {
    return {
      rule: "escalate",
      reason: "This round needs a person to decide what happens next, so the improvements stop.",
    };
  }
  if (snapshot.accepted === 0) {
    return {
      rule: "no-picks",
      reason: "Nothing was chosen this round, so the improvements stop.",
    };
  }
  if (plateaued(snapshot.history)) {
    return {
      rule: "plateau",
      reason: "The design score and the jury score barely moved over the last two rounds, so the improvements stop.",
    };
  }
  if (snapshot.round >= snapshot.maxRounds) {
    return {
      rule: "max-rounds",
      reason: "The improvements have used every round they are allowed.",
    };
  }
  return null;
}

function assertLoopInput(
  projectDir: string,
  maxRounds: number,
  runners: GateRunners,
  scores: RunElevateLoopInput["scores"],
  verdict: RunElevateLoopInput["verdict"],
  stopWhen: RunElevateLoopInput["stopWhen"],
): void {
  if (typeof projectDir !== "string" || projectDir.trim().length === 0) {
    throw new Error("The project folder is missing, so the improvements cannot start.");
  }
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new Error("Choose at least one round of improvements.");
  }
  if (typeof scores !== "function" || typeof verdict !== "function") {
    throw new Error("Each round needs a design score, a jury score, and a review result.");
  }
  if (stopWhen !== undefined && typeof stopWhen !== "function") {
    throw new Error("The extra stop rule needs to be a check.");
  }
  if (!isRecord(runners)) {
    throw new Error("The quality check needs its measurements before a round can finish.");
  }
  for (const key of RUNNER_KEYS) {
    if (typeof runners[key] !== "function") {
      throw new Error("The quality check needs its measurements before a round can finish.");
    }
  }
}

function readScores(value: unknown): ElevateScores {
  if (!isRecord(value) || typeof value.beauty !== "number" || typeof value.jury !== "number") {
    throw new Error("The design score and the jury score need to be numbers before the next round.");
  }
  if (!Number.isFinite(value.beauty) || !Number.isFinite(value.jury)) {
    throw new Error("The design score and the jury score need to be numbers before the next round.");
  }
  return { beauty: value.beauty, jury: value.jury };
}

function readVerdict(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("The review did not say how this round turned out.");
  }
  return value.trim();
}

function readExtra(value: unknown): ElevateStop | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.rule !== "string" || typeof value.reason !== "string") {
    throw new Error("The extra stop rule did not say why the improvements should stop.");
  }
  if (!STOP_RULES.has(value.rule as ElevateStopRule)) {
    throw new Error("The extra stop rule did not say why the improvements should stop.");
  }
  const reason = calm(value.reason);
  if (reason.length === 0) return null;
  return { rule: value.rule as ElevateStopRule, reason };
}

function snapshotOf(
  round: number,
  maxRounds: number,
  accepted: number,
  result: ElevateRoundResult,
  scores: ElevateScores,
  history: readonly ElevateScores[],
  verdict: string,
  head: string,
): ElevateLoopSnapshot {
  return {
    round,
    maxRounds,
    accepted,
    applied: [...result.applied],
    refused: result.refused.map((row) => ({ id: row.id, reason: row.reason })),
    scores,
    history,
    verdict,
    head,
  };
}

/**
 * Run Elevate until a stop rule fires. maxRounds defaults to 3.
 * Each round is one elevateRound, then runAllGates, so GATES.json
 * names the commit that round left behind.
 */
export async function runElevateLoop({
  projectDir,
  maxRounds = 3,
  stopWhen,
  deps,
  runners,
  scores,
  verdict,
}: RunElevateLoopInput): Promise<ElevateLoopResult> {
  assertLoopInput(projectDir, maxRounds, runners, scores, verdict, stopWhen);
  const root = path.resolve(projectDir);
  const history: ElevateScores[] = [];
  const snapshots: ElevateLoopSnapshot[] = [];
  let gates: GateReport | null = null;
  let accepted = 0;
  const roundDeps: ElevateRoundDeps = {
    ...deps,
    pick: async (items) => {
      const chosen = await deps.pick(items);
      accepted = countAccepted(items, chosen);
      return chosen;
    },
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    accepted = 0;
    const result = await elevateRound(root, roundDeps);
    gates = await runAllGates({ root }, runners);
    const point = readScores(await scores(round));
    const review = readVerdict(await verdict(round));
    history.push(point);
    const snapshot = snapshotOf(round, maxRounds, accepted, result, point, history.slice(), review, gates.head);
    snapshots.push(snapshot);
    const builtIn = elevateStopWhen(snapshot);
    const extra = builtIn === null && stopWhen !== undefined ? readExtra(stopWhen(snapshot)) : null;
    const stop = builtIn ?? extra;
    if (stop !== null) {
      return { roundsRun: round, stop, snapshots, gates };
    }
  }

  if (gates === null) {
    throw new Error("Choose at least one round of improvements.");
  }
  return {
    roundsRun: maxRounds,
    stop: {
      rule: "max-rounds",
      reason: "The improvements have used every round they are allowed.",
    },
    snapshots,
    gates,
  };
}
