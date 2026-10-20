/**
 * Licence half of the package-legitimacy gate.
 *
 * auditDeps checks names and SPDX expressions. It does not read the
 * registry or node_modules. Callers pass the rows they already resolved.
 *
 * Allowed identifiers: MIT, Apache-2.0, BSD (BSD, BSD-2-Clause,
 * BSD-3-Clause, BSD-3-Clause-Clear, 0BSD), ISC, Unlicense, Zlib, and
 * MPL-2.0. CC0-1.0 and BlueOak-1.0.0 are also allowed: this tree already
 * ships mdn-data and sax under those fields, and neither is GPL or AGPL.
 * An OR expression passes only when every side is allowed. An AND
 * expression fails when any side is not allowed.
 *
 * Three installed fields are not on the plain allow list, and each
 * exception is bound to the package name that ships it. D-001 requires
 * GSAP, whose registry field is the standard no-charge licence. That
 * string passes only for the package named gsap. The sharp platform
 * builds declare Apache-2.0 AND LGPL-3.0-or-later. LGPL is not GPL. That
 * expression passes only for a name that starts with @img/sharp-. Any
 * other name fails it, because AND fails when a side is not allowed.
 * sharp's prebuilt libvips binaries declare the lone identifier
 * LGPL-3.0-or-later. That lone identifier passes only for a name that
 * starts with @img/sharp-libvips-. Any other lone LGPL fails. GPL and
 * AGPL fail for every name, including sharp names. @theatre/studio and
 * potrace fail by name even when the licence field would otherwise pass.
 *
 * auditFontHandoffDir reads CREDITS.json and the font files in a handoff.
 * OFL ships the subset plus OFL.txt. ITF FFL is named and linked, and the
 * file stays out of the handoff. A Pangram face without a paid flag fails.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DO_NOT_SHIP, TRIAL_FACES } from "@hitchhiker/engine";

export interface LicenseDep {
  name: string;
  license: string | null;
}

export interface LicenseAudit {
  ok: boolean;
  problems: string[];
}

const BANNED_NAMES: ReadonlySet<string> = new Set(["@theatre/studio", "potrace"]);

const ALLOWED_IDS: ReadonlySet<string> = new Set([
  "mit",
  "apache-2.0",
  "bsd",
  "bsd-2-clause",
  "bsd-3-clause",
  "bsd-3-clause-clear",
  "0bsd",
  "isc",
  "unlicense",
  "zlib",
  "mpl-2.0",
  "cc0-1.0",
  "blueoak-1.0.0",
]);

/** Registry string on gsap. Trailing periods are ignored. */
const GSAP_STANDARD = "Standard 'no charge' license: https://gsap.com/standard-license";

/**
 * Licence field on @img/sharp-* platform builds. Compared after the
 * outer parentheses are removed and the whitespace is collapsed.
 */
const SHARP_PLATFORM = "apache-2.0 and lgpl-3.0-or-later";

/**
 * Lone licence field on @img/sharp-libvips-* binaries. Same normalization
 * as the platform expression. Other LGPL identifiers do not match.
 */
const SHARP_LIBVIPS = "lgpl-3.0-or-later";

type Token =
  | { kind: "id"; value: string }
  | { kind: "and" }
  | { kind: "or" }
  | { kind: "lparen" }
  | { kind: "rparen" };

type Expr =
  | { kind: "id"; id: string }
  | { kind: "or"; parts: Expr[] }
  | { kind: "and"; parts: Expr[] };

