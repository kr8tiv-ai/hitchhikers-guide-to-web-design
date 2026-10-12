/**
 * Interview and judge calls share one model and the person's chosen effort.
 * Planning and build tasks are not rewritten here.
 */

export const INTERVIEW_MODEL = "grok-4.7-build-fast";
export const INTERVIEW_EFFORT_DEFAULT = "xhigh" as const;

export const INTERVIEW_TASKS = new Set([
  "pushback-judge",
  "suggest",
  "guide-message",
  "mirror",
  "prefetch",
]);

export type EffortName = "medium" | "high" | "xhigh";

export function isInterviewTask(task: string): boolean {
  return INTERVIEW_TASKS.has(task);
}

export function chosenEffort(effort: string | undefined): EffortName {
  if (effort === "medium" || effort === "high" || effort === "xhigh") return effort;
  return INTERVIEW_EFFORT_DEFAULT;
}

/**
 * Interview tasks always use INTERVIEW_MODEL.
 * Effort is the saved setting, or Extra high when nothing is saved.
 * A per-request effort cannot lower or raise that choice.
 */
export function planInterview(
  req: { task: string; model?: string; effort?: string },
  cfg: { ai: { model: string; effort: { default: string } } },
): { model: string; effort: EffortName; interview: boolean } {
  if (!isInterviewTask(req.task)) {
    const effort = chosenEffort(req.effort ?? cfg.ai.effort.default);
    return { model: req.model ?? cfg.ai.model, effort, interview: false };
  }
  return { model: INTERVIEW_MODEL, effort: chosenEffort(cfg.ai.effort.default), interview: true };
}

/** Interview calls stay inside the project. Other calls keep the scratch dir. */
export function callCwd(task: string, projectDir: string, scratch: string): string {
  return isInterviewTask(task) ? projectDir : scratch;
}

/** Maps the single time question onto the interview depth. */
export function depthFromTimeAnswer(text: string): "express" | "standard" | "deep" | null {
  const value = text.toLowerCase();
  if (/under 30|30 minutes|\bexpress\b/.test(value)) return "express";
  if (/about an hour|\bstandard\b/.test(value)) return "standard";
  if (/few hours|\bdeep\b/.test(value)) return "deep";
  return null;
}
