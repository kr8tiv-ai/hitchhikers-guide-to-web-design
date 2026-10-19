/**
 * Confine a site build to its project folder.
 *
 * Confirmed from grok --help and context/sources/xai/features_permissions.md:
 * --sandbox takes a profile, --deny and --allow take a rule, and a deny wins
 * over an allow. The driver uses --sandbox workspace and rules shaped
 * Read(** /.ssh/ **), Bash(*...*), Edit(...), and Write(...).
 * Docs name Bash, Edit, Read, Grep, MCPTool, WebFetch, and WebSearch.
 * They do not say whether a glob is matched on an absolute path, whether
 * List or Glob are filters, or whether Read matches the live tool name
 * read_file. build-002.log calls list_dir, grep, read_file, write,
 * search_replace, and run_terminal_command. The deny list is best effort.
 * The audit below is what the desk records after the run.
 * A Windows project path uses path.win32 even when this process is POSIX.
 * When realpath differs from the path as given (macOS /var and /private/var),
 * both spellings are confined and stripped.
 */
import { readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TOOLS = ["Read", "Grep", "Glob", "List", "Edit", "Write"] as const;
const OUTSIDE_CAP = 10;
const PATH_CHARS = 240;

const WRITE_TOOLS = new Set(["write", "search_replace", "edit", "write_file"]);
const SHELL_TOOLS = new Set(["run_terminal_command", "bash", "monitor"]);
const PATH_FIELDS = [
  "target_directory",
  "target_file",
  "path",
  "file_path",
  "file",
  "directory",
  "cwd",
] as const;

export interface OutsideAccess {
  tool: string;
  path: string;
}

export interface OutsideAudit {
  hits: OutsideAccess[];
  writePath: string;
  readPath: string;
}

export interface ConfinementOptions {
  /** Parent directory names. When set, the builder does not touch the disk. */
  siblings?: readonly string[];
  platform?: "win32" | "posix";
}

export function outsideWarning(filePath: string): string {
  return `The build looked outside its folder: ${filePath}. The deny rules should stop that.`;
}

export function outsideWriteReason(filePath: string): string {
  return `The build wrote outside its folder: ${filePath}.`;
}

/** Sandbox profile plus deny rules for the parent and each sibling. */
export function buildConfinementArgs(projectDir: string, options: ConfinementOptions = {}): string[] {
  const args = ["--sandbox", "workspace"];
  for (const rule of confinementDenyRules(projectDir, options)) args.push("--deny", rule);
  return args;
}

export function confinementDenyRules(projectDir: string, options: ConfinementOptions = {}): string[] {
  const platform = options.platform ?? platformForPath(projectDir);
  const api = pathApi(platform);
  const projects = pathSpellings(projectDir, api, options.siblings === undefined);
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const project of projects) {
    for (const rule of denyRulesFor(project, api, platform, options.siblings)) {
      if (seen.has(rule)) continue;
      seen.add(rule);
      rules.push(rule);
    }
  }
  return rules;
}

/**
 * True when a generated rule matches this path.
 * A rule is `Tool(absolute)` or `Tool(absolute/**)`. The `/**` form matches
 * that path and everything under it. Comparison is case-insensitive on win32.
 */
export function confinementRuleMatches(rule: string, candidate: string, platform?: "win32" | "posix"): boolean {
  const parsed = /^[A-Za-z]+\((.+)\)$/.exec(rule.trim());
  if (parsed === null || parsed[1] === undefined) return false;
  const pattern = toSlash(parsed[1]);
  const file = toSlash(candidate);
  const which = platform ?? (process.platform === "win32" ? "win32" : "posix");
  const fold = (value: string): string => (which === "win32" ? value.toLowerCase() : value);
  const starred = pattern.endsWith("/**");
  const base = starred ? pattern.slice(0, -3) : pattern;
  const left = fold(base);
  const right = fold(file);
  if (right === left) return true;
  return starred && right.startsWith(`${left}/`);
}

