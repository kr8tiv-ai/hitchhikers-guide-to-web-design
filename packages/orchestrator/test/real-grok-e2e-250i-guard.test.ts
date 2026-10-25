/**
 * 250i. The real Grok build stays off unless HH_REAL_GROK_E2E=1.
 * This file always runs. It must not spawn grok.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const e2eFile = path.join(here, "real-grok-e2e-250i.test.ts");
const SKIP_REASON = "set HH_REAL_GROK_E2E=1 to run a real Grok build";

test("the real Grok e2e is skipped without the flag and scope defaults to 3 prompts and 60 minutes", async () => {
  assert.equal(existsSync(e2eFile), true, "real-grok-e2e-250i.test.ts is missing");
  const helper = await import("./real-grok-e2e-250i.ts");
  const parseRealGrokE2eScope = helper.parseRealGrokE2eScope as (env: NodeJS.ProcessEnv) => {
    maxPrompts: number;
    minutes: number;
  };
  const defaults = parseRealGrokE2eScope({});
  assert.equal(defaults.maxPrompts, 3);
  assert.equal(defaults.minutes, 60);
  const parsed = parseRealGrokE2eScope({
    HH_REAL_GROK_E2E_MAX_PROMPTS: "2",
    HH_REAL_GROK_E2E_MINUTES: "15",
  });
  assert.equal(parsed.maxPrompts, 2);
  assert.equal(parsed.minutes, 15);
  const junk = parseRealGrokE2eScope({
    HH_REAL_GROK_E2E_MAX_PROMPTS: "0",
    HH_REAL_GROK_E2E_MINUTES: "nope",
  });
  assert.equal(junk.maxPrompts, 3);
  assert.equal(junk.minutes, 60);
  const selectRealGrokPromptIds = helper.selectRealGrokPromptIds as (
    items: readonly { id: string; status: string }[],
    requirementsById: Readonly<Record<string, readonly string[]>>,
    maxPrompts: number,
  ) => { keep: string[]; pause: string[] };
  const picked = selectRealGrokPromptIds(
    [
      { id: "001", status: "queued" },
      { id: "002", status: "queued" },
      { id: "003", status: "queued" },
      { id: "004", status: "queued" },
      { id: "005", status: "queued" },
      { id: "006", status: "passed" },
    ],
    {
      "001": ["REQ-ROUTES"],
      "002": ["REQ-SCAFFOLD"],
      "003": ["REQ-FONTS"],
      "004": ["REQ-STRUCT-hero"],
      "005": ["REQ-STRUCT-shop"],
      "006": ["REQ-STRUCT-late"],
    },
    3,
  );
  assert.deepEqual(picked.keep, ["002", "004", "005"]);
  assert.deepEqual(picked.pause, ["001", "003"]);

  const empty = await mkdtemp(path.join(os.tmpdir(), "hh-250i-nopath-"));
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: empty, Path: empty };
  delete env.HH_REAL_GROK_E2E;
  // The parent suite sets this. A nested node --test would skip every file.
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--test", e2eFile],
    hiddenChildOptions({ cwd: here, env, stdio: ["ignore", "pipe", "pipe"] }),
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The skipped e2e did not finish. It may have spawned grok."));
    }, 20_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (status) => {
      clearTimeout(timer);
      resolve(status ?? 1);
    });
  });
  const output = `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`;
  assert.equal(code, 0, output);
  assert.match(output, new RegExp(SKIP_REASON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /skipped/i);
  assert.equal(/grok is not on PATH/i.test(output), false);
});
