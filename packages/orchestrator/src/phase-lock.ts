/**
 * One transition table for the six steps.
 *
 * discovery -> brief -> design -> build -> elevate -> so-long
 *
 * progress.ts, runner.ts, and schedule.ts use this table.
 * hh brief, hh elevate, hh so-long, hh build, and the desk buttons
 * enter through `enterFlow`. A step that is not on the table returns
 * a plain sentence and does not move the saved step.
 *
 * Publishing (so-long with publish: true) also needs a passing ship gate.
 * This file does not call a host and does not read a keychain.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadState, replaceViaTemp } from "@hitchhiker/engine";
import { gatesJsonPath } from "@hitchhiker/qa";

export const FLOW_PHASES = ["discovery", "brief", "design", "build", "elevate", "so-long"] as const;

export type FlowPhase = (typeof FLOW_PHASES)[number];

export type FlowFrom = FlowPhase | "start";

export interface FlowEdge {
  from: FlowFrom;
  to: FlowPhase;
  /** True when a publishing entry on this edge must pass the ship gate. */
  shipGate: boolean;
}

/**
 * Legal edges. Stay, one step forward, or one step back.
 * The opening edge is start -> discovery.
 * Elevate returns to the build. That edge is elevate -> build.
 * so-long is the only step that can require the ship gate.
 */
export const FLOW_TRANSITIONS: readonly FlowEdge[] = [
  { from: "start", to: "discovery", shipGate: false },
  { from: "discovery", to: "discovery", shipGate: false },
  { from: "discovery", to: "brief", shipGate: false },
  { from: "brief", to: "discovery", shipGate: false },
  { from: "brief", to: "brief", shipGate: false },
  { from: "brief", to: "design", shipGate: false },
  { from: "design", to: "brief", shipGate: false },
  { from: "design", to: "design", shipGate: false },
  { from: "design", to: "build", shipGate: false },
  { from: "build", to: "design", shipGate: false },
  { from: "build", to: "build", shipGate: false },
  { from: "build", to: "elevate", shipGate: false },
  { from: "elevate", to: "build", shipGate: false },
  { from: "elevate", to: "elevate", shipGate: false },
  { from: "elevate", to: "so-long", shipGate: true },
  { from: "so-long", to: "elevate", shipGate: false },
  { from: "so-long", to: "so-long", shipGate: true },
];

export interface FlowRequest {
  from: FlowFrom;
  to: FlowPhase;
  /** True when this entry would publish or open a preview. */
  publish?: boolean;
  /** True only after the ship gate has already passed. */
  shipGateOk?: boolean;
}

export interface FlowDecision {
  ok: boolean;
  from: FlowFrom;
  to: FlowPhase;
  reason: string;
}

export interface EnterFlowOptions {
  publish?: boolean;
  shipGateOk?: boolean;
  /** False leaves `.hitchhiker/flow.json` where it was. */
  write?: boolean;
}

const GUIDE_TO_FLOW: Record<string, FlowPhase> = {
  "Don't Panic": "discovery",
  "Babel Fish": "design",
  "Deep Thought": "design",
  "Improbability Drive": "build",
  "Mostly Harmless": "elevate",
  "So Long and Thanks for All the Fish": "so-long",
};

const STEP_BEFORE: Record<FlowPhase, FlowFrom> = {
  discovery: "start",
  brief: "discovery",
  design: "brief",
  build: "design",
  elevate: "build",
  "so-long": "elevate",
};

const QUALITY = "The quality check has to pass before the site can go live.";

export function requestFlowTransition(input: FlowRequest): FlowDecision {
  const to = input.to;
  if (!isPhase(to)) {
    return { ok: false, from: "start", to: "discovery", reason: "That step is not part of this guide." };
  }
  const from = isFrom(input.from) ? input.from : "start";
  if (!isFrom(input.from)) {
    return { ok: false, from, to, reason: "That step is not part of this guide." };
  }
  const edge = FLOW_TRANSITIONS.find((item) => item.from === from && item.to === to);
  if (edge === undefined) {
    return { ok: false, from, to, reason: refusal(from, to) };
  }
  if (edge.shipGate && input.publish === true && input.shipGateOk !== true) {
    return { ok: false, from, to, reason: QUALITY };
  }
  return { ok: true, from, to, reason: "" };
}

/**
 * Stay on the Guide phase name the queue already uses.
 * Unknown names do not block the queue. They are not a new step.
 */
export function holdGuidePhase(guidePhase: string): FlowDecision {
  const flow = GUIDE_TO_FLOW[guidePhase];
  if (flow === undefined) {
    return requestFlowTransition({ from: "build", to: "build" });
  }
  return requestFlowTransition({ from: flow, to: flow });
}

export function flowFilePath(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "flow.json");
}

/**
 * Where the project stands.
 * A saved flow file wins.
 * Otherwise the furthest honest evidence wins: the Guide phase, the brief,
 * an approved plan, a build queue, or a quality-check file when the project
 * has not started or is already in the build.
 */
export function readFlowFrom(projectDir: string): FlowFrom | "unreadable" {
  const saved = readSaved(projectDir);
  if (saved === "unreadable") return "unreadable";
  if (saved !== null) return saved;
  return evidencePhase(projectDir);
}

