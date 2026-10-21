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
 * `phone: null` is a BLOCKER, including when `heavy` is false. A desktop
 * score passed beside the phone run never waives a missing or failing phone
 * run. Desktop performance uses the same floor as the phone. A miss changes
 * status (241d). Accessibility, best practices, and SEO on that side score
 * stay recorded. LCP, CLS, the tablet preset, and the poster image are
 * `evaluateDeviceLh` and the performance gate. When `heavy` is true, the
 * phone scores are the calm path `motion.ts` keeps for a heavy scene (a
 * phone still or prerender). That path is what the phone got.
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

/**
 * Same floor as `PHONE_CATEGORY_FLOOR` in `packages/deploy/src/post-check.ts`.
 * All four phone categories. A stored gate below this is rejected.
 */
export const PHONE_CATEGORY_FLOOR = 90;

/** Mobile Lighthouse runs. The speed gate scores the median. */
export const MOBILE_LH_RUNS = 3;

/** D-006. A stored gate below this is rejected rather than applied. */
const FLOOR_MIN = PHONE_CATEGORY_FLOOR;
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

function desktopPerformanceFailure(desktop: NormalizedScores, floor: number): string | null {
  if (desktop.performance < floor) {
    return (
      `Desktop performance is ${formatScore(desktop.performance)}, below the floor of ${floor}. ` +
      `A desktop run does not waive the phone.`
    );
  }
  return null;
}

function desktopNote(desktop: NormalizedScores): string {
  return (
    `Desktop performance is ${formatScore(desktop.performance)}. ` +
    `Accessibility ${formatScore(desktop.accessibility)}, ` +
    `best practices ${formatScore(desktop.bestPractices)}, ` +
    `and SEO ${formatScore(desktop.seo)} are recorded. ` +
    `A desktop run does not waive the phone.`
  );
}

function medianOf(values: readonly number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const mid = sorted[Math.floor(sorted.length / 2)];
  if (mid === undefined) throw new Error("The phone checks have no scores.");
  return mid;
}

