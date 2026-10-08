import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMMANDS,
  SIDE_EFFECT_SKILLS,
  SKILL_NAMES,
  cliSubcommandsFromSource,
  validateSkill,
} from "../src/commands.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pluginRoot, "..", "..");

const BANNED = [
  "unlock",
  "seamless",
  "revolutionize",
  "empower",
  "game-changer",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "cutting-edge",
  "journey",
  "tapestry",
  "landscape",
];

interface HookResult {
  decision: string;
  reason: string;
}

interface InspectSkill {
  name: string;
  userInvocable: boolean;
  sourcePath: string;
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function skillFiles(): string[] {
  const root = path.join(pluginRoot, "skills");
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = path.join(root, entry.name, "SKILL.md");
    assert.equal(existsSync(skill), true, entry.name);
    files.push(skill);
  }
  return files.sort();
}

function markdownFiles(): string[] {
  const files = [...skillFiles()];
  for (const dir of ["agents", "rules"]) {
    const abs = path.join(pluginRoot, dir);
    for (const name of readdirSync(abs)) {
      if (name.endsWith(".md")) files.push(path.join(abs, name));
    }
  }
  return files;
}

function frontmatter(md: string): Map<string, string> {
  const text = md.replace(/\r\n/g, "\n");
  assert.equal(text.startsWith("---\n"), true);
  const close = text.indexOf("\n---\n", 3);
  assert.notEqual(close, -1);
  const fields = new Map<string, string>();
  for (const line of text.slice(4, close).split("\n")) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    assert.ok(colon > 0, line);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return fields;
}

function objectAt(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.ok(value !== null);
  assert.equal(Array.isArray(value), false);
  return Object.fromEntries(Object.entries(value));
}

function hookScript(): string {
  const raw = objectAt(JSON.parse(read(path.join(pluginRoot, "hooks", "hh-deny.json"))));
  const hooks = objectAt(raw.hooks);
  const pre = hooks.PreToolUse;
  assert.ok(Array.isArray(pre));
  const group = objectAt(pre[0]);
  assert.equal(group.matcher, "Bash|Read|run_terminal_command|read_file");
  const handlers = group.hooks;
  assert.ok(Array.isArray(handlers));
  const handler = objectAt(handlers[0]);
  assert.equal(handler.type, "command");
  assert.equal(handler.command, 'node -e "eval(process.env.HH_DENY_HOOK)"');
  assert.equal(handler.timeout, 10);
  const env = objectAt(handler.env);
  const script = env.HH_DENY_HOOK;
  assert.equal(typeof script, "string");
  assert.ok(script.length > 0);
  return script;
}

