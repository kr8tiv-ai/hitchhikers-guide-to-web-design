import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import type { DeskPreflight } from "../src/server/card.ts";

/**
 * Width note, from the shell rules already in components.css. This file checks
 * the route HTML, not a screenshot.
 * 375: one column (the map rail starts at 1100px), shell padding 16px plus the 7px
 * spine, and a preflight table becomes stacked rows under the 640px rule.
 * 1440: the read column caps at 40rem beside the map. The brand plate uses the
 * same read column and the existing rust button.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-preflight-desk-"));
}

function probes(present: boolean): DeskPreflight {
  return {
    grokOk: present,
    probes: [
      { name: "grok", ok: present, detail: present ? "grok: grok 1.0.46" : "grok: not on PATH" },
      { name: "playwright", ok: present, detail: present ? "playwright: installed" : "playwright: not installed" },
      { name: "whisper", ok: present, detail: present ? "whisper: installed" : "whisper: not installed" },
      { name: "pdftotext", ok: present, detail: present ? "pdftotext: installed" : "pdftotext: not installed" },
    ],
  };
}

async function withDesk(
  preflight: DeskPreflight,
  run: (handle: ServerHandle) => Promise<void>,
): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      preflight,
      turnHandler: async () => ({ next: null, events: [] }),
    });
    await run(handle);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a first run with grok missing lists the four probes and does not say Ready", async () => {
  await withDesk(probes(false), async (handle) => {
    const response = await fetch(handle.url);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /data-region="preflight"/);
    assert.match(html, /data-probe="grok"[^>]*data-probe-state="missing"/);
    assert.match(html, /grok: not on PATH/);
    assert.match(html, /data-probe="playwright"/);
    assert.match(html, /playwright: not installed/);
    assert.match(html, /data-probe="whisper"/);
    assert.match(html, /whisper: not installed/);
    assert.match(html, /data-probe="pdftotext"/);
    assert.match(html, /pdftotext: not installed/);
    assert.match(html, /data-region="status"[\s\S]*Grok is not on PATH\./);
    assert.doesNotMatch(html, /\bReady\b/);
    assert.match(html, /<button[^>]*data-install="grok"[^>]*>Install grok<\/button>/);
    assert.match(html, /<button[^>]*data-install="playwright"[^>]*>Install playwright<\/button>/);
    assert.match(html, /<button[^>]*data-install="whisper"[^>]*>Install whisper<\/button>/);
    assert.match(html, /<button[^>]*data-install="pdftotext"[^>]*>Install pdftotext<\/button>/);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
  });
});

test("a first run with every probe present says Ready and lists the four results", async () => {
  await withDesk(probes(true), async (handle) => {
    const response = await fetch(handle.url);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /data-region="preflight"/);
    assert.match(html, /data-probe="grok"[^>]*data-probe-state="ok"/);
    assert.match(html, /grok: grok 1\.0\.46/);
    assert.match(html, /playwright: installed/);
    assert.match(html, /whisper: installed/);
    assert.match(html, /pdftotext: installed/);
    assert.match(html, /data-region="status"[\s\S]*<span>Ready\.<\/span>/);
    assert.equal(html.includes("data-install="), false);
  });
});

test("grok present and the other tools missing still says Ready", async () => {
  const partial: DeskPreflight = {
    grokOk: true,
    probes: [
      { name: "grok", ok: true, detail: "grok: on PATH" },
      { name: "playwright", ok: false, detail: "playwright: not installed" },
      { name: "whisper", ok: false, detail: "whisper: not installed" },
      { name: "pdftotext", ok: false, detail: "pdftotext: not installed" },
    ],
  };
  await withDesk(partial, async (handle) => {
    const html = await (await fetch(handle.url)).text();
    assert.match(html, /<span>Ready\.<\/span>/);
    assert.match(html, /playwright: not installed/);
    assert.match(html, /whisper: not installed/);
    assert.match(html, /pdftotext: not installed/);
  });
});

test("the desk and hh doctor share probePathTools", () => {
  const repo = path.resolve(here, "..", "..", "..");
  const doctorSource = readFileSync(path.join(repo, "packages", "cli", "src", "doctor.ts"), "utf8");
  const appSource = readFileSync(path.join(repo, "packages", "cli", "src", "commands", "app.ts"), "utf8");
  const routesSource = readFileSync(path.join(repo, "packages", "app", "src", "server", "routes.ts"), "utf8");
  assert.match(doctorSource, /export function probePathTools/);
  assert.match(doctorSource, /const pathProbes = probePathTools\(runner\)/);
  assert.match(doctorSource, /export function deskPreflight/);
  assert.match(appSource, /deskPreflight\(/);
  assert.equal(routesSource.includes("where.exe"), false);
  assert.equal(routesSource.includes("pdftotext"), false);
  assert.equal(routesSource.includes("spawnCommand"), false);
});
