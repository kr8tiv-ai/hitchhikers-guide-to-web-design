import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  installDestination,
  installSkills,
  parseInstallArgs,
  pluginSourceDir,
  runInstall,
} from "../src/install.ts";
import { cliEntryArgs, runCli } from "../src/main.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file: string, body: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function skillFixture(): string {
  const source = tempDir("hh-install-src-");
  write(path.join(source, "skills", "guide-persona", "SKILL.md"), "---\nname: guide-persona\n---\n\nfirst\n");
  write(path.join(source, "skills", "guide-persona", "notes", "extra.md"), "nested\n");
  write(path.join(source, "skills", "guide-persona", "skip.txt"), "not markdown\n");
  write(path.join(source, "skills", "hh-ready", "SKILL.md"), "already prefixed\n");
  write(path.join(source, "agents", "guide.md"), "agent\n");
  write(path.join(source, "hooks", "deny.json"), "{}\n");
  write(path.join(source, "rules", "voice.md"), "rules\n");
  return source;
}

test("installSkills copies markdown into hh- skill folders and keeps the relative path", async () => {
  const source = skillFixture();
  const project = tempDir("hh-install-proj-");
  try {
    const result = await installSkills({ sourceDir: source, projectDir: project });
    assert.equal(result.copied, 6);
    assert.equal(
      readFileSync(path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md"), "utf8"),
      "---\nname: guide-persona\n---\n\nfirst\n",
    );
    assert.equal(
      readFileSync(path.join(project, ".grok", "skills", "hh-guide-persona", "notes", "extra.md"), "utf8"),
      "nested\n",
    );
    assert.equal(existsSync(path.join(project, ".grok", "skills", "hh-guide-persona", "skip.txt")), false);
    assert.equal(
      readFileSync(path.join(project, ".grok", "skills", "hh-ready", "SKILL.md"), "utf8"),
      "already prefixed\n",
    );
    assert.equal(existsSync(path.join(project, ".grok", "skills", "hh-hh-ready")), false);
    assert.equal(readFileSync(path.join(project, ".grok", "agents", "hh-guide.md"), "utf8"), "agent\n");
    assert.equal(readFileSync(path.join(project, ".grok", "hooks", "hh-deny.json"), "utf8"), "{}\n");
    assert.equal(readFileSync(path.join(project, ".grok", "rules", "hh-voice.md"), "utf8"), "rules\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("a skill that resolves outside the source directory is not copied", async () => {
  const source = tempDir("hh-install-src-");
  const project = tempDir("hh-install-proj-");
  const outside = tempDir("hh-install-out-");
  try {
    write(path.join(outside, "SKILL.md"), "SECRET\n");
    write(path.join(source, "skills", "guide-persona", "SKILL.md"), "inside\n");
    mkdirSync(path.join(source, "skills"), { recursive: true });
    const link = path.join(source, "skills", "leaked");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const result = await installSkills({ sourceDir: source, projectDir: project });
    assert.equal(result.copied, 1);
    assert.equal(readFileSync(path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md"), "utf8"), "inside\n");
    assert.equal(existsSync(path.join(project, ".grok", "skills", "hh-leaked")), false);
    const tree = readFileSync(path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md"), "utf8");
    assert.equal(tree.includes("SECRET"), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a destination that realpaths outside the project throws and writes nothing", async () => {
  const project = tempDir("hh-install-proj-");
  const outside = tempDir("hh-install-out-");
  assert.throws(
    () => installDestination(project, ".grok", "skills", "..", "..", "escaped"),
    /Refusing to copy outside the project/,
  );
  const source = tempDir("hh-install-src-");
  try {
    write(path.join(source, "skills", "guide-persona", "SKILL.md"), "nope\n");
    symlinkSync(outside, path.join(project, ".grok"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      () => installSkills({ sourceDir: source, projectDir: project }),
      /Refusing to copy outside the project/,
    );
    assert.equal(existsSync(path.join(outside, "skills")), false);
    assert.equal(existsSync(path.join(outside, "hh-guide-persona")), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a second install overwrites the hh- folder and leaves a sibling skill alone", async () => {
  const source = tempDir("hh-install-src-");
  const project = tempDir("hh-install-proj-");
  try {
    const skill = path.join(source, "skills", "guide-persona", "SKILL.md");
    write(skill, "one\n");
    const first = await installSkills({ sourceDir: source, projectDir: project });
    assert.equal(first.copied, 1);
    const sibling = path.join(project, ".grok", "skills", "other-skill.txt");
    write(sibling, "leave me\n");
    const stale = path.join(project, ".grok", "skills", "hh-guide-persona", "stale.md");
    write(stale, "old\n");
    write(skill, "two\n");
    const second = await installSkills({ sourceDir: source, projectDir: project });
    assert.equal(second.copied, 1);
    assert.equal(readFileSync(path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md"), "utf8"), "two\n");
    assert.equal(existsSync(stale), false);
    assert.equal(readFileSync(sibling, "utf8"), "leave me\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("a missing source throws and an empty source copies nothing", async () => {
  const project = tempDir("hh-install-proj-");
  const empty = tempDir("hh-install-empty-");
  try {
    const kept = path.join(project, ".grok", "skills", "hh-old", "SKILL.md");
    const sibling = path.join(project, ".grok", "skills", "other-skill.txt");
    write(kept, "keep\n");
    write(sibling, "sibling\n");
    await assert.rejects(
      () => installSkills({ sourceDir: path.join(project, "missing-source"), projectDir: project }),
      /Source directory does not exist/,
    );
    const result = await installSkills({ sourceDir: empty, projectDir: project });
    assert.equal(result.copied, 0);
    assert.equal(readFileSync(kept, "utf8"), "keep\n");
    assert.equal(readFileSync(sibling, "utf8"), "sibling\n");
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

test("the install parser requires --project and hh install copies the Guide skill", async () => {
  assert.throws(() => parseInstallArgs([]), /--project/);
  assert.throws(() => parseInstallArgs(["--project"]), /--project/);
  assert.deepEqual(parseInstallArgs(["--project", "sites"]), { projectDir: "sites" });
  assert.throws(() => parseInstallArgs(["--publish"]), /Unexpected argument/);

  const missing = await runCli(["install"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stdout, /--project/);
  assert.equal(missing.stdout.includes("!"), false);

  const project = tempDir("hh-install-proj-");
  try {
    const sibling = path.join(project, ".grok", "skills", "other-skill.txt");
    write(sibling, "unrelated\n");
    const outcome = await runInstall(["--project", project], { sourceDir: pluginSourceDir() });
    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.stdout, /^Copied \d+ files?\.\n$/);
    const copied = path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md");
    assert.equal(existsSync(copied), true);
    assert.match(readFileSync(copied, "utf8"), /You are the Guide/);
    assert.equal(readFileSync(sibling, "utf8"), "unrelated\n");
    assert.equal(existsSync(path.join(project, ".grok", "skills", "hh-src")), false);

    const viaCli = await runCli(["install", "--project", project]);
    assert.equal(viaCli.exitCode, 0);
    assert.equal(readFileSync(sibling, "utf8"), "unrelated\n");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("install does not call fetch and the package is publishable as hh", () => {
  const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "install.ts");
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("npm publish"), false);

  const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(typeof manifest, "object");
  assert.ok(manifest !== null);
  const record = manifest as Record<string, unknown>;
  assert.equal(record.name, "hitchhikers-guide");
  assert.equal(record.private, false);
  const bin = record.bin as Record<string, unknown>;
  assert.equal(bin.hh, "./src/main.ts");
  const repository = record.repository as Record<string, unknown>;
  assert.equal(typeof repository.url, "string");
  assert.match(String(repository.url), /kr8tiv-ai\/hitchhikers-guide-to-web-design/);
  const files = record.files;
  assert.ok(Array.isArray(files));
  assert.ok(files.includes("src") || files.includes("dist"));

  assert.deepEqual(cliEntryArgs([]), ["app"]);
  assert.deepEqual(cliEntryArgs(["doctor"]), ["doctor"]);
});

test("the plugin manifest names hitchhikers-guide", () => {
  const manifestPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "grok-plugin",
    ".grok-plugin",
    "plugin.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(typeof parsed, "object");
  assert.ok(parsed !== null);
  const record = parsed as Record<string, unknown>;
  assert.equal(record.name, "hitchhikers-guide");

  const grok = spawnSync("grok", ["--version"], { encoding: "utf8" });
  if (grok.status !== 0) {
    return;
  }
  const validated = spawnSync("grok", ["plugin", "validate", path.dirname(path.dirname(manifestPath))], {
    encoding: "utf8",
  });
  assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
  assert.match(`${validated.stdout}`, /hitchhikers-guide/);
});
