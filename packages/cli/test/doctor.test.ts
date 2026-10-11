import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ConfigError,
  LockHeld,
  STATE_LOCK_NAME,
  defaultConfig,
  loadConfig,
  saveConfig,
} from "@hitchhiker/engine";
import {
  doctor,
  formatDoctor,
  nodeIsSupported,
  spawnCommand,
  type CommandResult,
  type CommandRunner,
} from "../src/doctor.ts";
import { parseArgs, runCli } from "../src/main.ts";

const UUID_HELP = "-s, --session-id <UUID>\nUse a UUID for a new session.\n";
const ALIAS_HELP = "-s, --session-id <ID>\nCreate or resume a session name.\n--effort <LEVEL>\n";
const BOTH_HELP = "-s, --session-id <UUID>\nA session name is also shown here.\n";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-doctor-"));
}

function command(status: number | null, stdout = "", stderr = "", errorCode: string | null = null): CommandResult {
  return { status, stdout, stderr, errorCode };
}

function scripted(map: Record<string, CommandResult>): CommandRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run(commandName, args) {
      const key = [commandName, ...args].join(" ");
      calls.push(key);
      return map[key] ?? command(null, "", "", "ENOENT");
    },
  };
}

function gitOk(): Record<string, CommandResult> {
  return { "git --version": command(0, "git version 2.49.0\n") };
}

test("formatDoctor points a missing tool at the desk Install button", () => {
  const text = formatDoctor(
    {
      nodeOk: true,
      nodeVersion: "22.14.0",
      gitOk: true,
      grokOnPath: false,
      grokVersion: null,
      auth: "skipped",
      sessionIdMode: "unknown",
      effortFlag: false,
      cassette: "off",
      warnings: ["session probe skipped", "playwright: not installed", "whisper: not installed", "pdftotext: not installed"],
    },
    {
      platform: "linux",
      arch: "x64",
      managers: ["apt-get"],
      dataDir: "/var/hitchhiker/tools",
      browsersDir: "/var/cache/ms-playwright",
      workspaceDir: "/work/guide",
    },
  );
  assert.match(text, /^hint: Install pdftotext from the desk Install button\. Manual: sudo apt-get install -y poppler-utils$/m);
  assert.match(text, /^hint: Install grok from the desk Install button\. Manual: curl -fsSL https:\/\/x\.ai\/cli\/install\.sh \| bash$/m);
  assert.equal(text.includes("!"), false);
  assert.equal(text.includes("/var/hitchhiker"), false);
});

test("nodeIsSupported accepts major 22 and above", () => {
  assert.equal(nodeIsSupported("22.0.0"), true);
  assert.equal(nodeIsSupported("v22.0.0"), true);
  assert.equal(nodeIsSupported("v23.1.4"), true);
  assert.equal(nodeIsSupported("v21.9.9"), false);
  assert.equal(nodeIsSupported("18.20.4"), false);
  assert.equal(nodeIsSupported("v18.0.0"), false);
  assert.equal(nodeIsSupported(""), false);
  assert.equal(nodeIsSupported("not-a-version"), false);
});

