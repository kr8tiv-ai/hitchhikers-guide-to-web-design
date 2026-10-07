/**
 * Symbols are raster traces through @visioncortex/vtracer (wasm).
 * traceRaster and traceSymbol take an impl so unit tests do not load wasm.
 * symbolTrace calls convertBuffer. The wordmark is not traced here.
 */

import { convertBuffer } from "@visioncortex/vtracer";
import { assertLogoSvg, paintInk, setViewBox, svgoOptimize } from "./wordmark.ts";

const SYMBOL_GRID = 32;

export function traceSymbol(png: Buffer, impl: (png: Buffer) => string): string {
  return traceRaster(png, impl);
}

/** Test seam. The impl result is returned only after assertLogoSvg. */
export function traceRaster(png: Buffer, impl: (png: Buffer) => string): string {
  assertPng(png);
  if (typeof impl !== "function") {
    throw new Error("Symbol trace needs an impl.");
  }
  const svg = impl(png);
  assertLogoSvg(svg);
  return svg;
}

/**
 * Trace a PNG with the pinned wasm build.
 * Call: convertBuffer(png, { preset: "bw", mode: "spline" }).
 * The result is optimized, painted #111111, and fitted to 0 0 32 32.
 */
export function symbolTrace(png: Buffer): string {
  assertPng(png);
  const traced = convertBuffer(png, { preset: "bw", mode: "spline" });
  const optimized = svgoOptimize(traced);
  const inked = paintInk(optimized);
  const boxed = setViewBox(inked, SYMBOL_GRID);
  return traceSymbol(png, () => boxed);
}

function assertPng(png: Buffer): void {
  if (!Buffer.isBuffer(png) || png.length === 0) {
    throw new Error("Symbol trace needs PNG bytes.");
  }
}
