/**
 * Hard performance gate (240c).
 * Category floors come from the existing phone gate. This module adds the
 * vitals, one WebGL context, the 3D and video byte budgets, a mobile still,
 * and a complete reduced-motion branch. The caller passes a Lighthouse-shaped
 * result. Nothing here starts a browser or a measurement run.
 */

import {
  evaluateDeviceLh,
  evaluateLh,
  fromLhci,
  webglLcpIsPoster,
  type DeviceRecord,
  type LhFloors,
  type LhScores,
  type LhViewport,
} from "./lighthouse-gate.ts";

export const LCP_MAX_MS = 2500;
export const INP_MAX_MS = 200;
/**
 * Lab stand-in for INP on the phone preset. Lighthouse's mobile Total
 * Blocking Time curve uses this same p10. Desktop and tablet pass their
 * own installed p10 as `tbtLimitMs`. A lab run with no INP sample does
 * not fail on the missing sample.
 */
export const TBT_PROXY_MS = 200;
export const CLS_MAX = 0.1;
export const VIDEO_BUDGET_BYTES = 4 * 1024 * 1024;
export const GLB_BUDGET_BYTES = 5 * 1024 * 1024;
export const WEBGL_CONTEXT_MAX = 1;

export interface PerformanceInput {
  lighthouse: unknown;
  floors: LhFloors;
  heavy: boolean;
  webglContexts: number;
  glbBytes: number;
  videoBytes: number;
  mobileStill: boolean;
  animates: boolean;
  reducedMotionComplete: boolean;
  /** Installed mobile TBT p10 when omitted. */
  tbtLimitMs?: number;
}

export interface PerformanceResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
}

export function evaluatePerformance(input: PerformanceInput): PerformanceResult {
  if (!isRecord(input)) throw new Error("Performance input must be an object.");
  const heavy = readFlag(input.heavy, "heavy");
  const mobileStill = readFlag(input.mobileStill, "mobileStill");
  const animates = readFlag(input.animates, "animates");
  const reducedMotionComplete = readFlag(input.reducedMotionComplete, "reducedMotionComplete");
  const webglContexts = readCount(input.webglContexts, "webglContexts");
  const glbBytes = readCount(input.glbBytes, "glbBytes");
  const videoBytes = readCount(input.videoBytes, "videoBytes");
  const lighthouse = readLighthouse(input.lighthouse);
  const tbtLimitMs = readLimit(input.tbtLimitMs, "tbtLimitMs");

  const reasons: string[] = [];
  const judged = evaluateLh({
    phone: lighthouse === null ? null : fromLhci(lighthouse),
    heavy,
    floors: input.floors,
  });
  if (judged.status === "BLOCKER") {
    for (const line of judged.reasons) {
      if (isNote(line)) continue;
      reasons.push(line);
    }
  }
  if (lighthouse !== null) {
    const sampled = readMeasured(
      auditsFrom(lighthouse),
      ["interaction-to-next-paint", "experimental-interaction-to-next-paint"],
      "INP",
    );
    reasons.push(...vitalReasons(auditsFrom(lighthouse), tbtLimitMs, sampled));
  }
  reasons.push(...mediaReasons(webglContexts, glbBytes, videoBytes, mobileStill));
  if (animates && !reducedMotionComplete) {
    reasons.push("Reduced-motion fallback is incomplete.");
  }
  return { status: reasons.length > 0 ? "BLOCKER" : "PASS", reasons };
}

function vitalReasons(audits: Record<string, unknown>, tbtLimitMs: number, inpSampleMs: number | null): string[] {
  const reasons: string[] = [];
  const lcp = readMeasured(audits, ["largest-contentful-paint"], "LCP");
  const tbt = readMeasured(audits, ["total-blocking-time"], "TBT");
  const cls = readMeasured(audits, ["cumulative-layout-shift"], "CLS");
  if (lcp === null) reasons.push("LCP was not measured.");
  else if (lcp > LCP_MAX_MS) reasons.push(`LCP is ${lcp} ms. The limit is ${LCP_MAX_MS} ms.`);
  if (inpSampleMs === null) {
    if (tbt === null) {
      reasons.push("INP was not measured. Total Blocking Time is the lab proxy and it was not measured.");
    } else if (tbt > tbtLimitMs) {
      reasons.push(`TBT is ${tbt} ms. The lab stand-in for INP is ${tbtLimitMs} ms.`);
    }
  } else if (inpSampleMs > INP_MAX_MS) {
    reasons.push(`INP is ${inpSampleMs} ms. The limit is ${INP_MAX_MS} ms.`);
  }
  if (cls === null) reasons.push("CLS was not measured.");
  else if (cls > CLS_MAX) reasons.push(`CLS is ${cls}. The limit is ${CLS_MAX}.`);
  return reasons;
}

