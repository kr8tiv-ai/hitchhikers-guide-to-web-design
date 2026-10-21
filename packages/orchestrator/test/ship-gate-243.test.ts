/**
 * Spec 243 ship gate. A missing report, a stale commit, a blocked check,
 * or a fix before round 2 keeps phase 6 from calling deploy.
 * A pass with known issues launches only when nothing is blocked.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { GATE_IDS, gatesJsonPath, type GateId, type GateStatus } from "@hitchhiker/qa";
import { beginPhaseSix, shipGate } from "../src/index.ts";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-ship-gate-"));
}

function writeReport(
  projectDir: string,
  head: string,
  overrides: Partial<Record<GateId, { status: GateStatus; reason: string }>> = {},
  extra: { fixRound?: number; verdict?: string } = {},
): void {
  const results = GATE_IDS.map((id) => {
    const over = overrides[id];
    return {
      id,
      status: over?.status ?? "PASS",
      reason: over?.reason ?? "This check is in good shape.",
      evidence: {},
    };
  });
  const body: Record<string, unknown> = {
    head,
    ranAt: "2026-10-21T12:00:00.000Z",
    results,
  };
  if (extra.fixRound !== undefined) body.fixRound = extra.fixRound;
  if (extra.verdict !== undefined) body.verdict = extra.verdict;
  const file = gatesJsonPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

test("a missing quality report keeps launch closed", async () => {
  const dir = tempProject();
  try {
    const result = await shipGate(dir, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reasons.join(" "), /quality check for this site is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale commit keeps launch closed", async () => {
  const dir = tempProject();
  let deploys = 0;
  try {
    writeReport(dir, OTHER);
    const result = await shipGate(dir, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reasons.join(" "), /different version of this site/);
    const entered = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        deploys += 1;
      },
    });
    assert.equal(entered.ok, false);
    assert.equal(deploys, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a blocker stops phase 6 with zero deploy calls", async () => {
  const dir = tempProject();
  let deploys = 0;
  let kits = 0;
  const reason = "The page is missing a font a reader needs.";
  try {
    writeReport(dir, HEAD, { fonts: { status: "BLOCKER", reason } });
    const result = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        kits += 1;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(deploys, 0);
    assert.equal(kits, 0);
    assert.ok(result.reasons.some((line) => line.includes(reason)));
    const state = loadState(dir);
    assert.ok(state);
    assert.match(state.nextAction, /Launch stays closed/);
    assert.ok(state.blockers.some((line) => line.includes(reason)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fix before round 2 keeps launch closed", async () => {
  const dir = tempProject();
  let deploys = 0;
  const reason = "Too much spacing sits off the spacing scale.";
  try {
    for (const fixRound of [0, 1]) {
      writeReport(dir, HEAD, { spacing: { status: "FIX", reason } }, { fixRound });
      const result = await shipGate(dir, HEAD);
      assert.equal(result.ok, false, `round ${fixRound}`);
      assert.match(result.reasons.join(" "), /still needs a fix before launch/);
      assert.ok(result.reasons.some((line) => line.includes(reason)));
    }
    writeReport(dir, HEAD, { spacing: { status: "FIX", reason } }, { fixRound: 0 });
    const entered = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        deploys += 1;
      },
    });
    assert.equal(entered.ok, false);
    assert.equal(deploys, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a pass with known issues and no blocker launches", async () => {
  const dir = tempProject();
  let deploys = 0;
  let kits = 0;
  const prior: GuideState = {
    phase: "Mostly Harmless",
    slice: "Slartibartfast's Fjords",
    promptId: "review-after-010",
    lastGoodCommit: HEAD,
    blockers: ["hold the towel"],
    nextAction: "011",
    updatedAt: "2026-10-21T12:00:00.000Z",
  };
  try {
    await saveState(dir, prior);
    writeReport(
      dir,
      HEAD,
      { copy: { status: "FIX", reason: "The opening line is still placeholder text." } },
      { fixRound: 2, verdict: "PASS_WITH_KNOWN_ISSUES" },
    );
    const result = await shipGate(dir, HEAD);
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
    const entered = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        kits += 1;
      },
    });
    assert.equal(entered.ok, true);
    assert.equal(deploys, 1);
    assert.equal(kits, 1);
    const state = loadState(dir);
    assert.equal(state?.nextAction, "011");
    assert.deepEqual(state?.blockers, ["hold the towel"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a pass with known issues still fails when a check is blocked", async () => {
  const dir = tempProject();
  let deploys = 0;
  let kits = 0;
  const blocked = "The page is missing a font a reader needs.";
  try {
    writeReport(
      dir,
      HEAD,
      {
        copy: { status: "FIX", reason: "The opening line is still placeholder text." },
        fonts: { status: "BLOCKER", reason: blocked },
      },
      { fixRound: 2, verdict: "PASS_WITH_KNOWN_ISSUES" },
    );
    const result = await shipGate(dir, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reasons.join(" "), /cannot launch while a check is blocked/);
    assert.ok(result.reasons.some((line) => line.includes(blocked)));
    const entered = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => {
        kits += 1;
      },
    });
    assert.equal(entered.ok, false);
    assert.equal(deploys, 0);
    assert.equal(kits, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a clean report for this commit launches", async () => {
  const dir = tempProject();
  let deploys = 0;
  try {
    writeReport(dir, HEAD);
    const result = await shipGate(dir, HEAD);
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
    const entered = await beginPhaseSix(dir, HEAD, {
      deploy: () => {
        deploys += 1;
      },
      launchKit: () => undefined,
    });
    assert.equal(entered.ok, true);
    assert.equal(deploys, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
