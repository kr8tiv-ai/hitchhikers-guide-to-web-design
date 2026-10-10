/**
 * One number for a fixed evaluation. Higher is better.
 * A red test, a bad doctor exit, or a typecheck failure is always below
 * every green score.
 */

export interface EvalResult {
  testsPassed: number;
  testsFailed: number;
  doctorExit: number;
  tscExit: number;
  antiSlopHits: number;
  /** Polish e2e passes plus anti-slop suite passes. Absent means 0. */
  uxPassed?: number;
  /** Open findings. Absent means 0. */
  bugCount?: number;
}

export interface TestCounts {
  passed: number;
  failed: number;
}

const RED_BASE = 1_000_000_000;
const GREEN_UNIT = 1_000;
/** Smaller than one passing test, so a green suite still outranks polish. */
export const UX_SCORE_UNIT = 10;
/** Smaller than one passing test, larger than one polish pass. */
export const BUG_SCORE_UNIT = 100;

function nonNegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

/** Sum node:test TAP summaries. pnpm prefixes each package line. */
export function parseTestCounts(output: string): TestCounts {
  const text = output.replace(/\u001b\[[0-9;]*m/g, "");
  let passed = 0;
  let failed = 0;
  for (const match of text.matchAll(/(?:^|\s)#\s+pass\s+(\d+)\b/gi)) {
    passed += Number(match[1] ?? 0);
  }
  for (const match of text.matchAll(/(?:^|\s)#\s+fail\s+(\d+)\b/gi)) {
    failed += Number(match[1] ?? 0);
  }
  return { passed, failed };
}

/**
 * A non-zero test exit with no parsed failure still counts as one red test,
 * so a missed summary cannot outscore the baseline.
 */
export function evalFromParts(input: {
  testsPassed: number;
  testsFailed: number;
  testExit: number;
  doctorExit: number;
  tscExit: number;
  antiSlopHits: number;
  uxPassed?: number;
  bugCount?: number;
}): EvalResult {
  let testsFailed = input.testsFailed;
  if (input.testExit !== 0 && testsFailed === 0) testsFailed = 1;
  const result: EvalResult = {
    testsPassed: input.testsPassed,
    testsFailed,
    doctorExit: input.doctorExit,
    tscExit: input.tscExit,
    antiSlopHits: input.antiSlopHits,
  };
  if (input.uxPassed !== undefined) result.uxPassed = input.uxPassed;
  if (input.bugCount !== undefined) result.bugCount = input.bugCount;
  return result;
}

/** Playwright's summary line. The last count wins. Missing text is 0. */
export function parsePlaywrightPasses(output: string): number {
  const text = output.replace(/\u001b\[[0-9;]*m/g, "");
  let found = 0;
  for (const match of text.matchAll(/(\d+)\s+passed\b/g)) {
    found = Number(match[1] ?? 0);
  }
  return found;
}

/**
 * UX term from the suites that already exist.
 * Polish is the Playwright pass count. Anti-slop is the node:test pass count.
 */
export function uxPassCount(polishOutput: string, antiSlopOutput: string): number {
  return parsePlaywrightPasses(polishOutput) + parseTestCounts(antiSlopOutput).passed;
}

export function isRed(result: EvalResult): boolean {
  return result.testsFailed > 0 || result.doctorExit !== 0 || result.tscExit !== 0;
}

/**
 * Green scores are >= 0. Red scores are < -1e9.
 * UX raises a green score. Open bugs lower it.
 * A red tree ignores UX, so polish cannot outrank a failed test or typecheck.
 */
export function score(result: EvalResult): number {
  const passed = nonNegative(result.testsPassed, "testsPassed");
  const failed = nonNegative(result.testsFailed, "testsFailed");
  const hits = nonNegative(result.antiSlopHits, "antiSlopHits");
  const ux = nonNegative(result.uxPassed ?? 0, "uxPassed");
  const bugs = nonNegative(result.bugCount ?? 0, "bugCount");
  if (!Number.isFinite(result.doctorExit) || !Number.isFinite(result.tscExit)) {
    throw new Error("exit codes must be finite.");
  }
  const doctorBad = result.doctorExit === 0 ? 0 : 1;
  const tscBad = result.tscExit === 0 ? 0 : 1;
  if (failed > 0 || doctorBad !== 0 || tscBad !== 0) {
    return -(RED_BASE + failed * 1_000 + doctorBad * 100 + tscBad * 100 + hits + bugs);
  }
  return Math.max(0, passed * GREEN_UNIT - hits + ux * UX_SCORE_UNIT - bugs * BUG_SCORE_UNIT);
}
