/**
 * Audit 13, imagery half. One grade across the page.
 *
 * Temperature, contrast, and saturation are measured outcomes. The check
 * does not ban a camera, a filter, or a library. A second grade on the
 * same page fails. Image credits live in licenses.ts.
 */

export const GRADE_AXIS_TOLERANCE = 0.12;

export interface ImagerySample {
  src: string;
  /** 0 is cool, 1 is warm. */
  temperature: number;
  /** 0 is flat, 1 is hard. */
  contrast: number;
  /** 0 is grey, 1 is saturated. */
  saturation: number;
}

export interface ImageryGradeResult {
  ok: boolean;
  grade: string;
  problems: string[];
}

interface GradePoint {
  temperature: number;
  contrast: number;
  saturation: number;
}

function band(value: number, low: string, mid: string, high: string): string {
  if (value < 0.34) return low;
  if (value < 0.67) return mid;
  return high;
}

/** The grade name for one measured image. */
export function imageryGradeName(sample: GradePoint): string {
  const temperature = band(sample.temperature, "cool", "neutral", "warm");
  const contrast = band(sample.contrast, "flat", "even", "hard");
  const saturation = band(sample.saturation, "muted", "natural", "vivid");
  return `${temperature}, ${contrast}, ${saturation}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return 0;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  if (lower === undefined) return upper;
  return (lower + upper) / 2;
}

function axisProblem(sample: ImagerySample): string | null {
  const axes = [
    ["temperature", sample.temperature],
    ["contrast", sample.contrast],
    ["saturation", sample.saturation],
  ] as const;
  for (const [name, value] of axes) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return `${sample.src} has a ${name} of ${String(value)}. Expected a number from 0 to 1.`;
    }
  }
  return null;
}

function outside(sample: ImagerySample, center: GradePoint, grade: string): boolean {
  if (imageryGradeName(sample) !== grade) return true;
  return (
    Math.abs(sample.temperature - center.temperature) > GRADE_AXIS_TOLERANCE
    || Math.abs(sample.contrast - center.contrast) > GRADE_AXIS_TOLERANCE
    || Math.abs(sample.saturation - center.saturation) > GRADE_AXIS_TOLERANCE
  );
}

/**
 * Pass when every image sits on the page grade. The grade is the median
 * temperature, contrast, and saturation. Spread past the tolerance fails.
 */
export function checkImageryGrade(samples: readonly ImagerySample[]): ImageryGradeResult {
  const problems: string[] = [];
  const usable: ImagerySample[] = [];
  for (const sample of samples) {
    const problem = axisProblem(sample);
    if (problem !== null) {
      problems.push(problem);
      continue;
    }
    usable.push(sample);
  }
  if (usable.length === 0) {
    return {
      ok: problems.length === 0,
      grade: "none",
      problems,
    };
  }
  const center: GradePoint = {
    temperature: median(usable.map((sample) => sample.temperature)),
    contrast: median(usable.map((sample) => sample.contrast)),
    saturation: median(usable.map((sample) => sample.saturation)),
  };
  const grade = imageryGradeName(center);
  for (const sample of usable) {
    if (!outside(sample, center, grade)) continue;
    problems.push(
      `${sample.src} is outside the page grade (${grade}). Temperature, contrast, and saturation stay within ${GRADE_AXIS_TOLERANCE} of that grade.`,
    );
  }
  return { ok: problems.length === 0, grade, problems };
}
