/**
 * Ship gate for phase 6 (spec 243, G2).
 *
 * Reads `.hitchhiker/qa/GATES.json` for this project and this commit.
 * Launch stays closed when the file is missing, the commit does not match,
 * any check is blocked, or a fix is still open before round 2.
 * A pass with known issues, the same rule as decideReview in verdict.ts,
 * may launch only when nothing is blocked.
 *
 * beginPhaseSix is the phase-6 entry. It calls this gate before the
 * deploy hook and the launch-kit hook. The caller confirms the host
 * first. Hostinger is the default. This file does not contact a host.
 */

import { readFile } from "node:fs/promises";
import {
  decideReview,
  GATE_IDS,
  gatesJsonPath,
  type GateId,
  type GateStatus,
} from "@hitchhiker/qa";
import { enterFlow } from "./phase-lock.ts";
import { noteShipRefusal } from "./progress.ts";

export interface ShipGateResult {
  ok: boolean;
  reasons: string[];
}

export interface PhaseSixHooks {
  /** Already confirmed by the caller. Hostinger is the default host. */
  deploy: () => Promise<void> | void;
  launchKit: () => Promise<void> | void;
}

interface ParsedResult {
  id: string;
  status: GateStatus;
  reason: string;
}

interface ParsedReport {
  fixRound: 0 | 1 | 2;
  verdict: string | null;
  results: ParsedResult[];
}

const KNOWN_ISSUES = "PASS_WITH_KNOWN_ISSUES";

const PLAIN_NAME: Record<GateId, string> = {
  fonts: "fonts",
  "type-scale": "the type scale",
  spacing: "spacing",
  color: "color",
  imagery: "the pictures",
  motion: "motion",
  "3d": "the 3D scene",
  copy: "the words",
  device: "phones, tablets, and desktops",
  accessibility: "accessibility",
  speed: "speed",
};

const GATE_ID_SET = new Set<string>(GATE_IDS);

export async function shipGate(projectDir: string, head: string): Promise<ShipGateResult> {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    return refuse(["The project folder is missing, so launch stays closed."]);
  }
  if (typeof head !== "string" || head.length === 0) {
    return refuse(["This launch does not name the version it is checking, so launch stays closed."]);
  }
  const read = await readReport(projectDir, head);
  if (read.kind === "refuse") return refuse(read.reasons);
  return judge(read.report);
}

/**
 * Phase 6 entry. Deploy and the launch kit run only after the ship gate passes.
 * A refusal is written onto the project state and neither hook is called.
 */
export async function beginPhaseSix(
  projectDir: string,
  head: string,
  hooks: PhaseSixHooks,
): Promise<ShipGateResult> {
  const place = await enterFlow(projectDir, "so-long", { publish: false, write: false });
  if (!place.ok) {
    return { ok: false, reasons: [place.reason] };
  }
  const gate = await shipGate(projectDir, head);
  if (!gate.ok) {
    await noteShipRefusal(projectDir, gate.reasons);
    return gate;
  }
  const publishing = await enterFlow(projectDir, "so-long", { publish: true, shipGateOk: true });
  if (!publishing.ok) {
    await noteShipRefusal(projectDir, [publishing.reason]);
    return { ok: false, reasons: [publishing.reason] };
  }
  if (typeof hooks.deploy !== "function" || typeof hooks.launchKit !== "function") {
    throw new Error("Phase 6 needs a deploy hook and a launch kit hook.");
  }
  await hooks.deploy();
  await hooks.launchKit();
  return gate;
}

