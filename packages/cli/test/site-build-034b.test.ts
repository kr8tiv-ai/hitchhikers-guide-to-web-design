/**
 * BUG-034b: `hh next --resume` and `hh build --resume` continue one queue.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  clearProjectBuildRunner,
  loadQueue,
  prepareSiteBuild,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
} from "@hitchhiker/engine";
import { runCli } from "../src/main.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("hh build --resume and hh next --resume start one run", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-cli-034b-"));
  const seen: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    assert.ok(request.args.includes(BUILD_MODEL));
    assert.ok(request.args.includes(BUILD_EFFORT));
    if (request.promptId === "003") {
      return { pid: 999999, done: gate.then(() => ({ code: 0, stdout: "", stderr: "", errorCode: null })) };
    }
    return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    await saveQueue(dir, {
      items: [
        { id: "001", kind: "build", status: "passed" },
        { id: "002", kind: "build", status: "passed" },
        { id: "003", kind: "build", status: "interrupted" },
        { id: "004", kind: "build", status: "queued" },
      ],
    });
    const bare = await runCli(["next"]);
    assert.equal(bare.exitCode, 2);
    assert.match(bare.stdout, /hh next --resume/);
    const missing = await runCli(["build", "--project", dir]);
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stdout, /hh build --resume/);
    assert.deepEqual(seen, []);
    const started = await runCli(["build", "--resume", "--project", dir]);
    assert.equal(started.exitCode, 0);
    assert.match(started.stdout, /The build is started/);
    for (let attempt = 0; attempt < 40 && !seen.includes("003"); attempt += 1) await delay(25);
    assert.deepEqual(seen, ["003"]);
    const again = await runCli(["next", "--resume", "--project", dir]);
    assert.equal(again.exitCode, 0);
    assert.match(again.stdout, /The build is started/);
    await delay(40);
    assert.deepEqual(seen, ["003"]);
    release();
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "003")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "004")?.status, "passed");
    assert.equal(seen.filter((id) => id === "003").length, 1);
  } finally {
    release();
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hh build --resume with nothing waiting does not spawn", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-cli-034b-idle-"));
  let calls = 0;
  setProjectBuildRunner(dir, () => {
    calls += 1;
    return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  });
  try {
    const idle = await runCli(["build", "--resume", "--project", dir]);
    assert.equal(idle.exitCode, 1);
    assert.match(idle.stdout, /No site build is queued/);
    assert.equal(calls, 0);
  } finally {
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});
