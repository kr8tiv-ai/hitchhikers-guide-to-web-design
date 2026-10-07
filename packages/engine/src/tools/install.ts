/**
 * Install a discovered tool only after a yes.
 *
 * evaluateCommand lives in the orchestrator (prompt 097). The engine cannot
 * import that package: the orchestrator already depends on the engine, and
 * the engine boundary allows no workspace dependency. denyInstallPolicy
 * applies the same deny reasons before any process starts and before a
 * project config file is written. Secrets are named, never stored.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkLegitimacy, licenseDenied, type RegistryMeta, type ToolOption } from "./legitimacy.ts";

const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const SECRET_VALUE = [
  /sk-[A-Za-z0-9]{8,}/,
  /sk-ant-/,
  /ghp_[A-Za-z0-9]{8,}/,
  /github_pat_/,
  /AKIA[0-9A-Z]{16}/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/i,
  /-----BEGIN [A-Z ]+KEY-----/,
  /xox[baprs]-/,
];

const DENY_PHRASES: readonly { phrase: readonly string[]; reason: string }[] = [
  { phrase: ["git", "push"], reason: "git push is denied" },
  { phrase: ["git", "remote", "add"], reason: "git remote add is denied" },
  { phrase: ["gh", "repo", "create"], reason: "gh repo create is denied" },
  { phrase: ["wrangler", "deploy"], reason: "deploy command is denied" },
  { phrase: ["vercel", "--prod"], reason: "deploy command is denied" },
  { phrase: ["netlify", "deploy"], reason: "deploy command is denied" },
];

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
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "--dir",
  "--prefix",
  "--cwd",
  "--filter",
  "-w",
  "-f",
  "--workspace",
]);

export interface PackagePolicyMeta {
  name: string;
  license: string;
  repo: string;
}

export async function installTool(
  opt: ToolOption,
  projectDir: string,
  deps: {
    confirm: (option: ToolOption) => Promise<boolean>;
    run: (cmd: string, args: string[]) => Promise<number>;
  },
): Promise<"installed" | "declined" | "blocked"> {
  const root = path.resolve(projectDir);
  const blocked = await blockReasons(opt, root);
  if (blocked.length > 0) {
    opt.blocked = true;
    opt.blockReasons = blocked;
    return "blocked";
  }
  if (opt.secretEnv.length > 0) opt.userAsk = secretAsk(opt.secretEnv);

  const yes = await deps.confirm(opt);
  if (!yes) return "declined";

  const denied = plannedDenial(opt, root);
  if (denied !== null) {
    opt.blocked = true;
    opt.blockReasons = [denied];
    return "blocked";
  }

  if (opt.kind === "npm") {
    const code = await deps.run("pnpm", ["add", opt.name, "--dir", root]);
    if (code !== 0) {
      opt.blocked = true;
      opt.blockReasons = [`pnpm add exited ${code}`];
      return "blocked";
    }
  } else if (opt.kind === "mcp") {
    await writeMcpConfig(root, opt);
  }

  await appendNotice(root, opt);
  return "installed";
}

/**
 * The 097 deny reasons that apply to an install argv.
 * Package adds need a name, a licence, and a repository, and GPL stays denied.
 */
export function denyInstallPolicy(
  argv: readonly string[],
  projectRoot: string,
  meta: PackagePolicyMeta | undefined,
): { decision: "allow" | "deny"; reason: string } {
  const tokens = argv.map((token) => normalizeCmd(token));
  const phrase = phraseDenial(tokens);
  if (phrase !== null) return deny(phrase);
  const deploy = deployDenial(tokens);
  if (deploy !== null) return deny(deploy);
  const removed = deleteDenial(argv, projectRoot);
  if (removed !== null) return deny(removed);

  const names = packageAddNames(argv);
  if (names === null) return allow("allowed");
  if (meta === undefined || meta.name.trim() === "" || meta.license.trim() === "") {
    return deny("legitimacy record missing");
  }
  if (meta.repo.trim() === "") return deny("package repo is empty");
  if (licenseDenied(meta.license)) return deny("package license is denied");
  const expected = meta.name.trim();
  if (names.some((name) => name !== expected)) {
    return deny("package name does not match the legitimacy record");
  }
  return allow("allowed");
}

