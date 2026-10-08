/**
 * Elevate executor (prompt 130, v2 §12).
 *
 * Applies one planned edit, then re-reads the gates. A real caller wires
 * `before` and `after` to the gate functions `evaluateLh` and `evaluateA11y`
 * (their `status` fields) and wires `apply` and `rollback` to a patch. This
 * module does not open a browser, run Lighthouse, or touch the filesystem.
 *
 * `before` is the pre-edit reading. `after` is the decision. Either gate at
 * BLOCKER refuses the edit: a flip from PASS to BLOCKER, and a gate that was
 * already BLOCKER. Elevate may not keep a change while a gate is red. A clear
 * pair of PASS results keeps the edit. Rollback runs once for the edit, not
 * once per gate. If `rollback` throws, that rejection is returned as-is.
 */

import type { A11yGateResult } from "./a11y-gate.ts";
import type { LhGateResult } from "./lighthouse-gate.ts";

/** `status` from `evaluateLh` and `evaluateA11y`. */
export type ElevateGateStatus = LhGateResult["status"] & A11yGateResult["status"];

export interface ElevateGateSnapshot {
  lh: LhGateResult["status"];
  a11y: A11yGateResult["status"];
}

export interface RunElevateInput {
  apply: () => Promise<void>;
  rollback: () => Promise<void>;
  before: () => ElevateGateSnapshot;
  after: () => ElevateGateSnapshot;
}

export interface RunElevateResult {
  status: "kept" | "refused";
  rolledBack: boolean;
}

type ZeroArg = () => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function label(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    return String(value);
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function requireFunction(value: unknown, field: string): ZeroArg {
  if (typeof value !== "function") {
    throw new Error(`${field} is ${label(value)}. Expected a function.`);
  }
  return value as ZeroArg;
}

function readStatus(value: unknown, field: string): ElevateGateStatus {
  if (value !== "PASS" && value !== "BLOCKER") {
    throw new Error(`${field} is ${label(value)}. Expected PASS or BLOCKER.`);
  }
  return value;
}

function readSnapshot(value: unknown, which: "before" | "after"): ElevateGateSnapshot {
  if (!isRecord(value)) {
    throw new Error(`${which} returned ${label(value)}. Expected lh and a11y statuses.`);
  }
  return {
    lh: readStatus(value.lh, `${which}.lh`),
    a11y: readStatus(value.a11y, `${which}.a11y`),
  };
}

/**
 * Apply one edit. Keep it only when both gates are PASS afterwards.
 * A BLOCKER rolls the edit back and returns refused.
 */
export async function runElevate(input: RunElevateInput): Promise<RunElevateResult> {
  if (!isRecord(input)) {
    throw new Error(
      `runElevate input is ${label(input)}. Expected apply, rollback, before, and after.`,
    );
  }
  const apply = requireFunction(input.apply, "apply");
  const rollback = requireFunction(input.rollback, "rollback");
  const before = requireFunction(input.before, "before");
  const after = requireFunction(input.after, "after");

  const prior = readSnapshot(before(), "before");
  await apply();
  const next = readSnapshot(after(), "after");

  const flippedToBlocker =
    (prior.lh === "PASS" && next.lh === "BLOCKER") ||
    (prior.a11y === "PASS" && next.a11y === "BLOCKER");
  const stillBlocked = next.lh === "BLOCKER" || next.a11y === "BLOCKER";
  if (flippedToBlocker || stillBlocked) {
    await rollback();
    return { status: "refused", rolledBack: true };
  }

  return { status: "kept", rolledBack: false };
}
