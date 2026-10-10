import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TARGETS,
  MAX_EXPERIMENTS_CEILING,
  RESULTS_COLUMNS,
  appendResults,
  assertGitAllowed,
  assertResetAllowed,
  cleanNote,
  decide,
  dirtyPaths,
  evalFromParts,
  formatResultsHeader,
  formatResultsRow,
  globMatch,
  hashFiles,
  improveBranchName,
  isRed,
  matchProtected,
  nextResultIndex,
  parseProgram,
  parseProtected,
  parseTestCounts,
  pathOutsideTargets,
  resolveBudget,
  resolveMaxExperiments,
  score,
  visibleCopy,
  type ResultRow,
} from "../src/improve/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

function green(passed: number, hits: number) {
  return score({
    testsPassed: passed,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: hits,
  });
}

test("parseProgram reads the shipped desk program", () => {
  const markdown = readFileSync(path.join(repoRoot, "improve", "program.md"), "utf8");
  const program = parseProgram(markdown);
  assert.equal(program.tag, "desk");
  assert.equal(program.model, "grok-4.7");
  assert.equal(program.effort, "xhigh");
  assert.equal(program.minutes, 10);
  assert.equal(program.turns, 40);
  assert.deepEqual(program.targets, [...DEFAULT_TARGETS]);
  assert.equal(program.objective.includes("protected score"), true);
  assert.equal(program.body.includes("One hypothesis per experiment."), true);
  assert.throws(() => parseProgram("no fence"), /front matter/);
  assert.throws(
    () => parseProgram("---\nobjective: ok\ntargets:\n  - ../secret\n---\n"),
    /relative path/,
  );
});

test("a red evaluation scores below every green result", () => {
  const baseline = green(2, 1);
  const hugeRed = score({
    testsPassed: 9_000_000,
    testsFailed: 1,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
  });
  const doctorRed = score({
    testsPassed: 9_000_000,
    testsFailed: 0,
    doctorExit: 3,
    tscExit: 0,
    antiSlopHits: 0,
  });
  const tscRed = score({
    testsPassed: 9_000_000,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 1,
    antiSlopHits: 0,
  });
  assert.equal(baseline >= 0, true);
  assert.equal(hugeRed < baseline, true);
  assert.equal(doctorRed < baseline, true);
  assert.equal(tscRed < baseline, true);
  assert.equal(hugeRed < -1_000_000_000, true);
  assert.equal(isRed({
    testsPassed: 1,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 1,
    antiSlopHits: 0,
  }), true);
  assert.equal(green(0, 50), 0);

  const counted = evalFromParts({
    testsPassed: 4,
    testsFailed: 0,
    testExit: 1,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
  });
  assert.equal(counted.testsFailed, 1);
  assert.equal(score(counted) < green(1, 0), true);
});

test("parseTestCounts sums package summaries and strips color", () => {
  const output = [
    "\u001b[32m# pass 3\u001b[0m",
    "# fail 1",
    "packages/cli",
    "# pass 2",
    "# FAIL 0",
  ].join("\n");
  assert.deepEqual(parseTestCounts(output), { passed: 5, failed: 1 });
});

test("decide keeps only a strict improvement", () => {
  assert.equal(decide(5, 4), "keep");
  assert.equal(decide(4, 4), "discard");
  assert.equal(decide(3, 4), "discard");
  assert.throws(() => decide(Number.NaN, 1), /finite/);
});

test("the shipped protected list blocks gates, secrets, and the evaluation", () => {
  const list = parseProtected(readFileSync(path.join(repoRoot, "improve", "protected.json"), "utf8"));
  const blocked = [
    "DECISIONS.md",
    "context/matt-answers.md",
    ".hh-driver/run-build.ps1",
    "hh-build-plan/prompts/173.md",
    "packages/deploy/src/hostinger.ts",
    ".env",
    "packages/app/.env.local",
    "notes/my-secret.txt",
    "packages/cli/src/main.ts",
    "packages/engine/src/brand/approve.ts",
    "packages/qa/src/antislop.ts",
  ];
  for (const file of blocked) {
    assert.equal(matchProtected(file, list.paths), true, file);
  }
  assert.equal(matchProtected("packages/app/src/design/tokens.ts", list.paths), false);
  assert.equal(matchProtected("packages/app/src/server/card.ts", list.paths), false);
  assert.equal(globMatch(".env", "**/.env.*"), false);
  assert.equal(globMatch("../secret", "**"), false);
  assert.equal(pathOutsideTargets("packages/app/src/design/tokens.ts", list.evaluation), true);
  assert.equal(
    pathOutsideTargets("packages/app/src/design/tokens.ts", ["packages/app/src/design"]),
    false,
  );
  assert.equal(
    pathOutsideTargets("packages/app/src/design-extra/x.ts", ["packages/app/src/design"]),
    true,
  );
  assert.equal(list.evaluation.includes("packages/qa/src/antislop.ts"), true);
  assert.equal(list.evaluation.includes("improve/protected.json"), true);
});

