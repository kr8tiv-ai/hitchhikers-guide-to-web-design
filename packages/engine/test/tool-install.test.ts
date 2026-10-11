import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertRecipeUrl,
  assertRedirectUrl,
  buildInstallPlan,
  commandOnPath,
  commitHashedFile,
  createConfirmStore,
  displayCommand,
  executePlan,
  formatMegabytes,
  installHints,
  recipeUrls,
  stepIsBlocked,
  WHISPER_ARCHIVES,
  WHISPER_MODELS,
  type InstallPlan,
  type PlanContext,
  type PlanStep,
} from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function ctx(platform: NodeJS.Platform, managers: readonly string[], arch = "x64"): PlanContext {
  const root = platform === "win32" ? "C:\\Hitchhiker\\tools" : "/var/hitchhiker/tools";
  const browsers = platform === "win32" ? "C:\\Cache\\ms-playwright" : "/var/cache/ms-playwright";
  const workspace = platform === "win32" ? "C:\\guide" : "/work/guide";
  return { platform, arch, managers, dataDir: root, browsersDir: browsers, workspaceDir: workspace };
}

function argvOf(plan: InstallPlan): string[][] {
  return plan.runSteps.map((step) => [...step.argv]);
}

test("win32 recipes name the expected argv, size, location, and manual command", () => {
  const poppler = buildInstallPlan("pdftotext", null, ctx("win32", ["scoop", "tar"]));
  assert.deepEqual(argvOf(poppler), [["scoop", "install", "poppler"]]);
  assert.equal(poppler.manualCommand, "scoop install poppler");
  assert.equal(poppler.canRun, true);
  assert.equal(poppler.needsAdmin, false);
  assert.equal(poppler.location, "The package manager puts poppler on PATH.");
  assert.equal(poppler.sizeExact, false);

  const winget = buildInstallPlan("pdftotext", null, ctx("win32", ["winget", "scoop"]));
  assert.deepEqual(argvOf(winget), []);
  assert.equal(winget.canRun, false);
  assert.equal(winget.needsAdmin, true);
  assert.match(winget.manualCommand, /^winget install /);
  assert.equal(winget.manualCommand.includes("scoop"), false);

  const grok = buildInstallPlan("grok", null, ctx("win32", ["npm"]));
  assert.deepEqual(argvOf(grok), [["npm", "install", "-g", "@xai-official/grok"]]);
  assert.equal(grok.docsUrl, "https://x.ai/docs/build/overview");
  assert.match(grok.signIn ?? "", /sign in yourself/);
  assert.match(grok.manualCommand, /irm https:\/\/x\.ai\/cli\/install\.ps1 \| iex/);
  for (const step of grok.runSteps) {
    const joined = step.argv.join(" ");
    assert.equal(joined.includes("curl"), false);
    assert.equal(joined.includes("bash"), false);
    assert.equal(joined.includes("irm"), false);
    assert.equal(joined.includes("iex"), false);
    assert.equal(joined.includes("|"), false);
  }

  const playwright = buildInstallPlan("playwright", null, ctx("win32", ["pnpm"]));
  assert.deepEqual(argvOf(playwright), [["pnpm", "exec", "playwright", "install", "chromium"]]);
  assert.equal(playwright.location, "C:\\Cache\\ms-playwright");
  assert.equal(playwright.runSteps[0], playwright.steps[0]);
  assert.equal(displayCommand(playwright.runSteps[0] as PlanStep), "pnpm exec playwright install chromium");

  const archive = WHISPER_ARCHIVES.find((item) => item.platform === "win32" && item.arch === "x64");
  const model = WHISPER_MODELS[0];
  assert.ok(archive !== undefined && model !== undefined);
  const whisper = buildInstallPlan("whisper", null, ctx("win32", ["tar"]));
  assert.equal(whisper.sizeExact, true);
  assert.equal(whisper.sizeBytes, archive.bytes + model.bytes);
  assert.equal(whisper.sizeLabel, formatMegabytes(archive.bytes + model.bytes));
  assert.equal(whisper.location, "C:\\Hitchhiker\\tools\\whisper");
  assert.equal(whisper.selectedModel, "ggml-tiny.bin");
  assert.match(whisper.manualCommand, /github\.com\/ggml-org\/whisper\.cpp/);
  assert.equal(whisper.manualCommand.includes("Hitchhiker"), false);
  const download = whisper.runSteps.find((step) => step.kind === "download");
  assert.equal(download?.sha256, archive.sha256);
  assert.equal(whisper.runSteps[1]?.argv[0], "tar");
});

