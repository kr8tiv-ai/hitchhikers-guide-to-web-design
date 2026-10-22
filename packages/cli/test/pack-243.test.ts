/**
 * One pack. One install. The file is skipped by the package test script
 * so a normal `pnpm test` does not pack. CI runs this file on its own.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hiddenChildOptions, launchSpec } from "@hitchhiker/engine";

const DESK_PORT = 4175;
const TARBALL_BUDGET = 25 * 1024 * 1024;
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(cliRoot, "package.json");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string;
}

test("npm pack stays within 25 MB and the installed hh serves the desk", { timeout: 30 * 60 * 1000 }, async () => {
  const original = readFileSync(manifestPath, "utf8");
  const beforeTgz = new Set(tgzNames(cliRoot));
  const work = mkdtempSync(path.join(os.tmpdir(), "hh-pack-243-"));
  const packDest = path.join(work, "pack");
  const prefix = path.join(work, "install");
  const project = path.join(work, "project");
  mkdirSync(packDest);
  mkdirSync(prefix);
  mkdirSync(project);
  let desk: ChildProcess | null = null;
  try {
    await resetManifest(original);
    const packed = runCommand("npm", ["pack", "--json", "--pack-destination", packDest], {
      cwd: cliRoot,
      timeout: 10 * 60 * 1000,
    });
    assert.equal(
      packed.status,
      0,
      `npm pack failed\n${packed.stdout}\n${packed.stderr}\n${packed.error}`,
    );
    const tarball = tarballFromPack(packed.stdout, packDest);
    const bytes = statSync(tarball).size;
    assert.ok(bytes > 0, "tarball is empty");
    assert.ok(
      bytes <= TARBALL_BUDGET,
      `tarball is ${bytes} bytes, over the ${TARBALL_BUDGET} byte budget`,
    );

    const archive = readTarball(tarball);
    const manifestFile = archive.files.get("package/package.json");
    assert.ok(manifestFile, "tarball is missing package/package.json");
    const manifest = JSON.parse(manifestFile.toString("utf8")) as Record<string, unknown>;
    assert.equal(JSON.stringify(manifest).includes("workspace:"), false);
    assertNoRuntimeTypeScript(manifest);
    assertAllowlist(manifest.files);
    for (const name of archive.names) {
      const rel = name.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^package\//, "");
      const hit = tarballExcluded(rel);
      assert.equal(hit, null, `${name} is inside excluded ${hit ?? ""}`);
    }
    const binTarget = binPath(manifest);
    const binFile = archive.files.get(`package/${binTarget.replace(/^\.\//, "")}`);
    assert.ok(binFile, `tarball is missing ${binTarget}`);
    const firstLine = binFile.toString("utf8").split("\n", 1)[0] ?? "";
    assert.equal(firstLine, "#!/usr/bin/env node");
    assert.equal(firstLine.includes(".ts"), false);

    writeFileSync(
      path.join(prefix, "package.json"),
      `${JSON.stringify({ name: "hh-pack-smoke", private: true, version: "0.0.0" })}\n`,
    );
    const installed = runCommand(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", prefix, tarball],
      { cwd: prefix, timeout: 20 * 60 * 1000 },
    );
    assert.equal(
      installed.status,
      0,
      `npm install failed\n${installed.stdout}\n${installed.stderr}\n${installed.error}`,
    );

    const binDir = path.join(prefix, "node_modules", ".bin");
    const shim = path.join(binDir, process.platform === "win32" ? "hh.cmd" : "hh");
    assert.equal(statSync(shim).isFile(), true, "npm did not link the hh bin");
    const shimText = readFileSync(shim, "utf8");
    assert.match(shimText, /dist[/\\]main\.js/);
    assert.equal(shimText.includes("main.ts"), false);
    assert.equal(shimText.includes("--experimental-strip-types"), false);

    const env = smokeEnv(binDir);
    const version = runCommand("hh", ["--version"], { cwd: project, env, timeout: 60_000 });
    assert.equal(version.status, 0, `hh --version failed\n${version.stdout}\n${version.stderr}\n${version.error}`);
    assert.equal(version.stdout.trim(), manifest.version);

    const doctor = runCommand("hh", ["doctor"], { cwd: project, env, timeout: 120_000 });
    assert.equal(doctor.status, 0, `hh doctor failed\n${doctor.stdout}\n${doctor.stderr}\n${doctor.error}`);
    assert.match(doctor.stdout, /^node: /);

    const port = await reservePort();
    assert.notEqual(port, DESK_PORT);
    desk = startHh(["app", "--no-open", "--port", String(port)], { cwd: project, env });
    const logs = collect(desk);
    const url = await waitForUrl(desk, port, logs);
    assert.equal(url, `http://127.0.0.1:${port}/`);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    assert.equal(response.status, 200, body.slice(0, 400));
    assert.ok(body.length > 0, "the desk returned an empty page");
  } finally {
    await stopChild(desk);
    rmSync(work, { recursive: true, force: true });
    await resetManifest(original);
    for (const name of tgzNames(cliRoot)) {
      if (!beforeTgz.has(name)) rmSync(path.join(cliRoot, name), { force: true });
    }
  }
});

function tgzNames(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".tgz"));
}

async function resetManifest(original: string): Promise<void> {
  const mod = await import(pathToFileURL(path.join(cliRoot, "pack-manifest.mjs")).href) as {
    restorePackManifest: () => Promise<void>;
  };
  await mod.restorePackManifest();
  await rm(path.join(os.tmpdir(), "hitchhikers-guide-pack-backup.json"), { force: true });
  if (readFileSync(manifestPath, "utf8") !== original) writeFileSync(manifestPath, original);
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout: number },
): RunResult {
  const env = options.env ?? process.env;
  const spec = launchSpec(command, args, env);
  const result = spawnSync(
    spec.file,
    spec.args,
    hiddenChildOptions({
      cwd: options.cwd,
      env,
      encoding: "utf8" as const,
      timeout: options.timeout,
      maxBuffer: 64 * 1024 * 1024,
      windowsVerbatimArguments: spec.verbatim,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    }),
  );
  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error instanceof Error ? result.error.message : "",
  };
}

function smokeEnv(binDir: string): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ["HH_LIVE", "HH_CASSETTE", "HH_ALLOW_CASSETTE", "NODE_TEST_CONTEXT"]) {
    delete next[key];
  }
  if (typeof next.NODE_OPTIONS === "string") {
    const cleaned = next.NODE_OPTIONS.replaceAll("--experimental-strip-types", "").replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) delete next.NODE_OPTIONS;
    else next.NODE_OPTIONS = cleaned;
  }
  const pathKey = Object.keys(next).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const current = next[pathKey] ?? "";
  next[pathKey] = [binDir, current].filter((part) => part.length > 0).join(path.delimiter);
  return next;
}

function tarballFromPack(stdout: string, packDest: string): string {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  assert.ok(start >= 0 && end > start, `npm pack did not print JSON\n${stdout}`);
  const parsed: unknown = JSON.parse(stdout.slice(start, end + 1));
  assert.ok(Array.isArray(parsed) && parsed.length > 0, "npm pack JSON was empty");
  const first = parsed[0] as { filename?: unknown };
  assert.equal(typeof first.filename, "string");
  const filename = first.filename;
  const file = path.isAbsolute(filename) ? filename : path.join(packDest, filename);
  assert.equal(statSync(file).isFile(), true, `missing tarball ${file}`);
  return file;
}

function assertAllowlist(files: unknown): void {
  assert.ok(Array.isArray(files) && files.length > 0, "packed files allowlist is empty");
  assert.ok(files.includes("dist"), "packed files allowlist does not ship dist");
  for (const entry of files) {
    assert.equal(typeof entry, "string");
    const hit = allowlistExcluded(entry);
    assert.equal(hit, null, `files entry ${String(entry)} includes ${hit ?? ""}`);
  }
}

function allowlistExcluded(entry: string): string | null {
  const value = entry.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (value.length === 0 || value === "." || value === "*" || value === "**") return "the whole package";
  if (value === "vendor" || value.startsWith("vendor/")) return "vendor/";
  if (value === "context" || value.startsWith("context/")) return "context/";
  if (value === "hh-build-plan" || value.startsWith("hh-build-plan/")) return "hh-build-plan/";
  if (value === "docs" || value === "docs/assets" || value.startsWith("docs/assets/ui-")) {
    return "docs/assets/ui-*";
  }
  return null;
}

function tarballExcluded(rel: string): string | null {
  const value = rel.replaceAll("\\", "/").replace(/^\.\//, "");
  if (value === "vendor" || value.startsWith("vendor/")) return "vendor/";
  if (value === "context" || value.startsWith("context/")) return "context/";
  if (value === "hh-build-plan" || value.startsWith("hh-build-plan/")) return "hh-build-plan/";
  if (value.startsWith("docs/assets/")) {
    const name = value.slice("docs/assets/".length).split("/")[0] ?? "";
    if (name.startsWith("ui-")) return "docs/assets/ui-*";
  }
  return null;
}

function assertNoRuntimeTypeScript(manifest: Record<string, unknown>): void {
  const targets = [
    ...runtimeTargets(manifest.bin),
    ...runtimeTargets(manifest.main),
    ...runtimeTargets(manifest.exports),
  ];
  assert.ok(targets.length > 0, "packed manifest has no bin, main, or exports");
  for (const target of targets) {
    assert.equal(target.endsWith(".ts") || target.endsWith(".tsx") || target.endsWith(".mts"), false, target);
  }
  const bin = manifest.bin;
  assert.equal(typeof bin, "object");
  assert.ok(bin !== null);
  const hh = (bin as { hh?: unknown }).hh;
  assert.equal(hh, "./dist/main.js");
  assert.equal(manifest.main, "./dist/main.js");
}

function runtimeTargets(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => runtimeTargets(item));
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap((item) => runtimeTargets(item));
  }
  return [];
}

function binPath(manifest: Record<string, unknown>): string {
  const bin = manifest.bin;
  assert.equal(typeof bin, "object");
  assert.ok(bin !== null);
  const hh = (bin as { hh?: unknown }).hh;
  assert.equal(typeof hh, "string");
  return hh;
}

interface Archive {
  names: string[];
  files: Map<string, Buffer>;
}

function readTarball(file: string): Archive {
  const raw = gunzipSync(readFileSync(file));
  const names: string[] = [];
  const files = new Map<string, Buffer>();
  let offset = 0;
  let pendingName: string | null = null;
  let pendingPax: Record<string, string> | null = null;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(header.toString("utf8", 124, 136).replace(/\0/g, "").trim(), 8);
    const stored = Number.isFinite(size) && size > 0 ? size : 0;
    const data = raw.subarray(offset, offset + stored);
    offset += Math.ceil(stored / 512) * 512;
    const typeflag = String.fromCharCode(header[156] ?? 0);
    if (typeflag === "L") {
      pendingName = data.toString("utf8").replace(/\0+$/u, "");
      continue;
    }
    if (typeflag === "x") {
      pendingPax = parsePax(data);
      continue;
    }
    if (typeflag === "g" || typeflag === "K") continue;
    const ustarName = ustarPath(header);
    const name = pendingPax?.path ?? pendingName ?? ustarName;
    pendingName = null;
    pendingPax = null;
    if (name.length === 0) continue;
    const storedName = name.replaceAll("\\", "/").replace(/^\.\//, "");
    names.push(storedName);
    if (typeflag === "0" || typeflag === "\0") files.set(storedName, Buffer.from(data));
  }
  return { names, files };
}

function ustarPath(header: Buffer): string {
  const name = header.toString("utf8", 0, 100).replace(/\0.*$/u, "");
  const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/u, "");
  return prefix.length > 0 ? `${prefix}/${name}` : name;
}

function parsePax(data: Buffer): Record<string, string> {
  const text = data.toString("utf8");
  const fields: Record<string, string> = {};
  let cursor = 0;
  while (cursor < text.length) {
    const space = text.indexOf(" ", cursor);
    if (space < 0) break;
    const length = Number.parseInt(text.slice(cursor, space), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = text.slice(cursor, cursor + length);
    const body = record.slice(space - cursor + 1);
    const eq = body.indexOf("=");
    if (eq > 0) {
      const key = body.slice(0, eq);
      let value = body.slice(eq + 1);
      if (value.endsWith("\n")) value = value.slice(0, -1);
      fields[key] = value;
    }
    cursor += length;
  }
  return fields;
}

function startHh(
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ChildProcess {
  const spec = launchSpec("hh", args, options.env);
  return spawn(
    spec.file,
    spec.args,
    hiddenChildOptions({
      cwd: options.cwd,
      env: options.env,
      windowsVerbatimArguments: spec.verbatim,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    }),
  );
}

function collect(child: ChildProcess): { out: () => string; err: () => string } {
  let out = "";
  let err = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    out = `${out}${chunk}`.slice(-200_000);
  });
  child.stderr?.on("data", (chunk: string) => {
    err = `${err}${chunk}`.slice(-200_000);
  });
  return {
    out: () => out,
    err: () => err,
  };
}

async function waitForUrl(
  child: ChildProcess,
  port: number,
  logs: { out: () => string; err: () => string },
): Promise<string> {
  const expected = `http://127.0.0.1:${port}/`;
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (logs.out().includes(expected)) return expected;
    if (child.exitCode !== null) {
      throw new Error(`desk exited ${child.exitCode}\n${logs.out()}\n${logs.err()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`desk did not listen on ${expected}\n${logs.out()}\n${logs.err()}`);
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryAt = (port: number): void => {
      if (port >= 46200) {
        reject(new Error("No free port for the packed desk."));
        return;
      }
      if (port === DESK_PORT) {
        tryAt(port + 1);
        return;
      }
      const server = createServer();
      const next = (): void => {
        server.close();
        tryAt(port + 1);
      };
      server.once("error", next);
      server.listen(port, "127.0.0.1", () => {
        server.removeAllListeners("error");
        server.close((error) => {
          if (error) reject(error);
          else resolve(port);
        });
      });
    };
    tryAt(46100);
  });
}

async function stopChild(child: ChildProcess | null): Promise<void> {
  if (child === null) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  if (process.platform === "win32" && pid !== undefined) {
    spawnSync(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      hiddenChildOptions({
        encoding: "utf8" as const,
        stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
      }),
    );
  } else {
    child.kill("SIGTERM");
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 8_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
