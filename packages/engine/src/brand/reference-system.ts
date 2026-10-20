/**
 * Design tokens from a public reference URL (BUG-058 idea 28).
 * The user supplies the URL. Colors, type roles, and section rhythm are
 * recorded. Markup, page copy, and image addresses are not.
 * robots.txt is checked first. A login wall is not read.
 * The note is written in the shape loadStudiedPages already reads.
 * Font license fields are not checked here.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** A sentence longer than this is a quote we must not keep. */
export const SHORT_QUOTE_WORDS = 8;

export const REFERENCE_USER_AGENT = "HitchhikerDesignRef/1.0";

const ROBOTS_MAX_CHARS = 500 * 1024;

export class ReferenceExtractError extends Error {
  readonly code: "url" | "robots" | "login" | "fetch";

  constructor(code: "url" | "robots" | "login" | "fetch", message: string) {
    super(message);
    this.name = "ReferenceExtractError";
    this.code = code;
  }
}

export interface ReferenceTransport {
  robots(url: string): Promise<{ status: number; body: string }>;
  page(url: string): Promise<{ status: number; body: string }>;
}

/** A test transport. Null clears it. The desk does not fetch during the test runner. */
let injectedTransport: ReferenceTransport | null = null;

export function setReferenceTransport(transport: ReferenceTransport | null): void {
  injectedTransport = transport;
}

/** Public fetch with a timeout. Tests stay on the injected transport. */
export function fetchReferenceTransport(timeoutMs = 8000): ReferenceTransport {
  const headers = { "user-agent": REFERENCE_USER_AGENT };
  const read = async (url: string): Promise<{ status: number; body: string }> => {
    const response = await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return { status: response.status, body: body.slice(0, ROBOTS_MAX_CHARS) };
  };
  return { robots: read, page: read };
}

/**
 * The transport for one extract. An injected transport wins.
 * The test runner does not fall through to fetch.
 */
export function resolveReferenceTransport(): ReferenceTransport | null {
  if (injectedTransport !== null) return injectedTransport;
  if (process.env.NODE_TEST_CONTEXT !== undefined && process.env.NODE_TEST_CONTEXT !== "") return null;
  return fetchReferenceTransport();
}

export interface ReferenceColor {
  role: "paper" | "ink" | "accent";
  hex: string;
}

export interface ReferenceTypeRole {
  role: "display" | "body";
  family: string;
}

export interface ReferenceTokens {
  sourceUrl: string;
  colors: ReferenceColor[];
  typeRoles: ReferenceTypeRole[];
  sectionRhythm: string[];
  structure: string;
}

export interface ReferenceExtractRequest {
  url: string;
  transport: ReferenceTransport;
  libraryRoot: string;
  authenticated?: boolean;
  credentials?: "omit" | "include";
}

export interface ReferenceExtractResult {
  id: string;
  tokens: ReferenceTokens;
  tokenFile: string;
  entryFile: string;
  noteFile: string;
}

interface RobotsGroup {
  agents: string[];
  disallows: string[];
}

interface El {
  tag: string;
  id: string;
  classes: string[];
  inline: string;
  landmark: string;
  text: string;
  children: El[];
}

interface Decl {
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: string;
}

interface Rule {
  selector: string;
  decl: Decl;
  order: number;
  specificity: number;
}

interface Computed {
  color: string;
  explicitColor: boolean;
  backgroundColor: string;
  explicitBackground: boolean;
  fontFamily: string;
  fontSize: string;
}

interface Simple {
  tag: string;
  id: string;
  classes: string[];
}

interface Found {
  el: El;
  computed: Computed;
}

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const INITIAL: Computed = {
  color: "#000000",
  explicitColor: false,
  backgroundColor: "",
  explicitBackground: false,
  fontFamily: "",
  fontSize: "16px",
};

/**
 * True when `output` contains a body sentence longer than a short quote.
 * Returns that sentence, or an empty string when the output is clear.
 */
