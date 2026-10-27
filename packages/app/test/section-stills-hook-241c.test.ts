/**
 * Section stills hook. generateSectionStills stays wired, and a grok child
 * settles when it exits instead of waiting on grandchild stdio pipes.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnGrok } from "../src/server/section-stills-hook.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.resolve(here, "../src/server/section-stills-hook.ts");

test("the hook still calls generateSectionStills and kills a Windows process tree", () => {
  const source = readFileSync(hookPath, "utf8");
  assert.match(source, /generateSectionStills/);
  assert.match(source, /resolveDeskProvider/);
  assert.match(source, /taskkill/);
  assert.match(source, /\/T", "\/F"/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
  assert.match(source, /STILL_EXIT_DRAIN_MS = 500/);
});

test("spawnGrok returns a clean node exit without waiting out the timeout", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "hh-stills-hook-"));
  const started = Date.now();
  try {
    const result = await spawnGrok({
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok')"],
      cwd,
      env: process.env,
      timeoutMs: 10_000,
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.errorCode, null);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "ok");
    assert.ok(Date.now() - started < 4_000);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("spawnGrok settles after exit when a grandchild holds the stdio pipes", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "hh-stills-hold-"));
  const script = path.join(cwd, "hold.cjs");
  const pidFile = path.join(cwd, "child.pid");
  writeFileSync(
    script,
    [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
      `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      "setTimeout(() => process.exit(0), 30);",
      "",
    ].join("\n"),
    "utf8",
  );
  const started = Date.now();
  try {
    const result = await spawnGrok({
      command: process.execPath,
      args: [script],
      cwd,
      env: process.env,
      timeoutMs: 15_000,
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.status, 0);
    assert.ok(Date.now() - started < 4_000);
  } finally {
    try {
      const pid = Number(readFileSync(pidFile, "utf8"));
      if (Number.isInteger(pid) && pid > 0) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        } else {
          process.kill(pid, "SIGKILL");
        }
      }
    } catch {
      // The drain already reaped the grandchild.
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});
