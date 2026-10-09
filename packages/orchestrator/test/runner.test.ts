import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MODEL,
  MAX_TURNS,
  RunConfigError,
  RunFailed,
  assembledPromptPath,
  buildArgv,
  osArgvLimit,
  runPrompt,
  type RunRequest,
  type SpawnImpl,
} from "../src/runner.ts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const ASSEMBLED = [
  "RULES.md",
  "Say abrasive blasting. No exclamation marks.",
  "",
  "Build the hero from the prompt file.",
  "",
  "@file hh-build-plan/CONTEXT-PACKAGE.v2.md",
  "@file context/sources/xai/cli_headless-scripting.md",
].join("\n");

function ready(over: Partial<RunRequest> = {}): RunRequest {
  return {
    model: DEFAULT_MODEL,
    cwd: path.join(os.tmpdir(), "towel-site"),
    promptText: ASSEMBLED,
    bin: "grok",
    promptPath: path.join(os.tmpdir(), "towel-site", "prompts", "001.md"),
    effort: "high",
    maxTurns: 24,
    sessionMode: "uuid",
    sessionId: UUID_A,
    approved: true,
    ...over,
  };
}

function forbidSpawn(): SpawnImpl {
  return async () => {
    throw new Error("spawn should not run");
  };
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

test("argv carries the headless flags and the assembled prompt", () => {
  const req = ready();
  const argv = buildArgv(req);
  assert.equal(argv.includes("--always-approve"), false);
  assert.equal(argv.includes("--yolo"), false);
  assert.equal(argv.includes("--sandbox"), false);
  assert.equal(argv.includes("--resume"), false);
  assert.equal(argv.includes("--continue"), false);
  assert.equal(argv.includes("-r"), false);
  assert.equal(argv.includes("-c"), false);
  assert.ok(argv.includes("--no-auto-update"));
  assert.ok(argv.includes("--no-alt-screen"));
  assert.equal(argv.includes("--fullscreen"), false);
  assert.equal(flag(argv, "-p"), req.promptText);
  assert.equal(argv.includes(req.promptText), true);
  assert.equal(flag(argv, "-m"), DEFAULT_MODEL);
  assert.equal(flag(argv, "--cwd"), req.cwd);
  assert.equal(flag(argv, "--output-format"), "streaming-json");
  assert.equal(argv.includes("--output-format=streaming-json"), false);
  assert.equal(flag(argv, "--effort"), "high");
  assert.equal(flag(argv, "--max-turns"), "24");
  assert.equal(flag(argv, "--session-id"), UUID_A);
  assert.equal(argv.includes(req.bin), false);
  assert.equal(argv[0], "--no-auto-update");
});

test("a selectable model is passed through and a blank model defaults to grok-4.7", () => {
  assert.equal(flag(buildArgv(ready({ model: "grok-4" })), "-m"), "grok-4");
  assert.equal(flag(buildArgv(ready({ model: "   " })), "-m"), DEFAULT_MODEL);
});

test("alias mode does not pass --session-id", () => {
  const argv = buildArgv(ready({ sessionMode: "alias", sessionId: "hh-towel-001" }));
  assert.equal(argv.includes("--session-id"), false);
  assert.equal(argv.includes("-s"), false);
  assert.equal(argv.includes("hh-towel-001"), false);
});

test("uuid mode without a session id throws before spawn", async () => {
  const req = ready({ sessionMode: "uuid" });
  delete req.sessionId;
  await assert.rejects(() => runPrompt(req, forbidSpawn()), (err: unknown) => {
    assert.ok(err instanceof RunConfigError);
    assert.match(err.message, /sessionId/);
    assert.equal(err.message.includes("spawn should not run"), false);
    return true;
  });
});

test("uuid mode rejects a non-uuid and accepts 8-4-4-4-12 hex", () => {
  assert.throws(() => buildArgv(ready({ sessionId: "hh-towel-001" })), RunConfigError);
  assert.throws(() => buildArgv(ready({ sessionId: "11111111111141118111111111111111" })), RunConfigError);
  assert.throws(() => buildArgv(ready({ sessionId: "" })), RunConfigError);
  const upper = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
  assert.equal(flag(buildArgv(ready({ sessionId: upper })), "--session-id"), upper);
});

test("unknown session mode throws before spawn", async () => {
  await assert.rejects(
    () => runPrompt(ready({ sessionMode: "unknown" }), forbidSpawn()),
    (err: unknown) => {
      assert.ok(err instanceof RunConfigError);
      assert.match(err.message, /Run hh doctor/);
      assert.equal(err.message.includes("spawn should not run"), false);
      return true;
    },
  );
});

test("an unapproved drive does not spawn", async () => {
  const cases: Array<RunRequest["approved"] | string> = [false, "true"];
  for (const approved of cases) {
    let spawned = false;
    await assert.rejects(
      () =>
        runPrompt(
          ready({ approved: approved as RunRequest["approved"] }),
          async () => {
            spawned = true;
            throw new Error("spawn should not run");
          },
        ),
      (err: unknown) => {
        assert.ok(err instanceof RunConfigError);
        assert.match(err.message, /not a yes/);
        return true;
      },
    );
    assert.equal(spawned, false);
  }
});

test("two uuid runs keep the caller ids and those ids differ", async () => {
  const first = randomUUID();
  const second = randomUUID();
  assert.notEqual(first, second);
  const seen: string[] = [];
  const spawn: SpawnImpl = async (argv) => {
    const id = flag(argv, "--session-id");
    assert.equal(typeof id, "string");
    seen.push(id ?? "");
    return { code: 0, stderr: "" };
  };
  await runPrompt(ready({ sessionId: first }), spawn);
  await runPrompt(ready({ sessionId: second }), spawn);
  assert.deepEqual(seen, [first, second]);
});

test("a non-zero exit throws with the path and trimmed stderr, not the prompt", async () => {
  const promptText = "ASSEMBLED_RULES_AND_PROMPT_TOKEN";
  const req = ready({ promptText });
  const stderr = `  \nhead ${promptText} ${"e".repeat(2_500)}\n  `;
  await assert.rejects(
    () => runPrompt(req, async () => ({ code: 7, stderr })),
    (err: unknown) => {
      assert.ok(err instanceof RunFailed);
      assert.equal(err.name, "RunFailed");
      assert.equal(err.code, 7);
      assert.equal(err.promptPath, req.promptPath);
      assert.equal(err.message.includes(req.promptPath), true);
      assert.equal(err.message.includes(promptText), false);
      assert.equal(err.stderr.includes(promptText), false);
      assert.equal(err.stderr.length, 2_000);
      assert.equal(err.stderr.startsWith("head "), true);
      assert.equal(err.stderr.includes("[prompt omitted]"), true);
      return true;
    },
  );
});

test("exit code 0 resolves and leaves stderr off the success path", async () => {
  const value = await runPrompt(ready(), async () => ({ code: 0, stderr: "noise" }));
  assert.equal(value, undefined);
});

test("maxTurns under 1 or over 80 throws, and the edges spawn", async () => {
  for (const maxTurns of [0, -1, 81, 1.5]) {
    await assert.rejects(() => runPrompt(ready({ maxTurns }), forbidSpawn()), RunConfigError);
  }
  for (const maxTurns of [1, MAX_TURNS]) {
    const argv = buildArgv(ready({ maxTurns }));
    assert.equal(flag(argv, "--max-turns"), String(maxTurns));
  }
});

test("effort low throws before spawn", async () => {
  const req = ready({ effort: "low" as RunRequest["effort"] });
  await assert.rejects(() => runPrompt(req, forbidSpawn()), (err: unknown) => {
    assert.ok(err instanceof RunConfigError);
    assert.match(err.message, /medium, high, or xhigh/);
    return true;
  });
  for (const effort of ["medium", "high", "xhigh"] as const) {
    assert.equal(flag(buildArgv(ready({ effort })), "--effort"), effort);
  }
});

test("a bin with a space stays one argv entry and buildArgv omits it", async () => {
  const bin = ["C:", "Program Files", "Grok", "grok.exe"].join(path.sep);
  assert.equal(bin.includes(" "), true);
  const req = ready({ bin });
  const flags = buildArgv(req);
  assert.equal(flags.includes(bin), false);
  assert.equal(flags.some((part) => part.includes("Program Files")), false);
  let received: string[] = [];
  await runPrompt(req, async (argv) => {
    received = argv;
    return { code: 0, stderr: "" };
  });
  assert.equal(received[0], bin);
  assert.deepEqual(received.slice(1), flags);
  assert.equal(received.filter((part) => part === bin).length, 1);
});

test("a prompt over the OS argv limit uses --prompt-file and records the path", async () => {
  const promptText = `RULES.md\n\n${"R".repeat(osArgvLimit())}\n\n@file context/sources/xai/cli_headless-scripting.md\n`;
  const req = ready({
    promptText,
    promptPath: path.join(os.tmpdir(), "towel-site", "prompts", "over-limit.md"),
    sessionMode: "alias",
    sessionId: UUID_B,
  });
  const flags = buildArgv(req);
  assert.equal(flags.includes("-p"), false);
  assert.equal(flags.includes(promptText), false);
  assert.equal(flag(flags, "--prompt-file"), assembledPromptPath(req));
  assert.equal(flag(flags, "-m"), DEFAULT_MODEL);
  assert.equal(flag(flags, "--cwd"), req.cwd);
  const recorded = flag(flags, "--prompt-file");
  assert.equal(typeof recorded, "string");
  assert.equal(path.isAbsolute(recorded ?? ""), true);
  assert.equal((recorded ?? "").startsWith(os.tmpdir()), true);
  assert.equal(existsSync(recorded ?? ""), false);

  let spawnArgv: string[] = [];
  try {
    await runPrompt(req, async (argv) => {
      spawnArgv = argv;
      return { code: 0, stderr: "" };
    });
    const written = flag(spawnArgv, "--prompt-file");
    assert.equal(written, recorded);
    assert.equal(spawnArgv[0], req.bin);
    assert.equal(readFileSync(written ?? "", "utf8"), promptText);
  } finally {
    if (recorded !== undefined) rmSync(recorded, { force: true });
  }
});

test("readImpl false blocks spawn and does not write a prompt file", async () => {
  const promptText = `RULES.md\n${"Q".repeat(osArgvLimit())}`;
  const req = ready({
    promptText,
    promptPath: path.join(os.tmpdir(), "towel-site", "prompts", "missing.md"),
    sessionMode: "alias",
  });
  const recorded = assembledPromptPath(req);
  let spawned = false;
  let sawPath = "";
  await assert.rejects(
    () =>
      runPrompt(
        req,
        async () => {
          spawned = true;
          throw new Error("spawn should not run");
        },
        async (promptPath) => {
          sawPath = promptPath;
          return false;
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof RunConfigError);
      assert.equal(err.message.includes(req.promptPath), true);
      assert.equal(err.message.includes(promptText), false);
      return true;
    },
  );
  assert.equal(spawned, false);
  assert.equal(sawPath, req.promptPath);
  assert.equal(existsSync(recorded), false);
});

test("readImpl true confirms the path and a missing readImpl does not touch the disk", async () => {
  const seen: string[] = [];
  const req = ready({ promptPath: path.join(os.tmpdir(), "no-such-guide-prompt-096.md") });
  assert.equal(existsSync(req.promptPath), false);
  await runPrompt(req, async () => ({ code: 0, stderr: "" }));
  await runPrompt(
    req,
    async () => ({ code: 0, stderr: "" }),
    (promptPath) => {
      seen.push(promptPath);
      return true;
    },
  );
  assert.deepEqual(seen, [req.promptPath]);
});

test("the runner does not spawn a process or mint a session id", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/runner.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("randomUUID"), false);
  assert.equal(source.includes("--always-approve"), false);
});