export function secretAsk(names: readonly string[]): string {
  const list = names.length === 1 ? names[0] ?? "" : names.join(", ");
  const noun = names.length === 1 ? "The value is" : "The values are";
  return `Set ${list} in the environment or the OS keychain. ${noun} not written to a file.`;
}

export function mcpServerKey(name: string): string {
  const slash = name.lastIndexOf("/");
  const tail = (slash >= 0 ? name.slice(slash + 1) : name).trim();
  let key = tail.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (/^[0-9]/.test(key)) key = `server-${key}`;
  if (key.endsWith("_")) key = `${key}server`;
  return key;
}

async function blockReasons(opt: ToolOption, projectDir: string): Promise<string[]> {
  const reasons: string[] = [];
  if (!(await directoryExists(projectDir))) reasons.push("project directory is missing");
  const leaked = secretLeak(opt);
  if (leaked !== null) reasons.push(leaked);
  for (const name of opt.secretEnv) {
    if (!ENV_NAME.test(name)) reasons.push("secret name is not an environment variable");
  }
  if (opt.kind === "npm" && !PACKAGE_NAME.test(opt.name)) {
    reasons.push("package name is not a registry name");
  }
  if (opt.kind === "mcp" && opt.command.trim() === "" && opt.url.trim() === "") {
    reasons.push("MCP server has no command or URL");
  }
  if (opt.url.trim() !== "" && urlRejected(opt.url)) {
    reasons.push("A secret would be written into a file. Set it in the environment or the OS keychain.");
  }
  const meta = metaFrom(opt);
  const gate = checkLegitimacy(opt, meta);
  if (!gate.ok) reasons.push(...gate.reasons);
  const denied = plannedDenial(opt, projectDir);
  if (denied !== null) reasons.push(denied);
  return [...new Set(reasons)];
}

function plannedDenial(opt: ToolOption, projectDir: string): string | null {
  const meta: PackagePolicyMeta = {
    name: opt.kind === "npm" ? opt.name : opt.packageName,
    license: opt.licence,
    repo: opt.repositoryUrl,
  };
  if (opt.kind === "npm") {
    const decision = denyInstallPolicy(["pnpm", "add", opt.name, "--dir", projectDir], projectDir, meta);
    return decision.decision === "deny" ? decision.reason : null;
  }
  if (opt.command.trim() === "") return null;
  const decision = denyInstallPolicy([opt.command, ...opt.args], projectDir, meta);
  return decision.decision === "deny" ? decision.reason : null;
}

function metaFrom(opt: ToolOption): RegistryMeta {
  return {
    name: opt.name,
    licence: opt.licence,
    repositoryUrl: opt.repositoryUrl,
    publishedAt: opt.publishedAt,
    weeklyDownloads: opt.weeklyDownloads,
    hasInstallScript: opt.hasInstallScript,
    installScriptExplanation: opt.installScriptExplanation,
  };
}

function secretLeak(opt: ToolOption): string | null {
  const fields = [opt.command, opt.url, opt.repositoryUrl, opt.installScriptExplanation, ...opt.args];
  for (const field of fields) {
    if (field.includes("\n") || field.includes("\r")) {
      return "A secret would be written into a file. Set it in the environment or the OS keychain.";
    }
    if (containsSecretValue(field) || embeddedCredentials(field)) {
      return "A secret would be written into a file. Set it in the environment or the OS keychain.";
    }
  }
  return null;
}

function containsSecretValue(value: string): boolean {
  if (value.includes("${")) return false;
  return SECRET_VALUE.some((pattern) => pattern.test(value));
}

