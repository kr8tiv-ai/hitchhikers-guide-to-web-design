/**
 * BUG-043: a site build stays inside its project folder.
 * Deny rules are best effort. The audit is what the desk records.
 */
import assert from "node:assert/strict";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os, { homedir, tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { spawnLiveBuild, type BuildSpawnRequest } from "../src/guide/site-build.ts";
import { designLanguageFor, sectionIdOf, type DesignLibrary } from "../src/spec/design-language.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";
import {
  auditOutsideAccess,
  buildConfinementArgs,
  buildSpawnArgs,
  clearProjectBuildRunner,
  confinementRuleMatches,
  ensureSiteBuild,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  type BuildSpawn,
  type BuildSpawnResult,
} from "../src/index.ts";
import { SITE_RULES } from "../src/spec/site-rules.ts";
import { removeTempDir } from "./remove-temp.ts";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-site-043-"));
}

function result(code: number, stdout = ""): BuildSpawnResult {
  return { code, stdout, stderr: "", errorCode: null };
}

function denyRules(args: readonly string[]): string[] {
  const rules: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--deny") rules.push(args[index + 1] ?? "");
  }
  return rules;
}

function ruleBase(rule: string): string {
  const body = /^[A-Za-z]+\((.+)\)$/.exec(rule)?.[1] ?? "";
  return body.endsWith("/**") ? body.slice(0, -3) : body;
}

function inside(project: string, candidate: string, platform: "win32" | "posix"): boolean {
  const fold = platform === "win32" ? (value: string) => value.toLowerCase() : (value: string) => value;
  const root = fold(project.replace(/\\/g, "/").replace(/\/+$/, ""));
  const file = fold(candidate.replace(/\\/g, "/").replace(/\/+$/, ""));
  return file === root || file.startsWith(`${root}/`);
}

function toolCall(tool: string, input: Record<string, string>): string {
  return JSON.stringify({ type: "tool_call", toolName: tool, rawInput: input });
}

const DENY_PREFIXES = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"] as const;

/** Parent, sibling, and home paths each get a supported prefix, and never List(. */
function assertSupportedDenyRules(
  args: readonly string[],
  targets: { parent: string; sibling: string; home: string },
  platform: "win32" | "posix",
): void {
  const rules = denyRules(args);
  assert.equal(rules.some((rule) => rule.startsWith("List(")), false);
  for (const prefix of DENY_PREFIXES) {
    for (const [label, file] of Object.entries(targets) as [string, string][]) {
      const matched = rules.some(
        (rule) => rule.startsWith(`${prefix}(`) && confinementRuleMatches(rule, file, platform),
      );
      assert.equal(matched, true, `${prefix} denies ${label}`);
    }
  }
}

test("SITE_RULES tells the build to stay in this folder", () => {
  assert.match(SITE_RULES, /The workspace is this folder only/);
  assert.match(SITE_RULES, /use relative paths/);
  assert.match(SITE_RULES, /do not read or list the parent folder, sibling projects, or other drives/);
  assert.match(SITE_RULES, /\.hitchhiker\/tmp/);
  assert.match(SITE_RULES, /git commit -m/);
  assert.equal(SITE_RULES.includes("!"), false);
  assert.equal(SITE_RULES.includes("\u2014"), false);
  assert.equal(SITE_RULES.includes("/Users/"), false);
  assert.equal(SITE_RULES.includes("/home/"), false);
  assert.equal(/[A-Za-z]:[\\/]/.test(SITE_RULES), false);
});

test("spawn args sandbox the project and still omit --max-turns", () => {
  const args = buildSpawnArgs("C:\\work\\site", "C:\\work\\site\\.hitchhiker\\prompts\\001.md");
  assert.equal(args.includes("--max-turns"), false);
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace");
  assert.equal(args.includes("--deny"), true);
  assert.equal(args[args.indexOf("-m") + 1], "grok-4.7-build-fast");
  assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
  const rules = denyRules(args);
  for (const prefix of DENY_PREFIXES) {
    assert.equal(rules.some((rule) => rule.startsWith(`${prefix}(`)), true, prefix);
  }
  assert.equal(rules.some((rule) => rule.startsWith("List(")), false);
});

