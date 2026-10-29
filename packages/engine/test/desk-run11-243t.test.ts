/**
 * Desk Run 11: a prompt that runs out of disk reports the free-space
 * sentence, and the media config cap stays at 1920.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ConfigError,
  clearProjectBuildRunner,
  defaultConfig,
  ensureSiteBuild,
  parseConfig,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const FALLBACK =
  "Not enough free disk space to write media variants: unknown free on the output volume, need 2 GB. Free space and retry.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-243t-"));
}

function result(stderr: string, errorCode: string | null = null): BuildSpawnResult {
  return { code: 1, stdout: "", stderr, errorCode };
}

async function queueOne(dir: string): Promise<void> {
  mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "Prompt 001.\n", "utf8");
  await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
}

async function cleanup(dir: string): Promise<void> {
  await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
  resetSiteBuildWatch(dir);
  clearProjectBuildRunner(dir);
  setSiteBuildGate(dir, null);
  removeTempDir(dir);
}

test("No space left on device becomes the free-space failure and drops tmp", async () => {
  const dir = tempDir();
  const leak = path.join(dir, ".hitchhiker", "tmp", "leak.bin");
  const spawn: BuildSpawn = (request) => {
    mkdirSync(path.join(request.cwd, ".hitchhiker", "tmp"), { recursive: true });
    writeFileSync(leak, "partial-encode");
    request.onOutput?.("Error: No space left on device\n");
    return { pid: 243243, done: Promise.resolve(result("ENOSPC: No space left on device\n")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.reason, FALLBACK);
    assert.equal((run?.reason ?? "").includes("ENOSPC"), false);
    assert.equal((run?.reason ?? "").includes("No space left"), false);
    assert.equal(existsSync(leak), false);
  } finally {
    await cleanup(dir);
  }
});

test("an ENOSPC exit with the measured sentence keeps that sentence", async () => {
  const dir = tempDir();
  const sentence =
    "Not enough free disk space to write media variants: 100 B free on C:, need 2 GB. Free space and retry.";
  const spawn: BuildSpawn = () => {
    return { pid: 243243, done: Promise.resolve(result(`${sentence}\nENOSPC\n`, "ENOSPC")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await queueOne(dir);
    await ensureSiteBuild(dir);
    const run = readBuildRun(dir);
    assert.equal(run?.status, "failed");
    assert.equal(run?.reason, sentence);
  } finally {
    await cleanup(dir);
  }
});

test("media config defaults to 8 variants, 400 MB, and a 1920 cap", () => {
  const media = defaultConfig().media;
  assert.equal(media.maxVariantsPerImage, 8);
  assert.equal(media.maxRunBytes, 400 * 1024 * 1024);
  assert.equal(media.maxWidth, 1920);
  assert.deepEqual(parseConfig({}).media, media);
  assert.equal(parseConfig({ media: { maxWidth: 2560 } }).media.maxWidth, 1920);
  assert.equal(parseConfig({ media: { maxWidth: 1280 } }).media.maxWidth, 1280);
  assert.throws(
    () => parseConfig({ media: { foo: 1 } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "media.foo");
      assert.match(error.message, /unknown key/);
      return true;
    },
  );
});