function embeddedCredentials(value: string): boolean {
  if (!value.includes("://")) return false;
  try {
    const url = new URL(value);
    return url.username !== "" || url.password !== "";
  } catch {
    return false;
  }
}

function urlRejected(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;
    return url.username !== "" || url.password !== "";
  } catch {
    return true;
  }
}

async function writeMcpConfig(projectDir: string, opt: ToolOption): Promise<void> {
  const key = mcpServerKey(opt.name);
  if (key === "") throw new Error("MCP server name cannot be used as a config key.");
  const dir = path.join(projectDir, ".grok");
  const file = path.join(dir, "config.toml");
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error: unknown) {
    if (!isEnoent(error)) throw error;
  }
  const kept = removeServer(existing, key).trimEnd();
  const block = renderServer(key, opt);
  const body = kept === "" ? `${block}\n` : `${kept}\n\n${block}\n`;
  await mkdir(dir, { recursive: true });
  await writeFile(file, body, "utf8");
}

function renderServer(key: string, opt: ToolOption): string {
  const lines = [`[mcp_servers.${key}]`, "enabled = true"];
  if (opt.secretEnv.length > 0) lines.push(`# ${secretAsk(opt.secretEnv)}`);
  if (opt.url.trim() !== "") {
    lines.push(`url = ${tomlString(opt.url.trim())}`);
  } else {
    lines.push(`command = ${tomlString(opt.command.trim())}`);
    lines.push(`args = [${opt.args.map((arg) => tomlString(arg)).join(", ")}]`);
  }
  if (opt.secretEnv.length > 0) {
    const pairs = opt.secretEnv.map((name) => `${name} = ${tomlString(`\${${name}}`)}`);
    lines.push(`env = { ${pairs.join(", ")} }`);
  }
  return lines.join("\n");
}

function tomlString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function removeServer(text: string, key: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  const exact = `[mcp_servers.${key}]`;
  const nested = `[mcp_servers.${key}.`;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      skipping = trimmed === exact || trimmed.startsWith(nested);
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

async function appendNotice(projectDir: string, opt: ToolOption): Promise<void> {
  const file = path.join(projectDir, "NOTICE");
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch (error: unknown) {
    if (!isEnoent(error)) throw error;
  }
  if (existing.split(/\r?\n/).some((line) => line === opt.name)) return;
  const entry = renderNotice(opt);
  const header = "Third-party tools installed for this site\n-----------------------------------------\n\n";
  const body = existing.trim() === "" ? `${header}${entry}` : `${existing.trimEnd()}\n\n${entry}`;
  await writeFile(file, body.endsWith("\n") ? body : `${body}\n`, "utf8");
}

function renderNotice(opt: ToolOption): string {
  const registry = opt.kind === "npm"
    ? `https://www.npmjs.com/package/${opt.name}`
    : "https://registry.modelcontextprotocol.io";
  const lines = [
    opt.name,
    `  Kind: ${opt.kind}`,
    `  Registry: ${registry}`,
    `  Repository: ${opt.repositoryUrl}`,
    `  License field: ${opt.licence}`,
  ];
  if (opt.packageName !== "" && opt.packageName !== opt.name) {
    lines.push(`  Package: ${opt.packageName}`);
  }
  if (opt.licence.trim().toLowerCase() === "mpl-2.0") {
    lines.push("  MPL-2.0 is file-level copyleft.");
  }
  if (opt.secretEnv.length > 0) {
    lines.push(`  Secret names, values not stored: ${opt.secretEnv.join(", ")}`);
  }
  lines.push("  Recorded by the Guide after a yes.");
  return `${lines.join("\n")}\n`;
}

function phraseDenial(tokens: readonly string[]): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    for (const item of DENY_PHRASES) {
      const slice = tokens.slice(index, index + item.phrase.length);
      if (slice.length === item.phrase.length && slice.every((token, cursor) => token === item.phrase[cursor])) {
        return item.reason;
      }
    }
  }
  return null;
}

