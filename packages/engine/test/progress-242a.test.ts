/**
 * BUG-050. Resume progress uses the same asked-question total as the card.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { interviewProgressLabel } from "../src/project-file/capture.ts";
import { saveState } from "../src/state.ts";
import { removeTempDir } from "./remove-temp.ts";

test("progress label is question 1 of 61 when the stored default is not asked", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-progress-242a-"));
  try {
    await saveState(dir, {
      phase: "Don't Panic",
      slice: "Desk",
      promptId: "interview:DP-0.1",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Answer DP-0.1.",
      updatedAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(interviewProgressLabel(dir), "question 1 of 61");
  } finally {
    removeTempDir(dir);
  }
});
