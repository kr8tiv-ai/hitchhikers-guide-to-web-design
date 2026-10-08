import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { GrokMissingError, defaultConfig, type GuideConfig, type SpawnLike } from "@hitchhiker/engine";
import {
  LiveUsageLimitError,
  commandFor,
  liveDogfoodEnabled,
  liveGrokSpawn,
  runLivePrompt,
} from "../src/live-runner.ts";
import { evaluateCommand } from "../src/policy.ts";
import { advance } from "../src/progress.ts";
import { loadQueue, saveQueue } from "../src/queue-file.ts";
import { buildArgv } from "../src/runner.ts";

function config(): GuideConfig {
  const next = defaultConfig();
  next.sessionIdMode = "alias";
  next.effort = "medium";
  return next;
}

function project(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-live-"));
}

async function writePrompt(dir: string, name: string, body: string): Promise<string> {
  const file = path.join(dir, ".hitchhiker", "prompts", name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
  await writeFile(
    path.join(dir, ".hitchhiker", "drive-approval.json"),
    `${JSON.stringify({ approved: true })}\n`,
    "utf8",
  );
  return file;
}

const PROMPT = `---
id: 001-home
kind: build
effort: high
maxTurns: 4
---

Build the towel home page.
`;

describe("live runner", () => {
  test("fake spawn matches the 096 argv, logs tokens, and stays off the real binary", async () => {
    const dir = project();
    try {
      const file = await writePrompt(dir, "001-home.md", PROMPT);
      let seen: { command: string; args: readonly string[]; cwd: string } | undefined;
      const spawnImpl: SpawnLike = async (request) => {
        seen = { command: request.command, args: request.args, cwd: request.cwd };
        return {
          status: 0,
          stdout: [
            JSON.stringify({ usage: { input_tokens: 11, output_tokens: 7 } }),
            JSON.stringify({ usage: { input_tokens: 20, output_tokens: 5 } }),
          ].join("\n"),
          stderr: "note sk-livekey12345678",
          timedOut: false,
          errorCode: null,
        };
      };
      const guide = config();
      const result = await runLivePrompt(file, { spawnImpl, projectDir: dir, config: guide });
      assert.ok(seen);
      assert.equal(seen.command, "grok");
      assert.equal(seen.cwd, dir);
      const expected = buildArgv({
        model: guide.model,
        cwd: dir,
        promptText: PROMPT,
        bin: "grok",
        promptPath: file,
        effort: "high",
        maxTurns: 4,
        sessionMode: "alias",
        approved: true,
      });
      assert.deepEqual(seen.args, expected);
      assert.equal(seen.args.includes("--always-approve"), false);
      assert.equal(seen.args.includes("--sandbox"), false);
      assert.equal(seen.args.includes("--session-id"), false);
      assert.equal(seen.args.includes("streaming-json"), true);
      const decision = evaluateCommand({ argv: [seen.command, ...seen.args], projectRoot: dir });
      assert.equal(decision.decision, "allow");
      assert.equal(result.exitCode, 0);
      assert.equal(result.tokens?.input, 20);
      assert.equal(result.tokens?.output, 5);
      assert.ok(result.durationMs >= 0);
      const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "drive", "001-home.ndjson"), "utf8");
      assert.equal(log.includes("sk-livekey12345678"), false);
      assert.match(log, /\[REDACTED\]/);
      const last = log.trim().split(/\r?\n/).at(-1);
      assert.ok(last);
      const sensor = JSON.parse(last) as { kind?: string; verdict?: string };
      assert.equal(sensor.kind, "sensor");
      assert.equal(sensor.verdict, "ok");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a usage limit pauses the queue and does not advance", async () => {
    const dir = project();
    try {
      const file = await writePrompt(dir, "001-home.md", PROMPT);
      await saveQueue(dir, {
        items: [
          { id: "001-home", kind: "build", status: "running" },
          { id: "002-work", kind: "build", status: "running" },
        ],
      });
      const spawnImpl: SpawnLike = async () => ({
        status: 1,
        stdout: '{"message":"usage limit reached"}\n',
        stderr: "",
        timedOut: false,
        errorCode: null,
      });
      await assert.rejects(
        () => runLivePrompt(file, { spawnImpl, projectDir: dir, config: config() }),
        (error: unknown) => error instanceof LiveUsageLimitError && /paused/.test(error.message),
      );
      const queue = await loadQueue(dir);
      assert.ok(queue);
      assert.equal(queue.items.every((item) => item.status === "paused"), true);
      await assert.rejects(
        () => advance({ projectDir: dir, finishedId: "001-home", outcome: "passed", commit: null }),
        /paused/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a missing queue still records the paused prompt", async () => {
    const dir = project();
    try {
      const file = await writePrompt(dir, "003-visit.md", PROMPT);
      const spawnImpl: SpawnLike = async () => ({
        status: 1,
        stdout: "quota exceeded\n",
        stderr: "",
        timedOut: false,
        errorCode: null,
      });
      await assert.rejects(
        () => runLivePrompt(file, { spawnImpl, projectDir: dir, config: config() }),
        LiveUsageLimitError,
      );
      const queue = await loadQueue(dir);
      assert.deepEqual(queue?.items, [{ id: "003-visit", kind: "build", status: "paused" }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("missing approval does not spawn", async () => {
    const dir = project();
    try {
      const file = path.join(dir, ".hitchhiker", "prompts", "001-home.md");
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, PROMPT, "utf8");
      let called = false;
      const spawnImpl: SpawnLike = async () => {
        called = true;
        return { status: 0, stdout: "", stderr: "", timedOut: false, errorCode: null };
      };
      await assert.rejects(
        () => runLivePrompt(file, { spawnImpl, projectDir: dir, config: config() }),
        /not a yes/,
      );
      assert.equal(called, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a missing grok binary names hh doctor", async () => {
    const dir = project();
    try {
      const file = await writePrompt(dir, "001-home.md", PROMPT);
      const spawnImpl: SpawnLike = async () => ({
        status: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        errorCode: "ENOENT",
      });
      await assert.rejects(
        () => runLivePrompt(file, { spawnImpl, projectDir: dir, config: config() }),
        (error: unknown) => error instanceof GrokMissingError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the real spawn path resolves grok or reports it missing", () => {
    const fake: SpawnLike = async () => ({
      status: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      errorCode: null,
    });
    assert.equal(commandFor(fake, process.env), "grok");
    try {
      const resolved = commandFor(liveGrokSpawn, process.env);
      assert.match(resolved, /grok/i);
    } catch (error) {
      assert.ok(error instanceof GrokMissingError);
    }
    assert.throws(() => commandFor(liveGrokSpawn, { PATH: "" }), GrokMissingError);
  });

  test("live dogfood stays off unless HH_LIVE is exactly 1", async () => {
    assert.equal(liveDogfoodEnabled({}), false);
    assert.equal(liveDogfoodEnabled({ HH_LIVE: "true" }), false);
    assert.equal(liveDogfoodEnabled({ HH_LIVE: "0" }), false);
    assert.equal(liveDogfoodEnabled({ HH_LIVE: "1" }), true);
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const script = path.join(repo, "evals", "dogfood-live", "run.ts");
    const report = path.join(repo, "evals", "dogfood-live", "REPORT.md");
    const before = existsSync(report) ? statSync(report).mtimeMs : 0;
    const env = { ...process.env };
    delete env.HH_LIVE;
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", script], {
        cwd: repo,
        env,
        windowsHide: true,
        shell: false,
      });
      child.on("error", reject);
      child.on("close", (status) => resolve(status));
    });
    assert.equal(code, 0);
    if (before === 0) assert.equal(existsSync(report), false);
    else assert.equal(statSync(report).mtimeMs, before);
  });
});