function mediaReasons(
  webglContexts: number,
  glbBytes: number,
  videoBytes: number,
  mobileStill: boolean,
): string[] {
  const reasons: string[] = [];
  if (webglContexts > WEBGL_CONTEXT_MAX) {
    reasons.push(`WebGL contexts are ${webglContexts}. One WebGL context is the limit.`);
  }
  if (glbBytes > GLB_BUDGET_BYTES) {
    reasons.push(`3D weight is ${glbBytes} bytes. The glb budget is ${GLB_BUDGET_BYTES} bytes.`);
  }
  if (videoBytes > VIDEO_BUDGET_BYTES) {
    reasons.push(`Video is ${videoBytes} bytes. The video budget is ${VIDEO_BUDGET_BYTES} bytes.`);
  }
  if ((webglContexts > 0 || glbBytes > 0 || videoBytes > 0) && !mobileStill) {
    reasons.push("A mobile still is required when the page carries 3D, video, or a WebGL context.");
  }
  return reasons;
}

function auditsFrom(json: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(json.audits)) return json.audits;
  if (isRecord(json.lhr) && isRecord(json.lhr.audits)) return json.lhr.audits;
  return {};
}

function readMeasured(audits: Record<string, unknown>, keys: readonly string[], label: string): number | null {
  for (const key of keys) {
    if (!Object.hasOwn(audits, key)) continue;
    const audit = audits[key];
    if (!isRecord(audit) || !Object.hasOwn(audit, "numericValue")) return null;
    const value = audit.numericValue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label} is ${String(value)}. Expected a finite measurement of at least 0.`);
    }
    return value;
  }
  return null;
}

function readLighthouse(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error("lighthouse must be a result object or null.");
  return value;
}

function readCount(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} is ${String(value)}. Expected a whole number of at least 0.`);
  }
  return value;
}

function readFlag(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
  return value;
}

function isNote(line: string): boolean {
  return line.startsWith("The mobile run measures") || (line.startsWith("Desktop performance is") && line.includes("are recorded"));
}

function readLimit(value: unknown, name: string): number {
  if (value === undefined) {
    if (name === "tbtLimitMs") return TBT_PROXY_MS;
    throw new Error(`${name} is missing. Expected the installed TBT p10.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} is ${String(value)}. Expected the installed TBT p10.`);
  }
  return value;
}

export interface DeviceRunInput {
  lighthouse: unknown;
  formFactor: "mobile" | "desktop";
  viewport: LhViewport;
  /** Installed TBT p10 for this preset's form factor. */
  tbtLimitMs: number;
  /** Set only when a scripted interaction produced an INP sample. */
  inpSampleMs: number | null;
}

export interface DeviceLab {
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  inpSampleMs: number | null;
  performance: number | null;
}

export interface DevicePerformanceInput {
  floors: LhFloors;
  heavy: boolean;
  mobile: DeviceRunInput;
  desktop: DeviceRunInput;
  tablet: DeviceRunInput;
  webgl: boolean;
  markup: string;
  /** Line from `printDesktopThrottling`. Blank is a blocker. */
  desktopThrottling: string;
}

export interface DevicePerformanceResult {
  status: "PASS" | "BLOCKER";
  reasons: string[];
  notes: string[];
  recorded: readonly DeviceRecord[];
  lab: { mobile: DeviceLab; desktop: DeviceLab; tablet: DeviceLab };
  desktopThrottling: string;
}

/**
 * Mobile, desktop, and tablet. Desktop and tablet use the same performance,
 * LCP, and CLS floors as the phone. Lab INP fails only when `inpSampleMs`
 * is a sample. Otherwise TBT is the proxy, at that preset's installed p10.
 * A WebGL page must use the poster image as the LCP element.
 */
