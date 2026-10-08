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
 * Two installed fields are not plain SPDX. D-001 requires GSAP, whose
 * registry field is the standard no-charge licence. The sharp platform
 * package declares Apache-2.0 AND LGPL-3.0-or-later. LGPL is not GPL.
 * That one expression passes. A lone LGPL identifier still fails.
 * @theatre/studio and potrace fail by name even when the licence field
 * would otherwise pass.
 */

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
    const licenseProblem = licenseIssue(entry.license);
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

function licenseIssue(license: string | null): string | null {
  if (license === null || license.trim() === "") return "license is missing";
  const trimmed = license.trim();
  if (trimmed.toLowerCase() === "unlicensed") return "UNLICENSED is proprietary";
  const prose = proseDenial(trimmed);
  if (prose !== null) return prose;
  if (isGsapStandard(trimmed) || isSharpPlatform(trimmed)) return null;
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

function isGsapStandard(license: string): boolean {
  const value = collapse(license).replace(/\.+$/u, "");
  return value === GSAP_STANDARD;
}

function isSharpPlatform(license: string): boolean {
  let value = collapse(license);
  let inner = unwrap(value);
  while (inner !== null) {
    value = collapse(inner);
    inner = unwrap(value);
  }
  return value.toLowerCase() === SHARP_PLATFORM;
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