test("posix rules match the parent, a sibling, and bugs/BUG-038.md, never the project", () => {
  const project = "/tmp/My Site/project5";
  const parent = "/tmp/My Site";
  const args = buildConfinementArgs(project, {
    siblings: ["project4", "bugs", "notes.txt"],
    platform: "posix",
  });
  const rules = denyRules(args);
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace");
  assert.ok(rules.some((rule) => confinementRuleMatches(rule, parent, "posix")));
  assert.ok(rules.some((rule) => confinementRuleMatches(rule, `${parent}/project4/src/data/voice.ts`, "posix")));
  assert.ok(rules.some((rule) => confinementRuleMatches(rule, `${parent}/bugs/BUG-038.md`, "posix")));
  const owned = [
    `${project}/src/styles/tokens.css`,
    `${project}/bugs/BUG-038.md`,
    `${project}/project4/src/data/voice.ts`,
  ];
  for (const file of owned) {
    assert.equal(rules.some((rule) => confinementRuleMatches(rule, file, "posix")), false, file);
  }
  for (const rule of rules) {
    assert.equal(rule.includes("\\"), false, rule);
    assert.equal(inside(project, ruleBase(rule), "posix"), false, rule);
  }
  assertSupportedDenyRules(args, {
    parent,
    sibling: `${parent}/bugs/BUG-038.md`,
    home: homedir(),
  }, "posix");
});

test("win32 rules from a project path with spaces deny siblings and not its own files", () => {
  const root = tempDir();
  const project = path.join(root, "My Site");
  try {
    mkdirSync(path.join(project, "src", "styles"), { recursive: true });
    mkdirSync(path.join(project, "bugs"), { recursive: true });
    mkdirSync(path.join(root, "project4", "src", "data"), { recursive: true });
    mkdirSync(path.join(root, "bugs"), { recursive: true });
    writeFileSync(path.join(project, "src", "styles", "tokens.css"), "ok\n", "utf8");
    writeFileSync(path.join(project, "bugs", "BUG-038.md"), "inside\n", "utf8");
    writeFileSync(path.join(root, "bugs", "BUG-038.md"), "outside\n", "utf8");
    writeFileSync(path.join(root, "project4", "src", "data", "voice.ts"), "voice\n", "utf8");
    const args = buildConfinementArgs(project);
    const rules = denyRules(args);
    const parentBug = path.join(root, "bugs", "BUG-038.md");
    const siblingVoice = path.join(root, "project4", "src", "data", "voice.ts");
    const ownTokens = path.join(project, "src", "styles", "tokens.css");
    const ownBug = path.join(project, "bugs", "BUG-038.md");
    assert.ok(rules.some((rule) => confinementRuleMatches(rule, root, "win32")));
    assert.ok(rules.some((rule) => confinementRuleMatches(rule, parentBug, "win32")));
    assert.ok(rules.some((rule) => confinementRuleMatches(rule, parentBug.toUpperCase(), "win32")));
    assert.ok(rules.some((rule) => confinementRuleMatches(rule, siblingVoice, "win32")));
    assert.equal(rules.some((rule) => confinementRuleMatches(rule, ownTokens, "win32")), false);
    assert.equal(rules.some((rule) => confinementRuleMatches(rule, ownBug, "win32")), false);
    for (const rule of rules) {
      assert.equal(rule.includes("\\"), false, rule);
      assert.equal(inside(project, ruleBase(rule), "win32"), false, rule);
    }
    const spawn = buildSpawnArgs(project, path.join(project, ".hitchhiker", "prompts", "001.md"));
    assert.equal(spawn.includes("--max-turns"), false);
    assert.equal(spawn[spawn.indexOf("--sandbox") + 1], "workspace");
    assert.ok(denyRules(spawn).length > 0);
    const coverage = { parent: root, sibling: siblingVoice, home: homedir() };
    assertSupportedDenyRules(args, coverage, "win32");
    assertSupportedDenyRules(spawn, coverage, "win32");
  } finally {
    removeTempDir(root);
  }
});

