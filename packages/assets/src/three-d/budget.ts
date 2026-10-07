/**
 * Phone budget for a 3D moment.
 *
 * Prompt 085 sets the phone ceiling at 1.5 MB and 150000 triangles.
 * Research 06 names a 250 KB phone still and a 3 to 5 MB desktop GLB.
 * Those numbers disagree. Matt D-006 says a missing phone fallback is a
 * blocker, so this check keeps the phone ceiling at every appetite,
 * including 10. A 3D kind starts at appetite 8 in the motion plan.
 *
 * checkBudget reads that appetite from the MOTION.md line written by
 * packages/engine/src/spec/motion.ts: "Appetite: N of 10."
 */

export const PHONE_GLB_BYTES = Math.round(1.5 * 1024 * 1024);
export const PHONE_TRIANGLES = 150_000;
export const PHONE_TEXTURE_MB = 32;
export const MODEL_MIN_LEVEL = 8;

export interface ModelStats {
  bytes: number;
  triangles: number;
  textureMb: number;
}

export interface BudgetResult {
  ok: boolean;
  reasons: string[];
}

export function levelFromMotion(markdown: string): number {
  const match = /^Appetite:\s+(\d+)\s+of\s+10\b/m.exec(markdown);
  if (match === null) {
    throw new Error("MOTION.md has no appetite line. Expected: Appetite: N of 10.");
  }
  const level = Number(match[1]);
  assertLevel(level);
  return level;
}

export function checkBudget(stats: ModelStats, level: number): BudgetResult {
  assertLevel(level);
  assertStats(stats);
  const reasons: string[] = [];
  const hasWeight = stats.bytes > 0 || stats.triangles > 0 || stats.textureMb > 0;
  if (level < MODEL_MIN_LEVEL) {
    if (hasWeight) {
      reasons.push(
        `Appetite ${level} is below ${MODEL_MIN_LEVEL}. A 3D model starts at appetite ${MODEL_MIN_LEVEL}. Use a poster on this page.`,
      );
    }
    return { ok: reasons.length === 0, reasons };
  }
  if (stats.bytes > PHONE_GLB_BYTES) {
    reasons.push(
      `File is ${stats.bytes} bytes. The phone budget is ${PHONE_GLB_BYTES} bytes (1.5 MB). Ship a poster fallback on phones.`,
    );
  }
  if (stats.triangles > PHONE_TRIANGLES) {
    reasons.push(
      `Triangle count is ${stats.triangles}. The phone budget is ${PHONE_TRIANGLES} triangles. Ship a poster fallback on phones.`,
    );
  }
  if (stats.textureMb > PHONE_TEXTURE_MB) {
    reasons.push(
      `Texture memory is ${stats.textureMb} MB. The phone budget is ${PHONE_TEXTURE_MB} MB. Ship a poster fallback on phones.`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}

export function checkBudgetFromMotion(stats: ModelStats, markdown: string): BudgetResult {
  return checkBudget(stats, levelFromMotion(markdown));
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error(`Motion appetite must be an integer from 1 to 10. Received ${String(level)}.`);
  }
}

function assertStats(stats: ModelStats): void {
  for (const [label, value] of [
    ["bytes", stats.bytes],
    ["triangles", stats.triangles],
    ["textureMb", stats.textureMb],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Budget stat ${label} must be a finite number of zero or more.`);
    }
  }
}
