import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUG_SCORE_UNIT,
  DEFAULT_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_EXPERIMENTS,
  DEFAULT_WALL_MINUTES,
  MAX_EXPERIMENTS_CEILING,
  NORMAL_PUSH_ARGS,
  SUPERVISE_RESULTS_COLUMNS,
  UX_SCORE_UNIT,
  appendHookLog,
  appendSuperviseResults,
  assertGitAllowed,
  assertNormalPush,
  assertSupervisorBranch,
  assertSupervisorGit,
  assertSupervisorReset,
  countOpenFindings,
  decidePushVerify,
  forceMarker,
  formatHookLogHeader,
  formatSuperviseHeader,
  isSupervisorArtifact,
  logUsesNoVerify,
  parseAgentBriefs,
  parseFindings,
  parsePlaywrightPasses,
  resolveConsecutiveFailures,
  resolveMaxExperiments,
  resolveWallMinutes,
  scanHookFailures,
  score,
  usesNoVerify,
  uxPassCount,
  wallClockExceeded,
  type SuperviseResultRow,
} from "../src/improve/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const PRIOR = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function green(extra: { uxPassed?: number; bugCount?: number } = {}) {
  return score({
    testsPassed: 10,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
    ...extra,
  });
}

test("UX raises a green score and open bugs lower it", () => {
  assert.equal(UX_SCORE_UNIT, 10);
  assert.equal(BUG_SCORE_UNIT, 100);
  const plain = green();
  assert.equal(green({ uxPassed: 3 }), plain + 30);
  assert.equal(green({ bugCount: 2 }), plain - 200);
  assert.equal(green({ uxPassed: 3, bugCount: 2 }), plain + 30 - 200);
  assert.equal(
    score({ testsPassed: 0, testsFailed: 0, doctorExit: 0, tscExit: 0, antiSlopHits: 50 }),
    0,
  );
});

test("a red score ignores UX and stays below every green result", () => {
  const red = score({
    testsPassed: 9_000_000,
    testsFailed: 1,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
    uxPassed: 99_999,
    bugCount: 0,
  });
  const redder = score({
    testsPassed: 9_000_000,
    testsFailed: 1,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
    uxPassed: 99_999,
    bugCount: 4,
  });
  const floor = score({
    testsPassed: 0,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
  });
  assert.ok(red < -1_000_000_000);
  assert.ok(red < floor);
  assert.ok(redder < red);
});

test("UX counts come from the playwright and anti-slop summaries", () => {
  assert.equal(parsePlaywrightPasses("1 passed\n\u001b[32m12 passed\u001b[0m"), 12);
  assert.equal(parsePlaywrightPasses("no summary"), 0);
  assert.equal(uxPassCount("9 passed", "# pass 4\n# fail 1"), 13);
});

test("open findings are unique ids, including the shipped bug scan", () => {
  const scan = readFileSync(path.join(repoRoot, "docs", "bug-scan.md"), "utf8");
  const parsed = parseFindings(scan);
  assert.equal(parsed.some((row) => row.id === "BS-001" && row.status === "fixed"), true);
  assert.equal(parsed.some((row) => row.id === "BS-005" && row.status === "open"), true);
  assert.equal(countOpenFindings([scan]), 1);
  const tsv = "id\tstatus\tarea\tsummary\nBS-001\tfixed\tdesk\ndone\nBS-009\topen\tcli\tbroke\n";
  assert.equal(countOpenFindings([scan, tsv]), 2);
  assert.equal(countOpenFindings([tsv, tsv]), 1);
});

test("a push counts only when both checks pass and force was not refused", () => {
  assert.equal(decidePushVerify({ pushExit: 0, ancestorExit: 0, forceRefused: false }), "pushed");
  assert.equal(decidePushVerify({ pushExit: 1, ancestorExit: 0, forceRefused: false }), "failed");
  assert.equal(decidePushVerify({ pushExit: 0, ancestorExit: 1, forceRefused: false }), "failed");
  assert.equal(decidePushVerify({ pushExit: 0, ancestorExit: 0, forceRefused: true }), "failed");
  assert.equal(decidePushVerify({ pushExit: Number.NaN, ancestorExit: 0, forceRefused: false }), "failed");
});

test("force flags and --no-verify are refused before a normal push is allowed", () => {
  assert.deepEqual([...NORMAL_PUSH_ARGS], ["push", "origin", "main"]);
  assert.equal(forceMarker([...NORMAL_PUSH_ARGS]), null);
  assert.doesNotThrow(() => assertNormalPush([...NORMAL_PUSH_ARGS]));
  assert.doesNotThrow(() => assertSupervisorGit([...NORMAL_PUSH_ARGS]));
  assert.doesNotThrow(() => assertSupervisorGit(["fetch", "origin", "main"]));
  assert.doesNotThrow(() => assertSupervisorGit(["merge-base", "--is-ancestor", PRIOR, "origin/main"]));
  for (const args of [
    ["push", "--force", "origin", "main"],
    ["push", "-f", "origin", "main"],
    ["push", "origin", "main", "--force-with-lease"],
    ["push", "origin", "+refs/heads/main"],
    ["push", "--force=true"],
  ]) {
    assert.throws(() => assertNormalPush(args), /Refusing force push/, args.join(" "));
    assert.throws(() => assertSupervisorGit(args), /Refusing force push/, args.join(" "));
  }
  assert.equal(usesNoVerify(["commit", "--no-verify"]), true);
  assert.throws(() => assertSupervisorGit(["push", "origin", "main", "--no-verify"]), /no-verify/);
  assert.throws(() => assertGitAllowed(["push", "origin", "main"]), /not allowed/);
  assert.throws(() => assertSupervisorGit(["push", "origin", "master"]), /Only git push origin main/);
});