test("saveConfig round-trips and uses the lock", async () => {
  const dir = tempDir();
  try {
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
    const written = {
      ...defaultConfig(),
      effort: "high" as const,
      sessionIdMode: "alias" as const,
    };
    await saveConfig(dir, written);
    assert.deepEqual(loadConfig(dir), written);
    const filePath = path.join(dir, ".hitchhiker", "config.json");
    const raw = readFileSync(filePath, "utf8");
    assert.equal(raw.includes("\r"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", `config.json.tmp-${process.pid}`)), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STATE_LOCK_NAME)), false);

    writeFileSync(
      path.join(dir, ".hitchhiker", STATE_LOCK_NAME),
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    const before = readFileSync(filePath, "utf8");
    await assert.rejects(
      () => saveConfig(dir, { ...written, effort: "xhigh" }),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, process.pid);
        return true;
      },
    );
    assert.equal(readFileSync(filePath, "utf8"), before);
    assert.equal(loadConfig(dir).effort, "high");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saveConfig refuses a key parseConfig would reject and writes nothing", async () => {
  const dir = tempDir();
  try {
    const bad = { ...defaultConfig(), gsapFallback: true };
    await assert.rejects(
      () => saveConfig(dir, bad as ReturnType<typeof defaultConfig>),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.field, "gsapFallback");
        return true;
      },
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing grok is a warning and the probe is skipped", async () => {
  const run = scripted(gitOk());
  const outcome = await doctor({ nodeVersion: "v22.0.0", runner: run });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.report.nodeOk, true);
  assert.equal(outcome.report.nodeVersion, "22.0.0");
  assert.equal(outcome.report.gitOk, true);
  assert.equal(outcome.report.grokOnPath, false);
  assert.equal(outcome.report.grokVersion, null);
  assert.equal(outcome.report.auth, "skipped");
  assert.equal(outcome.report.sessionIdMode, "unknown");
  assert.equal(outcome.report.effortFlag, false);
  assert.ok(outcome.report.warnings.includes("session probe skipped"));
  assert.ok(outcome.report.warnings.includes("playwright: not installed"));
  assert.ok(outcome.report.warnings.includes("whisper: not installed"));
  assert.ok(outcome.report.warnings.includes("pdftotext: not installed"));
  const text = formatDoctor(outcome.report);
  assert.match(text, /^node: 22\.0\.0 ok$/m);
  assert.match(text, /^git: ok$/m);
  assert.match(text, /^grok: not on PATH$/m);
  assert.match(text, /^auth: skipped$/m);
  assert.match(text, /^session-id: unknown$/m);
  assert.match(text, /^playwright: not installed$/m);
  assert.match(text, /^whisper: not installed$/m);
  assert.match(text, /^pdftotext: not installed$/m);
  assert.equal(text.includes("!"), false);
  assert.equal(run.calls.includes("grok --version"), true);
  assert.equal(run.calls.includes("grok --help"), false);
  assert.equal(run.calls.some((call) => call.includes("--always-approve")), false);
  assert.equal(run.calls.some((call) => call.startsWith("grok -p")), false);
  assert.equal(run.calls.some((call) => call.startsWith("which")), false);
  if (os.platform() === "win32") assert.ok(run.calls.includes("where.exe grok"));
  else assert.equal(run.calls.includes("where.exe grok"), false);
});

test("missing git warns and still exits 0 when node is supported", async () => {
  const outcome = await doctor({ nodeVersion: "22.1.0", runner: scripted({}) });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.report.gitOk, false);
  assert.ok(outcome.report.warnings.includes("git is not on PATH"));
  assert.match(formatDoctor(outcome.report), /^git: not on PATH$/m);
  assert.equal(formatDoctor(outcome.report).includes("!"), false);
});

test("an old node version exits 1", async () => {
  const outcome = await doctor({
    nodeVersion: "v18.20.4",
    runner: scripted(gitOk()),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.report.nodeOk, false);
  assert.equal(outcome.report.nodeVersion, "18.20.4");
  assert.match(formatDoctor(outcome.report), /^node: 18\.20\.4 too old$/m);
});

test("grok --help that exits non-zero still classifies stdout and stderr", async () => {
  const run = scripted({
    ...gitOk(),
    "grok --version": command(1, "", "no"),
    "grok --help": command(2, "", UUID_HELP),
  });
  const outcome = await doctor({ nodeVersion: "v22.0.0", runner: run });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.report.grokOnPath, true);
  assert.equal(outcome.report.grokVersion, null);
  assert.equal(outcome.report.sessionIdMode, "uuid");
  assert.equal(outcome.report.effortFlag, false);
  assert.equal(outcome.report.auth, "no-flag");
  assert.ok(outcome.report.warnings.includes("grok --help exited non-zero"));
  assert.match(formatDoctor(outcome.report), /^grok: on PATH$/m);
});