test("darwin and linux recipes follow the manager that is present", () => {
  const brew = buildInstallPlan("pdftotext", null, ctx("darwin", ["brew"]));
  assert.deepEqual(argvOf(brew), [["brew", "install", "poppler"]]);
  assert.equal(brew.manualCommand, "brew install poppler");
  assert.equal(brew.canRun, true);

  const noBrew = buildInstallPlan("pdftotext", null, ctx("darwin", []));
  assert.deepEqual(argvOf(noBrew), []);
  assert.equal(noBrew.canRun, false);
  assert.equal(noBrew.manualCommand, "brew install poppler");
  assert.equal(noBrew.sourceUrl, "https://poppler.freedesktop.org/");

  const apt = buildInstallPlan("pdftotext", null, ctx("linux", ["apt-get", "dnf"]));
  assert.deepEqual(argvOf(apt), []);
  assert.equal(apt.canRun, false);
  assert.equal(apt.needsAdmin, true);
  assert.equal(apt.manualCommand, "sudo apt-get install -y poppler-utils");
  assert.equal(apt.manualCommand.includes("dnf"), false);

  const dnf = buildInstallPlan("pdftotext", null, ctx("linux", ["dnf"]));
  assert.equal(dnf.manualCommand, "sudo dnf install -y poppler-utils");
  assert.deepEqual(argvOf(dnf), []);

  const pacman = buildInstallPlan("pdftotext", null, ctx("linux", ["pacman"]));
  assert.equal(pacman.manualCommand, "sudo pacman -S --noconfirm poppler");
  const zypper = buildInstallPlan("pdftotext", null, ctx("linux", ["zypper"]));
  assert.equal(zypper.manualCommand, "sudo zypper install -y poppler-tools");
  const none = buildInstallPlan("pdftotext", null, ctx("linux", []));
  assert.equal(none.canRun, false);
  assert.equal(none.sourceUrl, "https://poppler.freedesktop.org/");

  const macWhisper = buildInstallPlan("whisper", null, ctx("darwin", ["brew", "tar"]));
  assert.equal(macWhisper.canRun, false);
  assert.equal(macWhisper.manualCommand, "brew install whisper-cpp");
  assert.deepEqual(argvOf(macWhisper), []);

  const linuxWhisper = buildInstallPlan("whisper", "ggml-base.en.bin", ctx("linux", ["tar"], "arm64"));
  assert.equal(linuxWhisper.canRun, true);
  assert.equal(linuxWhisper.selectedModel, "ggml-base.en.bin");
  assert.match(linuxWhisper.manualCommand, /whisper-bin-ubuntu-arm64\.tar\.gz/);
  assert.equal(linuxWhisper.runSteps[0]?.bytes, 4608377);
});

test("a missing package manager drops the runnable recipe", () => {
  const playwright = buildInstallPlan("playwright", null, ctx("linux", []));
  assert.deepEqual(argvOf(playwright), []);
  assert.equal(playwright.manualCommand, "pnpm exec playwright install chromium");
  assert.equal(playwright.canRun, false);
  const grok = buildInstallPlan("grok", null, ctx("darwin", []));
  assert.deepEqual(argvOf(grok), []);
  assert.match(grok.manualCommand, /curl -fsSL https:\/\/x\.ai\/cli\/install\.sh \| bash/);
  assert.equal(grok.canRun, false);
  const whisper = buildInstallPlan("whisper", null, ctx("win32", []));
  assert.equal(whisper.canRun, false);
  assert.match(whisper.note, /tar is not on PATH/);
});

