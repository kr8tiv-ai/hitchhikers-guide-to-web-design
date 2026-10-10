import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildDriverRules,
  buildGrokArgs,
  classifyRun,
  DENY_RULES,
  invokedDirectly,
  isLiveDriverPid,
  isPromptFileName,
  listPromptFiles,
  MODEL,
  nextPrompts,
  parseDriverArgs,
  parseFrontMatter,
  readPrompt,
  resolveGrokBin,
  resumeFrom,
  shouldPush,
  textLooksLikeUsageLimit,
  turnsForKind,
} from "../src/driver-plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const promptDir = path.join(repoRoot, "hh-build-plan", "prompts");
const runnerPath = path.join(repoRoot, ".hh-driver", "run-build.mjs");
const ps1Path = path.join(repoRoot, ".hh-driver", "run-build.ps1");

/**
 * Values produced by the run-build.ps1 -match patterns on these files.
 * id is the file-name prefix, not the front-matter id field.
 */
const EXPECTED = [
  {
    file: "157-release-checklist.md",
    id: "157",
    num: 157,
    kind: "build",
    effort: "high",
    turns: 300,
    msg: "docs: add the release checklist",
    push: false,
  },
  {
    file: "158-review-156-157.md",
    id: "158",
    num: 158,
    kind: "checkpoint",
    effort: "xhigh",
    turns: 400,
    msg: "docs(review): checkpoint 158 for prompts 156 157",
    push: true,
  },
  {
    file: "159-once-over.md",
    id: "159",
    num: 159,
    kind: "once-over",
    effort: "xhigh",
    turns: 600,
    msg: "docs(once-over): v2 spec sweep and local fixes",
    push: true,
  },
] as const;

type PromptRow = {
  id: string;
  num: number;
  name: string;
  kind: string;
  effort: string;
  msg: string;
  turns: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`${key} is not a string`);
  return value;
}

function requiredNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${key} is not a number`);
  return value;
}

function asPrompt(value: unknown): PromptRow {
  if (!isRecord(value)) throw new Error("prompt is not a record");
  return {
    id: requiredString(value, "id"),
    num: requiredNumber(value, "num"),
    name: requiredString(value, "name"),
    kind: requiredString(value, "kind"),
    effort: requiredString(value, "effort"),
    msg: requiredString(value, "msg"),
    turns: requiredNumber(value, "turns"),
  };
}

function asFront(value: unknown): { id: string; kind: string; effort: string; msg: string } {
  if (!isRecord(value)) throw new Error("front matter is not a record");
  return {
    id: requiredString(value, "id"),
    kind: requiredString(value, "kind"),
    effort: requiredString(value, "effort"),
    msg: requiredString(value, "msg"),
  };
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  const end = markdown.indexOf("\n## ", start + heading.length);
  assert.ok(start >= 0, `missing ${heading}`);
  assert.ok(end > start, `missing the section after ${heading}`);
  return markdown.slice(start, end);
}

function ps1DenyRules(source: string): string[] {
  const start = source.indexOf("$DenyRules");
  const end = source.indexOf("$DriverRules");
  assert.ok(start >= 0 && end > start, "deny list markers missing from run-build.ps1");
  const block = source.slice(start, end);
  return [...block.matchAll(/'((?:Bash|Read|Edit|Write)\([^')]+\))'/g)].map((match) => {
    const rule = match[1];
    if (rule === undefined) throw new Error("deny rule capture missing");
    return rule;
  });
}

function fake(num: number, kind = "build"): PromptRow {
  const id = String(num).padStart(3, "0");
  return {
    id,
    num,
    name: `${id}-sample.md`,
    kind,
    effort: "high",
    msg: `build(${id}): ${id}-sample`,
    turns: turnsForKind(kind),
  };
}

test("importing the runner does not start it", () => {
  assert.equal(invokedDirectly(), false);
  assert.equal(invokedDirectly(runnerPath, pathToFileURL(runnerPath).href), true);
  const runner = readFileSync(runnerPath, "utf8");
  assert.match(runner, /from "\.\.\/packages\/qa\/src\/driver-plan\.mjs"/);
  assert.match(runner, /invokedDirectly\(process\.argv\[1\], import\.meta\.url\)/);
  assert.equal(runner.includes("export const MODEL"), false);
  assert.equal(runner.includes('["push", "origin", "main"]'), true);
  const imported = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(pathToFileURL(runnerPath).href)}); console.log("imported");`,
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 20_000, windowsHide: true },
  );
  assert.equal(imported.error, undefined);
  assert.equal(imported.status, 0, imported.stderr ?? "");
  assert.match(imported.stdout ?? "", /imported/);
});