test("generated prompts name files relatively and keep the workspace rule", async () => {
  const root = tempDir();
  const project = path.join(root, "My Site");
  mkdirSync(project, { recursive: true });
  const home = homedir();
  const brief = [
    "## Goal",
    "",
    "The site helps a visitor book a visit.",
    `Logo file: ${project}\\src\\logo.png`,
    `Do not open ${root}\\bugs\\BUG-038.md`,
    `Notes live in ${home}\\notes.txt`,
    "Guide: https://example.com/guide.",
    "A label like C:\\work\\site-map stays a whole outside path.",
  ].join("\n");
  try {
    await prepareSiteBuild(project, brief);
    const prompt = readFileSync(path.join(project, ".hitchhiker", "prompts", "001.md"), "utf8");
    assert.match(prompt, /src\/logo\.png/);
    assert.match(prompt, /The workspace is this folder only/);
    assert.match(prompt, /https:\/\/example\.com\/guide/);
    assert.equal(prompt.includes(project), false);
    assert.equal(prompt.includes(root), false);
    assert.equal(prompt.includes(home), false);
    assert.equal(/(^|[\s"'`(])[A-Za-z]:[\\/]/.test(prompt), false);
    assert.equal(prompt.includes("site-map"), false);
    const files = /^Files:\s*(.+)$/m.exec(prompt)?.[1] ?? "";
    assert.equal(/[A-Za-z]:[\\/]/.test(files), false);
    const sources = /^Content sources:\s*(.+)$/m.exec(prompt)?.[1] ?? "";
    if (sources !== "") assert.equal(/[A-Za-z]:[\\/]/.test(sources), false);
  } finally {
    removeTempDir(root);
  }
});

test("the audit flags a parent list_dir and a project4 read, and ignores in-project paths", () => {
  const project = "C:\\work\\My Site\\project5";
  const parent = "C:\\work\\My Site";
  const stream = [
    toolCall("list_dir", { target_directory: project }),
    toolCall("read_file", { target_file: `${project}\\src\\styles\\tokens.css` }),
    toolCall("grep", { pattern: "REQ-TOKENS", path: `${project}\\src` }),
    toolCall("list_dir", { target_directory: parent }),
    toolCall("read_file", { target_file: `${parent}\\project4\\src\\data\\voice.ts` }),
    toolCall("grep", { pattern: "REQ-TOKENS", path: `${parent}\\bugs\\BUG-038.md` }),
    JSON.stringify({
      type: "tool_call_update",
      toolName: "grep",
      rawOutput: { content: `${parent}\\bugs\\BUG-038.md says API error (status 402 Payment Required)` },
    }),
    toolCall("run_terminal_command", { command: `Get-Content '${parent}\\project3\\src\\styles\\fonts.css'` }),
    toolCall("read_file", { target_file: "src\\pages\\index.astro" }),
  ].join("\n");
  const audit = auditOutsideAccess(stream, project);
  const paths = audit.hits.map((hit) => hit.path.replace(/\\/g, "/").toLowerCase());
  assert.ok(audit.hits.some((hit) => hit.tool === "list_dir" && hit.path === parent));
  assert.ok(audit.hits.some((hit) => hit.tool === "read_file" && hit.path.includes("project4")));
  assert.equal(paths.some((file) => file.includes("/project5/")), false);
  assert.equal(audit.hits.some((hit) => hit.path.includes("402")), false);
  assert.equal(audit.hits.some((hit) => hit.path.includes("Payment")), false);
  assert.equal(audit.writePath, "");
  assert.ok(audit.readPath.length > 0);
  assert.ok(audit.hits.length <= 10);
});

async function twoPromptProject(root: string, project: string): Promise<void> {
  mkdirSync(project, { recursive: true });
  await prepareSiteBuild(project, "The site helps a visitor book a visit.");
  await saveQueue(project, {
    items: [
      { id: "001", kind: "build", status: "queued" },
      { id: "002", kind: "build", status: "queued" },
    ],
  });
}

test("a read outside warns on the run record and the queue continues", async () => {
  const root = tempDir();
  const project = path.join(root, "My Site");
  const seen: string[] = [];
  let warned = "";
  let hits: { tool: string; path: string }[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.args.includes("--max-turns"), false);
    assert.equal(request.args[request.args.indexOf("--sandbox") + 1], "workspace");
    if (request.promptId === "002") {
      const prior = readBuildRun(request.cwd);
      warned = prior?.reason ?? "";
      hits = prior?.outsideAccess ?? [];
    }
    const stdout =
      request.promptId === "001"
        ? `${toolCall("list_dir", { target_directory: root })}\n{"type":"end","stopReason":"end_turn"}\n`
        : '{"type":"end","stopReason":"end_turn"}\n';
    return { pid: 424242, done: Promise.resolve(result(0, stdout)) };
  };
  setProjectBuildRunner(project, spawn);
  try {
    await twoPromptProject(root, project);
    await ensureSiteBuild(project);
    const queue = await loadQueue(project);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "002")?.status, "passed");
    assert.deepEqual(seen, ["001", "002"]);
    assert.match(warned, /The build looked outside its folder:/);
    assert.match(warned, /The deny rules should stop that/);
    assert.equal(warned.includes("!"), false);
    assert.ok(hits.some((hit) => hit.tool === "list_dir"));
    assert.ok(hits.length <= 10);
    assert.equal(hits.some((hit) => /payment required|file contents/i.test(hit.path)), false);
  } finally {
    clearProjectBuildRunner(project);
    resetSiteBuildWatch(project);
    removeTempDir(root);
  }
});