test("hashFiles is stable and changes when a body changes", () => {
  const left = hashFiles([
    { path: "b.txt", body: "1" },
    { path: "a.txt", body: "2" },
  ]);
  const right = hashFiles([
    { path: "a.txt", body: "2" },
    { path: "b.txt", body: "1" },
  ]);
  assert.equal(left, right);
  assert.notEqual(left, hashFiles([{ path: "a.txt", body: "3" }]));
  assert.equal(
    hashFiles([{ path: "dir\\file.txt", body: "x" }]),
    hashFiles([{ path: "dir/file.txt", body: "x" }]),
  );
});

test("results.tsv keeps one header and a single-line note", () => {
  assert.deepEqual([...RESULTS_COLUMNS], ["n", "started", "commit", "score", "best", "status", "seconds", "note"]);
  assert.equal(cleanNote("Go!\n"), "Go.");
  const row: ResultRow = {
    n: 0,
    started: "2026-10-10T21:00:00.000Z",
    commit: "abc123abc123",
    score: 10,
    best: 10,
    status: "keep",
    seconds: 0,
    note: "Go!",
  };
  const file = appendResults("", row);
  assert.equal(file.startsWith(`${formatResultsHeader()}\n`), true);
  assert.equal(file.includes("!"), false);
  assert.equal(file.includes("Go."), true);
  const again = appendResults(file, { ...row, n: 1, status: "discard", note: "lower" });
  assert.equal(nextResultIndex(again), 2);
  assert.equal(nextResultIndex(""), 0);
  assert.throws(() => appendResults("n\tbad\n", row), /header/);
  assert.equal(formatResultsRow(row).split("\t").length, RESULTS_COLUMNS.length);
});

test("caps, branch names, and the git whitelist stay tight", () => {
  assert.equal(resolveMaxExperiments(undefined), 5);
  assert.equal(resolveMaxExperiments(MAX_EXPERIMENTS_CEILING), 50);
  assert.throws(() => resolveMaxExperiments(51), /1 to 50/);
  assert.throws(() => resolveMaxExperiments(0), /1 to 50/);
  assert.equal(resolveBudget(10, undefined, 180, "--minutes"), 10);
  assert.equal(resolveBudget(10, 12, 180, "--minutes"), 12);
  assert.equal(resolveBudget(10, 180, 180, "--minutes"), 180);
  assert.throws(() => resolveBudget(10, 181, 180, "--minutes"), /1 to 180/);
  assert.equal(improveBranchName("2026-10-10", "desk"), "improve/2026-10-10-desk");
  assert.throws(() => improveBranchName("10-10-2026", "desk"), /YYYY-MM-DD/);

  assert.throws(() => assertGitAllowed(["push", "origin", "main"]), /not allowed/);
  assert.throws(() => assertGitAllowed(["deploy"]), /not allowed/);
  assert.throws(() => assertGitAllowed(["reset", "--hard", "--force"]), /not allowed/);
  assert.throws(() => assertGitAllowed(["checkout", "main"]), /not allowed/);
  assert.throws(() => assertGitAllowed(["reset", "--soft", "a".repeat(40)]), /not allowed/);
  assert.doesNotThrow(() => assertGitAllowed(["status", "--porcelain"]));
  assert.doesNotThrow(() => assertGitAllowed(["log", "-1", "--format=%s"]));
  assert.doesNotThrow(() => assertGitAllowed(["reset", "--hard", "a".repeat(40)]));
  assert.doesNotThrow(() => assertGitAllowed(["checkout", "-b", "improve/2026-10-10-desk"]));

  assert.throws(
    () => assertResetAllowed({
      currentBranch: "main",
      improveBranch: "improve/2026-10-10-desk",
      targetCommit: "a".repeat(40),
    }),
    /Refusing to reset main/,
  );
  assert.throws(
    () => assertResetAllowed({
      currentBranch: "feature",
      improveBranch: "feature",
      targetCommit: "a".repeat(40),
    }),
    /not the improve branch/,
  );
  assert.throws(
    () => assertResetAllowed({
      currentBranch: "improve/2026-10-10-desk",
      improveBranch: "improve/2026-10-10-desk",
      targetCommit: "abc",
    }),
    /unpinned/,
  );
  assert.doesNotThrow(() => assertResetAllowed({
    currentBranch: "improve/2026-10-10-desk",
    improveBranch: "improve/2026-10-10-desk",
    targetCommit: "a".repeat(40),
  }));

  const dirty = dirtyPaths(
    ["?? improve/results.tsv", "?? improve/STOP", " M dirt.txt", ""].join("\n"),
    ["improve/results.tsv", "improve/STOP"],
  );
  assert.deepEqual(dirty, ["dirt.txt"]);
});

test("visibleCopy keeps string copy and drops operators", () => {
  const source = "const ok = left !== right;\nconst line = \"Go!\";\n";
  const copy = visibleCopy(source, ".ts");
  assert.equal(copy.includes("!=="), false);
  assert.equal(copy.includes("Go!"), true);
  assert.equal(visibleCopy("Keep !== in this note.", ".md").includes("!=="), true);
});