function deployDenial(tokens: readonly string[]): string | null {
  for (let index = 0; index < tokens.length; index += 1) {
    const cmd = tokens[index];
    if (cmd === "vercel") return "deploy command is denied";
    if (cmd !== "wrangler" && cmd !== "netlify") continue;
    for (const later of tokens.slice(index + 1)) {
      if (later === "deploy" || later.includes("deploy")) return "deploy command is denied";
    }
  }
  return null;
}

function deleteDenial(argv: readonly string[], projectRoot: string): string | null {
  const tokens = argv.map((token) => normalizeCmd(token));
  for (let index = 0; index < tokens.length; index += 1) {
    const cmd = tokens[index];
    if (cmd === undefined || !DELETE_COMMANDS.has(cmd)) continue;
    for (const operand of argv.slice(index + 1)) {
      const value = operand.trim();
      if (value === "" || value.startsWith("-")) continue;
      if (/^[\\/]+$/.test(value) || /^[a-zA-Z]:[\\/]*$/.test(value)) {
        return "deleting a filesystem root is denied";
      }
      if (value === "." || value === "./" || value === ".\\" || samePath(value, projectRoot)) {
        return "deleting the project root is denied";
      }
    }
  }
  return null;
}

function packageAddNames(argv: readonly string[]): string[] | null {
  const raw = argv.map((token) => token.trim());
  for (let index = 0; index < raw.length; index += 1) {
    const cmd = normalizeCmd(raw[index] ?? "");
    if (!PACKAGE_MANAGERS.has(cmd)) continue;
    let cursor = index + 1;
    while (cursor < raw.length && (raw[cursor] ?? "").startsWith("-")) {
      const token = raw[cursor] ?? "";
      const flag = token.split("=")[0] ?? token;
      if (!token.includes("=") && VALUE_FLAGS.has(flag)) cursor += 1;
      cursor += 1;
    }
    if ((raw[cursor] ?? "") !== "add") return null;
    const names: string[] = [];
    for (let spec = cursor + 1; spec < raw.length; spec += 1) {
      const token = raw[spec] ?? "";
      if (token === "--") {
        for (const rest of raw.slice(spec + 1)) names.push(canonicalPackageName(rest));
        break;
      }
      if (token.startsWith("-")) {
        const flag = token.split("=")[0] ?? token;
        if (!token.includes("=") && VALUE_FLAGS.has(flag)) spec += 1;
        continue;
      }
      names.push(canonicalPackageName(token));
    }
    return names;
  }
  return null;
}

function canonicalPackageName(spec: string): string {
  const value = spec.trim();
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    if (slash < 0) return value;
    const version = value.indexOf("@", slash + 1);
    return version < 0 ? value : value.slice(0, version);
  }
  const version = value.indexOf("@");
  return version < 0 ? value : value.slice(0, version);
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
  const isPath =
    lower.startsWith("/") ||
    lower.startsWith("\\") ||
    lower.includes("\\") ||
    /^[a-z]:[\\/]/.test(lower);
  let base = lower;
  if (isPath) base = path.basename(lower);
  return base.replace(/\.(exe|cmd|bat|ps1)$/, "");
}

function samePath(left: string, right: string): boolean {
  if (left.trim() === "" || right.trim() === "") return false;
  const windows = path.win32.normalize(left).replace(/[\\/]+$/, "").toLowerCase();
  const other = path.win32.normalize(right).replace(/[\\/]+$/, "").toLowerCase();
  return windows === other;
}

function deny(reason: string): { decision: "deny"; reason: string } {
  return { decision: "deny", reason };
}

function allow(reason: string): { decision: "allow"; reason: string } {
  return { decision: "allow", reason };
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const info = await stat(dir);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
