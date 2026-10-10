import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IMPLEMENTED_COMMANDS,
  renderCommandTable,
  skillOnlySlashCommands,
} from "../src/commands-table.ts";
import { nodeIsSupported, type CommandRunner } from "../src/doctor.ts";
import { cliEntryArgs, runCli } from "../src/main.ts";

const DOCTOR_REPORT =
  /^node: |^git: |^grok: |^auth: |^session-id: |^effort: |^warning: |playwright: not installed/m;

const pluginSkills = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "grok-plugin",
  "skills",
);

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

test("hh drive and hh dont-panic exit 2 with the command table", async () => {
  for (const name of ["drive", "dont-panic"]) {
    const { runner, calls } = quietRunner();
    const outcome = await runCli([name], runner);
    assert.equal(outcome.exitCode, 2);
    assert.equal(outcome.stdout, "");
    assert.equal(outcome.stderr, renderCommandTable(name));
    assert.deepEqual(calls, []);
    const output = `${outcome.stdout}${outcome.stderr ?? ""}`;
    for (const command of IMPLEMENTED_COMMANDS) {
      assert.match(output, new RegExp(`^  hh ${command}$`, "m"));
    }
    assert.match(output, /^  \/hh-dont-panic$/m);
    assert.match(output, /^  \/hh-drive$/m);
    assert.equal(DOCTOR_REPORT.test(output), false);
    assert.equal(output.includes("hh doctor [--project <dir>]"), false);
    assert.equal(output.includes("!"), false);
    assert.equal(output.includes("\u2014"), false);
  }
});

test("the table lists every skill-only slash command from the plugin", () => {
  const skills = skillOnlySlashCommands();
  const expected = skillOnlyFromDisk(pluginSkills);
  assert.deepEqual(skills, expected);
  assert.equal(skills.includes("hh-dont-panic"), true);
  assert.equal(skills.includes("hh-drive"), true);
  assert.equal(skills.includes("hh-help"), true);
  assert.equal(skills.includes("hh-doctor"), false);
  assert.equal(skills.includes("hh-dashboard"), false);
  assert.equal(skills.includes("hh-assets"), false);
  assert.equal(skills.includes("guide-persona"), false);

  const table = renderCommandTable("sessions");
  for (const command of IMPLEMENTED_COMMANDS) {
    assert.match(table, new RegExp(`^  hh ${command}$`, "m"));
  }
  for (const name of skills) {
    assert.match(table, new RegExp(`^  /${name}$`, "m"));
  }
  assert.equal(table.includes("!"), false);
  assert.equal(DOCTOR_REPORT.test(table), false);
});

test("a fixture plugin supplies the skill-only list", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hh-commands-"));
  try {
    const skills = path.join(root, "skills");
    writeSkill(skills, "hh-zeta", true, "This command is not implemented in the hh CLI yet.\n");
    writeSkill(skills, "hh-alpha", true, "This command is not implemented in the hh CLI yet.\r\n");
    writeSkill(skills, "hh-doctor", true, "Run `hh doctor`.\n");
    writeSkill(skills, "guide-persona", false, "This command is not implemented in the hh CLI yet.\n");
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(
      path.join(root, "src", "commands.ts"),
      [
        "export const SKILL_NAMES: readonly string[] = [",
        '  "hh-zeta",',
        '  "hh-alpha",',
        '  "hh-doctor",',
        '  "guide-persona",',
        "];",
        "",
      ].join("\n"),
      "utf8",
    );
    assert.deepEqual(skillOnlySlashCommands(skills), ["hh-zeta", "hh-alpha"]);
    const table = renderCommandTable("zeta", skills);
    assert.match(table, /Unknown command: zeta/);
    assert.match(table, /^  \/hh-zeta$/m);
    assert.match(table, /^  \/hh-alpha$/m);
    assert.equal(table.includes("/hh-doctor"), false);
    assert.equal(table.includes("/guide-persona"), false);
    for (const command of IMPLEMENTED_COMMANDS) {
      assert.match(table, new RegExp(`^  hh ${command}$`, "m"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("implemented names are the dispatch cases in main.ts", () => {
  const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  const start = source.indexOf("async function dispatchImplemented");
  const end = source.indexOf("export async function runCli", start);
  assert.equal(start >= 0 && end > start, true);
  const cases = [...source.slice(start, end).matchAll(/case "([a-z0-9-]+)":/g)].map(
    (match) => match[1] ?? "",
  );
  assert.deepEqual(cases, [...IMPLEMENTED_COMMANDS]);
  assert.equal(IMPLEMENTED_COMMANDS.length, 10);
});

test("hh doctor still runs and hh --help stays the usage line", async () => {
  const { runner, calls } = quietRunner();
  const known = await runCli(["doctor"], runner);
  assert.equal(known.exitCode, nodeIsSupported(process.version) ? 0 : 1);
  assert.match(known.stdout, /^node: /);
  assert.equal(calls.some((line) => line.startsWith("git ")), true);
  assert.equal(known.stdout.includes("!"), false);

  const before = calls.length;
  const help = await runCli(["--help"], runner);
  assert.equal(help.exitCode, 2);
  assert.equal(help.stdout, "hh doctor [--project <dir>]\n");
  assert.equal(help.stderr, undefined);
  assert.equal(calls.length, before);

  const doctorHelp = await runCli(["doctor", "--help"], runner);
  assert.equal(doctorHelp.exitCode, 2);
  assert.equal(doctorHelp.stdout, "hh doctor [--project <dir>]\n");
  assert.equal(calls.length, before);

  const bare = await runCli([]);
  assert.equal(bare.exitCode, 2);
  assert.equal(bare.stdout, "hh doctor [--project <dir>]\n");
  assert.deepEqual(cliEntryArgs([]), ["app"]);
});

function writeSkill(skills: string, name: string, userInvocable: boolean, body: string): void {
  const dir = path.join(skills, name);
  mkdirSync(dir, { recursive: true });
  const flag = userInvocable ? "true" : "false";
  writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Fixture skill.\nuser-invocable: ${flag}\n---\n\n${body}`,
    "utf8",
  );
}

/** Independent read of the same files, so the renderer cannot grade its own homework. */
function skillOnlyFromDisk(skillsDir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const text = readFileSync(path.join(skillsDir, entry.name, "SKILL.md"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const close = text.indexOf("\n---\n", 3);
    if (!text.startsWith("---\n") || close < 0) continue;
    const front = text.slice(0, close);
    if (!front.split("\n").includes("user-invocable: true")) continue;
    const body = text.slice(close + 5);
    if (!body.includes("not implemented")) continue;
    const nameLine = front.split("\n").find((line) => line.startsWith("name:"));
    const name = nameLine?.slice("name:".length).trim() ?? "";
    if (name.length > 0) names.push(name);
  }
  const order = skillNameOrder(path.resolve(skillsDir, "..", "src", "commands.ts"));
  const rank = new Map(order.map((name, index) => [name, index]));
  names.sort((left, right) => {
    const leftRank = rank.get(left);
    const rightRank = rank.get(right);
    if (leftRank === undefined && rightRank === undefined) return left < right ? -1 : left > right ? 1 : 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
  return names;
}

function skillNameOrder(commandsFile: string): string[] {
  const text = readFileSync(commandsFile, "utf8");
  const start = text.indexOf("export const SKILL_NAMES");
  const equals = text.indexOf("=", start);
  const open = text.indexOf("[", equals);
  const close = text.indexOf("]", open + 1);
  const names: string[] = [];
  for (const match of text.slice(open + 1, close).matchAll(/"([^"]+)"/g)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}
