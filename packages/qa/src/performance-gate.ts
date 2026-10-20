/**
 * Hard performance gate (240c).
 * Category floors come from the existing phone gate. This module adds the
 * vitals, one WebGL context, the 3D and video byte budgets, a mobile still,
 * and a complete reduced-motion branch. The caller passes a Lighthouse-shaped
 * result. Nothing here starts a browser or a measurement run.
 */

import { evaluateLh, fromLhci, type LhFloors } from "./lighthouse-gate.ts";

export const LCP_MAX_MS = 2500;
export const INP_MAX_MS = 200;
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
  if (lighthouse !== null) reasons.push(...vitalReasons(auditsFrom(lighthouse)));
  reasons.push(...mediaReasons(webglContexts, glbBytes, videoBytes, mobileStill));
  if (animates && !reducedMotionComplete) {
    reasons.push("Reduced-motion fallback is incomplete.");
  }
  return { status: reasons.length > 0 ? "BLOCKER" : "PASS", reasons };
}

function vitalReasons(audits: Record<string, unknown>): string[] {
  const reasons: string[] = [];
  const lcp = readMeasured(audits, ["largest-contentful-paint"], "LCP");
  const inp = readMeasured(
    audits,
    ["interaction-to-next-paint", "experimental-interaction-to-next-paint"],
    "INP",
  );
  const cls = readMeasured(audits, ["cumulative-layout-shift"], "CLS");
  if (lcp === null) reasons.push("LCP was not measured.");
  else if (lcp > LCP_MAX_MS) reasons.push(`LCP is ${lcp} ms. The limit is ${LCP_MAX_MS} ms.`);
  if (inp === null) reasons.push("INP was not measured.");
  else if (inp > INP_MAX_MS) reasons.push(`INP is ${inp} ms. The limit is ${INP_MAX_MS} ms.`);
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
  return line.startsWith("Desktop is informational") || line.startsWith("The mobile run measures");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