test("doctor --project writes uuid or alias and leaves unknown untouched", async () => {
  const aliasDir = tempDir();
  const unknownDir = tempDir();
  const existingDir = tempDir();
  try {
    const aliasRun = scripted({
      ...gitOk(),
      "grok --version": command(0, "grok 1.2.3\n"),
      "grok --help": command(0, ALIAS_HELP),
    });
    const alias = await doctor({
      projectDir: aliasDir,
      nodeVersion: "v22.0.0",
      runner: aliasRun,
    });
    assert.equal(alias.report.sessionIdMode, "alias");
    assert.equal(alias.report.effortFlag, true);
    assert.equal(alias.report.grokVersion, "grok 1.2.3");
    const saved = loadConfig(aliasDir);
    assert.equal(saved.sessionIdMode, "alias");
    assert.equal(saved.model, defaultConfig().model);
    assert.equal(saved.effort, "medium");
    assert.equal(existsSync(path.join(aliasDir, ".hitchhiker", STATE_LOCK_NAME)), false);

    const unknownRun = scripted(gitOk());
    await doctor({ projectDir: unknownDir, nodeVersion: "v22.0.0", runner: unknownRun });
    assert.equal(existsSync(path.join(unknownDir, ".hitchhiker")), false);

    const hitch = path.join(existingDir, ".hitchhiker");
    mkdirSync(hitch);
    const original = `${JSON.stringify({ effort: "xhigh", sessionIdMode: "uuid" })}\n`;
    writeFileSync(path.join(hitch, "config.json"), original, "utf8");
    await doctor({ projectDir: existingDir, nodeVersion: "v22.0.0", runner: scripted(gitOk()) });
    assert.equal(readFileSync(path.join(hitch, "config.json"), "utf8"), original);

    const bothDir = tempDir();
    try {
      const both = await doctor({
        projectDir: bothDir,
        nodeVersion: "v22.0.0",
        runner: scripted({
          ...gitOk(),
          "grok --version": command(0, "grok 1.2.3\n"),
          "grok --help": command(0, BOTH_HELP),
        }),
      });
      assert.equal(both.report.sessionIdMode, "unknown");
      assert.ok(
        both.report.warnings.includes("session-id mode is unknown. Pass an explicit flag later."),
      );
      assert.equal(existsSync(path.join(bothDir, ".hitchhiker")), false);
    } finally {
      rmSync(bothDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(aliasDir, { recursive: true, force: true });
    rmSync(unknownDir, { recursive: true, force: true });
    rmSync(existingDir, { recursive: true, force: true });
  }
});

test("doctor --project keeps other config fields and updates sessionIdMode", async () => {
  const dir = tempDir();
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch);
    writeFileSync(
      path.join(hitch, "config.json"),
      JSON.stringify({ effort: "high", worktrees: false }),
      "utf8",
    );
    await doctor({
      projectDir: dir,
      nodeVersion: "v22.0.0",
      runner: scripted({
        ...gitOk(),
        "grok --version": command(0, "grok 9\n"),
        "grok --help": command(0, UUID_HELP),
      }),
    });
    const config = loadConfig(dir);
    assert.equal(config.effort, "high");
    assert.equal(config.worktrees, false);
    assert.equal(config.sessionIdMode, "uuid");
    assert.equal(config.voiceEngine, "local");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("hh doctor is the only successful command", async () => {
  assert.deepEqual(parseArgs(["doctor"]), { ok: true });
  assert.deepEqual(parseArgs(["doctor", "--project", path.join("sites", "towel")]), {
    ok: true,
    projectDir: path.join("sites", "towel"),
  });
  assert.deepEqual(parseArgs([]), { ok: false });
  assert.deepEqual(parseArgs(["help"]), { ok: false });
  assert.deepEqual(parseArgs(["doctor", "--project"]), { ok: false });
  assert.deepEqual(parseArgs(["doctor", "--help"]), { ok: false });
  assert.deepEqual(parseArgs(["Doctor"]), { ok: false });

  const refused = await runCli(["sessions"], scripted({}));
  assert.equal(refused.exitCode, 2);
  assert.equal(refused.stdout, "");
  assert.match(refused.stderr ?? "", /^  hh doctor$/m);
  assert.equal((refused.stderr ?? "").includes("!"), false);
  assert.doesNotMatch(refused.stderr ?? "", /^node: /m);

  const run = scripted(gitOk());
  const accepted = await runCli(["doctor"], run);
  assert.equal(accepted.exitCode, nodeIsSupported(process.version) ? 0 : 1);
  assert.match(accepted.stdout, /^node: /);
  assert.equal(accepted.stdout.endsWith("\n"), true);
  assert.equal(accepted.stdout.includes("!"), false);
  assert.equal(run.calls.includes("playwright --version"), true);
  assert.equal(run.calls.includes("whisper --version"), true);
  assert.equal(run.calls.includes("pdftotext -v"), true);
});

const NO_AUTH_HELP = [
  "Usage: grok [OPTIONS] [PROMPT] [COMMAND]",
  "",
  "  -s, --session-id <SESSION_ID>",
  "          Use a specific session UUID for a new conversation.",
  "",
  "      --oauth",
  "          Use OAuth when the welcome screen starts authentication",
  "",
  "      --reasoning-effort <EFFORT>",
  "          Reasoning effort for reasoning models",
  "",
  "          [aliases: --effort]",
  "",
  "Commands:",
  "  login          Sign in to Grok",
  "  logout         Sign out and clear cached credentials",
  "  doctor         Check terminal, clipboard, color, and input support without starting Grok",
  "  models         List available models and exit",
].join("\n");

const AUTH_STATUS_HELP = [
  "Usage: grok [OPTIONS] [COMMAND]",
  "",
  "  -s, --session-id <UUID>",
  "          Use a UUID for a new session.",
  "",
  "      --auth-status",
  "          Show the current authentication state and exit.",
  "",
  "Commands:",
  "  login          Sign in to Grok",
].join("\n");

test("doctor says grok --help has no auth status flag and does not run login", async () => {
  const projectDir = tempDir();
  try {
    const run = scripted({
      ...gitOk(),
      "grok --version": command(0, "grok 1.2.3\n"),
      "grok --help": command(0, NO_AUTH_HELP),
    });
    const outcome = await doctor({
      projectDir,
      nodeVersion: "v22.0.0",
      runner: run,
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.report.auth, "no-flag");
    assert.equal(outcome.report.sessionIdMode, "uuid");
    assert.match(
      formatDoctor(outcome.report),
      /^auth: no non-interactive status flag in grok --help$/m,
    );
    assert.equal(formatDoctor(outcome.report).includes("!"), false);
    assert.equal(run.calls.includes("grok login"), false);
    assert.equal(run.calls.includes("grok logout"), false);
    assert.equal(run.calls.includes("grok --oauth"), false);
    assert.equal(run.calls.includes("grok doctor"), false);
    assert.equal(run.calls.includes("grok models"), false);
    assert.equal(run.calls.some((call) => call.includes("--session-id")), false);
    assert.equal(run.calls.some((call) => call.includes(path.basename(projectDir))), false);
    assert.equal(loadConfig(projectDir).sessionIdMode, "uuid");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("doctor records signed-out when the status flag output says signed out", async () => {
  async function probe(output: string, status: number) {
    const run = scripted({
      ...gitOk(),
      "grok --version": command(0, "grok 1.2.3\n"),
      "grok --help": command(0, AUTH_STATUS_HELP),
      "grok --auth-status": command(status, output),
    });
    const outcome = await doctor({ nodeVersion: "v22.0.0", runner: run });
    return { run, outcome };
  }

  const signedOut = await probe("signed out\n", 1);
  assert.equal(signedOut.outcome.exitCode, 0);
  assert.equal(signedOut.outcome.report.auth, "signed-out");
  assert.match(formatDoctor(signedOut.outcome.report), /^auth: signed-out$/m);
  assert.equal(formatDoctor(signedOut.outcome.report).includes("!"), false);
  assert.equal(signedOut.run.calls.includes("grok --auth-status"), true);
  assert.equal(signedOut.run.calls.includes("grok login"), false);
  assert.equal(signedOut.run.calls.some((call) => call.includes("--session-id")), false);
  assert.equal(
    signedOut.outcome.report.warnings.includes(
      "auth status probe did not say signed-in or signed-out",
    ),
    false,
  );

  const negated = await probe("not signed in\n", 1);
  assert.equal(negated.outcome.report.auth, "signed-out");
  assert.equal(negated.run.calls.includes("grok login"), false);

  const signedIn = await probe("signed in\n", 0);
  assert.equal(signedIn.outcome.exitCode, 0);
  assert.equal(signedIn.outcome.report.auth, "signed-in");
  assert.match(formatDoctor(signedIn.outcome.report), /^auth: signed-in$/m);
  assert.equal(signedIn.run.calls.includes("grok --auth-status"), true);
  assert.equal(signedIn.run.calls.includes("grok login"), false);
});

test("doctor does not require whisper, playwright, or pdftotext", () => {
  const sourcePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "doctor.ts",
  );
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("always-approve"), false);
  assert.equal(source.includes("api.x.ai"), false);
  assert.equal(/run\(\s*"grok"\s*,\s*\[\s*"login"/.test(source), false);
  assert.equal(/from ["']playwright["']/.test(source), false);
  assert.equal(/from ["']whisper/.test(source), false);
  assert.equal(/from ["']pdftotext/.test(source), false);
  const missing = spawnCommand("hh-not-a-real-binary-009", ["--version"]);
  assert.equal(missing.status, null);
  assert.equal(missing.errorCode, "ENOENT");
});