test("caps, the wall clock, and supervisor reset stay inside their ceilings", () => {
  assert.equal(resolveMaxExperiments(undefined), DEFAULT_MAX_EXPERIMENTS);
  assert.equal(DEFAULT_MAX_EXPERIMENTS, 5);
  assert.equal(MAX_EXPERIMENTS_CEILING, 50);
  assert.equal(resolveMaxExperiments(50), 50);
  assert.throws(() => resolveMaxExperiments(51), /1 to 50/);
  assert.throws(() => resolveMaxExperiments(0), /1 to 50/);
  assert.equal(resolveConsecutiveFailures(undefined), DEFAULT_CONSECUTIVE_FAILURES);
  assert.equal(DEFAULT_CONSECUTIVE_FAILURES, 3);
  assert.throws(() => resolveConsecutiveFailures(0), /max-failures/);
  assert.throws(() => resolveConsecutiveFailures(51), /max-failures/);
  assert.equal(resolveWallMinutes(undefined), DEFAULT_WALL_MINUTES);
  assert.equal(resolveWallMinutes(180), 180);
  assert.throws(() => resolveWallMinutes(181), /wall-minutes/);
  assert.equal(wallClockExceeded(60 * 60 * 1000 - 1, 60), false);
  assert.equal(wallClockExceeded(60 * 60 * 1000, 60), true);
  assertSupervisorBranch("main");
  assertSupervisorBranch("improve/desk");
  assert.throws(() => assertSupervisorBranch("master"), /main or an improve branch/);
  assert.doesNotThrow(() =>
    assertSupervisorReset({
      currentBranch: "main",
      configuredBranch: "main",
      targetCommit: PRIOR,
      experimentPrior: PRIOR,
      startedClean: true,
    }),
  );
  assert.throws(
    () =>
      assertSupervisorReset({
        currentBranch: "main",
        configuredBranch: "main",
        targetCommit: PRIOR,
        experimentPrior: PRIOR,
        startedClean: false,
      }),
    /dirty human tree/,
  );
  assert.throws(
    () =>
      assertSupervisorReset({
        currentBranch: "main",
        configuredBranch: "main",
        targetCommit: OTHER,
        experimentPrior: PRIOR,
        startedClean: true,
      }),
    /beyond the experiment rollback/,
  );
  assert.throws(
    () =>
      assertSupervisorReset({
        currentBranch: "HEAD",
        configuredBranch: "main",
        targetCommit: PRIOR,
        experimentPrior: PRIOR,
        startedClean: true,
      }),
    /detached HEAD/,
  );
  assert.equal(isSupervisorArtifact("improve/results.tsv"), true);
  assert.equal(isSupervisorArtifact("improve/findings/desk.tsv"), true);
  assert.equal(isSupervisorArtifact("copy.txt"), false);
});

test("the shipped program names the desk and CLI explorers", () => {
  const briefs = parseAgentBriefs(readFileSync(path.join(repoRoot, "improve", "program.md"), "utf8"));
  assert.equal(briefs.length >= 2, true);
  const desk = briefs.find((brief) => brief.id === "desk-explorer");
  const cli = briefs.find((brief) => brief.id === "cli-explorer");
  assert.equal(desk?.home, "repo");
  assert.equal(desk?.findings, "improve/findings/desk-explorer.tsv");
  assert.equal(cli?.home, "temporary");
  assert.equal(cli?.findings, "improve/findings/cli-explorer.tsv");
  assert.throws(() => parseAgentBriefs("## Test agents\n### desk-explorer\n- home: office\n"), /home/);
});

test("supervisor results and the hook log keep their columns", () => {
  assert.deepEqual(
    [...SUPERVISE_RESULTS_COLUMNS],
    ["n", "started", "commit", "score", "best", "status", "seconds", "note", "pushed", "hooks_ok"],
  );
  const row: SuperviseResultRow = {
    n: 1,
    started: "2026-10-10T21:00:00.000Z",
    commit: "abc123abc123",
    score: 10,
    best: 10,
    status: "failed",
    seconds: 1,
    note: "FAILED push was rejected",
    pushed: "no",
    hooksOk: "no",
  };
  const file = appendSuperviseResults("", row);
  assert.equal(file.startsWith(`${formatSuperviseHeader()}\n`), true);
  assert.equal(file.trimEnd().split("\n")[1]?.endsWith("\tno\tno"), true);
  assert.throws(
    () => appendSuperviseResults("n\tstarted\tcommit\tscore\tbest\tstatus\tseconds\tnote\n", row),
    /header does not match/,
  );
  const hook = appendHookLog("", {
    n: 1,
    command: "git commit",
    exit: 1,
    hook: "pre-commit",
    note: "rejected",
  });
  assert.equal(hook.startsWith(`${formatHookLogHeader()}\n`), true);
  assert.equal(formatHookLogHeader(), "n\tcommand\texit\thook\tnote");
  assert.deepEqual(scanHookFailures("pre-commit is installed"), []);
  const found = scanHookFailures("pre-commit hook failed\nexit code 1");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.hook, "pre-commit");
  assert.equal(found[0]?.exit, 1);
  assert.equal(logUsesNoVerify("git commit --no-verify"), true);
  assert.equal(logUsesNoVerify("Do not skip git hooks."), false);
});