export function longCopyLeak(output: string, html: string): string {
  const folded = foldSpace(output);
  for (const sentence of bodySentences(html)) {
    const words = sentence.split(/\s+/).filter((word) => word !== "");
    if (words.length <= SHORT_QUOTE_WORDS) continue;
    if (folded.includes(foldSpace(sentence))) return sentence;
  }
  return "";
}

/** Colors, type roles, and section rhythm from a public HTML document. */
export function tokensFromPublicHtml(html: string, sourceUrl: string): ReferenceTokens {
  const parsed = parseHtml(html);
  const tokens = tokensFromParsed(parsed, sourceUrl);
  const leak = longCopyLeak(JSON.stringify(tokens), html);
  if (leak !== "") {
    throw new ReferenceExtractError("fetch", "The extract kept a sentence longer than a short quote.");
  }
  if (imageLeak(JSON.stringify(tokens), parsed.imageUrls)) {
    throw new ReferenceExtractError("fetch", "The extract kept an image address from the page.");
  }
  return tokens;
}

/**
 * Read one public page and write a token file plus a library note.
 * The caller supplies the transport. This function does not send cookies.
 */
export async function extractReferenceDesign(request: ReferenceExtractRequest): Promise<ReferenceExtractResult> {
  if (request.authenticated === true || request.credentials === "include") {
    throw new ReferenceExtractError("login", "A logged-in page is not read.");
  }
  const url = publicUrl(request.url);
  if (url === null) {
    throw new ReferenceExtractError("url", "The reference must be a public http or https page.");
  }
  const robotsUrl = new URL("/robots.txt", url.origin);
  let robots: { status: number; body: string };
  try {
    robots = await request.transport.robots(robotsUrl.href);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "robots fetch failed";
    throw new ReferenceExtractError("robots", `robots.txt could not be read. ${foldSpace(detail)}`);
  }
  if (robots.status !== 200 && robots.status !== 404) {
    throw new ReferenceExtractError("robots", `robots.txt for ${url.origin} returned ${robots.status}.`);
  }
  const robotsBody = robots.status === 404 ? "" : robots.body;
  if (!robotsAllow(url.href, robotsBody, REFERENCE_USER_AGENT)) {
    throw new ReferenceExtractError("robots", `robots.txt disallows ${url.href}.`);
  }
  let page: { status: number; body: string };
  try {
    page = await request.transport.page(url.href);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "page fetch failed";
    throw new ReferenceExtractError("fetch", `The reference page could not be read. ${foldSpace(detail)}`);
  }
  if (page.status === 401 || page.status === 403 || isLoginPage(page.body)) {
    throw new ReferenceExtractError("login", "The page is behind a login, so it was not read.");
  }
  if (page.status !== 200) {
    throw new ReferenceExtractError("fetch", `The reference page returned ${page.status}.`);
  }
  const parsed = parseHtml(page.body);
  const tokens = tokensFromParsed(parsed, url.href);
  const id = referenceId(url);
  const entry = {
    id,
    title: `Reference ${url.hostname}`,
    url: url.href,
    styleWorld: "editorial",
    sectionTypes: tokens.sectionRhythm.length > 0 ? tokens.sectionRhythm : ["hero"],
  };
  const note = [
    `# ${entry.title}`,
    "",
    tokens.structure,
    "",
    `Source: ${url.href}`,
    "",
  ].join("\n");
  const payload = `${JSON.stringify(tokens)}\n${JSON.stringify(entry)}\n${note}`;
  if (longCopyLeak(payload, page.body) !== "") {
    throw new ReferenceExtractError("fetch", "The extract kept a sentence longer than a short quote.");
  }
  if (imageLeak(payload, parsed.imageUrls) || payload.includes("<section") || payload.includes("<img")) {
    throw new ReferenceExtractError("fetch", "The extract kept markup or an image address from the page.");
  }
  const tokenFile = path.join(request.libraryRoot, "tokens", `${id}.json`);
  const entryFile = path.join(request.libraryRoot, "entries", `${id}.json`);
  const noteFile = path.join(request.libraryRoot, "notes", `${id}.md`);
  mkdirSync(path.dirname(tokenFile), { recursive: true });
  mkdirSync(path.dirname(entryFile), { recursive: true });
  mkdirSync(path.dirname(noteFile), { recursive: true });
  writeFileSync(tokenFile, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
  writeFileSync(entryFile, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  writeFileSync(noteFile, note, "utf8");
  rememberEntry(request.libraryRoot, id);
  return { id, tokens, tokenFile, entryFile, noteFile };
}

function publicUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) return null;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return null;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
  return url;
}