test("front matter matches the PowerShell regexes for 157, 158, and 159", () => {
  const ps1 = readFileSync(ps1Path, "utf8");
  assert.equal(ps1.includes("(?s)^---\\r?\\n(.*?)\\r?\\n---"), true);
  assert.equal(ps1.includes('(?m)^kind:\\s*"?([\\w-]+)'), true);
  assert.equal(ps1.includes('(?m)^effort:\\s*"?(\\w+)'), true);
  assert.equal(ps1.includes("(?s)## Commit\\s*\\r?\\n\\s*```[^\\n]*\\r?\\n(.*?)\\r?\\n```"), true);

  for (const expected of EXPECTED) {
    const filePath = path.join(promptDir, expected.file);
    const text = readFileSync(filePath, "utf8");
    const front = asFront(parseFrontMatter(text, expected.file));
    const prompt = asPrompt(readPrompt(filePath));
    assert.equal(front.id, expected.id);
    assert.equal(front.kind, expected.kind);
    assert.equal(front.effort, expected.effort);
    assert.equal(front.msg, expected.msg);
    assert.equal(prompt.id, expected.id);
    assert.equal(prompt.num, expected.num);
    assert.equal(prompt.name, expected.file);
    assert.equal(prompt.kind, expected.kind);
    assert.equal(prompt.effort, expected.effort);
    assert.equal(prompt.msg, expected.msg);
    assert.equal(prompt.turns, expected.turns);
    assert.equal(shouldPush(prompt.kind), expected.push);
    assert.equal(prompt.msg.includes("Fix commits"), false);
  }
});

test("id comes from the file name, and missing fields use the PowerShell defaults", () => {
  const quoted = [
    "---",
    'id: "999"',
    'kind: "once-over"',
    'effort: "xhigh"',
    "---",
    "",
    "## Commit",
    "",
    "```",
    "docs: quoted",
    "```",
    "",
  ].join("\n");
  const front = asFront(parseFrontMatter(quoted, "015-quoted.md"));
  assert.equal(front.id, "015");
  assert.equal(front.kind, "once-over");
  assert.equal(front.effort, "xhigh");
  assert.equal(front.msg, "docs: quoted");
  assert.equal(turnsForKind(front.kind), 600);

  const plain = asFront(parseFrontMatter("# hello\n", "010-plain.md"));
  assert.equal(plain.kind, "build");
  assert.equal(plain.effort, "high");
  assert.equal(plain.id, "010");
  assert.equal(plain.msg, "build(010): 010-plain");
  assert.equal(turnsForKind("build"), 300);
  assert.equal(turnsForKind("Checkpoint"), 400);
  assert.equal(turnsForKind("ONCE-OVER"), 600);
});

test("CRLF front matter parses like the PowerShell patterns", () => {
  const text = "---\r\nkind: checkpoint\r\neffort: low\r\n---\r\n\r\n## Commit\r\n\r\n```\r\nfeat: crlf\r\n```\r\n";
  const front = asFront(parseFrontMatter(text, "012-crlf.md"));
  assert.equal(front.kind, "checkpoint");
  assert.equal(front.effort, "low");
  assert.equal(front.msg, "feat: crlf");
  assert.equal(shouldPush(front.kind), true);
});

test("shouldPush is true only for checkpoint and once-over", () => {
  assert.equal(shouldPush("checkpoint"), true);
  assert.equal(shouldPush("once-over"), true);
  assert.equal(shouldPush("Checkpoint"), true);
  assert.equal(shouldPush("Once-Over"), true);
  assert.equal(shouldPush("build"), false);
  assert.equal(shouldPush("review"), false);
  assert.equal(shouldPush(""), false);

  const prompts = listPromptFiles(promptDir).map((file) => asPrompt(readPrompt(file)));
  assert.ok(prompts.length > 100);
  for (const prompt of prompts) {
    const push = prompt.kind.toLowerCase() === "checkpoint" || prompt.kind.toLowerCase() === "once-over";
    assert.equal(shouldPush(prompt.kind), push, prompt.name);
  }
  assert.equal(prompts.some((prompt) => prompt.kind === "once-over" && shouldPush(prompt.kind)), true);
  assert.equal(prompts.some((prompt) => prompt.kind === "build" && shouldPush(prompt.kind)), false);
});

