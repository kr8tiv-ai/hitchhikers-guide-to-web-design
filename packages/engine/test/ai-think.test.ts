import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  GrokMissingError,
  GrokUnavailableError,
  ThinkSchemaError,
  ThinkTimeoutError,
  buildGrokArgv,
  defaultConfig,
  flagsFromHelp,
  parseConfig,
  redact,
  resolveGrokCommand,
  spawnGrok,
  think,
  validateJson,
  type JsonSchema,
  type SpawnLike,
  type ThinkDeps,
} from "../src/index.ts";

const okSchema: JsonSchema = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
};

const FLAGS = new Set([
  "-p",
  "--single",
  "--prompt-file",
  "--prompt-json",
  "-m",
  "--model",
  "--effort",
  "--reasoning-effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-think-"));
}

function assertKnownFlags(argv: readonly string[], flags: ReadonlySet<string>): void {
  for (const arg of argv) {
    if (arg.startsWith("-")) assert.ok(flags.has(arg), arg);
  }
}

function envelope(text: string, usage?: { input_tokens: number; output_tokens: number }): string {
  const body: Record<string, unknown> = { text, stopReason: "end_turn", sessionId: "test" };
  if (usage !== undefined) body.usage = usage;
  return JSON.stringify(body);
}

function deps(dir: string, spawnImpl: SpawnLike, env: NodeJS.ProcessEnv): ThinkDeps {
  return {
    spawnImpl,
    projectDir: dir,
    cassetteDir: path.join(dir, "cassettes"),
    config: defaultConfig(),
    flags: FLAGS,
    env,
  };
}

test("validateJson covers the schema subset", () => {
  const schema: JsonSchema = {
    type: "object",
    required: ["name", "tags"],
    properties: {
      name: { type: "string", maxLength: 5, pattern: "^[a-z]+$" },
      tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: ["a", "b"] } },
      count: { type: "integer" },
    },
  };
  assert.deepEqual(validateJson({ name: "ab", tags: ["a"], count: 2 }, schema), []);
  const errors = validateJson({ name: "TOO-LONG", tags: [], count: 1.5 }, schema);
  assert.ok(errors.some((error) => error.includes("maxLength")));
  assert.ok(errors.some((error) => error.includes("pattern")));
  assert.ok(errors.some((error) => error.includes("minItems")));
  assert.ok(errors.some((error) => error.includes("integer")));
  assert.ok(validateJson({ name: "ab" }, schema).some((error) => error.includes("required")));
  assert.ok(validateJson({ name: "ab", tags: ["z"] }, schema).some((error) => error.includes("enum")));
});

test("model and effort come from config, and a schema adds --json-schema", () => {
  const cfg = parseConfig({
    ai: {
      model: "grok-test",
      effort: { default: "high", quote: "xhigh" },
      timeoutMs: 5_000,
    },
  });
  const schema: JsonSchema = {
    type: "object",
    required: ["name"],
    properties: { name: { type: "string" } },
  };
  const argv = buildGrokArgv({ task: "quote", input: "price the job" }, cfg, FLAGS);
  assertKnownFlags(argv, FLAGS);
  assert.ok(argv.includes("-m"));
  assert.ok(argv.includes("grok-test"));
  assert.ok(argv.includes("--effort"));
  assert.ok(argv.includes("xhigh"));
  assert.ok(argv.includes("--max-turns"));
  assert.equal(argv[argv.indexOf("--max-turns") + 1], "1");
  assert.equal(argv[argv.indexOf("--permission-mode") + 1], "plan");
  assert.equal(argv[argv.indexOf("--tools") + 1], "read_file,grep,list_dir");
  assert.equal(argv.includes("--always-approve"), false);
  const withSchema = buildGrokArgv({ task: "quote", input: "price the job", schema }, cfg, FLAGS);
  assertKnownFlags(withSchema, FLAGS);
  const schemaIndex = withSchema.indexOf("--json-schema");
  assert.ok(schemaIndex >= 0);
  const encoded = withSchema[schemaIndex + 1];
  assert.equal(typeof encoded, "string");
  assert.equal(JSON.parse(encoded ?? "{}").required[0], "name");
  const overridden = buildGrokArgv(
    { task: "quote", input: "price the job", model: "grok-other", effort: "medium", maxTurns: 4 },
    cfg,
    FLAGS,
  );
  assert.ok(overridden.includes("grok-other"));
  assert.ok(overridden.includes("medium"));
  assert.equal(overridden[overridden.indexOf("--max-turns") + 1], "4");
});

test("a 30 KB prompt switches to --prompt-file", () => {
  const argv = buildGrokArgv(
    { task: "long", input: "x".repeat(30 * 1024) },
    defaultConfig(),
    FLAGS,
  );
  assertKnownFlags(argv, FLAGS);
  assert.ok(argv.includes("--prompt-file"));
  assert.equal(argv.includes("-p"), false);
  assert.equal(argv.includes("--prompt-json"), false);
});

