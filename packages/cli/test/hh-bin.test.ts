import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const binDir = path.join(repoRoot, "node_modules", ".bin");
const TOOLS = ["grok", "git", "playwright", "whisper", "pdftotext"] as const;

/** Windows HTML Help is `hh.exe`. The workspace shim must win before System32. */
const HTML_HELP = /[\\/]hh\.exe$/i;

test("pnpm exec hh doctor runs the workspace bin and not Windows HTML Help", () => {
  assert.equal(existsSync(binDir), true, "node_modules/.bin is missing. pnpm install did not link bins.");
  const work = mkdtempSync(path.join(os.tmpdir(), "hh-bin-"));
  try {
    const stubDir = path.join(work, "stubs");
    const logPath = path.join(work, "calls.txt");
    writeFileSync(logPath, "", "utf8");
    writeStubs(stubDir);
    const env = commandEnv(binDir, stubDir, logPath);
    assertStubScripts(stubDir, env, work);
    const resolved = resolveHh(env);
    assert.ok(resolved, "pnpm exec would not find an hh shim ahead of Windows HTML Help");
    assert.equal(HTML_HELP.test(resolved), false);
    assert.equal(path.basename(resolved).toLowerCase() === "hh.exe", false);
    const relative = path.relative(binDir, resolved);
    assert.equal(relative.startsWith("..") || path.isAbsolute(relative), false);
    const shim = readFileSync(resolved, "utf8");
    assert.match(shim, /main\.ts/);
    assert.equal(/hh\.exe/i.test(shim), false);

    const cwd = path.join(work, "project");
    mkdirSync(cwd);
    const repoDesk = path.join(repoRoot, ".hitchhiker");
    const repoDeskBefore = existsSync(repoDesk);
    const result = runResolved(resolved, ["doctor"], env, cwd);
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    assert.equal(result.status, 0, `hh doctor failed\n${stdout}\n${stderr}`);
    assert.match(stdout, /session-id:/);
    assert.equal(existsSync(path.join(cwd, ".hitchhiker")), false);
    assert.equal(existsSync(repoDesk), repoDeskBefore);

    const calls = readFileSync(logPath, "utf8");
    assert.match(calls, /^grok --version$/m);
    assert.match(calls, /^grok --help$/m);
    assert.equal(calls.includes("login"), false);
    assert.equal(calls.includes("--session-id"), false);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

function commandEnv(binFirst: string, stubDir: string, stubLog: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const current = env[key] ?? "";
  env[key] = [binFirst, stubDir, current].filter((part) => part.length > 0).join(path.delimiter);
  env.STUB_LOG = stubLog;
  return env;
}

/**
 * Same lookup pnpm exec uses (`which` + PATHEXT). On Windows the command `hh`
 * matches `hh.CMD` in node_modules/.bin before `System32\hh.exe`.
 */
function resolveHh(env: NodeJS.ProcessEnv): string | null {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const raw = env[key];
  if (typeof raw !== "string" || raw.length === 0) return null;
  const extensions = process.platform === "win32" ? windowsExtensions(env) : [""];
  for (const dir of raw.split(path.delimiter)) {
    if (dir.length === 0) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `hh${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function windowsExtensions(env: NodeJS.ProcessEnv): string[] {
  const raw = env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return raw.split(";").filter((ext) => ext.startsWith("."));
}

function runResolved(
  file: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  if (process.platform === "win32") {
    const comspec = env.ComSpec ?? "cmd.exe";
    const shellCommand = [quoteCmd(file), ...args.map(quoteCmd)].join(" ");
    const result = spawnSync(comspec, ["/d", "/s", "/c", `"${shellCommand}"`], {
      cwd,
      env,
      encoding: "utf8",
      windowsHide: true,
      windowsVerbatimArguments: true,
      timeout: 30_000,
    });
    return { status: result.status, stdout: text(result.stdout), stderr: text(result.stderr) };
  }
  const result = spawnSync(file, [...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  return { status: result.status, stdout: text(result.stdout), stderr: text(result.stderr) };
}

function quoteCmd(value: string): string {
  if (value.length === 0) return "\"\"";
  if (!/[\s"&<>|^]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function text(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") return value;
  if (value instanceof Buffer) return value.toString("utf8");
  return "";
}

function assertStubScripts(
  stubDir: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): void {
  const names = readdirSync(stubDir);
  assert.equal(names.some((name) => name.toLowerCase().endsWith(".exe")), false);
  const grok = runStub(stubDir, "grok", ["--version"], env, cwd);
  assert.equal(grok.status, 0, grok.stderr);
  assert.match(grok.stdout, /grok 0\.0\.0-test/);
  const git = runStub(stubDir, "git", ["--version"], env, cwd);
  assert.equal(git.status, 0, git.stderr);
  assert.match(git.stdout, /git version 2\.49\.0/);
  const pdf = runStub(stubDir, "pdftotext", ["-v"], env, cwd);
  assert.equal(pdf.status, 0, pdf.stderr);
  assert.match(pdf.stdout, /stub-ok/);
}

function runStub(
  stubDir: string,
  name: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const file = process.platform === "win32" ? path.join(stubDir, `${name}.cmd`) : path.join(stubDir, name);
  return runResolved(file, args, env, cwd);
}

function writeStubs(dir: string): void {
  mkdirSync(dir);
  writeFileSync(path.join(dir, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  const stub = path.join(dir, "stub.mjs");
  writeFileSync(stub, stubSource(), "utf8");
  if (process.platform === "win32") {
    const body = `@echo off\r\n"${process.execPath}" "${stub}" %~n0 %*\r\n`;
    for (const tool of TOOLS) writeFileSync(path.join(dir, `${tool}.cmd`), body, "utf8");
    return;
  }
  const launcher = "#!/usr/bin/env node\nimport \"./stub.mjs\";\n";
  for (const tool of TOOLS) {
    writeFileSync(path.join(dir, tool), launcher, { encoding: "utf8", mode: 0o755 });
  }
}

function stubSource(): string {
  return [
    'import { appendFileSync } from "node:fs";',
    'import path from "node:path";',
    'const entry = path.basename(process.argv[1] ?? "");',
    'const viaStub = entry === "stub.mjs";',
    "const name = (viaStub ? process.argv[2] ?? \"\" : entry).toLowerCase();",
    "const args = viaStub ? process.argv.slice(3) : process.argv.slice(2);",
    "const log = process.env.STUB_LOG;",
    "if (typeof log === \"string\" && log.length > 0) {",
    "  appendFileSync(log, name + \" \" + args.join(\" \") + \"\\n\");",
    "}",
    "function say(text) {",
    "  process.stdout.write(text + \"\\n\");",
    "}",
    "if (name === \"grok\") {",
    "  if (args[0] === \"--version\") {",
    "    say(\"grok 0.0.0-test\");",
    "    process.exit(0);",
    "  }",
    "  if (args[0] === \"--help\") {",
    "    say(\"-s, --session-id <UUID>\");",
    "    say(\"Use a UUID for a new session.\");",
    "    process.exit(0);",
    "  }",
    "  process.stderr.write(\"grok stub refused\\n\");",
    "  process.exit(2);",
    "}",
    "if (name === \"git\") {",
    "  say(\"git version 2.49.0\");",
    "  process.exit(0);",
    "}",
    "say(\"stub-ok\");",
    "process.exit(0);",
    "",
  ].join("\n");
}
