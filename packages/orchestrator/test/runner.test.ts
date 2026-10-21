import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { driveElevatePicks, type ElevateDrivePick } from "../src/elevate-drive.ts";
import { loadQueue } from "../src/queue-file.ts";
import {
  DEFAULT_MODEL,
  MAX_TURNS,
  RunConfigError,
  RunFailed,
  assembledPromptPath,
  buildArgv,
  osArgvLimit,
  runElevatePicks,
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
  assert.match(source, /export async function runElevatePicks/);
});

function aliasRequest(promptPath: string, promptText = ASSEMBLED): RunRequest {
  const req = ready({
    promptPath,
    promptText,
    sessionMode: "alias",
    effort: "xhigh",
    maxTurns: null,
  });
  delete req.sessionId;
  return req;
}

test("an empty elevate list does not spawn or commit", async () => {
  let spawned = 0;
  let committed = 0;
  const result = await runElevatePicks(
    [],
    async () => {
      spawned += 1;
      return { code: 0, stderr: "" };
    },
    async () => {
      committed += 1;
    },
  );
  assert.deepEqual(result, { ran: 0, committed: 0 });
  assert.equal(spawned, 0);
  assert.equal(committed, 0);
});

test("a failed elevate prompt does not commit and stops the next one", async () => {
  const first = aliasRequest(path.join(os.tmpdir(), "r1-01.md"));
  const second = aliasRequest(path.join(os.tmpdir(), "r1-02.md"), "Second upgrade.");
  const saved: string[] = [];
  let spawned = 0;
  await assert.rejects(
    () =>
      runElevatePicks(
        [first, second],
        async () => {
          spawned += 1;
          if (spawned === 1) return { code: 4, stderr: "nope" };
          return { code: 0, stderr: "" };
        },
        async (req) => {
          saved.push(req.promptPath);
        },
      ),
    (error: unknown) => error instanceof RunFailed,
  );
  assert.deepEqual(saved, []);
  assert.equal(spawned, 1);
});

function gitText(args: readonly string[], attempt = 0): Promise<string> {
  const bin = args[0];
  if (bin === undefined) return Promise.reject(new Error("missing git"));
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args.slice(1),
      hiddenChildOptions({ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr ?? "").trim();
          const message = detail.length > 0 ? detail : error.message;
          if (attempt < 5 && /permission denied|unable to write file|index\.lock|updating files failed/i.test(message)) {
            setTimeout(() => {
              gitText(args, attempt + 1).then(resolve, reject);
            }, 200 * (attempt + 1));
            return;
          }
          reject(new Error(message));
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

function git(dir: string, args: readonly string[]): Promise<string> {
  return gitText(["git", "-C", dir, ...args]);
}

async function tempRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-drive-"));
  await git(dir, ["init"]);
  const hooks = path.join(dir, ".git", "hh-hooks");
  mkdirSync(hooks);
  await git(dir, ["config", "core.hooksPath", hooks]);
  await git(dir, ["config", "user.email", "guide-test@example.com"]);
  await git(dir, ["config", "user.name", "Guide Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await git(dir, ["config", "core.autocrlf", "false"]);
  await git(dir, ["config", "core.fscache", "false"]);
  writeFileSync(path.join(dir, "README.md"), "seed\n");
  await git(dir, ["add", "README.md"]);
  await git(dir, ["commit", "-m", "start"]);
  return dir;
}

function picksFor(dir: string, ids: readonly string[]): ElevateDrivePick[] {
  return ids.map((id) => {
    const promptPath = path.join(dir, ".hitchhiker", "prompts", "elevate", `${id}.md`);
    const promptText = `Apply only this upgrade.\n\n${id}\n`;
    mkdirSync(path.dirname(promptPath), { recursive: true });
    writeFileSync(promptPath, promptText);
    return { id, promptPath, promptText };
  });
}

test("an empty pick list commits nothing and writes no queue", async () => {
  const dir = await tempRepo();
  try {
    let spawned = 0;
    const result = await driveElevatePicks(dir, [], {
      bin: "fixture-spawn",
      spawnImpl: async () => {
        spawned += 1;
        return { code: 0, stderr: "" };
      },
    });
    assert.deepEqual(result, { enqueued: 0, committed: 0 });
    assert.equal(spawned, 0);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), false);
    assert.equal((await git(dir, ["rev-list", "--count", "HEAD"])).trim(), "1");
    assert.equal((await git(dir, ["log", "-1", "--format=%s"])).trim(), "start");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("each accepted pick is one prompt and one commit", async () => {
  const dir = await tempRepo();
  try {
    const picks = picksFor(dir, ["r1-01", "r1-02"]);
    let calls = 0;
    const argvSeen: string[][] = [];
    const result = await driveElevatePicks(dir, picks, {
      bin: "fixture-spawn",
      spawnImpl: async (argv) => {
        argvSeen.push([...argv]);
        calls += 1;
        writeFileSync(path.join(dir, `site-${calls}.txt`), `${calls}\n`);
        return { code: 0, stderr: "" };
      },
    });
    assert.deepEqual(result, { enqueued: 2, committed: 2 });
    assert.equal(calls, 2);
    assert.equal(argvSeen.length, 2);
    for (const argv of argvSeen) {
      assert.equal(argv[0], "fixture-spawn");
      assert.equal(argv.includes("--always-approve"), false);
      assert.equal(argv.includes("--session-id"), false);
      assert.equal(argv[argv.indexOf("--effort") + 1], "xhigh");
    }
    assert.equal((await git(dir, ["rev-list", "--count", "HEAD"])).trim(), "3");
    assert.equal((await git(dir, ["log", "--format=%s"])).trim().split(/\r?\n/).join("\n"), "r1-02\nr1-01\nstart");
    const queue = await loadQueue(dir);
    assert.deepEqual(
      queue?.items.map((entry) => ({ id: entry.id, kind: entry.kind, status: entry.status })),
      [
        { id: "r1-01", kind: "build", status: "passed" },
        { id: "r1-02", kind: "build", status: "passed" },
      ],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed pick saves nothing for that prompt and says so in plain words", async () => {
  const dir = await tempRepo();
  try {
    const picks = picksFor(dir, ["r1-01", "r1-02"]);
    let calls = 0;
    await assert.rejects(
      () =>
        driveElevatePicks(dir, picks, {
          bin: "fixture-spawn",
          spawnImpl: async () => {
            calls += 1;
            if (calls === 1) {
              writeFileSync(path.join(dir, "site-1.txt"), "one\n");
              return { code: 0, stderr: "noise" };
            }
            return { code: 7, stderr: "Prompt run failed with exit 7" };
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "This improvement did not finish, so it was not saved.");
        assert.equal(/exit|spawn|json|git|queue/i.test(error.message), false);
        return true;
      },
    );
    assert.equal(calls, 2);
    assert.equal((await git(dir, ["rev-list", "--count", "HEAD"])).trim(), "2");
    assert.equal((await git(dir, ["log", "-1", "--format=%s"])).trim(), "r1-01");
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.items[1]?.status, "failed");
    assert.equal(queue?.items.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
