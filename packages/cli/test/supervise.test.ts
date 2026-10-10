import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SUPERVISE_RESULTS_COLUMNS, score, type EvalResult } from "@hitchhiker/engine";
import { runCli } from "../src/main.ts";
import {
  SUPERVISOR_DENY_RULES,
  agentPrompt,
  buildAgentArgv,
  runBoundedProcess,
  type AgentRunRequest,
  type AgentRunResult,
} from "../src/improve/agents.ts";
import { openBugCountFromDisk } from "../src/improve/evaluate.ts";
import { runSupervisorGit, verifyKeptCommit, type GitText } from "../src/improve/pushcheck.ts";
import { runSupervise } from "../src/improve/supervisor.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const FROZEN = new Date("2026-10-10T21:00:00.000Z");

const PROGRAM = `---
tag: desk
objective: Raise the protected score.
targets:
  - copy.txt
minutes: 4
turns: 6
model: grok-4.7
effort: xhigh
---

One hypothesis.

## Test agents

### desk-explorer

- home: repo
- findings: improve/findings/desk-explorer.tsv

Walk the desk through Playwright.

### cli-explorer

- home: temporary
- findings: improve/findings/cli-explorer.tsv

Exercise the CLI in a temporary home.
`;

const PROTECTED = JSON.stringify({
  paths: [
    "DECISIONS.md",
    "context/**",
    ".hh-driver/**",
    "hh-build-plan/prompts/**",
    "**/.env",
    "**/.env.*",
  ],
  evaluation: ["metric.txt"],
});

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
    throw new Error(detail.length > 0 ? detail : `git ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").replace(/\r\n/g, "\n");
}

function initRepo(branch: string): string {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "hh-supervise-"));
  git(cwd, ["init", "-b", branch]);
  mkdirSync(path.join(cwd, ".empty-hooks"));
  git(cwd, ["config", "core.hooksPath", ".empty-hooks"]);
  git(cwd, ["config", "user.email", "improve@example.com"]);
  git(cwd, ["config", "user.name", "Improve"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  git(cwd, ["config", "core.autocrlf", "false"]);
  git(cwd, ["config", "gc.auto", "0"]);
  return cwd;
}

function initPair(): { work: string; origin: string } {
  const origin = mkdtempSync(path.join(os.tmpdir(), "hh-origin-"));
  const bare = spawnSync("git", ["init", "--bare", "-b", "main"], {
    cwd: origin,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (bare.status !== 0) {
    spawnSync("git", ["init", "--bare"], {
      cwd: origin,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
  }
  spawnSync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
    cwd: origin,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  spawnSync("git", ["config", "gc.auto", "0"], {
    cwd: origin,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const work = initRepo("main");
  git(work, ["remote", "add", "origin", origin]);
  return { work, origin };
}

function remove(dir: string): void {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

function seed(cwd: string, program = PROGRAM): void {
  mkdirSync(path.join(cwd, "improve"), { recursive: true });
  writeFileSync(path.join(cwd, "improve", "program.md"), program, "utf8");
  writeFileSync(path.join(cwd, "improve", "protected.json"), PROTECTED, "utf8");
  writeFileSync(path.join(cwd, "README.md"), "v1\n", "utf8");
  writeFileSync(path.join(cwd, "copy.txt"), "v1 desk\n", "utf8");
  writeFileSync(path.join(cwd, "metric.txt"), "metric\n", "utf8");
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "seed", "--no-gpg-sign"]);
}

function head(cwd: string): string {
  return git(cwd, ["rev-parse", "HEAD"]).trim();
}

function commitFile(cwd: string, file: string, body: string, message: string): void {
  writeFileSync(path.join(cwd, file), body, "utf8");
  git(cwd, ["add", "--", file]);
  git(cwd, ["commit", "-m", message, "--no-gpg-sign"]);
}

function rows(cwd: string): string[][] {
  const text = readFileSync(path.join(cwd, "improve", "results.tsv"), "utf8").replace(/\r\n/g, "\n");
  const lines = text.trimEnd().split("\n");
  assert.equal(lines[0], SUPERVISE_RESULTS_COLUMNS.join("\t"));
  return lines.slice(1).map((line) => line.split("\t"));
}

function baseResult(uxPassed: number, bugCount: number, testsPassed = 10): EvalResult {
  return {
    testsPassed,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: 0,
    uxPassed,
    bugCount,
  };
}

function idle(log = ""): (request: AgentRunRequest) => Promise<AgentRunResult> {
  return async () => ({ timedOut: false, exitCode: 0, note: "", log });
}

function trackedPush(work: string, origin: string, rewindTo: string | null): {
  verify: (commit: string) => ReturnType<typeof verifyKeptCommit>;
  args: string[][];
} {
  const args: string[][] = [];
  return {
    args,
    verify: (commit) =>
      verifyKeptCommit(work, commit, (dir, gitArgs): GitText => {
        args.push([...gitArgs]);
        if (rewindTo !== null && gitArgs[0] === "fetch") {
          git(origin, ["update-ref", "refs/heads/main", rewindTo]);
        }
        return runSupervisorGit(dir, gitArgs);
      }),
  };
}

test("the command table lists hh improve supervise", async () => {
  const outcome = await runCli(["drive"]);
  assert.equal(outcome.exitCode, 2);
  assert.match(outcome.stderr ?? "", /^  hh improve supervise$/m);
});

test("a live run refuses a dirty tree and a detached HEAD", async () => {
  const dirty = initRepo("main");
  const detached = initRepo("main");
  try {
    seed(dirty);
    writeFileSync(path.join(dirty, "dirt.txt"), "x\n", "utf8");
    const dirt = await runSupervise(["--max-experiments", "1"], {
      cwd: dirty,
      now: () => FROZEN,
      runAgent: idle(),
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(dirt.exitCode, 2);
    assert.match(dirt.stdout, /Refusing to start: the work tree is dirty/);
    assert.equal(existsSync(path.join(dirty, "improve", "results.tsv")), false);

    seed(detached);
    git(detached, ["checkout", "--detach"]);
    const head = await runSupervise(["--max-experiments", "1"], {
      cwd: detached,
      now: () => FROZEN,
      runAgent: idle(),
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(head.exitCode, 2);
    assert.match(head.stdout, /HEAD is detached/);
  } finally {
    remove(dirty);
    remove(detached);
  }
});

test("dry-run stays quiet, lists both agents, and enforces the ceilings", async () => {
  const outcome = await runSupervise(["--dry-run", "--max-experiments", "1", "--always-approve"], {
    cwd: repoRoot,
  });
  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.stdout, /desk-explorer/);
  assert.match(outcome.stdout, /cli-explorer/);
  assert.match(outcome.stdout, /always-approve: on/);
  assert.match(outcome.stdout, /push: git push origin main/);
  assert.match(outcome.stdout, /max-failures: 3/);
  assert.match(outcome.stdout, /wall-minutes: 60/);
  const capped = await runSupervise(["--dry-run", "--max-experiments", "50"], { cwd: repoRoot });
  assert.equal(capped.exitCode, 0);
  assert.match(capped.stdout, /max-experiments: 50/);
  const tooMany = await runSupervise(["--max-experiments", "51"], { cwd: repoRoot });
  assert.equal(tooMany.exitCode, 2);
  assert.match(tooMany.stdout, /1 to 50/);
  const zero = await runSupervise(["--max-experiments", "0"], { cwd: repoRoot });
  assert.equal(zero.exitCode, 2);
  const failures = await runSupervise(["--max-failures", "51"], { cwd: repoRoot });
  assert.equal(failures.exitCode, 2);
  assert.match(failures.stdout, /max-failures/);
  const wall = await runSupervise(["--wall-minutes", "181"], { cwd: repoRoot });
  assert.equal(wall.exitCode, 2);
  assert.match(wall.stdout, /wall-minutes/);
  const flag = await runSupervise(["--no-verify"], { cwd: repoRoot });
  assert.equal(flag.exitCode, 2);
  assert.match(flag.stdout, /Refusing --no-verify/);
});

test("a rejected push stops the loop and writes the notice", async () => {
  const { work, origin } = initPair();
  try {
    seed(work);
    git(work, ["push", "origin", "main"]);
    commitFile(work, "copy.txt", "v2\n", "second");
    git(work, ["push", "origin", "main"]);
    const behind = git(work, ["rev-parse", "HEAD~1"]).trim();
    git(work, ["reset", "--hard", behind]);
    const calls: string[] = [];
    let evaluations = 0;
    const pushed = trackedPush(work, origin, null);
    const outcome = await runSupervise(["--max-experiments", "5"], {
      cwd: work,
      now: () => FROZEN,
      runAgent: async (request) => {
        calls.push(request.briefId);
        commitFile(request.cwd, "copy.txt", "v3\n", "clearer desk line");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return baseResult(1, 0, evaluations === 1 ? 10 : 11);
      },
      verifyPush: pushed.verify,
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /FAILED: push was rejected/);
    assert.equal(calls.length, 1);
    assert.deepEqual(pushed.args, [["push", "origin", "main"]]);
    const notice = readFileSync(path.join(work, "improve", "PUSH-FAILED.txt"), "utf8");
    assert.equal(notice.startsWith("FAILED\n"), true);
    const parsed = rows(work);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1]?.[5], "failed");
    assert.equal(parsed[1]?.[8], "no");
    assert.match(parsed[1]?.[7] ?? "", /^FAILED/);
    assert.equal(git(work, ["log", "-1", "--format=%s"]).trim(), "clearer desk line");
    assert.notEqual(head(work), behind);
  } finally {
    remove(work);
    remove(origin);
  }
});

test("an ancestor check failure is a failed push", async () => {
  const { work, origin } = initPair();
  try {
    seed(work);
    git(work, ["push", "origin", "main"]);
    const parent = head(work);
    let evaluations = 0;
    const pushed = trackedPush(work, origin, parent);
    const outcome = await runSupervise(["--max-experiments", "2"], {
      cwd: work,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(work, "copy.txt", "v2\n", "clearer desk line");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return baseResult(0, 0, evaluations === 1 ? 10 : 12);
      },
      verifyPush: pushed.verify,
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /FAILED: origin\/main does not contain the commit/);
    assert.equal(existsSync(path.join(work, "improve", "PUSH-FAILED.txt")), true);
    assert.equal(rows(work)[1]?.[5], "failed");
    assert.equal(rows(work)[1]?.[8], "no");
    assert.equal(pushed.args.some((args) => args.includes("--force") || args.includes("-f")), false);
    const kept = head(work);
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", kept, "origin/main"], {
      cwd: work,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.notEqual(ancestor.status, 0);
  } finally {
    remove(work);
    remove(origin);
  }
});

test("a kept commit is pushed with git push origin main and verified", async () => {
  const { work, origin } = initPair();
  try {
    seed(work);
    git(work, ["push", "origin", "main"]);
    const first = baseResult(2, 1, 10);
    const second = baseResult(4, 0, 11);
    let evaluations = 0;
    const pushed = trackedPush(work, origin, null);
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd: work,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(work, "copy.txt", "v2\n", "clearer desk line");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return evaluations === 1 ? first : second;
      },
      verifyPush: pushed.verify,
    });
    const notice = existsSync(path.join(work, "improve", "PUSH-FAILED.txt"))
      ? readFileSync(path.join(work, "improve", "PUSH-FAILED.txt"), "utf8")
      : "";
    assert.equal(outcome.exitCode, 0, `${outcome.stdout}\n${notice}\nARGS ${JSON.stringify(pushed.args)}`);
    const parsed = rows(work);
    assert.equal(parsed[0]?.[5], "keep");
    assert.equal(parsed[0]?.[8], "no");
    assert.equal(parsed[0]?.[9], "yes");
    assert.equal(parsed[1]?.[5], "keep");
    assert.equal(parsed[1]?.[8], "yes");
    assert.equal(parsed[1]?.[9], "yes");
    assert.equal(Number(parsed[0]?.[3]), score(first));
    assert.equal(Number(parsed[1]?.[3]), score(second));
    assert.ok(score(second) > score(first));
    const commit = head(work);
    assert.deepEqual(pushed.args[0], ["push", "origin", "main"]);
    assert.deepEqual(pushed.args[1], ["fetch", "origin", "main"]);
    assert.deepEqual(pushed.args[2], ["merge-base", "--is-ancestor", commit, "origin/main"]);
    const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", commit, "origin/main"], {
      cwd: work,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.equal(ancestor.status, 0);
  } finally {
    remove(work);
    remove(origin);
  }
});

test("a force flag is refused before git runs", async () => {
  const { work, origin } = initPair();
  try {
    seed(work);
    const before = head(work);
    for (const args of [
      ["push", "--force", "origin", "main"],
      ["push", "-f", "origin", "main"],
      ["push", "--force-with-lease", "origin", "main"],
      ["push", "origin", "+refs/heads/main"],
      ["push", "origin", "main", "--no-verify"],
    ]) {
      assert.throws(() => runSupervisorGit(work, args), /Refusing/, args.join(" "));
    }
    assert.equal(head(work), before);
    const only = trackedPush(work, origin, null);
    const check = only.verify("not-a-commit");
    assert.equal(check.ok, false);
    assert.equal(only.args.length, 0);
  } finally {
    remove(work);
    remove(origin);
  }
});

test("a failing hook discards the experiment and writes a hook-log row", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    const prior = head(cwd);
    const pushes: string[][] = [];
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(cwd, "copy.txt", "v2\n", "hooked change");
        return {
          timedOut: false,
          exitCode: 0,
          note: "",
          log: "[hh-command] exit=1 hook=pre-commit command=git commit note=hook rejected the commit\n",
        };
      },
      evaluate: async () => baseResult(0, 0, 20),
      verifyPush: (commit) => {
        pushes.push(["push", commit]);
        return { ok: true, output: "", hook: "", exit: 0, reason: "" };
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(pushes.length, 0);
    assert.equal(head(cwd), prior);
    const parsed = rows(cwd);
    assert.equal(parsed[1]?.[5], "discard");
    assert.equal(parsed[1]?.[8], "no");
    assert.equal(parsed[1]?.[9], "no");
    assert.match(parsed[1]?.[7] ?? "", /hook failed: pre-commit/);
    const hook = readFileSync(path.join(cwd, "improve", "hook-log.tsv"), "utf8").replace(/\r\n/g, "\n");
    assert.equal(hook.startsWith("n\tcommand\texit\thook\tnote\n"), true);
    assert.match(hook, /pre-commit/);
    assert.match(hook, /\t1\t/);
  } finally {
    remove(cwd);
  }
});

test("a nonzero command discards the experiment", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    const prior = head(cwd);
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: async () => ({
        timedOut: false,
        exitCode: 0,
        note: "",
        log: "[hh-command] exit=2 hook=none command=pnpm test note=red\n",
      }),
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(head(cwd), prior);
    assert.equal(rows(cwd)[1]?.[5], "discard");
    assert.equal(rows(cwd)[1]?.[7], "command failed");
    assert.equal(rows(cwd)[1]?.[9], "yes");
    const hook = readFileSync(path.join(cwd, "improve", "hook-log.tsv"), "utf8");
    assert.match(hook, /pnpm test/);
    assert.match(hook, /\tnone\t/);
  } finally {
    remove(cwd);
  }
});

test("a protected path change is a violation and resets", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    const prior = head(cwd);
    let evaluations = 0;
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(cwd, "DECISIONS.md", "nope\n", "touch a gate");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return baseResult(0, 0, 30);
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(evaluations, 1);
    assert.equal(head(cwd), prior);
    assert.equal(existsSync(path.join(cwd, "DECISIONS.md")), false);
    assert.equal(rows(cwd)[1]?.[5], "violation");
    assert.match(rows(cwd)[1]?.[7] ?? "", /protected path DECISIONS\.md/);
  } finally {
    remove(cwd);
  }
});

test("an evaluation hash change is a violation", async () => {
  const cwd = initRepo("main");
  try {
    const program = PROGRAM.replace("  - copy.txt\n", "  - copy.txt\n  - metric.txt\n");
    seed(cwd, program);
    const prior = head(cwd);
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(cwd, "metric.txt", "changed\n", "edit the metric");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0, 30),
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(head(cwd), prior);
    assert.equal(readFileSync(path.join(cwd, "metric.txt"), "utf8"), "metric\n");
    assert.equal(rows(cwd)[1]?.[5], "violation");
    assert.match(rows(cwd)[1]?.[7] ?? "", /evaluation hash changed/);
  } finally {
    remove(cwd);
  }
});

test("the consecutive-failure cap and the STOP file halt the loop", async () => {
  const streak = initRepo("main");
  const stopped = initRepo("main");
  const early = initRepo("main");
  try {
    seed(streak);
    let calls = 0;
    const capped = await runSupervise(["--max-experiments", "10", "--max-failures", "3"], {
      cwd: streak,
      now: () => FROZEN,
      runAgent: async () => {
        calls += 1;
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(capped.exitCode, 2);
    assert.match(capped.stdout, /FAILED: consecutive failure cap reached/);
    assert.equal(calls, 3);
    assert.equal(rows(streak).length, 4);

    seed(stopped);
    let once = 0;
    const halt = await runSupervise(["--max-experiments", "4"], {
      cwd: stopped,
      now: () => FROZEN,
      runAgent: async () => {
        once += 1;
        writeFileSync(path.join(stopped, "improve", "STOP"), "stop\n", "utf8");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(halt.exitCode, 0);
    assert.match(halt.stdout, /Stopped: improve\/STOP exists/);
    assert.equal(once, 1);

    seed(early);
    writeFileSync(path.join(early, "improve", "STOP"), "stop\n", "utf8");
    const before = await runSupervise(["--max-experiments", "2"], {
      cwd: early,
      now: () => FROZEN,
      runAgent: idle(),
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(before.exitCode, 0);
    assert.match(before.stdout, /Stopped: improve\/STOP exists/);
    assert.equal(existsSync(path.join(early, "improve", "results.tsv")), false);
  } finally {
    remove(streak);
    remove(stopped);
    remove(early);
  }
});

test("the wall clock stops before another agent", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    let ticks = 0;
    let calls = 0;
    const t0 = new Date("2026-10-10T15:00:00.000Z");
    const outcome = await runSupervise(["--max-experiments", "3", "--wall-minutes", "30"], {
      cwd,
      now: () => {
        ticks += 1;
        return ticks === 1 ? t0 : new Date(t0.getTime() + 2 * 60 * 60 * 1000);
      },
      runAgent: async () => {
        calls += 1;
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /FAILED: wall-clock cap reached/);
    assert.equal(calls, 0);
    assert.equal(rows(cwd).length, 1);
    assert.equal(rows(cwd)[0]?.[7], "baseline");
  } finally {
    remove(cwd);
  }
});

test("a score that does not improve is discarded and not pushed", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    const prior = head(cwd);
    const pushes: string[] = [];
    const outcome = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: async () => {
        commitFile(cwd, "copy.txt", "v2\n", "same score");
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0),
      verifyPush: () => {
        pushes.push("push");
        return { ok: true, output: "", hook: "", exit: 0, reason: "" };
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(pushes.length, 0);
    assert.equal(head(cwd), prior);
    assert.equal(rows(cwd)[1]?.[5], "discard");
    assert.equal(rows(cwd)[1]?.[8], "no");
  } finally {
    remove(cwd);
  }
});

test("agents alternate briefs and a 173 results header is refused", async () => {
  const cwd = initRepo("main");
  try {
    seed(cwd);
    const seen: string[] = [];
    await runSupervise(["--max-experiments", "2"], {
      cwd,
      now: () => FROZEN,
      runAgent: async (request) => {
        seen.push(request.briefId);
        return { timedOut: false, exitCode: 0, note: "", log: "" };
      },
      evaluate: async () => baseResult(0, 0),
    });
    assert.deepEqual(seen, ["desk-explorer", "cli-explorer"]);
    writeFileSync(
      path.join(cwd, "improve", "results.tsv"),
      "n\tstarted\tcommit\tscore\tbest\tstatus\tseconds\tnote\n",
      "utf8",
    );
    const refused = await runSupervise(["--max-experiments", "1"], {
      cwd,
      now: () => FROZEN,
      runAgent: idle(),
      evaluate: async () => baseResult(0, 0),
    });
    assert.equal(refused.exitCode, 2);
    assert.match(refused.stdout, /not a supervisor log/);
  } finally {
    remove(cwd);
  }
});

test("agent argv carries the budget and the extra deny rules", () => {
  const argv = buildAgentArgv({
    prompt: "Look at the desk.",
    model: "grok-4.7",
    effort: "xhigh",
    turns: 40,
    cwd: repoRoot,
  });
  assert.equal(argv[argv.indexOf("-m") + 1], "grok-4.7");
  assert.equal(argv[argv.indexOf("--effort") + 1], "xhigh");
  assert.equal(argv[argv.indexOf("--max-turns") + 1], "40");
  assert.equal(argv.includes("--always-approve"), true);
  assert.equal(argv.includes("push"), false);
  assert.equal(argv.includes("--no-verify"), false);
  for (const rule of SUPERVISOR_DENY_RULES) {
    assert.equal(argv[argv.indexOf(rule) - 1], "--deny", rule);
  }
  const prompt = agentPrompt({
    brief: {
      id: "desk-explorer",
      home: "repo",
      findings: "improve/findings/desk-explorer.tsv",
      instructions: "Walk the desk.",
    },
    programPath: "improve/program.md",
    targets: ["packages/app/src/design"],
    branch: "main",
    experiment: 1,
    minutes: 10,
    turns: 40,
  });
  assert.equal(prompt.includes("--no-verify"), false);
  assert.equal(prompt.includes("!"), false);
});

test("the minute budget kills the process tree", async () => {
  const started = Date.now();
  const result = await runBoundedProcess({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 60000)"],
    cwd: os.tmpdir(),
    timeoutMs: 300,
    env: process.env,
  });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 10_000);
});

test("open bug count reads the bug scan and findings files", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "hh-bugs-"));
  try {
    mkdirSync(path.join(cwd, "docs"), { recursive: true });
    mkdirSync(path.join(cwd, "improve", "findings"), { recursive: true });
    writeFileSync(
      path.join(cwd, "docs", "bug-scan.md"),
      "| id | status |\n| --- | --- |\n| BS-001 | fixed |\n\nNot fixed:\n\n| id | area | reason |\n| --- | --- | --- |\n| BS-005 | scripts | missing |\n",
      "utf8",
    );
    writeFileSync(
      path.join(cwd, "improve", "findings", "desk.tsv"),
      "id\tstatus\tarea\tsummary\nBS-009\topen\tcli\tbroke\n",
      "utf8",
    );
    assert.equal(openBugCountFromDisk(cwd), 2);
  } finally {
    remove(cwd);
  }
});
