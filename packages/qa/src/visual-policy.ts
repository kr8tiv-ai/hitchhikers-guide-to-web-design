import { REVIEW_WIDTHS } from "./screenshots.ts";

/**
 * Environment stamp stored with a baseline.
 * `os` is a Node `os.platform()` value (`win32`, `darwin`, `linux`).
 * The compare is case-sensitive. `scale` is a number (1 and 1.0 match).
 * `width` must be one of `REVIEW_WIDTHS`.
 */
export interface BaselineMeta {
  os: string;
  scale: number;
  width: number;
}

/**
 * Whether a screenshot may be compared with a baseline.
 * A mismatch or a missing baseline is a skip, not a failure.
 * This does not read image bytes and does not compute a pixel diff.
 *
 * Pass `os` in. This function does not call `os.platform()`, so a test can
 * supply `win32` and `darwin` without reading the live machine.
 */
export function decideVisual(
  current: BaselineMeta,
  baseline: BaselineMeta | null,
): { action: "compare" | "skip-mismatch" | "skip-missing"; reason: string } {
  assertReviewWidth(current.width);
  if (baseline === null) {
    return { action: "skip-missing", reason: "no baseline" };
  }
  assertReviewWidth(baseline.width);
  if (current.os !== baseline.os) {
    return {
      action: "skip-mismatch",
      reason: `os mismatch: current ${current.os}, baseline ${baseline.os}`,
    };
  }
  if (current.scale !== baseline.scale) {
    return {
      action: "skip-mismatch",
      reason: `scale mismatch: current ${current.scale}, baseline ${baseline.scale}`,
    };
  }
  if (current.width !== baseline.width) {
    return {
      action: "skip-mismatch",
      reason: `width mismatch: current ${current.width}, baseline ${baseline.width}`,
    };
  }
  return { action: "compare", reason: "same environment" };
}

function assertReviewWidth(width: number): void {
  for (const allowed of REVIEW_WIDTHS) {
    if (width === allowed) return;
  }
  throw new Error(`width ${width} is not in REVIEW_WIDTHS`);
}
