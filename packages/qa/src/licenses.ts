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

/**
 * Audit 13. Every img URL in the built page has a row in CREDITS.json.
 * The licence string on that row is information. This check does not
 * decide whether the licence is allowed. 241z removed that gate.
 */
export interface ImageCreditAudit {
  ok: boolean;
  problems: string[];
}

const CREDIT_REF_KEYS = ["file", "url", "link", "source", "name", "src"] as const;

function isCreditRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function creditRows(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) return value.filter(isCreditRecord);
  if (!isCreditRecord(value)) return null;
  if (Array.isArray(value.assets)) return value.assets.filter(isCreditRecord);
  if (Array.isArray(value.entries)) return value.entries.filter(isCreditRecord);
  return null;
}

function parseCredits(credits: unknown): { rows: Record<string, unknown>[] } | { error: string } {
  let value = credits;
  if (typeof credits === "string") {
    try {
      value = JSON.parse(credits) as unknown;
    } catch {
      return { error: "CREDITS.json is not valid JSON." };
    }
  }
  const rows = creditRows(value);
  if (rows === null) {
    return { error: "CREDITS.json needs an assets array, an entries array, or a top-level array." };
  }
  return { rows };
}

/** img src and srcset URLs, in document order. */
export function imageUrlsIn(html: string): string[] {
  const urls: string[] = [];
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const src = tagAttr(tag, "src");
    if (src !== "") urls.push(src);
    const srcset = tagAttr(tag, "srcset");
    for (const part of srcset.split(",")) {
      const url = part.trim().split(/\s+/)[0] ?? "";
      if (url !== "") urls.push(url);
    }
  }
  return urls;
}

