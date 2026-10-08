/**
 * Lighthouse phone gate (prompt 122, Matt D-006, v2 §12).
 *
 * The caller passes category scores from a real mobile run of what the phone
 * received. LHCI's mobile preset (mid-range phone, simulated slow 4G, CPU
 * throttle, median of three runs per route) belongs to the runner. This
 * module does not spawn a browser, download a browser, or shell out.
 *
 * Scores are Lighthouse ratios from 0 to 1, or points from 0 to 100. A value
 * less than or equal to 1 is a ratio and is multiplied by 100. So 1 is 100,
 * and 90 stays 90. Scaling snaps binary dust. It does not round to an integer,
 * so a ratio under 0.9 stays under 90, matching an LHCI minScore of 0.9.
 *
 * Floors are `GuideConfig.gates` (`phonePerfMin`, `a11yMin`,
 * `bestPracticesMin`, `seoMin`). The config store allows 0 to 100. This gate
 * rejects a floor below 90, so the phone floor cannot be lowered to 70.
 * `desktopFpsMin` is a different gate and is ignored here.
 *
 * `phone: null` is a BLOCKER, including when `heavy` is false. Desktop scores
 * are reported and never change the status. They do not waive a missing or
 * failing phone run. When `heavy` is true, the phone scores are the calm path
 * `motion.ts` keeps for a heavy scene (a phone still or prerender). That path
 * is what the phone got.
 */

import type { GuideConfig } from "@hitchhiker/engine";

/** Category points after the caller has chosen a run. Ratios are still allowed. */
export interface LhScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

/**
 * The four Lighthouse floors on `GuideConfig.gates`.
 * `desktopFpsMin` is not part of this gate.
 */
export type LhFloors = Pick<
  GuideConfig["gates"],
  "phonePerfMin" | "a11yMin" | "bestPracticesMin" | "seoMin"
>;

export interface LhGateResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
}

/** D-006. A stored gate below this is rejected rather than applied. */
const FLOOR_MIN = 90;
const FLOOR_MAX = 100;
const RATIO_MAX = 1;
const SCORE_MAX = 100;

interface NormalizedScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

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

/** Multiply a 0–1 ratio by 100 and snap binary dust. Do not round to an integer. */
function scaleScore(raw: number): number {
  const scaled = raw <= RATIO_MAX ? raw * 100 : raw;
  return Math.round(scaled * 1e9) / 1e9;
}

function formatScore(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return String(Math.round(score * 100) / 100);
}

function normalizeScore(raw: unknown, field: string): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    throw new Error(
      `${field} is ${label(raw)}. Expected a finite number from 0 to 100, or a fraction from 0 to 1.`,
    );
  }
  if (raw < 0) {
    throw new Error(`${field} is ${raw}. Negative scores throw.`);
  }
  const score = scaleScore(raw);
  if (score > SCORE_MAX) {
    throw new Error(`${field} is ${formatScore(score)}. Scores above 100 throw.`);
  }
  return score;
}

function readFloor(record: Record<string, unknown>, key: keyof LhFloors): number {
  const field = `floors.${key}`;
  if (!Object.hasOwn(record, key)) {
    throw new Error(`${field} is missing. Expected an integer from ${FLOOR_MIN} to ${FLOOR_MAX}.`);
  }
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      `${field} is ${label(value)}. Expected an integer from ${FLOOR_MIN} to ${FLOOR_MAX}.`,
    );
  }
  if (value < FLOOR_MIN) {
    throw new Error(`${field} is ${value}. Floors below 90 are rejected.`);
  }
  if (value > FLOOR_MAX) {
    throw new Error(`${field} is ${value}. Floors above 100 are rejected.`);
  }
  return value;
}

function readFloors(value: unknown): LhFloors {
  if (!isRecord(value)) {
    throw new Error(`${label(value)} is not a floors object. Expected GuideConfig.gates.`);
  }
  return {
    phonePerfMin: readFloor(value, "phonePerfMin"),
    a11yMin: readFloor(value, "a11yMin"),
    bestPracticesMin: readFloor(value, "bestPracticesMin"),
    seoMin: readFloor(value, "seoMin"),
  };
}

function readScores(value: unknown, scope: string): NormalizedScores {
  if (!isRecord(value)) {
    throw new Error(`${scope} is ${label(value)}. Expected category scores.`);
  }
  return {
    performance: normalizeScore(value.performance, `${scope}.performance`),
    accessibility: normalizeScore(value.accessibility, `${scope}.accessibility`),
    bestPractices: normalizeScore(value.bestPractices, `${scope}.bestPractices`),
    seo: normalizeScore(value.seo, `${scope}.seo`),
  };
}

function phoneFailures(phone: NormalizedScores, floors: LhFloors): string[] {
  const rows: ReadonlyArray<{ name: string; score: number; floor: number }> = [
    { name: "Phone performance", score: phone.performance, floor: floors.phonePerfMin },
    { name: "Phone accessibility", score: phone.accessibility, floor: floors.a11yMin },
    { name: "Phone best practices", score: phone.bestPractices, floor: floors.bestPracticesMin },
    { name: "Phone SEO", score: phone.seo, floor: floors.seoMin },
  ];
  const failures: string[] = [];
  for (const row of rows) {
    if (row.score < row.floor) {
      failures.push(
        `${row.name} is ${formatScore(row.score)}, below the floor of ${row.floor}.`,
      );
    }
  }
  return failures;
}