function isLoginPage(html: string): boolean {
  return /<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(html);
}

function referenceId(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pathPart = url.pathname
    .toLowerCase()
    .split("/")
    .filter((part) => part !== "")
    .join("-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-|-$/g, "");
  const base = pathPart === "" ? `ref-${host}` : `ref-${host}-${pathPart}`;
  return base.slice(0, 80).replace(/-$/g, "");
}

function rememberEntry(root: string, id: string): void {
  const file = path.join(root, "index.json");
  let doc: Record<string, unknown> = {};
  if (existsSync(file)) {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed)) {
      throw new ReferenceExtractError("fetch", "index.json is not an object.");
    }
    doc = { ...parsed };
  }
  const current = Array.isArray(doc.entries)
    ? doc.entries.filter((item): item is string => typeof item === "string")
    : [];
  if (!current.includes(id)) current.push(id);
  doc.entries = current;
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokensFromParsed(parsed: ParsedHtml, sourceUrl: string): ReferenceTokens {
  const vars = collectVars(parsed.css);
  const rules = parseRules(parsed.css, vars);
  const found: Found[] = [];
  walk(parsed.tree, INITIAL, [], rules, vars, found);
  const body = found.find((item) => item.el.tag === "body");
  const paper = firstExplicitBackground(body, found);
  const ink = body?.computed.color ?? INITIAL.color;
  const accent = firstAccent(found, ink, paper);
  const colors: ReferenceColor[] = [];
  if (paper !== "") colors.push({ role: "paper", hex: paper });
  if (ink !== "") colors.push({ role: "ink", hex: ink });
  if (accent !== "") colors.push({ role: "accent", hex: accent });
  const display = displayFamily(found);
  const bodyFamily = firstFamily(body?.computed.fontFamily ?? "");
  const typeRoles: ReferenceTypeRole[] = [
    { role: "display", family: display },
    { role: "body", family: bodyFamily },
  ];
  const sectionRhythm = landmarks(parsed.tree);
  const regions = sectionRhythm.length > 0 ? sectionRhythm.join(", ") : "none";
  const structure = `Regions in order: ${regions}. Display ${display === "" ? "unset" : display}. Body ${bodyFamily === "" ? "unset" : bodyFamily}.`;
  return { sourceUrl, colors, typeRoles, sectionRhythm, structure };
}

function firstExplicitBackground(body: Found | undefined, found: readonly Found[]): string {
  if (body !== undefined && body.computed.explicitBackground && body.computed.backgroundColor !== "") {
    return body.computed.backgroundColor;
  }
  for (const item of found) {
    if (item.computed.explicitBackground && item.computed.backgroundColor !== "") return item.computed.backgroundColor;
  }
  return "";
}

function firstAccent(found: readonly Found[], ink: string, paper: string): string {
  for (const item of found) {
    if (!item.computed.explicitColor) continue;
    const color = item.computed.color;
    if (color === "" || color === ink || color === paper) continue;
    return color;
  }
  return "";
}

