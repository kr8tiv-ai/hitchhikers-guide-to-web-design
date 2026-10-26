/**
 * `hh context` prints the same memory the desk shows.
 * `hh next` without --status does not write.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { saveState } from "@hitchhiker/engine";
import { runCli } from "../src/main.ts";
import { removeTempDir } from "./remove-temp.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-cli-context-"));
}

test("hh context, hh next --status, and hh doctor --context", async () => {
  const dir = tempDir();
  try {
    await saveState(dir, {
      phase: "Babel Fish",
      slice: "",
      promptId: "007",
      lastGoodCommit: "",
      blockers: ["logo file"],
      nextAction: "Answer DP-0.4.",
      updatedAt: "2026-10-12T00:00:00.000Z",
    });
    const stateFile = path.join(dir, ".hitchhiker", "STATE.md");
    const before = readFileSync(stateFile, "utf8");
    const status = await runCli(["next", "--status", "--project", dir]);
    assert.equal(status.exitCode, 0);
    assert.match(status.stdout, /Babel Fish/);
    assert.match(status.stdout, /logo file/);
    assert.equal(readFileSync(stateFile, "utf8"), before);

    const bare = await runCli(["next", "--project", dir]);
    assert.equal(bare.exitCode, 2);
    assert.match(bare.stdout, /hh next --status/);
    assert.equal(readFileSync(stateFile, "utf8"), before);

    const context = await runCli(["context", "--project", dir]);
    assert.equal(context.exitCode, 0);
    assert.match(context.stdout, /What the Guide knows/);
    assert.match(context.stdout, /Babel Fish/);
    assert.match(context.stdout, /Decisions:/);
    assert.match(context.stdout, /Assets:/);

    const audit = await runCli(["context", "--audit", "--project", dir]);
    assert.match(audit.stdout, /No context audit yet/);

    const doctor = await runCli(["doctor", "--context", "--project", dir]);
    assert.equal(doctor.exitCode, 1);
    assert.match(doctor.stdout, /hh context repair --cursor/);
    assert.equal(existsSync(stateFile), true);
    assert.equal(readFileSync(stateFile, "utf8"), before);
  } finally {
    removeTempDir(dir);
  }
});
