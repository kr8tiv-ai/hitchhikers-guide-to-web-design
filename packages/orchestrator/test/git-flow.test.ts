import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateCommand } from "../src/policy.ts";
import {
  GitFlowError,
  assertNoSecrets,
  backupBranchName,
  commitPrompt,
  prepareRepo,
} from "../src/git-flow.ts";

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

const skipWithoutGit = gitAvailable()
  ? false
  : "git is not on PATH, so the temp repo checks are skipped";

function runGit(args: readonly string[]): Promise<string> {
  const bin = args[0];
  if (bin === undefined) return Promise.reject(new Error("empty argv"));
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args.slice(1),
      { windowsHide: true, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() === "" ? error.message : stderr.trim();
          reject(new Error(detail));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function git(dir: string, args: readonly string[]): Promise<string> {
  return runGit(["git", "-C", dir, ...args]);
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

async function tempRepo(): Promise<string> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-git-flow-"));
  await git(dir, ["init"]);
  const exclude = path.join(dir, ".git", "hh-empty-exclude");
  const hooks = path.join(dir, ".git", "hh-hooks");
  writeFileSync(exclude, "");
  mkdirSync(hooks);
  writeFileSync(path.join(dir, ".git", "info", "exclude"), "");
  await git(dir, ["config", "core.excludesFile", exclude]);
  // Local only. Keeps a global hooks path from running inside the temp repo.
  await git(dir, ["config", "core.hooksPath", hooks]);
  await git(dir, ["config", "user.email", "guide-test@example.com"]);
  await git(dir, ["config", "user.name", "Guide Test"]);
  await git(dir, ["config", "commit.gpgsign", "false"]);
  await git(dir, ["config", "core.autocrlf", "false"]);
  return dir;
}

async function seed(dir: string): Promise<void> {
  writeFileSync(path.join(dir, "README.md"), "seed\n");
  await git(dir, ["add", "README.md"]);
  await git(dir, ["commit", "-m", "seed"]);
}

function recordingRunner(log: string[][]): (args: string[]) => Promise<void> {
  return async (args) => {
    const copy = [...args];
    log.push(copy);
    if (copy.includes("push")) throw new Error("git push is denied");
    await runGit(copy);
  };
}

function subcommand(args: readonly string[]): string {
  for (const arg of args) {
    if (arg === "add" || arg === "commit" || arg === "reset" || arg === "branch") return arg;
  }
  return "";
}

async function withRepo(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await tempRepo();
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("backup branch name is the date ref", () => {
  assert.equal(backupBranchName("2026-10-07"), "hh/backup-2026-10-07");
  assert.equal(backupBranchName("2024-02-29"), "hh/backup-2024-02-29");
  assert.equal(backupBranchName("2000-02-29"), "hh/backup-2000-02-29");
  assert.equal(backupBranchName("2026-10-07"), backupBranchName("2026-10-07"));
});

test("invalid backup dates throw", () => {
  const dates = [
    "",
    "2026-10-7",
    "07-10-2026",
    "2026/10/07",
    "2026-13-01",
    "2026-00-10",
    "2026-02-29",
    "1900-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-10-00",
    "not-a-date",
    "2026-10-07T00:00:00",
    " 2026-10-07",
  ];
  for (const date of dates) {
    assert.throws(() => backupBranchName(date), GitFlowError);
  }
});

test("assertNoSecrets blocks env, pem, credentials, and guide config", () => {
  assert.throws(() => assertNoSecrets([".env"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["app/.env.local"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["keys/server.pem"]), /secret paths/);
  assert.throws(() => assertNoSecrets([".pem"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["src/credentials.json"]), /secret paths/);
  assert.throws(() => assertNoSecrets([".hitchhiker/config.json"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["site/.hitchhiker/config.json"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["C:\\site\\.env"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["C:\\site\\cert.PEM"]), /secret paths/);
  assert.throws(() => assertNoSecrets(["ok.txt", "pkg/.env"]), /\.env/);
  assert.doesNotThrow(() => assertNoSecrets([]));
  assert.doesNotThrow(() =>
    assertNoSecrets([
      "notenv",
      "src/notenv",
      "notes.env",
      "notenv.local",
      "readme.pem.txt",
      "my-credentials.json",
      "not.hitchhiker/config.json",
      ".hitchhiker/other.json",
      "README.md",
    ]),
  );
});

test("empty and multiline messages throw before the runner", async () => {
  for (const message of ["", "   ", "one\ntwo", "one\r\ntwo"]) {
    let calls = 0;
    await assert.rejects(
      () =>
        commitPrompt(os.tmpdir(), message, async () => {
          calls += 1;
        }),
      GitFlowError,
    );
    assert.equal(calls, 0);
  }
});

test("runner failures propagate", async () => {
  await assert.rejects(
    () =>
      commitPrompt(os.tmpdir(), "save the page", async () => {
        throw new Error("index locked");
      }),
    /index locked/,
  );
});

test("add and commit argv are allowed and a remote update is denied", () => {
  const dir = path.join(os.tmpdir(), "towel");
  const add = evaluateCommand({ argv: ["git", "-C", dir, "add", "-A"], projectRoot: dir });
  const commit = evaluateCommand({
    argv: ["git", "-C", dir, "commit", "-m", "do not push"],
    projectRoot: dir,
  });
  const remote = evaluateCommand({ argv: ["git", "-C", dir, "push", "origin"], projectRoot: dir });
  assert.equal(add.decision, "allow");
  assert.equal(commit.decision, "allow");
  assert.equal(remote.decision, "deny");
  assert.equal(remote.reason, "git push is denied");
});

test("git-flow gates commands and does not set an identity", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/git-flow.ts", import.meta.url)), "utf8");
  assert.match(source, /evaluateCommand\(/);
  assert.match(source, /assertNoSecrets\(/);
  assert.doesNotMatch(source, /--global/);
  assert.doesNotMatch(source, /user\.email/);
  assert.doesNotMatch(source, /\bgit\s+push\b/);
});

test("prepareRepo rejects a bad date before git", async () => {
  await assert.rejects(() => prepareRepo(os.tmpdir(), "nope"), /invalid backup date/);
});

test("prepareRepo creates a backup ref and does not move it", { skip: skipWithoutGit }, async () => {
  await withRepo(async (dir) => {
    await seed(dir);
    const before = (await git(dir, ["rev-parse", "HEAD"])).trim();
    const current = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    await prepareRepo(dir, "2026-10-07");
    assert.equal((await git(dir, ["rev-parse", "hh/backup-2026-10-07"])).trim(), before);
    assert.equal((await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim(), current);
    assert.notEqual(current, "hh/backup-2026-10-07");
    writeFileSync(path.join(dir, "later.txt"), "later\n");
    await git(dir, ["add", "later.txt"]);
    await git(dir, ["commit", "-m", "later"]);
    await prepareRepo(dir, "2026-10-07");
    assert.equal((await git(dir, ["rev-parse", "hh/backup-2026-10-07"])).trim(), before);
    assert.equal((await git(dir, ["remote"])).trim(), "");
  });
});

test("commitPrompt commits one safe change and never pushes", { skip: skipWithoutGit }, async () => {
  await withRepo(async (dir) => {
    await seed(dir);
    writeFileSync(path.join(dir, "notenv"), "notes\n");
    const log: string[][] = [];
    await commitPrompt(dir, "do not push", recordingRunner(log));
    assert.deepEqual(log.map(subcommand), ["add", "commit"]);
    for (const args of log) assert.equal(args.includes("push"), false);
    const commit = log[1];
    assert.ok(commit);
    assert.deepEqual(commit.slice(0, 5), ["git", "-C", dir, "commit", "-m"]);
    assert.equal(commit[5], "do not push");
    assert.equal(commit.length, 6);
    const add = log[0];
    assert.ok(add);
    assert.deepEqual(add, ["git", "-C", dir, "add", "-A"]);
    const tracked = lines(await git(dir, ["ls-files"]));
    assert.ok(tracked.includes("notenv"));
    assert.equal((await git(dir, ["log", "-1", "--format=%s"])).trim(), "do not push");
    assert.equal((await git(dir, ["remote"])).trim(), "");
  });
});

test("secret paths are unstaged and block a commit when they are the only change", { skip: skipWithoutGit }, async () => {
  await withRepo(async (dir) => {
    await seed(dir);
    const head = (await git(dir, ["rev-parse", "HEAD"])).trim();
    writeFileSync(path.join(dir, ".env"), "EXAMPLE=placeholder\n");
    const log: string[][] = [];
    await assert.rejects(
      () => commitPrompt(dir, "save the page", recordingRunner(log)),
      /secret paths/,
    );
    assert.deepEqual(log.map(subcommand), ["add", "reset"]);
    for (const args of log) assert.equal(args.includes("push"), false);
    assert.equal(log.some((args) => args.includes("commit")), false);
    assert.equal((await git(dir, ["rev-parse", "HEAD"])).trim(), head);
    assert.equal((await git(dir, ["diff", "--cached", "--name-only"])).trim(), "");
    assert.equal(readFileSync(path.join(dir, ".env"), "utf8"), "EXAMPLE=placeholder\n");
  });
});

test("a mixed tree commits the safe file and leaves secrets unstaged", { skip: skipWithoutGit }, async () => {
  await withRepo(async (dir) => {
    await seed(dir);
    mkdirSync(path.join(dir, "keys"));
    mkdirSync(path.join(dir, ".hitchhiker"));
    writeFileSync(path.join(dir, "page.txt"), "page\n");
    writeFileSync(path.join(dir, ".env"), "EXAMPLE=placeholder\n");
    writeFileSync(path.join(dir, ".env.local"), "EXAMPLE=placeholder\n");
    writeFileSync(path.join(dir, "keys", "dev.pem"), "placeholder\n");
    writeFileSync(path.join(dir, "credentials.json"), "{}\n");
    writeFileSync(path.join(dir, ".hitchhiker", "config.json"), "{}\n");
    const log: string[][] = [];
    await commitPrompt(dir, "save the page", recordingRunner(log));
    assert.deepEqual(log.map(subcommand), ["add", "reset", "commit"]);
    for (const args of log) assert.equal(args.includes("push"), false);
    const tracked = lines(await git(dir, ["ls-files"]));
    assert.ok(tracked.includes("page.txt"));
    assert.equal(tracked.includes(".env"), false);
    assert.equal(tracked.includes(".env.local"), false);
    assert.equal(tracked.includes("keys/dev.pem"), false);
    assert.equal(tracked.includes("credentials.json"), false);
    assert.equal(tracked.includes(".hitchhiker/config.json"), false);
    assert.equal((await git(dir, ["log", "-1", "--format=%s"])).trim(), "save the page");
    assert.equal(readFileSync(path.join(dir, ".env"), "utf8"), "EXAMPLE=placeholder\n");
    const staged = lines(await git(dir, ["diff", "--cached", "--name-only"]));
    assert.deepEqual(staged, []);
  });
});
