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
  readGateBrowsers,
  spawnCommand,
  type CommandResult,
  type CommandRunner,
  type GateBrowserSnapshot,
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
    assert.equal(saved.effort, "xhigh");
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
  assert.equal(run.calls.some((call) => call.includes("install")), false);

  const project = path.join("sites", "towel");
  assert.deepEqual(parseArgs(["doctor", "--yes"]), { ok: true, yes: true });
  assert.deepEqual(parseArgs(["doctor", "--project", project, "--yes"]), {
    ok: true,
    projectDir: project,
    yes: true,
  });
  assert.deepEqual(parseArgs(["doctor", "--yes", "--project", project]), {
    ok: true,
    projectDir: project,
    yes: true,
  });
  assert.deepEqual(parseArgs(["doctor", "--yes", "--yes"]), { ok: false });
  assert.deepEqual(parseArgs(["doctor", "--yes", "--help"]), { ok: false });
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
  assert.equal(source.includes("readline"), false);
  assert.equal(source.includes("createInterface"), false);
  assert.equal(source.includes("npm publish"), false);
});

function browserCache(present: { chromium?: boolean; webkit?: boolean }): {
  dir: string;
  snapshot: GateBrowserSnapshot;
} {
  const dir = tempDir();
  if (present.chromium === true) {
    const folder = path.join(dir, "chromium-1200", "chrome-win64");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "chrome.exe"), "");
  }
  if (present.webkit === true) {
    const folder = path.join(dir, "webkit-2100");
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, "pw_run.sh"), "");
  }
  const shell = path.join(dir, "chromium_headless_shell-1200", "chrome-headless-shell-win64");
  mkdirSync(shell, { recursive: true });
  writeFileSync(path.join(shell, "chrome-headless-shell.exe"), "");
  const dashed = path.join(dir, "chromium-headless-shell-1200");
  mkdirSync(dashed, { recursive: true });
  writeFileSync(path.join(dashed, "chrome.exe"), "");
  return {
    dir,
    snapshot: { cacheDir: dir, chromium: present.chromium === true, webkit: present.webkit === true },
  };
}

function pnpmDir(): string {
  const dir = tempDir();
  const name = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  writeFileSync(path.join(dir, name), "");
  return dir;
}

function envWith(dir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...extra, PATH: dir, Path: dir, PLAYWRIGHT_BROWSERS_PATH: extra.PLAYWRIGHT_BROWSERS_PATH ?? "" };
}

