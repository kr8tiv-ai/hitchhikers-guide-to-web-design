/**
 * 250c: the live build runner starts grok.cmd through cmd.exe on Windows.
 * A bare CreateProcess of a .cmd shim fails with EINVAL. grok.exe and
 * non-Windows launches stay a direct spawn.
 */
import assert from "node:assert/strict";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { buildSpawnArgs, spawnLiveBuild, type BuildSpawnRequest } from "../src/guide/site-build.ts";
import { quoteCmdArg } from "../src/tool-install/win-spawn.ts";

const CWD = "C:\\hh-no-such-build-250c\\My Site";
const PROMPT = "C:\\hh-no-such-build-250c\\My Site\\prompts\\001.md";
const COMSPEC = "D:\\Tools\\cmd.exe";

interface SpawnCall {
  command: string;
  args: readonly string[];
  options: SpawnOptions;
}

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.kill = () => true;
  return child;
}

function recordingSpawn(calls: SpawnCall[]): typeof import("node:child_process").spawn {
  const impl = (command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess => {
    calls.push({ command, args: args ?? [], options: options ?? {} });
    return fakeChild();
  };
  return impl as typeof import("node:child_process").spawn;
}

function request(args: readonly string[]): BuildSpawnRequest {
  return {
    command: "grok",
    args,
    cwd: CWD,
    promptId: "001",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
  };
}

function capture(platform: NodeJS.Platform, command: string, env: NodeJS.ProcessEnv): SpawnCall {
  const calls: SpawnCall[] = [];
  const args = buildSpawnArgs(CWD, PROMPT);
  spawnLiveBuild(command, request(args), env, { platform, spawnImpl: recordingSpawn(calls) });
  const call = calls[0];
  assert.ok(call, "build runner did not spawn");
  return call;
}

test("win32 grok.cmd build runner spawns ComSpec with quoted build args", () => {
  const command = "C:\\Program Files\\grok.cmd";
  const call = capture("win32", command, { ComSpec: COMSPEC, PATH: "", Path: "" });
  const args = buildSpawnArgs(CWD, PROMPT);
  const line = call.args[3] ?? "";
  assert.equal(call.command, COMSPEC);
  assert.deepEqual(call.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.equal(call.args.length, 4);
  assert.equal(call.options.windowsVerbatimArguments, true);
  assert.match(line, /--prompt-file "C:\\hh-no-such-build-250c\\My Site\\prompts\\001.md"/);
  assert.match(line, /--cwd "C:\\hh-no-such-build-250c\\My Site"/);
  assert.equal(line, `"${[command, ...args].map((arg) => quoteCmdArg(arg)).join(" ")}"`);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(call.options.windowsHide, true);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.cwd, CWD);

  const fallback = capture("win32", command, { PATH: "", Path: "" });
  assert.equal(fallback.command, "cmd.exe");
  assert.equal(fallback.options.windowsVerbatimArguments, true);
});

test("a grok.exe path still spawns directly on win32", () => {
  const command = "C:\\Program Files\\grok.exe";
  const call = capture("win32", command, { ComSpec: COMSPEC });
  const args = buildSpawnArgs(CWD, PROMPT);
  assert.equal(call.command, command);
  assert.deepEqual(call.args, args);
  assert.equal(call.options.windowsVerbatimArguments, undefined);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(call.options.shell, false);
});

test("non-win32 build runner spawns grok.cmd directly", () => {
  const command = "/usr/local/bin/grok.cmd";
  const cwd = "/home/todd/My Site";
  const prompt = "/home/todd/My Site/prompts/001.md";
  const args = buildSpawnArgs(cwd, prompt);
  const calls: SpawnCall[] = [];
  spawnLiveBuild(command, { ...request(args), cwd }, { PATH: "/usr/bin" }, {
    platform: "linux",
    spawnImpl: recordingSpawn(calls),
  });
  const call = calls[0];
  assert.ok(call, "build runner did not spawn");
  assert.equal(call.command, command);
  assert.deepEqual(call.args, args);
  assert.equal(call.options.windowsVerbatimArguments, undefined);
  assert.equal(call.options.shell, false);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
});
