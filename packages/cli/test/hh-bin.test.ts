import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function writeStubs(dir: string): void {
  if (process.platform === "win32") {
    writeWindowsExe(dir);
    return;
  }
  const script = [
    "#!/bin/sh",
    "printf '%s\\n' \"$(basename \"$0\") $*\" >> \"$STUB_LOG\"",
    "name=$(basename \"$0\")",
    "if [ \"$name\" = \"grok\" ]; then",
    "  if [ \"$1\" = \"--version\" ]; then",
    "    printf '%s\\n' \"grok 0.0.0-test\"",
    "    exit 0",
    "  fi",
    "  if [ \"$1\" = \"--help\" ]; then",
    "    printf '%s\\n' \"-s, --session-id <UUID>\" \"Use a UUID for a new session.\"",
    "    exit 0",
    "  fi",
    "  printf '%s\\n' \"grok stub refused $*\" >&2",
    "  exit 2",
    "fi",
    "if [ \"$name\" = \"git\" ]; then",
    "  printf '%s\\n' \"git version 2.49.0\"",
    "  exit 0",
    "fi",
    "printf '%s\\n' \"stub-ok\"",
    "exit 0",
    "",
  ].join("\n");
  mkdirSync(dir);
  for (const tool of TOOLS) {
    // spawn with shell off runs the shebang only when the file is executable.
    writeFileSync(path.join(dir, tool), script, { encoding: "utf8", mode: 0o755 });
  }
}

function writeWindowsExe(dir: string): void {
  mkdirSync(dir);
  const source = path.join(dir, "stub.cs");
  const built = path.join(dir, "stub.exe");
  writeFileSync(source, windowsStubSource(), "utf8");
  const csc = findCsc();
  const compiled = spawnSync(csc, ["/nologo", "/t:exe", `/out:${built}`, source], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  assert.equal(compiled.status, 0, `csc failed\n${text(compiled.stdout)}\n${text(compiled.stderr)}`);
  for (const tool of TOOLS) {
    copyFileSync(built, path.join(dir, `${tool}.exe`));
  }
}

function findCsc(): string {
  const windir = process.env.WINDIR ?? "C:\\Windows";
  const candidates = [
    path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("csc.exe is missing. The Windows bin test uses it to stub grok.exe.");
}

function windowsStubSource(): string {
  return [
    "using System;",
    "using System.IO;",
    "class Stub {",
    "  static int Main(string[] args) {",
    "    string name = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]).ToLowerInvariant();",
    "    string log = Environment.GetEnvironmentVariable(\"STUB_LOG\");",
    "    if (!string.IsNullOrEmpty(log)) {",
    "      File.AppendAllText(log, name + \" \" + string.Join(\" \", args) + \"\\n\");",
    "    }",
    "    if (name == \"grok\") {",
    "      if (args.Length > 0 && args[0] == \"--version\") {",
    "        Console.WriteLine(\"grok 0.0.0-test\");",
    "        return 0;",
    "      }",
    "      if (args.Length > 0 && args[0] == \"--help\") {",
    "        Console.WriteLine(\"-s, --session-id <UUID>\");",
    "        Console.WriteLine(\"Use a UUID for a new session.\");",
    "        return 0;",
    "      }",
    "      Console.Error.WriteLine(\"grok stub refused\");",
    "      return 2;",
    "    }",
    "    if (name == \"git\") {",
    "      Console.WriteLine(\"git version 2.49.0\");",
    "      return 0;",
    "    }",
    "    Console.WriteLine(\"stub-ok\");",
    "    return 0;",
    "  }",
    "}",
    "",
  ].join("\r\n");
}
