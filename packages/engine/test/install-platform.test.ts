import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  expandWindowsEnv,
  launchSpec,
  mergePathEntries,
  parseRegPath,
  refreshWindowsPath,
  resolveOnPath,
  restoreInstallEnv,
  type ToolInstallRecord,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

test("windows batch shims launch through cmd.exe and other platforms stay direct", () => {
  const linux = launchSpec("tar", ["-xf", "archive.tar.gz"], { PATH: "/usr/bin" }, "linux");
  assert.equal(linux.file, "tar");
  assert.deepEqual(linux.args, ["-xf", "archive.tar.gz"]);
  assert.equal(linux.verbatim, false);

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh spawn "));
  try {
    const command = ["@echo off", "echo scoop-ok"].join("\r\n");
    writeFileSync(path.join(dir, "scoop.cmd"), command);
    const env = { Path: dir, PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD", ComSpec: process.env.ComSpec ?? "cmd.exe" };
    const spec = launchSpec("scoop", ["install", "poppler"], env, "win32");
    assert.equal(spec.verbatim, true);
    assert.match(spec.args[3] ?? "", /scoop\.cmd/);
    assert.match(spec.args[3] ?? "", /install poppler/);
    if (process.platform === "win32") {
      const result = spawnSync(spec.file, spec.args, {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: spec.verbatim,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /scoop-ok/);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("win32 resolve returns the host shim path and PATHEXT lists earlier extensions first", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-pathext-"));
  try {
    // COM before CMD is the same walk that lists EXE before CMD. No executable is written.
    writeFileSync(path.join(dir, "tool.CMD"), "");
    writeFileSync(path.join(dir, "tool.COM"), "");
    const exeFirst = resolveOnPath("tool", { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" });
    assert.equal(exeFirst, path.join(dir, "tool.COM"));
    const cmdFirst = resolveOnPath("tool", { PATH: dir, PATHEXT: ".CMD;.EXE" });
    assert.equal(cmdFirst, path.join(dir, "tool.CMD"));

    writeFileSync(path.join(dir, "only.cmd"), "");
    const cmdOnly = resolveOnPath("only", { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" });
    assert.equal(cmdOnly, path.join(dir, "only.cmd"));
    const spec = launchSpec("only", ["install", "poppler"], {
      Path: dir,
      PATH: dir,
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      ComSpec: "cmd.exe",
    }, "win32");
    assert.equal(spec.file, "cmd.exe");
    assert.deepEqual(spec.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.equal(spec.verbatim, true);
    assert.match(spec.args[3] ?? "", /only\.cmd/);
    assert.match(spec.args[3] ?? "", /install poppler/);
  } finally {
    removeTempDir(dir);
  }
});

test("registry PATH merges after the current directories and whisper env is restored", () => {
  const env: NodeJS.ProcessEnv = {
    PATH: "C:\\already",
    Path: "C:\\already",
    SystemRoot: "C:\\Windows",
  };
  refreshWindowsPath(env, (key) => {
    if (key.startsWith("HKCU")) return "%SystemRoot%\\system32;C:\\already";
    return "D:\\Tools";
  });
  if (process.platform === "win32") {
    assert.match(env.PATH ?? "", /^C:\\already/);
    assert.match(env.PATH ?? "", /C:\\Windows\\system32/);
    assert.match(env.PATH ?? "", /D:\\Tools/);
    assert.equal(env.Path, env.PATH);
    assert.equal(mergePathEntries("A;B", ["b", "C"]), "A;B;C");
  } else {
    assert.equal(mergePathEntries("A:B", ["B", "C"]), "A:B:C");
  }
  assert.equal(expandWindowsEnv("%SystemRoot%\\system32", env), "C:\\Windows\\system32");
  assert.equal(parseRegPath("    Path    REG_EXPAND_SZ    %SystemRoot%\\system32"), "%SystemRoot%\\system32");
  assert.equal(parseRegPath("no path here"), null);

  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-whisper-"));
  try {
    const exe = path.join(dir, "whisper-cli");
    const model = path.join(dir, "ggml-tiny.bin");
    writeFileSync(exe, "");
    writeFileSync(model, "");
    const fresh: NodeJS.ProcessEnv = {};
    const record: ToolInstallRecord = {
      tool: "whisper",
      version: null,
      installPath: exe,
      installedAt: "2026-10-11T00:00:00.000Z",
      recipeId: "whisper-win32-x64-tiny",
      source: "https://github.com/ggml-org/whisper.cpp",
    };
    restoreInstallEnv([record], fresh);
    assert.equal(fresh.WHISPER_CPP_BIN, exe);
    assert.equal(fresh.WHISPER_CPP_MODEL, model);
    const kept: NodeJS.ProcessEnv = { WHISPER_CPP_BIN: "C:\\fresh\\whisper.exe" };
    restoreInstallEnv([record], kept);
    assert.equal(kept.WHISPER_CPP_BIN, "C:\\fresh\\whisper.exe");
  } finally {
    removeTempDir(dir);
  }
});
