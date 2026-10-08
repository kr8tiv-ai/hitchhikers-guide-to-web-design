import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadState, saveState } from "@hitchhiker/engine";
import { FixtureRunError, runFixture } from "../src/fixture-run.ts";
import { evaluateCommand } from "../src/policy.ts";
import { loadQueue } from "../src/queue-file.ts";
import type { SpawnImpl } from "../src/runner.ts";

const AT = "2026-10-07T00:00:00.000Z";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The approval object the drive gate records.
 * Top-level `approved` is the flag preflight reads. Nested yeses stay
 * recorded so a false run is still the same object with the flag off.
 */
function approvalObject(approved: boolean): {
  approved: boolean;
  at: string;
  count: number;
  promptIdsHash: string;
  prd: { approved: true; at: string; sha256: string };
  context: { approved: true; at: string; sha256: string };
  promptPackage: { approved: true; at: string; sha256: string };
} {
  const ids = ["001", "002", "003"];
  const yes = (body: string): { approved: true; at: string; sha256: string } => ({
    approved: true,
    at: AT,
    sha256: sha(body),
  });
  return {
    approved,
    at: AT,
    count: ids.length,
    promptIdsHash: sha(ids.join("\n")),
    prd: yes("# PRD\n"),
    context: yes("# CONTEXT\n"),
    promptPackage: yes(ids.join("\n")),
  };
}

async function withDrive(approved: boolean, run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-fixture-"));
  try {
    const hitchhiker = path.join(dir, ".hitchhiker");
    mkdirSync(hitchhiker, { recursive: true });
    writeFileSync(
      path.join(hitchhiker, "drive-approval.json"),
      `${JSON.stringify(approvalObject(approved), null, 2)}\n`,
    );
    await saveState(dir, {
      phase: "Improbability Drive",
      slice: "Eddie",
      promptId: "001",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "001",
      updatedAt: AT,
    });
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false);
  }
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

test("a flaky first failure retries, passes, and leaves no running item", async () => {
  await withDrive(true, async (dir) => {
    let calls = 0;
    const bins: string[] = [];
    const efforts: string[] = [];
    let sawPush = false;
    const spawn: SpawnImpl = async (argv) => {
      calls += 1;
      bins.push(argv[0] ?? "");
      efforts.push(flag(argv, "--effort") ?? "");
      if (argv.includes("push")) sawPush = true;
      if (calls === 1) return { code: 1, stderr: "error TS2322" };
      return { code: 0, stderr: "" };
    };

    const result = await runFixture(dir, spawn);
    assert.equal(result.retried, 1);
    assert.ok(result.retried >= 1);
    assert.equal(result.passed, 4);
    assert.equal(calls, 4);
    assert.deepEqual(efforts, ["high", "xhigh", "high", "high"]);
    for (const bin of bins) {
      assert.notEqual(bin, "grok");
    }
    assert.equal(sawPush, false);

    const queue = await loadQueue(dir);
    assert.ok(queue);
    assert.equal(
      queue.items.some((item) => item.status === "running"),
      false,
    );
    assert.deepEqual(
      queue.items.map((item) => item.status),
      ["passed", "passed", "passed", "passed"],
    );
    assert.equal(queue.items[3]?.kind, "review");
    assert.equal(queue.items[3]?.id, "review-after-003");

    const state = loadState(dir);
    assert.ok(state);
    assert.equal(state.phase, "Improbability Drive");
    assert.equal(state.slice, "Eddie");
    assert.match(state.lastGoodCommit, /^[0-9a-f]{7,40}$/);
    assert.notEqual(state.lastGoodCommit, "");
    assert.equal(state.nextAction, "Drive idle");

    const pushArgv = ["git", "-C", dir, "push", "origin", "main"];
    const decision = evaluateCommand({ argv: pushArgv, projectRoot: dir });
    assert.equal(decision.decision, "deny");
    assert.equal(decision.reason, "git push is denied");
    if (decision.decision === "allow") {
      await spawn(pushArgv);
    }
    assert.equal(sawPush, false);
  });
});

test("an unapproved drive throws before spawn", async () => {
  await withDrive(false, async (dir) => {
    let calls = 0;
    const spawn: SpawnImpl = async () => {
      calls += 1;
      return { code: 0, stderr: "" };
    };
    await assert.rejects(
      () => runFixture(dir, spawn),
      (error: unknown) => {
        assert.ok(error instanceof FixtureRunError);
        assert.equal(error.message, "Drive is not approved.");
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
    assert.equal(calls, 0);
    assert.equal(await loadQueue(dir), null);
  });
});

test("an always-failing stub stops on rollback and does not loop", async () => {
  await withDrive(true, async (dir) => {
    let calls = 0;
    const spawn: SpawnImpl = async () => {
      calls += 1;
      if (calls > 6) {
        throw new Error("fixture loop did not stop");
      }
      return { code: 1, stderr: "error TS2322" };
    };
    await assert.rejects(
      () => runFixture(dir, spawn),
      (error: unknown) => {
        assert.ok(error instanceof FixtureRunError);
        assert.match(error.message, /Rollback to hh\/backup-2026-10-07/);
        assert.match(error.message, /drive stops/);
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
    assert.equal(calls, 3);
    const queue = await loadQueue(dir);
    assert.ok(queue);
    assert.equal(
      queue.items.some((item) => item.status === "running"),
      false,
    );
    assert.equal(queue.items[0]?.status, "escalated");
    assert.equal(queue.items[1]?.status, "queued");
    const state = loadState(dir);
    assert.equal(state?.lastGoodCommit, "");
    assert.deepEqual(state?.blockers, ["001"]);
  });
});

test("fixture-run wires the drive seams and does not import a network client", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/fixture-run.ts", import.meta.url)), "utf8");
  assert.match(source, /insertReviews\(/);
  assert.match(source, /decideTriage\(/);
  assert.match(source, /saveQueue\(/);
  assert.match(source, /loadQueue\(/);
  assert.match(source, /runPrompt\(/);
  assert.match(source, /classifyRun\(/);
  assert.match(source, /preflight\(/);
  assert.match(source, /advance\(/);
  assert.match(source, /evaluateCommand\(/);
  assert.match(source, /export async function runFixture\(/);
  assert.doesNotMatch(source, /["']node:https?["']/);
  assert.doesNotMatch(source, /["']https?["']/);
  assert.doesNotMatch(source, /["']node:dns["']/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /bin:\s*["']grok["']/);
});
