/**
 * Command policy for a site-building session.
 *
 * Grok hooks fail open. A PreToolUse hook allows on exit 0, denies on
 * exit 2, and every other outcome (timeout, crash, malformed output) lets
 * the tool call proceed. This function is the second gate. The orchestrator
 * calls it before a process is started. It does not execute the command,
 * and a hook result is not a decision.
 *
 * Deny rules are data, matched as argv tokens. The joined command line is
 * not scanned with a substring check. `git commit -m "do not push"` contains
 * the word push and is still a commit, because the message stays one token.
 *
 * v2 section 11 allows a deploy only after an explicit yes on the launch
 * command. This input has no approval field, so deploy stays denied.
 */

import os from "node:os";
import path from "node:path";

export function evaluateCommand(input: {
  argv: string[];
  projectRoot: string;
  packageMeta?: { name: string; license: string; repo: string };
}): { decision: "allow" | "deny"; reason: string } {
  const tokens = tokenize(input.argv);
  if (tokens.length === 0) return deny("empty argv");

  const git = matchGit(tokens);
  if (git !== null) return deny(git);

  const remote = matchGh(tokens);
  if (remote !== null) return deny(remote);

  const deploy = matchDeploy(tokens);
  if (deploy !== null) return deny(deploy);

  const removed = matchDelete(tokens, input.projectRoot);
  if (removed !== null) return deny(removed);

  const packages = matchPackage(tokens, input.packageMeta);
  if (packages !== null) return packages;

  return allow("allowed");
}

interface Decision {
  decision: "allow" | "deny";
  reason: string;
}

interface PackageMeta {
  name: string;
  license: string;
  repo: string;
}

interface Tok {
  raw: string;
  cmd: string;
}

/**
 * Consecutive command tokens, matched from the command position.
 * A phrase is not a substring, so a commit message cannot satisfy it.
 */
const DENY_PHRASES: readonly { phrase: readonly string[]; reason: string }[] = [
  { phrase: ["git", "push"], reason: "git push is denied" },
  { phrase: ["git", "remote", "add"], reason: "git remote add is denied" },
  { phrase: ["gh", "repo", "create"], reason: "gh repo create is denied" },
  { phrase: ["wrangler", "deploy"], reason: "deploy command is denied" },
  { phrase: ["vercel", "--prod"], reason: "deploy command is denied" },
  { phrase: ["netlify", "deploy"], reason: "deploy command is denied" },
];

/** Any invocation of these tools is a deploy. wrangler and netlify still need a deploy word. */
const DEPLOY_TOOLS: ReadonlySet<string> = new Set(["vercel"]);
const DEPLOY_TOOL_WITH_WORD: ReadonlySet<string> = new Set(["wrangler", "netlify"]);

/**
 * `-c` covers both `git -c key=value` and `git -C path`.
 * Lowercasing folds `-C` onto `-c`, and both take the next token.
 */
const GIT_VALUE_FLAGS: ReadonlySet<string> = new Set([
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env",
  "--exec-path",
]);

const GH_VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--hostname",
  "--repo",
  "-r",
  "--jq",
  "--template",
]);

const PM_VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--prefix",
  "--userconfig",
  "--globalconfig",
  "--cache",
  "--registry",
  "--dir",
  "--cwd",
  "--workspace",
  "-w",
  "--filter",
  "-f",
  "--loglevel",
  "--reporter",
  "--config",
  "--omit",
  "--include",
  "--tag",
  "--network-timeout",
]);

const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(["npm", "pnpm", "yarn", "bun"]);

const DELETE_COMMANDS: ReadonlySet<string> = new Set([
  "rm",
  "rmdir",
  "rd",
  "del",
  "erase",
  "remove-item",
  "ri",
]);

const SHELLS: ReadonlySet<string> = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "pwsh",
  "powershell",
  "cmd",
]);

const INTRODUCERS: ReadonlySet<string> = new Set([
  "sudo",
  "command",
  "nohup",
  "nice",
  "npx",
  "bunx",
  "exec",
  "dlx",
  "corepack",
  "env",
  "bash",
  "sh",
  "zsh",
  "dash",
  "pwsh",
  "powershell",
  "cmd",
  "&&",
  "||",
  "|",
  ";",
]);

function deny(reason: string): Decision {
  return { decision: "deny", reason };
}

function allow(reason: string): Decision {
  return { decision: "allow", reason };
}

