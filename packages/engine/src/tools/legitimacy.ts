/**
 * Package-legitimacy gate for a tool the Guide might install.
 *
 * The orchestrator owns evaluateCommand (prompt 097). This package cannot
 * import it: orchestrator already depends on the engine, and the engine
 * boundary allows no workspace dependencies. The licence denial matches
 * that gate. The other rules are the registry checks for this prompt.
 */

/** Weekly downloads a npm package must meet. GSD's registry floor is 1000. */
export const WEEKLY_DOWNLOAD_FLOOR = 1000;

const PUBLISH_MONTHS = 18;

/**
 * Names people mistype, and that typosquatters register on purpose.
 * Short names are omitted. A one-character substitution collides with real
 * packages (reach / react, nest / next), so the check flags a single
 * inserted or deleted character only.
 */
export const POPULAR_NAMES: readonly string[] = [
  "react",
  "react-dom",
  "angular",
  "express",
  "lodash",
  "axios",
  "webpack",
  "typescript",
  "eslint",
  "prettier",
  "jquery",
  "moment",
  "commander",
  "request",
  "minimist",
  "semver",
  "rimraf",
  "mkdirp",
  "dotenv",
  "mongoose",
  "nodemon",
  "jsonwebtoken",
  "socket.io",
  "node-fetch",
  "puppeteer",
  "playwright",
  "stripe",
  "electron",
  "fastify",
  "body-parser",
  "cookie-parser",
  "bcrypt",
  "yargs",
  "inquirer",
  "cross-env",
  "ts-node",
  "core-js",
  "tslib",
  "bluebird",
  "underscore",
  "tailwindcss",
  "langchain",
  "openai",
  "esbuild",
  "rollup",
  "postcss",
  "vite",
  "@modelcontextprotocol/sdk",
];

/** Real packages one insertion away from a popular name. */
const KNOWN_NEIGHBORS: ReadonlySet<string> = new Set(["preact", "vuex"]);

export type ToolKind = "mcp" | "npm" | "api";

export interface ToolOption {
  name: string;
  kind: ToolKind;
  why: string;
  licence: string;
  costNote: string;
  maintenance: string;
  blocked: boolean;
  blockReasons: string[];
  repositoryUrl: string;
  publishedAt: string;
  weeklyDownloads: number;
  hasInstallScript: boolean;
  installScriptExplanation: string;
  /** npm package behind an MCP server. Same as name for an npm option. */
  packageName: string;
  /** Env var names only. Values are never stored. */
  secretEnv: string[];
  command: string;
  args: string[];
  /** Remote MCP or API URL. Empty for a stdio server or an npm package. */
  url: string;
  /** Set when one registry could not be reached. */
  registryNote: string;
  /** What the user must do before the tool can authenticate. */
  userAsk: string;
}

const ALLOWED_LICENCES: ReadonlySet<string> = new Set([
  "mit",
  "apache-2.0",
  "isc",
  "unlicense",
  "zlib",
  "mpl-2.0",
  "0bsd",
  "bsd",
  "bsd-2-clause",
  "bsd-3-clause",
  "bsd-3-clause-clear",
]);

export interface RegistryMeta {
  name: string;
  licence: string;
  repositoryUrl: string;
  /** ISO-8601 time of the latest publish. */
  publishedAt: string;
  weeklyDownloads: number;
  hasInstallScript: boolean;
  /** Required when hasInstallScript is true. Empty means unexplained. */
  installScriptExplanation: string;
}