function displayFamily(found: readonly Found[]): string {
  let best = -1;
  let family = "";
  for (const item of found) {
    const heading = /^h[1-6]$/.test(item.el.tag);
    if (!heading && item.el.text.trim() === "") continue;
    const size = fontPx(item.computed.fontSize);
    if (size < best) continue;
    const name = firstFamily(item.computed.fontFamily);
    if (name === "") continue;
    if (size === best && family !== "") continue;
    best = size;
    family = name;
  }
  return family;
}

function fontPx(value: string): number {
  const match = /^([\d.]+)px$/i.exec(value.trim());
  if (match?.[1] === undefined) return 16;
  const size = Number(match[1]);
  return Number.isFinite(size) ? size : 16;
}

function firstFamily(value: string): string {
  const first = value.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "").trim();
}

function landmarks(el: El, into: string[] = []): string[] {
  const name = el.landmark.trim().toLowerCase();
  if (/^[a-z0-9]+(?:[ -][a-z0-9]+)*$/.test(name)) into.push(name);
  for (const child of el.children) landmarks(child, into);
  return into;
}

interface ParsedHtml {
  tree: El;
  css: string;
  imageUrls: string[];
}

function parseHtml(html: string): ParsedHtml {
  const tree: El = { tag: "document", id: "", classes: [], inline: "", landmark: "", text: "", children: [] };
  const stack: El[] = [tree];
  const cssParts: string[] = [];
  const imageUrls: string[] = [];
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const text = html.slice(index, next < 0 ? html.length : next);
      index = next < 0 ? html.length : next;
      const parent = stack[stack.length - 1];
      if (parent !== undefined && text.trim() !== "") parent.text += decode(text);
      continue;
    }
    if (html.startsWith("</", index)) {
      const close = html.indexOf(">", index);
      const raw = close < 0 ? html.slice(index + 2) : html.slice(index + 2, close);
      const name = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      index = close < 0 ? html.length : close + 1;
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        const popped = stack.pop();
        if (popped?.tag === name) break;
      }
      continue;
    }
    const close = html.indexOf(">", index);
    if (close < 0) break;
    let raw = html.slice(index + 1, close).trim();
    const selfClose = raw.endsWith("/");
    if (selfClose) raw = raw.slice(0, -1).trim();
    index = close + 1;
    const nameMatch = /^([A-Za-z][\w:-]*)([\s\S]*)$/.exec(raw);
    if (nameMatch === null) continue;
    const tag = (nameMatch[1] ?? "").toLowerCase();
    const attrs = parseAttrs(nameMatch[2] ?? "");
    if (tag === "style" || tag === "script" || tag === "noscript") {
      const contentEnd = closeTagAt(html, index, tag);
      if (tag === "style") cssParts.push(html.slice(index, contentEnd));
      index = contentEnd;
      const endTag = html.indexOf(">", index);
      index = endTag < 0 ? html.length : endTag + 1;
      continue;
    }
    const el: El = {
      tag,
      id: attrs.id ?? "",
      classes: (attrs.class ?? "").split(/\s+/).filter((item) => item !== ""),
      inline: attrs.style ?? "",
      landmark: attrs["data-landmark"] ?? "",
      text: "",
      children: [],
    };
    if (tag === "img" && attrs.src !== undefined && attrs.src !== "") imageUrls.push(attrs.src);
    const parent = stack[stack.length - 1];
    parent?.children.push(el);
    if (!selfClose && !VOID.has(tag)) stack.push(el);
  }
  const css = cssParts.join("\n");
  for (const match of css.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/gi)) {
    const found = match[1] ?? match[2] ?? match[3] ?? "";
    if (found !== "") imageUrls.push(found);
  }
  return { tree, css, imageUrls };
}