function tagAttr(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function normaliseRef(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const pathName = decodeURIComponent(url.pathname).replace(/\/+$/u, "");
      return pathName === "" ? "/" : pathName;
    } catch {
      // Fall through to the path form.
    }
  }
  const pathOnly = trimmed.split(/[?#]/u)[0] ?? trimmed;
  const slashed = pathOnly.replaceAll("\\", "/");
  if (slashed.startsWith("./")) return slashed.slice(1);
  return slashed;
}

function sameAsset(src: string, credit: string): boolean {
  const left = normaliseRef(src);
  const right = normaliseRef(credit);
  if (left === "" || right === "") return false;
  const a = left.startsWith("/") ? left : `/${left}`;
  const b = right.startsWith("/") ? right : `/${right}`;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function rowMentions(row: Record<string, unknown>, src: string): boolean {
  for (const key of CREDIT_REF_KEYS) {
    const raw = row[key];
    if (typeof raw === "string" && sameAsset(src, raw)) return true;
  }
  return false;
}

/** Fail when a page image has no CREDITS.json row. */
export function auditImageCredits(html: string, credits: unknown): ImageCreditAudit {
  const parsed = parseCredits(credits);
  if ("error" in parsed) return { ok: false, problems: [parsed.error] };
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const src of imageUrlsIn(html)) {
    const key = normaliseRef(src);
    if (seen.has(key)) continue;
    seen.add(key);
    const found = parsed.rows.some((row) => rowMentions(row, src));
    if (!found) problems.push(`Image ${src} is missing from CREDITS.json.`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Idea 12. Images and footage need an author, a source URL, and a
 * licence string. The string is recorded. It is not checked against an
 * allow list. A generated asset names its prompt id and is not labelled
 * as a photograph of a real place.
 */
export interface MediaRef {
  url: string;
  kind: "image" | "video";
}

export interface SourcedMediaAudit {
  ok: boolean;
  problems: string[];
}

/** img, video src, video poster, and source URLs, in document order. */
export function mediaRefsIn(html: string): MediaRef[] {
  const refs: MediaRef[] = [];
  const token = /<video\b[^>]*>|<\/video>|<img\b[^>]*>|<source\b[^>]*>/gi;
  let inVideo = false;
  for (const match of html.matchAll(token)) {
    const tag = match[0] ?? "";
    if (/^<video\b/i.test(tag)) {
      inVideo = true;
      pushRef(refs, tagAttr(tag, "src"), "video");
      pushRef(refs, tagAttr(tag, "poster"), "image");
      continue;
    }
    if (/^<\/video\b/i.test(tag)) {
      inVideo = false;
      continue;
    }
    if (/^<img\b/i.test(tag)) {
      pushRef(refs, tagAttr(tag, "src"), "image");
      for (const part of tagAttr(tag, "srcset").split(",")) {
        pushRef(refs, part.trim().split(/\s+/)[0] ?? "", "image");
      }
      continue;
    }
    const type = tagAttr(tag, "type").toLowerCase();
    const kind = inVideo || type.startsWith("video/") ? "video" : "image";
    pushRef(refs, tagAttr(tag, "src"), kind);
    const setKind = type.startsWith("video/") ? "video" : "image";
    for (const part of tagAttr(tag, "srcset").split(",")) {
      pushRef(refs, part.trim().split(/\s+/)[0] ?? "", setKind);
    }
  }
  return refs;
}

function pushRef(refs: MediaRef[], url: string, kind: MediaRef["kind"]): void {
  if (url.trim() === "") return;
  refs.push({ url: url.trim(), kind });
}

function fieldText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function fieldBlob(row: Record<string, unknown>, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") parts.push(value.trim());
  }
  return parts.join(" ").toLowerCase();
}

function sourceUrlOf(row: Record<string, unknown>): string {
  for (const key of ["link", "url", "source"] as const) {
    const value = row[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  return "";
}

function generatedRow(row: Record<string, unknown>): boolean {
  if (row.generated === true) return true;
  return fieldBlob(row, ["category", "kind", "usedFor", "label"]).includes("generated");
}

function labelledAsRealPhotograph(row: Record<string, unknown>): boolean {
  if (row.labelledAsPhotograph === true || row.photographOfRealPlace === true) return true;
  const blob = fieldBlob(row, ["category", "kind", "usedFor", "label", "name"]);
  if (blob.includes("photograph of a real place")) return true;
  if (!generatedRow(row)) return false;
  const category = fieldText(row, ["category", "kind"]).toLowerCase();
  return category === "photograph" || category === "photo" || category === "photography";
}

function mediaLabel(kind: MediaRef["kind"]): string {
  return kind === "video" ? "Video" : "Image";
}

/** Fail when imagery or footage is uncredited, or a generated image is mislabelled. */
export function auditSourcedMedia(html: string, credits: unknown): SourcedMediaAudit {
  const parsed = parseCredits(credits);
  if ("error" in parsed) return { ok: false, problems: [parsed.error] };
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const ref of mediaRefsIn(html)) {
    const key = `${ref.kind}:${normaliseRef(ref.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = parsed.rows.find((candidate) => rowMentions(candidate, ref.url));
    const label = mediaLabel(ref.kind);
    if (row === undefined) {
      problems.push(`${label} ${ref.url} is missing from CREDITS.json.`);
      continue;
    }
    if (fieldText(row, ["author"]) === "") problems.push(`${label} ${ref.url} is missing an author.`);
    if (sourceUrlOf(row) === "") problems.push(`${label} ${ref.url} is missing a source URL.`);
    if (fieldText(row, ["license", "licence"]) === "") {
      problems.push(`${label} ${ref.url} is missing a licence.`);
    }
    if (!generatedRow(row)) continue;
    if (fieldText(row, ["promptId", "prompt_id", "promptID"]) === "") {
      problems.push(`${label} ${ref.url} is generated and has no prompt id.`);
    }
    if (labelledAsRealPhotograph(row)) {
      problems.push(`${label} ${ref.url} is generated and is labelled as a photograph of a real place.`);
    }
  }
  return { ok: problems.length === 0, problems };
}