test("readGateBrowsers sees Chromium and WebKit and ignores the headless shell", () => {
  const cache = browserCache({ chromium: true, webkit: true });
  try {
    const seen = readGateBrowsers({ PLAYWRIGHT_BROWSERS_PATH: cache.dir });
    assert.equal(seen.cacheDir, cache.dir);
    assert.equal(seen.chromium, true);
    assert.equal(seen.webkit, true);
    const empty = tempDir();
    try {
      const none = readGateBrowsers({ PLAYWRIGHT_BROWSERS_PATH: empty });
      assert.equal(none.chromium, false);
      assert.equal(none.webkit, false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    const shellOnly = browserCache({});
    try {
      const onlyShell = readGateBrowsers({ PLAYWRIGHT_BROWSERS_PATH: shellOnly.dir });
      assert.equal(onlyShell.chromium, false);
      assert.equal(onlyShell.webkit, false);
    } finally {
      rmSync(shellOnly.dir, { recursive: true, force: true });
    }
  } finally {
    rmSync(cache.dir, { recursive: true, force: true });
  }
});

test("doctor describes missing gate browsers and does not install without yes", async () => {
  const cache = browserCache({ webkit: true });
  const pnpm = pnpmDir();
  try {
    const run = scripted({
      ...gitOk(),
      "grok --version": command(0, "grok 1.2.3\n"),
      "grok --help": command(0, AUTH_STATUS_HELP),
      "grok --auth-status": command(0, "signed in\n"),
      "pnpm exec playwright install chromium": command(0, "installed\n"),
    });
    const outcome = await doctor({
      nodeVersion: "v22.0.0",
      runner: run,
      env: envWith(pnpm, { PLAYWRIGHT_BROWSERS_PATH: cache.dir }),
    });
    assert.equal(outcome.exitCode, 0);
    assert.equal(outcome.report.auth, "signed-in");
    assert.equal(outcome.report.gateBrowsers?.chromium, false);
    assert.equal(outcome.report.gateBrowsers?.webkit, true);
    assert.equal(outcome.report.gateBrowsers?.yes, false);
    assert.equal(outcome.report.gateBrowsers?.installAttempted, false);
    const text = formatDoctor(outcome.report);
    assert.match(text, /^Node\.js 22\.0\.0 is new enough\. The Guide needs Node\.js 22 or newer\.$/m);
    assert.match(text, /^Grok is on this computer, and you are signed in\.$/m);
    assert.match(text, /Chromium is missing/);
    assert.match(text, /Nothing was downloaded/);
    assert.match(text, /hh doctor --yes/);
    assert.match(text, /pnpm exec playwright install chromium/);
    assert.equal(text.includes(cache.dir), false);
    assert.equal(text.includes("!"), false);
    assert.equal(run.calls.some((call) => call.includes("install")), false);
    assert.equal(run.calls.includes("grok login"), false);
  } finally {
    rmSync(cache.dir, { recursive: true, force: true });
    rmSync(pnpm, { recursive: true, force: true });
  }
});

test("doctor installs only the missing gate browsers when yes is passed", async () => {
  const cache = browserCache({});
  const pnpm = pnpmDir();
  try {
    const both = scripted({
      ...gitOk(),
      "pnpm exec playwright install chromium webkit": command(0, "ok\n"),
    });
    const installed = await doctor({
      nodeVersion: "v22.14.0",
      runner: both,
      env: envWith(pnpm, { PLAYWRIGHT_BROWSERS_PATH: cache.dir }),
      yes: true,
    });
    assert.equal(installed.exitCode, 0);
    assert.equal(installed.report.gateBrowsers?.installAttempted, true);
    assert.equal(installed.report.gateBrowsers?.installOk, true);
    assert.equal(installed.report.gateBrowsers?.chromium, true);
    assert.equal(installed.report.gateBrowsers?.webkit, true);
    assert.deepEqual(installed.report.gateBrowsers?.missing, ["chromium", "webkit"]);
    const text = formatDoctor(installed.report);
    assert.match(text, /^You said yes\. The missing browsers are installed\. Chromium and WebKit are ready for the quality gates\.$/m);
    assert.equal(text.includes("!"), false);
    assert.equal(both.calls.filter((call) => call.includes("install")).length, 1);
    assert.equal(both.calls.includes("grok login"), false);

    const present = browserCache({ chromium: true, webkit: true });
    try {
      const idle = scripted({
        ...gitOk(),
        "pnpm exec playwright install chromium webkit": command(0, "ok\n"),
      });
      const skipped = await doctor({
        nodeVersion: "v22.0.0",
        runner: idle,
        env: envWith(pnpm, { PLAYWRIGHT_BROWSERS_PATH: present.dir }),
        yes: true,
      });
      assert.equal(skipped.report.gateBrowsers?.installAttempted, false);
      assert.match(formatDoctor(skipped.report), /Nothing was downloaded/);
      assert.equal(idle.calls.some((call) => call.includes("install")), false);
    } finally {
      rmSync(present.dir, { recursive: true, force: true });
    }

    const failed = scripted({
      ...gitOk(),
      "pnpm exec playwright install webkit": command(1, "", "no network"),
    });
    const webkitOnly = browserCache({ chromium: true });
    try {
      const broken = await doctor({
        nodeVersion: "v22.0.0",
        runner: failed,
        env: envWith(pnpm, { PLAYWRIGHT_BROWSERS_PATH: webkitOnly.dir }),
        yes: true,
      });
      assert.equal(broken.report.gateBrowsers?.installOk, false);
      assert.equal(broken.report.gateBrowsers?.webkit, false);
      assert.match(formatDoctor(broken.report), /the browser install did not finish/);
      assert.match(formatDoctor(broken.report), /pnpm exec playwright install webkit/);
      assert.equal(formatDoctor(broken.report).includes("!"), false);
    } finally {
      rmSync(webkitOnly.dir, { recursive: true, force: true });
    }
  } finally {
    rmSync(cache.dir, { recursive: true, force: true });
    rmSync(pnpm, { recursive: true, force: true });
  }
});

test("doctor does not download browsers when pnpm is missing, even with yes", async () => {
  const run = scripted({
    ...gitOk(),
    "pnpm exec playwright install chromium webkit": command(0, "should-not-run\n"),
  });
  const outcome = await doctor({
    nodeVersion: "v18.0.0",
    runner: run,
    yes: true,
    env: { PATH: "", Path: "" },
    readGateBrowsers: () => ({ cacheDir: "hidden-cache", chromium: false, webkit: false }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.report.nodeOk, false);
  assert.equal(outcome.report.gateBrowsers?.installAttempted, false);
  const text = formatDoctor(outcome.report);
  assert.match(text, /^Node\.js 18\.0\.0 is too old\. Install Node\.js 22 or newer, then run hh doctor again\.$/m);
  assert.match(text, /pnpm is not on this machine/);
  assert.equal(text.includes("hidden-cache"), false);
  assert.equal(text.includes("!"), false);
  assert.equal(run.calls.some((call) => call.includes("install")), false);
  assert.equal(run.calls.includes("grok login"), false);
});

test("hh doctor --yes installs from the CLI only when the flag is present", async () => {
  const missing: GateBrowserSnapshot = { cacheDir: "hidden-cache", chromium: false, webkit: true };
  const pnpm = pnpmDir();
  try {
    const refused = await runCli(["doctor", "--help"], scripted(gitOk()));
    assert.equal(refused.exitCode, 2);
    assert.equal(refused.stdout, "hh doctor [--project <dir>]\n");

    const run = scripted({
      ...gitOk(),
      "pnpm exec playwright install chromium": command(0, "ok\n"),
    });
    const accepted = await runCli(["doctor", "--yes"], run, {
      env: envWith(pnpm),
      readGateBrowsers: () => missing,
    });
    assert.equal(accepted.exitCode, nodeIsSupported(process.version) ? 0 : 1);
    assert.match(accepted.stdout, /^node: /);
    assert.match(accepted.stdout, /You said yes/);
    assert.equal(accepted.stdout.includes("hidden-cache"), false);
    assert.equal(accepted.stdout.includes("!"), false);
    assert.equal(run.calls.includes("pnpm exec playwright install chromium"), true);
    assert.equal(run.calls.includes("grok login"), false);
  } finally {
    rmSync(pnpm, { recursive: true, force: true });
  }
});