function hostPlatform(): "win32" | "posix" {
  return process.platform === "win32" ? "win32" : "posix";
}

function tempTreeDenied(project: string): boolean {
  const rules = denyRules(buildConfinementArgs(project));
  const sample = path.join(tmpdir(), "site-c-commit-003.txt");
  return rules.some((rule) => rule.includes("/**") && confinementRuleMatches(rule, sample, hostPlatform()));
}

test("os temp is denied for a desktop project and open when the project is inside it", () => {
  const desktop = "C:/Users/lucid/Desktop/site-c";
  assert.equal(tempTreeDenied(desktop), true);
  const root = tempDir();
  const project = path.join(root, "site-c");
  mkdirSync(project, { recursive: true });
  try {
    assert.equal(tempTreeDenied(project), false);
    const own = path.join(project, "src", "styles", "tokens.css");
    const rules = denyRules(buildConfinementArgs(project));
    assert.equal(rules.some((rule) => confinementRuleMatches(rule, own, hostPlatform())), false);
  } finally {
    removeTempDir(root);
  }
});

test("a windows project is not treated as living under a posix temp root", (t) => {
  t.mock.method(os, "tmpdir", () => "/tmp");
  const desktop = "C:/Users/lucid/Desktop/site-c";
  const sample = "/tmp/site-c-commit-003.txt";
  const rules = denyRules(buildConfinementArgs(desktop));
  assert.equal(
    rules.some((rule) => rule.includes("/**") && confinementRuleMatches(rule, sample, "posix")),
    true,
  );
  assert.equal(
    rules.some((rule) => confinementRuleMatches(rule, `${desktop}/src/styles/tokens.css`, "win32")),
    false,
  );
  const insideProject = "/tmp/hh-site-043/site-c";
  const insideRules = denyRules(buildConfinementArgs(insideProject));
  assert.equal(
    insideRules.some((rule) => rule.includes("/**") && confinementRuleMatches(rule, sample, "posix")),
    false,
  );
  assert.equal(
    insideRules.some((rule) => confinementRuleMatches(rule, `${insideProject}/src/index.ts`, "posix")),
    false,
  );
});

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.kill = () => true;
  return child;
}

