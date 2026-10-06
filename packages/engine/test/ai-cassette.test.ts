import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CassetteMissError,
  cassetteKey,
  defaultConfig,
  think,
  writeCassette,
  type JsonSchema,
  type SpawnLike,
} from "../src/index.ts";

const schema: JsonSchema = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
};

const FLAGS = new Set([
  "-p",
  "-m",
  "--effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-cassette-"));
}

test("replay hit returns the cassette and does not spawn", async () => {
  const dir = tempDir();
  const cassetteDir = path.join(dir, "cassettes");
  const req = { task: "saved-task", input: "hello", schema };
  const key = cassetteKey({
    task: req.task,
    model: "grok-4.7",
    effort: "medium",
    schema: req.schema,
    input: req.input,
  });
  writeCassette(cassetteDir, {
    task: req.task,
    model: "grok-4.7",
    effort: "medium",
    key,
    result: { ok: true },
    raw: '{"ok":true}',
    durationMs: 42,
    inputTokens: 3,
    outputTokens: 1,
  });
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    throw new Error("spawned during replay");
  };
  try {
    const result = await think(req, {
      spawnImpl,
      projectDir: dir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "replay", PATH: "", HH_SENTINEL: "should-not-matter" },
    });
    assert.equal(calls, 0);
    assert.equal(result.cassette, "hit");
    assert.equal(result.value.ok, true);
    assert.equal(result.durationMs, 42);
    assert.equal(result.inputTokens, 3);
    assert.equal(result.outputTokens, 1);
    assert.equal(result.raw, '{"ok":true}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replay miss throws CassetteMissError with the key and does not spawn", async () => {
  const dir = tempDir();
  const cassetteDir = path.join(dir, "cassettes");
  const req = { task: "missing-task", input: "hello", schema };
  const key = cassetteKey({
    task: req.task,
    model: "grok-4.7",
    effort: "medium",
    schema: req.schema,
    input: req.input,
  });
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    throw new Error("spawned during replay");
  };
  try {
    await assert.rejects(
      () =>
        think(req, {
          spawnImpl,
          projectDir: dir,
          cassetteDir,
          config: defaultConfig(),
          flags: FLAGS,
          env: { HH_CASSETTE: "replay", PATH: "" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof CassetteMissError);
        assert.equal(error.key, key);
        assert.match(error.message, new RegExp(key));
        return true;
      },
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("record writes the result and leaves env values out of the file", async () => {
  const dir = tempDir();
  const cassetteDir = path.join(dir, "cassettes");
  const sentinel = "super-secret-env-value";
  const req = { task: "record-task", input: "hello", schema };
  const spawnImpl: SpawnLike = async () => ({
    status: 0,
    stdout: JSON.stringify({
      text: '{"ok":true}',
      stopReason: "end_turn",
      usage: { input_tokens: 4, output_tokens: 2 },
    }),
    stderr: "",
    timedOut: false,
    errorCode: null,
  });
  try {
    const result = await think(req, {
      spawnImpl,
      projectDir: dir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "", HH_SENTINEL: sentinel, GROK_HOME: "" },
    });
    assert.equal(result.cassette, "recorded");
    assert.equal(result.value.ok, true);
    const key = cassetteKey({
      task: req.task,
      model: "grok-4.7",
      effort: "medium",
      schema: req.schema,
      input: req.input,
    });
    const file = path.join(cassetteDir, "record-task", `${key}.json`);
    assert.equal(existsSync(file), true);
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes(sentinel), false);
    assert.equal(text.includes("HH_SENTINEL"), false);
    assert.equal(text.includes("GROK_HOME"), false);
    assert.equal(text.includes("\r"), false);
    const saved = JSON.parse(text) as { result: { ok: boolean }; inputTokens: number; durationMs: number };
    assert.equal(saved.result.ok, true);
    assert.equal(saved.inputTokens, 4);
    assert.equal(typeof saved.durationMs, "number");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("off calls the model and does not write a cassette", async () => {
  const dir = tempDir();
  const cassetteDir = path.join(dir, "cassettes");
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    return {
      status: 0,
      stdout: JSON.stringify({ text: '{"ok":true}', stopReason: "end_turn" }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  try {
    const result = await think(
      { task: "live-task", input: "hello", schema },
      {
        spawnImpl,
        projectDir: dir,
        cassetteDir,
        config: defaultConfig(),
        flags: FLAGS,
        env: { HH_CASSETTE: "off", PATH: "" },
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.cassette, "live");
    assert.equal(result.value.ok, true);
    assert.equal(existsSync(cassetteDir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