/** Tool-call path arguments, and paths written into shell commands. Capped at 10. */
export function auditOutsideAccess(stream: string, projectDir: string): OutsideAudit {
  const platform = platformForPath(projectDir);
  const projects = pathSpellings(projectDir, pathApi(platform), true);
  const hits: OutsideAccess[] = [];
  const seen = new Set<string>();
  let writePath = "";
  let readPath = "";
  const add = (tool: string, filePath: string, kind: "read" | "write"): void => {
    const shown = clipPath(filePath);
    if (shown === "") return;
    const key = `${tool}\n${shown}`;
    if (kind === "write" && writePath === "") writePath = shown;
    if (kind === "read" && readPath === "") readPath = shown;
    if (seen.has(key) || hits.length >= OUTSIDE_CAP) return;
    seen.add(key);
    hits.push({ tool, path: shown });
  };
  for (const line of stream.split(/\r?\n/)) {
    const event = parseToolCall(line);
    if (event === null) continue;
    const tool = event.tool;
    for (const filePath of event.paths) {
      if (isInsideProject(projects, filePath, platform)) continue;
      const kind = WRITE_TOOLS.has(tool) || (SHELL_TOOLS.has(tool) && shellWrites(event.command, filePath)) ? "write" : "read";
      add(tool, filePath, kind);
    }
  }
  return { hits, writePath, readPath };
}

