/**
 * Decide whether a measured image is upscaled locally, left alone, or
 * offered as an Imagine replacement. This file does not call Imagine,
 * fetch weights, or spawn the runner itself. runUpscale only talks to
 * the injected spawn, with one argument per flag, so a Windows path
 * that contains spaces stays one argument.
 *
 * The ncnn binary defaults to the anime video model. Photographs use
 * realesrgan-x4plus, which ships in the official portable archive.
 */

import { assertGradeFacts, type GradeFacts } from "./grade.ts";

export const DEFAULT_TARGET_LONG_SIDE = 1920;
/** Shown with the before and after. The upscale is the same photo. */
export const UPSCALE_REVIEW_LINE = "happy with this?";
export const REALESRGAN_PHOTO_MODEL = "realesrgan-x4plus";
export const ALREADY_LARGE_REASON = "already large enough";

const SHARP_ENOUGH = 0.3;

export interface UpscalePlan {
  action: "skip" | "upscale" | "imagine-replacement";
  scale?: 2 | 4;
  reason: string;
}

export interface UpscaleSpawn {
  runner: string;
  modelDir: string;
  spawnImpl: (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }>;
}

function replacementAllowed(facts: GradeFacts, yes: boolean): boolean {
  if (!facts.subjectIsReal) return true;
  return yes;
}

function scaleFor(longSide: number, target: number): 2 | 4 {
  if (longSide * 2 >= target) return 2;
  return 4;
}

/**
 * Upscale when the long side is under the slot target (default 1920).
 * Scale 2 when that reaches the target, otherwise 4.
 * A sharp image that already meets the target is skipped.
 * imagine-replacement is refused for a real subject unless yes is true,
 * and it is not chosen while a local upscale can still grow the frame.
 */
export function upscalePlan(
  facts: GradeFacts,
  yes: boolean,
  targetLongSide?: number,
): UpscalePlan {
  assertGradeFacts(facts);
  if (typeof yes !== "boolean") throw new Error("yes must be a boolean.");
  const target = targetLongSide ?? DEFAULT_TARGET_LONG_SIDE;
  if (!Number.isFinite(target) || target < 1) {
    throw new Error("targetLongSide must be a finite number of at least 1.");
  }

  const longSide = Math.max(facts.width, facts.height);
  const sharp = facts.sharpness >= SHARP_ENOUGH;

  if (longSide >= target && sharp) {
    return { action: "skip", reason: ALREADY_LARGE_REASON };
  }

  if (longSide < target) {
    const scale = scaleFor(longSide, target);
    return {
      action: "upscale",
      scale,
      reason: `long side ${longSide} is under ${target}. Show the before and after, then ask ${UPSCALE_REVIEW_LINE}`,
    };
  }

  if (replacementAllowed(facts, yes)) {
    const reason = facts.subjectIsReal
      ? "soft real subject may be replaced because yes was passed"
      : "soft image is not a real subject, so a replacement can be offered";
    return { action: "imagine-replacement", reason };
  }

  return {
    action: "skip",
    reason: "real subject is not replaced without yes",
  };
}

export async function runUpscale(
  input: string,
  output: string,
  scale: 2 | 4,
  deps: UpscaleSpawn,
): Promise<void> {
  if (scale !== 2 && scale !== 4) throw new Error("Upscale scale must be 2 or 4.");
  if (input.length === 0 || output.length === 0) {
    throw new Error("Upscale needs an input path and an output path.");
  }
  if (deps.runner.length === 0 || deps.modelDir.length === 0) {
    throw new Error("Upscale needs a runner and a model directory.");
  }
  if (typeof deps.spawnImpl !== "function") {
    throw new Error("Upscale needs an injected spawn.");
  }

  const args = [
    "-i",
    input,
    "-o",
    output,
    "-s",
    String(scale),
    "-m",
    deps.modelDir,
    "-n",
    REALESRGAN_PHOTO_MODEL,
  ];
  const result = await deps.spawnImpl(deps.runner, args);
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    throw new Error(detail.length > 0 ? detail : `Real-ESRGAN exited with code ${result.code}.`);
  }
}
