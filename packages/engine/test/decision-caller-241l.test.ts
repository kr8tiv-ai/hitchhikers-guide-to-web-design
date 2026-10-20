/**
 * 241l. A real direction choice writes the decision log.
 * Saving a deal does not. The next deal skips the rejected names.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decisionLogPath, readDecisionLog, rejectedDirectionNames } from "../src/brand/decision-canvas.ts";
import { dealDirections, designLibraryRoot, readDirectionDeal } from "../src/brand/directions.ts";
import { writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { advanceDesignStages } from "../src/spec/design-stages.ts";

const AT = "2026-10-20T16:00:00.000Z";
const REASON = "The quieter page fits the brief.";

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-direction-241l-"));
}

test("a choice writes the log and the next deal skips the rejected names", () => {
  const dir = tempProject();
  const empty = tempProject();
  try {
    writeBrandKit(dir, []);
    assert.equal(existsSync(decisionLogPath(dir)), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "directions.json")), true);
    const saved = readDirectionDeal(dir);
    assert.ok(saved);
    assert.equal(saved.pickedId, null);
    assert.equal(saved.directions.length, 3);

    advanceDesignStages(dir, { brief: "A kiln for the north road." });
    assert.equal(existsSync(decisionLogPath(dir)), false);
    advanceDesignStages(dir, { brief: "A kiln for the north road.", direction: { id: "  ", reason: "  " } });
    assert.equal(existsSync(decisionLogPath(dir)), false);

    assert.throws(
      () =>
        advanceDesignStages(empty, {
          brief: "A kiln for the north road.",
          direction: { id: "dir-missing", reason: REASON, at: AT },
        }),
      /No directions/,
    );
    assert.equal(existsSync(decisionLogPath(empty)), false);
    assert.equal(existsSync(path.join(empty, ".hitchhiker", "sitemap.md")), false);

    const picked = saved.directions[0];
    assert.ok(picked);
    advanceDesignStages(dir, {
      brief: "A kiln for the north road.",
      direction: { id: picked.id, reason: REASON, at: AT },
    });
    const rejected = rejectedDirectionNames(dir);
    assert.equal(rejected.length, 2);
    assert.equal(rejected.includes(picked.name), false);
    const log = readDecisionLog(dir);
    assert.equal(
      log.some((row) => row.status === "picked" && row.id === picked.id && row.reason === REASON && row.at === AT),
      true,
    );
    assert.equal(log.filter((row) => row.status === "rejected" && row.reason === "Shown and not picked.").length, 2);

    const next = dealDirections(designLibraryRoot(), dir);
    assert.equal(next.directions.length, 3);
    for (const name of rejected) {
      assert.equal(
        next.directions.some((direction) => direction.name === name),
        false,
        name,
      );
    }
    const kept = readDirectionDeal(dir);
    assert.equal(kept?.pickedId, picked.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});
