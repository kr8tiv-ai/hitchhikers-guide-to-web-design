import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { CommandRunner } from "../src/doctor.ts";
import { runCli } from "../src/main.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const mainSource = path.resolve(here, "../src/main.ts");
const readmePath = path.resolve(here, "../../..", "README.md");

function quietRunner(): { runner: CommandRunner; calls: string[] } {
  const calls: string[] = [];
  const runner: CommandRunner = {
    run(command: string, args: readonly string[]) {
      calls.push(`${command} ${args.join(" ")}`);
      return { status: 0, stdout: "", stderr: "", errorCode: null };
    },
  };
  return { runner, calls };
}

/** Case labels in `dispatchImplemented`, in source order. */
function dispatchedCommands(source: string): string[] {
  const start = source.indexOf("async function dispatchImplemented");
  const end = source.indexOf("export async function runCli", start);
  assert.equal(start >= 0 && end > start, true);
  return [...source.slice(start, end).matchAll(/case "([a-z0-9-]+)":/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Names in the quick start command table. `hh --version` stays in that table. */
function readmeCommandNames(readme: string): string[] {
  const marker = "**Implemented `hh` commands**";
  const start = readme.indexOf(marker);
  const end = readme.indexOf("\n## ", start);
  assert.equal(start >= 0 && end > start, true);
  const names: string[] = [];
  for (const match of readme.slice(start, end).matchAll(/\| `hh ([^`]+)` \|/g)) {
    const name = match[1];
    if (name !== undefined && name.length > 0) names.push(name);
  }
  return names;
}

test("hh --help, hh -h, and hh help list every dispatched command and exit 0", async () => {
  const cases = dispatchedCommands(readFileSync(mainSource, "utf8"));
  assert.equal(cases.length > 0, true);
  const { runner, calls } = quietRunner();
  let expected = "";
  for (const argv of [["--help"], ["-h"], ["help"]] as const) {
    const outcome = await runCli([...argv], runner);
    assert.equal(outcome.exitCode, 0, argv[0]);
    assert.equal(outcome.stderr, undefined);
    if (expected.length === 0) expected = outcome.stdout;
    else assert.equal(outcome.stdout, expected);
  }
  assert.equal(calls.length, 0);
  assert.equal(expected.endsWith("\n"), true);
  assert.equal(expected.includes("!"), false);
  assert.equal(expected.includes("hh doctor [--project <dir>]"), false);
  assert.equal(/^node: /m.test(expected), false);

  const lines = expected.slice(0, -1).split("\n");
  assert.equal(lines[0], "Usage: hh <command>");
  assert.deepEqual(
    lines.slice(1),
    cases.map((command) => `  hh ${command}`),
  );
});

test("an unknown command prints that usage block on stderr and exits 2", async () => {
  const { runner, calls } = quietRunner();
  const help = await runCli(["--help"], runner);
  const before = calls.length;
  const unknown = await runCli(["not-a-command"], runner);
  assert.equal(unknown.exitCode, 2);
  assert.equal(unknown.stdout, "");
  const stderr = unknown.stderr ?? "";
  assert.equal(stderr.includes(help.stdout.trimEnd()), true);
  assert.match(stderr, /^Unknown command: not-a-command$/m);
  assert.match(stderr, /^  hh improve supervise$/m);
  assert.match(stderr, /^  \/hh-dont-panic$/m);
  assert.equal(stderr.includes("!"), false);
  assert.equal(stderr.includes("node:"), false);
  assert.equal(stderr.includes("hh doctor [--project <dir>]"), false);
  assert.equal(calls.length, before);
});

test("every dispatched command is in the help text and the README table", async () => {
  const cases = dispatchedCommands(readFileSync(mainSource, "utf8"));
  const help = await runCli(["--help"]);
  const lines = help.stdout.slice(0, -1).split("\n").slice(1);
  const helpNames = lines.map((line) => line.replace(/^  hh /, ""));
  const readme = readFileSync(readmePath, "utf8");
  const table = readmeCommandNames(readme);
  assert.deepEqual(helpNames, cases);
  for (const command of cases) {
    assert.equal(table.includes(command), true, command);
  }
  const tableCommands = table.filter((name) => !name.startsWith("--") && !name.includes(" "));
  assert.deepEqual(tableCommands, cases);
});
