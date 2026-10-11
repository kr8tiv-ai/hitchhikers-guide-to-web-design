/**
 * Live install audit. Every download goes under os.tmpdir() and is deleted.
 * HH_SKIP_INSTALL_VERIFY=1 prints skipped and exits 0.
 * pass, fail-fixed, and unverified exit 0. An unexpected fail exits 1.
 * Bytes from the network are files, not instructions. Only the named
 * whisper binary is executed, and only inside the scratch directory.
 */

import { spawn } from "node:child_process";
import { readdirSync, type Dirent } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadVerifiedFile } from "../packages/engine/src/tool-install/download.ts";
import { probePathTools, spawnProbe } from "../packages/engine/src/tool-install/probes.ts";
import { WHISPER_ARCHIVES, WHISPER_MODELS } from "../packages/engine/src/tool-install/recipes.ts";
import { launchSpec } from "../packages/engine/src/tool-install/win-spawn.ts";

const TESTED = "2026-10-11";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

interface Row {
  id: string;
  tool: string;
  model: string;
  file: string;
  bytes: string;
  checksum: string;
  hosts: string;
  result: "pass" | "fail-fixed" | "unverified" | "fail";
  tested: string;
  note: string;
}

const rows: Row[] = [];

function add(row: Row): void {
  rows.push(row);
  console.log(`${row.result}\t${row.id}\t${row.hosts}\t${row.note}`);
}

