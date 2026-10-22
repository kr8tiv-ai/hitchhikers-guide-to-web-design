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
import { appendPostCheckSection, type PostDeployReport } from "../src/post-deploy-live.ts";

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

test("a post-check section lists a 404 and does not deploy", async () => {
  const dir = await makeProject();
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk(),
      keychain: { getPassword: () => Promise.resolve(null) },
    });
    assert.equal("url" in outcome && outcome.url, "https://towels.example");
    const checklistPath = path.join(dir, ".hitchhiker", "deploy", "launch-checklist.json");
    const beforeChecklist = await readFile(checklistPath, "utf8");
    const report: PostDeployReport = {
      url: "https://towels.example",
      lighthouse: {
        status: "PASS",
        scores: { performance: 95, accessibility: 96, bestPractices: 97, seo: 98 },
        reasons: [],
      },
      routes: [{ route: "/missing", status: 404, ok: false }],
      homepage: { skipped: false, ok: true, reason: "ok" },
      form: { declined: false, ok: false, reason: "No contact form was found. Nothing was submitted." },
      analytics: { declined: false, ok: false, confirm: "", reason: "No Plausible or Umami snippet was found. No event was sent." },
      og: { ok: true, title: "Towels", description: "Soft", image: "https://towels.example/og.png", preview: "card" },
      https: { ok: true, hsts: true, reason: "HTTPS and HSTS are present." },
      redirects: [],
      sitemap: { submitted: false, instructions: "Keep it." },
    };
    const deploys = path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md");
    const before = await readFile(deploys, "utf8");
    await appendPostCheckSection(dir, report);
    const after = await readFile(deploys, "utf8");
    assert.equal(after.startsWith(before.trimEnd()), true);
    assert.match(after, /https:\/\/towels\.example/);
    assert.match(after, /## Post-check/);
    assert.match(after, /Page \/missing was not found \(404\)\./);
    assert.match(after, /The live check failed\./);
    const checklist = JSON.parse(await readFile(checklistPath, "utf8")) as { deployed: boolean };
    assert.equal(checklist.deployed, false);
    assert.equal(await readFile(checklistPath, "utf8"), beforeChecklist);
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