/**
 * Ask the table, then save the step when the move is legal.
 * A project with no saved step and no evidence may take the command you
 * typed, standing one step before it, except publish. Publish is refused
 * until a real step or a quality-check file says you are there, and a
 * publishing entry still needs the ship gate.
 */
export async function enterFlow(
  projectDir: string,
  to: FlowPhase,
  options: EnterFlowOptions = {},
): Promise<FlowDecision> {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    return { ok: false, from: "start", to, reason: "The project folder is missing, so nothing moved." };
  }
  if (!isPhase(to)) {
    return { ok: false, from: "start", to: "discovery", reason: "That step is not part of this guide." };
  }
  const recorded = readFlowFrom(projectDir);
  if (recorded === "unreadable") {
    return { ok: false, from: "start", to, reason: "The saved step could not be read, so nothing moved." };
  }
  const from = recorded === "start" && to !== "so-long" ? STEP_BEFORE[to] : recorded;
  const request: FlowRequest = { from, to };
  if (options.publish === true) request.publish = true;
  if (options.shipGateOk === true) request.shipGateOk = true;
  const decision = requestFlowTransition(request);
  if (!decision.ok || options.write === false) return decision;
  try {
    await writeFlow(projectDir, to);
  } catch {
    return { ok: false, from, to, reason: "The step could not be saved, so nothing moved." };
  }
  return decision;
}

function refusal(from: FlowFrom, to: FlowPhase): string {
  const fromRank = rank(from);
  const toRank = rank(to);
  if (toRank > fromRank + 1) return forwardSkip(from, to);
  if (fromRank > toRank + 1) return "Go back one step at a time.";
  return "Finish the earlier step before moving on.";
}

function forwardSkip(from: FlowFrom, to: FlowPhase): string {
  if (to === "build" && (from === "start" || from === "discovery")) {
    return "Finish the brief before building.";
  }
  if (to === "build") return "Finish the design before building.";
  if (to === "design") return "Finish the brief before the design.";
  if (to === "elevate" && (from === "design" || from === "build")) {
    return "Finish the build before Elevate.";
  }
  if (to === "elevate") return "Finish the brief before Elevate.";
  if (to === "so-long" && from === "build") return "Finish Elevate before publishing.";
  if (to === "so-long" && (from === "design" || from === "elevate")) {
    return "Finish the build before publishing.";
  }
  if (to === "so-long") return "Finish the brief before publishing.";
  if (to === "brief") return "Start with the interview before the brief.";
  return "Finish the earlier step before moving on.";
}

function evidencePhase(projectDir: string): FlowFrom {
  const guide = guidePhase(projectDir);
  const artifact = artifactPhase(projectDir);
  let phase = further(guide, artifact);
  if (gatesPresent(projectDir) && (phase === "start" || rank(phase) >= rank("build"))) {
    phase = further(phase, "elevate");
  }
  return phase;
}

function guidePhase(projectDir: string): FlowFrom {
  let state: ReturnType<typeof loadState>;
  try {
    state = loadState(projectDir);
  } catch {
    return "start";
  }
  if (state === null) return "start";
  return GUIDE_TO_FLOW[state.phase] ?? "start";
}

function artifactPhase(projectDir: string): FlowFrom {
  const pending = readPending(projectDir);
  if (pending?.buildStarted === true) return "build";
  if (existsSync(path.join(projectDir, ".hitchhiker", "queue.json"))) return "build";
  if (existsSync(path.join(projectDir, ".hitchhiker", "build-run.json"))) return "build";
  if (pending?.planApproved === true) return "design";
  if (existsSync(path.join(projectDir, ".hitchhiker", "design-stages.json"))) return "design";
  if (pending !== null && pending.status !== "idle") return "brief";
  if (existsSync(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"))) return "brief";
  return "start";
}

function gatesPresent(projectDir: string): boolean {
  try {
    return existsSync(gatesJsonPath(projectDir));
  } catch {
    return false;
  }
}

interface PendingFlags {
  status: string;
  planApproved: boolean;
  buildStarted: boolean;
}

function readPending(projectDir: string): PendingFlags | null {
  const file = path.join(projectDir, ".hitchhiker", "brief-pending.json");
  if (!existsSync(file)) return null;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const status = typeof value.status === "string" ? value.status : "idle";
  return {
    status,
    planApproved: value.planApproved === true,
    buildStarted: value.buildStarted === true,
  };
}

function readSaved(projectDir: string): FlowPhase | "unreadable" | null {
  const file = flowFilePath(projectDir);
  if (!existsSync(file)) return null;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return "unreadable";
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "unreadable";
  }
  if (!isRecord(value) || !isPhase(value.phase)) return "unreadable";
  return value.phase;
}

async function writeFlow(projectDir: string, phase: FlowPhase): Promise<void> {
  const file = flowFilePath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  await replaceViaTemp(file, `${JSON.stringify({ phase }, null, 2)}\n`);
}

function further(left: FlowFrom, right: FlowFrom): FlowFrom {
  return rank(left) >= rank(right) ? left : right;
}

function rank(phase: FlowFrom): number {
  if (phase === "start") return -1;
  return FLOW_PHASES.indexOf(phase);
}

function isPhase(value: unknown): value is FlowPhase {
  return typeof value === "string" && (FLOW_PHASES as readonly string[]).includes(value);
}

function isFrom(value: unknown): value is FlowFrom {
  return value === "start" || isPhase(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
