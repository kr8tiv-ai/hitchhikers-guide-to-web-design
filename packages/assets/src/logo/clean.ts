/**
 * Model clean-up for a traced logo, then SVGO.
 * think() is the 017 adapter. A bad model result keeps the SVGO SVG.
 * The silhouette check rejects a mark whose area moves by more than 5%.
 */

import { think, validateJson, type JsonSchema } from "@hitchhiker/engine";
import { assertLogoSvg, svgoOptimize } from "../wordmark.ts";
import {
  hasViewBox,
  isSquareViewBox,
  measureSilhouette,
  silhouetteDelta,
} from "./checks.ts";

export const LOGO_CLEAN_TASK = "logo-clean";

export const LOGO_SVG_MAX_BYTES = 30 * 1024;

/** Area may move this far. Past it, the model result is discarded. */
export const SILHOUETTE_AREA_LIMIT = 0.05;

/** Scale-normalized overlap. Below this, the outline moved, not just the frame. */
export const SILHOUETTE_IOU_MIN = 0.9;

export const LOGO_CLEAN_SCHEMA: JsonSchema = {
  type: "object",
  required: ["svg", "changes"],
  properties: {
    svg: { type: "string" },
    changes: { type: "array", items: { type: "string" } },
  },
};

export const LOGO_CLEAN_INSTRUCTIONS = [
  "Clean this traced logo SVG.",
  "Keep the shape.",
  "Remove stray nodes under 0.5% of the viewBox area.",
  "Snap coordinates to a 0.5-unit grid.",
  "Unify stroke widths.",
  "Set a tight square-safe viewBox.",
  "Do not embed a raster image.",
  "Do not add text elements.",
  "Return JSON with the svg string and a changes list.",
].join("\n");

export interface CleanLogoResult {
  svg: string;
  changes: string[];
  usedModel: boolean;
}

type Think = typeof think;

export async function cleanLogo(svg: string, deps: { think: Think }): Promise<CleanLogoResult> {
  if (typeof svg !== "string" || svg.trim().length === 0) {
    throw new Error("Logo SVG is empty.");
  }
  const fallback = optimizeOrThrow(svg);
  assertLogoSvg(fallback);

  let value: unknown;
  try {
    const result = await deps.think<{ svg: string; changes: string[] }>({
      task: LOGO_CLEAN_TASK,
      schema: LOGO_CLEAN_SCHEMA,
      input: `${LOGO_CLEAN_INSTRUCTIONS}\n\n${svg}`,
    });
    value = result.value;
  } catch (error) {
    return reject(fallback, errorText(error));
  }

  const schemaErrors = validateJson(value, LOGO_CLEAN_SCHEMA);
  if (schemaErrors.length > 0 || !isCleanValue(value)) {
    return reject(fallback, "The model output failed schema validation.");
  }

  let optimized: string;
  try {
    optimized = svgoOptimize(value.svg);
    assertCleanedLogoSvg(optimized);
  } catch (error) {
    return reject(fallback, errorText(error));
  }

  let delta: { areaDelta: number; iou: number };
  try {
    delta = silhouetteDelta(measureSilhouette(fallback), measureSilhouette(optimized));
  } catch (error) {
    return reject(fallback, errorText(error));
  }
  if (delta.areaDelta > SILHOUETTE_AREA_LIMIT) {
    return reject(fallback, "The model output changes the silhouette. Area differs by more than 5%.");
  }
  if (delta.iou < SILHOUETTE_IOU_MIN) {
    return reject(fallback, "The model output changes the silhouette.");
  }

  return { svg: optimized, changes: value.changes, usedModel: true };
}

/**
 * 055 assertLogoSvg, plus a viewBox and the 30 KB cap.
 * Parses by running SVGO only when the caller has not already optimized.
 */
export function assertCleanedLogoSvg(svg: string): void {
  assertLogoSvg(svg);
  if (!/<svg\b/i.test(svg) || !/<\/svg>/i.test(svg)) {
    throw new Error("Logo SVG needs an svg element.");
  }
  if (!hasViewBox(svg)) {
    throw new Error("Logo SVG needs a viewBox.");
  }
  if (!isSquareViewBox(svg)) {
    throw new Error("Logo SVG needs a square viewBox.");
  }
  if (!/<path\b/i.test(svg)) {
    throw new Error("Logo SVG needs a path.");
  }
  if (Buffer.byteLength(svg, "utf8") >= LOGO_SVG_MAX_BYTES) {
    throw new Error("Logo SVG is over 30 KB after SVGO.");
  }
}

function optimizeOrThrow(svg: string): string {
  try {
    return svgoOptimize(svg);
  } catch {
    throw new Error("SVGO could not parse the logo SVG.");
  }
}

function reject(svg: string, reason: string): CleanLogoResult {
  return {
    svg,
    changes: [`Kept the SVGO version. ${reason}`],
    usedModel: false,
  };
}

function isCleanValue(value: unknown): value is { svg: string; changes: string[] } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.svg !== "string" || !Array.isArray(record.changes)) return false;
  return record.changes.every((item) => typeof item === "string");
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.split("\n")[0] ?? "The model output failed.";
  }
  return "The model output failed.";
}