/** Drop absolute, parent, and home paths from a generated prompt. */
export function relativizePromptText(text: string, projectDir: string): string {
  const platform = platformForPath(projectDir);
  const api = pathApi(platform);
  const projects = longestFirst(pathSpellings(projectDir, api, true));
  let next = text;
  for (const project of projects) next = replaceProjectPrefix(next, project, platform);
  const parents: string[] = [];
  for (const project of projects) {
    const parent = api.dirname(project);
    if (!samePath(parent, project, platform)) parents.push(parent);
  }
  for (const parent of longestFirst([...new Set(parents)])) next = replaceOutsidePrefix(next, parent, platform);
  const homePlatform = hostPlatform();
  const home = os.homedir();
  if (home.trim() !== "") {
    const homes = longestFirst(pathSpellings(home, pathApi(homePlatform), true));
    for (const root of homes) next = replaceOutsidePrefix(next, root, homePlatform);
  }
  next = next.replace(
    /(^|[\s"'`(])([A-Za-z]:[\\/][^\s"'`<>|]*)/g,
    "$1(outside this folder)",
  );
  next = next.replace(
    /(^|[\s"'`(])(\/(?:Users|home|tmp|var|opt|private|Volumes|mnt)\/[^\s"'`<>|]*)/g,
    "$1(outside this folder)",
  );
  next = next.replace(/(^|[\s"'`(])(~\/[^\s"'`<>|]*)/g, "$1(outside this folder)");
  return next;
}

function pathApi(platform: "win32" | "posix"): typeof path.win32 | typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

function hostPlatform(): "win32" | "posix" {
  return process.platform === "win32" ? "win32" : "posix";
}

/** Drive letters and backslashes are Windows paths on every host. */
function platformForPath(value: string): "win32" | "posix" {
  const trimmed = value.trim();
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.includes("\\")) return "win32";
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return "posix";
  return hostPlatform();
}

/**
 * The path as given, plus its realpath when that directory exists and differs.
 * macOS tmp is /var/folders while realpath is /private/var/folders. A rule or
 * a prompt strip that keeps only one spelling misses the other.
 */
function pathSpellings(
  projectDir: string,
  api: typeof path.win32 | typeof path.posix,
  real: boolean,
): string[] {
  const resolved = api.resolve(projectDir);
  if (!real) return [resolved];
  const hostWin = process.platform === "win32";
  const apiWin = api === path.win32;
  if (hostWin !== apiWin) return [resolved];
  try {
    const canonical = realpathSync(resolved);
    return canonical === resolved ? [resolved] : [resolved, canonical];
  } catch {
    return [resolved];
  }
}

function longestFirst(values: readonly string[]): string[] {
  return [...values].sort((left, right) => right.length - left.length);
}

function denyRulesFor(
  project: string,
  api: typeof path.win32 | typeof path.posix,
  platform: "win32" | "posix",
  siblings: readonly string[] | undefined,
): string[] {
  const parent = api.dirname(project);
  if (samePath(parent, project, platform)) return [];
  const names = siblings ?? readSiblingNames(parent);
  const rules: string[] = [];
  const parentSlash = toSlash(parent);
  for (const tool of TOOLS) rules.push(`${tool}(${parentSlash})`);
  for (const name of names) {
    if (!usableName(name)) continue;
    const full = api.resolve(parent, name);
    if (samePath(full, project, platform)) continue;
    const pattern = `${toSlash(full)}/**`;
    for (const tool of TOOLS) rules.push(`${tool}(${pattern})`);
  }
  return rules;
}

function readSiblingNames(parent: string): string[] {
  try {
    return readdirSync(parent);
  } catch {
    return [];
  }
}

function usableName(name: string): boolean {
  if (name === "" || name === "." || name === "..") return false;
  return !/[()[\]*?]/.test(name);
}

function toSlash(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function samePath(left: string, right: string, platform: "win32" | "posix"): boolean {
  const fold = platform === "win32" ? (value: string) => value.toLowerCase() : (value: string) => value;
  return fold(toSlash(left)) === fold(toSlash(right));
}

function isInsideProject(projects: readonly string[], candidate: string, platform: "win32" | "posix"): boolean {
  const trimmed = candidate.trim();
  if (trimmed === "" || trimmed === ".") return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return true;
  const api = platform === "win32" ? path.win32 : path.posix;
  const fold = platform === "win32" ? (value: string) => value.toLowerCase() : (value: string) => value;
  for (const project of projects) {
    const absolute = api.isAbsolute(trimmed) ? api.resolve(trimmed) : api.resolve(project, trimmed);
    const left = fold(toSlash(project));
    const right = fold(toSlash(absolute));
    if (right === left || right.startsWith(`${left}/`)) return true;
  }
  return false;
}

interface ToolEvent {
  tool: string;
  paths: string[];
  command: string;
}

function parseToolCall(line: string): ToolEvent | null {
  const start = line.indexOf("{");
  if (start < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(start));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.type !== "tool_call") return null;
  const toolName = typeof record.toolName === "string" ? record.toolName : typeof record.title === "string" ? record.title : "";
  const tool = toolName.trim().toLowerCase();
  if (tool === "") return null;
  const input = record.rawInput;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const fields = input as Record<string, unknown>;
  const paths: string[] = [];
  for (const key of PATH_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && looksLikePath(value)) paths.push(value);
  }
  const command = typeof fields.command === "string" ? fields.command : "";
  if (SHELL_TOOLS.has(tool) && command !== "") paths.push(...shellPaths(command));
  return { tool, paths, command };
}

function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 500) return false;
  if (/[A-Za-z]:[\\/]/.test(trimmed)) return true;
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return true;
  if (trimmed.startsWith(".") || trimmed.includes("/") || trimmed.includes("\\")) return true;
  return false;
}

function shellPaths(command: string): string[] {
  const found: string[] = [];
  const quoted = /['"]([A-Za-z]:[\\/][^'"]+|~?\/[^'"]+|\.\.?[\\/][^'"]+)['"]/g;
  const windows = /[A-Za-z]:[\\/][^\s"'|&;<>]+/g;
  const posix = /(?:^|[\s"'=])((?:\/|~\/)[^\s"'|&;<>]+)/g;
  const relative = /(?:^|[\s"'=])(\.\.?[\\/][^\s"'|&;<>]+)/g;
  for (const match of command.matchAll(quoted)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  for (const match of command.matchAll(windows)) {
    if (match[0] !== undefined) found.push(match[0]);
  }
  for (const match of command.matchAll(posix)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  for (const match of command.matchAll(relative)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

function shellWrites(command: string, filePath: string): boolean {
  if (!/\b(set-content|out-file|add-content|new-item|tee-object|remove-item|move-item|copy-item)\b/i.test(command) &&
      !/(?:^|[\s;|&])(?:rm|del|erase|mv|move|cp|copy)\b/i.test(command) &&
      !/[>]{1,2}/.test(command)) {
    return false;
  }
  const folded = command.replace(/\\/g, "/").toLowerCase();
  const needle = filePath.replace(/\\/g, "/").toLowerCase();
  return folded.includes(needle);
}

function clipPath(filePath: string): string {
  const clean = filePath.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean === "") return "";
  return clean.length > PATH_CHARS ? clean.slice(0, PATH_CHARS) : clean;
}

function replaceProjectPrefix(text: string, project: string, platform: "win32" | "posix"): string {
  return replacePrefix(text, project, platform, (rest) => rest.replace(/^[\\/]+/, "").replace(/\\/g, "/"));
}

function replaceOutsidePrefix(text: string, root: string, platform: "win32" | "posix"): string {
  return replacePrefix(text, root, platform, () => "(outside this folder)");
}

function replacePrefix(
  text: string,
  root: string,
  platform: "win32" | "posix",
  replacer: (rest: string) => string,
): string {
  const forms = [...new Set([root, root.replace(/\\/g, "/"), root.replace(/\//g, "\\")])].filter((form) => form.length >= 3);
  forms.sort((left, right) => right.length - left.length);
  let next = text;
  const flags = platform === "win32" ? "gi" : "g";
  for (const form of forms) {
    const re = new RegExp(
      `(^|[\\s"'\`(])${escapeReg(form)}(?![A-Za-z0-9._-])((?:[\\\\/][^\\s"'\`<>|]*)?)`,
      flags,
    );
    next = next.replace(re, (_all, lead: string, rest: string) => `${lead}${replacer(rest)}`);
  }
  return next;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
