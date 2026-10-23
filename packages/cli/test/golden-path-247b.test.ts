/**
 * 247b preview. The orchestrator package cannot depend on this package,
 * so the real `hh so-long` check lives here. The walk is loaded from the
 * orchestrator public entry. The preview is closed through the deploy
 * public entry. This file does not set HH_LIVE and does not call a host.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { hiddenChildOptions, packagedModule } from "@hitchhiker/engine";
import { runSoLongCommand } from "../src/commands/so-long.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("towel sample walks every phase and the preview serves the page", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-golden-cli-247b-"));
  const sample = path.resolve(here, "../../../samples/towel-day.hhproject");
  const runGoldenPath = await loadFunction(packagedModule("orchestrator", "src/index.ts"), "runGoldenPath");
  const readFlowFrom = await loadFunction(packagedModule("orchestrator", "src/index.ts"), "readFlowFrom");
  const closePreview = await loadFunction(packagedModule("deploy", "src/index.ts"), "closePreview");
  let opened = false;
  try {
    const walked = await runGoldenPath({ projectDir: dir, samplePath: sample });
    const headBefore = walkedHead(walked);
    const result = await runSoLongCommand(["--project", dir, "--host", "preview", "--yes"]);
    opened = true;
    assert.equal(result.exitCode, 0, result.stdout);
    assert.equal(result.stdout.includes("!"), false);
    assert.equal(result.stdout.includes("\u2014"), false);
    assert.equal(result.stdout.includes("HH_LIVE"), false);
    const address = result.stdout.match(/Address: (http:\/\/127\.0\.0\.1:\d+\/)/);
    assert.ok(address !== null && address[1] !== undefined, result.stdout);
    const url = new URL(address[1]);
    assert.notEqual(url.port, "4175");
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /Mostly Towels/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "preview.zip")), true);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
    assert.equal(readFlowFrom(dir), "so-long");
    const head = await gitHead(dir);
    assert.equal(head, headBefore);
  } finally {
    if (opened) await closePreview(dir).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

async function loadFunction(file: string, name: string): Promise<(...args: never[]) => Promise<unknown> | unknown> {
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (loaded === null || typeof loaded !== "object" || !(name in loaded)) {
    throw new Error(`${name} is missing.`);
  }
  const value = (loaded as Record<string, unknown>)[name];
  if (typeof value !== "function") throw new Error(`${name} is missing.`);
  return value as (...args: never[]) => Promise<unknown> | unknown;
}

function walkedHead(value: unknown): string {
  if (value === null || typeof value !== "object" || !("head" in value)) {
    throw new Error("The golden path did not return a commit.");
  }
  const head = (value as { head?: unknown }).head;
  if (typeof head !== "string" || head.length === 0) {
    throw new Error("The golden path did not return a commit.");
  }
  return head;
}

function gitHead(dir: string): Promise<string> {
  const hooks = mkdtempSync(path.join(tmpdir(), "hh-golden-hooks-"));
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", `core.hooksPath=${hooks.replaceAll("\\", "/")}`, "-C", dir, "rev-parse", "HEAD"],
      hiddenChildOptions({ encoding: "utf8", timeout: 30_000 }),
      (error, stdout, stderr) => {
        rmSync(hooks, { recursive: true, force: true });
        if (error) {
          reject(error instanceof Error ? error : new Error(String(stderr)));
          return;
        }
        resolve(String(stdout).trim().toLowerCase());
      },
    );
  });
}