test("resume starts at last_done + 1", () => {
  assert.equal(resumeFrom(0, "163"), 164);
  assert.equal(resumeFrom(0, "001"), 2);
  assert.equal(resumeFrom(0, ""), 1);
  assert.equal(resumeFrom(12, "163"), 12);
  assert.equal(resumeFrom(-1, "163"), 164);

  const sample = [fake(162), fake(163), fake(164), fake(165, "checkpoint")];
  assert.deepEqual(
    nextPrompts(sample, { lastDone: "163" }).map((prompt) => asPrompt(prompt).num),
    [164, 165],
  );
  assert.deepEqual(
    nextPrompts(sample, { lastDone: "162", stopAfter: 164 }).map((prompt) => asPrompt(prompt).num),
    [163, 164],
  );
  assert.deepEqual(
    nextPrompts(sample, { startAt: 165, lastDone: "001" }).map((prompt) => asPrompt(prompt).id),
    ["165"],
  );

  const queue = listPromptFiles(promptDir).map((file) => asPrompt(readPrompt(file)));
  const resumed = nextPrompts(queue, { lastDone: "163" }).map((prompt) => asPrompt(prompt));
  assert.equal(resumed[0]?.id, "164");
  assert.equal(resumed[0]?.num, 164);
  assert.equal(resumed.every((prompt) => prompt.num >= 164), true);
  assert.equal(resumed.some((prompt) => prompt.num === 163), false);
});

test("the queue filter matches run-build.ps1 and skips 044a", () => {
  assert.equal(isPromptFileName("044a-ci-green.md"), false);
  assert.equal(isPromptFileName("INDEX.md"), false);
  assert.equal(isPromptFileName("001-monorepo-license-notice.md"), true);
  const names = listPromptFiles(promptDir).map((file) => path.basename(file));
  assert.equal(names.includes("044a-ci-green.md"), false);
  assert.equal(names.includes("INDEX.md"), false);
  assert.equal(names.includes("157-release-checklist.md"), true);
  const sorted = [...names].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  assert.deepEqual(names, sorted);
});

test("grok args mirror the PowerShell flag set", () => {
  const ps1 = readFileSync(ps1Path, "utf8");
  assert.deepEqual(DENY_RULES, ps1DenyRules(ps1));
  const marker = "Do not run git push (the driver pushes after checkpoints).";
  assert.equal(ps1.includes(marker), true);
  const rules = buildDriverRules(repoRoot);
  assert.equal(rules.includes(marker), true);
  assert.equal(rules.includes(repoRoot), true);
  assert.equal(rules.includes("&&"), true);

  const args = buildGrokArgs("---\nkind: build\n---\n", "high", 300, repoRoot);
  assert.equal(args[0], "-p=---\nkind: build\n---\n");
  assert.equal(args.includes("-m"), true);
  assert.equal(args.includes(MODEL), true);
  assert.equal(MODEL, "grok-4.7");
  assert.equal(args.includes("--effort"), true);
  assert.equal(args.includes("high"), true);
  assert.equal(args.includes("--output-format"), true);
  assert.equal(args.includes("streaming-json"), true);
  assert.equal(args.includes("--max-turns"), true);
  assert.equal(args.includes("300"), true);
  assert.equal(args.includes("--always-approve"), true);
  assert.equal(args.includes("--sandbox"), true);
  assert.equal(args.includes("workspace"), true);
  assert.equal(args.includes("--cwd"), true);
  assert.equal(args.includes(repoRoot), true);
  assert.equal(args.filter((arg) => arg === "--deny").length, DENY_RULES.length);
  assert.equal(args.includes("--rules"), true);
  assert.equal(args.includes("--force"), false);
  assert.equal(readFileSync(runnerPath, "utf8").includes('["push", "origin", "main"]'), true);
  assert.equal(readFileSync(runnerPath, "utf8").includes("--force"), false);
});

