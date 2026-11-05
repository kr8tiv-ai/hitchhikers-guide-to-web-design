/** Optional constitution values. A recipe keeps its default when a field is omitted. */
export interface MotionTokenChoice {
  ease?: string;
  duration?: number;
}

export function takenEase(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? fallback : trimmed;
}

export function takenDuration(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