test("every recipe URL is on an allow-listed host and another host fails", () => {
  for (const url of recipeUrls()) assert.doesNotThrow(() => assertRecipeUrl(url));
  const root = path.resolve(here, "..", "src", "tool-install");
  const urls: string[] = [];
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".ts")) continue;
    const source = readFileSync(path.join(root, name), "utf8");
    for (const match of source.matchAll(/https:\/\/[^\s"'`<>]+/g)) {
      if (match[0] !== undefined) urls.push(match[0]);
    }
  }
  assert.ok(urls.length > 8);
  for (const url of urls) assert.doesNotThrow(() => assertRecipeUrl(url), url);
  assert.throws(() => assertRecipeUrl("https://evil.example/tool"), /evil\.example/);
  assert.throws(() => assertRecipeUrl("http://github.com/ggml-org/whisper.cpp"), /https/);
  assert.throws(() => assertRedirectUrl("https://evil.example/file"), /evil\.example/);
  assert.doesNotThrow(() => assertRedirectUrl("https://release-assets.githubusercontent.com/abc"));
  assert.throws(() => buildInstallPlan("nope", null, ctx("linux", [])), /Unknown tool/);
});

test("a matching hash passes and a mismatch deletes the file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-hash-"));
  try {
    const partial = path.join(dir, "model.partial");
    const dest = path.join(dir, "model.bin");
    await writeFile(partial, "tiny-model");
    const expected = createHash("sha256").update("tiny-model").digest("hex");
    await commitHashedFile(partial, dest, expected);
    assert.equal(existsSync(partial), false);
    assert.equal(readFileSync(dest, "utf8"), "tiny-model");

    const bad = path.join(dir, "bad.partial");
    const badDest = path.join(dir, "bad.bin");
    await writeFile(bad, "not-the-model");
    await writeFile(badDest, "stale");
    const wrong = "ab".repeat(32);
    await assert.rejects(
      () => commitHashedFile(bad, badDest, wrong),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(`Expected ${wrong}`));
        assert.match(error.message, /Actual [0-9a-f]{64}/);
        return true;
      },
    );
    assert.equal(existsSync(bad), false);
    assert.equal(existsSync(badDest), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sudo and a piped script are refused before a process starts", async () => {
  assert.match(stepIsBlocked(["sudo", "apt-get", "install", "poppler"]) ?? "", /sudo/);
  assert.match(stepIsBlocked(["curl", "https://x.ai/cli/install.sh", "|", "bash"]) ?? "", /piped/);
  let spawned = false;
  const base = buildInstallPlan("pdftotext", null, ctx("linux", ["apt-get"]));
  const step: PlanStep = {
    id: "bad",
    argv: ["sudo", "apt-get", "install", "-y", "poppler-utils"],
    kind: "spawn",
    needsElevation: true,
    url: null,
    dest: null,
    sha256: null,
    bytes: null,
    label: "no",
  };
  const hostile: InstallPlan = { ...base, canRun: true, runSteps: [step], steps: [step] };
  const controller = new AbortController();
  await assert.rejects(
    () => executePlan(hostile, {
      signal: controller.signal,
      emit() {
        return undefined;
      },
      spawnImpl: (() => {
        spawned = true;
        return spawn(process.execPath, ["-e", "process.exit(0)"]);
      }) as typeof spawn,
    }),
    /sudo/,
  );
  assert.equal(spawned, false);
  assert.equal(base.canRun, false);
  assert.match(base.manualCommand, /^sudo /);
});

