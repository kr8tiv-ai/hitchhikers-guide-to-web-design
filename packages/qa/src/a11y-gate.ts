/**
 * Accessibility gate (prompt 123, v2 §12, a11y pack).
 *
 * The caller passes structured axe results plus a keyboard path, a
 * reduced-motion flag, a body contrast ratio, and whether motion is used.
 * This module does not launch a browser and does not load axe-core.
 * Collection is later wiring.
 *
 * Serious and critical axe impacts block. Moderate blocks too. v2 §12,
 * the goal line, and the context paragraph name serious and critical
 * only. Step 1 of this prompt adds moderate and says to document it.
 * The a11y pack says a stricter Guide floor wins, so moderate is included
 * here as a blocker. Minor is listed in notes and does not change status.
 *
 * A missing keyboard path blocks even when axe is empty. Reduced motion
 * is required only when motionUsed is true. Body contrast uses 4.5, the
 * same bar as passes(ratio, "body") in packages/engine/src/brand/tokens.ts
 * (BODY_MIN). The ratio is passed in. contrastRatio() is not on the engine
 * public export, and this prompt does not add that export.
 */

/** WCAG 2.2 body text. Same number as tokens.ts BODY_MIN. */
export const BODY_CONTRAST_MIN = 4.5;

export type A11yImpact = "minor" | "moderate" | "serious" | "critical";

export interface A11yViolation {
  impact: A11yImpact;
  id: string;
}

export interface A11yGateInput {
  violations: A11yViolation[];
  hasKeyboardPath: boolean;
  hasReducedMotion: boolean;
  contrastRatio: number;
  motionUsed: boolean;
}

export interface A11yGateResult {
  status: "PASS" | "BLOCKER";
  notes: string[];
}

const MODERATE_NOTE = "Moderate is included. It blocks along with serious and critical.";

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

function isImpact(value: unknown): value is A11yImpact {
  return (
    value === "minor" || value === "moderate" || value === "serious" || value === "critical"
  );
}

function readViolations(value: unknown): A11yViolation[] {
  if (!Array.isArray(value)) {
    throw new Error(`violations is ${label(value)}. Expected a list of axe results.`);
  }
  const violations: A11yViolation[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) {
      throw new Error(`violations[${index}] is ${label(item)}. Expected an axe result.`);
    }
    if (!isImpact(item.impact)) {
      throw new Error(
        `violations[${index}].impact is ${label(item.impact)}. Expected minor, moderate, serious, or critical.`,
      );
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      throw new Error(
        `violations[${index}].id is ${label(item.id)}. Expected a non-empty rule id.`,
      );
    }
    violations.push({ impact: item.impact, id: item.id });
  }
  return violations;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} is ${label(value)}. Expected true or false.`);
  }
  return value;
}

function readContrast(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `contrastRatio is ${label(value)}. Expected a finite number. Body text blocks under ${BODY_CONTRAST_MIN}.`,
    );
  }
  return value;
}

/**
 * Judge one set of structured accessibility results.
 * Notes list every blocker, then any minor axe hits. A PASS can still
 * carry minor notes. Status is BLOCKER when any blocking note exists.
 */
export function evaluateA11y(input: A11yGateInput): A11yGateResult {
  if (!isRecord(input)) {
    throw new Error(`evaluateA11y input is ${label(input)}. Expected an object.`);
  }
  const violations = readViolations(input.violations);
  const hasKeyboardPath = readBoolean(input.hasKeyboardPath, "hasKeyboardPath");
  const hasReducedMotion = readBoolean(input.hasReducedMotion, "hasReducedMotion");
  const contrastRatio = readContrast(input.contrastRatio);
  const motionUsed = readBoolean(input.motionUsed, "motionUsed");

  const blocking: string[] = [];
  const minorNotes: string[] = [];
  let sawModerate = false;

  for (const violation of violations) {
    if (violation.impact === "minor") {
      minorNotes.push(`Axe minor ${violation.id} is a note.`);
      continue;
    }
    if (violation.impact === "moderate") sawModerate = true;
    blocking.push(`Axe ${violation.impact} ${violation.id} blocks.`);
  }
  if (sawModerate) blocking.push(MODERATE_NOTE);
  if (!hasKeyboardPath) blocking.push("Keyboard path is missing.");
  if (motionUsed && !hasReducedMotion) {
    blocking.push("Motion is used and reduced-motion handling is missing.");
  }
  if (contrastRatio < BODY_CONTRAST_MIN) {
    blocking.push(`Body contrast is ${contrastRatio}, under ${BODY_CONTRAST_MIN}.`);
  }

  return {
    status: blocking.length > 0 ? "BLOCKER" : "PASS",
    notes: [...blocking, ...minorNotes],
  };
}
