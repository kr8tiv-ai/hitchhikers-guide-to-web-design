/**
 * A site build stops on a real blocker. It does not stop on a turn cap,
 * and a max_turns_reached end is a failed row with Retry, never a pass.
 * A real cap auto-retries once (238). The second cap still fails and stays put.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnGrok } from "../src/ai/grok-cli.ts";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  buildSpawnArgs,
  clearProjectBuildRunner,
  ensureSiteBuild,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  recoverSiteBuild,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { SITE_RULES } from "../src/spec/site-rules.ts";
import { generateSkeleton, type SitePrompt, type SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import { validatePackage } from "../src/spec/site-validate.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-231-"));
}

function result(code: number, stdout = "", stderr = ""): BuildSpawnResult {
  return { code, stdout, stderr, errorCode: null };
}

function calmPages() {
  return {
    pages: [
      { id: "home", title: "Home", sections: ["hero", "offer", "proof"] },
      { id: "work", title: "Work", sections: ["selected", "process"] },
      { id: "visit", title: "Visit", sections: ["hours", "find"] },
    ],
    effects: [{ id: "hero-mark", library: "css-scroll", sectionId: "hero", page: "home" }],
    features: ["contact form"],
    integrations: ["resend"],
    seoItems: ["sitemap", "json-ld"],
    stack: "astro" as const,
    protectedPaths: ["src/pages/index.astro#splash"],
  };
}

function bodyFor(entry: SitePromptSkeleton): string {
  return [
    "<objective>",
    entry.title,
    "</objective>",
    "<read_first>",
    "@.hitchhiker/CONTEXT.md#section-plan",
    "</read_first>",
    "<task>",
    entry.title,
    "</task>",
    "<must_haves>",
    `truths: [${JSON.stringify(entry.title)}]`,
    `artifacts: [${JSON.stringify(entry.filesModified[0] ?? entry.id)}]`,
    `key_links: [${JSON.stringify(`${entry.id} follows its depends_on`)}]`,
    `prohibitions: ["Do not invent testimonials"]`,
    "</must_haves>",
    "<verify>",
    "npm run build",
    "</verify>",
    "<report_back>",
    "Report the files and anything assumed.",
    "</report_back>",
    "<commit>",
    `feat(site): ${entry.id}`,
    "</commit>",
  ].join("\n");
}

function seal(maxTurns: number): SitePrompt[] {
  return generateSkeleton(calmPages()).prompts.map((entry) => ({
    ...entry,
    maxTurns,
    rules: SITE_RULES,
    body: bodyFor(entry),
  }));
}

test("site build spawn args omit --max-turns", () => {
  const args = buildSpawnArgs("C:\\work\\site", "C:\\work\\site\\.hitchhiker\\prompts\\001.md");
  assert.equal(args.includes("--max-turns"), false);
  assert.equal(args[args.indexOf("-m") + 1], "grok-4.7-build-fast");
  assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
  assert.equal(BUILD_MODEL, "grok-4.7-build-fast");
  assert.equal(BUILD_EFFORT, "xhigh");
});

test("generated site prompts do not cap turns at 40, 60, 80, or 100", () => {
  const { prompts } = generateSkeleton(calmPages());
  assert.ok(prompts.length > 0);
  const first = prompts[0]?.maxTurns;
  assert.equal(typeof first, "number");
  assert.ok(first !== undefined && first > 100);
  for (const prompt of prompts) {
    assert.equal(prompt.maxTurns, first);
    assert.equal(prompt.maxTurns === 40 || prompt.maxTurns === 60 || prompt.maxTurns === 80, false);
  }
});

test("validation still accepts an existing max_turns of 80 and accepts a value above 100", () => {
  assert.equal(validatePackage(seal(80)).ok, true);
  assert.equal(validatePackage(seal(101)).ok, true);
  assert.equal(validatePackage(seal(100_000)).ok, true);
  const broken = seal(80);
  const first = broken[0];
  assert.ok(first);
  first.maxTurns = 0;
  assert.equal(validatePackage(broken).ok, false);
});

test("a zero timeout does not kill a live child", async () => {
  const dir = tempDir();
  try {
    const output = await spawnGrok({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 300)"],
      cwd: dir,
      env: process.env,
      timeoutMs: 0,
    });
    assert.equal(output.timedOut, false);
    assert.equal(output.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exit 0 with max_turns_reached fails the row and does not advance", async () => {
  const dir = tempDir();
  const seen: string[] = [];
  const line = '{"type":"max_turns_reached","stopReason":"cancelled","num_turns":80}\n';
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.args.includes("--max-turns"), false);
    assert.equal(request.model, "grok-4.7-build-fast");
    assert.equal(request.effort, "xhigh");
    request.onOutput?.(line);
    return {
      pid: 424242,
      done: Promise.resolve(result(0, "", "Error: max turns reached")),
    };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    const written = readFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "utf8");
    assert.equal(/max_turns:\s*(40|60|80)\b/.test(written), false);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "failed");
    assert.equal(queue?.items[1]?.status, "queued");
    assert.deepEqual(seen, ["001", "001"]);
    const reason = readBuildRun(dir)?.reason ?? "";
    assert.match(reason, /80/);
    assert.match(reason, /desk sets no cap/);
    assert.match(reason, /Retry/);
    assert.equal(reason.includes("!"), false);
  } finally {
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    resetSiteBuildWatch(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recovered log with max_turns_reached and end_turn fails instead of passing", async () => {
  const dir = tempDir();
  let calls = 0;
  const spawn: BuildSpawn = () => {
    calls += 1;
    const line = '{"type":"max_turns_reached"}\n{"type":"end","stopReason":"cancelled","num_turns":80}\n';
    return { pid: 424242, done: Promise.resolve(result(0, line, "")) };
  };
  setProjectBuildRunner(dir, spawn);
  try {
    await prepareSiteBuild(dir, "Brief.");
    const queue = await loadQueue(dir);
    assert.ok(queue);
    queue.items[0] = { id: "001", kind: "build", status: "running" };
    await saveQueue(dir, queue);
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "build-run.json"),
      `${JSON.stringify({
        promptId: "001",
        status: "running",
        model: BUILD_MODEL,
        effort: BUILD_EFFORT,
        startedAt: "2026-10-13T00:00:00.000Z",
        elapsedMs: 10,
        lastLines: [],
        filesWritten: [],
        reason: "",
        pid: null,
        recovery: "",
        recoveryRerun: false,
      })}\n`,
      "utf8",
    );
    const logs = path.join(dir, ".hitchhiker", "logs");
    mkdirSync(logs, { recursive: true });
    writeFileSync(
      path.join(logs, "build-001.log"),
      '{"type":"max_turns_reached"}\n{"type":"end","stopReason":"end_turn"}\n',
      "utf8",
    );
    const prompt = readFileSync(path.join(dir, ".hitchhiker", "prompts", "001.md"), "utf8");
    const files = /^Files:\s*(.+)$/m.exec(prompt)?.[1] ?? "";
    for (const part of files.split(",")) {
      const rel = part.trim();
      if (rel === "" || rel.toLowerCase() === "none") continue;
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, "ok\n", "utf8");
    }
    await recoverSiteBuild(dir);
    await siteBuildSettled(dir);
    const after = await loadQueue(dir);
    assert.equal(after?.items.find((item) => item.id === "001")?.status, "failed");
    assert.equal(after?.items.find((item) => item.id === "002")?.status, "queued");
    assert.equal(calls, 1);
    const reason = readBuildRun(dir)?.reason ?? "";
    assert.match(reason, /desk sets no cap/);
    assert.match(reason, /Retry/);
    assert.equal(reason.includes("!"), false);
  } finally {
    await siteBuildSettled(dir);
    clearProjectBuildRunner(dir);
    resetSiteBuildWatch(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});