function normalizeCmd(token: string): string {
  let value = token.trim();
  if (value.length >= 2) {
    const open = value[0];
    const close = value[value.length - 1];
    if ((open === "\"" && close === "\"") || (open === "'" && close === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  const lower = value.toLowerCase();
  // Windows cmd flags are `/c`, `/s`, `/q`. They are not filesystem paths.
  if (/^\/[a-z]$/.test(lower)) return lower;
  const isPath =
    lower.startsWith("/") ||
    lower.startsWith("\\") ||
    lower.includes("\\") ||
    /^[a-z]:[\\/]/.test(lower);
  let base = lower;
  if (isPath) {
    const slash = Math.max(lower.lastIndexOf("/"), lower.lastIndexOf("\\"));
    if (slash >= 0) base = lower.slice(slash + 1);
  }
  return base.replace(/\.(exe|cmd|bat|ps1)$/, "");
}

function toTok(raw: string): Tok {
  return { raw, cmd: normalizeCmd(raw) };
}

/**
 * Argv elements stay whole, so a commit message is one token.
 * A single command-line string, and a shell `-c` payload, are command
 * text: those are split on whitespace and then compared as tokens.
 */
function tokenize(argv: readonly string[]): Tok[] {
  const trimmed = argv.map((arg) => arg.trim()).filter((arg) => arg !== "");
  const only = trimmed[0];
  if (trimmed.length === 1 && only !== undefined && /\s/.test(only)) {
    return only.split(/\s+/).filter((part) => part !== "").map(toTok);
  }
  const out: Tok[] = [];
  let splitNext = false;
  for (const arg of trimmed) {
    if (splitNext) {
      splitNext = false;
      for (const part of arg.split(/\s+/)) {
        if (part !== "") out.push(toTok(part));
      }
      continue;
    }
    const tok = toTok(arg);
    out.push(tok);
    const prev = out.length >= 2 ? out[out.length - 2] : undefined;
    if (prev !== undefined && SHELLS.has(prev.cmd) && isShellCommandFlag(tok.cmd)) {
      splitNext = true;
    }
  }
  return out;
}

function isShellCommandFlag(cmd: string): boolean {
  if (cmd === "-c" || cmd === "/c" || cmd === "-command" || cmd === "--command") return true;
  return /^-[a-z]*c[a-z]*$/.test(cmd);
}

function isEnvAssignment(raw: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(raw.trim());
}

function isFlag(raw: string): boolean {
  const value = raw.trim();
  if (value === "--") return true;
  if (value.startsWith("-") && value.length > 1) return true;
  return /^\/[a-zA-Z]$/.test(value);
}

function isIntroducer(tokens: readonly Tok[], index: number): boolean {
  const cmd = tokens[index]?.cmd;
  if (cmd === undefined) return false;
  if (INTRODUCERS.has(cmd)) return true;
  if (cmd === "x" || cmd === "-c" || cmd === "/c" || cmd === "-command" || cmd === "--command") {
    const prev = index > 0 ? tokens[index - 1]?.cmd : undefined;
    if (cmd === "x") {
      return prev === "npm" || prev === "pnpm" || prev === "yarn" || prev === "bun";
    }
    return prev !== undefined && SHELLS.has(prev);
  }
  return false;
}

function commandIndexes(tokens: readonly Tok[]): number[] {
  const found: number[] = [];
  const add = (start: number): void => {
    let cursor = start;
    while (cursor < tokens.length) {
      const tok = tokens[cursor];
      if (tok === undefined) break;
      if (!isEnvAssignment(tok.raw) && !isFlag(tok.raw)) break;
      cursor += 1;
    }
    if (cursor < tokens.length && !found.includes(cursor)) found.push(cursor);
  };
  if (tokens.length > 0) add(0);
  for (let index = 0; index < tokens.length; index += 1) {
    if (isIntroducer(tokens, index)) add(index + 1);
  }
  return found;
}

function startsWithPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || tokens.length < phrase.length) return false;
  for (let index = 0; index < phrase.length; index += 1) {
    if (tokens[index] !== phrase[index]) return false;
  }
  return true;
}

function reasonForCommand(head: string, rest: readonly Tok[]): string | null {
  const cmds = [head, ...rest.map((tok) => tok.cmd)];
  for (const rule of DENY_PHRASES) {
    if (startsWithPhrase(cmds, rule.phrase)) return rule.reason;
  }
  return null;
}

function skipLeadingFlags(tokens: readonly Tok[], valueFlags: ReadonlySet<string>): readonly Tok[] {
  let index = 0;
  while (index < tokens.length) {
    const tok = tokens[index];
    if (tok === undefined || !isFlag(tok.raw)) break;
    if (tok.cmd === "--") return tokens.slice(index + 1);
    const equals = tok.cmd.indexOf("=");
    const flag = equals >= 0 ? tok.cmd.slice(0, equals) : tok.cmd;
    if (equals < 0 && valueFlags.has(flag)) {
      index += 2;
      continue;
    }
    index += 1;
  }
  return tokens.slice(index);
}

function matchGit(tokens: readonly Tok[]): string | null {
  for (const index of commandIndexes(tokens)) {
    if (tokens[index]?.cmd !== "git") continue;
    const rest = skipLeadingFlags(tokens.slice(index + 1), GIT_VALUE_FLAGS);
    const reason = reasonForCommand("git", rest);
    if (reason !== null) return reason;
  }
  return null;
}

function matchGh(tokens: readonly Tok[]): string | null {
  for (const index of commandIndexes(tokens)) {
    if (tokens[index]?.cmd !== "gh") continue;
    const rest = skipLeadingFlags(tokens.slice(index + 1), GH_VALUE_FLAGS);
    const reason = reasonForCommand("gh", rest);
    if (reason !== null) return reason;
  }
  return null;
}

function isDeployWord(cmd: string): boolean {
  return cmd === "deploy" || /(^|[^a-z])deploy([^a-z]|$)/.test(cmd);
}

function matchDeploy(tokens: readonly Tok[]): string | null {
  let hostinger = false;
  let deployWord = false;
  for (const tok of tokens) {
    // A multi-word argv element is a message, not a command word.
    if (/\s/.test(tok.raw.trim())) continue;
    const hay = `${tok.raw} ${tok.cmd}`.toLowerCase();
    if (hay.includes("hostinger")) hostinger = true;
    if (isDeployWord(tok.cmd) || isDeployWord(tok.raw.toLowerCase())) deployWord = true;
  }
  if (hostinger && deployWord) return "deploy command is denied";

  for (const index of commandIndexes(tokens)) {
    const cmd = tokens[index]?.cmd;
    if (cmd === undefined) continue;
    const reason = reasonForCommand(cmd, tokens.slice(index + 1));
    if (reason !== null && reason.startsWith("deploy")) return reason;
    if (DEPLOY_TOOLS.has(cmd)) return "deploy command is denied";
    if (!DEPLOY_TOOL_WITH_WORD.has(cmd)) continue;
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const later = tokens[cursor];
      if (later !== undefined && !/\s/.test(later.raw.trim()) && isDeployWord(later.cmd)) {
        return "deploy command is denied";
      }
    }
  }
  return null;
}

