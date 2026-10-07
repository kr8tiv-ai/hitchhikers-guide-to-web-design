/**
 * Pure classifier for one headless run's event stream.
 *
 * Time is injected as `now`. This module does not read a clock, start a
 * timer, or start a process. The runner will collect streaming-json records
 * later and pass them here. `json` is the only kind that refreshes the stall
 * clock. With no json event yet, the gap is measured from t = 0.
 *
 * A gap of more than 120_000 ms since the last json event, and no exit, is a
 * stall. A gap of exactly 120_000 ms is still ok. Exit code 0 is ok even when
 * that gap is old, because the run has finished. A non-zero exit is a crash
 * unless a build pattern appeared, in which case build-failed wins.
 *
 * Build patterns are case-sensitive substrings: `error TS`, `FAIL`, and
 * `AssertionError`. `FAIL` does not match "fail the vibe check". The word
 * `failed` inside "failed to parse" is not a pattern.
 */

export type SensorVerdict = "ok" | "stall" | "crash" | "build-failed";

/**
 * One record from a run.
 * Unknown kinds do not move the clock and are not an exit. Their text is
 * still scanned for a build failure.
 */
export type SensorEvent = {
  t: number;
  kind: string;
  text?: string;
  code?: number;
};

/** v1 section 11.2 default. Silence must be older than this, not equal to it. */
const STALL_AFTER_MS = 120_000;

/**
 * Case-sensitive. `FAIL` does not match a lowercase "fail", and `failed`
 * is intentionally absent so "failed to parse" stays a crash.
 */
const BUILD_PATTERNS: readonly string[] = ["error TS", "FAIL", "AssertionError"];

function lineIsBuildFailure(text: string): boolean {
  for (const pattern of BUILD_PATTERNS) {
    if (text.includes(pattern)) return true;
  }
  return false;
}

export function classifyRun(events: readonly SensorEvent[], now: number): SensorVerdict {
  if (now < 0) {
    throw new RangeError("now must be zero or greater.");
  }

  const ordered = events.slice().sort((left, right) => left.t - right.t);

  let lastJsonAt = 0;
  let sawExit = false;
  let exitCode = Number.NaN;
  let buildFailed = false;

  for (const event of ordered) {
    const text = event.text;
    if (typeof text === "string" && lineIsBuildFailure(text)) {
      buildFailed = true;
    }
    if (event.kind === "json") {
      lastJsonAt = event.t;
    } else if (event.kind === "exit") {
      sawExit = true;
      const code = event.code;
      exitCode = typeof code === "number" ? code : Number.NaN;
    }
  }

  if (sawExit) {
    // The latest exit by t is the status. A missing code is not exit 0.
    if (exitCode === 0) return "ok";
    return buildFailed ? "build-failed" : "crash";
  }

  if (now - lastJsonAt > STALL_AFTER_MS) return "stall";
  return "ok";
}