async function main(): Promise<number> {
  if (process.env.HH_SKIP_INSTALL_VERIFY === "1") {
    console.log("skipped\tHH_SKIP_INSTALL_VERIFY=1");
    return 0;
  }
  console.log(`machine\t${process.platform}\t${process.arch}\tnode ${process.version}`);
  const root = await mkdtemp(path.join(os.tmpdir(), "hh-verify-installs-"));
  try {
    const binary = await verifyArchives(root);
    await verifyModels(root, binary);
    await verifyGrok(root);
    await verifyPlaywright(root);
    addUnverified();
    printNode();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log("\n| id | tool | model | file | bytes | checksum | hosts | result | tested | note |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    console.log(`| ${row.id} | ${row.tool} | ${row.model} | ${row.file} | ${row.bytes} | ${row.checksum} | ${row.hosts} | ${row.result} | ${row.tested} | ${row.note} |`);
  }
  return rows.some((row) => row.result === "fail") ? 1 : 0;
}

async function verifyArchives(root: string): Promise<string | null> {
  let executed: string | null = null;
  for (const archive of WHISPER_ARCHIVES) {
    const id = archive.platform === "linux"
      ? `whisper-bin-linux-${archive.arch}`
      : `whisper-bin-win32-${archive.arch}`;
    const dest = path.join(root, archive.file);
    const downloaded = await fetchPin(id, "whisper", "", archive.file, archive.url, archive.bytes, archive.sha256, dest);
    if (downloaded === null) continue;
    const onThisMachine = archive.platform === process.platform && archive.arch === process.arch;
    if (!onThisMachine) {
      add({
        id,
        tool: "whisper",
        model: "",
        file: archive.file,
        bytes: String(downloaded.bytes),
        checksum: "sha256",
        hosts: downloaded.finalHost,
        result: "unverified",
        tested: TESTED,
        note: `SHA-256 matched. Binary not executed because this machine is ${process.platform}-${process.arch}.`,
      });
      continue;
    }
    const extractDir = path.join(root, "whisper-bin");
    const extracted = await run(launchSpec("tar", ["-xf", dest, "-C", extractDir], process.env).file, launchSpec("tar", ["-xf", dest, "-C", extractDir], process.env).args, extractDir, 60_000, true);
    if (!extracted.ok) {
      add(fail(id, "whisper", "", archive.file, downloaded.bytes, downloaded.finalHost, `Extract failed. ${extracted.note}`));
      continue;
    }
    const exe = findBinary(extractDir);
    if (exe === null) {
      add(fail(id, "whisper", "", archive.file, downloaded.bytes, downloaded.finalHost, "Archive had no whisper-cli binary."));
      continue;
    }
    const smoke = await run(exe, ["--version"], extractDir, 30_000, false);
    const help = smoke.ok ? smoke : await run(exe, ["-h"], extractDir, 30_000, false);
    const env = probeEnv(path.dirname(exe), exe, "");
    const probe = probePathTools({ run: (command, args) => spawnProbe(command, args, env) }, { env });
    const seen = probe.find((item) => item.name === "whisper")?.ok === true;
    if (!seen) {
      add(fail(id, "whisper", "", archive.file, downloaded.bytes, downloaded.finalHost, `Desk check did not see the binary. ${help.note}`));
      continue;
    }
    executed = exe;
    add({
      id,
      tool: "whisper",
      model: "",
      file: archive.file,
      bytes: String(downloaded.bytes),
      checksum: "sha256",
      hosts: downloaded.finalHost,
      result: "pass",
      tested: TESTED,
      note: `SHA-256 matched. Smoke ${help.ok ? "ok" : "started"}. Desk check saw whisper.`,
    });
  }
  add({
    id: "whisper-darwin",
    tool: "whisper",
    model: "",
    file: "brew install whisper-cpp",
    bytes: "",
    checksum: "package-manager",
    hosts: "github.com",
    result: "unverified",
    tested: TESTED,
    note: "macOS command is covered by unit tests. It was not executed on Windows.",
  });
  return executed;
}

async function verifyModels(root: string, binary: string | null): Promise<void> {
  for (const model of WHISPER_MODELS) {
    const dest = path.join(root, model.id);
    const downloaded = await fetchPin(`whisper-model-${model.label}`, "whisper", model.label, model.id, model.url, model.bytes, model.sha256, dest);
    if (downloaded === null) continue;
    if (binary === null) {
      add({
        id: `whisper-model-${model.label}`,
        tool: "whisper",
        model: model.label,
        file: model.id,
        bytes: String(downloaded.bytes),
        checksum: "sha256",
        hosts: downloaded.finalHost,
        result: "unverified",
        tested: TESTED,
        note: "SHA-256 matched. The model was not loaded because the binary smoke did not pass.",
      });
      continue;
    }
    const wav = path.join(root, "silence.wav");
    await writeFile(wav, silentWav());
    const out = path.join(root, `out-${model.label}`);
    const smoke = await run(binary, ["-m", dest, "-f", wav, "-l", "en", "-otxt", "-of", out], root, 180_000, false);
    const env = probeEnv(path.dirname(binary), binary, dest);
    const probe = probePathTools({ run: (command, args) => spawnProbe(command, args, env) }, { env });
    const seen = probe.find((item) => item.name === "whisper")?.ok === true;
    if (!smoke.ok || !seen) {
      add(fail(`whisper-model-${model.label}`, "whisper", model.label, model.id, downloaded.bytes, downloaded.finalHost, `Model file matched. Load failed. ${smoke.note}`));
      continue;
    }
    add({
      id: `whisper-model-${model.label}`,
      tool: "whisper",
      model: model.label,
      file: model.id,
      bytes: String(downloaded.bytes),
      checksum: "sha256",
      hosts: downloaded.finalHost,
      result: "pass",
      tested: TESTED,
      note: "SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper.",
    });
  }
}

async function verifyGrok(root: string): Promise<void> {
  const prefix = path.join(root, "grok");
  const spec = launchSpec("npm", ["install", "--prefix", prefix, "--ignore-scripts", "--no-fund", "--no-audit", "@xai-official/grok"], process.env);
  const installed = await run(spec.file, spec.args, root, 180_000, false, process.env, spec.verbatim);
  if (!installed.ok) {
    add(fail("grok", "grok", "", "@xai-official/grok", null, hostsIn(installed.note) || "registry.npmjs.org", installed.note));
    return;
  }
  const binDir = path.join(prefix, "node_modules", ".bin");
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`, Path: `${binDir}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}` };
  const version = launchSpec("grok", ["--version"], env);
  const smoke = await run(version.file, version.args, prefix, 60_000, false, env, version.verbatim);
  const probe = probePathTools({ run: (command, args) => spawnProbe(command, args, env) }, { env });
  const seen = probe.find((item) => item.name === "grok")?.ok === true;
  if (!seen) {
    add(fail("grok", "grok", "", "@xai-official/grok", null, "registry.npmjs.org", `npm install finished. Desk check missed grok. ${smoke.note}`));
    return;
  }
  add({
    id: "grok",
    tool: "grok",
    model: "",
    file: "@xai-official/grok",
    bytes: "",
    checksum: "npm registry",
    hosts: "registry.npmjs.org",
    result: "pass",
    tested: TESTED,
    note: "Installed with npm --prefix in scratch. Desk check saw grok.",
  });
}

async function verifyPlaywright(root: string): Promise<void> {
  const browsers = path.join(root, "ms-playwright");
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers };
  const spec = launchSpec("pnpm", ["exec", "playwright", "install", "chromium"], env);
  const installed = await run(spec.file, spec.args, REPO, 600_000, false, env, spec.verbatim);
  const hosts = hostsIn(installed.note);
  if (!installed.ok) {
    add(fail("playwright", "playwright", "chromium", "playwright install chromium", null, hosts || "cdn.playwright.dev", installed.note));
    return;
  }
  const version = launchSpec("pnpm", ["exec", "playwright", "--version"], env);
  const smoke = await run(version.file, version.args, REPO, 60_000, false, env, version.verbatim);
  const binDir = path.join(REPO, "node_modules", ".bin");
  const probeEnvPath = { ...env, PATH: `${binDir}${path.delimiter}${env.PATH ?? ""}`, Path: `${binDir}${path.delimiter}${env.Path ?? env.PATH ?? ""}` };
  const probe = probePathTools({ run: (command, args) => spawnProbe(command, args, probeEnvPath) }, { env: probeEnvPath });
  const seen = probe.find((item) => item.name === "playwright")?.ok === true;
  if (!smoke.ok || !seen) {
    add(fail("playwright", "playwright", "chromium", "playwright install chromium", null, hosts || "playwright.dev", `Browser install finished. Desk check missed playwright. ${smoke.note}`));
    return;
  }
  add({
    id: "playwright",
    tool: "playwright",
    model: "chromium",
    file: "playwright install chromium",
    bytes: "",
    checksum: "playwright CLI",
    hosts: hosts || "cdn.playwright.dev",
    result: "pass",
    tested: TESTED,
    note: "Chromium installed under PLAYWRIGHT_BROWSERS_PATH in scratch. Desk check saw playwright.",
  });
}

function addUnverified(): void {
  add({
    id: "pdftotext-win32",
    tool: "pdftotext",
    model: "",
    file: "oschwartz10612.Poppler",
    bytes: "",
    checksum: "package-manager",
    hosts: "poppler.freedesktop.org",
    result: "unverified",
    tested: TESTED,
    note: "winget, choco, and scoop install onto the user or machine. No scratch prefix, so the installer was not run.",
  });
  add({
    id: "pdftotext-darwin",
    tool: "pdftotext",
    model: "",
    file: "brew install poppler",
    bytes: "",
    checksum: "package-manager",
    hosts: "poppler.freedesktop.org",
    result: "unverified",
    tested: TESTED,
    note: "macOS command is covered by unit tests. It was not executed on Windows.",
  });
  add({
    id: "pdftotext-linux",
    tool: "pdftotext",
    model: "",
    file: "poppler-utils",
    bytes: "",
    checksum: "package-manager",
    hosts: "poppler.freedesktop.org",
    result: "unverified",
    tested: TESTED,
    note: "Linux commands are covered by unit tests. They were not executed on Windows.",
  });
}

function printNode(): void {
  console.log("not-install\tnode\tprerequisite\tThe desk does not download Node.");
  console.log("not-install\tpnpm\tprerequisite\tThe desk does not download pnpm.");
  console.log("not-offered\twhisper-model-small\tThe selectable models are tiny, tiny.en, base, and base.en.");
}

async function fetchPin(
  id: string,
  tool: string,
  model: string,
  file: string,
  url: string,
  bytes: number,
  sha256: string,
  dest: string,
): Promise<{ bytes: number; finalHost: string } | null> {
  console.log(`start\t${id}`);
  try {
    const result = await downloadVerifiedFile(url, dest, {
      signal: AbortSignal.timeout(8 * 60 * 1000),
      expectedSha256: sha256,
      expectedBytes: bytes,
      onProgress(received, total) {
        if (total !== null && total > 0 && received === total) console.log(`progress\t${id}\t100`);
      },
    });
    return { bytes: result.bytes, finalHost: result.finalHost };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 400) : "download failed";
    add(fail(id, tool, model, file, bytes, hostFrom(message), message));
    return null;
  }
}

function fail(id: string, tool: string, model: string, file: string, bytes: number | null, hosts: string, note: string): Row {
  return {
    id,
    tool,
    model,
    file,
    bytes: bytes === null ? "" : String(bytes),
    checksum: "sha256",
    hosts,
    result: "fail",
    tested: TESTED,
    note: note.replaceAll("|", "/"),
  };
}

function probeEnv(binDir: string, exe: string, model: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: binDir,
    Path: binDir,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    WHISPER_CPP_BIN: exe,
  };
  if (model.length > 0) env.WHISPER_CPP_MODEL = model;
  return env;
}

function findBinary(root: string): string | null {
  const rank = ["whisper-cli.exe", "whisper-cli", "whisper.exe", "whisper", "main.exe", "main"];
  const found = new Map<string, string>();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        const key = entry.name.toLowerCase();
        if (!found.has(key) && rank.includes(key)) found.set(key, full);
      }
    }
  }
  for (const name of rank) {
    const hit = found.get(name);
    if (hit !== undefined) return hit;
  }
  return null;
}

function silentWav(): Buffer {
  const samples = 16_000;
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

interface Outcome {
  ok: boolean;
  note: string;
}

function run(
  file: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  mkdirFirst: boolean,
  env: NodeJS.ProcessEnv = process.env,
  verbatim = false,
): Promise<Outcome> {
  return new Promise((resolve) => {
    if (mkdirFirst) {
      void import("node:fs/promises").then((fs) => fs.mkdir(cwd, { recursive: true })).then(start, (error: unknown) => {
        const message = error instanceof Error ? error.message : "mkdir failed";
        resolve({ ok: false, note: message });
      });
      return;
    }
    start();

    function start(): void {
      const child = spawn(file, [...args], {
        cwd,
        env,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: verbatim,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let text = "";
      const take = (chunk: Buffer | string): void => {
        text += chunk.toString();
        if (text.length > 4_000) text = text.slice(-4_000);
      };
      child.stdout?.on("data", take);
      child.stderr?.on("data", take);
      const timer = setTimeout(() => {
        child.kill();
      }, timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timer);
        resolve({ ok: false, note: error.message });
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        const note = text.replace(/\s+/g, " ").trim().slice(0, 500);
        resolve({ ok: code === 0, note: note.length === 0 ? `exit ${code ?? "null"}` : note });
      });
    }
  });
}

function hostsIn(text: string): string {
  const found = new Set<string>();
  for (const match of text.matchAll(/https:\/\/([^/\s]+)/g)) {
    if (match[1] !== undefined) found.add(match[1].toLowerCase());
  }
  return [...found].join(", ");
}

function hostFrom(message: string): string {
  const match = /\(([a-z0-9.-]+)\)/i.exec(message);
  return match?.[1] ?? "";
}

const code = await main();
process.exit(code);