function runHook(event: {
  tool_name: string;
  tool_input?: unknown;
  workspace_root?: string;
}): HookResult {
  const result = spawnSync(process.execPath, ["-e", "eval(process.env.HH_DENY_HOOK)"], {
    input: JSON.stringify(event),
    encoding: "utf8",
    env: { ...process.env, HH_DENY_HOOK: hookScript() },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = objectAt(JSON.parse(result.stdout));
  const decision = parsed.decision;
  const reason = parsed.reason;
  assert.equal(typeof decision, "string");
  assert.equal(typeof reason, "string");
  return { decision, reason };
}

function shell(command: string, workspace: string): HookResult {
  return runHook({
    tool_name: "run_terminal_command",
    tool_input: { command },
    workspace_root: workspace,
  });
}

function grokExecutable(): string | null {
  const where = process.platform === "win32" ? "where.exe" : "which";
  const probe = spawnSync(where, ["grok"], { encoding: "utf8", windowsHide: true });
  if (probe.status !== 0) return null;
  const line = probe.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return line ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectSkills(payload: unknown, projectDir: string): InspectSkill[] {
  assert.ok(isRecord(payload));
  const skills = payload.skills;
  assert.ok(Array.isArray(skills));
  const needle = path.resolve(projectDir).replaceAll("\\", "/").toLowerCase();
  const found: InspectSkill[] = [];
  for (const item of skills) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const source = item.source;
    const sourcePath =
      isRecord(source) && typeof source.path === "string" ? source.path : "";
    const normalized = sourcePath.replaceAll("\\", "/").toLowerCase();
    if (!normalized.includes(needle) || !normalized.includes("/.grok/skills/")) continue;
    found.push({
      name: item.name,
      userInvocable: item.userInvocable === true,
      sourcePath,
    });
  }
  return found;
}

test("skill directories are the 22 commands plus the guide persona", () => {
  const names = skillFiles().map((file) => path.basename(path.dirname(file)));
  assert.deepEqual(
    names.filter((name) => name !== "guide-persona").sort(),
    [...SKILL_NAMES].sort(),
  );
  assert.equal(names.includes("guide-persona"), true);
  assert.equal(names.length, SKILL_NAMES.length + 1);
});

test("every skill has valid frontmatter and the four side effects are model-disabled", () => {
  const seen = new Set<string>();
  for (const file of skillFiles()) {
    const dir = path.basename(path.dirname(file));
    const md = read(file);
    const errors = validateSkill(md);
    assert.deepEqual(errors, [], `${dir}: ${errors.join("; ")}`);
    const fields = frontmatter(md);
    assert.equal(fields.get("name"), dir === "guide-persona" ? "guide-persona" : dir);
    seen.add(dir);
    if (!SKILL_NAMES.includes(dir)) continue;
    assert.equal(fields.get("user-invocable"), "true", dir);
    const disabled = fields.get("disable-model-invocation") === "true";
    assert.equal(disabled, SIDE_EFFECT_SKILLS.includes(dir), dir);
    if (disabled) {
      assert.match(md, /Run this only when the user typed the slash command\./);
    }
  }
  assert.equal(seen.size, SKILL_NAMES.length + 1);
  assert.deepEqual([...SIDE_EFFECT_SKILLS].sort(), ["hh-assets", "hh-drive", "hh-so-long", "hh-undo"]);
});

test("plugin markdown avoids exclamation marks, em dashes, and banned words", () => {
  for (const file of markdownFiles()) {
    const text = read(file);
    assert.equal(text.includes("!"), false, file);
    assert.equal(text.includes("\u2014"), false, file);
    if (file.includes(`${path.sep}guide-persona${path.sep}`)) continue;
    if (file.endsWith(`${path.sep}hh-rules.md`)) continue;
    const lowered = text.toLowerCase();
    for (const word of BANNED) {
      assert.equal(lowered.includes(word), false, `${file} ${word}`);
    }
    const stripped = text
      .replaceAll("/hh-elevate", "")
      .replaceAll("hh elevate", "")
      .replaceAll("hh-elevate", "")
      .replaceAll("Elevate", "");
    assert.equal(/\belevate\b/i.test(stripped), false, file);
  }
});

test("COMMANDS matches the hh CLI subcommands", () => {
  const source = read(path.join(repoRoot, "packages", "cli", "src", "main.ts"));
  const parsed = cliSubcommandsFromSource(source);
  const listed = COMMANDS.map((command) => command.cli[0] ?? "").sort();
  assert.deepEqual(listed, parsed);
  assert.equal(new Set(listed).size, COMMANDS.length);
  for (const command of COMMANDS) {
    assert.equal(command.name, command.cli[0]);
    assert.equal(command.cli.length, 1);
    assert.equal(command.sideEffect, command.name === "assets");
    if (command.skillDir === "") {
      assert.ok(command.name === "install" || command.name === "tools");
    } else {
      assert.equal(SKILL_NAMES.includes(command.skillDir), true, command.name);
    }
  }
});

test("validateSkill rejects broken frontmatter", () => {
  const valid = read(path.join(pluginRoot, "skills", "hh-budget", "SKILL.md"));
  assert.deepEqual(validateSkill(valid), []);

  const missingFlag = valid.replace("user-invocable: true\n", "");
  assert.ok(validateSkill(missingFlag).includes("user-invocable must be true"));

  const yes = valid.replace("user-invocable: true", "user-invocable: yes");
  assert.ok(validateSkill(yes).includes("user-invocable must be true"));

  const invented = valid.replace("user-invocable: true", "user-invocable: true\ncolor: blue");
  assert.ok(validateSkill(invented).includes("unknown frontmatter key: color"));

  const side = read(path.join(pluginRoot, "skills", "hh-undo", "SKILL.md")).replace(
    "disable-model-invocation: true\n",
    "",
  );
  assert.ok(validateSkill(side).includes("disable-model-invocation must be true"));

  const quiet = valid.replace(
    "user-invocable: true",
    "user-invocable: true\ndisable-model-invocation: true",
  );
  assert.ok(validateSkill(quiet).includes("disable-model-invocation must stay unset"));
});

test("agents name a role, the tools they may use, and the handoff", () => {
  const expected = ["deep-thought.md", "eddie.md", "guide.md", "marvin.md", "zaphod.md"];
  const names = readdirSync(path.join(pluginRoot, "agents")).sort();
  assert.deepEqual(names, expected);
  for (const name of names) {
    const md = read(path.join(pluginRoot, "agents", name));
    const fields = frontmatter(md);
    assert.deepEqual([...fields.keys()].sort(), ["description", "name", "tools"]);
    assert.equal(fields.get("name"), name.replace(/\.md$/, ""));
    assert.match(md, /^## Role$/m);
    assert.match(md, /^## Tools allowed$/m);
    assert.match(md, /^## Handoff$/m);
    assert.match(md, /Never push\. Never deploy\. Never spend without the user's yes\./);
  }
});

test("the deny hook blocks push, deploy, root deletes, and credential reads", () => {
  const script = hookScript();
  assert.equal(script.includes("$"), false);
  assert.equal(script.includes("node:path"), true);
  assert.equal(script.includes("node:os"), true);
  assert.equal(existsSync(path.join(pluginRoot, "hooks", "deny-hook.js")), false);

  const project = path.join(os.tmpdir(), "hh-hook-project");
  const outside = path.join(os.tmpdir(), "hh-hook-outside");
  const inside = path.join(project, "dist");

  const denied: Array<[string, string]> = [
    ["git push", "git push is denied"],
    ["git push origin main", "git push is denied"],
    ['bash -lc "git push"', "git push is denied"],
    ["git remote add origin https://example.invalid/towel.git", "git remote add is denied"],
    ["gh repo create towel --private", "gh repo create is denied"],
    ["vercel --prod", "deploy command is denied"],
    ["npx wrangler deploy", "deploy command is denied"],
    ["hostinger deploy", "deploy command is denied"],
    ["rm -rf /", "deleting a filesystem root is denied"],
    ["rm -rf .", "deleting the project root is denied"],
    [`rm -rf ${outside}`, "deleting outside the project is denied"],
    ["cat .env.local", "reading a credential file is denied"],
  ];
  for (const [command, reason] of denied) {
    const result = shell(command, project);
    assert.equal(result.decision, "deny", command);
    assert.equal(result.reason, reason, command);
  }

  if (process.platform === "win32") {
    const root = shell("rm -rf C:\\", project);
    assert.equal(root.decision, "deny");
    assert.equal(root.reason, "deleting a filesystem root is denied");
    const wind = shell("rm -rf C:\\Windows", project);
    assert.equal(wind.decision, "deny");
    assert.equal(wind.reason, "deleting outside the project is denied");
  }

  const allowed = [
    'git commit -m "do not push"',
    "git status",
    "netlify dev",
    "rm README.md",
    `rm -rf ${inside}`,
  ];
  for (const command of allowed) {
    const result = shell(command, project);
    assert.equal(result.decision, "allow", `${command}: ${result.reason}`);
  }

  const envRead = runHook({
    tool_name: "read_file",
    tool_input: { target_file: ".env" },
    workspace_root: project,
  });
  assert.equal(envRead.decision, "deny");
  assert.equal(envRead.reason, "reading a credential file is denied");

  const readme = runHook({
    tool_name: "Read",
    tool_input: { file_path: "README.md" },
    workspace_root: project,
  });
  assert.equal(readme.decision, "allow");

  for (const file of ["keys/site.pem", path.join(".hitchhiker", "config.json"), "id_ed25519"]) {
    const result = runHook({
      tool_name: "read_file",
      tool_input: { target_file: file },
      workspace_root: project,
    });
    assert.equal(result.decision, "deny", file);
    assert.equal(result.reason, "reading a credential file is denied");
  }

  const edit = runHook({
    tool_name: "search_replace",
    tool_input: { file_path: ".env" },
    workspace_root: project,
  });
  assert.equal(edit.decision, "allow");

  const remote = runHook({
    tool_name: "Bash",
    tool_input: { argv: ["git", "-C", outside, "push", "origin"] },
    workspace_root: project,
  });
  assert.equal(remote.decision, "deny");
  assert.equal(remote.reason, "git push is denied");
});

test("hh install copies skills, agents, the deny hook, and the rules", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "hh-plugin-install-"));
  try {
    const cli = path.join(repoRoot, "packages", "cli", "src", "main.ts");
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", cli, "install", "--project", project],
      { cwd: repoRoot, encoding: "utf8", windowsHide: true },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const installed = path.join(project, ".grok", "skills", "hh-new", "SKILL.md");
    assert.equal(read(installed), read(path.join(pluginRoot, "skills", "hh-new", "SKILL.md")));
    assert.equal(
      existsSync(path.join(project, ".grok", "skills", "hh-guide-persona", "SKILL.md")),
      true,
    );
    assert.equal(existsSync(path.join(project, ".grok", "skills", "hh-hh-new")), false);
    assert.equal(
      read(path.join(project, ".grok", "agents", "hh-guide.md")),
      read(path.join(pluginRoot, "agents", "guide.md")),
    );
    assert.equal(existsSync(path.join(project, ".grok", "agents", "guide.md")), false);
    assert.equal(
      read(path.join(project, ".grok", "hooks", "hh-deny.json")),
      read(path.join(pluginRoot, "hooks", "hh-deny.json")),
    );
    assert.equal(
      read(path.join(project, ".grok", "rules", "hh-rules.md")),
      read(path.join(pluginRoot, "rules", "hh-rules.md")),
    );
    const copied = statSync(path.join(project, ".grok", "skills", "hh-help", "SKILL.md"));
    assert.ok(copied.isFile());
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("grok inspect lists the installed skills", { timeout: 120_000 }, (t: TestContext) => {
  const grok = grokExecutable();
  if (grok === null) {
    t.skip("grok is not on PATH");
    return;
  }
  const project = mkdtempSync(path.join(os.tmpdir(), "hh-plugin-inspect-"));
  const trustPath = path.join(os.homedir(), ".grok", "trusted_folders.toml");
  const original = existsSync(trustPath) ? readFileSync(trustPath) : null;
  try {
    const cli = path.join(repoRoot, "packages", "cli", "src", "main.ts");
    const installed = spawnSync(
      process.execPath,
      ["--experimental-strip-types", cli, "install", "--project", project],
      { cwd: repoRoot, encoding: "utf8", windowsHide: true },
    );
    assert.equal(installed.status, 0, installed.stderr);
    const git = spawnSync("git", ["init"], { cwd: project, encoding: "utf8", windowsHide: true });
    assert.equal(git.status, 0, git.stderr);

    const resolved = path.resolve(project);
    const forward = `${resolved.replaceAll("\\", "/")}/`;
    const stamp = Math.floor(Date.now() / 1000);
    const extra = [
      "",
      `[folders.'${resolved}']`,
      "trusted = true",
      `decided_at = ${stamp}`,
      `[folders.'${forward}']`,
      "trusted = true",
      `decided_at = ${stamp}`,
      "",
    ].join("\n");
    const base = original ?? Buffer.from("");
    writeFileSync(trustPath, Buffer.concat([base, Buffer.from(extra, "utf8")]));

    const shellNeeded = grok.toLowerCase().endsWith(".cmd") || grok.toLowerCase().endsWith(".bat");
    const inspected = spawnSync(grok, ["inspect", "--json"], {
      cwd: project,
      encoding: "utf8",
      windowsHide: true,
      shell: shellNeeded,
      timeout: 90_000,
    });
    assert.equal(inspected.status, 0, inspected.stderr);
    const payload: unknown = JSON.parse(inspected.stdout);
    assert.ok(isRecord(payload));
    const trusted = payload.projectTrusted === true;
    const skills = inspectSkills(payload, project);
    const names = new Set(skills.map((skill) => skill.name));
    const missing = SKILL_NAMES.filter((name) => !names.has(name));
    assert.deepEqual(missing, [], `trusted=${String(trusted)} root=${String(payload.projectRoot)}`);
    for (const name of SKILL_NAMES) {
      const skill = skills.find((item) => item.name === name);
      assert.ok(skill !== undefined);
      assert.equal(skill.userInvocable, true, name);
    }
  } finally {
    if (original === null) {
      if (existsSync(trustPath)) rmSync(trustPath);
    } else {
      writeFileSync(trustPath, original);
    }
    rmSync(project, { recursive: true, force: true });
  }
});