export function checkLegitimacy(
  opt: ToolOption,
  meta: RegistryMeta,
  now = Date.now(),
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (opt.name.trim() === "" || opt.name !== meta.name) {
    reasons.push("name does not match the registry record");
  }

  const licenceReason = licenceProblem(meta.licence);
  if (licenceReason !== null) reasons.push(licenceReason);

  const repoReason = repositoryProblem(opt, meta);
  if (repoReason !== null) reasons.push(repoReason);

  if (!publishedRecently(meta.publishedAt, now)) {
    reasons.push(
      Number.isNaN(Date.parse(meta.publishedAt))
        ? "last publish date is missing"
        : "last publish is older than 18 months",
    );
  }

  if (opt.kind === "npm" && meta.weeklyDownloads < WEEKLY_DOWNLOAD_FLOOR) {
    reasons.push(
      `weekly downloads ${meta.weeklyDownloads} are below the floor of ${WEEKLY_DOWNLOAD_FLOOR}`,
    );
  }

  if (meta.hasInstallScript && meta.installScriptExplanation.trim() === "") {
    reasons.push("install script is not explained");
  }

  const packageSquat =
    opt.packageName !== "" && opt.packageName !== opt.name ? typoSquatOf(opt.packageName) : null;
  const squatted = typoSquatOf(opt.name) ?? packageSquat;
  if (squatted !== null) {
    reasons.push(`name is an edit-distance typo of ${squatted}`);
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Same GPL / AGPL denial as packages/orchestrator/src/policy.ts licenseDenied.
 * LGPL is not denied here. The allow-list still rejects it.
 */
export function licenseDenied(license: string): boolean {
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

/** Popular name this string imitates, or null when it does not. */
export function typoSquatOf(name: string): string | null {
  const candidate = name.trim().toLowerCase();
  if (candidate === "" || KNOWN_NEIGHBORS.has(candidate)) return null;
  const unscoped = candidate.startsWith("@")
    ? candidate.slice(candidate.indexOf("/") + 1)
    : candidate;
  for (const popular of POPULAR_NAMES) {
    if (candidate === popular || unscoped === popular) continue;
    if (isOneCharInsertOrDelete(candidate, popular)) return popular;
    if (unscoped !== candidate && isOneCharInsertOrDelete(unscoped, popular)) return popular;
  }
  return null;
}

export function normalizeRepo(value: string): string {
  let next = value.trim();
  if (next.toLowerCase().startsWith("git+")) next = next.slice(4);
  if (next.endsWith(".git")) next = next.slice(0, -4);
  next = next.replace(/\/+$/, "");
  try {
    const url = new URL(next);
    url.hash = "";
    url.search = "";
    const pathName = url.pathname.replace(/\.git$/, "").replace(/\/+$/, "");
    return `${url.protocol}//${url.host.toLowerCase()}${pathName}`;
  } catch {
    return next.toLowerCase();
  }
}

function licenceProblem(licence: string): string | null {
  const value = licence.trim();
  if (value === "") return "licence is missing";
  if (licenseDenied(value)) return "package license is denied";
  const andParts = value.replaceAll("(", " ").replaceAll(")", " ").split(/\s+AND\s+/i);
  for (const part of andParts) {
    const choices = part.split(/\s+OR\s+/i);
    const allowed = choices.some((choice) => allowedLicenceId(choice));
    if (!allowed) return "licence is not on the allow-list";
  }
  return null;
}

function allowedLicenceId(raw: string): boolean {
  const withoutException = raw.split(/\s+WITH\s+/i)[0] ?? raw;
  const id = withoutException.trim().toLowerCase();
  return ALLOWED_LICENCES.has(id);
}

function repositoryProblem(opt: ToolOption, meta: RegistryMeta): string | null {
  if (meta.repositoryUrl.trim() === "") return "repository URL is missing";
  if (!isRepositoryUrl(meta.repositoryUrl)) return "repository URL is not a repository URL";
  if (normalizeRepo(opt.repositoryUrl) !== normalizeRepo(meta.repositoryUrl)) {
    return "repository URL does not match the package";
  }
  return null;
}

function isRepositoryUrl(value: string): boolean {
  const normalized = normalizeRepo(value);
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function publishedRecently(iso: string, now: number): boolean {
  const published = Date.parse(iso);
  if (Number.isNaN(published)) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - PUBLISH_MONTHS);
  return published >= cutoff.getTime();
}

function isOneCharInsertOrDelete(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) !== 1) return false;
  return editDistance(left, right) === 1;
}

function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: number[] = [];
    for (let col = 0; col < cols; col += 1) line.push(0);
    grid.push(line);
  }
  for (let row = 0; row < rows; row += 1) {
    const line = grid[row];
    if (line !== undefined) line[0] = row;
  }
  const header = grid[0];
  if (header !== undefined) {
    for (let col = 0; col < cols; col += 1) header[col] = col;
  }
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      const current = grid[row];
      const previous = grid[row - 1];
      if (current === undefined || previous === undefined) continue;
      const del = (previous[col] ?? 0) + 1;
      const ins = (current[col - 1] ?? 0) + 1;
      const sub = (previous[col - 1] ?? 0) + cost;
      current[col] = Math.min(del, ins, sub);
    }
  }
  return grid[left.length]?.[right.length] ?? Number.POSITIVE_INFINITY;
}