function judge(report: ParsedReport): ShipGateResult {
  const knownIds = new Set<string>();
  const duplicates: string[] = [];
  const unknown: string[] = [];
  const problems: string[] = [];

  for (const result of report.results) {
    if (!GATE_ID_SET.has(result.id)) {
      unknown.push(result.id);
      continue;
    }
    if (knownIds.has(result.id)) {
      duplicates.push(result.id);
      continue;
    }
    knownIds.add(result.id);
  }

  const known = report.results.filter((result) => knownIds.has(result.id) && GATE_ID_SET.has(result.id));
  const firstOf = new Map<string, ParsedResult>();
  for (const result of known) {
    if (!firstOf.has(result.id)) firstOf.set(result.id, result);
  }
  const results = GATE_IDS.map((id) => firstOf.get(id)).filter((result): result is ParsedResult => result !== undefined);

  const missing = GATE_IDS.filter((id) => !firstOf.has(id));
  if (missing.length > 0) {
    problems.push(
      `The quality check did not look at ${joinList(missing.map((id) => PLAIN_NAME[id]))}, so launch stays closed.`,
    );
  }
  if (duplicates.length > 0) {
    problems.push(
      `The quality check lists ${joinList(unique(duplicates).map(plainId))} more than once, so launch stays closed.`,
    );
  }
  if (unknown.length > 0) {
    problems.push("The quality check names a check this launch does not understand, so launch stays closed.");
  }

  const blockers = results.filter((result) => result.status === "BLOCKER");
  const fixes = results.filter((result) => result.status === "FIX");
  const decision = decideReview({
    truthStatuses: ["FOUND"],
    worstPillar: blockers.length > 0 ? "BLOCKER" : fixes.length > 0 ? "FIX" : "PASS",
    slopHits: 0,
    fixRound: report.fixRound,
    boots: true,
  });

  if (blockers.length > 0 || decision.verdict === "ESCALATE") {
    if (report.verdict === KNOWN_ISSUES) {
      problems.push("A pass with known issues cannot launch while a check is blocked.");
    }
    for (const result of blockers) problems.push(result.reason);
  }
  if (decision.verdict === "FIX" || (fixes.length > 0 && report.fixRound < 2)) {
    problems.push("This still needs a fix before launch.");
    for (const result of fixes) problems.push(result.reason);
  }

  if (problems.length > 0) return refuse(problems);
  if (decision.verdict === "PASS" || decision.verdict === KNOWN_ISSUES) {
    return { ok: true, reasons: [] };
  }
  return refuse(["Launch stays closed."]);
}

async function readReport(
  projectDir: string,
  head: string,
): Promise<{ kind: "refuse"; reasons: string[] } | { kind: "report"; report: ParsedReport }> {
  let raw: string;
  try {
    raw = await readFile(gatesJsonPath(projectDir), "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") {
      return { kind: "refuse", reasons: ["The quality check for this site is missing, so launch stays closed."] };
    }
    return { kind: "refuse", reasons: ["The quality check could not be read, so launch stays closed."] };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "refuse", reasons: ["The quality check could not be read, so launch stays closed."] };
  }
  if (!isRecord(value)) {
    return { kind: "refuse", reasons: ["The quality check could not be read, so launch stays closed."] };
  }
  if (typeof value.head !== "string" || value.head !== head) {
    return {
      kind: "refuse",
      reasons: ["The quality check is for a different version of this site, so launch stays closed."],
    };
  }
  const fixRound = readFixRound(value.fixRound);
  if (fixRound === null) {
    return {
      kind: "refuse",
      reasons: ["The quality check does not say which repair round this is, so launch stays closed."],
    };
  }
  if (!Array.isArray(value.results)) {
    return { kind: "refuse", reasons: ["The quality check could not be read, so launch stays closed."] };
  }
  const results: ParsedResult[] = [];
  for (const item of value.results) {
    const parsed = readResult(item);
    if (parsed === null) {
      return { kind: "refuse", reasons: ["The quality check has a result we cannot read, so launch stays closed."] };
    }
    results.push(parsed);
  }
  const verdict = typeof value.verdict === "string" ? value.verdict : null;
  return { kind: "report", report: { fixRound, verdict, results } };
}

function readFixRound(value: unknown): 0 | 1 | 2 | null {
  if (value === undefined) return 0;
  if (value === 0 || value === 1 || value === 2) return value;
  return null;
}

function readResult(value: unknown): ParsedResult | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (!isStatus(value.status)) return null;
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) return null;
  return { id: value.id, status: value.status, reason: oneLine(value.reason) };
}

function isStatus(value: unknown): value is GateStatus {
  return value === "PASS" || value === "FIX" || value === "BLOCKER";
}

function plainId(id: string): string {
  if (GATE_ID_SET.has(id)) return PLAIN_NAME[id as GateId];
  return id;
}

function joinList(items: readonly string[]): string {
  if (items.length === 0) return "";
  const last = items[items.length - 1];
  if (last === undefined) return "";
  if (items.length === 1) return last;
  if (items.length === 2) {
    const first = items[0];
    return first === undefined ? last : `${first} and ${last}`;
  }
  const rest = items.slice(0, -1).join(", ");
  return `${rest}, and ${last}`;
}

function unique(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function refuse(reasons: readonly string[]): ShipGateResult {
  const clean = unique(reasons.map(oneLine).filter((line) => line.length > 0));
  return { ok: false, reasons: clean.length > 0 ? clean : ["Launch stays closed."] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
