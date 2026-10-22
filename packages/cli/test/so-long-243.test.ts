/**
 * hh so-long. The ship gate runs before any host. A red or stale check,
 * a missing yes, and an omitted host write nothing and call no adapter.
 * Preview uses an injected handoff, so the test does not open a port.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/main.ts";
import { SO_LONG_USAGE, type SoLongClients, type SoLongDeps } from "../src/commands/so-long.ts";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PREVIEW_URL = "http://127.0.0.1:49152/";
const BLOCKED = "The page is missing a font a reader needs.";

const GATE_IDS = [
  "fonts",
  "type-scale",
  "spacing",
  "color",
  "imagery",
  "motion",
  "3d",
  "copy",
  "device",
  "accessibility",
  "speed",
] as const;

const skillPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "grok-plugin",
  "skills",
  "hh-so-long",
  "SKILL.md",
);

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-so-long-"));
}

function writeStack(dir: string): void {
  const folder = path.join(dir, ".hitchhiker", "research");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "STACK-DECISION.md"),
    "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe record names the pick.\n",
    "utf8",
  );
}

function writeGates(dir: string, head: string, blocker: { id: string; reason: string } | null = null): void {
  const results = GATE_IDS.map((id) => ({
    id,
    status: blocker !== null && blocker.id === id ? "BLOCKER" : "PASS",
    reason: blocker !== null && blocker.id === id ? blocker.reason : "This check is in good shape.",
    evidence: {},
  }));
  const file = path.join(dir, ".hitchhiker", "qa", "GATES.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ head, ranAt: "2026-10-21T12:00:00.000Z", results }, null, 2)}\n`,
    "utf8",
  );
}

function armed(calls: string[]): SoLongClients {
  const bump = (name: string) => (): Promise<never> => {
    calls.push(name);
    return Promise.reject(new Error("adapter called"));
  };
  return {
    hostinger: {
      uploadStatic: bump("hostinger"),
      uploadNode: bump("hostinger"),
      poll: bump("hostinger"),
    },
    vercel: { upload: bump("vercel"), poll: bump("vercel") },
    netlify: { upload: bump("netlify"), poll: bump("netlify") },
    cloudflare: { upload: bump("cloudflare"), poll: bump("cloudflare") },
    preview: { handoff: bump("preview") },
  };
}

function run(
  dir: string,
  args: readonly string[],
  extra: SoLongDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  return runCli(["so-long", "--project", dir, ...args], undefined, { soLong: { head: HEAD, ...extra } });
}

function assertQuiet(stdout: string): void {
  assert.equal(stdout.includes("!"), false);
  assert.equal(stdout.includes("\u2014"), false);
  assert.equal(stdout.includes("HH_LIVE"), false);
  assert.equal(stdout.includes("4175"), false);
}

function assertUnwritten(dir: string): void {
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md")), false);
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "preview.zip")), false);
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
}

test("a red gate exits non-zero and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, HEAD, { id: "fonts", reason: BLOCKED });
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /missing a font a reader needs/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stale head exits non-zero and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, OTHER);
    const outcome = await run(dir, ["--host", "hostinger", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /different version of this site/);
    assert.match(outcome.stdout, /launch stays closed/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a declined yes writes nothing", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const outcome = await run(dir, ["--host", "preview"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Nothing was written/);
    assert.match(outcome.stdout, /preview on this computer/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("preview builds, hands off to the injected client, and records it", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const clients = armed(calls);
    clients.preview = {
      handoff: (input) => {
        calls.push("preview");
        assert.equal(path.resolve(input.projectDir), path.resolve(dir));
        assert.equal(input.shape, "static");
        assert.equal(input.outputDir, "dist");
        return Promise.resolve({ url: PREVIEW_URL });
      },
    };
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients,
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.deepEqual(calls, ["build", "preview"]);
    assert.match(outcome.stdout, /The preview is open on this computer/);
    assert.match(outcome.stdout, /127\.0\.0\.1:49152/);
    assertQuiet(outcome.stdout);
    const record = readFileSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
    assert.match(record, /preview/);
    assert.match(record, /127\.0\.0\.1:49152/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "preview.zip")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an omitted host recommends Hostinger and asks", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const extra: SoLongDeps = {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    };
    for (const args of [[], ["--yes"]] as const) {
      const outcome = await run(dir, args, extra);
      assert.equal(outcome.exitCode, 2);
      assert.match(outcome.stdout, /Hostinger is the suggested host/);
      assert.match(outcome.stdout, /preview on this computer/);
      assert.match(outcome.stdout, /--host hostinger --yes/);
      assert.match(outcome.stdout, /--host preview --yes/);
      assert.match(outcome.stdout, /Nothing was written/);
      assertQuiet(outcome.stdout);
    }
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a folder with no saved version stays closed and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, HEAD, { id: "fonts", reason: BLOCKED });
    const outcome = await runCli(["so-long", "--project", dir, "--host", "preview", "--yes"], undefined, {
      soLong: {
        clients: armed(calls),
        build: async () => {
          calls.push("build");
        },
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /saved version/);
    assert.match(outcome.stdout, /launch stays closed/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the so-long skill names the command and still refuses a silent publish", () => {
  const skill = readFileSync(skillPath, "utf8");
  const source = readFileSync(new URL("../src/commands/so-long.ts", import.meta.url), "utf8");
  assert.equal(skill.includes("not implemented"), false);
  assert.match(skill, /Never push\./);
  assert.match(skill, /Never spend without the user's yes\./);
  assert.match(skill, /Never deploy\./);
  assert.match(skill, new RegExp(SO_LONG_USAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /hiddenChildOptions\(/);
  assert.match(source, /pathToFileURL\(/);
  assert.equal(source.includes("HH_LIVE"), false);
  assert.equal(source.includes("4175"), false);
});