function readRunScore(run: unknown, index: number, field: keyof LhScores): number {
  if (!isRecord(run)) throw new Error(`Phone check ${index + 1} is missing its scores.`);
  const value = run[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Phone check ${index + 1} is missing ${field}.`);
  }
  return value;
}

/**
 * Median of three mobile runs. Every category uses the post-check floor
 * of 90. One noisy run under the floor does not fail a median that clears it.
 * Fewer or more than three runs is a blocker. This does not start a browser.
 */
export function evaluateMedianPhone(runs: readonly LhScores[]): LhGateResult {
  if (!Array.isArray(runs)) throw new Error("Phone checks are missing. Expected three mobile checks.");
  if (runs.length !== MOBILE_LH_RUNS) {
    return {
      status: "BLOCKER",
      reasons: [`The phone was checked ${runs.length} times. It needs ${MOBILE_LH_RUNS} checks.`],
    };
  }
  const phone: LhScores = {
    performance: medianOf(runs.map((run, index) => readRunScore(run, index, "performance"))),
    accessibility: medianOf(runs.map((run, index) => readRunScore(run, index, "accessibility"))),
    bestPractices: medianOf(runs.map((run, index) => readRunScore(run, index, "bestPractices"))),
    seo: medianOf(runs.map((run, index) => readRunScore(run, index, "seo"))),
  };
  return evaluateLh({
    phone,
    heavy: false,
    floors: {
      phonePerfMin: PHONE_CATEGORY_FLOOR,
      a11yMin: PHONE_CATEGORY_FLOOR,
      bestPracticesMin: PHONE_CATEGORY_FLOOR,
      seoMin: PHONE_CATEGORY_FLOOR,
    },
  });
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
    const desktop = readScores(input.desktop, "desktop");
    const failure = desktopPerformanceFailure(desktop, floors.phonePerfMin);
    if (failure !== null) failures.push(failure);
    else notes.push(desktopNote(desktop));
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

export interface LhViewport {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface DeviceSlot {
  scores: LhScores | null;
  formFactor: "mobile" | "desktop";
  viewport: LhViewport;
}

export interface DeviceRecord {
  id: "mobile" | "desktop" | "tablet";
  formFactor: "mobile" | "desktop";
  viewport: LhViewport;
}

export interface DeviceLhResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
  notes: string[];
  recorded: DeviceRecord[];
}

const SLOT_EXPECTATION = {
  mobile: "mobile",
  desktop: "desktop",
  tablet: "desktop",
} as const;

/**
 * Three presets. Mobile gates all four categories. Desktop and tablet gate
 * performance on the same floor. The recorded row keeps form factor and
 * viewport so a miss names which layout failed. Tablet must be desktop
 * scoring. A missing preset does not waive the phone.
 */
export function evaluateDeviceLh(input: {
  heavy: boolean;
  floors: LhFloors;
  mobile: DeviceSlot;
  desktop: DeviceSlot;
  tablet: DeviceSlot;
}): DeviceLhResult {
  if (!isRecord(input)) {
    throw new Error(`evaluateDeviceLh input is ${label(input)}. Expected an object.`);
  }
  const floors = readFloors(input.floors);
  if (typeof input.heavy !== "boolean") {
    throw new Error(`heavy is ${label(input.heavy)}. Expected true or false.`);
  }
  const mobile = readSlot(input.mobile, "mobile");
  const desktop = readSlot(input.desktop, "desktop");
  const tablet = readSlot(input.tablet, "tablet");
  const failures: string[] = [];
  const notes: string[] = [];
  failures.push(...formFactorProblems(mobile));
  failures.push(...formFactorProblems(desktop));
  failures.push(...formFactorProblems(tablet));

  const phone = evaluateLh({ phone: mobile.scores, heavy: input.heavy, floors });
  for (const line of phone.reasons) {
    if (line.startsWith("The mobile run measures")) notes.push(line);
    else if (phone.status === "BLOCKER") failures.push(line);
    else notes.push(line);
  }
  failures.push(...presetPerformance("Desktop", desktop, floors.phonePerfMin));
  failures.push(...presetPerformance("Tablet", tablet, floors.phonePerfMin));

  return {
    status: failures.length > 0 ? "BLOCKER" : "PASS",
    reasons: failures,
    notes,
    recorded: [recordOf(mobile), recordOf(desktop), recordOf(tablet)],
  };
}

/**
 * The WebGL LCP element is a poster image in the HTML, ahead of the canvas,
 * with fetchpriority high and explicit width and height. A canvas draw is
 * not the LCP node.
 */
export function webglLcpIsPoster(html: string): { ok: boolean; reasons: string[] } {
  if (typeof html !== "string" || html.trim() === "") {
    return { ok: false, reasons: ["The WebGL page has no markup to score."] };
  }
  const canvasAt = html.search(/<canvas\b/i);
  if (canvasAt < 0) {
    return { ok: false, reasons: ["The WebGL page has no canvas, so the poster cannot be the LCP element."] };
  }
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)];
  const poster = tags
    .map((match) => ({ tag: match[0], index: match.index ?? -1, attrs: imgAttrs(match[0]) }))
    .find((item) => item.attrs.fetchPriority === "high");
  if (poster === undefined) {
    return { ok: false, reasons: ["The poster image is missing fetchpriority high."] };
  }
  const reasons: string[] = [];
  if (poster.attrs.loading === "lazy") {
    reasons.push("The poster image is lazy. It cannot be the LCP element.");
  }
  if (poster.attrs.width === null || poster.attrs.height === null) {
    reasons.push("The poster image is missing width and height.");
  }
  if (poster.index > canvasAt) {
    reasons.push("The poster image is after the canvas.");
  }
  if (reasons.length === 0) return { ok: true, reasons: [] };
  return { ok: false, reasons };
}

function recordOf(slot: ReadSlot): DeviceRecord {
  return { id: slot.id, formFactor: slot.formFactor, viewport: slot.viewport };
}

function presetPerformance(scope: "Desktop" | "Tablet", slot: ReadSlot, floor: number): string[] {
  if (slot.scores === null) {
    return [
      `A real ${slot.id} run is required. Viewport ${slot.viewport.width} by ${slot.viewport.height} at scale ${slot.viewport.deviceScaleFactor} is recorded and does not waive the phone.`,
    ];
  }
  const scores = readScores(slot.scores, slot.id);
  if (scores.performance < floor) {
    return [
      `${scope} performance is ${formatScore(scores.performance)}, below the floor of ${floor}. ` +
        `Viewport ${slot.viewport.width} by ${slot.viewport.height} at scale ${slot.viewport.deviceScaleFactor}. ` +
        `A desktop run does not waive the phone.`,
    ];
  }
  return [];
}

interface ReadSlot {
  id: "mobile" | "desktop" | "tablet";
  scores: LhScores | null;
  formFactor: "mobile" | "desktop";
  viewport: LhViewport;
}

function readSlot(value: unknown, id: "mobile" | "desktop" | "tablet"): ReadSlot {
  if (!isRecord(value)) throw new Error(`${id} preset is ${label(value)}. Expected scores, formFactor, and viewport.`);
  const formFactor = value.formFactor;
  if (formFactor !== "mobile" && formFactor !== "desktop") {
    throw new Error(`${id} formFactor is ${label(formFactor)}. Expected mobile or desktop.`);
  }
  let scores: LhScores | null = null;
  if (value.scores !== null && value.scores !== undefined) {
    if (!isRecord(value.scores)) {
      throw new Error(`${id} scores are ${label(value.scores)}. Expected category scores or null.`);
    }
    scores = value.scores as unknown as LhScores;
  }
  return { id, scores, formFactor, viewport: readViewport(value.viewport, id) };
}

function readViewport(value: unknown, scope: string): LhViewport {
  if (!isRecord(value)) throw new Error(`${scope} viewport is ${label(value)}. Expected width, height, and deviceScaleFactor.`);
  const width = readPositive(value.width, `${scope} viewport width`);
  const height = readPositive(value.height, `${scope} viewport height`);
  const deviceScaleFactor = readPositive(value.deviceScaleFactor, `${scope} viewport deviceScaleFactor`);
  return { width, height, deviceScaleFactor };
}

function readPositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} is ${label(value)}. Expected a number above 0.`);
  }
  return value;
}

function formFactorProblems(slot: ReadSlot): string[] {
  const expected = SLOT_EXPECTATION[slot.id];
  if (slot.formFactor === expected) return [];
  const why =
    slot.id === "tablet"
      ? "Tablet scoring uses the desktop preset."
      : `${slot.id === "mobile" ? "The phone preset" : "The desktop preset"} uses formFactor ${expected}.`;
  return [
    `${slot.id} formFactor is ${slot.formFactor}. ${why} Viewport ${slot.viewport.width} by ${slot.viewport.height} at scale ${slot.viewport.deviceScaleFactor}.`,
  ];
}

function imgAttrs(tag: string): { fetchPriority: string; loading: string; width: number | null; height: number | null } {
  const attr = (name: string): string => {
    const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
    return match?.[1]?.trim().toLowerCase() ?? "";
  };
  const width = Number(attr("width"));
  const height = Number(attr("height"));
  return {
    fetchPriority: attr("fetchpriority"),
    loading: attr("loading"),
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}
