/**
 * 241k idea 25. A successful deploy writes the launch checklist.
 * A declined yes writes nothing. The checklist does not deploy.
 */

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SpawnLike } from "@hitchhiker/engine";
import { deploy } from "../src/cli-run.ts";

function stack(): string {
  return "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe record names the pick.\n";
}

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-launch-241k-"));
  await mkdir(path.join(dir, ".hitchhiker", "research"), { recursive: true });
  await writeFile(path.join(dir, ".hitchhiker", "research", "STACK-DECISION.md"), stack(), "utf8");
  await mkdir(path.join(dir, "dist"), { recursive: true });
  await writeFile(path.join(dir, "dist", "index.html"), "<title>Towels</title>\n", "utf8");
  return dir;
}

function spawnOk(): SpawnLike {
  return () =>
    Promise.resolve({
      status: 0,
      stdout: "https://towels.example",
      stderr: "",
      timedOut: false,
      errorCode: null,
    });
}

test("a successful deploy writes a checklist that does not deploy", async () => {
  const dir = await makeProject();
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk(),
      keychain: { getPassword: () => Promise.resolve(null) },
    });
    assert.equal("url" in outcome && outcome.url, "https://towels.example");
    const report = JSON.parse(
      await readFile(path.join(dir, ".hitchhiker", "deploy", "launch-checklist.json"), "utf8"),
    ) as { deployed: boolean; status: string };
    assert.equal(report.deployed, false);
    assert.equal(report.status, "BLOCKER");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a declined yes writes no checklist", async () => {
  const dir = await makeProject();
  let spawned = 0;
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(false),
      spawnImpl: () => {
        spawned += 1;
        return Promise.reject(new Error("spawn ran"));
      },
      keychain: { getPassword: () => Promise.reject(new Error("keychain ran")) },
    });
    assert.deepEqual(outcome, { declined: true });
    assert.equal(spawned, 0);
    await assert.rejects(readFile(path.join(dir, ".hitchhiker", "deploy", "launch-checklist.json"), "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a broken checklist file does not flip a successful deploy", async () => {
  const dir = await makeProject();
  await mkdir(path.join(dir, ".hitchhiker", "deploy"), { recursive: true });
  await writeFile(path.join(dir, ".hitchhiker", "deploy", "launch-evidence.json"), "not json\n", "utf8");
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk(),
      keychain: { getPassword: () => Promise.resolve(null) },
    });
    assert.equal("url" in outcome && outcome.url, "https://towels.example");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