export function evaluateDevicePerformance(input: DevicePerformanceInput): DevicePerformanceResult {
  if (!isRecord(input)) throw new Error("Device performance input must be an object.");
  const heavy = readFlag(input.heavy, "heavy");
  const webgl = readFlag(input.webgl, "webgl");
  if (typeof input.markup !== "string") throw new Error("markup must be a string.");
  if (typeof input.desktopThrottling !== "string") throw new Error("desktopThrottling must be a string.");
  const mobile = readDeviceRun(input.mobile, "mobile");
  const desktop = readDeviceRun(input.desktop, "desktop");
  const tablet = readDeviceRun(input.tablet, "tablet");
  const mobileScores = scoresFrom(mobile.lighthouse);
  const desktopScores = scoresFrom(desktop.lighthouse);
  const tabletScores = scoresFrom(tablet.lighthouse);
  const judged = evaluateDeviceLh({
    heavy,
    floors: input.floors,
    mobile: { scores: mobileScores, formFactor: mobile.formFactor, viewport: mobile.viewport },
    desktop: { scores: desktopScores, formFactor: desktop.formFactor, viewport: desktop.viewport },
    tablet: { scores: tabletScores, formFactor: tablet.formFactor, viewport: tablet.viewport },
  });
  const reasons = [...judged.reasons];
  if (input.desktopThrottling.trim() === "") {
    reasons.push("Desktop throttling was not printed from the installed Lighthouse.");
  }
  reasons.push(...deviceVitals(mobile));
  reasons.push(...deviceVitals(desktop));
  reasons.push(...deviceVitals(tablet));
  if (webgl) {
    const poster = webglLcpIsPoster(input.markup);
    if (!poster.ok) reasons.push(...poster.reasons);
  }
  return {
    status: reasons.length > 0 ? "BLOCKER" : "PASS",
    reasons,
    notes: judged.notes,
    recorded: judged.recorded,
    lab: {
      mobile: labFrom(mobile, mobileScores),
      desktop: labFrom(desktop, desktopScores),
      tablet: labFrom(tablet, tabletScores),
    },
    desktopThrottling: input.desktopThrottling.trim(),
  };
}

interface ReadDeviceRun {
  id: string;
  lighthouse: Record<string, unknown> | null;
  formFactor: "mobile" | "desktop";
  viewport: LhViewport;
  tbtLimitMs: number;
  inpSampleMs: number | null;
}

function readDeviceRun(value: unknown, id: string): ReadDeviceRun {
  if (!isRecord(value)) throw new Error(`${id} run must be an object.`);
  const formFactor = value.formFactor;
  if (formFactor !== "mobile" && formFactor !== "desktop") {
    throw new Error(`${id} formFactor must be mobile or desktop.`);
  }
  const inpSampleMs = value.inpSampleMs;
  if (inpSampleMs !== null && (typeof inpSampleMs !== "number" || !Number.isFinite(inpSampleMs) || inpSampleMs < 0)) {
    throw new Error(`${id} inpSampleMs must be a sample of at least 0, or null when INP was not sampled.`);
  }
  return {
    id,
    lighthouse: readLighthouse(value.lighthouse),
    formFactor,
    viewport: readViewport(value.viewport, id),
    tbtLimitMs: readLimit(value.tbtLimitMs, `${id} tbtLimitMs`),
    inpSampleMs,
  };
}

function readViewport(value: unknown, id: string): LhViewport {
  if (!isRecord(value)) throw new Error(`${id} viewport must be an object.`);
  const width = value.width;
  const height = value.height;
  const deviceScaleFactor = value.deviceScaleFactor;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof deviceScaleFactor !== "number" ||
    width <= 0 ||
    height <= 0 ||
    deviceScaleFactor <= 0
  ) {
    throw new Error(`${id} viewport needs width, height, and deviceScaleFactor above 0.`);
  }
  return { width, height, deviceScaleFactor };
}

function scoresFrom(json: Record<string, unknown> | null): LhScores | null {
  if (json === null) return null;
  return fromLhci(json);
}

function labFrom(run: ReadDeviceRun, scores: LhScores | null): DeviceLab {
  const audits = run.lighthouse === null ? {} : auditsFrom(run.lighthouse);
  return {
    lcpMs: readMeasured(audits, ["largest-contentful-paint"], "LCP"),
    cls: readMeasured(audits, ["cumulative-layout-shift"], "CLS"),
    tbtMs: readMeasured(audits, ["total-blocking-time"], "TBT"),
    inpSampleMs: run.inpSampleMs,
    performance: scores === null ? null : scores.performance,
  };
}

function deviceVitals(run: ReadDeviceRun): string[] {
  if (run.lighthouse === null) return [];
  return vitalReasons(auditsFrom(run.lighthouse), run.tbtLimitMs, run.inpSampleMs).map(
    (line) => `${run.id} ${line}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