test("cancel removes a partial file and a failed command keeps the stderr tail", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-cancel-"));
  const partial = path.join(dir, "whisper.bin.partial");
  const controller = new AbortController();
  const plan = buildInstallPlan("whisper", null, ctx("linux", ["tar"]));
  const downloadOnly: InstallPlan = {
    ...plan,
    runSteps: [plan.runSteps[0] as PlanStep],
    steps: [plan.runSteps[0] as PlanStep],
  };
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const running = executePlan(downloadOnly, {
    signal: controller.signal,
    emit() {
      return undefined;
    },
    download: async (_step, ctx) => {
      await writeFile(partial, "partial");
      ctx.track(partial);
      started();
      await new Promise<void>((resolve) => {
        if (ctx.signal.aborted) resolve();
        else ctx.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new Error("stopped");
    },
  });
  await ready;
  controller.abort();
  const cancelled = await running;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.error, "Cancelled.");
  assert.equal(existsSync(partial), false);

  const failedPlan: InstallPlan = {
    ...buildInstallPlan("pdftotext", null, ctx("win32", ["scoop"])),
    runSteps: [{
      id: "fail",
      argv: [process.execPath, "-e", "process.stderr.write('poppler exit 3: package missing from the stub\\n'); process.exit(2)"],
      kind: "spawn",
      needsElevation: false,
      url: null,
      dest: null,
      sha256: null,
      bytes: null,
      label: "fail",
    }],
  };
  failedPlan.steps = failedPlan.runSteps;
  const failed = await executePlan(failedPlan, {
    signal: new AbortController().signal,
    emit() {
      return undefined;
    },
  });
  assert.equal(failed.status, "failed");
  assert.match(failed.error ?? "", /exit 2: poppler exit 3: package missing from the stub/);
  assert.equal(failed.manualCommand, "scoop install poppler");
  await rm(dir, { recursive: true, force: true });
});

test("confirm tokens expire, replay, and reject a mismatch without a second consume", () => {
  const store = createConfirmStore({ ttlMs: 1000 });
  const plan = buildInstallPlan("playwright", null, ctx("win32", ["pnpm"]));
  const issued = store.issue(plan, 0);
  assert.equal(store.lookup("", 0).ok, false);
  assert.equal(store.lookup("nope", 0).ok, false);
  assert.equal(store.lookup(issued.token, 1001).ok, false);
  if (!store.lookup(issued.token, 1001).ok) {
    assert.equal(store.lookup(issued.token, 1001).ok, false);
  }
  const expired = store.consume(issued.token, 1001);
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, "confirm token expired");
  const fresh = store.issue(plan, 5);
  const first = store.consume(fresh.token, 5);
  assert.equal(first.ok, true);
  const replay = store.consume(fresh.token, 5);
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.reason, "confirm token was already used");
});

test("hh doctor hints point at the desk and stay free of home paths", () => {
  const lines = installHints(
    {
      grokOnPath: false,
      warnings: ["playwright: not installed", "whisper: not installed", "pdftotext: not installed"],
    },
    { platform: "win32", arch: "x64", managers: ["npm", "pnpm", "scoop", "tar"], dataDir: "C:\\Hitchhiker\\tools", browsersDir: "C:\\Cache\\ms-playwright", workspaceDir: "C:\\guide" },
  );
  assert.equal(lines.length, 4);
  assert.match(lines[0] ?? "", /hint: Install grok from the desk Install button\. Manual: irm /);
  assert.match(lines[3] ?? "", /hint: Install pdftotext from the desk Install button\. Manual: scoop install poppler/);
  for (const line of lines) {
    assert.equal(line.includes("!"), false);
    assert.equal(line.includes("Hitchhiker"), false);
    assert.equal(line.includes("sudo"), false);
  }
});

test("commandOnPath sees a file placed on PATH", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-path-"));
  try {
    const file = process.platform === "win32" ? "scoop.cmd" : "scoop";
    writeFileSync(path.join(dir, file), "");
    const env = process.platform === "win32" ? { Path: dir } : { PATH: dir };
    assert.equal(commandOnPath("scoop", env, process.platform), true);
    assert.equal(commandOnPath("missing-tool", env, process.platform), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
