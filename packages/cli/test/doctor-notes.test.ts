import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explainDoctor,
  explainRuntime,
  explainTool,
  type PathProbeName,
} from "@hitchhiker/engine";
import { doctor, formatDoctor, type CommandResult, type CommandRunner } from "../src/doctor.ts";

const TOOLS = ["grok", "playwright", "whisper", "pdftotext"] as const satisfies readonly PathProbeName[];

function command(status: number | null, stdout = "", stderr = "", errorCode: string | null = null): CommandResult {
  return { status, stdout, stderr, errorCode };
}

function missingRunner(): CommandRunner {
  return {
    run() {
      return command(null, "", "", "ENOENT");
    },
  };
}

function context(platform: NodeJS.Platform, managers: readonly string[] = []) {
  return {
    platform,
    arch: "x64",
    managers,
    dataDir: "",
    browsersDir: "",
    workspaceDir: "",
    env: {},
  };
}

function failingReport() {
  return {
    nodeOk: true,
    nodeVersion: "22.14.0",
    gitOk: false,
    grokOnPath: false,
    grokVersion: null,
    auth: "skipped" as const,
    sessionIdMode: "unknown" as const,
    effortFlag: false,
    cassette: "off" as const,
    warnings: [
      "git is not on PATH",
      "session probe skipped",
      "playwright: not installed",
      "whisper: not installed",
      "pdftotext: not installed",
    ],
  };
}

test("each failing probe explains means, why, the OS fix, and the doc", () => {
  const platforms = ["win32", "darwin", "linux"] as const;
  for (const platform of platforms) {
    const managers = platform === "linux" ? ["apt-get"] : [];
    const ctx = context(platform, managers);
    const text = formatDoctor(failingReport(), ctx);
    assert.equal(text.includes("!"), false, platform);
    for (const id of ["git", ...TOOLS]) {
      assert.match(text, new RegExp(`^note ${id}:$`, "m"), `${platform} ${id}`);
      const note = id === "git" ? explainRuntime("git", ctx) : explainTool(id as PathProbeName, ctx);
      assert.match(text, new RegExp(`^means: ${escapeRegExp(note.means)}$`, "m"));
      assert.match(text, new RegExp(`^why: ${escapeRegExp(note.why)}$`, "m"));
      assert.match(text, new RegExp(`^fix: ${escapeRegExp(note.fix)}$`, "m"));
      assert.match(text, /^doc: docs\/dont-panic\.md$/m);
      assert.equal(note.fix.includes("!"), false);
    }
  }
  assert.match(explainRuntime("node", context("win32")).fix, /nodejs\.org/);
  assert.match(explainRuntime("node", context("darwin")).fix, /nodejs\.org/);
  assert.match(explainRuntime("node", context("linux")).fix, /nodejs\.org|distro/);
  assert.match(explainRuntime("git", context("win32")).fix, /git-scm\.com\/download\/win/);
  assert.match(explainRuntime("git", context("darwin")).fix, /xcode-select --install/);
  assert.match(explainRuntime("git", context("linux", ["dnf"])).fix, /^sudo dnf install -y git$/);
  assert.match(explainRuntime("git", context("linux", ["pacman"])).fix, /^sudo pacman -S --noconfirm git$/);
  assert.match(explainRuntime("git", context("linux", ["zypper"])).fix, /^sudo zypper install -y git$/);
  assert.match(explainRuntime("git", context("linux", ["apt-get"])).fix, /^sudo apt-get install -y git$/);
});

test("auth, session-id, and effort notes appear only when that probe failed", () => {
  const signedOut = explainDoctor({
    nodeOk: true,
    gitOk: true,
    grokOnPath: true,
    auth: "signed-out",
    sessionIdMode: "unknown",
    effortFlag: false,
    warnings: [],
  });
  assert.deepEqual(signedOut.map((note) => note.id), ["auth", "session-id", "effort"]);
  assert.match(signedOut[0]?.fix ?? "", /grok login/);
  const noFlag = explainRuntime("auth", {}, "no-flag");
  assert.match(noFlag.means, /no non-interactive status flag/);
  const unknown = explainRuntime("auth", {}, "unknown");
  assert.match(unknown.fix, /grok login/);
  const healthy = explainDoctor({
    nodeOk: true,
    gitOk: true,
    grokOnPath: true,
    auth: "signed-in",
    sessionIdMode: "uuid",
    effortFlag: true,
    warnings: [],
  });
  assert.deepEqual(healthy, []);
  const skipped = explainDoctor({
    nodeOk: false,
    gitOk: true,
    grokOnPath: false,
    auth: "signed-out",
    sessionIdMode: "unknown",
    effortFlag: false,
    warnings: [],
  });
  assert.deepEqual(skipped.map((note) => note.id), ["node", "grok"]);
});

test("doctor exit codes stay 1 only when Node is older than 22", async () => {
  const oldNode = await doctor({ nodeVersion: "v18.20.4", runner: missingRunner() });
  assert.equal(oldNode.exitCode, 1);
  assert.match(formatDoctor(oldNode.report, context("win32")), /^note node:$/m);
  const current = await doctor({ nodeVersion: "v22.14.0", runner: missingRunner() });
  assert.equal(current.exitCode, 0);
  assert.match(formatDoctor(current.report, context("linux", ["apt-get"])), /^note git:$/m);
  assert.match(formatDoctor(current.report, context("linux", ["apt-get"])), /^note pdftotext:$/m);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
