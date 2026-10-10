import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions, RESULTS_COLUMNS, score, type EvalResult } from "@hitchhiker/engine";
import { runCli } from "../src/main.ts";
import { runImprove } from "../src/improve/run.ts";
import {
  GROK_DENY_RULES,
  buildImproveArgv,
  killProcessTree,
  type SessionRequest,
  type SessionResult,
} from "../src/improve/session.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const BRANCH = "improve/2026-10-10-desk";
const FROZEN = new Date(2026, 9, 10, 15, 0, 0);

const PROGRAM = `---
tag: desk
objective: Raise the desk score.
targets:
  - copy.txt
minutes: 4
turns: 6
model: grok-4.7
effort: xhigh
---

One hypothesis.
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

function now(): Date {
  return FROZEN;
}

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
  const cwd = mkdtempSync(path.join(os.tmpdir(), "hh-improve-"));
  git(cwd, ["init", "-b", branch]);
  mkdirSync(path.join(cwd, ".empty-hooks"));
  git(cwd, ["config", "core.hooksPath", ".empty-hooks"]);
  git(cwd, ["config", "user.email", "improve@example.com"]);
  git(cwd, ["config", "user.name", "Improve"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  git(cwd, ["config", "core.autocrlf", "false"]);
  return cwd;
}

function writeKit(cwd: string, program: string, protectedJson: string): void {
  mkdirSync(path.join(cwd, "improve"), { recursive: true });
  writeFileSync(path.join(cwd, "improve", "program.md"), program, "utf8");
  writeFileSync(path.join(cwd, "improve", "protected.json"), protectedJson, "utf8");
}

function seed(cwd: string, program = PROGRAM, protectedJson = PROTECTED): void {
  writeFileSync(path.join(cwd, "README.md"), "v1\n", "utf8");
  writeFileSync(path.join(cwd, "copy.txt"), "v1 desk\n", "utf8");
  writeFileSync(path.join(cwd, "metric.txt"), "metric\n", "utf8");
  writeKit(cwd, program, protectedJson);
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", "seed", "--no-gpg-sign"]);
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

async function withRepo(branch: string, fn: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = initRepo(branch);
  try {
    await fn(cwd);
  } finally {
    remove(cwd);
  }
}

function green(hits: number): EvalResult {
  return {
    testsPassed: 10,
    testsFailed: 0,
    doctorExit: 0,
    tscExit: 0,
    antiSlopHits: hits,
  };
}

function head(cwd: string): string {
  return git(cwd, ["rev-parse", "HEAD"]).trim();
}

function rows(cwd: string): string[][] {
  const text = readFileSync(path.join(cwd, "improve", "results.tsv"), "utf8").replace(/\r\n/g, "\n");
  const lines = text.trimEnd().split("\n");
  assert.equal(lines[0], RESULTS_COLUMNS.join("\t"));
  return lines.slice(1).map((line) => line.split("\t"));
}

function idle(): (request: SessionRequest) => Promise<SessionResult> {
  return async () => ({ timedOut: false, exitCode: 0, note: "" });
}

test("the command table lists hh improve", async () => {
  const outcome = await runCli(["drive"]);
  assert.equal(outcome.exitCode, 2);
  assert.match(outcome.stderr ?? "", /^  hh improve$/m);
});

test("a live run refuses main and a dirty tree", async () => {
  await withRepo("main", async (cwd) => {
    seed(cwd);
    const sessions: SessionRequest[] = [];
    const outcome = await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        sessions.push(request);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(0),
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Refusing to start: branch is main/);
    assert.equal(sessions.length, 0);
    assert.equal(git(cwd, ["branch", "--list", BRANCH]).trim(), "");
    assert.equal(existsSync(path.join(cwd, "improve", "results.tsv")), false);
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd);
    writeFileSync(path.join(cwd, "dirt.txt"), "x\n", "utf8");
    const outcome = await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: idle(),
      evaluate: async () => green(0),
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /the work tree is dirty/);
    assert.equal(git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "seed");
  });
});

test("dry-run reports a live refusal and enforces the experiment ceiling", async () => {
  await withRepo("main", async (cwd) => {
    seed(cwd);
    const outcome = await runImprove(["--dry-run"], { cwd, now });
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /max-experiments: 5/);
    assert.match(outcome.stdout, /live: refused, branch is main/);
    assert.equal(git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "main");
    assert.equal(existsSync(path.join(cwd, "improve", "results.tsv")), false);
    const capped = await runImprove(["--dry-run", "--max-experiments", "50"], { cwd, now });
    assert.match(capped.stdout, /max-experiments: 50/);
  });

  const tooMany = await runImprove(["--max-experiments", "51"], { cwd: os.tmpdir(), now });
  assert.equal(tooMany.exitCode, 2);
  assert.match(tooMany.stdout, /1 to 50/);
  const missing = await runImprove(["--dry-run"], { cwd: os.tmpdir(), now });
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stdout, /missing program\.md/);
});

test("max-experiments caps sessions and a stop file halts the loop", async () => {
  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const seedSha = head(cwd);
    const sessions: SessionRequest[] = [];
    const outcome = await runImprove(["--max-experiments", "2"], {
      cwd,
      now,
      runSession: async (request) => {
        sessions.push(request);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(1),
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0]?.minutes, 4);
    assert.equal(sessions[0]?.turns, 6);
    assert.equal(git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), BRANCH);
    const parsed = rows(cwd);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0]?.[0], "0");
    assert.equal(parsed[0]?.[5], "keep");
    assert.equal(parsed[0]?.[7], "baseline");
    assert.equal(parsed[1]?.[5], "discard");
    assert.equal(parsed[1]?.[7], "no changes");
    assert.equal(parsed[2]?.[5], "discard");
    assert.equal(head(cwd), seedSha);
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd);
    writeFileSync(path.join(cwd, "improve", "STOP"), "stop\n", "utf8");
    const sessions: SessionRequest[] = [];
    const outcome = await runImprove(["--max-experiments", "3"], {
      cwd,
      now,
      runSession: async (request) => {
        sessions.push(request);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(0),
    });
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /Stopped: improve\/STOP exists/);
    assert.equal(sessions.length, 0);
    assert.equal(git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim(), "seed");
    assert.equal(existsSync(path.join(cwd, "improve", "results.tsv")), false);
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd);
    let sessions = 0;
    const outcome = await runImprove(["--max-experiments", "4"], {
      cwd,
      now,
      runSession: async (request) => {
        sessions += 1;
        writeFileSync(path.join(request.cwd, "improve", "STOP"), "stop\n", "utf8");
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(1),
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(sessions, 1);
    assert.match(outcome.stdout, /Stopped: improve\/STOP exists/);
    assert.equal(rows(cwd).length, 2);
  });
});

test("a lower score resets and a higher score stays", async () => {
  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const seedSha = head(cwd);
    let evaluations = 0;
    const outcome = await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "copy.txt"), "v2 worse\n", "utf8");
        git(request.cwd, ["add", "-A"]);
        git(request.cwd, ["commit", "-m", "worse", "--no-gpg-sign"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return evaluations === 1 ? green(1) : green(4);
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(evaluations, 2);
    assert.equal(head(cwd), seedSha);
    const copy = readFileSync(path.join(cwd, "copy.txt"), "utf8");
    assert.equal(copy.includes("v1"), true);
    assert.equal(copy.includes("v2"), false);
    const parsed = rows(cwd);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1]?.[3], String(score(green(4))));
    assert.equal(parsed[1]?.[4], String(score(green(1))));
    assert.equal(parsed[1]?.[5], "discard");
    assert.equal(parsed[0]?.[5], "keep");
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const seedSha = head(cwd);
    let evaluations = 0;
    await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "copy.txt"), "v2 better\n", "utf8");
        git(request.cwd, ["add", "--", "copy.txt"]);
        git(request.cwd, ["commit", "-m", "Go!", "--no-gpg-sign"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return evaluations === 1 ? green(1) : green(0);
      },
    });
    assert.notEqual(head(cwd), seedSha);
    const parsed = rows(cwd);
    assert.equal(parsed[1]?.[5], "keep");
    assert.equal(parsed[1]?.[3], String(score(green(0))));
    assert.equal(parsed[1]?.[4], String(score(green(0))));
    assert.equal(parsed[1]?.[7], "Go.");
    assert.equal(readFileSync(path.join(cwd, "copy.txt"), "utf8").includes("v2"), true);
    assert.equal(readFileSync(path.join(cwd, "metric.txt"), "utf8").includes("metric"), true);
  });
});

test("a protected edit or an evaluation hash change is a violation and resets", async () => {
  const gateProgram = PROGRAM.replace(
    "  - copy.txt\n",
    "  - DECISIONS.md\n  - improve/protected.json\n",
  );
  await withRepo("seed", async (cwd) => {
    seed(cwd, gateProgram, JSON.stringify({
      paths: ["DECISIONS.md"],
      evaluation: ["metric.txt"],
    }));
    const seedSha = head(cwd);
    let evaluations = 0;
    const outcome = await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "DECISIONS.md"), "changed\n", "utf8");
        writeFileSync(
          path.join(request.cwd, "improve", "protected.json"),
          JSON.stringify({ paths: ["other.md"], evaluation: ["metric.txt"] }),
          "utf8",
        );
        git(request.cwd, ["add", "--", "DECISIONS.md", "improve/protected.json"]);
        git(request.cwd, ["commit", "-m", "shrink the list", "--no-gpg-sign"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return green(0);
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(evaluations, 1);
    assert.equal(head(cwd), seedSha);
    assert.equal(existsSync(path.join(cwd, "DECISIONS.md")), false);
    assert.equal(
      readFileSync(path.join(cwd, "improve", "protected.json"), "utf8").includes("DECISIONS.md"),
      true,
    );
    const parsed = rows(cwd);
    assert.equal(parsed[1]?.[5], "violation");
    assert.equal(parsed[1]?.[3], "0");
    assert.match(parsed[1]?.[7] ?? "", /protected path DECISIONS.md/);
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd, PROGRAM, JSON.stringify({
      paths: ["DECISIONS.md"],
      evaluation: ["copy.txt"],
    }));
    const seedSha = head(cwd);
    let evaluations = 0;
    await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "copy.txt"), "v2 hashed\n", "utf8");
        git(request.cwd, ["add", "--", "copy.txt"]);
        git(request.cwd, ["commit", "-m", "touch the metric", "--no-gpg-sign"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => {
        evaluations += 1;
        return green(0);
      },
    });
    assert.equal(evaluations, 1);
    assert.equal(head(cwd), seedSha);
    assert.equal(readFileSync(path.join(cwd, "copy.txt"), "utf8").includes("v1"), true);
    assert.equal(rows(cwd)[1]?.[5], "violation");
    assert.match(rows(cwd)[1]?.[7] ?? "", /evaluation hash changed/);
  });

  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const seedSha = head(cwd);
    await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "README.md"), "v2 outside\n", "utf8");
        git(request.cwd, ["add", "--", "README.md"]);
        git(request.cwd, ["commit", "-m", "outside", "--no-gpg-sign"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(0),
    });
    assert.equal(head(cwd), seedSha);
    assert.equal(readFileSync(path.join(cwd, "README.md"), "utf8").includes("v1"), true);
    assert.match(rows(cwd)[1]?.[7] ?? "", /outside target README.md/);
  });
});

test("a minute-budget kill resets, and leaving the branch does not", async () => {
  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const seedSha = head(cwd);
    let evaluations = 0;
    await runImprove(["--max-experiments", "1"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "copy.txt"), "v2 late\n", "utf8");
        git(request.cwd, ["add", "--", "copy.txt"]);
        git(request.cwd, ["commit", "-m", "late", "--no-gpg-sign"]);
        return { timedOut: true, exitCode: 1, note: "ignored" };
      },
      evaluate: async () => {
        evaluations += 1;
        return green(0);
      },
    });
    assert.equal(evaluations, 1);
    assert.equal(head(cwd), seedSha);
    assert.equal(rows(cwd)[1]?.[5], "crash");
    assert.equal(rows(cwd)[1]?.[7], "minute budget killed the grok process");
  });

  await withRepo("main", async (cwd) => {
    seed(cwd);
    const mainSha = head(cwd);
    git(cwd, ["checkout", "-b", "seed"]);
    const outcome = await runImprove(["--max-experiments", "2"], {
      cwd,
      now,
      runSession: async (request) => {
        writeFileSync(path.join(request.cwd, "copy.txt"), "v2 branch\n", "utf8");
        git(request.cwd, ["add", "--", "copy.txt"]);
        git(request.cwd, ["commit", "-m", "on the improve branch", "--no-gpg-sign"]);
        git(request.cwd, ["checkout", "main"]);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => green(0),
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Refusing to reset main/);
    assert.equal(head(cwd), mainSha);
    assert.equal(git(cwd, ["remote"]).trim(), "");
    assert.equal(rows(cwd).length, 1);
    assert.notEqual(git(cwd, ["rev-parse", BRANCH]).trim(), mainSha);
  });
});

test("a baseline hash change is a crash and does not start a session", async () => {
  await withRepo("seed", async (cwd) => {
    seed(cwd);
    const sessions: SessionRequest[] = [];
    const outcome = await runImprove(["--max-experiments", "2"], {
      cwd,
      now,
      runSession: async (request) => {
        sessions.push(request);
        return { timedOut: false, exitCode: 0, note: "" };
      },
      evaluate: async () => {
        writeFileSync(path.join(cwd, "metric.txt"), "changed during baseline\n", "utf8");
        return green(0);
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.equal(sessions.length, 0);
    assert.equal(rows(cwd)[0]?.[5], "crash");
    assert.match(rows(cwd)[0]?.[7] ?? "", /evaluation hash changed before the baseline/);
  });
});

test("an existing results log is not dirt and flag budgets reach the session", async () => {
  await withRepo("seed", async (cwd) => {
    seed(cwd);
    writeFileSync(
      path.join(cwd, "improve", "results.tsv"),
      `${RESULTS_COLUMNS.join("\t")}\n`,
      "utf8",
    );
    const sessions: SessionRequest[] = [];
    const outcome = await runImprove(
      ["--max-experiments", "1", "--minutes", "7", "--turns", "8"],
      {
        cwd,
        now,
        runSession: async (request) => {
          sessions.push(request);
          return { timedOut: false, exitCode: 0, note: "" };
        },
        evaluate: async () => green(2),
      },
    );
    assert.equal(outcome.exitCode, 0);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.minutes, 7);
    assert.equal(sessions[0]?.turns, 8);
    assert.equal(sessions[0]?.model, "grok-4.7");
    assert.equal(sessions[0]?.branch, BRANCH);
    assert.equal(rows(cwd).length, 2);
  });
});

test("grok argv carries the turn cap, approve mode, and deny rules", () => {
  const argv = buildImproveArgv({
    prompt: "You are running experiment 1",
    model: "grok-4.7",
    effort: "xhigh",
    turns: 40,
    cwd: path.join("C:", "repo"),
  });
  assert.equal(argv[0], "-p");
  assert.equal(argv[1]?.startsWith("You are"), true);
  assert.equal(argv[argv.indexOf("--max-turns") + 1], "40");
  assert.equal(argv[argv.indexOf("--effort") + 1], "xhigh");
  assert.equal(argv[argv.indexOf("-m") + 1], "grok-4.7");
  assert.equal(argv.includes("--always-approve"), true);
  for (const rule of GROK_DENY_RULES) {
    const at = argv.indexOf(rule);
    assert.equal(argv[at - 1], "--deny", rule);
  }
  assert.equal(argv.includes("push"), false);
  assert.equal(argv.includes("deploy"), false);

  for (const name of ["loop.ts", "git.ts", "run.ts"]) {
    const text = readFileSync(path.join(here, "..", "src", "improve", name), "utf8");
    assert.equal(text.includes("git push"), false, name);
    assert.equal(text.includes("\"push\""), false, name);
    assert.equal(text.includes("\"deploy\""), false, name);
    assert.equal(text.includes("--force"), false, name);
  }
});

test("killProcessTree stops a child", async () => {
  const child = spawn(
    process.execPath,
    ["-e", "setTimeout(() => {}, 60000)"],
    hiddenChildOptions({ detached: true, stdio: "ignore" as const }),
  );
  const closed = new Promise<void>((resolve, reject) => {
    const fail = setTimeout(() => {
      child.kill();
      reject(new Error("child did not exit"));
    }, 8000);
    child.once("close", () => {
      clearTimeout(fail);
      resolve();
    });
    child.once("error", (error: Error) => {
      clearTimeout(fail);
      reject(error);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (child.pid === undefined) {
    child.kill();
    throw new Error("child had no pid");
  }
  killProcessTree(child.pid);
  await closed;
});

test("the improve docs teach the run and stay inside the voice", () => {
  const docs = [
    "README.md",
    "docs/improve.md",
    "docs/improve-runbook.md",
    "improve/program.md",
  ];
  for (const rel of docs) {
    const text = readFileSync(path.join(repoRoot, rel), "utf8");
    // The restored README keeps shields.io badges. Their markdown is `![`.
    // A prose exclamation mark still fails. The other three docs have no badges.
    const prose = rel === "README.md" ? text.replaceAll("![", "") : text;
    assert.equal(prose.includes("!"), false, rel);
    assert.equal(text.includes("\u2014"), false, rel);
  }
  const runbook = readFileSync(path.join(repoRoot, "docs", "improve-runbook.md"), "utf8");
  for (const heading of [
    "## Preflight",
    "## Baseline",
    "## One hypothesis",
    "## Read the log",
    "## Stop",
    "## The note column",
    "## A violation",
    "## Deny rules that stay on with --always-approve",
    "## What the runner enforces",
    "## What only grok can enforce",
  ]) {
    assert.equal(runbook.includes(heading), true, heading);
  }
  assert.equal(runbook.includes("Each experiment is one idea."), true);
  assert.equal(runbook.includes("--always-approve"), true);
  assert.equal(runbook.includes("discarded"), true);
  for (const rule of GROK_DENY_RULES) {
    assert.equal(runbook.includes(rule), true, rule);
  }
  const guide = readFileSync(path.join(repoRoot, "docs", "improve.md"), "utf8");
  assert.equal(guide.includes(RESULTS_COLUMNS.join("\t")), true);
  assert.equal(guide.includes("git merge --no-ff"), true);
  assert.equal(guide.includes("docs/improve.md") || guide.includes("improve-runbook.md"), true);
  assert.equal(readFileSync(path.join(repoRoot, "README.md"), "utf8").includes("docs/improve.md"), true);
});
