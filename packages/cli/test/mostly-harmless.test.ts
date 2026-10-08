import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs, parseCli, parseQaArgs, runCli, runQa, type QaReportInput } from "../src/main.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function passReport(): QaReportInput {
  return {
    phone: { status: "PASS", reasons: ["Performance 96"] },
    a11y: { status: "PASS", notes: ["Keyboard path is present."] },
    weight: { status: "PASS", reasons: ["Page is within the byte ceiling."] },
    juryStatus: "PASS",
    juryTotal: 86.5,
  };
}

test("parseQaArgs reads the project and leaves yes off", () => {
  const project = path.join("sites", "towel");
  assert.deepEqual(parseQaArgs(["mostly-harmless", "--project", project]), {
    cmd: "mostly-harmless",
    project,
    yes: false,
  });
  assert.deepEqual(parseQaArgs(["elevate", "--yes", "--project", project]), {
    cmd: "elevate",
    project,
    yes: true,
  });
});

test("unknown flags throw", () => {
  const project = path.join("sites", "towel");
  assert.throws(() => parseQaArgs(["elevate", "--project", project, "--ship"]), /Unexpected argument/);
  assert.throws(() => parseQaArgs(["mostly-harmless", "--project", project, "--help"]), /Unexpected argument/);
});

test("missing project exits 2", async () => {
  const missing = await runQa(["elevate"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stdout, /--project/);
  const empty = await runQa(["mostly-harmless", "--project"]);
  assert.equal(empty.exitCode, 2);
  assert.match(empty.stdout, /--project/);
});

test("--yes on mostly-harmless is rejected", async () => {
  const project = path.join("sites", "towel");
  assert.throws(() => parseQaArgs(["mostly-harmless", "--project", project, "--yes"]), /rejected/);
  let called = false;
  const outcome = await runQa(["mostly-harmless", "--project", project, "--yes"], {
    apply: () => {
      called = true;
      throw new Error("apply was called");
    },
    beforeWeJump: () => {
      throw new Error("questions were loaded");
    },
    report: () => {
      throw new Error("report was loaded");
    },
  });
  assert.equal(outcome.exitCode, 2);
  assert.match(outcome.stdout, /rejected/);
  assert.equal(called, false);
});

test("elevate without yes does not apply", async () => {
  const project = path.join("sites", "towel");
  let calls = 0;
  const outcome = await runQa(["elevate", "--project", project], {
    planned: () => ["src/hero.astro: hold the margin"],
    apply: () => {
      calls += 1;
      throw new Error("apply was called");
    },
  });
  assert.equal(outcome.exitCode, 2);
  assert.equal(calls, 0);
  assert.match(outcome.stdout, /src\/hero\.astro: hold the margin/);
  assert.match(outcome.stdout, /Elevate does not run without --yes\./);
  assert.equal(outcome.stdout.includes("deploy"), false);
});

test("elevate with yes calls apply once", async () => {
  const project = path.resolve(path.join("sites", "towel"));
  const seen: string[] = [];
  const outcome = await runQa(["elevate", "--project", project, "--yes"], {
    planned: () => ["src/nav.astro: keep the link"],
    apply: (dir) => {
      seen.push(dir);
    },
  });
  assert.equal(outcome.exitCode, 0);
  assert.deepEqual(seen, [project]);
  assert.match(outcome.stdout, /src\/nav\.astro: keep the link/);
  assert.match(outcome.stdout, /Applied\./);
});

test("mostly-harmless prints a before-we-jump question and the report", async () => {
  const project = path.resolve(path.join("sites", "towel"));
  const input = passReport();
  const outcome = await runQa(["mostly-harmless", "--project", project], {
    beforeWeJump: () => ({ questions: ["Which towel should the footer name?"] }),
    report: () => input,
  });
  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.stdout, /Which towel should the footer name\?/);
  assert.ok(outcome.stdout.includes(path.join(project, ".hitchhiker", "QA-REPORT.md")));
  // The real qa renderer runs (no render dep). Check its sections without a cross-package import.
  for (const line of ["## Phone", "- Performance 96", "## Accessibility", "- Keyboard path is present.", "## Weight", "## Jury", "Total: 86.5", "## Overall"]) {
    assert.ok(outcome.stdout.includes(line), line);
  }
  assert.match(outcome.stdout, /## Overall\s+Status: PASS/);
  assert.match(outcome.stdout, /real mobile/);
  assert.equal(outcome.stdout.includes("deploy"), false);
});

test("mostly-harmless exits 1 when the report is a blocker", async () => {
  const project = path.join("sites", "towel");
  const outcome = await runQa(["mostly-harmless", "--project", project], {
    beforeWeJump: () => ({ questions: ["Who signs off?"] }),
    report: () => ({
      phone: { status: "BLOCKER", reasons: [] },
      a11y: { status: "PASS", notes: [] },
      weight: { status: "PASS", reasons: [] },
      juryStatus: "PASS",
      juryTotal: 90,
    }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.match(outcome.stdout, /no detail/);
  assert.match(outcome.stdout, /BLOCKER/);
  assert.match(outcome.stdout, /Who signs off\?/);
});

test("runQa source does not construct a deploy argv", () => {
  assert.equal(runQa.toString().includes("deploy"), false);
  const source = readFileSync(path.join(here, "..", "src", "main.ts"), "utf8");
  const start = source.indexOf("export async function runQa");
  assert.ok(start >= 0);
  const end = source.indexOf("\nfunction isRoundElevate");
  assert.ok(end > start);
  assert.equal(source.slice(start, end).includes("deploy"), false);
});

test("a pick does not run without yes", async () => {
  const outcome = await runCli(["elevate", "--project", path.join("sites", "towel"), "--pick", "all"]);
  assert.equal(outcome.exitCode, 2);
  assert.equal(outcome.stdout, "Elevate does not run without --yes.\n");
});

test("elevate help still reaches the round command", async () => {
  const outcome = await runCli(["elevate", "--help"]);
  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.stdout, /hh elevate/);
});

test("the safe elevate command is what hh elevate runs", async () => {
  const outcome = await runCli(["elevate", "--project", path.join("sites", "towel")]);
  assert.equal(outcome.exitCode, 2);
  assert.match(outcome.stdout, /Elevate does not run without --yes\./);
  assert.match(outcome.stdout, /No planned items\./);
});

test("hh mostly-harmless prints the report path and does not write it", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-qa-"));
  try {
    const outcome = await runCli(["mostly-harmless", "--project", dir]);
    assert.equal(outcome.exitCode, 1);
    assert.ok(outcome.stdout.includes(path.join(dir, ".hitchhiker", "QA-REPORT.md")));
    assert.match(outcome.stdout, /BLOCKER/);
    assert.equal(outcome.stdout.includes("!"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "QA-REPORT.md")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("doctor, pause, and resume still parse", () => {
  const project = path.join("sites", "towel");
  assert.deepEqual(parseCli(["pause", "--project", project, "--message", "Hold here."]), {
    cmd: "pause",
    project,
    message: "Hold here.",
  });
  assert.deepEqual(parseCli(["resume", "--project", project]), { cmd: "resume", project });
  assert.deepEqual(parseArgs(["doctor"]), { ok: true });
});