test("images switch to --prompt-json content blocks", () => {
  const dir = tempDir();
  try {
    const image = path.join(dir, "shot.png");
    writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const argv = buildGrokArgv(
      { task: "look", input: "what is this", images: [image] },
      defaultConfig(),
      FLAGS,
    );
    assertKnownFlags(argv, FLAGS);
    const index = argv.indexOf("--prompt-json");
    assert.ok(index >= 0);
    assert.equal(argv.includes("-p"), false);
    const encoded = argv[index + 1];
    assert.equal(typeof encoded, "string");
    const blocks = JSON.parse(encoded ?? "[]") as Array<Record<string, string>>;
    assert.equal(blocks[0]?.type, "text");
    assert.equal(blocks[0]?.text, "what is this");
    assert.equal(blocks[1]?.type, "image");
    assert.equal(blocks[1]?.mimeType, "image/png");
    assert.equal(typeof blocks[1]?.data, "string");
    assert.ok((blocks[1]?.data ?? "").length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("argv never contains a flag missing from the provided flags set", () => {
  const flags = new Set(["-p", "-m"]);
  const argv = buildGrokArgv(
    {
      task: "t",
      input: "hello",
      schema: okSchema,
      images: ["missing.png"],
      effort: "high",
      maxTurns: 3,
    },
    defaultConfig(),
    flags,
  );
  assertKnownFlags(argv, flags);
  assert.deepEqual(
    argv.filter((arg) => arg.startsWith("-")),
    ["-m", "-p"],
  );
  assert.equal(argv.includes("--json-schema"), false);
  assert.equal(argv.includes("--prompt-json"), false);
  assert.equal(argv.includes("--prompt-file"), false);
  assert.equal(argv.includes("--effort"), false);
  assert.equal(argv.includes("--tools"), false);
});

test("flagsFromHelp keeps only flags the help text names", () => {
  const help = [
    "  -p, --single <PROMPT>",
    "  -m, --model <MODEL>",
    "      --json-schema <SCHEMA>",
    "      --reasoning-effort <EFFORT>",
    "          [aliases: --effort]",
    "      --prompt-file <PATH>",
    "      --prompt-json <JSON>",
  ].join("\n");
  const flags = flagsFromHelp(help);
  assert.equal(flags.has("-p"), true);
  assert.equal(flags.has("-m"), true);
  assert.equal(flags.has("--json-schema"), true);
  assert.equal(flags.has("--effort"), true);
  assert.equal(flags.has("--prompt-file"), true);
  assert.equal(flags.has("--prompt-json"), true);
  assert.equal(flags.has("--no-auto-update"), false);
  assert.equal(flags.has("--always-approve"), false);
});

test("a bad answer then a good answer is one repair and two calls", async () => {
  const dir = tempDir();
  const prompts: string[] = [];
  const spawnImpl: SpawnLike = async (request) => {
    const promptIndex = request.args.indexOf("-p");
    prompts.push(request.args[promptIndex + 1] ?? "");
    const text = prompts.length === 1 ? '{"ok":"no"}' : '{"ok":true}';
    return {
      status: 0,
      stdout: envelope(text, { input_tokens: 8, output_tokens: 3 }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  try {
    const result = await think({ task: "repair", input: "answer the schema", schema: okSchema }, deps(dir, spawnImpl, { HH_CASSETTE: "off" }));
    assert.equal(prompts.length, 2);
    assert.match(prompts[1] ?? "", /schema validation/);
    assert.match(prompts[1] ?? "", /expected boolean/);
    assert.equal(result.cassette, "live");
    assert.equal(result.value.ok, true);
    assert.equal(result.inputTokens, 8);
    assert.equal(result.outputTokens, 3);
    assert.equal(result.raw, '{"ok":true}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("two bad answers throw ThinkSchemaError and stop", async () => {
  const dir = tempDir();
  let calls = 0;
  const secret = "xai-fakefakefake123456";
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    const text = calls === 1 ? `{"ok":"${secret}"}` : '{"ok":"still"}';
    return { status: 0, stdout: envelope(text), stderr: "", timedOut: false, errorCode: null };
  };
  try {
    await assert.rejects(
      () => think({ task: "repair", input: "answer", schema: okSchema }, deps(dir, spawnImpl, { HH_CASSETTE: "off" })),
      (error: unknown) => {
        assert.ok(error instanceof ThinkSchemaError);
        assert.equal(error.firstOutput.includes(secret), false);
        assert.match(error.firstOutput, /\[REDACTED\]/);
        assert.match(error.secondOutput, /still/);
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
    assert.equal(calls, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("streaming-json usage is parsed and a direct JSON object validates", async () => {
  const dir = tempDir();
  const stdout = [
    JSON.stringify({ type: "text", data: '{"ok":' }),
    JSON.stringify({ type: "text", data: "true}" }),
    JSON.stringify({ type: "usage", usage: { input_tokens: 5, output_tokens: 2 } }),
    JSON.stringify({ type: "end", stopReason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }),
  ].join("\n");
  const spawnImpl: SpawnLike = async () => ({
    status: 0,
    stdout,
    stderr: "",
    timedOut: false,
    errorCode: null,
  });
  try {
    const result = await think({ task: "stream", input: "go", schema: okSchema }, deps(dir, spawnImpl, { HH_CASSETTE: "off" }));
    assert.equal(result.value.ok, true);
    assert.equal(result.inputTokens, 5);
    assert.equal(result.outputTokens, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the log drops an xai- key, an email, and env values", async () => {
  const dir = tempDir();
  const secret = "xai-fakefakefake123456";
  const email = "person@example.com";
  const sentinel = "hh-sentinel-not-a-key";
  const spawnImpl: SpawnLike = async (request) => {
    assert.equal(Object.hasOwn(request.env, "GROK_HOME"), false);
    assert.equal(request.env, env);
    assert.equal(request.cwd.startsWith(path.join(dir, ".hitchhiker", "tmp")), true);
    assert.equal(request.args.includes("--always-approve"), false);
    return {
      status: 0,
      stdout: envelope('{"ok":true}', { input_tokens: 1, output_tokens: 1 }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  const env: NodeJS.ProcessEnv = { HH_CASSETTE: "off", PATH: "", HH_SENTINEL: sentinel };
  try {
    await think(
      { task: `check ${secret} ${email}`, input: `hello ${secret}`, schema: okSchema },
      deps(dir, spawnImpl, env),
    );
    const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "ai.ndjson"), "utf8");
    assert.equal(log.includes(secret), false);
    assert.equal(log.includes(email), false);
    assert.equal(log.includes(sentinel), false);
    assert.match(log, /\[REDACTED\]/);
    assert.match(log, /"outcome":"ok"/);
    assert.match(log, /"cassette":"live"/);
    assert.equal(log.includes("\r"), false);
    assert.equal(redact(`bearer ${secret}`).includes(secret), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("usage limit and auth errors throw once and do not repair", async () => {
  const dir = tempDir();
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    return { status: 1, stdout: "", stderr: "usage limit reached", timedOut: false, errorCode: null };
  };
  try {
    await assert.rejects(
      () => think({ task: "limit", input: "go", schema: okSchema }, deps(dir, spawnImpl, { HH_CASSETTE: "off" })),
      (error: unknown) => {
        assert.ok(error instanceof GrokUnavailableError);
        assert.match(error.message, /usage limit/);
        return true;
      },
    );
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a timeout throws ThinkTimeoutError and does not repair", async () => {
  const dir = tempDir();
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    return { status: null, stdout: "", stderr: "", timedOut: true, errorCode: null };
  };
  try {
    await assert.rejects(
      () => think({ task: "slow", input: "go", schema: okSchema }, deps(dir, spawnImpl, { HH_CASSETTE: "off" })),
      (error: unknown) => error instanceof ThinkTimeoutError,
    );
    assert.equal(calls, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("grok missing on PATH throws GrokMissingError with the doctor hint", async () => {
  const dir = tempDir();
  try {
    await assert.rejects(
      () =>
        think(
          { task: "missing", input: "go" },
          {
            projectDir: dir,
            cassetteDir: path.join(dir, "cassettes"),
            config: defaultConfig(),
            env: { HH_CASSETTE: "off", PATH: "", PATHEXT: ".EXE" },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GrokMissingError);
        assert.match(error.message, /not on PATH/);
        assert.match(error.message, /hh doctor/);
        assert.equal(error.message.includes("!"), false);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveGrokCommand walks PATH and prefers the PATHEXT order", () => {
  assert.throws(() => resolveGrokCommand({ PATH: "", PATHEXT: ".EXE" }), GrokMissingError);
  const dir = tempDir();
  try {
    if (process.platform === "win32") {
      writeFileSync(path.join(dir, "grok.cmd"), "@echo off\r\n");
      writeFileSync(path.join(dir, "grok.exe"), "");
      const resolved = resolveGrokCommand({ PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" });
      assert.equal(resolved, path.join(dir, "grok.exe"));
      rmSync(path.join(dir, "grok.exe"));
      const cmd = resolveGrokCommand({ PATH: dir, PATHEXT: ".CMD" });
      assert.equal(cmd, path.join(dir, "grok.cmd"));
    } else {
      const file = path.join(dir, "grok");
      writeFileSync(file, "");
      assert.equal(resolveGrokCommand({ PATH: dir }), file);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("timeout kills the child process tree", async () => {
  const dir = tempDir();
  try {
    const output = await spawnGrok({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: dir,
      env: process.env,
      timeoutMs: 400,
    });
    assert.equal(output.timedOut, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a Windows batch shim receives the prompt as an argument", { skip: process.platform === "win32" ? false : "cmd.exe is the Windows shim" }, async () => {
  const dir = tempDir();
  const marker = path.join(dir, "out.txt");
  const script = path.join(dir, "grok.cmd");
  writeFileSync(
    script,
    `@echo off\r\n"${process.execPath}" -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "${marker}" %*\r\n`,
  );
  try {
    const output = await spawnGrok({
      command: script,
      args: ["-p", "hello & echo pwned"],
      cwd: dir,
      env: process.env,
      timeoutMs: 8_000,
    });
    assert.equal(output.timedOut, false);
    const written = JSON.parse(readFileSync(marker, "utf8")) as string[];
    assert.deepEqual(written, ["-p", "hello & echo pwned"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