function closeTagAt(html: string, from: number, tag: string): number {
  const re = new RegExp(`</${tag}\\s*>`, "i");
  const match = re.exec(html.slice(from));
  if (match === null || match.index === undefined) return html.length;
  return from + match.index;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const key = match[1]?.toLowerCase();
    if (key === undefined || key === "") continue;
    attrs[key] = decode(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function decode(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

const COPY_BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "figcaption", "blockquote", "td", "th"]);

function bodySentences(html: string): string[] {
  const parsed = parseHtml(stripNonCopy(html));
  const blocks: string[] = [];
  collectBlocks(parsed.tree, blocks);
  const sentences: string[] = [];
  for (const block of blocks) {
    for (const sentence of block.split(/(?<=[.?!])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed !== "") sentences.push(trimmed);
    }
  }
  return sentences;
}

function collectBlocks(el: El, into: string[]): void {
  if (COPY_BLOCKS.has(el.tag)) {
    const text = collapse(collectText(el));
    if (text !== "") into.push(text);
    return;
  }
  for (const child of el.children) collectBlocks(child, into);
}

function stripNonCopy(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function collectText(el: El): string {
  const parts = [el.text];
  for (const child of el.children) parts.push(collectText(child));
  return parts.join(" ");
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function foldSpace(value: string): string {
  return collapse(value).toLowerCase();
}

function imageLeak(output: string, urls: readonly string[]): boolean {
  const folded = output.toLowerCase();
  for (const url of urls) {
    const trimmed = url.trim();
    if (trimmed.length > 8 && folded.includes(trimmed.toLowerCase())) return true;
    const base = trimmed.split("/").pop() ?? "";
    if (base.length > 8 && folded.includes(base.toLowerCase())) return true;
  }
  return false;
}

function collectVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of cleaned.matchAll(/[^{}]*\{([^{}]*)\}/g)) {
    const block = match[1] ?? "";
    for (const part of block.split(";")) {
      const sep = part.indexOf(":");
      if (sep < 0) continue;
      const key = part.slice(0, sep).trim().toLowerCase();
      if (!key.startsWith("--")) continue;
      vars.set(key, part.slice(sep + 1).trim());
    }
  }
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [key, value] of vars) vars.set(key, resolveVars(value, vars));
  }
  return vars;
}

function resolveVars(value: string, vars: ReadonlyMap<string, string>): string {
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = current.replace(
      /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/g,
      (whole, name: string, fallback: string | undefined) => {
        const found = vars.get(name);
        if (found !== undefined && !found.includes(`var(${name})`)) return found;
        if (fallback !== undefined && fallback.trim() !== "") return fallback.trim();
        return whole;
      },
    );
    if (next === current) break;
    current = next;
  }
  return current;
}

function parseRules(css: string, vars: ReadonlyMap<string, string>): Rule[] {
  const rules: Rule[] = [];
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let order = 0;
  for (const match of cleaned.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim();
    if (selector === "" || selector.startsWith("@")) continue;
    const decl = declsFrom(match[2] ?? "", vars);
    for (const part of selector.split(",")) {
      const one = part.trim();
      if (one === "") continue;
      rules.push({ selector: one, decl, order, specificity: specificity(one) });
      order += 1;
    }
  }
  return rules;
}

