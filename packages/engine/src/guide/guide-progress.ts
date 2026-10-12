/**
 * Plain progress for a Guide call. Ranges come from real successful durations.
 */

export const GUIDE_STALL_MS = 120_000;
export const GUIDE_INTERVIEW_TIMEOUT_MS = 110_000;

export const GUIDE_STAGES = [
  "Sending to Grok",
  "Grok is reading your answer",
  "Checking against your earlier answers",
  "Writing the next question",
] as const;

export type GuideStage = (typeof GUIDE_STAGES)[number];

export const READING_LINE = "Guide is reading your answer…";
export const GUIDE_FAIL_LINE = "The Guide couldn't finish checking this answer.";

/** Median and 90th percentile of the last samples. Hidden until there are 3. */
export function usualRange(samples: readonly number[]): { low: number; high: number } | null {
  const recent = samples.filter((value) => Number.isFinite(value) && value >= 0).slice(-10);
  if (recent.length < 3) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  return { low: Math.round(percentile(sorted, 0.5)), high: Math.round(percentile(sorted, 0.9)) };
}

export function usualRangeLine(samples: readonly number[]): string | null {
  const range = usualRange(samples);
  if (range === null) return null;
  return `Usually takes about ${range.low} to ${range.high} seconds`;
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  const value = sorted[index] ?? 0;
  return value / 1000;
}