function stripTrailingSep(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function pathKeys(value: string): string[] {
  const trimmed = value.trim();
  const win = stripTrailingSep(path.win32.normalize(trimmed));
  const posix = stripTrailingSep(path.posix.normalize(trimmed.replaceAll("\\", "/")));
  const windowsLike =
    os.platform() === "win32" || /[\\]/.test(trimmed) || /^[a-zA-Z]:/.test(trimmed);
  if (windowsLike) return [win.toLowerCase(), posix.toLowerCase()];
  return [win, posix];
}

function samePath(left: string, right: string): boolean {
  if (left.trim() === "" || right.trim() === "") return false;
  const rightKeys = new Set(pathKeys(right));
  for (const key of pathKeys(left)) {
    if (key !== "" && rightKeys.has(key)) return true;
  }
  return false;
}

function isFilesystemRoot(operand: string): boolean {
  const value = operand.trim();
  if (value === "") return false;
  if (/^[\\/]+$/.test(value)) return true;
  return /^[a-zA-Z]:[\\/]*$/.test(value);
}

function isDot(operand: string): boolean {
  const value = operand.trim();
  return value === "." || value === "./" || value === ".\\" || value === "./." || value === ".\\.";
}

function deleteOperands(tokens: readonly Tok[]): string[] {
  const operands: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const tok = tokens[index];
    if (tok === undefined) break;
    if (tok.cmd === "--") {
      for (const rest of tokens.slice(index + 1)) operands.push(rest.raw);
      break;
    }
    if (isFlag(tok.raw)) continue;
    operands.push(tok.raw);
  }
  return operands;
}

