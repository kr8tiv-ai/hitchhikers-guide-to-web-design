import { score, type EvalResult } from "@hitchhiker/engine";

/**
 * Why a baseline cannot anchor a run, or null when it is a real positive number.
 * A run that starts from a broken or unparsed baseline only measures noise, so the
 * supervisor stops and reports instead of spending agent time.
 */
export function baselineProblem(result: EvalResult): string | null {
  if (result.testsPassed < 1) return "baseline counted 0 passing tests (the test output was not parsed or the suite did not run)";
  if (result.testsFailed > 0) return `baseline has ${result.testsFailed} failing test${result.testsFailed === 1 ? "" : "s"}`;
  if (result.doctorExit !== 0) return `baseline doctor exited ${result.doctorExit}`;
  if (result.tscExit !== 0) return `baseline typecheck exited ${result.tscExit}`;
  const value = score(result);
  if (!Number.isFinite(value) || value <= 0) return `baseline score ${value} is not a positive number`;
  return null;
}