function declsFrom(block: string, vars: ReadonlyMap<string, string>): Decl {
  const decl: Decl = {};
  for (const part of block.split(";")) {
    const sep = part.indexOf(":");
    if (sep < 0) continue;
    const key = part.slice(0, sep).trim().toLowerCase();
    const value = resolveVars(part.slice(sep + 1).trim(), vars);
    if (key === "color") {
      const color = normalizeColor(value);
      if (color !== "") decl.color = color;
    } else if (key === "background-color") {
      const color = normalizeColor(value);
      if (color !== "") decl.backgroundColor = color;
    } else if (key === "background" && !/url\(|gradient\(/i.test(value)) {
      const color = normalizeColor(value.split(/\s+/)[0] ?? "");
      if (color !== "" && decl.backgroundColor === undefined) decl.backgroundColor = color;
    } else if (key === "font-family" && value !== "") {
      decl.fontFamily = value;
    } else if (key === "font-size" && value !== "") {
      decl.fontSize = value;
    }
  }
  return decl;
}

function normalizeColor(value: string): string {
  const text = value.trim().toLowerCase();
  if (text === "" || text === "transparent" || text === "inherit" || text === "initial" || text === "unset") return "";
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex?.[1] !== undefined) {
    const raw = hex[1];
    if (raw.length === 3) {
      return `#${raw[0] ?? ""}${raw[0] ?? ""}${raw[1] ?? ""}${raw[1] ?? ""}${raw[2] ?? ""}${raw[2] ?? ""}`;
    }
    return `#${raw.slice(0, 6)}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/.exec(text);
  if (rgb?.[1] !== undefined && rgb[2] !== undefined && rgb[3] !== undefined) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((channel) => Math.max(0, Math.min(255, Number(channel))));
    return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return "";
}

function specificity(selector: string): number {
  let score = 0;
  for (const part of selector.trim().split(/\s+/)) {
    if (part === "") continue;
    if (part === ":root") {
      score += 10;
      continue;
    }
    const ids = part.match(/#[A-Za-z0-9_-]+/g);
    if (ids !== null) score += ids.length * 100;
    const classes = part.match(/\.[A-Za-z0-9_-]+/g);
    if (classes !== null) score += classes.length * 10;
    if (/^[A-Za-z]/.test(part)) score += 1;
  }
  return score;
}

function walk(
  el: El,
  parent: Computed,
  ancestors: readonly El[],
  rules: readonly Rule[],
  vars: ReadonlyMap<string, string>,
  found: Found[],
): void {
  const computed = applyCascade(el, parent, ancestors, rules, vars);
  found.push({ el, computed });
  const nextAncestors = [...ancestors, el];
  for (const child of el.children) walk(child, computed, nextAncestors, rules, vars, found);
}

function applyCascade(
  el: El,
  parent: Computed,
  ancestors: readonly El[],
  rules: readonly Rule[],
  vars: ReadonlyMap<string, string>,
): Computed {
  const computed: Computed = {
    color: parent.color,
    explicitColor: false,
    backgroundColor: "",
    explicitBackground: false,
    fontFamily: parent.fontFamily,
    fontSize: parent.fontSize,
  };
  const matched = rules.filter((rule) => selectorMatches(rule.selector, el, ancestors));
  matched.sort((left, right) => left.specificity - right.specificity || left.order - right.order);
  for (const rule of matched) applyDecl(computed, rule.decl);
  applyDecl(computed, declsFrom(el.inline, vars));
  return computed;
}

function applyDecl(computed: Computed, decl: Decl): void {
  if (decl.color !== undefined && decl.color !== "") {
    computed.color = decl.color;
    computed.explicitColor = true;
  }
  if (decl.backgroundColor !== undefined && decl.backgroundColor !== "") {
    computed.backgroundColor = decl.backgroundColor;
    computed.explicitBackground = true;
  }
  if (decl.fontFamily !== undefined && decl.fontFamily !== "") computed.fontFamily = decl.fontFamily;
  if (decl.fontSize !== undefined && decl.fontSize !== "") computed.fontSize = decl.fontSize;
}

function selectorMatches(selector: string, el: El, ancestors: readonly El[]): boolean {
  const parts = selector.split(/\s+/).map(parseSimple);
  if (parts.some((part) => part === null)) return false;
  const simples: Simple[] = [];
  for (const part of parts) {
    if (part !== null) simples.push(part);
  }
  return matchFrom(simples, el, ancestors);
}

function matchFrom(parts: readonly Simple[], el: El, ancestors: readonly El[]): boolean {
  const last = parts[parts.length - 1];
  if (last === undefined || !simpleMatches(last, el)) return false;
  if (parts.length === 1) return true;
  const rest = parts.slice(0, -1);
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor === undefined) continue;
    if (matchFrom(rest, ancestor, ancestors.slice(0, index))) return true;
  }
  return false;
}

function parseSimple(part: string): Simple | null {
  if (part === ":root") return { tag: ":root", id: "", classes: [] };
  if (part.includes(":")) return null;
  let text = part;
  let id = "";
  const idMatch = text.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch?.[1] !== undefined) {
    id = idMatch[1];
    text = text.replace(idMatch[0], "");
  }
  const classes: string[] = [];
  for (const match of text.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    if (match[1] !== undefined) classes.push(match[1]);
  }
  text = text.replace(/\.[A-Za-z0-9_-]+/g, "");
  if (text !== "" && text !== "*" && !/^[A-Za-z][A-Za-z0-9-]*$/.test(text)) return null;
  return { tag: text === "*" ? "" : text, id, classes };
}

function simpleMatches(simple: Simple, el: El): boolean {
  if (simple.tag === ":root") return el.tag === "html";
  if (simple.tag !== "" && simple.tag !== el.tag) return false;
  if (simple.id !== "" && simple.id !== el.id) return false;
  return simple.classes.every((name) => el.classes.includes(name));
}

function robotsAllow(url: string, robotsBody: string, userAgent: string): boolean {
  if (robotsBody.length > ROBOTS_MAX_CHARS) return false;
  const source = robotsBody.charCodeAt(0) === 0xfeff ? robotsBody.slice(1) : robotsBody;
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let seenRule = false;
  for (const raw of source.split(/\r?\n/)) {
    const hash = raw.indexOf("#");
    const line = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    if (line.length === 0) {
      current = null;
      seenRule = false;
      continue;
    }
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (current === null || seenRule) {
        current = { agents: [], disallows: [] };
        groups.push(current);
        seenRule = false;
      }
      current.agents.push(value);
      continue;
    }
    if (current === null) continue;
    seenRule = true;
    if (key === "disallow") current.disallows.push(value);
  }
  let pathname = "/";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const selected = selectGroups(groups, userAgent);
  if (selected === null) return true;
  for (const group of selected) {
    for (const rule of group.disallows) {
      if (ruleDenies(pathname, rule)) return false;
    }
  }
  return true;
}

function selectGroups(groups: readonly RobotsGroup[], userAgent: string): RobotsGroup[] | null {
  let best = 0;
  const specific: RobotsGroup[] = [];
  for (const group of groups) {
    let groupBest = 0;
    for (const agent of group.agents) {
      if (!agentMatches(agent, userAgent)) continue;
      const len = agent.trim().length;
      if (len > groupBest) groupBest = len;
    }
    if (groupBest === 0) continue;
    if (groupBest > best) {
      best = groupBest;
      specific.length = 0;
      specific.push(group);
    } else if (groupBest === best) {
      specific.push(group);
    }
  }
  if (specific.length > 0) return specific;
  const star = groups.filter((group) => group.agents.some((agent) => agent.trim() === "*"));
  return star.length > 0 ? star : null;
}

function agentMatches(rule: string, userAgent: string): boolean {
  const agent = rule.trim().toLowerCase();
  if (agent.length === 0 || agent === "*") return false;
  const full = userAgent.trim().toLowerCase();
  const token = full.split(/\s+/)[0] ?? "";
  const slash = token.indexOf("/");
  const product = slash === -1 ? token : token.slice(0, slash);
  return agent === full || agent === product || product.startsWith(agent) || full.startsWith(agent);
}

function ruleDenies(pathname: string, rule: string): boolean {
  if (rule.length === 0) return false;
  const pathName = rule.startsWith("/") ? rule : `/${rule}`;
  if (pathName === "/") return true;
  if (pathname === pathName) return true;
  const folder = pathName.endsWith("/") ? pathName : `${pathName}/`;
  return pathname.startsWith(folder);
}