function matchDelete(tokens: readonly Tok[], projectRoot: string): string | null {
  for (const index of commandIndexes(tokens)) {
    const cmd = tokens[index]?.cmd;
    if (cmd === undefined || !DELETE_COMMANDS.has(cmd)) continue;
    for (const operand of deleteOperands(tokens.slice(index + 1))) {
      if (isFilesystemRoot(operand)) return "deleting a filesystem root is denied";
      if (isDot(operand) || samePath(operand, projectRoot)) {
        return "deleting the project root is denied";
      }
    }
  }
  return null;
}

function packageSpecs(tokens: readonly Tok[]): string[] {
  const names: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const tok = tokens[index];
    if (tok === undefined) break;
    if (tok.cmd === "--") {
      for (const rest of tokens.slice(index + 1)) {
        const name = rest.raw.trim();
        if (name !== "") names.push(name);
      }
      break;
    }
    if (isFlag(tok.raw)) {
      const equals = tok.cmd.indexOf("=");
      const flag = equals >= 0 ? tok.cmd.slice(0, equals) : tok.cmd;
      if (equals < 0 && PM_VALUE_FLAGS.has(flag)) index += 1;
      continue;
    }
    const name = tok.raw.trim();
    if (name !== "") names.push(name);
  }
  return names;
}

function canonicalPackageName(spec: string): string | null {
  const value = spec.trim();
  if (value === "") return null;
  if (
    value.startsWith(".") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.includes("://") ||
    value.startsWith("git+") ||
    value.startsWith("file:") ||
    value.startsWith("link:") ||
    value.startsWith("workspace:") ||
    value.startsWith("github:") ||
    value.startsWith("http:") ||
    value.startsWith("https:")
  ) {
    return null;
  }
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    if (slash < 0) return value;
    const version = value.indexOf("@", slash + 1);
    return version < 0 ? value : value.slice(0, version);
  }
  const version = value.indexOf("@");
  return version < 0 ? value : value.slice(0, version);
}

interface PackageAction {
  mode: "add" | "named" | "none";
  names: string[];
}

function packageAction(tokens: readonly Tok[]): PackageAction {
  for (const index of commandIndexes(tokens)) {
    const cmd = tokens[index]?.cmd;
    if (cmd === undefined || !PACKAGE_MANAGERS.has(cmd)) continue;
    const after = skipLeadingFlags(tokens.slice(index + 1), PM_VALUE_FLAGS);
    const sub = after[0]?.cmd ?? "";
    const specs = packageSpecs(after.slice(1));
    const names: string[] = [];
    for (const spec of specs) {
      const name = canonicalPackageName(spec);
      if (name !== null) names.push(name);
    }
    if (sub === "add") return { mode: "add", names };
    if (sub === "install" || sub === "i") {
      return { mode: specs.length > 0 ? "named" : "none", names };
    }
    return { mode: "none", names: [] };
  }
  return { mode: "none", names: [] };
}

function licenseDenied(license: string): boolean {
  const value = license.trim().toLowerCase();
  if (value.includes("affero")) return true;
  if (
    value.includes("general public license") &&
    !value.includes("lesser") &&
    !value.includes("library")
  ) {
    return true;
  }
  const tokens = value.split(/[^a-z0-9]+/).filter((token) => token !== "");
  for (const token of tokens) {
    if (token.startsWith("lgpl")) continue;
    if (token === "agpl" || token.startsWith("agpl")) return true;
    if (token === "gpl" || token.startsWith("gplv") || /^gpl\d/.test(token)) return true;
  }
  return false;
}

function matchPackage(tokens: readonly Tok[], meta: PackageMeta | undefined): Decision | null {
  const action = packageAction(tokens);
  if (action.mode === "none") return null;
  if (meta === undefined || meta.name.trim() === "" || meta.license.trim() === "") {
    return deny("legitimacy record missing");
  }
  if (meta.repo.trim() === "") return deny("package repo is empty");
  if (licenseDenied(meta.license)) return deny("package license is denied");
  const expected = meta.name.trim();
  if (action.names.some((name) => name !== expected)) {
    return deny("package name does not match the legitimacy record");
  }
  return null;
}
