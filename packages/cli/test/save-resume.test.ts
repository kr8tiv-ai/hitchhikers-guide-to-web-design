import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadState, saveState, type GuideState } from "@hitchhiker/engine";
import { isPortableResume } from "../src/commands/project-file.ts";
import { parseCli, runCli } from "../src/main.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const saveModule = path.resolve(here, "../../engine/src/project-file/save.ts");

function stateFor(promptId: string, updatedAt: string): GuideState {
  const question = promptId.startsWith("interview:") ? promptId.slice("interview:".length) : promptId;
  return {
    phase: "Don't Panic",
    slice: "Towel",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Answer ${question}.`,
    updatedAt,
  };
}

test("parseCli still requires --project for a bare resume", () => {
  assert.equal(isPortableResume(["resume"]), false);
  assert.equal(isPortableResume(["resume", "--project", "sites"]), false);
  assert.equal(isPortableResume(["resume", "Towel.hhproject"]), true);
  assert.throws(
    () => parseCli(["resume"]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /--project/);
      return true;
    },
  );
});

test("hh resume --project prints the prompt id and does not rewrite state", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "hh-legacy-resume-"));
  try {
    await saveState(project, stateFor("interview:DP-0.2", "2020-01-01T00:00:00.000Z"));
    const before = readFileSync(path.join(project, ".hitchhiker", "STATE.md"), "utf8");
    const result = await runCli(["resume", "--project", project]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "resume: interview:DP-0.2\n");
    assert.equal(readFileSync(path.join(project, ".hitchhiker", "STATE.md"), "utf8"), before);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

describe("portable save and resume", { concurrency: 1 }, () => {
  const prior = process.env.HH_PROJECT_HOME;

  test("hh save writes the file and hh resume restores the question by name", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hh-cli-save-"));
    const home = path.join(root, "home");
    const project = path.join(root, "site");
    const fresh = path.join(root, "fresh");
    process.env.HH_PROJECT_HOME = home;
    try {
      await mkdir(project, { recursive: true });
      await mkdir(fresh, { recursive: true });
      await saveState(project, stateFor("interview:DP-0.2", "2020-01-01T00:00:00.000Z"));
      const saved = await runCli(["save", "--project", project, "--to", home, "--project-name-ignored"]);
      assert.equal(saved.exitCode, 1);
      const wrote = await runCli(["save", "--project", project]);
      assert.equal(wrote.exitCode, 0);
      assert.match(wrote.stdout, /^Wrote /);
      assert.match(wrote.stdout, /Restart at prompt 1\./);
      const filePath = wrote.stdout.split("\n")[0]?.replace(/^Wrote /, "") ?? "";
      assert.equal(existsSync(filePath), true);
      const byPath = await runCli(["resume", filePath, "--project", fresh]);
      assert.equal(byPath.exitCode, 0);
      assert.match(byPath.stdout, /Restored question DP-0\.2\./);
      assert.match(byPath.stdout, /Restart at prompt 1\./);
      assert.equal(loadState(fresh)?.promptId, "interview:DP-0.2");
      const other = path.join(root, "by-name");
      await mkdir(other, { recursive: true });
      const base = path.basename(project);
      const named = await runCli(["resume", base, "--project", other]);
      assert.equal(named.exitCode, 0, named.stdout);
      assert.equal(loadState(other)?.promptId, "interview:DP-0.2");
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a killed save leaves the previous file and hh resume restores that question", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hh-kill-"));
    const home = path.join(root, "home");
    const project = path.join(root, "site");
    const fresh = path.join(root, "fresh");
    const filePath = path.join(home, "Towel.hhproject");
    process.env.HH_PROJECT_HOME = home;
    try {
      await mkdir(project, { recursive: true });
      await mkdir(fresh, { recursive: true });
      await saveState(project, stateFor("interview:DP-0.2", "2020-01-01T00:00:00.000Z"));
      const first = await runCli(["save", "--project", project, "--to", filePath]);
      assert.equal(first.exitCode, 0, first.stdout);
      await saveState(project, stateFor("interview:DP-0.3", "2021-01-01T00:00:00.000Z"));
      const child = spawn(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
        {
          env: {
            ...process.env,
            HH_PROJECT_HOME: home,
            HH_PROJECT_DIR: project,
            HH_TO: filePath,
            HH_SAVE_MODULE: saveModule,
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let stderr = "";
      let stdout = "";
      child.stderr?.setEncoding("utf8");
      child.stdout?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
      });
      const temp = await waitForTemp(home, "Towel.hhproject", 20_000, () => stderr);
      const tempBody = await readFile(temp, "utf8");
      assert.match(tempBody, /DP-0\.3/);
      child.kill();
      await exited(child);
      assert.equal(stdout.includes("wrote"), false, stdout);
      const kept = JSON.parse(await readFile(filePath, "utf8")) as {
        interview: { currentQuestionId: string | null };
      };
      assert.equal(kept.interview.currentQuestionId, "DP-0.2");
      const resumed = await runCli(["resume", filePath, "--project", fresh]);
      assert.equal(resumed.exitCode, 0, resumed.stdout);
      assert.match(resumed.stdout, /Restored question DP-0\.2\./);
      assert.equal(loadState(fresh)?.promptId, "interview:DP-0.2");
      assert.equal(loadState(project)?.promptId, "interview:DP-0.3");
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
      await rm(root, { recursive: true, force: true });
    }
  });
});

function childSource(): string {
  return `
    const { pathToFileURL } = await import("node:url");
    const loaded = await import(pathToFileURL(process.env.HH_SAVE_MODULE).href);
    process.stdout.write("holding\\n");
    await loaded.saveProjectFile(process.env.HH_PROJECT_DIR, {
      to: process.env.HH_TO,
      homeDir: process.env.HH_PROJECT_HOME,
      holdBeforeRename: () => new Promise(() => {}),
    });
    process.stdout.write("wrote\\n");
  `;
}

async function waitForTemp(
  directory: string,
  base: string,
  timeoutMs: number,
  stderr: () => string,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const names = await readdir(directory);
    const found = names.find((name) => name.startsWith(`${base}.tmp-`));
    if (found !== undefined) return path.join(directory, found);
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  }
  throw new Error(`temp file did not appear\n${stderr()}`);
}

function exited(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
