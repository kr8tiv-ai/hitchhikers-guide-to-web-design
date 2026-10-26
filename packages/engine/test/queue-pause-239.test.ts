import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  loadQueue,
  prepareSiteBuild,
  resetSiteBuildWatch,
  retrySiteBuild,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

test("explicit Retry clears a persisted queue pause and an automatic hold does not", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-pause-239-"));
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    return { pid: 424242, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Calm editorial brief.");
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "failed" },
        { id: "002", kind: "build", status: "queued" },
      ],
      pause: { at: "2026-10-19T00:00:00.000Z", after: "001" },
    });
    assert.equal((await loadQueue(dir))?.pause?.after, "001");
    await retrySiteBuild(dir, "001");
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.pause, undefined);
    assert.equal(seen.includes("001"), true);
  } finally {
    await siteBuildSettled(dir).catch(() => undefined);
    resetSiteBuildWatch(dir);
    clearProjectBuildRunner(dir);
    removeTempDir(dir);
  }
});