function desktopNote(desktop: NormalizedScores): string {
  return (
    `Desktop is informational: performance ${formatScore(desktop.performance)}, ` +
    `accessibility ${formatScore(desktop.accessibility)}, ` +
    `best practices ${formatScore(desktop.bestPractices)}, ` +
    `SEO ${formatScore(desktop.seo)}. A desktop run does not waive the phone.`
  );
}

/**
 * Judge one route. `phone` is the mobile run. `desktop`, when present, is
 * listed and cannot raise a failing or missing phone run to PASS.
 */
export function evaluateLh(input: {
  phone: LhScores | null;
  desktop?: LhScores | null;
  heavy: boolean;
  floors: LhFloors;
}): LhGateResult {
  if (!isRecord(input)) {
    throw new Error(`evaluateLh input is ${label(input)}. Expected an object.`);
  }
  const floors = readFloors(input.floors);
  if (typeof input.heavy !== "boolean") {
    throw new Error(`heavy is ${label(input.heavy)}. Expected true or false.`);
  }

  const failures: string[] = [];
  const notes: string[] = [];

  if (input.phone === null || input.phone === undefined) {
    failures.push(
      input.heavy
        ? "A real mobile run is required. A missing phone fallback is a blocker."
        : "A real mobile run is required.",
    );
  } else {
    const phone = readScores(input.phone, "phone");
    failures.push(...phoneFailures(phone, floors));
    if (input.heavy) {
      notes.push("The mobile run measures the phone fallback, which is what the phone gets.");
    }
  }

  if (input.desktop !== undefined && input.desktop !== null) {
    notes.push(desktopNote(readScores(input.desktop, "desktop")));
  }

  return {
    status: failures.length > 0 ? "BLOCKER" : "PASS",
    reasons: [...failures, ...notes],
  };
}

function categoriesFrom(json: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(json.categories)) return json.categories;
  if (isRecord(json.lhr) && isRecord(json.lhr.categories)) return json.lhr.categories;
  throw new Error("fromLhci json is missing categories. Expected categories.performance.score.");
}

function readCategoryScore(categories: Record<string, unknown>, key: string): number {
  const field = `categories.${key}`;
  if (!Object.hasOwn(categories, key)) {
    throw new Error(`fromLhci ${field} is missing. Expected an object with a score.`);
  }
  const category = categories[key];
  if (!isRecord(category)) {
    throw new Error(`fromLhci ${field} is ${label(category)}. Expected an object with a score.`);
  }
  if (!Object.hasOwn(category, "score")) {
    throw new Error(`fromLhci ${field}.score is missing.`);
  }
  const score = category.score;
  if (score === null) {
    throw new Error(`fromLhci ${field}.score is null. A missing category score is not a pass.`);
  }
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new Error(`fromLhci ${field}.score is ${label(score)}. Expected a finite number.`);
  }
  return score;
}

function readBestPractices(categories: Record<string, unknown>): number {
  const kebab = Object.hasOwn(categories, "best-practices");
  const camel = Object.hasOwn(categories, "bestPractices");
  if (!kebab && !camel) {
    throw new Error(
      "fromLhci categories.best-practices is missing. Expected an object with a score.",
    );
  }
  const fromKebab = kebab ? readCategoryScore(categories, "best-practices") : undefined;
  const fromCamel = camel ? readCategoryScore(categories, "bestPractices") : undefined;
  if (fromKebab !== undefined && fromCamel !== undefined && fromKebab !== fromCamel) {
    throw new Error(
      `fromLhci best-practices score is ${fromKebab} and bestPractices score is ${fromCamel}. Expected one score.`,
    );
  }
  if (fromKebab !== undefined) return fromKebab;
  if (fromCamel !== undefined) return fromCamel;
  throw new Error(
    "fromLhci categories.best-practices is missing. Expected an object with a score.",
  );
}

/**
 * Map a Lighthouse result, or a tiny fixture of the same shape, into scores
 * `evaluateLh` can take as `phone` or `desktop`.
 *
 * Accepted shapes:
 * `{ categories: { performance: { score: 0.91 }, ... } }`
 * `{ lhr: { categories: { ... } } }`
 *
 * Best practices are read from `best-practices` (Lighthouse) or
 * `bestPractices`. All four categories are required. A partial report is not
 * completed with invented scores. Values are returned as emitted. `evaluateLh`
 * normalizes them.
 */
export function fromLhci(json: unknown): LhScores {
  if (!isRecord(json)) {
    throw new Error(`fromLhci json is ${label(json)}. Expected an object with categories.`);
  }
  const categories = categoriesFrom(json);
  return {
    performance: readCategoryScore(categories, "performance"),
    accessibility: readCategoryScore(categories, "accessibility"),
    bestPractices: readBestPractices(categories),
    seo: readCategoryScore(categories, "seo"),
  };
}
