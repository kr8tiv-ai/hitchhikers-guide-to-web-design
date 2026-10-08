import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { homeIndexPath, upsertHomeProject } from "../src/home-index.ts";
import {
  homeIndexPath as homeIndexPathFromIndex,
  loadState as loadStateFromIndex,
  saveState as saveStateFromIndex,
} from "../src/index.ts";
import { openInterview } from "../src/interview.ts";
import { LockHeld } from "../src/lock.ts";
import { scaffoldProject } from "../src/spec/scaffold.ts";
import { loadState, saveState, type GuideState } from "../src/state.ts";

const DEAD_PID = 2147483646;

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sampleState(nextAction: string): GuideState {
  return {
    phase: "dont-panic",
    slice: "Towel Check",
    promptId: "007",
    lastGoodCommit: "abc123def",
    blockers: ['quota: "soft"', "waiting on the towel"],
    nextAction,
    updatedAt: "2026-10-06T18:04:05.000Z",
  };
}

function writeLock(projectDir: string, pid: number, acquiredAt: string): void {
  const dir = path.join(projectDir, ".hitchhiker");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "state.lock"),
    `${JSON.stringify({ pid, acquiredAt })}\n`,
    "utf8",
  );
}

test("a missing STATE.md loads as null", () => {
  const dir = tempDir("hh-state-");
  try {
    assert.equal(loadState(dir), null);
    assert.equal(loadStateFromIndex(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("STATE.md round-trips a colon and a quote", async () => {
  const dir = tempDir("hh-state-");
  const state = sampleState('resume: say "towel"');
  try {
    await saveState(dir, state);
    assert.deepEqual(loadState(dir), state);
    const replaced: GuideState = {
      ...state,
      blockers: [],
      nextAction: 'ship it: "now"',
    };
    await saveStateFromIndex(dir, replaced);
    assert.deepEqual(loadStateFromIndex(dir), replaced);
    const filePath = path.join(dir, ".hitchhiker", "STATE.md");
    const raw = readFileSync(filePath, "utf8");
    assert.equal(raw.includes("\r"), false);
    assert.match(raw, /^## Next action$/m);
    assert.equal(
      existsSync(path.join(dir, ".hitchhiker", `STATE.md.tmp-${process.pid}`)),
      false,
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
    assert.equal(raw.includes(".planning/"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a live lock blocks saveState", async () => {
  const dir = tempDir("hh-state-");
  try {
    writeLock(dir, process.pid, new Date().toISOString());
    await assert.rejects(
      () => saveState(dir, sampleState('resume: say "towel"')),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, process.pid);
        return true;
      },
    );
    assert.equal(loadState(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a dead lock older than 30 seconds is taken over by saveState", async () => {
  const dir = tempDir("hh-state-");
  const state = sampleState('resume: say "towel"');
  try {
    writeLock(
      dir,
      DEAD_PID,
      new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    );
    await saveState(dir, state);
    assert.deepEqual(loadState(dir), state);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "state.lock")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the home index path is os.homedir() plus .hitchhiker/index.json", () => {
  const expected = path.join(os.homedir(), ".hitchhiker", "index.json");
  assert.equal(homeIndexPath(), expected);
  assert.equal(homeIndexPathFromIndex(), expected);
});

test("the home index dedupes by project path", async () => {
  const home = tempDir("hh-home-");
  const project = path.join(home, "site");
  const other = path.join(home, "other");
  try {
    mkdirSync(project);
    mkdirSync(other);
    await upsertHomeProject(
      {
        name: "First",
        path: project,
        updatedAt: "2026-10-06T00:00:00.000Z",
      },
      home,
    );
    await upsertHomeProject(
      {
        name: "Second",
        path: project,
        updatedAt: "2026-10-06T01:00:00.000Z",
      },
      home,
    );
    await upsertHomeProject(
      {
        name: "Other",
        path: other,
        updatedAt: "2026-10-06T02:00:00.000Z",
      },
      home,
    );
    const indexPath = path.join(home, ".hitchhiker", "index.json");
    const rows = JSON.parse(readFileSync(indexPath, "utf8")) as unknown;
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      name: "Second",
      path: project,
      updatedAt: "2026-10-06T01:00:00.000Z",
    });
    assert.deepEqual(rows[1], {
      name: "Other",
      path: other,
      updatedAt: "2026-10-06T02:00:00.000Z",
    });
    assert.equal(existsSync(path.join(home, ".hitchhiker", "index.lock")), false);
    assert.equal(
      existsSync(path.join(home, ".hitchhiker", `index.json.tmp-${process.pid}`)),
      false,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a scaffolded STATE.md loads and the interview opens on the first question", async () => {
  const dir = tempDir("hh-state-scaffold-");
  try {
    await scaffoldProject(dir, {
      name: "Night Stall",
      siteWhy: "The stall exists so regulars can find the tea.",
      hosting: "Hostinger",
      now: () => Date.parse("2026-01-15T15:04:05.000Z"),
    });
    assert.deepEqual(loadState(dir), {
      phase: "Deep Thought",
      slice: "Seven and a Half Million Years",
      promptId: "scaffold",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Write the PRD",
      updatedAt: "",
    });
    const raw = readFileSync(path.join(dir, ".hitchhiker", "STATE.md"), "utf8");
    assert.match(raw, /## Current Position/);
    assert.match(raw, /gsd_state_version/);
    assert.equal(/^## Phase$/m.test(raw), false);
    assert.equal(raw.includes(".planning"), false);
    assert.equal(existsSync(path.join(dir, ".planning")), false);

    const session = await openInterview(dir, "express");
    const question = session.next();
    assert.equal(question?.id, "DP-0.1");
    assert.equal(question?.ask, "Is this site for you, or for a client?");
    assert.equal(loadState(dir)?.phase, "Deep Thought");
    const afterOpen = readFileSync(path.join(dir, ".hitchhiker", "STATE.md"), "utf8");
    assert.equal(afterOpen, raw);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a position block defaults fields the template does not carry", () => {
  const dir = tempDir("hh-state-position-");
  const filePath = path.join(dir, ".hitchhiker", "STATE.md");
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      [
        "## Current Position",
        "",
        "Phase: 1 of 6 (Don't Panic)",
        "Slice: Towel Check",
        "Prompt id: interview:DP-0.2",
        "Last good commit: abc1234",
        "Blockers: waiting on the towel",
        "Next action: Answer DP-0.2.",
        "",
      ].join("\n"),
      "utf8",
    );
    assert.deepEqual(loadState(dir), {
      phase: "Don't Panic",
      slice: "Towel Check",
      promptId: "interview:DP-0.2",
      lastGoodCommit: "abc1234",
      blockers: ["waiting on the towel"],
      nextAction: "Answer DP-0.2.",
      updatedAt: "",
    });

    writeFileSync(filePath, "## Current Position\n\nPhase: Deep Thought\n", "utf8");
    assert.deepEqual(loadState(dir), {
      phase: "Deep Thought",
      slice: "",
      promptId: "",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "",
      updatedAt: "",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a broken STATE.md throws a missing heading", async () => {
  const dir = tempDir("hh-state-broken-");
  const filePath = path.join(dir, ".hitchhiker", "STATE.md");
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "# Notes\n\nNot a state file.\n", "utf8");
    assert.throws(() => loadState(dir), /STATE\.md is missing heading: Phase/);
    await assert.rejects(
      () => openInterview(dir, "express"),
      /STATE\.md is missing heading: Phase/,
    );

    writeFileSync(
      filePath,
      "# Guide state\n\n## Phase\n\nDon't Panic\n\n## Slice\n\nTowel Check\n",
      "utf8",
    );
    assert.throws(() => loadState(dir), /STATE\.md is missing heading: Prompt id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing project path throws before the home lock", async () => {
  const home = tempDir("hh-home-");
  const missing = path.join(home, "no-such-project");
  try {
    await assert.rejects(
      () =>
        upsertHomeProject(
          { name: "Ghost", path: missing, updatedAt: "2026-10-06T00:00:00.000Z" },
          home,
        ),
      /does not exist/,
    );
    assert.equal(existsSync(path.join(home, ".hitchhiker")), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
