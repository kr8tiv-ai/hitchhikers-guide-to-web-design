/**
 * Next build prompt from a project file.
 * Empty last_done starts at 1. Otherwise it is parseInt(last_done, 10) + 1.
 * That is the same rule as resumeFrom in packages/qa/src/driver-plan.mjs when startAt is 0.
 */

export function nextPromptId(lastDone: string): number {
  const raw = lastDone.trim();
  if (raw.length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed + 1;
  }
  return 1;
}