test("spawnLiveBuild keeps child temp dirs inside .hitchhiker/tmp", () => {
  const root = tempDir();
  const project = path.join(root, "site-c");
  mkdirSync(project, { recursive: true });
  const calls: SpawnOptions[] = [];
  const spawnImpl = ((command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess => {
    void command;
    void args;
    calls.push(options ?? {});
    return fakeChild();
  }) as typeof import("node:child_process").spawn;
  const request: BuildSpawnRequest = {
    command: "grok",
    args: ["--sandbox", "workspace"],
    cwd: project,
    promptId: "003",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
  };
  try {
    spawnLiveBuild("grok", request, { PATH: "C:\\Tools", KEEP: "yes" }, { spawnImpl });
    const tmpDir = path.join(project, ".hitchhiker", "tmp");
    assert.equal(existsSync(tmpDir), true);
    const env = calls[0]?.env ?? {};
    assert.equal(env.TMP, tmpDir);
    assert.equal(env.TEMP, tmpDir);
    assert.equal(env.TMPDIR, tmpDir);
    assert.equal(env.PATH, "C:\\Tools");
    assert.equal(env.KEEP, "yes");
  } finally {
    removeTempDir(root);
  }
});

function slotPrompt(title: string, requirements: string[]): SitePromptSkeleton {
  return {
    id: "003",
    phase: "babel-fish",
    slice: "tokens",
    title,
    tier: "Heart of Gold",
    effort: "xhigh",
    model: "grok-4.7-build-fast",
    dependsOn: [],
    filesModified: ["src/styles/tokens.css"],
    requirements,
    protected: [],
    reviewAfter: false,
    maxTurns: 100_000,
    kind: "build",
  };
}

test("a prompt with no section id commits the title and still calls the element the section", () => {
  const root = tempDir();
  const goldenDir = path.join(root, "golden");
  mkdirSync(goldenDir, { recursive: true });
  writeFileSync(path.join(goldenDir, "tokens.md"), "Onto {{element}}. Commit feat(site): {{section}}\n", "utf8");
  writeFileSync(path.join(goldenDir, "hero.md"), "Onto {{element}}. Commit feat(site): {{section}}\n", "utf8");
  const library: DesignLibrary = {
    goldenDir,
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is named.",
    styleText: "Calm editorial.",
  };
  try {
    const tokens = slotPrompt("Set color and type tokens from the approved brand.", ["REQ-TOKENS"]);
    assert.equal(sectionIdOf(tokens), "");
    const text = designLanguageFor(tokens, "Calm editorial.", library);
    assert.match(text, /feat\(site\): set color and type tokens from the approved brand/);
    assert.equal(text.includes("feat(site): the section"), false);
    assert.match(text, /Onto the section\./);
    const dotted = slotPrompt("Ship v1.2.", ["REQ-TOKENS"]);
    assert.match(designLanguageFor(dotted, "Calm editorial.", library), /feat\(site\): ship v1\.2/);
    const blank = slotPrompt("...", ["REQ-TOKENS"]);
    assert.match(designLanguageFor(blank, "Calm editorial.", library), /feat\(site\): the section/);
    const hero = slotPrompt("Build the hero layout on Home.", ["REQ-STRUCT-hero"]);
    assert.equal(sectionIdOf(hero), "hero");
    const heroText = designLanguageFor(hero, "Calm editorial.", library);
    assert.match(heroText, /feat\(site\): hero/);
    assert.match(heroText, /Onto hero\./);
  } finally {
    removeTempDir(root);
  }
});

test("transient grok write files and raw base64 lines stay out of build-run.json", async () => {
  const root = tempDir();
  const project = path.join(root, "site-c");
  const blob = "QUJD".repeat(12);
  const short = "QUJD".repeat(9);
  assert.ok(blob.length >= 40);
  assert.ok(short.length < 40);
  const spawn: BuildSpawn = (request) => {
    mkdirSync(path.join(project, ".hitchhiker", "tmp"), { recursive: true });
    writeFileSync(path.join(project, ".hitchhiker", "tmp", "site-c-commit-003.txt"), "commit\n", "utf8");
    if (request.promptId === "001") {
      mkdirSync(path.join(project, "src", "styles"), { recursive: true });
      writeFileSync(path.join(project, "src", "styles", "tokens.css"), ":root{}\n", "utf8");
      writeFileSync(path.join(project, ".grok-write-abc.tmp"), "temp\n", "utf8");
    } else {
      writeFileSync(path.join(project, "index.html"), "<html></html>\n", "utf8");
      writeFileSync(path.join(project, "src", ".grok-write-xyz.tmp"), "temp\n", "utf8");
    }
    request.onOutput?.(`Wrote project files.\n${blob}\n${short}\n{"type":"end","stopReason":"end_turn"}\n`);
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(project, spawn);
  try {
    await twoPromptProject(root, project);
    await ensureSiteBuild(project);
    const run = readBuildRun(project);
    const files = run?.filesWritten ?? [];
    assert.ok(files.includes("src/styles/tokens.css"));
    assert.ok(files.includes("index.html"));
    assert.equal(files.some((file) => /\.grok-write-/i.test(file)), false);
    assert.equal(files.some((file) => file.includes("site-c-commit-003")), false);
    const lines = run?.lastLines ?? [];
    assert.ok(lines.some((line) => line.includes("Wrote project files")));
    assert.equal(lines.some((line) => line.includes(blob)), false);
    assert.ok(lines.some((line) => line.includes(short)));
  } finally {
    clearProjectBuildRunner(project);
    resetSiteBuildWatch(project);
    removeTempDir(root);
  }
});

test("a write outside fails the prompt and does not start the next one", async () => {
  const root = tempDir();
  const project = path.join(root, "My Site");
  const seen: string[] = [];
  const spawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    const stdout = toolCall("search_replace", {
      file_path: path.join(root, "project4", "src", "data", "voice.ts"),
    });
    return { pid: 424242, done: Promise.resolve(result(0, stdout)) };
  };
  setProjectBuildRunner(project, spawn);
  try {
    await twoPromptProject(root, project);
    await ensureSiteBuild(project);
    const queue = await loadQueue(project);
    assert.equal(queue?.items.find((item) => item.id === "001")?.status, "failed");
    assert.equal(queue?.items.find((item) => item.id === "002")?.status, "queued");
    assert.deepEqual(seen, ["001"]);
    const run = readBuildRun(project);
    assert.match(run?.reason ?? "", /The build wrote outside its folder:/);
    assert.match(run?.reason ?? "", /project4/);
    assert.equal((run?.reason ?? "").includes("!"), false);
    assert.ok((run?.outsideAccess ?? []).some((hit) => hit.tool === "search_replace"));
  } finally {
    clearProjectBuildRunner(project);
    resetSiteBuildWatch(project);
    removeTempDir(root);
  }
});