export function auditDeps(entries: LicenseDep[]): LicenseAudit {
  const problems: string[] = [];
  for (const entry of entries) {
    const name = entry.name.trim();
    const label = name === "" ? "(unnamed)" : name;
    if (isBannedName(name)) problems.push(`${label}: banned package name`);
    const licenseProblem = licenseIssue(name, entry.license);
    if (licenseProblem !== null) problems.push(`${label}: ${licenseProblem}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * True when NOTICE must name the expression: MPL, Zlib, an OR
 * expression, or a field this gate allows beyond the plain permissive set.
 */
export function noticeNeedsMention(license: string | null): boolean {
  if (license === null) return false;
  const trimmed = license.trim();
  if (trimmed === "") return false;
  if (isGsapStandard(trimmed) || isSharpPlatform(trimmed)) return true;
  const tokens = tokenize(trimmed);
  if (tokens === null) return false;
  if (tokens.some((token) => token.kind === "or")) return true;
  return tokens.some((token) => token.kind === "id" && isNoticeId(token.value));
}

function isBannedName(name: string): boolean {
  return BANNED_NAMES.has(name.trim().toLowerCase());
}

function licenseIssue(name: string, license: string | null): string | null {
  if (license === null || license.trim() === "") return "license is missing";
  const trimmed = license.trim();
  if (trimmed.toLowerCase() === "unlicensed") return "UNLICENSED is proprietary";
  const prose = proseDenial(trimmed);
  if (prose !== null) return prose;
  if (isGsapStandard(trimmed) && isGsapPackage(name)) return null;
  if (isSharpPlatform(trimmed) && isSharpPlatformPackage(name)) return null;
  if (isSharpLibvips(trimmed) && isSharpLibvipsPackage(name)) return null;
  const tokens = tokenize(trimmed);
  if (tokens === null) return "license is not allowed";
  const expr = parseExpression(tokens);
  if (expr === null) return "license is not allowed";
  const issues = problemsIn(expr);
  if (issues.length === 0) return null;
  return issues.join("; ");
}

function proseDenial(license: string): string | null {
  const value = license.toLowerCase();
  if (value.includes("affero")) return "AGPL is not allowed";
  if (
    value.includes("general public license")
    && !value.includes("lesser")
    && !value.includes("library")
  ) {
    return "GPL is not allowed";
  }
  return null;
}

function isGsapPackage(name: string): boolean {
  return name.trim().toLowerCase() === "gsap";
}

/** Platform builds such as @img/sharp-win32-x64 and @img/sharp-linux-x64. */
function isSharpPlatformPackage(name: string): boolean {
  return name.trim().toLowerCase().startsWith("@img/sharp-");
}

/** Prebuilt libvips binaries such as @img/sharp-libvips-linux-x64. */
function isSharpLibvipsPackage(name: string): boolean {
  return name.trim().toLowerCase().startsWith("@img/sharp-libvips-");
}

function isGsapStandard(license: string): boolean {
  const value = collapse(license).replace(/\.+$/u, "");
  return value === GSAP_STANDARD;
}

function isSharpPlatform(license: string): boolean {
  return normalizedLicense(license) === SHARP_PLATFORM;
}

function isSharpLibvips(license: string): boolean {
  return normalizedLicense(license) === SHARP_LIBVIPS;
}

function normalizedLicense(license: string): string {
  let value = collapse(license);
  let inner = unwrap(value);
  while (inner !== null) {
    value = collapse(inner);
    inner = unwrap(value);
  }
  return value.toLowerCase();
}

function unwrap(value: string): string | null {
  if (value.length < 2 || value.charAt(0) !== "(" || value.charAt(value.length - 1) !== ")") {
    return null;
  }
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0 && index !== value.length - 1) return null;
    }
  }
  if (depth !== 0) return null;
  return value.slice(1, -1).trim();
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /[A-Za-z0-9.+-]+|\(|\)/y;
  let index = 0;
  while (index < input.length) {
    const char = input.charAt(index);
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    pattern.lastIndex = index;
    const match = pattern.exec(input);
    const value = match?.[0];
    if (match === null || value === undefined || match.index !== index) return null;
    index = pattern.lastIndex;
    tokens.push(classify(value));
  }
  return tokens;
}

function classify(value: string): Token {
  if (value === "(") return { kind: "lparen" };
  if (value === ")") return { kind: "rparen" };
  if (/^and$/i.test(value)) return { kind: "and" };
  if (/^or$/i.test(value)) return { kind: "or" };
  return { kind: "id", value };
}

function parseExpression(tokens: readonly Token[]): Expr | null {
  const parser = { tokens, index: 0 };
  const expr = parseOr(parser);
  if (expr === null || parser.index !== tokens.length) return null;
  return expr;
}

function parseOr(parser: { tokens: readonly Token[]; index: number }): Expr | null {
  const first = parseAnd(parser);
  if (first === null) return null;
  const parts: Expr[] = [first];
  while (peek(parser)?.kind === "or") {
    parser.index += 1;
    const next = parseAnd(parser);
    if (next === null) return null;
    parts.push(next);
  }
  if (parts.length === 1) return first;
  return { kind: "or", parts };
}

function parseAnd(parser: { tokens: readonly Token[]; index: number }): Expr | null {
  const first = parsePrimary(parser);
  if (first === null) return null;
  const parts: Expr[] = [first];
  while (peek(parser)?.kind === "and") {
    parser.index += 1;
    const next = parsePrimary(parser);
    if (next === null) return null;
    parts.push(next);
  }
  if (parts.length === 1) return first;
  return { kind: "and", parts };
}

function parsePrimary(parser: { tokens: readonly Token[]; index: number }): Expr | null {
  const token = peek(parser);
  if (token === undefined) return null;
  if (token.kind === "lparen") {
    parser.index += 1;
    const inner = parseOr(parser);
    if (inner === null) return null;
    if (peek(parser)?.kind !== "rparen") return null;
    parser.index += 1;
    return inner;
  }
  if (token.kind !== "id") return null;
  parser.index += 1;
  return { kind: "id", id: token.value };
}

function peek(parser: { tokens: readonly Token[]; index: number }): Token | undefined {
  return parser.tokens[parser.index];
}

function problemsIn(expr: Expr): string[] {
  if (expr.kind === "id") {
    const issue = idProblem(expr.id);
    return issue === null ? [] : [issue];
  }
  const found: string[] = [];
  for (const part of expr.parts) found.push(...problemsIn(part));
  return found;
}

function idProblem(id: string): string | null {
  const value = id.toLowerCase();
  if (value === "unlicensed") return `${id} is proprietary`;
  if (isGplOrAgpl(value)) return `${id} is not allowed`;
  if (ALLOWED_IDS.has(value)) return null;
  return `${id} is not allowed`;
}

function isGplOrAgpl(value: string): boolean {
  if (value.startsWith("lgpl")) return false;
  if (value.startsWith("agpl") || value.includes("affero")) return true;
  return value === "gpl" || value.startsWith("gpl-") || value.startsWith("gpl+") || /^gpl\d/.test(value);
}

function isNoticeId(id: string): boolean {
  const value = id.toLowerCase();
  if (value === "zlib" || value === "mpl" || value.startsWith("mpl-")) return true;
  if (value === "blueoak-1.0.0" || value === "cc0-1.0") return true;
  return value === "lgpl" || value.startsWith("lgpl-") || value.startsWith("lgpl+");
}

const FONT_FILE = /\.(?:woff2?|ttf|otf)$/i;
const TRIAL_NAMES = new Set(
  [...TRIAL_FACES, ...DO_NOT_SHIP.flatMap((face) => [face.display, face.body])]
    .map((name) => name.toLowerCase())
    .filter((name) => name !== "client-licensed grotesque"),
);

interface FontCredit {
  name: string;
  license: string;
  link: string;
  paid: boolean;
}

/** Font files and CREDITS.json in a built-site handoff. Does not read npm. */
export function auditFontHandoffDir(dir: string): LicenseAudit {
  const problems: string[] = [];
  const shipped = fontFiles(dir);
  const credits = readFontCredits(path.join(dir, "CREDITS.json"));
  if (credits === null && shipped.length > 0) {
    problems.push("CREDITS.json is missing.");
  }
  const rows = credits ?? [];
  for (const file of shipped) {
    const family = familyFromFile(dir, file);
    const row = rows.find((item) => item.name.toLowerCase() === family.toLowerCase());
    if (row === undefined) {
      problems.push(`${family} is missing from CREDITS.json.`);
      if (isTrial(family)) problems.push(`${family} is a Pangram trial face without a paid license.`);
      continue;
    }
    problems.push(...problemsForFamily(family, row, file));
  }
  for (const row of rows) {
    if (shipped.some((file) => familyFromFile(dir, file).toLowerCase() === row.name.toLowerCase())) continue;
    if (isFfl(row) && !fontshareLink(row.link)) {
      problems.push(`${row.name} is ITF FFL and the Fontshare link is missing.`);
    }
    if (isTrial(row.name) && !row.paid) {
      problems.push(`${row.name} is a Pangram trial face without a paid license.`);
    }
  }
  const unique = [...new Set(problems)];
  return { ok: unique.length === 0, problems: unique };
}

function problemsForFamily(family: string, row: FontCredit, file: string): string[] {
  const found: string[] = [];
  if (isTrial(family) && !row.paid) {
    found.push(`${family} is a Pangram trial face without a paid license.`);
  }
  if (isFfl(row)) {
    found.push(`${family} vendors a Fontshare FFL file.`);
    if (!fontshareLink(row.link)) found.push(`${family} is ITF FFL and the Fontshare link is missing.`);
    return found;
  }
  if (isOfl(row)) {
    const license = path.join(path.dirname(file), "OFL.txt");
    if (!existsSync(license)) found.push(`${family} ships without OFL.txt.`);
    return found;
  }
  found.push(`${family} has no OFL or ITF FFL license in CREDITS.json.`);
  return found;
}

function isTrial(name: string): boolean {
  return TRIAL_NAMES.has(name.trim().toLowerCase());
}

function isOfl(row: FontCredit): boolean {
  return /\bofl\b|open font license/i.test(row.license);
}

function isFfl(row: FontCredit): boolean {
  return /\bffl\b|indian type foundry/i.test(row.license);
}

function fontshareLink(link: string): boolean {
  return /fontshare\.com/i.test(link);
}

function familyFromFile(root: string, file: string): string {
  const parent = path.basename(path.dirname(file));
  if (parent.toLowerCase() !== "fonts" && path.dirname(file) !== path.resolve(root)) return parent;
  const stem = path.basename(file).replace(FONT_FILE, "");
  const cut = stem.split(/[-_]/)[0];
  return cut === undefined || cut === "" ? stem : cut;
}

function directoryOf(entry: { parentPath?: string; path?: string; name: string }): string {
  if (typeof entry.parentPath === "string" && entry.parentPath !== "") return entry.parentPath;
  if (typeof entry.path === "string" && entry.path !== "" && entry.path !== entry.name) return entry.path;
  return ".";
}

function fontFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !FONT_FILE.test(entry.name)) continue;
    const parent = directoryOf(entry);
    found.push(path.join(parent, entry.name));
  }
  return found;
}

function readFontCredits(file: string): FontCredit[] | null {
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    return [];
  }
  const records = creditRecords(parsed);
  return records.map((record) => ({
    name: textField(record, "name"),
    license: textField(record, "license"),
    link: textField(record, "link") || textField(record, "url"),
    paid: record.paid === true || /\bpaid\b/i.test(textField(record, "license")),
  })).filter((row) => row.name !== "");
}

function creditRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord).filter(fontRecord);
  if (!isRecord(parsed)) return [];
  for (const key of ["fonts", "entries", "assets"]) {
    const value = parsed[key];
    if (Array.isArray(value)) return value.filter(isRecord).filter(fontRecord);
  }
  return [];
}

function fontRecord(record: Record<string, unknown>): boolean {
  const category = textField(record, "category").toLowerCase();
  if (category === "fonts" || category === "font") return true;
  const license = textField(record, "license");
  return isOfl({ name: "", license, link: "", paid: false }) || isFfl({ name: "", license, link: "", paid: false });
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
