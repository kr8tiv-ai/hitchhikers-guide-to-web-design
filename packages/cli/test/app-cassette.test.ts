import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { closeActiveApp } from "../src/commands/app.ts";
import { runCli } from "../src/main.ts";
import type { CommandRunner } from "../src/doctor.ts";

const REPLAY_REFUSAL =
  "HH_CASSETTE=replay is set in this shell. The Guide would only replay recorded answers. Clear it (Remove-Item Env:HH_CASSETTE) or pass --cassette to keep it.\n";

function quietRunner(): CommandRunner {
  return {
    run() {
      return { status: null, stdout: "", stderr: "", errorCode: "ENOENT" };
    },
  };
}

test("hh app refuses HH_CASSETTE outside a test and does not open a browser", async () => {
  let opened = 0;
  const open = async (): Promise<boolean> => {
    opened += 1;
    return true;
  };
  const replay = await runCli(["app", "--project", tmpdir()], undefined, {
    env: { HH_CASSETTE: "replay" },
    open,
  });
  assert.equal(replay.exitCode, 2);
  assert.equal(replay.stdout, "");
  assert.equal(replay.stderr, REPLAY_REFUSAL);
  assert.equal(opened, 0);

  const recorded = await runCli(["app"], undefined, {
    env: { HH_CASSETTE: "record" },
    open,
  });
  assert.equal(recorded.exitCode, 2);
  assert.match(recorded.stderr ?? "", /HH_CASSETTE=record is set in this shell/);
  assert.match(recorded.stderr ?? "", /Remove-Item Env:HH_CASSETTE/);
  assert.match(recorded.stderr ?? "", /--cassette/);
  assert.equal(recorded.stdout, "");
  assert.equal(opened, 0);

  const help = await runCli(["app", "--help"], undefined, {
    env: { HH_CASSETTE: "replay" },
    open,
  });
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /--cassette/);
  assert.match(help.stdout, /HH_ALLOW_CASSETTE=1/);
  assert.equal(help.stderr ?? "", "");
  assert.equal(opened, 0);
});

test("hh app starts when cassette mode is opted in and the desk says so", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-cassette-"));
  let opened = 0;
  const open = async (): Promise<boolean> => {
    opened += 1;
    return true;
  };
  try {
    const flagged = await runCli(["app", "--cassette", "--project", dir, "--port", "0"], undefined, {
      env: { HH_CASSETTE: "replay" },
      open,
    });
    assert.equal(flagged.exitCode, 0, flagged.stderr);
    assert.equal(opened, 1);
    assert.match(flagged.stdout, /^http:\/\/127\.0\.0\.1:\d+\/\n$/);
    const flaggedPage = await fetch(flagged.stdout.trim());
    assert.equal(flaggedPage.status, 200);
    assert.match(await flaggedPage.text(), /Replay mode: answers come from recorded cassettes\./);
    await closeActiveApp();

    opened = 0;
    const allowed = await runCli(["app", "--no-open", "--project", dir, "--port", "0"], undefined, {
      env: { HH_CASSETTE: "replay", HH_ALLOW_CASSETTE: "1" },
      open,
    });
    assert.equal(allowed.exitCode, 0, allowed.stderr);
    assert.equal(opened, 0);
    const allowedHtml = await (await fetch(firstUrl(allowed.stdout))).text();
    assert.match(allowedHtml, /Replay mode: answers come from recorded cassettes\./);
    await closeActiveApp();

    const recorded = await runCli(
      ["app", "--cassette", "--no-open", "--project", dir, "--port", "0"],
      undefined,
      { env: { HH_CASSETTE: "record" }, open },
    );
    assert.equal(recorded.exitCode, 0, recorded.stderr);
    const recordedHtml = await (await fetch(firstUrl(recorded.stdout))).text();
    assert.match(recordedHtml, /Record mode: answers are written to cassettes\./);
    await closeActiveApp();

    const quiet = await runCli(["app", "--no-open", "--project", dir, "--port", "0"], undefined, {
      env: { HH_CASSETTE: "replay", NODE_TEST_CONTEXT: "child" },
      open,
    });
    assert.equal(quiet.exitCode, 0, quiet.stderr);
    const quietHtml = await (await fetch(firstUrl(quiet.stdout))).text();
    assert.equal(quietHtml.includes("Replay mode:"), false);
    await closeActiveApp();
  } finally {
    await closeActiveApp();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hh doctor reports cassette off or a shell replay without failing", async () => {
  const runner = quietRunner();
  const off = await runCli(["doctor"], runner, { env: {} });
  assert.equal(off.exitCode, 0);
  assert.match(off.stdout, /^cassette: off$/m);

  const replay = await runCli(["doctor"], runner, { env: { HH_CASSETTE: "replay" } });
  assert.equal(replay.exitCode, 0);
  assert.match(replay.stdout, /^cassette: replay \(set in this shell\)$/m);
  assert.equal(replay.stdout.includes("warning: cassette:"), false);
});

function firstUrl(stdout: string): string {
  const line = stdout.split("\n").find((item) => item.startsWith("http://"));
  if (line === undefined) throw new Error(`no desk url\n${stdout}`);
  return line.trim();
}
