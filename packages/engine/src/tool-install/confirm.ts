import { createHash, randomBytes } from "node:crypto";
import type { InstallPlan } from "./types.ts";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type ConfirmReject =
  | "missing confirm token"
  | "confirm token does not match"
  | "confirm token expired"
  | "confirm token was already used";

export interface IssuedConfirm {
  token: string;
  planHash: string;
  expiresAt: number;
}

export interface ConfirmStore {
  issue(plan: InstallPlan, now?: number): IssuedConfirm;
  lookup(token: string, now?: number): { ok: true; plan: InstallPlan } | { ok: false; reason: ConfirmReject };
  consume(token: string, now?: number): { ok: true; plan: InstallPlan } | { ok: false; reason: ConfirmReject };
}

interface StoredConfirm {
  plan: InstallPlan;
  planHash: string;
  expiresAt: number;
  used: boolean;
}

export function planFingerprint(plan: InstallPlan): string {
  const body = JSON.stringify({
    recipeId: plan.recipeId,
    tool: plan.tool,
    model: plan.selectedModel,
    steps: plan.runSteps.map((step) => ({
      id: step.id,
      argv: [...step.argv],
      kind: step.kind,
      url: step.url,
      dest: step.dest,
      sha256: step.sha256,
    })),
  });
  return createHash("sha256").update(body).digest("hex");
}

export function createConfirmStore(options?: { ttlMs?: number }): ConfirmStore {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const stored = new Map<string, StoredConfirm>();

  return {
    issue(plan, now = Date.now()) {
      const token = randomBytes(32).toString("hex");
      const planHash = planFingerprint(plan);
      const expiresAt = now + ttlMs;
      stored.set(token, { plan, planHash, expiresAt, used: false });
      return { token, planHash, expiresAt };
    },
    lookup(token, now = Date.now()) {
      return read(token, now, false);
    },
    consume(token, now = Date.now()) {
      return read(token, now, true);
    },
  };

  function read(
    token: string,
    now: number,
    mark: boolean,
  ): { ok: true; plan: InstallPlan } | { ok: false; reason: ConfirmReject } {
    if (token.trim().length === 0) return { ok: false, reason: "missing confirm token" };
    const row = stored.get(token);
    if (row === undefined) return { ok: false, reason: "confirm token does not match" };
    if (row.used) return { ok: false, reason: "confirm token was already used" };
    if (now > row.expiresAt) return { ok: false, reason: "confirm token expired" };
    if (row.planHash !== planFingerprint(row.plan)) {
      return { ok: false, reason: "confirm token does not match" };
    }
    if (mark) row.used = true;
    return { ok: true, plan: row.plan };
  }
}