test("driver flags and grok lookup stay off the queue", () => {
  assert.deepEqual(parseDriverArgs([]), { startAt: 0, stopAfter: 0, smokeTest: false });
  assert.deepEqual(parseDriverArgs(["--start-at", "12", "--stop-after", "40"]), {
    startAt: 12,
    stopAfter: 40,
    smokeTest: false,
  });
  assert.deepEqual(parseDriverArgs(["--start-at=7", "--smoke-test"]), {
    startAt: 7,
    stopAfter: 0,
    smokeTest: true,
  });
  assert.deepEqual(parseDriverArgs(["-StartAt", "3", "-StopAfter", "9", "-SmokeTest"]), {
    startAt: 3,
    stopAfter: 9,
    smokeTest: true,
  });

  const home = path.join("home", "guide");
  const pathDir = path.join("opt", "bin");
  const onPath = path.join(pathDir, "grok");
  const homeBin = path.join(home, ".grok", "bin", "grok");
  const both = (candidate: string) => candidate === onPath || candidate === homeBin;
  assert.equal(resolveGrokBin({ PATH: pathDir }, home, "linux", both), onPath);
  assert.equal(resolveGrokBin({ PATH: pathDir }, home, "darwin", both), onPath);
  assert.equal(resolveGrokBin({ PATH: "" }, home, "linux", both), homeBin);
  const winHome = path.join(home, ".grok", "bin", "grok.exe");
  assert.equal(resolveGrokBin({ PATH: pathDir }, home, "win32", (candidate) => candidate === winHome), winHome);
  assert.equal(resolveGrokBin({ PATH: "" }, home, "linux", () => false), "grok");
});

test("usage and exit classification follow Run-Once", () => {
  assert.equal(textLooksLikeUsageLimit("ok", "usage limit reached"), true);
  assert.equal(textLooksLikeUsageLimit("ok", "HTTP 429"), true);
  assert.equal(textLooksLikeUsageLimit("all good", "still fine"), false);
  assert.equal(textLooksLikeUsageLimit('{"type":"result","text":"usage limit"}\n', ""), false);
  assert.equal(textLooksLikeUsageLimit('{"type":"error","message":"quota"}\n', ""), true);

  assert.equal(classifyRun({ code: 0, hasEnd: true, stopReason: "end_turn", usage: false }), "ok");
  assert.equal(classifyRun({ code: 0, hasEnd: true, stopReason: "end_turn", usage: true }), "ok");
  assert.equal(classifyRun({ code: 1, hasEnd: true, stopReason: "end_turn", usage: true }), "usage");
  assert.equal(classifyRun({ code: 0, hasEnd: false, stopReason: "", usage: true }), "usage");
  assert.equal(classifyRun({ code: 0, hasEnd: true, stopReason: "error", usage: true }), "usage");
  assert.equal(classifyRun({ code: 1, hasEnd: false, stopReason: "", usage: false }), "fail");
  assert.equal(classifyRun({ code: 1, hasEnd: true, stopReason: "end_turn", usage: false }), "ok");
});

test("the lock treats this node process as a driver", () => {
  assert.equal(isLiveDriverPid(process.pid), true);
  assert.equal(isLiveDriverPid(0), false);
  assert.equal(isLiveDriverPid(-5), false);
});

test("the README names both runners and when to use each", () => {
  const readme = readFileSync(path.join(repoRoot, ".hh-driver", "README.md"), "utf8");
  assert.equal(readme.includes("!"), false);
  const which = section(readme, "## Which runner");
  assert.match(which, /run-build\.ps1/);
  assert.match(which, /run-build\.mjs/);
  assert.match(which, /Windows/);
  assert.match(which, /macOS/);
  assert.match(which, /Linux/);
  assert.match(readme, /STATE\.json/);
  assert.match(readme, /last_done/);
  assert.match(readme, /PAUSE/);
  assert.match(readme, /BLOCKED\.md/);
  assert.match(readme, /driver\.pid/);
  assert.match(readme, /checkpoint/);
  assert.match(readme, /once-over/);
  assert.match(readme, /shouldPush/);
  assert.match(readme, /never force/i);
});
